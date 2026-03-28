import { createHmac } from "crypto";
import type { SpotifyClient, SpotifyTokenResponse, SpotifyUser } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Use only the hardcoded TOTP secret (version 18) — skip Gitea HTTP fetch
// to avoid slow/unreliable network calls and CORS issues.
const FALLBACK_TOTP_SECRET = new Uint8Array([
  70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68,
]);
const FALLBACK_TOTP_VERSION = 18;

const TOTP_SECRET_URL =
  "https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json";

let cachedTotp: { version: number; secret: Uint8Array; expiresAt: number } | null = null;

async function fetchTotpSecret(): Promise<{ version: number; secret: Uint8Array }> {
  const now = Date.now();
  if (cachedTotp && now < cachedTotp.expiresAt) {
    return { version: cachedTotp.version, secret: cachedTotp.secret };
  }
  try {
    const resp = await fetch(TOTP_SECRET_URL, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, number[]>;
    const versions = Object.keys(data).map(Number).sort((a, b) => b - a);
    for (const v of versions) {
      const arr = data[String(v)];
      if (arr?.length > 0) {
        const secret = new Uint8Array(arr);
        cachedTotp = { version: v, secret, expiresAt: now + 15 * 60 * 1000 };
        return { version: v, secret };
      }
    }
  } catch {
    // fall through to fallback
  }
  return { version: FALLBACK_TOTP_VERSION, secret: FALLBACK_TOTP_SECRET };
}

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_BASE = "https://open.spotify.com/";

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
  const { version, secret } = await fetchTotpSecret();
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
    console.log("[spotify] fetchToken: generating TOTP...");
    const t0 = Date.now();
    const { code, version } = await generateTOTP(new Date());
    console.log(`[spotify] fetchToken: TOTP generated (v${version}) in ${Date.now() - t0}ms`);

    const params = new URLSearchParams({
      reason: "init",
      productType: "web-player",
      totp: code,
      totpVer: String(version),
      totpServer: code,
    });

    const url = `${SPOTIFY_TOKEN_BASE}api/token?${params}`;
    console.log(`[spotify] fetchToken: calling ${url.split("?")[0]}...`);

    const t1 = Date.now();
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
      signal: AbortSignal.timeout(15_000),
    });
    console.log(`[spotify] fetchToken: response ${resp.status} in ${Date.now() - t1}ms`);

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.log(`[spotify] fetchToken: error body: ${body.slice(0, 200)}`);
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

    const fetchOptions: RequestInit = { method, headers, signal: AbortSignal.timeout(15_000) };
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    console.log(`[spotify] API request: ${method} ${url}`);
    const t0 = Date.now();
    const resp = await fetch(url, fetchOptions);
    console.log(`[spotify] API response: ${resp.status} in ${Date.now() - t0}ms`);

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

    // 429 — rate limited, respect Retry-After and clear token (like spogo)
    if (resp.status === 429) {
      const maxRetryDelay = 10; // seconds — cap to avoid hanging forever
      let lastResp = resp;
      for (let attempt = 0; attempt < 3; attempt++) {
        const retryAfterRaw = parseInt(lastResp.headers.get("Retry-After") ?? "2", 10);
        const delay = Math.min(retryAfterRaw || 2 ** (attempt + 1), maxRetryDelay);
        console.log(`[spotify] 429 — waiting ${delay}s before retry ${attempt + 1}/3`);
        // Clear cached token — Spotify may issue a fresh one with clean rate limit
        this.accessToken = null;
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        const newToken = await this.getAccessToken();
        headers.Authorization = `Bearer ${newToken}`;
        lastResp = await fetch(url, { ...fetchOptions, headers });
        if (lastResp.status !== 429) break;
      }
      if (!lastResp.ok) {
        throw new Error(`Spotify API error: ${lastResp.status} ${lastResp.statusText}`);
      }
      return lastResp.json() as Promise<T>;
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
