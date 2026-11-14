// FindCraft's lookup tools: any Minecraft wiki (vanilla, Fandom, wiki.gg, Miraheze), Modrinth (mods, packs, shaders), official version data and live server status.
const UA = { "User-Agent": "FindCraft/1.0 (Minecraft Q&A site)" };
const MAX_PAGE_CHARS = 9000;   // keep tool results small: cheaper, faster, and plenty for a short answer

// only wikis on these hosts can be queried (the model supplies the host, so it must be allowlisted)
const WIKI_HOST = /^(minecraft\.wiki|[a-z0-9][a-z0-9-]{0,60}\.(fandom\.com|wiki\.gg|miraheze\.org))$/i;
const KINDS = ["mod", "resourcepack", "shader", "modpack", "datapack", "plugin"];

const tool = (name, description, properties, required) => ({
  name, description, eager_input_streaming: true,
  input_schema: { type: "object", properties, required, additionalProperties: false },
});
const wikiProp = { type: "string", description: "Wiki host, default \"minecraft.wiki\" (official vanilla wiki). Others look like \"lifesteal.fandom.com\", \"hypixel-skyblock.fandom.com\" or \"something.wiki.gg\". If you do not know a community's wiki host, use web_search to find it first." };

exports.TOOLS = [
  tool("search_wiki", "Search a Minecraft-related wiki by keyword. Returns matching article titles with short summaries. Works for the official wiki (minecraft.wiki, the default) and for community wikis (SMPs, servers, mods, modpacks) on fandom.com, wiki.gg or miraheze.org.",
    { query: { type: "string", description: "What to search for" }, wiki: wikiProp }, ["query"]),
  tool("get_wiki_page", "Fetch the plain-text content of one wiki page by its exact title (use a title returned by search_wiki).",
    { title: { type: "string", description: "Exact page title, e.g. \"Diamond Ore\" or \"Heart\"" }, wiki: wikiProp }, ["title"]),
  tool("search_modrinth", "Search Modrinth for mods, resource packs, shaders, modpacks and datapacks. Returns name, summary, downloads, supported loaders/versions and the slug to use with get_modrinth_project.",
    { query: { type: "string", description: "Mod / pack name or topic" }, kind: { type: "string", enum: KINDS, description: "Optional filter by project type" } }, ["query"]),
  tool("get_modrinth_project", "Get details for one Modrinth project by slug: description, supported Minecraft versions and loaders, downloads, categories and links.",
    { slug: { type: "string", description: "Project slug from search_modrinth, e.g. \"sodium\"" } }, ["slug"]),
  tool("minecraft_versions", "Official Mojang version data: the latest release and snapshot, plus release date/type for a specific version id (e.g. \"1.21.4\"). Use it for 'what is the latest version' and 'when did X version come out'.",
    { version: { type: "string", description: "Optional exact version id, e.g. \"1.21.4\" or \"24w14a\". Omit for the latest release/snapshot and the 10 most recent releases." } }, []),
  tool("server_status", "Live status of a public Minecraft server (Java or Bedrock): online/offline, player count, version, MOTD. Use for 'is <server> online' questions (e.g. \"mc.hypixel.net\").",
    { host: { type: "string", description: "Server address, e.g. \"mc.hypixel.net\" or \"play.example.com:25565\"" }, edition: { type: "string", enum: ["java", "bedrock"], description: "Default java" } }, ["host"]),
];

// Anthropic-hosted tools: live web search + page reading (SMP lore, servers, YouTubers, news, anything the wikis miss)
exports.serverTools = (model) => {
  const modern = !/haiku/i.test(model);   // dynamic-filtering variants are not offered on Haiku
  return [
    { type: modern ? "web_search_20260209" : "web_search_20250305", name: "web_search", max_uses: 3 },
    { type: modern ? "web_fetch_20260209" : "web_fetch_20250910", name: "web_fetch", max_uses: 2, max_content_tokens: 12000 },
  ];
};

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try { return JSON.parse(await res.text()); } catch { throw new Error("the site did not answer with wiki data"); }
}
// MediaWiki API: most wikis serve /api.php, some (wiki.gg, Miraheze) serve /w/api.php
async function mediawiki(host, params) {
  let first;
  for (const base of [`https://${host}/api.php`, `https://${host}/w/api.php`]) {
    const url = new URL(base);
    Object.entries({ action: "query", format: "json", ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
    try { return await getJson(url); } catch (e) { first = first || e; }
  }
  throw new Error(`${host}: ${first.message} (that wiki may not exist - check the host with web_search)`);
}
const str = (v, max) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);   // tool input is model output: validate it
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const cleanWikitext = (s) => String(s)
  .replace(/<gallery[\s\S]*?<\/gallery>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>/gi, "")
  .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, "").replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2").replace(/\[\[([^\]]*)\]\]/g, "$1")
  .replace(/'{2,}/g, "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
const bad = (text) => ({ isError: true, text });
const pickWiki = (v) => { const h = (v == null || v === "" ? "minecraft.wiki" : String(v)).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""); return WIKI_HOST.test(h) ? h : null; };

async function searchWiki(input) {
  const q = str(input && input.query, 200); if (!q) return bad("invalid input: 'query' must be a short non-empty string");
  const host = pickWiki(input.wiki); if (!host) return bad("that wiki host is not allowed; use minecraft.wiki or a *.fandom.com / *.wiki.gg / *.miraheze.org host");
  let pages = [];
  try {
    const d = await mediawiki(host, { generator: "search", gsrsearch: q, gsrlimit: 5, prop: "extracts", explaintext: 1, exintro: 1 });
    pages = Object.values((d.query && d.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((p) => ({ title: p.title, text: (p.extract || "").trim().slice(0, 500) }));
  } catch {}
  if (!pages.length || pages.some((p) => !p.text)) {          // empty/missing intros: fill from the wiki's own search snippets
    const d = await mediawiki(host, { list: "search", srsearch: q, srlimit: 5, srprop: "snippet" });
    const hits = (d.query && d.query.search) || [];
    const snip = new Map(hits.map((h) => [h.title, strip(h.snippet)]));
    if (!pages.length) pages = hits.map((h) => ({ title: h.title, text: strip(h.snippet) }));
    else pages.forEach((p) => { if (!p.text) p.text = snip.get(p.title) || ""; });
  }
  if (!pages.length) return { text: `No results for "${q}" on ${host}.` };
  // weaker models often answer straight from search results, so attach the top hit's recipes (crafting questions are the most common)
  let top = "", best = pages[0];
  const core = q.toLowerCase().replace(/crafting table/g, "crafting_table").replace(/\b(how|do|does|i|you|to|a|an|the|for|in|of|make|made|craft|crafting|recipe|recipes|get|obtain|minecraft|exact|layout|what|is|are|need|ingredients?)\b/g, " ").replace(/\s+/g, " ").trim().replace(/crafting_table/g, "crafting table");
  const wikitextOf = async (title) => {
    const d = await mediawiki(host, { titles: title, prop: "revisions", rvprop: "content", rvslots: "main", redirects: 1 });
    const pg = Object.values((d.query && d.query.pages) || {})[0];
    const r = pg && pg.revisions && pg.revisions[0];
    return { title: pg && pg.title, text: r && ((r.slots && r.slots.main && (r.slots.main["*"] || r.slots.main.content)) || r["*"]) };
  };
  try {
    const cands = [];   // the item the user named, if a page with exactly that title exists (e.g. "golden apple" -> "Golden Apple")
    if (core && core.split(" ").length <= 4) cands.push(core.replace(/\b\w/g, (c) => c.toUpperCase()), core.charAt(0).toUpperCase() + core.slice(1));
    for (const c of [...new Set(cands)]) { const w = await wikitextOf(c); const r = w.text && recipes(w.text); if (r) { top = r; best = { title: w.title }; break; } }
    if (!top) {   // otherwise the best-matching search hit
      best = pages.find((p) => p.title.toLowerCase() === core) || pages.find((p) => core && p.title.toLowerCase().includes(core) && !/^(Java|Bedrock) Edition /i.test(p.title))
        || pages.find((p) => !/^(Java|Bedrock) Edition |^Crafting$/i.test(p.title)) || pages[0];
      top = recipes((await wikitextOf(best.title)).text);
    }
  } catch {}
  return { text: (top ? `${best.title} - ${top}` : "") + pages.map((p) => `# ${p.title}\n${p.text}`).join("\n\n") };
}

// Recipes live in templates ({{Crafting|A1=..|Output=..}}) that plain-text extracts drop, so models guessed them.
// Turn them into readable grids. Columns A-C, rows 1-3.
const RECIPE = /\{\{\s*(Crafting|Smelting|Stonecutting|Smithing|Brewing)\s*(\|[^{}]*?)\}\}/g;
const OLD_SECTIONS = /^==\s*(History|Development|Trivia|Gallery|Issues|Data history|References)\b/im;   // old/removed recipes live here
function recipes(wikitext) {
  const out = new Set();
  let src = String(wikitext || ""); const cut = src.search(OLD_SECTIONS); if (cut > 0) src = src.slice(0, cut);
  for (const [, kind, body] of src.matchAll(RECIPE)) {
    const a = {}, loose = [];
    for (const part of body.split("|").slice(1)) {
      const i = part.indexOf("=");
      if (i > 0) a[part.slice(0, i).trim()] = part.slice(i + 1).trim(); else if (part.trim()) loose.push(part.trim());
    }
    if (!a.Output) continue;
    if (kind === "Crafting" && loose.length) { out.add(`Crafting (shapeless, any layout) -> ${a.Output}: ${loose.join(" + ")}`); continue; }
    if (kind === "Crafting") {
      const grid = [1, 2, 3].map((r) => ["A", "B", "C"].map((c) => a[c + r] || ""));
      if (!grid.some((row) => row.some(Boolean))) continue;
      const counts = {};
      grid.flat().filter(Boolean).forEach((x) => (counts[x] = (counts[x] || 0) + 1));
      const total = Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(" + ");
      const lines = a.shapeless ? [] : grid.map((row, i) => `  ${["top", "middle", "bottom"][i]} row: ${row.map((x) => x || "(empty)").join(", ")}`);
      out.add(`Crafting${a.shapeless ? " (shapeless, any layout)" : ""} -> ${a.Output}\n  TOTAL INGREDIENTS: ${total}${lines.length ? "\n" + lines.join("\n") : ""}`);
    } else {
      out.add(`${kind} -> ${a.Output}: ` + Object.entries(a).filter(([k]) => !/^(Output|type|ignoreusage|name|nocat)$/i.test(k)).map(([k, v]) => `${k}=${v}`).join(", "));
    }
    if (out.size >= 4) break;
  }
  return out.size ? `RECIPES (exact, from the wiki; "a; b" = either item; the total is how many items in all):\n${[...out].join("\n")}\n\n` : "";
}

async function getWikiPage(input) {
  const t = str(input && input.title, 200); if (!t) return bad("invalid input: 'title' must be a short non-empty string");
  const host = pickWiki(input.wiki); if (!host) return bad("that wiki host is not allowed; use minecraft.wiki or a *.fandom.com / *.wiki.gg / *.miraheze.org host");
  const [ex, raw] = await Promise.all([
    mediawiki(host, { titles: t, prop: "extracts", explaintext: 1, redirects: 1 }).catch(() => ({})),
    mediawiki(host, { titles: t, prop: "revisions", rvprop: "content", rvslots: "main", redirects: 1 }).catch(() => ({})),
  ]);
  const rawPage = Object.values((raw.query && raw.query.pages) || {})[0];
  const rev = rawPage && rawPage.revisions && rawPage.revisions[0];
  const wikitext = rev && ((rev.slots && rev.slots.main && (rev.slots.main["*"] || rev.slots.main.content)) || rev["*"]);
  let page = Object.values((ex.query && ex.query.pages) || {})[0];
  let text = page && page.extract;
  if (!text) { page = rawPage; text = wikitext && cleanWikitext(wikitext); }   // no extracts support: use raw wikitext
  if (!page || page.missing !== undefined || !text) return bad(`No page titled "${t}" on ${host}. Try search_wiki first.`);
  text = recipes(wikitext) + text;
  return { text: `# ${page.title} (${host})\n${text.length > MAX_PAGE_CHARS ? text.slice(0, MAX_PAGE_CHARS) + "\n[...page truncated]" : text}` };
}

async function searchModrinth(input) {
  const q = str(input && input.query, 120); if (!q) return bad("invalid input: 'query' must be a short non-empty string");
  const url = new URL("https://api.modrinth.com/v2/search");
  url.searchParams.set("query", q); url.searchParams.set("limit", "5");
  if (input.kind && KINDS.includes(input.kind)) url.searchParams.set("facets", JSON.stringify([[`project_type:${input.kind}`]]));
  const d = await getJson(url);
  if (!d.hits || !d.hits.length) return { text: `No Modrinth results for "${q}".` };
  return { text: d.hits.map((h) => `# ${h.title} (slug: ${h.slug}, ${h.project_type})\n${h.description}\nby ${h.author} | ${h.downloads} downloads | loaders: ${(h.categories || []).join(", ")} | latest MC: ${h.latest_version || (h.versions || []).slice(-1)[0] || "?"}`).join("\n\n") };
}

async function getModrinthProject(input) {
  const slug = str(input && input.slug, 80); if (!slug || !/^[A-Za-z0-9_.-]+$/.test(slug)) return bad("invalid input: 'slug' must be a Modrinth slug like \"sodium\"");
  const p = await getJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(slug)}`);
  const body = String(p.body || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<[^>]+>/g, "").trim();
  return { text: [`# ${p.title} (${p.project_type})`, p.description, `downloads: ${p.downloads} | followers: ${p.followers} | updated: ${String(p.updated).slice(0, 10)}`,
    `loaders: ${(p.loaders || []).join(", ")} | Minecraft versions: ${(p.game_versions || []).slice(-8).join(", ")}`, `categories: ${(p.categories || []).join(", ")}`,
    p.source_url ? `source: ${p.source_url}` : "", `page: https://modrinth.com/${p.project_type}/${p.slug}`, "", body.slice(0, 3500)].filter((x) => x !== "").join("\n") };
}

let manifest = { data: null, at: 0 };
async function minecraftVersions(input) {
  if (!manifest.data || Date.now() - manifest.at > 600e3) manifest = { data: await getJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"), at: Date.now() };
  const m = manifest.data, want = str(input && input.version, 40);
  if (want) {
    const v = m.versions.find((x) => x.id.toLowerCase() === want.toLowerCase());
    return v ? { text: `${v.id}: ${v.type}, released ${String(v.releaseTime).slice(0, 10)}` } : bad(`No official version "${want}". Try the exact id, e.g. 1.21.4.`);
  }
  const rel = m.versions.filter((x) => x.type === "release").slice(0, 10).map((x) => `${x.id} (${String(x.releaseTime).slice(0, 10)})`);
  return { text: `latest release: ${m.latest.release}\nlatest snapshot: ${m.latest.snapshot}\nrecent releases: ${rel.join(", ")}` };
}

const SERVER_HOST = /^[a-z0-9]([a-z0-9.-]{0,250})(:\d{1,5})?$/i;
async function serverStatus(input) {
  const host = str(input && input.host, 255); if (!host || !SERVER_HOST.test(host)) return bad("invalid input: 'host' must look like mc.example.com or mc.example.com:25565");
  const d = await getJson(`https://api.mcsrvstat.us/${input.edition === "bedrock" ? "bedrock/" : ""}3/${encodeURIComponent(host)}`);
  if (!d.online) return { text: `${host} is OFFLINE (or unreachable / not a Minecraft server).` };
  const motd = d.motd && d.motd.clean ? d.motd.clean.join(" ") : "";
  return { text: `${host} is ONLINE | players ${d.players ? d.players.online + "/" + d.players.max : "?"} | version: ${(d.version || "?")} | software: ${d.software || "?"}${motd ? "\nMOTD: " + motd : ""}` };
}

const IMPL = { search_wiki: searchWiki, get_wiki_page: getWikiPage, search_modrinth: searchModrinth, get_modrinth_project: getModrinthProject, minecraft_versions: minecraftVersions, server_status: serverStatus };
exports.runTool = async function runTool(name, input) {
  const fn = IMPL[name];
  if (!fn) return bad(`unknown tool ${name}`);
  try { return await fn(input || {}); }
  catch (e) { return bad(`The lookup failed (${String((e && e.message) || e)}). Say so, and answer from what you know, marked as unverified.`); }
};
