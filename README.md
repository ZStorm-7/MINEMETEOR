# FINDCRAFT

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
Tested with FindCraft's real tools (crafting, versions, server status, mods):

| Option | Signup | Result in testing |
|---|---|---|
| **Pollinations** - **built in, the default**; nothing to configure | **none** | Works. Uses the tools; mostly right with `FINDCRAFT_STYLE=plain`; 7-90 s per answer; sometimes wrong on details. Public free service: no uptime promise, questions go to a third party. |
| **Groq** free tier: just set `GROQ_API_KEY` | 1 min, no card | Not tested yet (needs your key). Much bigger model, very fast. |
| **OpenRouter** `:free` models | 1 min, no card | Not tested yet. Free models have daily limits. |
| **Ollama** on a CPU-only machine (qwen2.5 3B / 7B) | none | Runs, but **not usable**: skipped the tools and made up recipes. Needs a GPU and a 14B+ model. |
| **Gemini** free tier (`GEMINI_API_KEY`) | Google account | Built in. |
| **Claude** (`ANTHROPIC_API_KEY`) | paid | Best quality, plus live web search. |

Priority if several are set: Claude > `GROQ_API_KEY` / `LLM_BASE_URL` > Gemini > Pollinations (built-in fallback). `AI_PROVIDER=claude|openai|gemini` forces one.
`FINDCRAFT_STYLE=plain|emoji` = calmer (up to ~6 lines, default for Pollinations/OpenAI-style models) or the original emoji-heavy style.
Free models are also forced to check the wiki before answering (`LLM_FORCE_LOOKUP=off` disables this); if one skips it, the server does the search for it.
`LOG_TOOLS=1` prints each lookup the model makes, so you can see whether it really checks the wiki.

## 2. Self-host with Docker (recommended)
```bash
docker compose up -d --build  # http://localhost:3000 - works with no .env at all (uses free Pollinations)
# optional: cp .env.example .env and pick another AI
```
With Ollama included (only worth it with a GPU, see the table):
```bash
docker compose --profile ollama up -d --build
docker compose exec ollama ollama pull qwen2.5:14b
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
