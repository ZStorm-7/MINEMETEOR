# Mine Meteor

Minecraft-style website + a Claude-powered Minecraft knowledge agent (runs on your n8n, or directly on an API key).

## How it works
- `public/` – the website (chat, menu, history, pixel scenery).
- `api/chat.js` – Vercel serverless function. Calls Claude through the official Anthropic SDK (`lib/agent.js`) and lets it
  look things up (`lib/wiki.js`): **any Minecraft wiki** (minecraft.wiki, Fandom, wiki.gg, Miraheze - e.g. Lifesteal), **Modrinth** (mods, resource packs, shaders, modpacks) and, via Anthropic's hosted tools, **live web search + page fetch** (SMPs like Unstable SMP, servers, creators, news). Answers stream to the page.
- `lib/prompt.js` – the agent's personality/instructions (`agent/*.md` document the same text).
- `api/health.js` – `/api/health` shows whether the key is set; `/api/health?live=1` sends one tiny test request to Claude.
- `lib/n8n.js` – forwards chat to your self-hosted n8n workflow. `n8n/mine-meteor.json` – that workflow (importable).

## Setup (Vercel) - self-hosted n8n (no AI key on Vercel)
`api/chat.js` forwards each chat to your n8n **Chat Trigger** webhook (`lib/n8n.js`) and streams n8n's answer back, so the
model credential lives in n8n only.
1. n8n: import `n8n/mine-meteor.json`, open the *Anthropic Chat Model* node and pick **your own** Anthropic credential
   (the file references a managed "Gateway credits" one that won't exist on a self-host). Make sure the Chat Trigger has
   **Response Mode = Streaming**, then **Activate** the workflow.
2. Copy the Chat Trigger's **Production URL** (`https://<your-n8n>/webhook/<id>/chat`, not `/webhook-test/`).
3. Vercel → Settings → Environment Variables → `N8N_WEBHOOK_URL` = that URL (Production). Redeploy.
4. Recommended: stop strangers calling n8n directly. In the Chat Trigger set *Authentication → Header Auth*, then add
   `N8N_AUTH_HEADER` (e.g. `X-Meteor-Key`) and `N8N_AUTH_VALUE` (the secret) in Vercel.
5. Check `/api/health?live=1` - it should say `"provider":"n8n"` and `"live":"ok"`.
If `N8N_WEBHOOK_URL` is set it wins over the other providers; `AI_PROVIDER=claude|gemini` still forces them.

## Setup (Vercel) - FREE option first
**Free:** get a key at <https://aistudio.google.com/apikey> (Google account, free tier), then in Vercel add `GEMINI_API_KEY`
(Production) and redeploy. The site picks the newest free Gemini *Flash* model automatically (`GEMINI_MODEL` overrides).
Free mode has the wiki + Modrinth tools but no hosted web search. If both keys exist Claude wins; `AI_PROVIDER=gemini|claude` forces one.

**Paid (Claude):** see below.

## Setup (Vercel) - Claude
1. Get an API key at <https://console.anthropic.com> (needs API credits - this is separate from a claude.ai subscription).
2. Vercel project → **Settings → Environment Variables** → add `ANTHROPIC_API_KEY` (Production). Redeploy.
3. Optional: `CLAUDE_WEB=off` (disable web search), `CLAUDE_MODEL` (default `claude-opus-5-5`; e.g. `claude-haiku-5-5` is far cheaper), `CLAUDE_FALLBACKS=off`.

## Run locally
    ANTHROPIC_API_KEY=sk-ant-... node server.js     # http://localhost:3000   (Node 20+, run `npm install` once)
