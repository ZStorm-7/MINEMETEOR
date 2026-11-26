// npm run quiz            -> asks EVERY configured AI the same Minecraft questions and checks the answers
// npm run quiz -- groq1   -> only that AI (ids are shown by /api/health or by this script)
// Use it after adding or replacing an API key: it proves the new key answers with the same taught knowledge (wikis, recipes, notes).
try { require("fs").readFileSync(".env", "utf8").split("\n").forEach((l) => { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }); } catch {}
const agent = require("../lib/agent");

const QUIZ = [
  { q: "how do i craft an anvil", ok: [/block of iron|iron block/i, /iron ingot/i], why: "recipe from the wiki" },
  { q: "how do I make a netherite ingot", ok: [/4/, /scrap/i, /gold/i], why: "shapeless recipe" },
  { q: "how do i craft a golden apple", ok: [/8|eight/i, /gold/i, /apple/i], why: "recipe from the wiki" },
  { q: "what is the latest minecraft release version", ok: [/\b2\d\.\d/, /^(?![\s\S]*\b1\.2\d\.\d)/], why: "live Mojang version data (no '1.' prefix)" },
  { q: "what does Unbreaking do", ok: [/50\s*%|33\s*%|25\s*%|1\s*\/\s*\(?\s*level/i], why: "taught core fact" },
];

(async () => {
  const only = process.argv[2];
  const ids = agent.chain().map((p) => p.id).filter((id) => !only || id === only);
  if (!ids.length) { console.log("No AI configured. Set GROQ_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY (or run with none to test Pollinations)."); process.exit(1); }
  let bad = 0;
  for (const id of ids) {
    const name = agent.chain().find((p) => p.id === id).name;
    console.log(`\n=== ${name} (${id}) ===`);
    for (const t of QUIZ) {
      let out = "", err = null; const t0 = Date.now();
      try { await agent.runOne(id, { history: [], message: t.q, emit: (x) => (out += x) }); } catch (e) { err = String(e.message || e).slice(0, 90); }
      out = out.replace(/[\u00a0\u2009\u202f]/g, " ").replace(/[\u2010-\u2011\u2212]/g, "-");   // AIs often use non-breaking spaces/hyphens
      const pass = !err && t.ok.every((re) => re.test(out));
      if (!pass) bad++;
      console.log(`  ${pass ? "PASS" : "FAIL"}  ${((Date.now() - t0) / 1000).toFixed(1)}s  ${t.q}  [${t.why}]${err ? "  ERROR: " + err : pass ? "" : "\n        got: " + out.replace(/\s+/g, " ").slice(0, 160)}`);
    }
  }
  console.log(bad ? `\n${bad} check(s) failed` : "\nAll checks passed - this AI has the same knowledge.");
  process.exit(bad ? 1 : 0);
})();
