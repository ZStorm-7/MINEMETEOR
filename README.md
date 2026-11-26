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
Tested with FindCraft's real tools (crafting, versions, server status, mods):

| Option | Signup | Result in testing |
|---|---|---|
| **Pollinations** - **built in, the default**; nothing to configure | **none** | Works. Uses the tools; mostly right with `FINDCRAFT_STYLE=plain`; 7-90 s per answer; sometimes wrong on details. Public free service: no uptime promise, questions go to a third party. |
| **Groq** free tier: just set `GROQ_API_KEY` | 1 min, no card | Tested: **best free option.** 2-3 s per answer, called the right tool every time, all of crafting/versions/server/mod questions correct. Limit: 8,000 tokens/min (about 2-4 questions/min) and 1,000 requests/day; over the limit it waits and retries (slower) instead of failing. |
| **OpenRouter** `:free` models | 1 min, no card | Not tested yet. Free models have daily limits. |
| **Ollama** on a CPU-only machine (qwen2.5 3B / 7B) | none | Runs, but **not usable**: skipped the tools and made up recipes. Needs a GPU and a 14B+ model. |
| **Gemini** free tier (`GEMINI_API_KEY`) | Google account | Tested: works, answers in 1-4 s using `gemini-2.5-flash` and the wiki tools. **Free quota is small**: it ran out after about 5 questions in a minute (each question = 2+ calls), and daily limits apply. Fine for a few friends, too small for a busy public site. |
| **Claude** (`ANTHROPIC_API_KEY`) | paid | Best quality, plus live web search. |

Priority if several are set: Claude > `GROQ_API_KEY` / `LLM_BASE_URL` > Gemini > Pollinations (built-in fallback). `AI_PROVIDER=claude|openai|gemini` forces one.
`FINDCRAFT_STYLE=plain|emoji` = calmer (up to ~6 lines, default for Pollinations/OpenAI-style models) or the original emoji-heavy style.
Free models are also forced to check the wiki before answering (`LLM_FORCE_LOOKUP=off` disables this); if one skips it, the server does the search for it.
`LOG_TOOLS=1` prints each lookup the model makes, so you can see whether it really checks the wiki.

## 2. Use several AIs together (automatic failover)
You do not have to pick one. Add every key you have; FindCraft builds a chain and answers with the first healthy one:

`Claude -> Groq -> custom server -> Gemini -> Pollinations (free, no key, last resort)`

If an AI is rate-limited, out of credits, down or has a bad key, the next one answers instead - before the visitor sees anything - and the
failed one rests for a while. When you add a fresh key, it simply joins the chain.
- Several keys for one provider: `GROQ_API_KEY=key1,key2` (or `GROQ_API_KEY_2=key2`), same for `GEMINI_API_KEY`.
- `AI_MODE=balance` alternates between healthy AIs to spread their free quotas; `AI_ORDER=gemini,groq,...` changes the order;
  `AI_PROVIDER=groq` forces a single AI; `AI_POLLINATIONS=off` removes the keyless last resort.
- `/api/health` shows the chain; `/api/health?live=1` tests EACH AI and says which one is out of credits (never shows keys).
- `npm run quiz` asks every AI the same Minecraft questions and checks the answers.

## 3. Self-host with Docker (recommended)
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
The agent looks things up instead of guessing: `search_minecraft` queries the official wiki + the Fandom Minecraft wiki + your own notes in one
call; `search_wiki`/`get_wiki_page` read any wiki (a verified list of community wikis is in `knowledge/core-wikis.md`); Modrinth, Mojang
version data and live server status have their own tools. Your own lessons go in [`knowledge/`](knowledge/README.md) - plain files, shared by
every AI, so a new API key never needs re-teaching. Personality lives in `lib/prompt.js` (documented in `agent/*.md`); new tools go in `lib/wiki.js`.

## Layout
`public/` website | `api/` Vercel functions | `lib/agent.js` AI chain/failover | `lib/{gemini,openai}.js` providers | `lib/wiki.js` tools | `n8n/` the old workflow, kept for reference
