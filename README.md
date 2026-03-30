# Spotify Generative UI

A proof-of-concept where you explore your Spotify data through natural language. Instead of static dashboards, an AI generates custom, interactive web pages on the fly for each query.

Ask about your top artists and get an image grid. Ask about listening history and get a timeline. The AI decides the layout, not a template.

**[Try it →](https://spotifyui-iota.vercel.app)**

## How it works

1. Paste your Spotify `sp_dc` browser cookie to connect
2. Ask questions about your music
3. Get a custom-designed page for each answer

## Privacy & API Keys

This is a proof-of-concept. Your Spotify session is held in server memory for the duration of your visit and is not persisted to any database or disk. A `sessionId` is stored in your browser's localStorage to maintain your session across page refreshes.

| What | Where it lives | Details |
|------|---------------|---------|
| Spotify `sp_dc` cookie | Server memory (session) | You paste this once. It's held in server memory to make API calls on your behalf. Sessions expire after 1 hour of inactivity. |
| MiniMax AI | Server | A shared key is provided for up to **5 runs per day**. After that, bring your own. |
| Bring Your Own Key | Your browser (localStorage) | You can add your own MiniMax or Anthropic API key in Settings. Stored in your browser, sent per-request. Bypasses the daily limit. |

## Third-party dependencies

Spotify's token exchange requires a TOTP challenge with a secret that Spotify rotates periodically. This app fetches the current secret from [ThetaDev/spotify-secrets](https://code.thetadev.de/ThetaDev/spotify-secrets), a third-party repository that tracks these rotations. A hardcoded fallback is included for when the remote fetch fails. This is the same approach used by [spogo](https://github.com/steipete/spogo) and other unofficial Spotify clients.

This app uses Spotify's internal web API (not the official Developer API). It is not endorsed by or affiliated with Spotify.

## Credits

Spotify API integration inspired by [spogo](https://github.com/steipete/spogo) by [@steipete](https://github.com/steipete).

## Tech Stack

Next.js 16 · React 19 · Tailwind CSS · Anthropic Claude / MiniMax

## License

MIT
