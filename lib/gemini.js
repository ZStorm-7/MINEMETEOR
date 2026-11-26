// FREE provider: Google Gemini (free tier, key from aistudio.google.com/apikey). Same tools + same streaming output as the Claude path.
const { systemPrompt } = require("./prompt");
const { TOOLS, runTool } = require("./wiki");
const { prefetch, augment } = require("./retrieve");

const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const MAX_TURNS = 6;
const defaultTimeout = () => Number(process.env.LLM_TIMEOUT_MS) || (process.env.VERCEL ? 55000 : 120000);

class GeminiError extends Error { constructor(msg, status, retryAfter) { super(msg); this.status = status; this.retryAfter = retryAfter; } }

// Anthropic-style tool schema -> Gemini functionDeclarations (OpenAPI subset: UPPERCASE types, no additionalProperties)
const toGemini = (s) => {
  if (Array.isArray(s)) return s.map(toGemini);
  if (!s || typeof s !== "object") return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties") continue;
    out[k] = k === "type" && typeof v === "string" ? v.toUpperCase() : toGemini(v);
  }
  return out;
};
const DECLS = [{ functionDeclarations: TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: toGemini(t.input_schema) })) }];

// Model choice. GEMINI_MODEL overrides. Otherwise prefer the stable, fast gemini-2.5-flash; the very newest Flash is often overloaded
// (503 / 30s+ replies), so it is only the fallback - used if 2.5 is gone from the list or fails with 404/503.
const PREFERRED = "gemini-2.5-flash";
let modelCache = { ids: null, at: 0 };
async function candidates(key) {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];
  if (modelCache.ids && Date.now() - modelCache.at < 3600e3) return modelCache.ids;
  let ids = [PREFERRED];
  try {
    const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = (await res.json()).models || [];
      const flash = list
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .map((id) => ({ id, v: (id.match(/^gemini-(\d+(?:\.\d+)?)-flash$/) || [])[1] }))
        .filter((m) => m.v)
        .sort((a, b) => parseFloat(b.v) - parseFloat(a.v))
        .map((m) => m.id);
      const has = flash.includes(PREFERRED);
      ids = [...(has ? [PREFERRED] : []), ...flash.filter((x) => x !== PREFERRED).slice(0, 2)];
      if (!ids.length) ids = [PREFERRED];
      modelCache = { ids, at: Date.now() };
    }
  } catch {}
  return ids;
}
async function pickModel(key) { return (await candidates(key))[0]; }
exports.pickModel = pickModel;

function describe(status, body) {
  let msg = "";
  try { msg = JSON.parse(body).error.message; } catch { msg = String(body || "").slice(0, 160); }
  if (status === 429) return new GeminiError("the free AI quota is used up for now", 429);
  if (status === 400 && /API key/i.test(msg)) return new GeminiError("the GEMINI_API_KEY is invalid", 400);
  if (status === 401 || status === 403) return new GeminiError("the GEMINI_API_KEY is missing, wrong, or not allowed to use this model", status);
  return new GeminiError(`Gemini error ${status}: ${msg.slice(0, 160)}`, status);
}

// one streamed generateContent call; emits text deltas, returns the model's parts (verbatim, so thought signatures round-trip)
async function callOnce(cfg, model, contents, emit, forceTool) {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(false, true) }] }, contents, ...(cfg.noTools ? {} : { tools: DECLS }), ...(forceTool && !cfg.noTools ? { toolConfig: { functionCallingConfig: { mode: "ANY" } } } : {}), generationConfig: { maxOutputTokens: 2048 } }),
    signal: AbortSignal.timeout(cfg.timeoutMs || defaultTimeout()),
  }).catch((e) => { throw new GeminiError(e.name === "TimeoutError" || e.name === "AbortError" ? "the AI server took too long to answer" : `could not reach the AI server (${(e.cause && e.cause.code) || e.message})`, e.name === "TimeoutError" || e.name === "AbortError" ? 504 : 0); });
  if (!res.ok) throw describe(res.status, await res.text());
  const parts = []; let finish = null, blocked = null;
  const dec = new TextDecoder(); let buf = "";
  const handle = (line) => {
    if (!line.startsWith("data:")) return;
    let j; try { j = JSON.parse(line.slice(5).trim()); } catch { return; }
    if (j.promptFeedback && j.promptFeedback.blockReason) blocked = j.promptFeedback.blockReason;
    const c = j.candidates && j.candidates[0];
    if (!c) return;
    if (c.finishReason) finish = c.finishReason;
    for (const p of (c.content && c.content.parts) || []) {
      parts.push(p);
      if (typeof p.text === "string" && !p.thought) emit(p.text);
    }
  };
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    lines.forEach(handle);
  }
  handle(buf);
  return { parts, finish, blocked };
}

exports.runGemini = async function runGemini({ history = [], message, emit }, cfg) {
  const models = await candidates(cfg.key);
  let model = models[0];
  const contents = [];
  for (const h of history.slice(-20)) {
    const role = h.role === "assistant" ? "model" : "user";
    const text = String(h.text || "").slice(0, 4000);
    if (!text) continue;
    if (!contents.length && role === "model") continue;           // must start with a user turn
    contents.push({ role, parts: [{ text }] });
  }
  contents.push({ role: "user", parts: [{ text: String(message).slice(0, 2000) }] });

  if (process.env.LLM_PREFETCH !== "off") {   // look first (server side), then ask ONCE with no tool definitions
    const found = await prefetch(message);
    if (found) {
      if (process.env.LOG_TOOLS) console.error("  [prefetch] lookup done on the server, single AI call");
      contents[contents.length - 1] = { role: "user", parts: [{ text: augment(message, found) }] };
      let r, model = models[0];
      for (let m = 0; ; m++) {
        try { r = await callOnce({ ...cfg, noTools: true }, models[m], contents, emit, false); break; }
        catch (e) { if (m + 1 < models.length && (e.status === 404 || e.status === 503 || e.name === "TimeoutError" || e.name === "AbortError")) continue; throw e; }
      }
      if (r.blocked) emit("🚫 I can't help with that one."); else if (r.finish === "MAX_TOKENS") emit(" …(cut off)"); else if (!r.parts.some((p) => p.text)) emit("🤔 I got nothing back - try asking again!");
      return;
    }
  }
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let res;
    for (let m = models.indexOf(model); ; m++) {   // overloaded/retired model: try the next candidate (nothing was shown yet if the call failed)
      try { res = await callOnce(cfg, models[m], contents, emit, turn === 0 && process.env.LLM_FORCE_LOOKUP !== "off" && String(message).trim().split(/\s+/).length >= 3); model = models[m]; break; }
      catch (e) { if (m + 1 < models.length && (e.status === 404 || e.status === 503 || e.name === "TimeoutError" || e.name === "AbortError")) continue; throw e; }
    }
    const { parts, finish, blocked } = res;
    if (blocked) { emit("🚫 I can't help with that one."); return; }
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      if (finish === "MAX_TOKENS") emit(" …(cut off)");
      else if (!parts.some((p) => p.text)) emit("🤔 I got nothing back - try asking again!");
      return;
    }
    contents.push({ role: "model", parts });                       // echo exactly what the model sent (incl. thought signatures)
    const answers = await Promise.all(calls.map(async (p) => {
      if (process.env.LOG_TOOLS) console.error("  [tool]", p.functionCall.name, JSON.stringify(p.functionCall.args));
      const r = await runTool(p.functionCall.name, p.functionCall.args);
      return { functionResponse: { ...(p.functionCall.id ? { id: p.functionCall.id } : {}), name: p.functionCall.name, response: r.isError ? { error: r.text } : { result: r.text } } };
    }));
    contents.push({ role: "user", parts: answers });
  }
  emit(" …(too many lookups, ask me again more simply)");
};
exports.GeminiError = GeminiError;
