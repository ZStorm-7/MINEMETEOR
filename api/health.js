// GET /api/health -> tells you whether the n8n chat URL answers (does not send a chat message / use model credits).
module.exports = async (req, res) => {
  const url = process.env.N8N_CHAT_URL || "https://reyanshmandaloju.app.n8n.cloud/webhook/87c5a8d1-a70a-4dc7-82f6-9e87391fedcd/chat";
  res.setHeader("Content-Type", "application/json");
  try {
    const r = await fetch(url, { method: "OPTIONS" });
    res.end(JSON.stringify({ reachable: true, status: r.status, hint: r.status === 404 ? "n8n says no such webhook: workflow inactive or URL changed" : "n8n host is up" }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ reachable: false, detail: String(e && e.message || e) }));
  }
};
