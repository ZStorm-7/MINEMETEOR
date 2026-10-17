// GET /api/health          -> is the key configured and which model is used (free)
// GET /api/health?live=1   -> also sends one tiny request to Claude (a few tokens) to prove the key works
const mod = require("@anthropic-ai/sdk");
const Anthropic = mod.default || mod;
const { MODEL, hasKey } = require("../lib/agent");
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const out = { model: MODEL, keyConfigured: hasKey() };
  if (hasKey() && /(^|&)live=1/.test(String(req.url).split("?")[1] || "")) {
    try {
      const r = await new Anthropic().messages.create({ model: MODEL, max_tokens: 64, output_config: { effort: "low" }, messages: [{ role: "user", content: "Reply with: OK" }] });
      out.live = "ok"; out.stopReason = r.stop_reason;
    } catch (e) { res.statusCode = 502; out.live = "failed"; out.error = String((e && e.message) || e).slice(0, 200); }
  }
  res.end(JSON.stringify(out));
};
