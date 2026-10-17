// GET /api/health          -> which AI provider/key is configured (free)
// GET /api/health?live=1   -> also sends one tiny test request to that provider to prove the key works
const mod = require("@anthropic-ai/sdk");
const Anthropic = mod.default || mod;
const { MODEL, hasKey, provider } = require("../lib/agent");
const gemini = require("../lib/gemini");
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const p = provider();
  const out = { provider: p, keyConfigured: hasKey() };
  if (p === "claude") out.model = MODEL;
  if (p === "gemini") out.model = await gemini.pickModel();
  if (hasKey() && /(^|&)live=1/.test(String(req.url).split("?")[1] || "")) {
    try {
      if (p === "claude") {
        const r = await new Anthropic().messages.create({ model: MODEL, max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with: OK" }] });
        out.stopReason = r.stop_reason;
      } else {
        let text = "";
        await gemini.runGemini({ history: [], message: "Reply with just: OK", emit: (t) => (text += t) });
        out.reply = text.slice(0, 40);
      }
      out.live = "ok";
    } catch (e) { res.statusCode = 502; out.live = "failed"; out.error = String((e && e.message) || e).slice(0, 200); }
  }
  res.end(JSON.stringify(out));
};
