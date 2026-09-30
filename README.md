# Mine Meteor

Minecraft-style website for the Mine Meteor n8n agent (`n8n/mine-meteor.json`).

The browser only talks to `/api/chat` on this server; `server.js` forwards to your n8n
Chat Trigger, so the n8n URL is never exposed. No dependencies (Node 18+).

## Run
    N8N_CHAT_URL="https://<your-n8n-host>/webhook/87c5a8d1-a70a-4dc7-82f6-9e87391fedcd/chat" node server.js
    # open http://localhost:3000

Use the **production** chat URL (workflow must be Active — it is). Deploy to any Node host
(Render, Railway, Fly.io, a VPS) and set `N8N_CHAT_URL` as an environment variable.

Agent prompt files live in `agent/` (they mirror the system message in the n8n workflow).

## Free hosting on Vercel
Import the repo at vercel.com, set env var `N8N_CHAT_URL`, deploy. `public/` is served as the site and `api/chat.js` is the proxy.
