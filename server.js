// Local/self-hosted server: serves ./public and the Claude-powered /api/chat (same code the Vercel function uses).
//   ANTHROPIC_API_KEY=sk-ant-...  node server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { streamChat } = require("./lib/chat");
const health = require("./api/health");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function readBody(req, max = 65536) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > max) { reject(new Error("too large")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/api/chat") {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400, { "Content-Type": "application/json" }); return res.end('{"error":"bad request"}'); }
    return streamChat(body, res, req.socket.remoteAddress);
  }
  if (req.method === "GET" && url.pathname === "/api/health") return health(req, res);
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
