import { describe, it, expect, vi } from "vitest";
import { spotifyTools, executeTool } from "../tools";
import type { SpotifyClient } from "../types";

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Partial<SpotifyClient>): SpotifyClient {
  return {
    getAccessToken: vi.fn().mockResolvedValue("mock-token"),
    getUserId: vi.fn().mockResolvedValue("user123"),
    getUserProfile: vi.fn().mockResolvedValue({ id: "user123", display_name: "Test" }),
    search: vi.fn().mockResolvedValue({ tracks: { items: [] } }),
    getTopItems: vi.fn().mockResolvedValue({ items: [] }),
    getRecentlyPlayed: vi.fn().mockResolvedValue({ items: [] }),
    getSavedTracks: vi.fn().mockResolvedValue({ items: [] }),
    getFollowedArtists: vi.fn().mockResolvedValue({ artists: { items: [] } }),
    getUserPlaylists: vi.fn().mockResolvedValue({ items: [] }),
    getPlaylist: vi.fn().mockResolvedValue({ id: "pl1", name: "Test" }),
    getArtistTopTracks: vi.fn().mockResolvedValue({ tracks: [] }),
    getTracks: vi.fn().mockResolvedValue({ tracks: [] }),
    getArtists: vi.fn().mockResolvedValue({ artists: [] }),
    getAlbum: vi.fn().mockResolvedValue({ id: "alb1", name: "Album" }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

describe("spotifyTools definitions", () => {
  it("exports exactly 12 tools", () => {
    expect(spotifyTools).toHaveLength(12);
  });

  it("every tool has name, description, and input_schema", () => {
    for (const tool of spotifyTools) {
      expect(tool.name).toEqual(expect.any(String));
      expect(tool.description).toEqual(expect.any(String));
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe("object");
    }
  });

  it("tool names are unique", () => {
    const names = spotifyTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("no tool definition contains $schema key", () => {
    for (const tool of spotifyTools) {
      expect(tool.input_schema).not.toHaveProperty("$schema");
    }
  });

  const expectedNames = [
    "get_user_profile",
    "get_top_items",
    "get_recently_played",
    "get_saved_tracks",
    "get_followed_artists",
    "search",
    "get_artist_top_tracks",
    "get_tracks",
    "get_artists",
    "get_album",
    "get_user_playlists",
    "get_playlist",
  ];

  it.each(expectedNames)("includes tool: %s", (name) => {
    expect(spotifyTools.find((t) => t.name === name)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// executeTool — unknown tool
// ---------------------------------------------------------------------------

describe("executeTool — unknown tool", () => {
  it("throws for unknown tool name", async () => {
    const client = createMockClient();
    await expect(executeTool(client, "nonexistent", {})).rejects.toThrow("Unknown Spotify tool: nonexistent");
  });
});

// ---------------------------------------------------------------------------
// Individual tool execution tests
// ---------------------------------------------------------------------------

describe("get_user_profile", () => {
  it("calls getUserProfile()", async () => {
    const client = createMockClient();
    await executeTool(client, "get_user_profile", {});
    expect(client.getUserProfile).toHaveBeenCalled();
  });
});

describe("get_top_items", () => {
  it("calls getTopItems with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_top_items", { type: "artists" });
    expect(client.getTopItems).toHaveBeenCalledWith("artists", "medium_term", 20);
  });

  it("passes custom time_range and limit", async () => {
    const client = createMockClient();
    await executeTool(client, "get_top_items", {
      type: "tracks",
      time_range: "short_term",
      limit: 5,
    });
    expect(client.getTopItems).toHaveBeenCalledWith("tracks", "short_term", 5);
  });

  it("rejects invalid type", async () => {
    const client = createMockClient();
    await expect(
      executeTool(client, "get_top_items", { type: "albums" }),
    ).rejects.toThrow();
  });
});

describe("get_recently_played", () => {
  it("calls getRecentlyPlayed with default limit", async () => {
    const client = createMockClient();
    await executeTool(client, "get_recently_played", {});
    expect(client.getRecentlyPlayed).toHaveBeenCalledWith(20);
  });
});

describe("get_saved_tracks", () => {
  it("calls getSavedTracks with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_saved_tracks", {});
    expect(client.getSavedTracks).toHaveBeenCalledWith(20, 0);
  });

  it("passes custom limit and offset", async () => {
    const client = createMockClient();
    await executeTool(client, "get_saved_tracks", { limit: 50, offset: 100 });
    expect(client.getSavedTracks).toHaveBeenCalledWith(50, 100);
  });
});

describe("get_followed_artists", () => {
  it("calls getFollowedArtists with default limit", async () => {
    const client = createMockClient();
    await executeTool(client, "get_followed_artists", {});
    expect(client.getFollowedArtists).toHaveBeenCalledWith(20);
  });
});

describe("search", () => {
  it("calls search with query and types", async () => {
    const client = createMockClient();
    await executeTool(client, "search", {
      query: "radiohead",
      types: ["artist", "album"],
    });
    expect(client.search).toHaveBeenCalledWith("radiohead", ["artist", "album"], 10);
  });

  it("rejects empty types array", async () => {
    const client = createMockClient();
    await expect(
      executeTool(client, "search", { query: "test", types: [] }),
    ).rejects.toThrow();
  });
});

describe("get_artist_top_tracks", () => {
  it("calls getArtistTopTracks with artist_id", async () => {
    const client = createMockClient();
    await executeTool(client, "get_artist_top_tracks", { artist_id: "abc123" });
    expect(client.getArtistTopTracks).toHaveBeenCalledWith("abc123");
  });
});

describe("get_tracks", () => {
  it("calls getTracks with IDs", async () => {
    const client = createMockClient();
    await executeTool(client, "get_tracks", { track_ids: ["t1", "t2", "t3"] });
    expect(client.getTracks).toHaveBeenCalledWith(["t1", "t2", "t3"]);
  });

  it("rejects more than 20 IDs", async () => {
    const client = createMockClient();
    const ids = Array.from({ length: 21 }, (_, i) => `t${i}`);
    await expect(
      executeTool(client, "get_tracks", { track_ids: ids }),
    ).rejects.toThrow();
  });
});

describe("get_artists", () => {
  it("calls getArtists with IDs", async () => {
    const client = createMockClient();
    await executeTool(client, "get_artists", { artist_ids: ["a1", "a2"] });
    expect(client.getArtists).toHaveBeenCalledWith(["a1", "a2"]);
  });
});

describe("get_album", () => {
  it("calls getAlbum with album_id", async () => {
    const client = createMockClient();
    await executeTool(client, "get_album", { album_id: "alb123" });
    expect(client.getAlbum).toHaveBeenCalledWith("alb123");
  });
});

describe("get_user_playlists", () => {
  it("calls getUserPlaylists with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_user_playlists", {});
    expect(client.getUserPlaylists).toHaveBeenCalledWith(20, 0);
  });
});

describe("get_playlist", () => {
  it("calls getPlaylist with playlist_id", async () => {
    const client = createMockClient();
    await executeTool(client, "get_playlist", { playlist_id: "pl123" });
    expect(client.getPlaylist).toHaveBeenCalledWith("pl123");
  });
});
