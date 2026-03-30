# Pathfinder API Research

## Key Finding
Spotify's web player does NOT use `api.spotify.com/v1/` REST API. It uses `api-partner.spotify.com/pathfinder/v2/query` (GraphQL with persisted queries). The REST API returns 429 for web player tokens — this is a BLOCK, not a rate limit.

## How It Works
- All requests go to `POST https://api-partner.spotify.com/pathfinder/v2/query`
- Uses persisted queries: you send `operationName` + `sha256Hash` + `variables`
- Same auth: `Authorization: Bearer <token>`, `Client-Token`, `Spotify-App-Version`
- Parameters go in query string AND body

## Required Headers
```
authorization: Bearer <access_token>
client-token: <client_token>
spotify-app-version: 1.2.87.216.g698d3563
app-platform: WebPlayer
accept: application/json
content-type: application/json;charset=UTF-8
accept-language: en
```

## Operation Hashes (captured from live browser, 2026-03-28)
NOTE: These hashes change when Spotify deploys new versions. For robustness, scrape them from the web player JS bundle (like spogo does).

```typescript
const OPERATION_HASHES: Record<string, string> = {
  "accountAttributes": "3030aeca7614b9e00b728c91383fff23d1a7c2982929dc5c9db3dc35e2e5c0be",
  "areEntitiesInLibrary": "134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed",
  "fetchEntitiesForRecentlyPlayed": "5bb408450626d595cb24363104b612e14f9b966430f599121696e8996ea03794",
  "fetchExtractedColors": "36e90fcaea00d47c695fce31874efeb2519b97d4cd0ee1abfb4f8dc9348596ea",
  "fetchLibraryTracks": "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240",
  "fetchPlaylist": "30d415ed189d2699051b60bd0b17ea06467a01bc26d44e8058975e37e9f5fbf6",
  "fetchPlaylistContents": "30d415ed189d2699051b60bd0b17ea06467a01bc26d44e8058975e37e9f5fbf6",
  "fetchPlaylistMetadata": "30d415ed189d2699051b60bd0b17ea06467a01bc26d44e8058975e37e9f5fbf6",
  "home": "3e8e118c033b10353783ec0404451de66ed44e5cb5e0caefc65e4fab7b9e0aef",
  "isCurated": "e4ed1f91a2cc5415befedb85acf8671dc1a4bf3ca1a5b945a6386101a22e28a6",
  "libraryV3": "973e511ca44261fda7eebac8b653155e7caee3675abb4fb110cc1b8c78b091c3",
  "playlistPermissions": "f4c99a92059b896b9e4e567403abebe666c0625a36286f9c2bb93961374a75c6",
  "profileAttributes": "53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced",
  "searchDesktop": "841750deaa0a25991df1437c43b1c7188da731ca311039581a6543c96dd07dfa",
};
```

## Request Format
```
POST /pathfinder/v2/query?operationName=searchDesktop&variables={...}&extensions={"persistedQuery":{"version":1,"sha256Hash":"..."}}
```

Variables are URL-encoded JSON in the query string.

## Example: searchDesktop
```json
{
  "operationName": "searchDesktop",
  "variables": {
    "searchTerm": "radiohead",
    "offset": 0,
    "limit": 10,
    "numberOfTopResults": 5,
    "includeAudiobooks": true,
    "includeArtistHasConcertsField": false,
    "includePreReleases": true,
    "includeAuthors": false
  },
  "extensions": {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "841750deaa0a25991df1437c43b1c7188da731ca311039581a6543c96dd07dfa"
    }
  }
}
```

## Example: home (includes personalized content)
```json
{
  "variables": {
    "homeEndUserIntegration": "INTEGRATION_WEB_PLAYER",
    "timeZone": "Asia/Singapore",
    "sp_t": "<sp_t_cookie>",
    "facet": "",
    "sectionItemsLimit": 10
  }
}
```

## What Operations Are Available
- **searchDesktop** — search for tracks, artists, albums, playlists
- **libraryV3** — user's library (Songs, Playlists, Albums, Artists, Podcasts)
- **fetchPlaylistMetadata/fetchPlaylistContents** — playlist details + tracks
- **fetchLibraryTracks** — liked songs
- **fetchEntitiesForRecentlyPlayed** — recently played items
- **home** — home feed with personalized sections
- **profileAttributes** — user profile info
- **areEntitiesInLibrary** — check if items are in library

## What's NOT available via Pathfinder
- **Top artists/tracks** (no equivalent of /v1/me/top/) — would need to compute from listening history
- Direct REST endpoints like /v1/me, /v1/me/player

## Hash Resolution
Hashes change with Spotify deploys. Spogo resolves them by:
1. Fetch `https://open.spotify.com/` HTML
2. Find the main JS bundle URL
3. Search JS source for operation name + adjacent sha256 hash
See `/tmp/spogo/internal/spotify/connect_hash.go` for implementation.

## Reference
- Spogo pathfinder client: `/tmp/spogo/internal/spotify/connect_pathfinder.go`
- Spogo hash resolver: `/tmp/spogo/internal/spotify/connect_hash.go`
- Spogo search: `/tmp/spogo/internal/spotify/connect_search.go`
- Spogo library: `/tmp/spogo/internal/spotify/connect_library.go`
