// Provider for ANY OpenAI-compatible chat API: Ollama (free, self-hosted), Groq, OpenRouter, LM Studio, vLLM, OpenAI...
//   LLM_BASE_URL=http://localhost:11434/v1   LLM_MODEL=llama3.1   [LLM_API_KEY=...]   (key optional for local servers)
// Same tools + same streaming output as the Claude/Gemini paths.
const { systemPrompt } = require("./prompt");
const { TOOLS, runTool } = require("./wiki");

const MAX_TURNS = 6;
const base = () => String(process.env.LLM_BASE_URL || "").replace(/\/+$/, "");
exports.hasKey = () => Boolean(base());                     // "configured" = a base URL; local servers need no key
exports.model = () => process.env.LLM_MODEL || "llama3.1";

class LlmError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
exports.LlmError = LlmError;

const FUNCS = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));

async function callOnce(messages, emit) {
  let res;
  try {
    res = await fetch(`${base()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(process.env.LLM_API_KEY ? { Authorization: `Bearer ${process.env.LLM_API_KEY}` } : {}) },
      body: JSON.stringify({ model: exports.model(), messages, tools: FUNCS, stream: true, max_tokens: 2048 }),
      signal: AbortSignal.timeout(Number(process.env.LLM_TIMEOUT_MS) || 55000),
    });
  } catch (e) { throw new LlmError(`could not reach the AI server at ${base()} (${e.cause && e.cause.code || e.message})`); }
  if (!res.ok) {
    let m = ""; const body = await res.text();
    try { m = JSON.parse(body).error.message || JSON.parse(body).error; } catch { m = body.slice(0, 160); }
    if (res.status === 401 || res.status === 403) throw new LlmError("LLM_API_KEY is missing, wrong, or not allowed to use this model", res.status);
    if (res.status === 404 && /model/i.test(String(m))) throw new LlmError(`model "${exports.model()}" not found on the AI server - for Ollama run: ollama pull ${exports.model()}`, 404);
    if (res.status === 429) throw new LlmError("the AI server is rate-limited right now, try again in a moment", 429);
    throw new LlmError(`AI server error ${res.status}: ${String(m).slice(0, 160)}`, res.status);
  }
  let text = "", finish = null; const calls = [];
  const dec = new TextDecoder(); let buf = "";
  const handle = (line) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let j; try { j = JSON.parse(data); } catch { return; }
    const c = j.choices && j.choices[0]; if (!c) return;
    if (c.finish_reason) finish = c.finish_reason;
    const d = c.delta || {};
    if (typeof d.content === "string" && d.content) { text += d.content; emit(d.content); }
    for (const tc of d.tool_calls || []) {                    // tool calls arrive in fragments keyed by index
      const i = tc.index || 0; const cur = (calls[i] ||= { id: "", name: "", args: "" });
      if (tc.id) cur.id = tc.id;
      if (tc.function && tc.function.name) cur.name += tc.function.name;
      if (tc.function && tc.function.arguments) cur.args += tc.function.arguments;
    }
  };
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    lines.forEach(handle);
  }
  handle(buf);
  return { text, finish, calls: calls.filter((c) => c && c.name) };
}

exports.runOpenAI = async function runOpenAI({ history = [], message, emit }) {
  const messages = [{ role: "system", content: systemPrompt(false) }];
  for (const h of history.slice(-20)) {
    const role = h.role === "assistant" ? "assistant" : "user";
    const text = String(h.text || "").slice(0, 4000);
    if (!text) continue;
    if (messages.length === 1 && role === "assistant") continue;
    messages.push({ role, content: text });
  }
  messages.push({ role: "user", content: String(message).slice(0, 2000) });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { text, finish, calls } = await callOnce(messages, emit);
    if (!calls.length) {
      if (finish === "length") emit(" …(cut off)");
      else if (!text) emit("🤔 I got nothing back - try asking again!");
      return;
    }
    calls.forEach((c, i) => { if (!c.id) c.id = `call_${turn}_${i}`; });
    messages.push({ role: "assistant", content: text || null, tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
    const results = await Promise.all(calls.map(async (c) => {
      let input = {}; try { input = JSON.parse(c.args || "{}"); } catch {}
      const r = await runTool(c.name, input);
      return { role: "tool", tool_call_id: c.id, content: r.text };
    }));
    messages.push(...results);
  }
  emit(" …(too many lookups, ask me again more simply)");
};
