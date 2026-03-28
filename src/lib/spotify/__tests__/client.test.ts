import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  totpFromSecret,
  generateTOTP,
  SpotifyApiClient,
  _setTotpSecretFetcher,
  _clearTotpCache,
} from "../client";

// ---------------------------------------------------------------------------
// TOTP generation
// ---------------------------------------------------------------------------

describe("totpFromSecret", () => {
  it("produces a 6-digit zero-padded string", () => {
    const secret = new Uint8Array([70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68]);
    const code = totpFromSecret(secret, new Date("2025-01-01T00:00:00Z"));
    expect(code).toMatch(/^\d{6}$/);
  });

  it("is deterministic for the same input", () => {
    const secret = new Uint8Array([70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68]);
    const time = new Date("2025-06-15T12:00:00Z");
    const a = totpFromSecret(secret, time);
    const b = totpFromSecret(secret, time);
    expect(a).toBe(b);
  });

  it("changes with different timestamps (different 30s windows)", () => {
    const secret = new Uint8Array([70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68]);
    const a = totpFromSecret(secret, new Date("2025-01-01T00:00:00Z"));
    const b = totpFromSecret(secret, new Date("2025-01-01T00:01:00Z"));
    expect(a).not.toBe(b);
  });

  it("same within same 30s window", () => {
    const secret = new Uint8Array([70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68]);
    const a = totpFromSecret(secret, new Date("2025-01-01T00:00:00Z"));
    const b = totpFromSecret(secret, new Date("2025-01-01T00:00:15Z"));
    expect(a).toBe(b);
  });
});

describe("generateTOTP", () => {
  let restore: () => void;

  beforeEach(() => {
    _clearTotpCache();
    restore = _setTotpSecretFetcher(async () => ({
      version: 42,
      secret: new Uint8Array([70, 60, 33, 57, 92, 120, 90, 33]),
    }));
  });

  afterEach(() => {
    restore();
    _clearTotpCache();
  });

  it("returns code and version from fetched secret", async () => {
    const result = await generateTOTP(new Date("2025-01-01T00:00:00Z"));
    expect(result.version).toBe(42);
    expect(result.code).toMatch(/^\d{6}$/);
  });

  it("falls back when fetcher throws", async () => {
    restore();
    restore = _setTotpSecretFetcher(async () => {
      throw new Error("network error");
    });
    const result = await generateTOTP(new Date("2025-01-01T00:00:00Z"));
    expect(result.version).toBe(18); // fallback version
    expect(result.code).toMatch(/^\d{6}$/);
  });
});

// ---------------------------------------------------------------------------
// SpotifyApiClient
// ---------------------------------------------------------------------------

describe("SpotifyApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    _clearTotpCache();
    _setTotpSecretFetcher(async () => ({
      version: 1,
      secret: new Uint8Array([1, 2, 3]),
    }));
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _setTotpSecretFetcher(null);
    _clearTotpCache();
  });

  function mockTokenResponse(token = "test-access-token") {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: token,
        expiresIn: 3600,
        accessTokenExpirationTimestampMs: Date.now() + 3_600_000,
        isAnonymous: false,
        clientId: "test-client",
      }),
      headers: new Headers(),
    };
  }

  function mockApiResponse(data: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => data,
      headers: new Headers(),
    };
  }

  it("fetches a token with TOTP params and sp_dc cookie", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse());
    fetchMock.mockResolvedValueOnce(mockApiResponse({ id: "user1" }));

    const client = new SpotifyApiClient("my-sp-dc-cookie");
    await client.get("/me");

    const tokenCall = fetchMock.mock.calls[0];
    const tokenUrl: string = tokenCall[0];
    expect(tokenUrl).toContain("open.spotify.com/api/token");
    expect(tokenUrl).toContain("totp=");
    expect(tokenUrl).toContain("totpVer=");
    expect(tokenUrl).toContain("totpServer=");
    expect(tokenCall[1].headers.Cookie).toBe("sp_dc=my-sp-dc-cookie");
  });

  it("caches the access token across requests", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse());
    fetchMock.mockResolvedValueOnce(mockApiResponse({ a: 1 }));
    fetchMock.mockResolvedValueOnce(mockApiResponse({ b: 2 }));

    const client = new SpotifyApiClient("cookie");
    await client.get("/first");
    await client.get("/second");

    // 1 token call + 2 API calls = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries on 401 with a fresh token", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse("token-1"));
    // First API call returns 401
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers() });
    // Token refresh
    fetchMock.mockResolvedValueOnce(mockTokenResponse("token-2"));
    // Retry succeeds
    fetchMock.mockResolvedValueOnce(mockApiResponse({ retried: true }));

    const client = new SpotifyApiClient("cookie");
    const result = await client.get("/resource");
    expect(result).toEqual({ retried: true });
  });

  it("retries on 429 after Retry-After delay", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse());
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "0" }),
    });
    fetchMock.mockResolvedValueOnce(mockApiResponse({ ok: true }));

    const client = new SpotifyApiClient("cookie");
    const result = await client.get("/resource");
    expect(result).toEqual({ ok: true });
  });

  it("deduplicates concurrent token refreshes", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse());
    fetchMock.mockResolvedValueOnce(mockApiResponse({ a: 1 }));
    fetchMock.mockResolvedValueOnce(mockApiResponse({ b: 2 }));

    const client = new SpotifyApiClient("cookie");
    const [r1, r2] = await Promise.all([client.get("/a"), client.get("/b")]);

    expect(r1).toEqual({ a: 1 });
    expect(r2).toEqual({ b: 2 });
    // Only one token fetch despite two concurrent requests
    const tokenCalls = fetchMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("api/token"),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("sends POST with JSON body", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse());
    fetchMock.mockResolvedValueOnce(mockApiResponse({ snapshot_id: "abc" }));

    const client = new SpotifyApiClient("cookie");
    await client.post("/playlists/123/tracks", { uris: ["spotify:track:1"] });

    const apiCall = fetchMock.mock.calls[1];
    expect(apiCall[1].method).toBe("POST");
    expect(apiCall[1].body).toBe(JSON.stringify({ uris: ["spotify:track:1"] }));
    expect(apiCall[1].headers.Authorization).toBe("Bearer test-access-token");
  });

  it("getUserId fetches profile and caches the id", async () => {
    fetchMock.mockResolvedValueOnce(mockTokenResponse());
    fetchMock.mockResolvedValueOnce(mockApiResponse({ id: "user123", display_name: "Test" }));

    const client = new SpotifyApiClient("cookie");
    const id1 = await client.getUserId();
    const id2 = await client.getUserId();

    expect(id1).toBe("user123");
    expect(id2).toBe("user123");
    // /me only called once
    const meCalls = fetchMock.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("/v1/me"),
    );
    expect(meCalls).toHaveLength(1);
  });
});
