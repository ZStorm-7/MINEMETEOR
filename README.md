# FindCraft

A Minecraft knowledge agent + Minecraft-style website. No n8n: the agent runs inside this repo and works with
**any** AI provider, including a fully free self-hosted one.

## What it can look up
- **Any Minecraft wiki** - minecraft.wiki, Fandom, wiki.gg, Miraheze (e.g. Lifesteal)
- **Modrinth** - mods, resource packs, shaders, modpacks, datapacks
- **Mojang version data** - latest release/snapshot, release dates
- **Live server status** - is mc.hypixel.net online, players, version
- **Live web search** (Claude only) - SMP lore, creators, news
- **Whatever you teach it** - put `.md` files in [`knowledge/`](knowledge/README.md)

## 1. Pick an AI (one is enough)
| Option | Cost | Setup |
|---|---|---|
| **Ollama** (self-hosted) | free | `LLM_BASE_URL=http://ollama:11434/v1`, `LLM_MODEL=llama3.1` |
| **Gemini** free tier | free | `GEMINI_API_KEY` from <https://aistudio.google.com/apikey> |
| **Groq / OpenRouter / any OpenAI-style API** | free tiers | `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` |
| **Claude** | paid, best quality | `ANTHROPIC_API_KEY` from <https://console.anthropic.com> (`CLAUDE_MODEL=claude-haiku-5-5` is cheaper) |

Priority if several are set: Claude > OpenAI-compatible > Gemini. `AI_PROVIDER=claude|openai|gemini` forces one.
Small local models call tools less reliably than Claude/Gemini - use a tool-capable model (llama3.1+, qwen2.5+).

## 2. Self-host with Docker (recommended)
```bash
cp .env.example .env          # edit: choose your provider
docker compose up -d --build  # http://localhost:3000
```
With Ollama included (free, runs on your own machine/VPS):
```bash
docker compose --profile ollama up -d --build
docker compose exec ollama ollama pull llama3.1
```
Check it: `http://localhost:3000/api/health?live=1` should say `"live":"ok"`.
To put it on the internet, run it on a VPS and put a reverse proxy (Caddy/nginx) with HTTPS in front of port 3000.

## Without Docker
```bash
npm install
cp .env.example .env   # then export the variables, e.g.:  GEMINI_API_KEY=... node server.js
node server.js         # http://localhost:3000  (Node 20+)
```

## Vercel
Add the env vars (Settings -> Environment Variables), redeploy. `vercel.json` already bundles `knowledge/`.

## Teaching it more
Edit/add files in `knowledge/` (see its README). Personality lives in `lib/prompt.js` (documented in `agent/*.md`).
New lookup tools go in `lib/wiki.js` (one declaration + one function) and work for every provider.

## Layout
`public/` website | `api/` Vercel functions | `lib/agent.js` provider switch | `lib/{gemini,openai}.js` providers | `lib/wiki.js` tools | `n8n/` the old workflow, kept for reference
