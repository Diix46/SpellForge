# Spellforge Coach — Eve agent

The conversational MTG deck coach, built on [Vercel Eve](https://eve.dev). It runs
as a **separate local service** that the Nuxt app proxies through `/api/coach/*`.

It never recalls cards from memory — it reasons over the deck and uses tools
(`scryfall_search`, `edhrec_suggestions`, `validate_cards`) so every card it names
is real, in the commander's colour identity, and Commander-legal.

## Run it (local)

Requires Node 24+ and an `ANTHROPIC_API_KEY` (direct Anthropic provider — no
Vercel account/AI Gateway needed).

```bash
cd agent-coach
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # gitignored
npm run build
ANTHROPIC_API_KEY=sk-ant-... PORT=3100 node .output/server/index.mjs
```

The Nuxt app talks to it at `EVE_COACH_URL` (default `http://127.0.0.1:3100`).
Set that env var in the Nuxt process to point elsewhere.

`npm run dev` is an interactive TUI; use the build+node command above for a
headless server. The production build does not auto-load `.env`, so pass the key
in the process environment.

## Structure

- `agent/agent.ts` — model config (direct Anthropic provider; `baseURL` pinned to
  `/v1` to work around a beta `@ai-sdk/anthropic` streaming-URL bug).
- `agent/instructions.md` — the coach's system prompt (the "never invent cards" contract).
- `agent/tools/` — `scryfall_search`, `edhrec_suggestions`, `validate_cards`.

Eve is in beta; APIs may change.
