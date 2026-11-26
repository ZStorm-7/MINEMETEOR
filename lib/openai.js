// Provider for ANY OpenAI-compatible chat API: Groq, Pollinations (free, no key), Ollama (self-hosted), OpenRouter, LM Studio, vLLM, OpenAI...
// It is configured per call (cfg = { base, key, model, timeoutMs, noWait }) by lib/agent.js, so several keys/providers can live side by side.
//   LOG_TOOLS=1 prints every tool call the model makes (handy to see if a model actually looks things up)
// Same tools + same streaming output as the Claude/Gemini paths.
const { systemPrompt } = require("./prompt");
const { TOOLS, runTool } = require("./wiki");
const { prefetch, augment } = require("./retrieve");

const MAX_TURNS = 6;
class LlmError extends Error { constructor(msg, status, retryAfter) { super(msg); this.status = status; this.retryAfter = retryAfter; } }
exports.LlmError = LlmError;

const FUNCS = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
const defaultTimeout = () => Number(process.env.LLM_TIMEOUT_MS) || (process.env.VERCEL ? 55000 : 120000);   // Vercel kills functions at 60s

async function callOnce(cfg, messages, emit, forceTool, attempt = 0) {
  const base = String(cfg.base).replace(/\/+$/, "");
  let res;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, messages, ...(cfg.noTools ? {} : { tools: FUNCS }), ...(/groq\.com/.test(base) && /gpt-oss/.test(cfg.model) ? { reasoning_effort: "low" } : {}), ...(forceTool && !cfg.noTools ? { tool_choice: "required" } : {}), stream: true, max_tokens: 4096 }),
      signal: AbortSignal.timeout(cfg.timeoutMs || defaultTimeout()),
    });
  } catch (e) {
    const timeout = e.name === "TimeoutError" || e.name === "AbortError";
    throw new LlmError(timeout ? "the AI server took too long to answer" : `could not reach the AI server (${(e.cause && e.cause.code) || e.message})`, timeout ? 504 : 0);
  }
  if (!res.ok) {
    let m = ""; const body = await res.text();
    try { m = JSON.parse(body).error.message || JSON.parse(body).error; } catch { m = body.slice(0, 160); }
    if (res.status === 401 || res.status === 403) throw new LlmError("the AI key is missing, wrong, or not allowed to use this model", res.status);
    if (res.status === 404 && /model/i.test(String(m))) throw new LlmError(`model "${cfg.model}" not found on the AI server (for Ollama run: ollama pull ${cfg.model})`, 404);
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 0;   // free tiers are per-minute: a short wait usually clears it - unless another AI can take over
      if (!cfg.noWait && attempt < 2 && wait > 0 && wait <= (process.env.VERCEL ? 8 : 40)) { await new Promise((r) => setTimeout(r, wait * 1000 + 300)); return callOnce(cfg, messages, emit, forceTool, attempt + 1); }
      throw new LlmError("the free AI limit is used up for the moment", 429, wait);
    }
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

exports.runOpenAI = async function runOpenAI({ history = [], message, emit }, cfg) {
  const messages = [{ role: "system", content: systemPrompt(false, true) }];
  for (const h of history.slice(-20)) {
    const role = h.role === "assistant" ? "assistant" : "user";
    const text = String(h.text || "").slice(0, 4000);
    if (!text) continue;
    if (messages.length === 1 && role === "assistant") continue;
    messages.push({ role, content: text });
  }
  messages.push({ role: "user", content: String(message).slice(0, 2000) });

  // look first (server side), then ask ONCE with no tool definitions: ~half the tokens, one round-trip, no skipped lookups
  if (process.env.LLM_PREFETCH !== "off") {
    const found = await prefetch(message);
    if (found) {
      if (process.env.LOG_TOOLS) console.error("  [prefetch] lookup done on the server, single AI call");
      const last = messages[messages.length - 1]; last.content = augment(message, found);
      const r = await callOnce({ ...cfg, noTools: true }, messages, emit, false);
      if (r.finish === "length") emit(" …(cut off)"); else if (!r.text) emit("🤔 I got nothing back - try asking again!");
      return;
    }
  }
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // small/free models often answer from (wrong) memory. On the first turn of a real question: require a lookup, and if the model
    // still skips it, search the wikis ourselves and give it the result (the answer is buffered so nothing wrong is shown first).
    const force = turn === 0 && process.env.LLM_FORCE_LOOKUP !== "off" && message.trim().split(/\s+/).length >= 3 && !/^(hi|hello|hey|yo|sup|thanks|thank you|thx|ok|okay|lol|cool|nice|good (morning|night|evening))\b/i.test(message.trim());
    let buffered = "";
    let { text, finish, calls } = await callOnce(cfg, messages, force ? (t) => (buffered += t) : emit, force);
    if (force && !calls.length) {
      const r = await runTool("search_minecraft", { query: String(message).slice(0, 200) });
      if (process.env.LOG_TOOLS) console.error("  [auto-lookup] search_minecraft");
      const last = messages[messages.length - 1];   // the plain question -> the question plus the lookup result
      last.content = `${last.content}\n\n[Wiki lookup done for you. Base your answer on it, not on memory; if it disagrees with you, the wiki is right:]\n${r.text}`;
      buffered = "";
      ({ text, finish, calls } = await callOnce(cfg, messages, emit, false));
    } else if (buffered) emit(buffered);   // forced turn that did call tools but also spoke: keep that text
    if (!calls.length) {
      if (finish === "length") emit(" …(cut off)");
      else if (!text && !buffered) emit("🤔 I got nothing back - try asking again!");
      return;
    }
    calls.forEach((c, i) => { if (!c.id) c.id = `call_${turn}_${i}`; });
    messages.push({ role: "assistant", content: text || null, tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
    const results = await Promise.all(calls.map(async (c) => {
      let input = {}; try { input = JSON.parse(c.args || "{}"); } catch {}
      if (process.env.LOG_TOOLS) console.error("  [tool]", c.name, JSON.stringify(input));
      const r = await runTool(c.name, input);
      return { role: "tool", tool_call_id: c.id, content: r.text };
    }));
    messages.push(...results);
  }
  emit(" …(too many lookups, ask me again more simply)");
};
