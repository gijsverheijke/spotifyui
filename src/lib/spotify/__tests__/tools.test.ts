import { describe, it, expect, vi, beforeEach } from "vitest";
import { spotifyTools, executeTool } from "../tools";
import type { SpotifyClient } from "../types";

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Partial<SpotifyClient>): SpotifyClient {
  return {
    get: vi.fn().mockResolvedValue({ mock: true }),
    post: vi.fn().mockResolvedValue({ mock: true }),
    getUserId: vi.fn().mockResolvedValue("user123"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

describe("spotifyTools definitions", () => {
  it("exports exactly 14 tools", () => {
    expect(spotifyTools).toHaveLength(14);
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
    "create_playlist",
    "add_tracks_to_playlist",
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
  it("calls GET /me", async () => {
    const client = createMockClient();
    await executeTool(client, "get_user_profile", {});
    expect(client.get).toHaveBeenCalledWith("/me");
  });
});

describe("get_top_items", () => {
  it("calls GET /me/top/artists with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_top_items", { type: "artists" });
    expect(client.get).toHaveBeenCalledWith("/me/top/artists", {
      time_range: "medium_term",
      limit: "20",
    });
  });

  it("passes custom time_range and limit", async () => {
    const client = createMockClient();
    await executeTool(client, "get_top_items", {
      type: "tracks",
      time_range: "short_term",
      limit: 5,
    });
    expect(client.get).toHaveBeenCalledWith("/me/top/tracks", {
      time_range: "short_term",
      limit: "5",
    });
  });

  it("rejects invalid type", async () => {
    const client = createMockClient();
    await expect(
      executeTool(client, "get_top_items", { type: "albums" }),
    ).rejects.toThrow();
  });
});

describe("get_recently_played", () => {
  it("calls GET /me/player/recently-played with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_recently_played", {});
    expect(client.get).toHaveBeenCalledWith("/me/player/recently-played", {
      limit: "20",
    });
  });

  it("includes before param when provided", async () => {
    const client = createMockClient();
    await executeTool(client, "get_recently_played", { before: 1700000000000 });
    expect(client.get).toHaveBeenCalledWith("/me/player/recently-played", {
      limit: "20",
      before: "1700000000000",
    });
  });

  it("includes after param when provided", async () => {
    const client = createMockClient();
    await executeTool(client, "get_recently_played", { after: 1700000000000 });
    expect(client.get).toHaveBeenCalledWith("/me/player/recently-played", {
      limit: "20",
      after: "1700000000000",
    });
  });
});

describe("get_saved_tracks", () => {
  it("calls GET /me/tracks with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_saved_tracks", {});
    expect(client.get).toHaveBeenCalledWith("/me/tracks", {
      limit: "20",
      offset: "0",
    });
  });

  it("passes custom limit and offset", async () => {
    const client = createMockClient();
    await executeTool(client, "get_saved_tracks", { limit: 50, offset: 100 });
    expect(client.get).toHaveBeenCalledWith("/me/tracks", {
      limit: "50",
      offset: "100",
    });
  });
});

describe("get_followed_artists", () => {
  it("calls GET /me/following with type=artist", async () => {
    const client = createMockClient();
    await executeTool(client, "get_followed_artists", {});
    expect(client.get).toHaveBeenCalledWith("/me/following", {
      type: "artist",
      limit: "20",
    });
  });

  it("includes after cursor when provided", async () => {
    const client = createMockClient();
    await executeTool(client, "get_followed_artists", { after: "abc123" });
    expect(client.get).toHaveBeenCalledWith("/me/following", {
      type: "artist",
      limit: "20",
      after: "abc123",
    });
  });
});

describe("search", () => {
  it("calls GET /search with joined types", async () => {
    const client = createMockClient();
    await executeTool(client, "search", {
      query: "radiohead",
      types: ["artist", "album"],
    });
    expect(client.get).toHaveBeenCalledWith("/search", {
      q: "radiohead",
      type: "artist,album",
      limit: "10",
    });
  });

  it("rejects empty types array", async () => {
    const client = createMockClient();
    await expect(
      executeTool(client, "search", { query: "test", types: [] }),
    ).rejects.toThrow();
  });
});

describe("get_artist_top_tracks", () => {
  it("calls GET /artists/{id}/top-tracks", async () => {
    const client = createMockClient();
    await executeTool(client, "get_artist_top_tracks", { artist_id: "abc123" });
    expect(client.get).toHaveBeenCalledWith("/artists/abc123/top-tracks");
  });
});

describe("get_tracks", () => {
  it("calls GET /tracks with joined IDs", async () => {
    const client = createMockClient();
    await executeTool(client, "get_tracks", { track_ids: ["t1", "t2", "t3"] });
    expect(client.get).toHaveBeenCalledWith("/tracks", { ids: "t1,t2,t3" });
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
  it("calls GET /artists with joined IDs", async () => {
    const client = createMockClient();
    await executeTool(client, "get_artists", { artist_ids: ["a1", "a2"] });
    expect(client.get).toHaveBeenCalledWith("/artists", { ids: "a1,a2" });
  });
});

describe("get_album", () => {
  it("calls GET /albums/{id}", async () => {
    const client = createMockClient();
    await executeTool(client, "get_album", { album_id: "alb123" });
    expect(client.get).toHaveBeenCalledWith("/albums/alb123");
  });
});

describe("get_user_playlists", () => {
  it("calls GET /me/playlists with defaults", async () => {
    const client = createMockClient();
    await executeTool(client, "get_user_playlists", {});
    expect(client.get).toHaveBeenCalledWith("/me/playlists", {
      limit: "20",
      offset: "0",
    });
  });
});

describe("get_playlist", () => {
  it("calls GET /playlists/{id}", async () => {
    const client = createMockClient();
    await executeTool(client, "get_playlist", { playlist_id: "pl123" });
    expect(client.get).toHaveBeenCalledWith("/playlists/pl123");
  });
});

describe("create_playlist", () => {
  it("fetches user ID and calls POST /users/{id}/playlists", async () => {
    const client = createMockClient();
    await executeTool(client, "create_playlist", { name: "Road Trip" });
    expect(client.getUserId).toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledWith("/users/user123/playlists", {
      name: "Road Trip",
      description: "",
      public: true,
    });
  });

  it("passes custom description and public flag", async () => {
    const client = createMockClient();
    await executeTool(client, "create_playlist", {
      name: "Chill",
      description: "Relaxing tunes",
      public: false,
    });
    expect(client.post).toHaveBeenCalledWith("/users/user123/playlists", {
      name: "Chill",
      description: "Relaxing tunes",
      public: false,
    });
  });
});

describe("add_tracks_to_playlist", () => {
  it("calls POST /playlists/{id}/tracks with URIs", async () => {
    const client = createMockClient();
    await executeTool(client, "add_tracks_to_playlist", {
      playlist_id: "pl123",
      track_uris: ["spotify:track:a", "spotify:track:b"],
    });
    expect(client.post).toHaveBeenCalledWith("/playlists/pl123/tracks", {
      uris: ["spotify:track:a", "spotify:track:b"],
    });
  });

  it("includes position when provided", async () => {
    const client = createMockClient();
    await executeTool(client, "add_tracks_to_playlist", {
      playlist_id: "pl123",
      track_uris: ["spotify:track:a"],
      position: 3,
    });
    expect(client.post).toHaveBeenCalledWith("/playlists/pl123/tracks", {
      uris: ["spotify:track:a"],
      position: 3,
    });
  });

  it("rejects more than 100 URIs", async () => {
    const client = createMockClient();
    const uris = Array.from({ length: 101 }, (_, i) => `spotify:track:${i}`);
    await expect(
      executeTool(client, "add_tracks_to_playlist", {
        playlist_id: "pl123",
        track_uris: uris,
      }),
    ).rejects.toThrow();
  });
});
