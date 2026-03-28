# SpotifyUI — Task List

## Overview
Build a generative UI for Spotify per PRD.md. Multi-agent parallel execution where possible. All agents commit to `main` frequently.

**Repo:** `~/projects/spotifyui`
**Env:** `.env` has `SP_DC` and `MINIMAX_API_KEY` — never commit this.

---

## Phase 0: Project Scaffold (SEQUENTIAL — must complete before Phase 1)

### T0.1 — Initialize Next.js project
- `npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint`
- Run inside `~/projects/spotifyui` (already has PRD.md, .env, .gitignore)
- Add to `.gitignore`: `.env`, `.env.local`, `node_modules`, `.next`
- Install dependencies: `npm install`
- Verify `npm run dev` starts successfully
- Commit: "Initialize Next.js project with TypeScript and Tailwind"
- **Model:** default (any agent)
- **Agent:** Claude Code

### T0.2 — Install additional dependencies
- After T0.1 completes
- `npm install zod` (for tool param validation)
- No AI SDK — we call Anthropic/Minimax APIs directly via fetch
- Commit: "Add project dependencies"
- **Agent:** Claude Code

---

## Phase 1: Core Infrastructure (PARALLEL — after Phase 0)

All tasks in this phase can run simultaneously. They work on different directories/files.

### T1.1 — Spotify API Client + Token Management
**Files:** `src/lib/spotify/client.ts`, `src/lib/spotify/types.ts`, `src/lib/auth/session.ts`
- Implement `SpotifyClient` class that:
  - Takes `sp_dc` cookie
  - Calls `GET https://open.spotify.com/get_access_token?reason=transport&productType=web_player` with `Cookie: sp_dc=...` header to obtain access token
  - Note: use proper browser-like headers (User-Agent, etc.) since Spotify blocks plain curl — check spogo source at `/tmp/spogo/internal/spotify/` for reference
  - Caches access token, refreshes when expired
  - Makes authenticated requests to `https://api.spotify.com/v1/...`
  - Handles 401 (expired token → refresh → retry)
  - Handles rate limits (429 → retry with backoff)
- Define TypeScript types for all Spotify responses (see PRD tool section)
- `session.ts`: simple in-memory session store mapping session IDs → { sp_dc, accessToken, expiresAt, profile }
- Commit: "Add Spotify API client with token management"
- **Model:** default
- **Agent:** Claude Code

### T1.2 — Spotify Tool Definitions
**Files:** `src/lib/spotify/tools.ts`
- Define all 14 tools from PRD as a tools array compatible with both Anthropic and Minimax formats
- Each tool: name, description, input_schema (JSON Schema)
- Tools: `get_user_profile`, `get_top_items`, `get_recently_played`, `get_saved_tracks`, `get_followed_artists`, `search`, `get_artist_top_tracks`, `get_tracks`, `get_artists`, `get_album`, `get_user_playlists`, `get_playlist`, `create_playlist`, `add_tracks_to_playlist`
- Each tool also has an `execute(client: SpotifyClient, params: any)` function
- Commit: "Add Spotify tool definitions"
- **Model:** default
- **Agent:** Claude Code

### T1.3 — AI Provider Abstraction
**Files:** `src/lib/ai/orchestrator.ts`, `src/lib/ai/providers/minimax.ts`, `src/lib/ai/providers/anthropic.ts`, `src/lib/ai/prompts.ts`
- **CREATE A PLAN FIRST** — this is the brain of the app
  - Use a **chatroom** (sessions_spawn with mode="session") to design the orchestrator
  - Key decisions: message format abstraction, tool call/result format, streaming vs non-streaming, how generated HTML is extracted from response
  - **Chatroom model:** default (opus)
- Common interface: `AIProvider.chat(messages, tools, systemPrompt) → { text, toolCalls, html }`
- Minimax provider: calls `https://api.minimax.chat/v1/text/chatcompletion_v2` with model `MiniMax-M1`
  - Map tool definitions to Minimax format
  - Handle tool_call responses, execute tools, send results back
  - Loop until AI produces final HTML response
- Anthropic provider: calls Claude Sonnet 4.6 API
  - Standard Anthropic tool use format
  - Same loop logic
- `prompts.ts`: system prompt from PRD (design philosophy, output format, rules)
- Orchestrator: takes provider + tools + spotify client, runs the full loop:
  1. Send user message + tools to AI
  2. If AI requests tool calls → execute them via SpotifyClient → send results back
  3. Repeat until AI returns final HTML page
  4. Extract HTML from response (look for code block)
  5. Return { html, messages }
- Commit: "Add AI orchestrator with Minimax and Anthropic providers"
- **Model:** default
- **Agent:** Claude Code

### T1.4 — Frontend: Cookie Input + Chat UI + Iframe Renderer
**Files:** `src/components/CookieInput.tsx`, `src/components/Chat.tsx`, `src/components/GeneratedPage.tsx`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`
- **CREATE A PLAN FIRST** via chatroom
  - Design the UI layout: left sidebar (chat history) + main area (generated page) + bottom chat input
  - Cookie input as first screen
  - How to handle loading states (AI is generating...)
  - **Chatroom model:** default (opus)
- `CookieInput.tsx`: paste sp_dc cookie, submit, show validation status
- `Chat.tsx`: message input, message history, model selector dropdown (Minimax/Anthropic)
- `GeneratedPage.tsx`: sandboxed iframe that receives HTML string, renders it safely
  - Use `srcdoc` attribute for iframe
  - Sandbox: `allow-scripts allow-same-origin` (needed for ECharts)
  - Auto-resize iframe to content height
- `page.tsx`: orchestrates the three components
  - State: messages[], currentHtml, isLoading, isAuthenticated, selectedModel
  - Flow: cookie input → chat interface → generated pages
- Styling: clean, modern. The app chrome should be minimal — the generated pages are the star.
- Commit: "Add frontend components: cookie input, chat, iframe renderer"
- **Model:** default
- **Agent:** Claude Code

---

## Phase 2: API Routes + Integration (SEQUENTIAL within, PARALLEL where noted)

### T2.1 — Auth API Route
**Files:** `src/app/api/auth/token/route.ts`
- `POST /api/auth/token` — accepts `{ sp_dc }`, validates cookie by fetching profile, returns session ID + profile
- Uses session store from T1.1
- Commit: "Add auth API route"
- **Agent:** Claude Code

### T2.2 — Chat API Route (MAIN INTEGRATION)
**Files:** `src/app/api/chat/route.ts`
- `POST /api/chat` — accepts `{ message, sessionId, model }` 
- Gets SpotifyClient from session
- Runs orchestrator with selected provider
- Returns `{ html, messages }`
- This wires everything together: AI provider + tools + Spotify client
- Commit: "Add chat API route"
- **Agent:** Claude Code

### T2.3 — Wire Frontend to Backend
- Connect `CookieInput` to `/api/auth/token`
- Connect `Chat` to `/api/chat`
- Display generated HTML in iframe
- Handle errors gracefully
- Commit: "Wire frontend to backend APIs"
- **Agent:** Claude Code

---

## Phase 3: Testing + Polish (PARALLEL)

### T3.1 — End-to-End Smoke Test
- Start dev server
- Open browser
- Use the actual SP_DC cookie from .env
- Test: "Show me my profile" → verify generated page renders
- Test: "What are my top artists?" → verify artist images show
- Test: "Search for jazz albums" → verify search results
- Fix any issues found
- **Agent:** Claude Code (with browser access)

### T3.2 — Error Handling & Edge Cases
- Expired token handling
- Invalid cookie handling  
- AI returning malformed HTML
- Spotify API errors (rate limits, 500s)
- Empty results (new account with no history)
- Commit: "Improve error handling"
- **Agent:** Claude Code

### T3.3 — CLI Tool for Backend Testing
**Files:** `scripts/cli.ts`
- Simple Node.js script that:
  - Reads SP_DC from .env
  - Takes a query as CLI argument
  - Calls the orchestrator directly (not via API)
  - Prints the generated HTML to stdout or saves to file
  - Useful for testing without the browser
- Commit: "Add CLI testing tool"
- **Agent:** Claude Code

---

## Execution Order

```
Phase 0: T0.1 → T0.2
              ↓
Phase 1: T1.1 | T1.2 | T1.3 | T1.4  (all parallel)
              ↓
Phase 2: T2.1 → T2.2 → T2.3 (sequential, depends on all of Phase 1)
              ↓
Phase 3: T3.1 | T3.2 | T3.3 (parallel)
```

## Agent Guidelines

1. **Commit often** — after each logical unit of work, not just at the end
2. **Test locally** — run `npm run dev` and verify in browser where possible
3. **Check for conflicts** — before committing, `git pull` to avoid merge conflicts
4. **Reference PRD.md** — it's the source of truth for specs
5. **Don't hallucinate Spotify data** — use real API responses
6. **Use spogo as reference** — cloned at `/tmp/spogo/` for Spotify auth patterns (Go, but logic translates)
7. **Browser headers** — Spotify blocks plain requests. Use browser-like User-Agent and headers for the token endpoint.
