// Spotify API response types

export interface SpotifyImage {
  url: string;
  height: number | null;
  width: number | null;
}

export interface SpotifyExternalUrls {
  spotify: string;
}

export interface SpotifyFollowers {
  href: string | null;
  total: number;
}

// User

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  email?: string;
  country?: string;
  product?: string;
  type: "user";
  uri: string;
  external_urls: SpotifyExternalUrls;
  followers: SpotifyFollowers;
  images: SpotifyImage[];
}

// Artist

export interface SpotifyArtist {
  id: string;
  name: string;
  type: "artist";
  uri: string;
  external_urls: SpotifyExternalUrls;
  followers: SpotifyFollowers;
  genres: string[];
  images: SpotifyImage[];
  popularity: number;
}

export interface SpotifyArtistSimplified {
  id: string;
  name: string;
  type: "artist";
  uri: string;
  external_urls: SpotifyExternalUrls;
}

// Album

export interface SpotifyAlbum {
  id: string;
  name: string;
  type: "album";
  album_type: "album" | "single" | "compilation";
  uri: string;
  external_urls: SpotifyExternalUrls;
  images: SpotifyImage[];
  artists: SpotifyArtistSimplified[];
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  total_tracks: number;
  tracks: SpotifyPaginatedResponse<SpotifyTrackSimplified>;
}

export interface SpotifyAlbumSimplified {
  id: string;
  name: string;
  type: "album";
  album_type: "album" | "single" | "compilation";
  uri: string;
  external_urls: SpotifyExternalUrls;
  images: SpotifyImage[];
  artists: SpotifyArtistSimplified[];
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  total_tracks: number;
}

// Track

export interface SpotifyTrack {
  id: string;
  name: string;
  type: "track";
  uri: string;
  external_urls: SpotifyExternalUrls;
  album: SpotifyAlbumSimplified;
  artists: SpotifyArtistSimplified[];
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  preview_url: string | null;
  track_number: number;
  disc_number: number;
  is_local: boolean;
}

export interface SpotifyTrackSimplified {
  id: string;
  name: string;
  type: "track";
  uri: string;
  external_urls: SpotifyExternalUrls;
  artists: SpotifyArtistSimplified[];
  duration_ms: number;
  explicit: boolean;
  track_number: number;
  disc_number: number;
}

// Playlist

export interface SpotifyPlaylist {
  id: string;
  name: string;
  type: "playlist";
  uri: string;
  external_urls: SpotifyExternalUrls;
  description: string | null;
  images: SpotifyImage[];
  owner: SpotifyUser;
  public: boolean | null;
  collaborative: boolean;
  followers: SpotifyFollowers;
  tracks: SpotifyPaginatedResponse<SpotifyPlaylistTrack>;
  snapshot_id: string;
}

export interface SpotifyPlaylistSimplified {
  id: string;
  name: string;
  type: "playlist";
  uri: string;
  external_urls: SpotifyExternalUrls;
  description: string | null;
  images: SpotifyImage[];
  owner: SpotifyUser;
  public: boolean | null;
  collaborative: boolean;
  tracks: { href: string; total: number };
  snapshot_id: string;
}

export interface SpotifyPlaylistTrack {
  added_at: string;
  added_by: { id: string; external_urls: SpotifyExternalUrls };
  is_local: boolean;
  track: SpotifyTrack;
}

// Paginated response

export interface SpotifyPaginatedResponse<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

// Cursor-based pagination (for recently played, followed artists)

export interface SpotifyCursorPaginatedResponse<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  cursors: { after: string | null; before: string | null } | null;
  total?: number;
}

// Recently played

export interface SpotifyPlayHistory {
  track: SpotifyTrack;
  played_at: string;
  context: {
    type: string;
    href: string;
    external_urls: SpotifyExternalUrls;
    uri: string;
  } | null;
}

// Saved track

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

// Search results

export interface SpotifySearchResult {
  tracks?: SpotifyPaginatedResponse<SpotifyTrack>;
  artists?: SpotifyPaginatedResponse<SpotifyArtist>;
  albums?: SpotifyPaginatedResponse<SpotifyAlbumSimplified>;
  playlists?: SpotifyPaginatedResponse<SpotifyPlaylistSimplified>;
}

// Token response from open.spotify.com/api/token

export interface SpotifyTokenResponse {
  accessToken: string;
  expiresIn: number;
  accessTokenExpirationTimestampMs: number;
  isAnonymous: boolean;
  clientId: string;
}

// Multiple items responses

export interface SpotifyTracksResponse {
  tracks: SpotifyTrack[];
}

export interface SpotifyArtistsResponse {
  artists: SpotifyArtist[];
}

export interface SpotifyArtistTopTracksResponse {
  tracks: SpotifyTrack[];
}

export type SpotifyCreatePlaylistResponse = SpotifyPlaylist;

export interface SpotifyAddTracksResponse {
  snapshot_id: string;
}

export interface SpotifyFollowedArtistsResponse {
  artists: SpotifyCursorPaginatedResponse<SpotifyArtist>;
}

// SpotifyClient interface used by tools.ts
// All data comes from api-partner.spotify.com/pathfinder (GraphQL).
// The REST API (api.spotify.com/v1/*) is blocked for web player tokens.

export interface SpotifyClient {
  getAccessToken(): Promise<string>;
  getUserId(): Promise<string>;
  getUserProfile(): Promise<unknown>;
  search(query: string, types: string[], limit?: number, offset?: number): Promise<unknown>;
  getTopItems(type: string, timeRange: string, limit: number): Promise<unknown>;
  getRecentlyPlayed(limit: number): Promise<unknown>;
  getSavedTracks(limit: number, offset: number): Promise<unknown>;
  getFollowedArtists(limit: number): Promise<unknown>;
  getUserPlaylists(limit: number, offset: number): Promise<unknown>;
  getPlaylist(playlistId: string): Promise<unknown>;
  getArtistTopTracks(artistId: string): Promise<unknown>;
  getTracks(ids: string[]): Promise<unknown>;
  getArtists(ids: string[]): Promise<unknown>;
  getAlbum(albumId: string): Promise<unknown>;
  createPlaylist(name: string, description?: string, trackUris?: string[]): Promise<unknown>;
}
