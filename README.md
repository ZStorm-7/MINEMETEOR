# Mine Meteor

Static website front-end for the Mine Meteor n8n AI agent.

1. Set `WEBHOOK_URL` in `config.js` to your n8n Webhook node URL (POST `{message, sessionId}`; reply JSON with `output`/`text`/`reply`/`message`).
2. Enable CORS for your site's origin on the n8n Webhook node (Options → Allowed Origins).
3. Serve the folder (`python3 -m http.server`) or deploy to any static host.

Personality lives in `agent/SOUL.md`, `agent/IDENTITY.md`, `agent/USER.md` — paste them into your n8n agent's system prompt.
