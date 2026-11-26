// FindCraft's brain. Every configured AI works TOGETHER as a chain (not one-or-the-other):
//   Claude -> Groq key(s) -> custom OpenAI-compatible server -> Gemini key(s) -> Pollinations (free, no key, last resort)
// A question goes to the first AI that is healthy. If it is rate-limited / out of credits / down / has a bad key, the next one answers instead -
// automatically, before the visitor sees anything - and the failed one rests for a while so we do not keep hitting it.
// Every AI gets the same tools, the same prompt and the same taught knowledge (lib/wiki.js, lib/prompt.js, knowledge/), so adding or
// replacing a key never means "teaching it again". Several keys per provider are fine: GROQ_API_KEY=key1,key2 (or GROQ_API_KEY_2=...).
//   AI_ORDER=groq,gemini,claude,custom,pollinations   change the order
//   AI_MODE=balance                                   alternate between healthy keyed AIs to spread their free quotas
//   AI_PROVIDER=claude|groq|gemini|custom|pollinations   use ONLY that one (no failover)
//   AI_POLLINATIONS=off                               never use the keyless last resort
const mod = require("@anthropic-ai/sdk");
const Anthropic = mod.default || mod;
const { systemPrompt } = require("./prompt");
const gemini = require("./gemini");
const openai = require("./openai");
const { TOOLS, runTool, serverTools } = require("./wiki");

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_TURNS = 6;        // lookups per question (search -> fetch -> answer ...)
const MAX_TOKENS = 8000;    // room for thinking + a short answer
const POLLINATIONS = "https://text.pollinations.ai/openai";   // free public AI, no key, no signup
const GROQ = "https://api.groq.com/openai/v1";                // free tier, key from console.groq.com/keys
let client;
const getClient = () => (client ||= new Anthropic());

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();   // tolerate spaces / quotes pasted around a key
// NAME=key1,key2  and  NAME_2=key3 ... NAME_9=...  are all collected
const keysOf = (...names) => [...new Set(names.flatMap((n) => [n, ...[2, 3, 4, 5, 6, 7, 8, 9].map((i) => `${n}_${i}`)]).flatMap((n) => String(process.env[n] || "").split(/[\s,;]+/)).map(clean).filter(Boolean))];
const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// ---------- the chain ----------
const GROQ_MODEL = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
function registry() {
  const groups = {
    claude: hasClaude() ? [{ id: "claude", label: "Claude", model: MODEL, run: (a) => runClaude(a) }] : [],
    groq: keysOf("GROQ_API_KEY").map((key, i, all) => ({ id: `groq${i + 1}`, label: all.length > 1 ? `Groq #${i + 1}` : "Groq", model: GROQ_MODEL(), run: (a, c) => openai.runOpenAI(a, { base: GROQ, key, model: GROQ_MODEL(), ...c }) })),
    custom: process.env.LLM_BASE_URL ? [{ id: "custom", label: "Custom AI server", model: process.env.LLM_MODEL || "llama3.1", run: (a, c) => openai.runOpenAI(a, { base: process.env.LLM_BASE_URL, key: clean(process.env.LLM_API_KEY), model: process.env.LLM_MODEL || "llama3.1", ...c }) }] : [],
    gemini: keysOf("GEMINI_API_KEY", "GOOGLE_API_KEY").map((key, i, all) => ({ id: `gemini${i + 1}`, label: all.length > 1 ? `Gemini #${i + 1}` : "Gemini", model: process.env.GEMINI_MODEL || "gemini-2.5-flash (auto)", run: (a, c) => gemini.runGemini(a, { key, ...c }) })),
    pollinations: process.env.AI_POLLINATIONS === "off" ? [] : [{ id: "pollinations", label: "Pollinations (free, no key)", model: "openai", run: (a, c) => openai.runOpenAI(a, { base: POLLINATIONS, key: "", model: "openai", ...c }) }],
  };
  const forced = String(process.env.AI_PROVIDER || "").toLowerCase();
  if (forced) { const map = { openai: ["groq", "custom", "pollinations"] }; return (map[forced] || [forced]).flatMap((g) => groups[g] || []); }
  const order = String(process.env.AI_ORDER || "claude,groq,custom,gemini,pollinations").toLowerCase().split(/[\s,]+/).filter((g) => groups[g]);
  for (const g of Object.keys(groups)) if (!order.includes(g)) order.push(g);
  return order.flatMap((g) => groups[g]);
}

const cool = new Map();   // id -> timestamp until which this AI rests (per server instance)
let rr = 0;
function plan() {
  const all = registry(), now = Date.now();
  const ready = all.filter((p) => !(cool.get(p.id) > now));
  const resting = all.filter((p) => cool.get(p.id) > now).sort((a, b) => cool.get(a.id) - cool.get(b.id));   // last resort: soonest to recover first
  let order = ready;
  if (process.env.AI_MODE === "balance") {
    const keyed = ready.filter((p) => p.id !== "pollinations");
    if (keyed.length > 1) { const k = rr++ % keyed.length; order = [...keyed.slice(k), ...keyed.slice(0, k), ...ready.filter((p) => p.id === "pollinations")]; }
  }
  return [...order, ...resting];
}

// why an AI failed -> how long it should rest
function classify(e) {
  const st = e && e.status;
  if (st === 429) return { ms: Math.max(45e3, ((e.retryAfter || 0) + 5) * 1000), why: "free limit reached" };
  if (st === 401 || st === 403 || (st === 400 && /api key|credential/i.test(String(e.message)))) return { ms: 600e3, why: "key rejected (wrong, expired or out of credits)" };
  if (st === 402) return { ms: 600e3, why: "out of credits" };
  if (st === 404) return { ms: 600e3, why: "model not found" };
  return { ms: 30e3, why: String((e && e.message) || e).replace(/\s+/g, " ").slice(0, 90) };
}

exports.MODEL = MODEL;
exports.hasKey = () => registry().length > 0;
exports.provider = () => { const p = plan()[0]; return p ? p.id : "none"; };
exports.configured = () => ({ claude: hasClaude(), groq: keysOf("GROQ_API_KEY").length, gemini: keysOf("GEMINI_API_KEY", "GOOGLE_API_KEY").length, customUrl: Boolean(process.env.LLM_BASE_URL), pollinations: process.env.AI_POLLINATIONS !== "off" });   // counts only, never values
exports.chain = () => { const now = Date.now(); return plan().map((p) => ({ id: p.id, name: p.label, model: p.model, state: cool.get(p.id) > now ? "resting" : "ready", ...(cool.get(p.id) > now ? { restsForSeconds: Math.ceil((cool.get(p.id) - now) / 1000) } : {}) })); };

// history: [{role:"user"|"assistant", text}], message: the new user text, emit(textDelta)
exports.runAgent = async function runAgent(args) {
  const list = plan();
  if (!list.length) throw new openai.LlmError("no AI is configured (set GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY)", 500);
  const budget = process.env.VERCEL ? 55000 : 120000, t0 = Date.now(), fails = [], short = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i], more = i < list.length - 1, left = budget - (Date.now() - t0);
    if (left < 4000) break;
    let emitted = 0;
    const emit = (t) => { emitted += t.length; args.emit(t); };
    try {
      await p.run({ ...args, emit }, { timeoutMs: more ? Math.min(left, process.env.VERCEL ? 22000 : 60000) : left, noWait: more });
      cool.delete(p.id);
      return;
    } catch (e) {
      const c = classify(e);
      cool.set(p.id, Date.now() + c.ms);
      fails.push(`${p.label}: ${c.why}`);
      if (e && e.status === 429 && e.retryAfter > 0) short.push({ p, wait: e.retryAfter });   // per-minute limits usually clear in seconds
      if (process.env.LOG_TOOLS) console.error(`  [failover] ${p.label} failed (${c.why})${more ? " -> next AI" : ""}`);
      if (emitted) throw e;   // already started answering: cannot switch AI mid-sentence
    }
  }
  // everything failed, but one only needs a few seconds: wait for the soonest one and try it once more
  short.sort((a, b) => a.wait - b.wait);
  const next = short[0], left = budget - (Date.now() - t0);
  if (next && next.wait <= (process.env.VERCEL ? 8 : 40) && next.wait * 1000 + 6000 < left) {
    await new Promise((r) => setTimeout(r, next.wait * 1000 + 400));
    let emitted = 0;
    try { await next.p.run({ ...args, emit: (t) => { emitted += t.length; args.emit(t); } }, { timeoutMs: budget - (Date.now() - t0), noWait: true }); cool.delete(next.p.id); return; }
    catch (e) { if (emitted) throw e; }
  }
  throw new openai.LlmError(`every AI is busy or out of free credits right now (${fails.join("; ")}). Try again in a minute, or add another API key.`, 429);
};

// ask ONE specific AI a real question (used by the quiz script); throws if it fails
exports.runOne = async function runOne(id, args) {
  const p = registry().find((x) => x.id === id); if (!p) throw new Error(`no AI called "${id}" is configured`);
  await p.run(args, { timeoutMs: 120000, noWait: false });
};

// one tiny test question through ONE specific AI (used by /api/health?live=1)
exports.probe = async function probe(id) {
  const p = registry().find((x) => x.id === id); if (!p) return { id, ok: false, error: "not configured" };
  const t0 = Date.now(); let out = "";
  try { await p.run({ history: [], message: "Reply with just: OK", emit: (t) => (out += t) }, { timeoutMs: 25000, noWait: true }); cool.delete(p.id); return { id, name: p.label, ok: true, ms: Date.now() - t0, reply: out.slice(0, 30) }; }
  catch (e) { const c = classify(e); return { id, name: p.label, ok: false, ms: Date.now() - t0, error: c.why }; }
};

async function runClaude({ history = [], message, emit }) {
  const messages = [];
  for (const h of history.slice(-20)) {                      // browser keeps the transcript; the server stays stateless
    const role = h.role === "assistant" ? "assistant" : "user";
    const text = String(h.text || "").slice(0, 4000);
    if (!text) continue;
    if (!messages.length && role === "assistant") continue;  // first message must be a user turn
    messages.push({ role, content: text });
  }
  messages.push({ role: "user", content: String(message).slice(0, 2000) });

  let useFallbacks = process.env.CLAUDE_FALLBACKS !== "off"; // server-side refusal fallback ("default" routing)
  let useWeb = process.env.CLAUDE_WEB !== "off";             // Anthropic-hosted web search + fetch
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const params = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt(true),
      tools: useWeb ? [...TOOLS, ...serverTools(MODEL)] : TOOLS,
      messages,
      output_config: { effort: "low" },   // fast, chatty replies; thinking depth stays small
    };
    if (useFallbacks) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }

    const stream = getClient().beta.messages.stream(params);
    stream.on("text", (delta) => emit(delta));
    let msg;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      // an account/platform that does not accept the fallback beta: retry this turn once without it
      if (err instanceof Anthropic.BadRequestError) {
        if (useFallbacks && /fallback|beta/i.test(String(err.message))) { useFallbacks = false; turn--; continue; }
        if (useWeb && /web_search|web_fetch|web search|web fetch|server tool/i.test(String(err.message))) { useWeb = false; turn--; continue; }  // web tools not enabled for this org
      }
      throw err;
    }

    if (msg.stop_reason === "refusal") { emit("🚫 I can't help with that one."); return; }
    messages.push({ role: "assistant", content: msg.content });   // append-only: keep thinking/tool blocks exactly as returned
    if (msg.stop_reason === "pause_turn") continue;
    const uses = msg.content.filter((b) => b.type === "tool_use");
    if (msg.stop_reason === "max_tokens") { emit(" …(cut off)"); return; }
    if (msg.stop_reason !== "tool_use" || !uses.length) return;

    const results = await Promise.all(uses.map(async (u) => {
      const r = await runTool(u.name, u.input);
      return { type: "tool_result", tool_use_id: u.id, content: r.text, ...(r.isError ? { is_error: true } : {}) };
    }));
    messages.push({ role: "user", content: results });             // all results in ONE user message
  }
  emit(" …(too many lookups, ask me again more simply)");
}
