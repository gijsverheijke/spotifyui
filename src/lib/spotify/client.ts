import { createHmac } from "crypto";
import type { SpotifyClient, SpotifyTokenResponse } from "./types";
import {
  HashResolver,
  pathfinderQuery,
  PathfinderAuthError,
  PathfinderHashError,
  getNestedMap,
  extractImages,
  extractArtistList,
  extractSearchCategory,
  extractLibraryItems,
  extractPlaylistTracks,
  extractHomeSections,
  collectItemsByKind,
  normalizeTrack,
  normalizeArtist,
  normalizeAlbum,
  normalizePlaylistSimplified,
  idFromUri,
} from "./pathfinder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FALLBACK_TOTP_SECRET = new Uint8Array([
  70, 60, 33, 57, 92, 120, 90, 33, 32, 62, 62, 55, 126, 93, 66, 35, 108, 68,
]);
const FALLBACK_TOTP_VERSION = 18;

const TOTP_SECRET_URL =
  "https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json";

let cachedTotp: {
  version: number;
  secret: Uint8Array;
  expiresAt: number;
} | null = null;

async function fetchTotpSecret(): Promise<{
  version: number;
  secret: Uint8Array;
}> {
  const now = Date.now();
  if (cachedTotp && now < cachedTotp.expiresAt) {
    return { version: cachedTotp.version, secret: cachedTotp.secret };
  }
  try {
    const resp = await fetch(TOTP_SECRET_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, number[]>;
    const versions = Object.keys(data)
      .map(Number)
      .sort((a, b) => b - a);
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

const SPOTIFY_TOKEN_BASE = "https://open.spotify.com/";
const CLIENT_VERSION = "1.2.87.216.g698d3563";

// ---------------------------------------------------------------------------
// TOTP generation
// ---------------------------------------------------------------------------

export function totpFromSecret(secret: Uint8Array, now: Date): string {
  const transformed = new Uint8Array(secret.length);
  for (let i = 0; i < secret.length; i++) {
    transformed[i] = secret[i] ^ ((i % 33) + 9);
  }
  const key = transformed.reduce((acc, byte) => acc + String(byte), "");
  const counter = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", Buffer.from(key, "utf-8"));
  hmac.update(counterBuf);
  const hash = hmac.digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binCode =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  const otp = binCode % 1_000_000;
  return String(otp).padStart(TOTP_DIGITS, "0");
}

export async function generateTOTP(
  now: Date,
): Promise<{ code: string; version: number }> {
  const { version, secret } = await fetchTotpSecret();
  const code = totpFromSecret(secret, now);
  return { code, version };
}

// ---------------------------------------------------------------------------
// SpotifyApiClient — Pathfinder-based implementation
// ---------------------------------------------------------------------------

export class SpotifyApiClient implements SpotifyClient {
  private spDc: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private refreshPromise: Promise<string> | null = null;
  private userId: string | null = null;
  private clientId: string | null = null;
  private clientToken: string | null = null;
  private clientTokenExpiresAt: number = 0;
  private hashResolver = new HashResolver();

  constructor(spDc: string) {
    this.spDc = spDc;
  }

  // -------------------------------------------------------------------------
  // Token management
  // -------------------------------------------------------------------------

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.fetchToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async fetchToken(): Promise<string> {
    console.log("[spotify] fetchToken: generating TOTP...");
    const t0 = Date.now();
    const { code, version } = await generateTOTP(new Date());
    console.log(
      `[spotify] fetchToken: TOTP generated (v${version}) in ${Date.now() - t0}ms`,
    );
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
        "Sec-CH-UA":
          '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
        "Sec-CH-UA-Platform": '"macOS"',
        "Sec-CH-UA-Mobile": "?0",
      },
      signal: AbortSignal.timeout(15_000),
    });
    console.log(
      `[spotify] fetchToken: response ${resp.status} in ${Date.now() - t1}ms`,
    );
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
    this.clientId = data.clientId ?? this.clientId;
    this.tokenExpiresAt =
      data.accessTokenExpirationTimestampMs > 0
        ? data.accessTokenExpirationTimestampMs
        : Date.now() + data.expiresIn * 1000;
    return data.accessToken;
  }

  private async getClientToken(): Promise<string | null> {
    if (this.clientToken && Date.now() < this.clientTokenExpiresAt - 60_000) {
      return this.clientToken;
    }
    if (!this.clientId) return null;
    try {
      const payload = {
        client_data: {
          client_version: CLIENT_VERSION,
          client_id: this.clientId,
          js_sdk_data: {
            device_brand: "unknown",
            device_model: "unknown",
            os: "macos",
            os_version: "unknown",
            device_id: crypto.randomUUID(),
            device_type: "computer",
          },
        },
      };
      const resp = await fetch(
        "https://clienttoken.spotify.com/v1/clienttoken",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!resp.ok) {
        console.log(`[spotify] clienttoken: HTTP ${resp.status}`);
        return null;
      }
      const data = (await resp.json()) as {
        granted_token?: { token?: string; expires_in?: number };
      };
      const token = data.granted_token?.token;
      if (!token) return null;
      const expiresIn = data.granted_token?.expires_in ?? 1800;
      this.clientToken = token;
      this.clientTokenExpiresAt = Date.now() + expiresIn * 1000;
      console.log(
        `[spotify] clienttoken: obtained (expires in ${expiresIn}s)`,
      );
      return token;
    } catch (err) {
      console.log(`[spotify] clienttoken: failed`, err);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Pathfinder GraphQL helper with auth retry
  // -------------------------------------------------------------------------

  private async graphql(
    operation: string,
    variables: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const accessToken = await this.getAccessToken();
    const clientToken = await this.getClientToken();
    const auth = {
      accessToken,
      clientToken,
      clientVersion: CLIENT_VERSION,
    };
    try {
      return await pathfinderQuery(
        operation,
        variables,
        auth,
        this.hashResolver,
      );
    } catch (err) {
      if (err instanceof PathfinderAuthError) {
        this.accessToken = null;
        auth.accessToken = await this.getAccessToken();
        auth.clientToken = await this.getClientToken();
        return pathfinderQuery(
          operation,
          variables,
          auth,
          this.hashResolver,
        );
      }
      if (err instanceof PathfinderHashError) {
        // Hashes were invalidated, retry with fresh hashes
        return pathfinderQuery(
          operation,
          variables,
          auth,
          this.hashResolver,
        );
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Public API methods (all via Pathfinder)
  // -------------------------------------------------------------------------

  async getUserProfile(): Promise<unknown> {
    const payload = await this.graphql("profileAttributes");
    const me = getNestedMap(payload, "data", "me");
    if (!me) throw new Error("Profile data not found in response");

    const profile = (me.profile ?? me) as Record<string, unknown>;
    const uri =
      (profile.uri as string) ?? (me.uri as string) ?? "";
    const id = idFromUri(uri);

    return {
      id,
      display_name:
        profile.name ?? profile.displayName ?? null,
      type: "user",
      uri,
      external_urls: { spotify: `https://open.spotify.com/user/${id}` },
      followers: { href: null, total: 0 },
      images: extractImages(profile as Record<string, unknown>),
    };
  }

  async getUserId(): Promise<string> {
    if (this.userId) return this.userId;
    const profile = (await this.getUserProfile()) as { id: string };
    this.userId = profile.id;
    return profile.id;
  }

  async search(
    query: string,
    types: string[],
    limit: number = 10,
    offset: number = 0,
  ): Promise<unknown> {
    const payload = await this.graphql("searchDesktop", {
      searchTerm: query,
      offset,
      limit,
      numberOfTopResults: 5,
      includeAudiobooks: true,
      includePreReleases: true,
      includeLocalConcertsField: false,
      includeArtistHasConcertsField: false,
    });

    const searchV2 = getNestedMap(payload, "data", "searchV2");
    const result: Record<string, unknown> = {};

    if (types.includes("track")) {
      result.tracks = extractSearchCategory(
        searchV2,
        ["tracksV2"],
        "track",
        limit,
        offset,
      );
    }
    if (types.includes("artist")) {
      result.artists = extractSearchCategory(
        searchV2,
        ["artists"],
        "artist",
        limit,
        offset,
      );
    }
    if (types.includes("album")) {
      result.albums = extractSearchCategory(
        searchV2,
        ["albumsV2", "albums"],
        "album",
        limit,
        offset,
      );
    }
    if (types.includes("playlist")) {
      result.playlists = extractSearchCategory(
        searchV2,
        ["playlists"],
        "playlist",
        limit,
        offset,
      );
    }

    return result;
  }

  /**
   * Top artists/tracks are NOT available via Pathfinder. This uses the "home"
   * feed which returns personalized sections (mixes based on top artists,
   * recently played, etc.) as the best available approximation.
   */
  async getTopItems(
    type: string,
    _timeRange: string,
    limit: number,
  ): Promise<unknown> {
    const payload = await this.graphql("home", {
      homeEndUserIntegration: "INTEGRATION_WEB_PLAYER",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      facet: "",
      sectionItemsLimit: 20,
    });

    const sections = extractHomeSections(payload);

    // Collect items of the requested type from all personalized sections
    const kind = type === "artists" ? "artist" : "track";
    const allItems: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const section of sections) {
      for (const item of section.items) {
        const itemType = (item as Record<string, unknown>).type;
        const itemId = (item as Record<string, unknown>).id as string;
        if (itemType === kind && itemId && !seen.has(itemId)) {
          seen.add(itemId);
          allItems.push(item as Record<string, unknown>);
        }
      }
    }

    return {
      _note:
        "Top items are not available via the Spotify web player API. " +
        "This data is derived from the personalized home feed sections.",
      items: allItems.slice(0, limit),
      total: allItems.length,
      limit,
      offset: 0,
      href: "",
      next: null,
      previous: null,
      home_sections: sections.map((s) => ({
        title: s.title,
        item_count: s.items.length,
      })),
    };
  }

  async getRecentlyPlayed(limit: number): Promise<unknown> {
    const payload = await this.graphql(
      "fetchEntitiesForRecentlyPlayed",
    );
    const items = collectItemsByKind(payload, "track");
    return {
      items: items.slice(0, limit).map((item) => ({
        track: item,
        played_at: new Date().toISOString(),
        context: null,
      })),
      limit,
      cursors: null,
    };
  }

  async getSavedTracks(
    limit: number,
    offset: number,
  ): Promise<unknown> {
    const payload = await this.graphql("libraryV3", {
      filters: ["Songs"],
      order: null,
      textFilter: "",
      features: ["LIKED_SONGS", "YOUR_EPISODES"],
      limit,
      offset,
      flatten: false,
      expandedFolders: [],
      folderUri: null,
      includeFoldersWhenFlattening: true,
      withCuration: false,
    });

    const lib = getNestedMap(payload, "data", "me", "libraryV3");
    const { items, total } = extractLibraryItems(lib, "track");

    return {
      items: items.map((item) => ({
        added_at: new Date().toISOString(),
        track: item,
      })),
      total,
      limit,
      offset,
      href: "",
      next: offset + limit < total ? "next" : null,
      previous: offset > 0 ? "prev" : null,
    };
  }

  async getFollowedArtists(
    limit: number,
    _after?: string,
  ): Promise<unknown> {
    // Use libraryV3 with "Artists" filter — pathfinder has no direct equivalent
    // of the REST followed artists endpoint.
    const payload = await this.graphql("libraryV3", {
      filters: ["Artists"],
      order: null,
      textFilter: "",
      features: ["LIKED_SONGS", "YOUR_EPISODES"],
      limit,
      offset: 0,
      flatten: false,
      expandedFolders: [],
      folderUri: null,
      includeFoldersWhenFlattening: true,
      withCuration: false,
    });

    const lib = getNestedMap(payload, "data", "me", "libraryV3");
    const { items, total } = extractLibraryItems(lib, "artist");

    return {
      artists: {
        items,
        total,
        limit,
        cursors: null,
        href: "",
        next: null,
      },
    };
  }

  async getUserPlaylists(
    limit: number,
    offset: number,
  ): Promise<unknown> {
    const payload = await this.graphql("libraryV3", {
      filters: ["Playlists"],
      order: null,
      textFilter: "",
      features: ["LIKED_SONGS", "YOUR_EPISODES"],
      limit,
      offset,
      flatten: false,
      expandedFolders: [],
      folderUri: null,
      includeFoldersWhenFlattening: true,
      withCuration: false,
    });

    const lib = getNestedMap(payload, "data", "me", "libraryV3");
    const { items, total } = extractLibraryItems(lib, "playlist");

    return {
      items,
      total,
      limit,
      offset,
      href: "",
      next: offset + limit < total ? "next" : null,
      previous: offset > 0 ? "prev" : null,
    };
  }

  async getPlaylist(playlistId: string): Promise<unknown> {
    const payload = await this.graphql("fetchPlaylist", {
      uri: `spotify:playlist:${playlistId}`,
      offset: 0,
      limit: 100,
      enableWatchFeedEntrypoint: false,
    });

    const playlist = getNestedMap(payload, "data", "playlistV2");
    if (!playlist) throw new Error("Playlist not found");

    const content = playlist.content as Record<string, unknown> | undefined;
    const { items: trackItems, total } = extractPlaylistTracks(
      content as Record<string, unknown> | null,
    );

    const meta = normalizePlaylistSimplified(playlist);
    return {
      ...meta,
      followers: { href: null, total: 0 },
      tracks: {
        items: trackItems,
        total,
        limit: 100,
        offset: 0,
        href: "",
        next: null,
        previous: null,
      },
    };
  }

  async getArtistTopTracks(artistId: string): Promise<unknown> {
    // Try queryArtistOverview (hash resolved dynamically)
    try {
      const payload = await this.graphql("queryArtistOverview", {
        uri: `spotify:artist:${artistId}`,
        locale: "en",
        includePrerelease: false,
      });
      const tracks = collectItemsByKind(payload, "track");
      return { tracks: tracks.slice(0, 10) };
    } catch {
      // Fall back to search for the artist's tracks
      const searchPayload = await this.graphql("searchDesktop", {
        searchTerm: `artist:${artistId}`,
        offset: 0,
        limit: 10,
        numberOfTopResults: 10,
        includeAudiobooks: false,
        includePreReleases: false,
        includeLocalConcertsField: false,
        includeArtistHasConcertsField: false,
      });
      const searchV2 = getNestedMap(searchPayload, "data", "searchV2");
      const tracksResult = extractSearchCategory(
        searchV2,
        ["tracksV2"],
        "track",
        10,
        0,
      );
      return {
        tracks: (tracksResult.items as unknown[]) ?? [],
        _note: "Approximated via search — queryArtistOverview hash not available",
      };
    }
  }

  async getTracks(ids: string[]): Promise<unknown> {
    // Try individual getTrack operations in parallel
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        try {
          const payload = await this.graphql("getTrack", {
            uri: `spotify:track:${id}`,
          });
          const tracks = collectItemsByKind(payload, "track");
          return tracks[0] ?? null;
        } catch {
          return null;
        }
      }),
    );

    const tracks = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean);

    return { tracks };
  }

  async getArtists(ids: string[]): Promise<unknown> {
    // Try individual queryArtistOverview operations in parallel
    const results = await Promise.allSettled(
      ids.map(async (id) => {
        try {
          const payload = await this.graphql("queryArtistOverview", {
            uri: `spotify:artist:${id}`,
            locale: "en",
            includePrerelease: false,
          });
          const data =
            getNestedMap(payload, "data", "artistUnion") ??
            getNestedMap(payload, "data", "artist");
          if (data) return normalizeArtist(data);
          const artists = collectItemsByKind(payload, "artist");
          return artists[0] ?? null;
        } catch {
          return null;
        }
      }),
    );

    const artists = results
      .map((r) => (r.status === "fulfilled" ? r.value : null))
      .filter(Boolean);

    return { artists };
  }

  async getAlbum(albumId: string): Promise<unknown> {
    try {
      const payload = await this.graphql("getAlbum", {
        uri: `spotify:album:${albumId}`,
        locale: "en",
        offset: 0,
        limit: 50,
      });

      const albumData =
        getNestedMap(payload, "data", "albumUnion") ??
        getNestedMap(payload, "data", "album");
      if (albumData) {
        const album = normalizeAlbum(albumData);
        const tracks = collectItemsByKind(albumData, "track");
        return {
          ...album,
          tracks: {
            items: tracks.map((t) => ({
              ...t,
              // Simplified track format for album listing
              album: undefined,
            })),
            total: tracks.length,
            limit: 50,
            offset: 0,
            href: "",
            next: null,
            previous: null,
          },
        };
      }
    } catch {
      // Fall back to search
    }

    // Search fallback
    const searchPayload = await this.graphql("searchDesktop", {
      searchTerm: `album:${albumId}`,
      offset: 0,
      limit: 1,
      numberOfTopResults: 1,
      includeAudiobooks: false,
      includePreReleases: false,
      includeLocalConcertsField: false,
      includeArtistHasConcertsField: false,
    });
    const searchV2 = getNestedMap(searchPayload, "data", "searchV2");
    const albumsResult = extractSearchCategory(
      searchV2,
      ["albumsV2", "albums"],
      "album",
      1,
      0,
    );
    const albums = (albumsResult.items as unknown[]) ?? [];
    if (albums.length > 0) return albums[0];
    throw new Error(`Album ${albumId} not found`);
  }
}
