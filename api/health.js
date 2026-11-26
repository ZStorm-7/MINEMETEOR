// GET /api/health          -> which AIs are configured (counts only, never keys), their order and whether any is resting, what is taught
// GET /api/health?live=1   -> also sends one tiny test question to EACH configured AI separately and reports ok / why not
const { hasKey, configured, chain, probe } = require("../lib/agent");
const knowledge = require("../lib/knowledge");
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const list = chain();
  const out = { ok: hasKey(), answeringWith: list[0] ? list[0].name : "none", chain: list, keysFound: configured(), taught: knowledge.count() };
  if (hasKey() && /(^|&)live=1/.test(String(req.url).split("?")[1] || "")) {
    out.tests = await Promise.all(list.map((p) => probe(p.id)));
    out.live = out.tests.some((t) => t.ok) ? "ok" : "failed";
    if (out.live === "failed") res.statusCode = 502;
  }
  res.end(JSON.stringify(out));
};
