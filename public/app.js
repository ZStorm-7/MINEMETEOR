(() => {
  const log = document.getElementById("log");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const menu = document.getElementById("menu");
  const tabs = document.getElementById("tabs");
  const qs = document.getElementById("qs");
  const menuBtn = document.getElementById("menuBtn");
  const MENU = {
    "⚒ Crafting": [
      "What are all the ingredients and the exact crafting recipe for an anvil, and how do I repair it?",
      "How do I craft and use a smithing table, and how do netherite upgrades work step by step?",
      "What is the full recipe for an enchanting table and how many bookshelves do I need for level 30?",
      "Which recipes use copper, and how do I stop copper from oxidizing?",
      "What's the fastest way to craft a full set of iron tools and armor with the fewest ingots?"
    ],
    "👹 Mobs": [
      "How do I safely defeat a Creeper, and what is its explosion radius on Java vs Bedrock?",
      "What are the Warden's mechanics, and how do I sneak past or beat it?",
      "How do I breed and tame every pet-type mob (wolf, cat, horse, parrot, axolotl)?",
      "What are the drops, spawn conditions and weaknesses of every hostile mob in the Overworld?",
      "How do Endermen work, and how do I build an enderman farm?"
    ],
    "⚡ Redstone": [
      "How do I build a simple redstone clock, and how do I change its speed?",
      "Explain how repeaters, comparators, observers and pistons work with a build example for each.",
      "Give me a compact 3x3 piston door design and the materials it needs.",
      "What's the difference between Java and Bedrock redstone, including quasi-connectivity?",
      "How do I build an item sorter that handles multiple item types?"
    ],
    "🌍 Biomes & Structures": [
      "Where do I find diamonds, and which Y-level is best in the current version?",
      "How do I locate a stronghold and reach the End portal with eyes of ender?",
      "How do I find and loot an ancient city, trial chamber, and woodland mansion?",
      "Which biomes have the rarest resources and how do I find them (cherry grove, mangrove, deep dark)?",
      "How do I find a village and what trades are best from each villager profession?"
    ],
    "⚔ Combat & Gear": [
      "What are the best enchantments for a sword, a bow and a full armor set?",
      "How does combat damage work, including cooldowns, crits, shields and armor toughness?",
      "Which potions should I bring to fight the Ender Dragon, and how do I brew them?",
      "How do I use a mace, trident and crossbow effectively?",
      "What's the best armor trim and enchant setup for survival PvE?"
    ],
    "🔥 Nether & End": [
      "How do I build a Nether portal and set up fast travel between two locations?",
      "Where are bastions, fortresses and ancient debris, and how do I find netherite quickly?",
      "What is the full strategy to defeat the Ender Dragon, step by step?",
      "How do I find end cities and elytra, and what's inside them?",
      "How do I defeat the Wither and what do I need to prepare?"
    ],
    "🌾 Farming": [
      "What's the most efficient automatic wheat/carrot/potato farm design?",
      "How do I build an iron golem farm, and how many iron ingots per hour does it make?",
      "How do I make an XP farm using a mob spawner or a mob grinder?",
      "What are the best crops for fast hunger recovery and trading with villagers?",
      "How do I set up a sugar cane, bamboo, or kelp auto-farm?"
    ],
    "⌨ Commands & Versions": [
      "List the most useful cheat commands with examples (/give, /tp, /fill, /gamemode, /gamerule).",
      "What are the key differences between Java and Bedrock editions?",
      "What's new in the latest Minecraft update, and which features changed most?",
      "How do I use command blocks, and what are the types (impulse, chain, repeating)?",
      "What does each gamerule do, and which ones are most useful for servers?"
    ]
  };
  const btn = form.querySelector("button");

  let sessionId;
  try { sessionId = localStorage.getItem("mm-session"); } catch {}
  if (!sessionId) {
    sessionId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
    try { localStorage.setItem("mm-session", sessionId); } catch {}
  }

  // only auto-follow new text while the reader is at the bottom; scrolling up releases it
  let pinned = true;
  log.addEventListener("scroll", () => {
    pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  });
  const follow = () => { if (pinned) log.scrollTop = log.scrollHeight; };

  function add(text, cls) {
    const d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text; // textContent: never render model output as HTML
    log.appendChild(d);
    if (cls === "user") pinned = true;
    follow();
    return d;
  }

  // n8n streams newline-delimited JSON: {type:"begin"|"item"|"end", content?}
  async function ask(message) {
    add(message, "user");
    const bot = add("Mining for an answer… ⛏️", "bot");
    btn.disabled = true;
    let text = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      if (!res.ok) throw new Error(res.status === 429 ? "too many messages, slow down" : "HTTP " + res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handle = (line) => {
        if (!line.trim()) return;
        try {
          const j = JSON.parse(line);
          if (j.type === "item" && typeof j.content === "string") text += j.content;
          else if (j.output) text += j.output; // non-streaming fallback
        } catch { text += line; }
        if (text) { bot.textContent = text; follow(); }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        lines.forEach(handle);
      }
      handle(buf);
      if (!text) bot.textContent = "Hmm, I got no answer back. Try again!";
    } catch (e) {
      bot.textContent = "A creeper blew up the connection (" + e.message + "). Try again!";
      bot.classList.add("err");
    } finally {
      btn.disabled = false;
      follow();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const m = input.value.trim();
    if (!m) return;
    input.value = "";
    closeMenu();
    ask(m);
  });
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); document.querySelector(".chat").classList.remove("menu-open"); }
  function showCategory(name) {
    qs.textContent = "";
    MENU[name].forEach((q) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = q;
      b.addEventListener("click", () => { closeMenu(); ask(q); });
      qs.appendChild(b);
    });
    [...tabs.children].forEach((t) => t.classList.toggle("active", t.dataset.cat === name));
  }
  Object.keys(MENU).forEach((name, i) => {
    const t = document.createElement("button");
    t.type = "button"; t.textContent = name; t.dataset.cat = name; t.setAttribute("role", "tab");
    t.addEventListener("click", () => showCategory(name));
    tabs.appendChild(t);
    if (i === 0) showCategory(name);
  });
  menuBtn.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
    document.querySelector(".chat").classList.toggle("menu-open", !menu.hidden);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  // navy night sky -> sky blue day after 60 seconds
  setTimeout(() => document.body.classList.add("day"), 60000);

  add("Meteor incoming! ☄️ What are we digging into today?", "bot");
})();
