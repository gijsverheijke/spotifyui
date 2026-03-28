import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpotifyApiClient } from "../client";

// ---------------------------------------------------------------------------
// SpotifyApiClient — now accepts access token directly
// ---------------------------------------------------------------------------

describe("SpotifyApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockApiResponse(data: unknown) {
    return {
      ok: true,
      status: 200,
      json: async () => data,
      headers: new Headers(),
    };
  }

  it("sends Bearer token in Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(mockApiResponse({ id: "user1" }));

    const client = new SpotifyApiClient("my-access-token");
    await client.get("/me");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/me");
    expect(options.headers.Authorization).toBe("Bearer my-access-token");
  });

  it("makes multiple requests with the same token", async () => {
    fetchMock.mockResolvedValueOnce(mockApiResponse({ a: 1 }));
    fetchMock.mockResolvedValueOnce(mockApiResponse({ b: 2 }));

    const client = new SpotifyApiClient("token");
    await client.get("/first");
    await client.get("/second");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 after Retry-After delay", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "0" }),
    });
    fetchMock.mockResolvedValueOnce(mockApiResponse({ ok: true }));

    const client = new SpotifyApiClient("token");
    const result = await client.get("/resource");
    expect(result).toEqual({ ok: true });
  });

  it("sends POST with JSON body", async () => {
    fetchMock.mockResolvedValueOnce(mockApiResponse({ snapshot_id: "abc" }));

    const client = new SpotifyApiClient("test-access-token");
    await client.post("/playlists/123/tracks", { uris: ["spotify:track:1"] });

    const apiCall = fetchMock.mock.calls[0];
    expect(apiCall[1].method).toBe("POST");
    expect(apiCall[1].body).toBe(JSON.stringify({ uris: ["spotify:track:1"] }));
    expect(apiCall[1].headers.Authorization).toBe("Bearer test-access-token");
  });

  it("getUserId fetches profile and caches the id", async () => {
    fetchMock.mockResolvedValueOnce(mockApiResponse({ id: "user123", display_name: "Test" }));

    const client = new SpotifyApiClient("token");
    const id1 = await client.getUserId();
    const id2 = await client.getUserId();

    expect(id1).toBe("user123");
    expect(id2).toBe("user123");
    // /me only called once
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on non-ok non-429 responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: new Headers(),
    });

    const client = new SpotifyApiClient("token");
    await expect(client.get("/forbidden")).rejects.toThrow("Spotify API error: 403 Forbidden");
  });
});
