// "Teaching" FindCraft = files in ./knowledge (or $KNOWLEDGE_DIR). It is stored here, not inside any AI or API key, so every provider
// (Groq, Gemini, Claude, Pollinations...) gets exactly the same lessons - a new key never starts from zero.
//   knowledge/core-*.md : short, always put in the prompt (kept small: free tiers have tiny token limits)
//   every other .md/.txt : searched on demand (search_minecraft tool), so you can add a LOT without slowing anything down
const fs = require("fs");
const path = require("path");

const dir = () => process.env.KNOWLEDGE_DIR || path.join(__dirname, "..", "knowledge");
const MAX_CORE = 6000;
const STOP = new Set("the and for with that this what how does did are was were you your can could would should have has had from into about when where which who why not but all any one out use get make made need".split(" "));

function files() {
  try { return fs.readdirSync(dir()).filter((f) => /\.(md|txt)$/i.test(f) && !/^readme/i.test(f)).sort(); } catch { return []; }
}
const read = (f) => { try { return fs.readFileSync(path.join(dir(), f), "utf8").trim(); } catch { return ""; } };

exports.core = () => files().filter((f) => /^core/i.test(f)).map((f) => `## ${f}\n${read(f)}`).join("\n\n").slice(0, MAX_CORE);

// split a file into small chunks: blocks separated by blank lines or "#" headings, each prefixed by its nearest heading
function chunks() {
  const out = [];
  for (const f of files().filter((x) => !/^core/i.test(x))) {
    let head = f;
    for (const block of read(f).split(/\n\s*\n|\n(?=#)/)) {
      const t = block.trim(); if (!t) continue;
      const h = t.match(/^#+\s*(.+)/); if (h) head = h[1].trim();
      for (let i = 0; i < t.length; i += 700) out.push({ file: f, head, text: t.slice(i, i + 700) });
    }
  }
  return out;
}
const words = (s) => [...new Set(String(s).toLowerCase().match(/[a-z0-9_']{3,}/g) || [])].filter((w) => !STOP.has(w));

exports.search = function search(query, n = 4) {
  const q = words(query); if (!q.length) return [];
  return chunks().map((c) => {
    const hay = (c.head + " " + c.text).toLowerCase();
    const hits = q.filter((w) => hay.includes(w));
    const score = hits.length + (hay.includes(String(query).toLowerCase().trim()) ? 2 : 0) + hits.filter((w) => c.head.toLowerCase().includes(w)).length * 0.5;
    return { ...c, score };
  }).filter((c) => c.score >= Math.min(2, q.length)).sort((a, b) => b.score - a.score).slice(0, n);
};
exports.count = () => ({ core: files().filter((f) => /^core/i.test(f)).length, searchable: files().filter((f) => !/^core/i.test(f)).length, chunks: chunks().length });
