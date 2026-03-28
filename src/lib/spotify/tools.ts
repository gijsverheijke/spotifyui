import { z, toJSONSchema } from "zod";
import type { SpotifyClient } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

interface Tool {
  definition: ToolDefinition;
  execute: (client: SpotifyClient, params: Record<string, unknown>) => Promise<unknown>;
}

function defineTool<S extends z.ZodObject>(
  name: string,
  description: string,
  schema: S,
  execute: (client: SpotifyClient, params: z.infer<S>) => Promise<unknown>,
): Tool {
  const input_schema = toJSONSchema(schema) as JsonSchema;
  // Strip $schema key — Anthropic tools format doesn't use it
  delete input_schema.$schema;

  return {
    definition: { name, description, input_schema },
    execute: async (client, raw) => {
      const params = schema.parse(raw);
      return execute(client, params);
    },
  };
}

// ---------------------------------------------------------------------------
// 1. get_user_profile
// ---------------------------------------------------------------------------

const getUserProfile = defineTool(
  "get_user_profile",
  "Returns the current user's Spotify profile including display name, country, subscription type, follower count, and profile image.",
  z.object({}),
  async (client) => client.get("/me"),
);

// ---------------------------------------------------------------------------
// 2. get_top_items
// ---------------------------------------------------------------------------

const getTopItems = defineTool(
  "get_top_items",
  "Returns the user's top artists or tracks for a given time range.",
  z.object({
    type: z.enum(["artists", "tracks"]).describe("Whether to fetch top artists or top tracks"),
    time_range: z
      .enum(["short_term", "medium_term", "long_term"])
      .optional()
      .default("medium_term")
      .describe("short_term (~4 weeks), medium_term (~6 months), long_term (~1 year)"),
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
  }),
  async (client, params) =>
    client.get(`/me/top/${params.type}`, {
      time_range: params.time_range,
      limit: String(params.limit),
    }),
);

// ---------------------------------------------------------------------------
// 3. get_recently_played
// ---------------------------------------------------------------------------

const getRecentlyPlayed = defineTool(
  "get_recently_played",
  "Returns the user's recently played tracks with timestamps.",
  z.object({
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
    before: z.number().int().optional().describe("Unix timestamp in ms — return items played before this time"),
    after: z.number().int().optional().describe("Unix timestamp in ms — return items played after this time"),
  }),
  async (client, params) => {
    const query: Record<string, string> = { limit: String(params.limit) };
    if (params.before !== undefined) query.before = String(params.before);
    if (params.after !== undefined) query.after = String(params.after);
    return client.get("/me/player/recently-played", query);
  },
);

// ---------------------------------------------------------------------------
// 4. get_saved_tracks
// ---------------------------------------------------------------------------

const getSavedTracks = defineTool(
  "get_saved_tracks",
  "Returns tracks from the user's Liked Songs library.",
  z.object({
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
    offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
  }),
  async (client, params) =>
    client.get("/me/tracks", {
      limit: String(params.limit),
      offset: String(params.offset),
    }),
);

// ---------------------------------------------------------------------------
// 5. get_followed_artists
// ---------------------------------------------------------------------------

const getFollowedArtists = defineTool(
  "get_followed_artists",
  "Returns artists the user follows.",
  z.object({
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
    after: z.string().optional().describe("Cursor ID for pagination — the last artist ID from the previous page"),
  }),
  async (client, params) => {
    const query: Record<string, string> = { type: "artist", limit: String(params.limit) };
    if (params.after !== undefined) query.after = params.after;
    return client.get("/me/following", query);
  },
);

// ---------------------------------------------------------------------------
// 6. search
// ---------------------------------------------------------------------------

const search = defineTool(
  "search",
  "Searches the Spotify catalog for tracks, artists, albums, or playlists. Supports field filters like artist:, genre:, year: in the query string.",
  z.object({
    query: z.string().describe("Search query (supports field filters like artist:, genre:, year:)"),
    types: z
      .array(z.enum(["track", "artist", "album", "playlist"]))
      .min(1)
      .describe("Types of results to return"),
    limit: z.number().int().min(1).max(50).optional().default(10).describe("Number of results per type (1-50)"),
  }),
  async (client, params) =>
    client.get("/search", {
      q: params.query,
      type: params.types.join(","),
      limit: String(params.limit),
    }),
);

// ---------------------------------------------------------------------------
// 7. get_artist_top_tracks
// ---------------------------------------------------------------------------

const getArtistTopTracks = defineTool(
  "get_artist_top_tracks",
  "Returns an artist's most popular tracks.",
  z.object({
    artist_id: z.string().describe("Spotify artist ID"),
  }),
  async (client, params) => client.get(`/artists/${params.artist_id}/top-tracks`),
);

// ---------------------------------------------------------------------------
// 8. get_tracks
// ---------------------------------------------------------------------------

const getTracks = defineTool(
  "get_tracks",
  "Returns detailed info for one or more tracks (batch lookup, max 20).",
  z.object({
    track_ids: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe("Array of Spotify track IDs (max 20)"),
  }),
  async (client, params) =>
    client.get("/tracks", { ids: params.track_ids.join(",") }),
);

// ---------------------------------------------------------------------------
// 9. get_artists
// ---------------------------------------------------------------------------

const getArtists = defineTool(
  "get_artists",
  "Returns detailed info for one or more artists (batch lookup, max 20).",
  z.object({
    artist_ids: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe("Array of Spotify artist IDs (max 20)"),
  }),
  async (client, params) =>
    client.get("/artists", { ids: params.artist_ids.join(",") }),
);

// ---------------------------------------------------------------------------
// 10. get_album
// ---------------------------------------------------------------------------

const getAlbum = defineTool(
  "get_album",
  "Returns album details including track listing.",
  z.object({
    album_id: z.string().describe("Spotify album ID"),
  }),
  async (client, params) => client.get(`/albums/${params.album_id}`),
);

// ---------------------------------------------------------------------------
// 11. get_user_playlists
// ---------------------------------------------------------------------------

const getUserPlaylists = defineTool(
  "get_user_playlists",
  "Returns the current user's playlists.",
  z.object({
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of playlists to return (1-50)"),
    offset: z.number().int().min(0).optional().default(0).describe("Pagination offset"),
  }),
  async (client, params) =>
    client.get("/me/playlists", {
      limit: String(params.limit),
      offset: String(params.offset),
    }),
);

// ---------------------------------------------------------------------------
// 12. get_playlist
// ---------------------------------------------------------------------------

const getPlaylist = defineTool(
  "get_playlist",
  "Returns a specific playlist with its tracks.",
  z.object({
    playlist_id: z.string().describe("Spotify playlist ID"),
  }),
  async (client, params) => client.get(`/playlists/${params.playlist_id}`),
);

// ---------------------------------------------------------------------------
// 13. create_playlist
// ---------------------------------------------------------------------------

const createPlaylist = defineTool(
  "create_playlist",
  "Creates a new playlist for the current user.",
  z.object({
    name: z.string().describe("Playlist name"),
    description: z.string().optional().default("").describe("Optional playlist description"),
    public: z.boolean().optional().default(true).describe("Whether the playlist is public"),
  }),
  async (client, params) => {
    const userId = await client.getUserId();
    return client.post(`/users/${userId}/playlists`, {
      name: params.name,
      description: params.description,
      public: params.public,
    });
  },
);

// ---------------------------------------------------------------------------
// 14. add_tracks_to_playlist
// ---------------------------------------------------------------------------

const addTracksToPlaylist = defineTool(
  "add_tracks_to_playlist",
  "Adds tracks to an existing playlist.",
  z.object({
    playlist_id: z.string().describe("Spotify playlist ID"),
    track_uris: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe("Array of Spotify track URIs (e.g. spotify:track:xxx), max 100"),
    position: z.number().int().min(0).optional().describe("Position to insert tracks at (0-based)"),
  }),
  async (client, params) => {
    const body: Record<string, unknown> = { uris: params.track_uris };
    if (params.position !== undefined) body.position = params.position;
    return client.post(`/playlists/${params.playlist_id}/tracks`, body);
  },
);

// ---------------------------------------------------------------------------
// Master exports
// ---------------------------------------------------------------------------

const allTools: Tool[] = [
  getUserProfile,
  getTopItems,
  getRecentlyPlayed,
  getSavedTracks,
  getFollowedArtists,
  search,
  getArtistTopTracks,
  getTracks,
  getArtists,
  getAlbum,
  getUserPlaylists,
  getPlaylist,
  createPlaylist,
  addTracksToPlaylist,
];

/** Tool definitions formatted for the Anthropic tools API. */
export const spotifyTools: ToolDefinition[] = allTools.map((t) => t.definition);

const toolMap = new Map<string, Tool>(allTools.map((t) => [t.definition.name, t]));

/** Execute a tool by name with the given params. Throws if the tool name is unknown. */
export async function executeTool(
  client: SpotifyClient,
  toolName: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const tool = toolMap.get(toolName);
  if (!tool) {
    throw new Error(`Unknown Spotify tool: ${toolName}`);
  }
  return tool.execute(client, params);
}

export type { ToolDefinition, SpotifyClient };
