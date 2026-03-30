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
  "Returns the current user's Spotify profile including display name, follower count, and profile image.",
  z.object({}),
  async (client) => client.getUserProfile(),
);

// ---------------------------------------------------------------------------
// 2. get_top_items
// ---------------------------------------------------------------------------

const getTopItems = defineTool(
  "get_top_items",
  "Returns the user's personalized content from their Spotify home feed. NOTE: Exact top artists/tracks rankings are not available via the web player API — this returns personalized sections (mixes, recently played, etc.) as the best approximation.",
  z.object({
    type: z.enum(["artists", "tracks"]).describe("Whether to fetch top artists or top tracks"),
    time_range: z
      .enum(["short_term", "medium_term", "long_term"])
      .optional()
      .default("medium_term")
      .describe("Time range hint (approximated from home feed)"),
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
  }),
  async (client, params) =>
    client.getTopItems(params.type, params.time_range, params.limit),
);

// ---------------------------------------------------------------------------
// 3. get_recently_played
// ---------------------------------------------------------------------------

const getRecentlyPlayed = defineTool(
  "get_recently_played",
  "Returns the user's recently played tracks.",
  z.object({
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
  }),
  async (client, params) => client.getRecentlyPlayed(params.limit),
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
    client.getSavedTracks(params.limit, params.offset),
);

// ---------------------------------------------------------------------------
// 5. get_followed_artists
// ---------------------------------------------------------------------------

const getFollowedArtists = defineTool(
  "get_followed_artists",
  "Returns artists the user follows (from their library).",
  z.object({
    limit: z.number().int().min(1).max(50).optional().default(20).describe("Number of items to return (1-50)"),
  }),
  async (client, params) =>
    client.getFollowedArtists(params.limit),
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
    client.search(params.query, params.types, params.limit),
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
  async (client, params) => client.getArtistTopTracks(params.artist_id),
);

// ---------------------------------------------------------------------------
// 8. get_tracks
// ---------------------------------------------------------------------------

const getTracks = defineTool(
  "get_tracks",
  "Returns detailed info for one or more tracks (max 20). Uses individual lookups.",
  z.object({
    track_ids: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe("Array of Spotify track IDs (max 20)"),
  }),
  async (client, params) => client.getTracks(params.track_ids),
);

// ---------------------------------------------------------------------------
// 9. get_artists
// ---------------------------------------------------------------------------

const getArtists = defineTool(
  "get_artists",
  "Returns detailed info for one or more artists (max 20). Uses individual lookups.",
  z.object({
    artist_ids: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe("Array of Spotify artist IDs (max 20)"),
  }),
  async (client, params) => client.getArtists(params.artist_ids),
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
  async (client, params) => client.getAlbum(params.album_id),
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
    client.getUserPlaylists(params.limit, params.offset),
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
  async (client, params) => client.getPlaylist(params.playlist_id),
);

// ---------------------------------------------------------------------------
// 13. create_playlist
// ---------------------------------------------------------------------------

const createPlaylist = defineTool(
  "create_playlist",
  "Creates a new playlist on the user's Spotify account and optionally adds tracks to it.",
  z.object({
    name: z.string().describe("Name for the new playlist"),
    description: z.string().optional().describe("Optional description for the playlist"),
    track_uris: z
      .array(z.string())
      .optional()
      .describe("Optional array of Spotify track URIs (e.g. 'spotify:track:xxx') to add to the playlist"),
  }),
  async (client, params) =>
    client.createPlaylist(params.name, params.description, params.track_uris),
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
