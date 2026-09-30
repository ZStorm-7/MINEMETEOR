// Tiny dependency-free server: serves ./public and proxies /api/chat to the
// n8n Chat Trigger so the n8n URL never reaches the browser.
//   N8N_CHAT_URL=https://<your-n8n>/webhook/<id>/chat  node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const N8N_CHAT_URL = process.env.N8N_CHAT_URL || "https://reyanshmandaloju.app.n8n.cloud/webhook/87c5a8d1-a70a-4dc7-82f6-9e87391fedcd/chat"; // public chat-trigger URL; env var overrides
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

// naive per-IP rate limit: 20 messages / minute
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

function readBody(req, max = 8192) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > max) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function chat(req, res) {
  if (!N8N_CHAT_URL) { res.writeHead(500); return res.end("N8N_CHAT_URL is not set"); }
  const ip = req.socket.remoteAddress;
  if (limited(ip)) { res.writeHead(429); return res.end("Slow down, miner!"); }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400); return res.end("bad request"); }
  const message = String(body.message || "").slice(0, 2000);
  const sessionId = String(body.sessionId || "").slice(0, 100);
  if (!message || !sessionId) { res.writeHead(400); return res.end("message and sessionId required"); }

  try {
    const up = await fetch(N8N_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sendMessage", sessionId, chatInput: message }),
    });
    res.writeHead(up.status, { "Content-Type": up.headers.get("content-type") || "text/plain", "Cache-Control": "no-store" });
    if (!up.body) return res.end();
    const reader = up.body.getReader();
    req.on("close", () => reader.cancel().catch(() => {}));
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.writeHead(502);
    res.end("upstream error");
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/api/chat") return chat(req, res);
  if (req.method !== "GET") { res.writeHead(405); return res.end(); }
  const rel = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Mine Meteor on http://localhost:${PORT}`));
