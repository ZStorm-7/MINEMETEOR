// Mine Meteor's lookup tools: any Minecraft-related wiki (vanilla, Fandom, wiki.gg, Miraheze) + Modrinth (mods, resource packs, shaders, modpacks).
const UA = { "User-Agent": "MineMeteor/1.0 (Minecraft Q&A site)" };
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
  return { text: pages.length ? pages.map((p) => `# ${p.title}\n${p.text}`).join("\n\n") : `No results for "${q}" on ${host}.` };
}

async function getWikiPage(input) {
  const t = str(input && input.title, 200); if (!t) return bad("invalid input: 'title' must be a short non-empty string");
  const host = pickWiki(input.wiki); if (!host) return bad("that wiki host is not allowed; use minecraft.wiki or a *.fandom.com / *.wiki.gg / *.miraheze.org host");
  let page = Object.values(((await mediawiki(host, { titles: t, prop: "extracts", explaintext: 1, redirects: 1 }).catch(() => ({}))).query || {}).pages || {})[0];
  let text = page && page.extract;
  if (!text) {   // no extracts support: fall back to raw wikitext
    const d = await mediawiki(host, { titles: t, prop: "revisions", rvprop: "content", rvslots: "main", redirects: 1 });
    page = Object.values((d.query && d.query.pages) || {})[0];
    const rev = page && page.revisions && page.revisions[0];
    text = rev && cleanWikitext((rev.slots && rev.slots.main && (rev.slots.main["*"] || rev.slots.main.content)) || rev["*"]);
  }
  if (!page || page.missing !== undefined || !text) return bad(`No page titled "${t}" on ${host}. Try search_wiki first.`);
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

const IMPL = { search_wiki: searchWiki, get_wiki_page: getWikiPage, search_modrinth: searchModrinth, get_modrinth_project: getModrinthProject };
exports.runTool = async function runTool(name, input) {
  const fn = IMPL[name];
  if (!fn) return bad(`unknown tool ${name}`);
  try { return await fn(input || {}); }
  catch (e) { return bad(`The lookup failed (${String((e && e.message) || e)}). Say so, and answer from what you know, marked as unverified.`); }
};
