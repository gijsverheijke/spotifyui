# SpotifyUI — Test Cases

## Unit Tests

### TC-1: Spotify Token Management
**File:** `src/lib/spotify/__tests__/client.test.ts`
- **TC-1.1**: `getAccessToken()` with valid sp_dc returns access token + expiry
- **TC-1.2**: `getAccessToken()` with expired sp_dc throws AuthenticationError
- **TC-1.3**: Token auto-refresh when expired (mock timer, verify re-fetch)
- **TC-1.4**: Concurrent requests during token refresh don't trigger multiple refreshes (dedup)
- **TC-1.5**: 429 response triggers retry with backoff
- **TC-1.6**: 401 response triggers token refresh then retry

### TC-2: Spotify Tool Execution
**File:** `src/lib/spotify/__tests__/tools.test.ts`
- **TC-2.1**: `get_user_profile` returns { display_name, country, product, followers, images }
- **TC-2.2**: `get_top_items(type="artists", time_range="short_term", limit=10)` returns array of 10 artists with { id, name, images, genres }
- **TC-2.3**: `get_top_items(type="tracks", time_range="long_term", limit=5)` returns 5 tracks with { id, name, album, artists }
- **TC-2.4**: `get_recently_played(limit=20)` returns items with { track, played_at }
- **TC-2.5**: `search(query="radiohead", types=["artist"])` returns matching artists
- **TC-2.6**: `get_artist_top_tracks(artist_id)` returns tracks array
- **TC-2.7**: `create_playlist(name, description)` returns playlist object with id
- **TC-2.8**: `add_tracks_to_playlist(playlist_id, track_uris)` succeeds
- **TC-2.9**: `get_saved_tracks(limit=10)` returns saved tracks
- **TC-2.10**: `get_followed_artists(limit=10)` returns followed artists
- **TC-2.11**: `get_user_playlists(limit=10)` returns playlists
- **TC-2.12**: Invalid params rejected by schema validation (zod)

### TC-3: AI Orchestrator
**File:** `src/lib/ai/__tests__/orchestrator.test.ts`
- **TC-3.1**: Simple query ("hi") → AI responds without tool calls → returns text (no HTML)
- **TC-3.2**: Data query ("top artists") → AI calls `get_top_items` → receives data → generates HTML
- **TC-3.3**: Multi-tool query ("compare my taste") → AI calls multiple tools → generates HTML
- **TC-3.4**: Tool call with invalid params → error sent back to AI → AI handles gracefully
- **TC-3.5**: AI response contains HTML code block → extracted correctly
- **TC-3.6**: Conversation context preserved across messages (follow-up questions)
- **TC-3.7**: Model switch mid-conversation works (Minimax → Anthropic)

### TC-4: Minimax Provider
**File:** `src/lib/ai/__tests__/minimax.test.ts`
- **TC-4.1**: Format messages correctly for Minimax API
- **TC-4.2**: Parse tool_call response correctly
- **TC-4.3**: Handle Minimax API errors (rate limit, auth failure)
- **TC-4.4**: Tool results sent back in correct format

### TC-5: Anthropic Provider
**File:** `src/lib/ai/__tests__/anthropic.test.ts`
- **TC-5.1**: Format messages correctly for Anthropic API
- **TC-5.2**: Parse tool_use blocks correctly
- **TC-5.3**: Handle Anthropic API errors
- **TC-5.4**: Tool results sent back as tool_result blocks

### TC-6: Session Management
**File:** `src/lib/auth/__tests__/session.test.ts`
- **TC-6.1**: Create session with sp_dc → returns session ID
- **TC-6.2**: Get session by ID → returns stored data
- **TC-6.3**: Invalid session ID → returns null
- **TC-6.4**: Session stores conversation messages for follow-ups

---

## Integration Tests

### TC-7: Auth Flow
**File:** `src/app/api/auth/__tests__/token.test.ts`
- **TC-7.1**: POST /api/auth/token with valid sp_dc → 200 + session ID + profile
- **TC-7.2**: POST /api/auth/token with invalid sp_dc → 401 + error message
- **TC-7.3**: POST /api/auth/token with missing body → 400

### TC-8: Chat API
**File:** `src/app/api/chat/__tests__/route.test.ts`
- **TC-8.1**: POST /api/chat with valid session + message → 200 + HTML
- **TC-8.2**: POST /api/chat with invalid session → 401
- **TC-8.3**: POST /api/chat with model="minimax" uses Minimax provider
- **TC-8.4**: POST /api/chat with model="anthropic" uses Anthropic provider

---

## End-to-End Tests (Manual / Browser)

### TC-9: Cookie Authentication
- **TC-9.1**: Paste valid sp_dc → see welcome screen with display name + avatar
- **TC-9.2**: Paste invalid cookie → see error with instructions
- **TC-9.3**: Refresh page → session persists (no re-auth needed)

### TC-10: Query → Generated Page
- **TC-10.1**: "Show me my profile" → page with display name, avatar, account type
- **TC-10.2**: "What are my top artists?" → page with artist images and names (verify images load)
- **TC-10.3**: "Top tracks this month" → page with track names, album art
- **TC-10.4**: "What have I been listening to lately?" → page with recent tracks + timestamps
- **TC-10.5**: "Search for jazz albums" → page with album results
- **TC-10.6**: "Tell me about Radiohead" → artist profile page
- **TC-10.7**: "Show me my playlists" → playlist grid with cover images

### TC-11: Generated Page Quality
- **TC-11.1**: Generated HTML is valid (no broken tags)
- **TC-11.2**: Tailwind CSS loads in iframe (styles applied)
- **TC-11.3**: ECharts renders when used (canvas elements present)
- **TC-11.4**: Images load (album art, artist photos — no broken images)
- **TC-11.5**: Links to Spotify work (open.spotify.com URIs)
- **TC-11.6**: Page is responsive (resize iframe width)

### TC-12: Playlist Creation
- **TC-12.1**: "Make me a chill playlist" → playlist created in Spotify account, page shows result
- **TC-12.2**: "Make a playlist of my top 10 tracks" → correct tracks added
- **TC-12.3**: Verify playlist exists in actual Spotify account after creation

### TC-13: Conversational Follow-ups
- **TC-13.1**: Ask "top artists" → then "make a playlist from those" → AI uses previous results
- **TC-13.2**: Ask "show that as a table" → AI regenerates with different layout
- **TC-13.3**: Ask "show more" → AI fetches more data (pagination)

### TC-14: Error Scenarios
- **TC-14.1**: Expired token mid-session → auto-refresh + retry (user doesn't see error)
- **TC-14.2**: Spotify API 500 → user sees friendly error, not a crash
- **TC-14.3**: AI generates broken HTML → iframe shows gracefully degraded content

---

## Test Infrastructure

- **Unit/Integration:** Jest or Vitest (whatever Next.js scaffolding provides)
- **Mocking:** Mock Spotify API responses for unit tests (don't hit real API in CI)
- **E2E:** Manual browser testing using real SP_DC cookie from .env
- **CLI:** `scripts/cli.ts` for quick backend-only testing

## Agents: Write Tests

Each coding agent should write tests for the code they produce. Specifically:
- T1.1 agent writes TC-1 and TC-6
- T1.2 agent writes TC-2
- T1.3 agent writes TC-3, TC-4, TC-5
- T2.1 agent writes TC-7
- T2.2 agent writes TC-8
- T3.1 agent runs TC-9, TC-10, TC-11
