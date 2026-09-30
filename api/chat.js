// Vercel serverless version of the /api/chat proxy (same job as server.js).
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  const url = process.env.N8N_CHAT_URL;
  if (!url) { res.statusCode = 500; return res.end("N8N_CHAT_URL is not set"); }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const message = String(body.message || "").slice(0, 2000);
  const sessionId = String(body.sessionId || "").slice(0, 100);
  if (!message || !sessionId) { res.statusCode = 400; return res.end("message and sessionId required"); }
  try {
    const up = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sendMessage", sessionId, chatInput: message }),
    });
    res.statusCode = up.status;
    res.setHeader("Content-Type", up.headers.get("content-type") || "text/plain");
    res.setHeader("Cache-Control", "no-store");
    if (!up.body) return res.end();
    const reader = up.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch {
    if (!res.headersSent) res.statusCode = 502;
    res.end("upstream error");
  }
};
