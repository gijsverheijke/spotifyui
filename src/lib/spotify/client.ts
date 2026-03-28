import type { SpotifyClient, SpotifyUser } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

// ---------------------------------------------------------------------------
// SpotifyApiClient — accepts an access token directly
// ---------------------------------------------------------------------------

export class SpotifyApiClient implements SpotifyClient {
  private accessToken: string;
  private userId: string | null = null;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options?: { params?: Record<string, string>; body?: unknown },
  ): Promise<T> {
    let url = `${SPOTIFY_API_BASE}${path}`;
    if (options?.params) {
      const qs = new URLSearchParams(options.params);
      url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
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

    // 429 — rate limited, retry with exponential backoff (up to 3 attempts)
    if (resp.status === 429) {
      let lastResp = resp;
      for (let attempt = 0; attempt < 3; attempt++) {
        const backoffBase = 2 ** (attempt + 1);
        const retryAfter = parseInt(lastResp.headers.get("Retry-After") ?? "0", 10);
        const delay = Math.max(retryAfter, backoffBase);
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        lastResp = await fetch(url, fetchOptions);
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
