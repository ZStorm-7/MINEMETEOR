// One shared chat endpoint for the Vercel function and server.js: validates, rate-limits, streams NDJSON
// ({"type":"begin"} {"type":"item","content":"..."} {"type":"end"} / {"type":"error","content":"..."}).
const mod = require("@anthropic-ai/sdk");
const Anthropic = mod.default || mod;
const { runAgent, hasKey } = require("./agent");
const { GeminiError } = require("./gemini");

const hits = new Map();   // per-IP limiter (best effort on serverless: each warm instance keeps its own count)
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 15;
}
const json = (res, status, obj) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };

function explain(err) {
  if (err instanceof GeminiError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "the server's ANTHROPIC_API_KEY is missing, wrong, or not allowed to use this model";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limited right now, try again in a moment";
  if (err instanceof Anthropic.APIConnectionError) return "could not reach the Claude API";
  if (err instanceof Anthropic.APIError) {
    const m = (err.error && err.error.error && err.error.error.message) || err.message;   // the API's own message, without the JSON wrapper
    return `Claude API error ${err.status}: ${String(m).slice(0, 160)}`;
  }
  return String((err && err.message) || err).slice(0, 160);
}

exports.streamChat = async function streamChat(body, res, ip = "unknown") {
  if (!hasKey()) return json(res, 500, { error: "no AI key is set on the server: add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY in Vercel, then redeploy" });
  if (limited(ip)) return json(res, 429, { error: "Slow down, miner!" });
  const message = body && typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json(res, 400, { error: "message is required" });
  const history = Array.isArray(body.history) ? body.history.filter((h) => h && typeof h.text === "string") : [];

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const line = (o) => res.write(JSON.stringify(o) + "\n");
  line({ type: "begin" });
  try {
    await runAgent({ history, message, emit: (t) => line({ type: "item", content: t }) });
    line({ type: "end" });
  } catch (err) {
    line({ type: "error", content: explain(err) });
  }
  res.end();
};
