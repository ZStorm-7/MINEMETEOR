// Look first, then ask the AI ONCE. For a real question the server runs the right lookup(s) itself and hands the results to the AI,
// instead of the AI spending a whole round-trip (and the tool definitions, ~1k tokens) just to ask for them. That is faster, uses about
// half the free-tier tokens (Groq allows only 8,000 per minute), and removes "the AI guessed instead of looking" from the picture.
const { runTool, keywords } = require("./wiki");

const SMALL_TALK = /^(hi|hello|hey|yo|sup|thanks|thank you|thx|ok|okay|lol|cool|nice|good (morning|night|evening))\b/i;
const HOST = /\b((?:[a-z0-9-]+\.)+(?:net|com|org|gg|io|xyz|me|co|us|eu|tv|club|fun|pro|world|games|network)(?::\d{2,5})?)\b/i;   // mc.hypixel.net
const VERSION_ID = /\b(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?|\d{2}w\d{2}[a-z])\b/i;

exports.isQuestion = (m) => { const t = String(m || "").trim(); return t.split(/\s+/).length >= 3 && !SMALL_TALK.test(t); };

// returns "" when there is nothing useful (then the normal tool-calling path is used)
exports.prefetch = async function prefetch(message) {
  const m = String(message || "").trim();
  if (!exports.isQuestion(m)) return "";
  const jobs = [];
  const v = m.match(VERSION_ID);
  if (/\b(latest|newest|current|last|recent)\b.*\b(version|release|snapshot|update)\b|\bwhat version\b/i.test(m)) jobs.push(["minecraft_versions", {}]);
  else if (v && /\b(release|released|come out|came out|when)\b/i.test(m)) jobs.push(["minecraft_versions", { version: v[1] }]);
  const h = m.match(HOST);
  if (h && !/minecraft\.(wiki|fandom)|fandom\.com|wiki\.gg/i.test(h[1]) && /\b(online|offline|up|down|status|players|ip|running|working)\b/i.test(m)) jobs.push(["server_status", { host: h[1] }]);
  if (/\b(mod|mods|modpack|shader|shaders|resource ?pack|texture ?pack|datapack|modrinth|fabric|forge|neoforge|quilt|sodium|iris)\b/i.test(m)) jobs.push(["search_modrinth", { query: keywords(m) || m }]);
  jobs.push(["search_minecraft", { query: m.slice(0, 200) }]);
  const results = await Promise.all(jobs.map(([n, a]) => runTool(n, a).catch(() => ({ isError: true, text: "" }))));
  return results.filter((r) => !r.isError && r.text).map((r) => r.text).join("\n\n").slice(0, 6000);
};

exports.augment = (message, found) => `${String(message).slice(0, 2000)}\n\n[LOOKUP RESULTS from the Minecraft wikis, Mojang data and the maintainer's notes. Answer from these - they are more reliable than memory. If they do not contain the answer, say you are not sure instead of guessing:]\n${found}`;
