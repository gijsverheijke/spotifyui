import { createHmac } from "crypto";
import type { SpotifyClient, SpotifyTokenResponse, SpotifyUser } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTP_SECRET_URLS = [
  "https://github.com/xyloflake/spot-secrets-go/blob/main/secrets/secretDict.json?raw=true",
  "https://github.com/Thereallo1026/spotify-secrets/blob/main/secrets/secretDict.json?raw=true",
  "https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json",
];

const FALLBACK_TOTP_SECRET = new Uint8Array([
  70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68,
]);
const FALLBACK_TOTP_VERSION = 18;

const TOTP_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_HTTP_TIMEOUT_MS = 5000;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_BASE = "https://open.spotify.com/";

// ---------------------------------------------------------------------------
// TOTP secret cache (module-level singleton)
// ---------------------------------------------------------------------------

let cachedSecret: { version: number; secret: Uint8Array; expiresAt: number } | null = null;

// Overridable fetcher for tests
export let _totpSecretFetcher = fetchTotpSecretHTTP;

export function _setTotpSecretFetcher(
  fn: (() => Promise<{ version: number; secret: Uint8Array }>) | null,
): () => void {
  const prev = _totpSecretFetcher;
  _totpSecretFetcher = fn ?? fetchTotpSecretHTTP;
  return () => {
    _totpSecretFetcher = prev;
  };
}

export function _clearTotpCache(): void {
  cachedSecret = null;
}

// ---------------------------------------------------------------------------
// TOTP secret fetching
// ---------------------------------------------------------------------------

async function fetchTotpSecretHTTP(): Promise<{ version: number; secret: Uint8Array }> {
  let lastError: Error | null = null;

  for (const url of TOTP_SECRET_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TOTP_HTTP_TIMEOUT_MS);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
        lastError = new Error(`TOTP secrets HTTP ${resp.status}`);
        continue;
      }
      const result = parseTotpSecret(await resp.json());
      if (result) return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("TOTP secrets missing");
}

function parseTotpSecret(
  raw: Record<string, number[]>,
): { version: number; secret: Uint8Array } | null {
  let bestVersion = -1;
  let bestValues: number[] | null = null;

  for (const [key, values] of Object.entries(raw)) {
    const version = parseInt(key, 10);
    if (isNaN(version)) continue;
    if (version > bestVersion) {
      bestVersion = version;
      bestValues = values;
    }
  }

  if (bestVersion < 0 || !bestValues || bestValues.length === 0) return null;

  const secret = new Uint8Array(bestValues.length);
  for (let i = 0; i < bestValues.length; i++) {
    const v = bestValues[i];
    if (v < 0 || v > 255) return null;
    secret[i] = v;
  }

  return { version: bestVersion, secret };
}

async function getTotpSecret(): Promise<{ version: number; secret: Uint8Array }> {
  const now = Date.now();
  if (cachedSecret && now < cachedSecret.expiresAt && cachedSecret.secret.length > 0) {
    return { version: cachedSecret.version, secret: Uint8Array.from(cachedSecret.secret) };
  }

  try {
    const result = await _totpSecretFetcher();
    if (result.secret.length > 0) {
      cachedSecret = {
        version: result.version,
        secret: Uint8Array.from(result.secret),
        expiresAt: now + TOTP_CACHE_TTL_MS,
      };
      return result;
    }
  } catch {
    // Fall through to fallback
  }

  return { version: FALLBACK_TOTP_VERSION, secret: Uint8Array.from(FALLBACK_TOTP_SECRET) };
}

// ---------------------------------------------------------------------------
// TOTP generation (HOTP/TOTP with SHA1, 30s step, 6 digits)
// ---------------------------------------------------------------------------

export function totpFromSecret(secret: Uint8Array, now: Date): string {
  // Transform: secret[i] ^= (i % 33) + 9
  const transformed = new Uint8Array(secret.length);
  for (let i = 0; i < secret.length; i++) {
    transformed[i] = secret[i] ^ ((i % 33) + 9);
  }

  // Join transformed bytes as decimal strings
  const key = transformed.reduce((acc, byte) => acc + String(byte), "");

  // Standard HOTP with SHA1
  const counter = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac("sha1", Buffer.from(key, "utf-8"));
  hmac.update(counterBuf);
  const hash = hmac.digest();

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binCode =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binCode % 1_000_000;
  return String(otp).padStart(TOTP_DIGITS, "0");
}

export async function generateTOTP(now: Date): Promise<{ code: string; version: number }> {
  const { version, secret } = await getTotpSecret();
  const code = totpFromSecret(secret, now);
  return { code, version };
}

// ---------------------------------------------------------------------------
// SpotifyApiClient
// ---------------------------------------------------------------------------

export class SpotifyApiClient implements SpotifyClient {
  private spDc: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private refreshPromise: Promise<string> | null = null;
  private userId: string | null = null;

  constructor(spDc: string) {
    this.spDc = spDc;
  }

  async getAccessToken(): Promise<string> {
    // Return cached token if valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    // Dedup concurrent refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchToken();
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async fetchToken(): Promise<string> {
    const { code, version } = await generateTOTP(new Date());

    const params = new URLSearchParams({
      reason: "init",
      productType: "web-player",
      totp: code,
      totpVer: String(version),
      totpServer: code,
    });

    const url = `${SPOTIFY_TOKEN_BASE}api/token?${params}`;

    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Cookie: `sp_dc=${this.spDc}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "app-platform": "WebPlayer",
        Origin: "https://open.spotify.com",
        Referer: "https://open.spotify.com/",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Sec-CH-UA": '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
        "Sec-CH-UA-Platform": '"macOS"',
        "Sec-CH-UA-Mobile": "?0",
      },
    });

    if (!resp.ok) {
      throw new Error(`Token request failed: HTTP ${resp.status}`);
    }

    const data: SpotifyTokenResponse = await resp.json();
    if (!data.accessToken) {
      throw new Error("Missing access token in response");
    }

    this.accessToken = data.accessToken;
    this.tokenExpiresAt =
      data.accessTokenExpirationTimestampMs > 0
        ? data.accessTokenExpirationTimestampMs
        : Date.now() + data.expiresIn * 1000;

    return data.accessToken;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options?: { params?: Record<string, string>; body?: unknown },
  ): Promise<T> {
    const token = await this.getAccessToken();

    let url = `${SPOTIFY_API_BASE}${path}`;
    if (options?.params) {
      const qs = new URLSearchParams(options.params);
      url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "app-platform": "WebPlayer",
    };

    const fetchOptions: RequestInit = { method, headers };
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    const resp = await fetch(url, fetchOptions);

    // 401 — refresh token and retry once
    if (resp.status === 401) {
      this.accessToken = null;
      const newToken = await this.getAccessToken();
      headers.Authorization = `Bearer ${newToken}`;
      const retry = await fetch(url, { method, headers, body: fetchOptions.body as BodyInit });
      if (!retry.ok) {
        throw new Error(`Spotify API error: ${retry.status} ${retry.statusText}`);
      }
      return retry.json() as Promise<T>;
    }

    // 429 — rate limited, back off and retry once
    if (resp.status === 429) {
      const retryAfter = parseInt(resp.headers.get("Retry-After") ?? "1", 10);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      const retry = await fetch(url, fetchOptions);
      if (!retry.ok) {
        throw new Error(`Spotify API error: ${retry.status} ${retry.statusText}`);
      }
      return retry.json() as Promise<T>;
    }

    if (!resp.ok) {
      throw new Error(`Spotify API error: ${resp.status} ${resp.statusText}`);
    }

    return resp.json() as Promise<T>;
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async getUserId(): Promise<string> {
    if (this.userId) return this.userId;
    const profile = await this.get<SpotifyUser>("/me");
    this.userId = profile.id;
    return profile.id;
  }
}
