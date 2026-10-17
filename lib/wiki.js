// The two Minecraft wikis as Claude tools (same MediaWiki API calls the old n8n workflow made).
const HOSTS = { minecraft_wiki: "minecraft.wiki", minecraft_fandom: "minecraft.fandom.com" };
const MAX_PAGE_CHARS = 9000;   // keep tool results small: cheaper, faster, and plenty for a short answer

const searchSchema = (what) => ({
  type: "object",
  properties: { query: { type: "string", description: `The Minecraft topic, item, block, mob or mechanic to search ${what} for` } },
  required: ["query"],
  additionalProperties: false,
});
const pageSchema = {
  type: "object",
  properties: { title: { type: "string", description: "The exact page title, e.g. \"Diamond Ore\" or \"Enderman\"" } },
  required: ["title"],
  additionalProperties: false,
};
const tool = (name, description, input_schema) => ({ name, description, input_schema, eager_input_streaming: true });

exports.TOOLS = [
  tool("search_minecraft_wiki", "Search the official Minecraft Wiki (minecraft.wiki) by keyword. Returns matching article titles with short intro summaries. Use it to find which pages exist before fetching one.", searchSchema("the official wiki")),
  tool("get_minecraft_wiki_page", "Fetch the full plain-text content of one official Minecraft Wiki page by its exact title (use a title returned by search_minecraft_wiki).", pageSchema),
  tool("search_minecraft_fandom", "Search the Minecraft Fandom wiki by keyword. Returns matching article titles with short intro summaries. A second source to cross-check the official wiki.", searchSchema("the Fandom wiki")),
  tool("get_minecraft_fandom_page", "Fetch the full plain-text content of one Minecraft Fandom wiki page by its exact title (use a title returned by search_minecraft_fandom).", pageSchema),
];

async function mediawiki(host, params) {
  const url = new URL(`https://${host}/api.php`);
  Object.entries({ action: "query", format: "json", ...params }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { "User-Agent": "MineMeteor/1.0 (Minecraft Q&A site)" }, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`wiki answered HTTP ${res.status}`);
  return res.json();
}

// Tool input is model output: validate it before use (eager input streaming can hand us a partial object).
const str = (v, max) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);

exports.runTool = async function runTool(name, input) {
  const host = name.includes("fandom") ? HOSTS.minecraft_fandom : HOSTS.minecraft_wiki;
  try {
    if (name === "search_minecraft_wiki" || name === "search_minecraft_fandom") {
      const q = str(input && input.query, 200);
      if (!q) return { isError: true, text: "invalid input: 'query' must be a short non-empty string" };
      const data = await mediawiki(host, { generator: "search", gsrsearch: q, gsrlimit: 5, prop: "extracts", explaintext: 1, exintro: 1 });
      const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      if (!pages.length) return { text: `No results for "${q}".` };
      return { text: pages.map((p) => `# ${p.title}\n${(p.extract || "").slice(0, 600)}`).join("\n\n") };
    }
    if (name === "get_minecraft_wiki_page" || name === "get_minecraft_fandom_page") {
      const t = str(input && input.title, 200);
      if (!t) return { isError: true, text: "invalid input: 'title' must be a short non-empty string" };
      const data = await mediawiki(host, { titles: t, prop: "extracts", explaintext: 1, redirects: 1 });
      const page = Object.values((data.query && data.query.pages) || {})[0];
      if (!page || page.missing !== undefined || !page.extract) return { isError: true, text: `No page titled "${t}". Try the search tool first.` };
      const text = page.extract.length > MAX_PAGE_CHARS ? page.extract.slice(0, MAX_PAGE_CHARS) + "\n[...page truncated]" : page.extract;
      return { text: `# ${page.title}\n${text}` };
    }
    return { isError: true, text: `unknown tool ${name}` };
  } catch (e) {
    return { isError: true, text: `The wiki lookup failed (${String((e && e.message) || e)}). Answer from your own knowledge and say it is unverified.` };
  }
};
