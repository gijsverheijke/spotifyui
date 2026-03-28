/**
 * Client-side Spotify authentication using Web Crypto API.
 *
 * This runs in the browser so Spotify sees a genuine Chrome TLS fingerprint
 * and doesn't rate-limit the token exchange (unlike Node.js server-side fetch).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTP_SECRET_URLS = [
  "https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json",
];

const FALLBACK_TOTP_SECRET = new Uint8Array([
  70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68,
]);
const FALLBACK_TOTP_VERSION = 18;

const TOTP_CACHE_TTL_MS = 15 * 60 * 1000;
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_HTTP_TIMEOUT_MS = 3000;

const SPOTIFY_TOKEN_URL = "https://open.spotify.com/api/token";

// ---------------------------------------------------------------------------
// TOTP secret cache
// ---------------------------------------------------------------------------

let cachedSecret: { version: number; secret: Uint8Array; expiresAt: number } | null = null;

// ---------------------------------------------------------------------------
// TOTP secret fetching
// ---------------------------------------------------------------------------

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

async function getTotpSecret(): Promise<{ version: number; secret: Uint8Array }> {
  const now = Date.now();
  if (cachedSecret && now < cachedSecret.expiresAt && cachedSecret.secret.length > 0) {
    return { version: cachedSecret.version, secret: Uint8Array.from(cachedSecret.secret) };
  }

  try {
    const result = await fetchTotpSecretHTTP();
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
// TOTP generation using Web Crypto API (HMAC-SHA1)
// ---------------------------------------------------------------------------

function totpFromSecret(secret: Uint8Array, now: Date): Promise<string> {
  // Transform: secret[i] ^= (i % 33) + 9
  const transformed = new Uint8Array(secret.length);
  for (let i = 0; i < secret.length; i++) {
    transformed[i] = secret[i] ^ ((i % 33) + 9);
  }

  // Join transformed bytes as decimal strings
  const key = transformed.reduce((acc, byte) => acc + String(byte), "");

  // Standard HOTP with SHA1 via SubtleCrypto
  const counter = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = new ArrayBuffer(8);
  const counterView = new DataView(counterBuf);
  counterView.setBigUint64(0, BigInt(counter));

  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);

  return crypto.subtle
    .importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
    .then((cryptoKey) => crypto.subtle.sign("HMAC", cryptoKey, counterBuf))
    .then((sigBuf) => {
      const hash = new Uint8Array(sigBuf);

      // Dynamic truncation
      const offset = hash[hash.length - 1] & 0x0f;
      const binCode =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);

      const otp = binCode % 1_000_000;
      return String(otp).padStart(TOTP_DIGITS, "0");
    });
}

async function generateTOTP(): Promise<{ code: string; version: number }> {
  const { version, secret } = await getTotpSecret();
  const code = await totpFromSecret(secret, new Date());
  return { code, version };
}

// ---------------------------------------------------------------------------
// Token exchange — runs in the browser
// ---------------------------------------------------------------------------

export interface SpotifyToken {
  accessToken: string;
  expiresAt: number;
  isAnonymous: boolean;
}

export async function exchangeToken(spDc: string): Promise<SpotifyToken> {
  const { code, version } = await generateTOTP();

  const params = new URLSearchParams({
    reason: "init",
    productType: "web-player",
    totp: code,
    totpVer: String(version),
    totpServer: code,
  });

  const resp = await fetch(`${SPOTIFY_TOKEN_URL}?${params}`, {
    method: "GET",
    headers: {
      Cookie: `sp_dc=${spDc}`,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "app-platform": "WebPlayer",
    },
    credentials: "omit",
  });

  if (!resp.ok) {
    if (resp.status === 429) {
      throw new Error("Spotify rate limit — try again in a few minutes");
    }
    throw new Error(`Token request failed: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (!data.accessToken) {
    throw new Error("Missing access token in response");
  }

  const expiresAt =
    data.accessTokenExpirationTimestampMs > 0
      ? data.accessTokenExpirationTimestampMs
      : Date.now() + data.expiresIn * 1000;

  return {
    accessToken: data.accessToken,
    expiresAt,
    isAnonymous: data.isAnonymous ?? false,
  };
}

/**
 * Check if a token needs refreshing (expired or within 60s of expiry).
 */
export function tokenNeedsRefresh(expiresAt: number): boolean {
  return Date.now() >= expiresAt - 60_000;
}
