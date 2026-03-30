# Spotify Generative UI

A proof-of-concept where you explore your Spotify data through natural language. Instead of static dashboards, an AI generates custom, interactive web pages on the fly for each query.

Ask about your top artists and get an image grid. Ask about listening history and get a timeline. Ask to create a playlist and get a track list builder. The AI decides the layout, not a template.

**[Try it →](https://spotifyui.vercel.app)**

## How it works

1. Paste your Spotify `sp_dc` browser cookie to connect
2. Ask questions about your music
3. Get a custom-designed page for each answer

## Privacy & API Keys

**No data is stored by us.** Your Spotify session lives in an encrypted cookie in your browser and is never persisted server-side.

| What | Where it lives | Details |
|------|---------------|---------|
| Spotify `sp_dc` cookie | Your browser (encrypted session cookie) | You grab this from your own browser. We validate it, use it to fetch your data, and that's it. |
| MiniMax AI | Server | A shared key is provided for up to **5 runs per day**. After that, bring your own. |
| Bring Your Own Key | Your browser (localStorage) | You can add your own MiniMax or Anthropic API key in Settings. It's stored in your browser only and sent per-request. Bypasses the daily limit. |

## Credits

Spotify API integration inspired by [spogo](https://github.com/steipete/spogo) by [@steipete](https://github.com/steipete).

## Tech Stack

Next.js 15 · React 19 · Tailwind CSS · Anthropic Claude / MiniMax

## License

MIT
