// Mine Meteor's brain: Claude (official Anthropic SDK) + the Minecraft wiki tools, streamed back as text.
const mod = require("@anthropic-ai/sdk");
const Anthropic = mod.default || mod;
const { SYSTEM_PROMPT } = require("./prompt");
const { TOOLS, runTool, serverTools } = require("./wiki");

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const MAX_TURNS = 6;        // lookups per question (search -> fetch -> answer ...)
const MAX_TOKENS = 8000;    // room for thinking + a short answer
let client;
const getClient = () => (client ||= new Anthropic());

exports.MODEL = MODEL;
exports.hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

// history: [{role:"user"|"assistant", text}], message: the new user text, emit(textDelta)
exports.runAgent = async function runAgent({ history = [], message, emit }) {
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
      system: SYSTEM_PROMPT,
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
};
