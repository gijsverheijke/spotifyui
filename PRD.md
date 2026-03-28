# Spotify Generative UI — Product Requirements Document

## Vision

A proof-of-concept web application where users interact through natural language to explore their Spotify data. Instead of static dashboards, an AI generates **custom, interactive web pages on the fly** in response to each query — think v0, but built into a focused Spotify experience.

The core thesis: **different questions produce genuinely different pages**. A request about top artists yields an image grid, a listening history question yields a timeline, a playlist request yields a track list builder. The AI decides the layout, not a template.

## User Stories

### Authentication

**US-1: Connect Spotify account**
As a user, I want to connect my Spotify account by pasting my `sp_dc` cookie so I can start asking questions about my music.
- Acceptance: User pastes cookie → app validates it by fetching profile → shows welcome with display name and avatar
- Error: Invalid/expired cookie shows clear instructions on how to get a fresh one

**US-2: Stay connected across page refreshes**
As a user, I want my session to persist so I don't have to re-paste my cookie every time I reload the page.
- Acceptance: Cookie stored in server-side session, survives browser refresh
- Error: Expired session prompts re-authentication with helpful message

### Exploring Listening Data

**US-3: See my top artists**
As a user, I want to ask "What are my top artists?" and see a visually rich page with artist images, names, and how they rank.
- Acceptance: AI generates a page with artist cards (images, names). Layout varies — could be a grid, ranked list, or poster wall depending on how the AI interprets the query.
- Variations: "top artists this month" vs "all time favorites" should produce different results (short_term vs long_term)

**US-4: See my top tracks**
As a user, I want to ask "What songs have I been playing the most?" and get a visual page of my most-played tracks.
- Acceptance: AI generates page showing tracks with album art, artist names, and track names. Could be a chart, list, or card layout.

**US-5: View my recent listening history**
As a user, I want to ask "What have I been listening to lately?" and see a timeline or history of recent tracks.
- Acceptance: AI generates a chronological view of recently played tracks with timestamps, album art, and artist info.

**US-6: Browse my liked songs**
As a user, I want to ask "Show me my liked songs" and see my saved library.
- Acceptance: AI generates a browsable view of saved tracks.

**US-7: See my followed artists**
As a user, I want to ask about artists I follow and see them displayed visually.
- Acceptance: AI generates a page showing followed artists with images and names.

**US-8: Compare my taste across time periods**
As a user, I want to ask "How has my taste changed?" and see a comparison of my short-term vs long-term top artists/tracks.
- Acceptance: AI calls `get_top_items` with multiple time ranges and generates a side-by-side or comparative layout.

### Discovery & Search

**US-9: Search for music**
As a user, I want to ask "Find me some jazz albums" or "What albums has Radiohead released?" and see search results presented beautifully.
- Acceptance: AI uses search tool and generates results with album art, track listings, or artist info depending on the query.

**US-10: Explore an artist**
As a user, I want to ask "Tell me about Kendrick Lamar" and get a rich artist profile page.
- Acceptance: AI fetches artist info + top tracks and generates a profile page with image, top tracks, and any available metadata.

**US-11: AI-powered recommendations**
As a user, I want to ask "What should I listen to while cooking?" and get music suggestions based on my taste.
- Acceptance: AI analyzes my top artists/tracks, infers genres and mood, uses search to find fitting music, and generates a recommendation page. The AI is the recommendation engine — it uses my data + its knowledge of music to suggest tracks.

### Playlist Management

**US-12: Create a playlist from a description**
As a user, I want to say "Make me a playlist for a road trip" and have the AI create an actual Spotify playlist.
- Acceptance: AI determines fitting tracks (using my taste + search), creates a playlist via API, adds tracks, and generates a page showing the result with a link to open it in Spotify.

**US-13: Create a playlist from specific criteria**
As a user, I want to say "Make a playlist of my top 20 tracks this month" and have it created.
- Acceptance: AI fetches my top tracks (short_term), creates a playlist, adds them, and shows the result.

### Profile & Overview

**US-14: See my Spotify profile overview**
As a user, I want to ask "Show me my profile" or just start a session and see a dashboard-like overview of my Spotify account.
- Acceptance: AI generates a page combining profile info, top artists, recent tracks — a personalized dashboard.

**US-15: View my playlists**
As a user, I want to ask "Show me my playlists" and browse them visually.
- Acceptance: AI generates a grid/list of user's playlists with cover images and track counts.

### Conversational

**US-16: Ask follow-up questions**
As a user, I want to ask follow-up questions that reference previous results, like "Make a playlist from those artists" after seeing my top artists.
- Acceptance: AI maintains conversation context and can reference data from previous tool calls.

**US-17: Get a different layout**
As a user, I want to say "Show that as a table instead" or "Make it more compact" and have the AI regenerate with a different layout.
- Acceptance: AI regenerates the page using the same data but with the requested layout changes.

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│              (Next.js App Router)                │
│                                                  │
│  ┌──────────┐    ┌───────────────────────────┐  │
│  │ Chat UI  │───>│  Generated Page Renderer  │  │
│  │ (input)  │    │  (sandboxed HTML/CSS)     │  │
│  └──────────┘    └───────────────────────────┘  │
└────────────────────────┬────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────┐
│                  Backend API                     │
│             (Next.js API Routes)                 │
│                                                  │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │ AI Orchestr. │───>│  Spotify Tool Layer   │  │
│  │ (Claude API) │    │  (wrapped endpoints)  │  │
│  └──────────────┘    └───────────────────────┘  │
└────────────────────────┬────────────────────────┘
                         │
                         ▼
              ┌───────────────────┐
              │  Spotify Internal  │
              │  APIs + Web API    │
              │ (cookie-based auth)│
              └───────────────────┘
```

### Components

**1. Frontend — Next.js App Router**
- Cookie input screen for first-time connection
- Chat input where users type natural-language queries
- A renderer that displays the AI-generated pages (HTML + Tailwind CSS)
- Conversation history sidebar

**2. Backend — Next.js API Routes**
- **AI orchestration**: Sends user query + available tools to Claude API. Claude decides which Spotify data to fetch, fetches it via tools, then generates a page.
- **Spotify tool layer**: A set of well-defined tools that wrap Spotify API endpoints. The AI calls these tools to fetch data, then uses the results to generate UI.
- **Token management**: Uses the `sp_dc` cookie to obtain and refresh access tokens via `open.spotify.com/api/token`.

**3. Generated UI**
- AI returns self-contained HTML with Tailwind CSS
- Rendered in a sandboxed iframe on the frontend
- Can include interactive elements (expandable sections, tabs, sorting)

## Authentication

### Cookie-Based Auth (spogo approach)

Instead of Spotify's official OAuth (which limits new apps to 5 allowlisted users), we use the same approach as [spogo](https://github.com/steipete/spogo): authenticate using the user's `sp_dc` browser cookie.

**How it works:**
1. User opens Spotify Web Player (`open.spotify.com`) and logs in
2. User copies their `sp_dc` cookie from browser DevTools
3. User pastes it into our app
4. Backend uses the cookie to obtain an access token via `GET https://open.spotify.com/api/token`
5. Access token is used for all subsequent API calls
6. Token refreshed automatically when it expires

**Why this approach:**
- No Spotify Developer App registration needed
- No 5-user allowlist — anyone with a Spotify account can use it
- Access to the same endpoints the web player uses
- Good enough for a proof of concept

**Tradeoffs:**
- Cookie expires periodically — user may need to re-paste
- Uses undocumented internal APIs — could break without notice
- Against Spotify's ToS — acceptable for a personal PoC, not for production
- Requires user to use DevTools (fine for a tech demo)

## Spotify Tool Layer

The AI interacts with Spotify through a defined set of tools. Each tool wraps one or more Spotify API endpoints and returns structured data.

### Tool Definitions

#### `get_user_profile`
Returns the current user's display name, country, subscription type, follower count, and profile image.

**API:** `GET /me`

---

#### `get_top_items`
Returns the user's top artists or tracks for a given time range.

**Parameters:**
- `type`: `"artists"` | `"tracks"`
- `time_range`: `"short_term"` (~4 weeks) | `"medium_term"` (~6 months) | `"long_term"` (~1 year)
- `limit`: 1–50 (default 20)

**API:** `GET /me/top/{type}`

---

#### `get_recently_played`
Returns the user's recently played tracks with timestamps.

**Parameters:**
- `limit`: 1–50 (default 20)
- `before` / `after`: Unix timestamp in ms (cursor pagination)

**API:** `GET /me/player/recently-played`

---

#### `get_saved_tracks`
Returns tracks from the user's "Liked Songs" library.

**Parameters:**
- `limit`: 1–50 (default 20)
- `offset`: pagination offset

**API:** `GET /me/tracks`

---

#### `get_followed_artists`
Returns artists the user follows.

**Parameters:**
- `limit`: 1–50 (default 20)
- `after`: cursor for pagination

**API:** `GET /me/following?type=artist`

---

#### `search`
Searches the Spotify catalog for tracks, artists, albums, or playlists.

**Parameters:**
- `query`: search string (supports field filters like `artist:`, `genre:`, `year:`)
- `types`: array of `"track"` | `"artist"` | `"album"` | `"playlist"`
- `limit`: 1–50 (default 10)

**API:** `GET /search`

---

#### `get_artist_top_tracks`
Returns an artist's most popular tracks.

**Parameters:**
- `artist_id`: Spotify artist ID

**API:** `GET /artists/{id}/top-tracks`

---

#### `get_tracks`
Returns detailed info for one or more tracks (batch).

**Parameters:**
- `track_ids`: array of Spotify track IDs (max 20)

**API:** `GET /tracks?ids=`

---

#### `get_artists`
Returns detailed info for one or more artists (batch).

**Parameters:**
- `artist_ids`: array of Spotify artist IDs (max 20)

**API:** `GET /artists?ids=`

---

#### `get_album`
Returns album details including track listing.

**Parameters:**
- `album_id`: Spotify album ID

**API:** `GET /albums/{id}`

---

#### `get_user_playlists`
Returns the current user's playlists.

**Parameters:**
- `limit`: 1–50 (default 20)
- `offset`: pagination offset

**API:** `GET /me/playlists`

---

#### `get_playlist`
Returns a specific playlist with its tracks.

**Parameters:**
- `playlist_id`: Spotify playlist ID

**API:** `GET /playlists/{id}`

---

#### `create_playlist`
Creates a new playlist for the current user.

**Parameters:**
- `name`: playlist name (required)
- `description`: optional description
- `public`: boolean (default true)

**API:** `POST /me/playlists`

---

#### `add_tracks_to_playlist`
Adds tracks to an existing playlist.

**Parameters:**
- `playlist_id`: Spotify playlist ID
- `track_uris`: array of Spotify track URIs (max 100)
- `position`: optional insert position

**API:** `POST /playlists/{id}/tracks`

## AI Page Generation

### How It Works

1. User sends a message (e.g., "Show me my top artists this month")
2. Backend sends to Claude with the system prompt + tool definitions
3. Claude decides which tools to call (e.g., `get_top_items(type="artists", time_range="short_term")`)
4. Backend executes the tool calls against Spotify API
5. Claude receives the data and generates an HTML page with Tailwind CSS
6. Frontend renders the generated page in a sandboxed iframe

### Design Philosophy

The generated UI should not look like a generic SaaS dashboard. **The design should match the data.** This is what makes it generative UI, not just "fill a template with data."

The AI should adapt the visual identity of each page to the content:
- **Color palette**: Derived from the mood/genre of the music. French chanson? Muted blues, cream, serif typography. Speed metal? Black, red, aggressive angles. Jazz? Warm tones, smoky gradients, elegant spacing.
- **Typography feel**: Playful for pop, refined for classical, bold for hip-hop. Use Google Fonts via CDN to vary typefaces.
- **Layout style**: Not everything is a card grid. Use magazine layouts, poster-style compositions, asymmetric designs, bold hero sections. Let the data shape the structure.
- **Charts**: Use ECharts for data visualizations — heatmap calendars for listening history, treemaps for genre distribution, radar charts for taste profiles, gauge charts for intensity. Style charts to match the page theme.
- **Imagery**: Use album art and artist images prominently. Let them bleed, overlap, or dominate — not just sit in neat squares.

The goal: every page should feel like it was designed specifically for that query and that data. Two different users asking the same question should get pages that feel different because their data is different.

### System Prompt (concept)

The AI is instructed to:
- Analyze the user's request and decide which data to fetch
- Call the appropriate Spotify tools to gather data
- Generate a single-page HTML response that is visually striking and thematically matched to the content
- Follow the design philosophy above — adapt colors, typography, layout, and chart style to the music/data
- Use ECharts (loaded via CDN) for any data visualizations
- Use Tailwind CSS (loaded via CDN) for layout and styling
- Use Google Fonts (loaded via CDN) to vary typography per theme
- Include interactive elements where appropriate (tabs, expandable sections, hover effects, chart tooltips)
- Never hallucinate data — only use what the tools return
- For recommendation requests: analyze the user's taste from their data and use its own knowledge of music + search to find fitting tracks

### Output Format

The AI returns a code block containing an HTML page that:
- Uses Tailwind CSS + ECharts + Google Fonts (all loaded via CDN)
- Embeds the fetched Spotify data directly (images, names, URIs)
- Is self-contained (no dependencies beyond CDN scripts)
- Has a unique visual identity that matches the data and query
- Renders responsively
- Links back to Spotify where appropriate (track/artist/album URIs)

## MVP Scope

### In Scope
- Cookie-based Spotify authentication (sp_dc)
- Chat interface with message history (in-memory, single session)
- AI-generated pages for:
  - User profile overview
  - Top artists/tracks (all time ranges)
  - Recently played history
  - Saved/liked tracks browsing
  - Search and discovery
  - Artist profiles with top tracks
  - Playlist browsing
  - Playlist creation from natural language descriptions
  - AI-powered recommendations (using taste data + search)
  - Comparative views (taste over time)
- Tailwind-styled generated pages in sandboxed iframe
- Conversation context for follow-up questions
- Token refresh handling

### Out of Scope (Future)
- Persistent conversation history (database)
- Streaming AI responses (start with full-page generation)
- Playback control
- Browser extension for automatic cookie extraction
- Audio features / analysis (not available via accessible endpoints)
- Mobile-optimized UI
- Multiple simultaneous sessions

## Multi-Model Support

The backend supports two AI providers, selectable per request or via configuration:

| Provider | Model | Use case |
|----------|-------|----------|
| Anthropic | Claude Sonnet 4.6 | Higher quality generation, better design sense |
| Minimax | M2.7 | Cost-effective alternative |

Both providers are called through a common interface. The orchestrator abstracts the API differences (message format, tool calling conventions) so the Spotify tool layer and prompt logic are shared. A model selector in the UI lets the user pick which model to use.

## Constraints & Considerations

### No Recommendations or Audio Features
The Spotify `/recommendations` and `/audio-features` endpoints are not available. The AI compensates by:
- Using the user's top artists/tracks to understand taste
- Leveraging its own knowledge of music (genres, moods, similar artists)
- Using search with targeted queries to find fitting tracks
- This is actually a feature: the AI's reasoning about "what fits" is more transparent than a black-box algorithm

### Cookie Expiry
The `sp_dc` cookie has a limited lifetime. When it expires:
- API calls will return 401 errors
- The app should detect this and prompt the user to re-authenticate
- Display clear instructions for obtaining a fresh cookie

### Rate Limits
- Internal APIs may have different rate limits than the official API
- Implement retry logic with backoff for failed requests
- Use batch endpoints where possible to minimize calls

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (CDN, in generated pages) |
| Charts | Apache ECharts (CDN, in generated pages) |
| Typography | Google Fonts (CDN, in generated pages) |
| AI | Claude Sonnet 4.6 (Anthropic API) + Minimax M2.7 (Minimax API) |
| Auth | Cookie-based (sp_dc) via open.spotify.com/api/token |
| Generated UI rendering | Sandboxed iframe |
| State | React state (in-memory for MVP) |

## File Structure (planned)

```
spotifyui/
├── src/
│   ├── app/
│   │   ├── page.tsx                 # Main chat + generated UI page
│   │   ├── layout.tsx               # Root layout
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── token/route.ts   # Exchange sp_dc cookie for access token
│   │   │   ├── chat/route.ts        # Main AI chat endpoint
│   │   │   └── spotify/             # Spotify API proxy routes
│   │   └── globals.css
│   ├── lib/
│   │   ├── spotify/
│   │   │   ├── client.ts            # Spotify API client (cookie-based auth)
│   │   │   ├── tools.ts             # Tool definitions for AI
│   │   │   └── types.ts             # Spotify type definitions
│   │   ├── ai/
│   │   │   ├── orchestrator.ts      # Model-agnostic orchestration
│   │   │   ├── providers/
│   │   │   │   ├── anthropic.ts     # Claude Sonnet 4.6 provider
│   │   │   │   └── minimax.ts       # Minimax M2.7 provider
│   │   │   └── prompts.ts           # System prompts + design guidelines
│   │   └── auth/
│   │       └── session.ts           # Cookie/token session management
│   └── components/
│       ├── Chat.tsx                  # Chat input + message list
│       ├── GeneratedPage.tsx         # Sandboxed iframe renderer
│       └── CookieInput.tsx          # sp_dc cookie input screen
├── .env.local                        # ANTHROPIC_API_KEY, MINIMAX_API_KEY
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```
