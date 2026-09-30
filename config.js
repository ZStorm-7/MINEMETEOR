// Point this at your n8n Webhook node (Production URL).
// Expected request:  POST { "message": string, "sessionId": string }
// Expected response: JSON with one of: output | text | reply | message  (or plain text)
window.MINE_METEOR_CONFIG = {
  WEBHOOK_URL: "", // e.g. "https://your-n8n.example.com/webhook/mine-meteor"
};
