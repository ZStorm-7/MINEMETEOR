// FREE provider: Google Gemini (free tier, key from aistudio.google.com/apikey). Same tools + same streaming output as the Claude path.
const { systemPrompt } = require("./prompt");
const { TOOLS, runTool } = require("./wiki");

const BASE = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const MAX_TURNS = 6;
exports.hasKey = () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
const key = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

class GeminiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

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

// Pick the newest free-tier "flash" model at runtime instead of hard-coding an id that may be retired. GEMINI_MODEL overrides.
let modelCache = { id: null, at: 0 };
async function pickModel() {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (modelCache.id && Date.now() - modelCache.at < 3600e3) return modelCache.id;
  try {
    const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key() }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = (await res.json()).models || [];
      const flash = list
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""))
        .map((id) => ({ id, v: (id.match(/^gemini-(\d+(?:\.\d+)?)-flash$/) || [])[1] }))
        .filter((m) => m.v)
        .sort((a, b) => parseFloat(b.v) - parseFloat(a.v));
      if (flash.length) { modelCache = { id: flash[0].id, at: Date.now() }; return flash[0].id; }
    }
  } catch {}
  return "gemini-2.5-flash";
}
exports.pickModel = pickModel;

function describe(status, body) {
  let msg = "";
  try { msg = JSON.parse(body).error.message; } catch { msg = String(body || "").slice(0, 160); }
  if (status === 429) return new GeminiError("the free AI quota is used up for now - wait a minute (or until tomorrow) and try again", 429);
  if (status === 400 && /API key/i.test(msg)) return new GeminiError("the GEMINI_API_KEY is invalid", 400);
  if (status === 401 || status === 403) return new GeminiError("the GEMINI_API_KEY is missing, wrong, or not allowed to use this model", status);
  return new GeminiError(`Gemini error ${status}: ${msg.slice(0, 160)}`, status);
}

// one streamed generateContent call; emits text deltas, returns the model's parts (verbatim, so thought signatures round-trip)
async function callOnce(model, contents, emit) {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt(false) }] }, contents, tools: DECLS, generationConfig: { maxOutputTokens: 2048 } }),
    signal: AbortSignal.timeout(55000),
  });
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

exports.runGemini = async function runGemini({ history = [], message, emit }) {
  const model = await pickModel();
  const contents = [];
  for (const h of history.slice(-20)) {
    const role = h.role === "assistant" ? "model" : "user";
    const text = String(h.text || "").slice(0, 4000);
    if (!text) continue;
    if (!contents.length && role === "model") continue;           // must start with a user turn
    contents.push({ role, parts: [{ text }] });
  }
  contents.push({ role: "user", parts: [{ text: String(message).slice(0, 2000) }] });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { parts, finish, blocked } = await callOnce(model, contents, emit);
    if (blocked) { emit("🚫 I can't help with that one."); return; }
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      if (finish === "MAX_TOKENS") emit(" …(cut off)");
      else if (!parts.some((p) => p.text)) emit("🤔 I got nothing back - try asking again!");
      return;
    }
    contents.push({ role: "model", parts });                       // echo exactly what the model sent (incl. thought signatures)
    const answers = await Promise.all(calls.map(async (p) => {
      const r = await runTool(p.functionCall.name, p.functionCall.args);
      return { functionResponse: { ...(p.functionCall.id ? { id: p.functionCall.id } : {}), name: p.functionCall.name, response: r.isError ? { error: r.text } : { result: r.text } } };
    }));
    contents.push({ role: "user", parts: answers });
  }
  emit(" …(too many lookups, ask me again more simply)");
};
exports.GeminiError = GeminiError;
