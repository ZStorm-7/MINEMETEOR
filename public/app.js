(() => {
  const log = document.getElementById("log");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const menu = document.getElementById("menu");
  const tabs = document.getElementById("tabs");
  const qs = document.getElementById("qs");
  const menuBtn = document.getElementById("menuBtn");
  const histBtn = document.getElementById("histBtn");
  const hist = document.getElementById("history");
  const chatEl = document.querySelector(".chat");
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
  const btn = form.querySelector("button.send");
  const GREETING = "Meteor incoming! ☄️ What are we digging into today?";

  // ---------- chat history (localStorage) ----------
  const KEY = "mm-chats-v1";
  const uid = () => (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
  let store = { chats: [], current: null };
  try { store = JSON.parse(localStorage.getItem(KEY)) || store; } catch {}
  function save() {
    store.chats = store.chats.slice(0, 30);
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  }
  function newChat() {
    const c = { id: uid(), title: "New chat", ts: Date.now(), msgs: [] };
    store.chats.unshift(c); store.current = c.id; save();
    return c;
  }
  let chat = store.chats.find((c) => c.id === store.current) || newChat();

  // ---------- scrolling: never fight the reader ----------
  let pinned = true;
  const release = () => { pinned = false; };
  log.addEventListener("wheel", (e) => { if (e.deltaY < 0) release(); }, { passive: true });
  log.addEventListener("pointerdown", release);          // scrollbar drag / touch start
  log.addEventListener("keydown", (e) => { if (["ArrowUp", "PageUp", "Home"].includes(e.key)) release(); });
  log.addEventListener("scroll", () => {
    if (log.scrollHeight - log.scrollTop - log.clientHeight < 8) pinned = true; // back at bottom -> follow again
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

  function render() {
    log.textContent = "";
    add(GREETING, "bot");
    chat.msgs.forEach((m) => add(m.t, m.r === "user" ? "user" : "bot"));
    pinned = true; follow();
  }

  // ---------- talking to n8n (streamed newline-delimited JSON) ----------
  async function ask(message) {
    const c = chat; // keep writing to this chat even if the reader switches away mid-answer
    c.msgs.push({ r: "user", t: message });
    if (c.title === "New chat") c.title = message.slice(0, 40);
    c.ts = Date.now(); save();
    add(message, "user");
    const bot = add("Mining for an answer… ⛏️", "bot");
    btn.disabled = true;
    let text = "", raf = 0;
    const paint = () => { raf = 0; if (text) { bot.textContent = text; follow(); } }; // batch DOM work: smooth scrolling on huge answers
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: c.id }),
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
        if (!raf) raf = requestAnimationFrame(paint);
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
      if (raf) cancelAnimationFrame(raf);
      if (!text) { text = "Hmm, I got no answer back. Try again!"; bot.classList.add("err"); }
      else c.msgs.push({ r: "bot", t: text.slice(0, 20000) });
      bot.textContent = text;
    } catch (e) {
      if (raf) cancelAnimationFrame(raf);
      bot.textContent = "A creeper blew up the connection (" + e.message + "). Try again!";
      bot.classList.add("err");
    } finally {
      btn.disabled = false;
      save(); follow();
    }
  }

  // ---------- panels: menu + history ----------
  function closePanels() {
    menu.hidden = true; hist.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false"); histBtn.setAttribute("aria-expanded", "false");
    chatEl.classList.remove("menu-open");
  }
  function openPanel(panel, button) {
    const wasOpen = !panel.hidden;
    closePanels();
    if (!wasOpen) {
      panel.hidden = false; button.setAttribute("aria-expanded", "true"); chatEl.classList.add("menu-open");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const m = input.value.trim();
    if (!m) return;
    input.value = "";
    closePanels();
    ask(m);
  });

  function showCategory(name) {
    qs.textContent = "";
    MENU[name].forEach((q) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = q;
      b.addEventListener("click", () => { closePanels(); ask(q); });
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
  menuBtn.addEventListener("click", () => openPanel(menu, menuBtn));

  function renderHistory() {
    hist.textContent = "";
    const top = document.createElement("button");
    top.type = "button"; top.className = "hist-new"; top.textContent = "＋ New chat";
    top.addEventListener("click", () => { chat = newChat(); render(); closePanels(); });
    hist.appendChild(top);
    store.chats.filter((c) => c.msgs.length).forEach((c) => {
      const row = document.createElement("div");
      row.className = "hist-row" + (c.id === chat.id ? " current" : "");
      const open = document.createElement("button");
      open.type = "button"; open.className = "hist-open";
      open.textContent = "💬 " + c.title + "  ·  " + new Date(c.ts).toLocaleDateString();
      open.addEventListener("click", () => { chat = c; store.current = c.id; save(); render(); closePanels(); });
      const del = document.createElement("button");
      del.type = "button"; del.className = "hist-del"; del.textContent = "✕"; del.title = "Delete chat";
      del.addEventListener("click", () => {
        store.chats = store.chats.filter((x) => x.id !== c.id);
        if (chat.id === c.id) { chat = store.chats[0] || newChat(); store.current = chat.id; render(); }
        save(); renderHistory();
      });
      row.append(open, del);
      hist.appendChild(row);
    });
    if (hist.children.length === 1) {
      const p = document.createElement("p"); p.className = "hist-empty"; p.textContent = "No saved chats yet — ask something! ⛏️";
      hist.appendChild(p);
    }
  }
  histBtn.addEventListener("click", () => { renderHistory(); openPanel(hist, histBtn); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  // navy night sky -> sky blue day after 60 seconds
  setTimeout(() => document.body.classList.add("day"), 60000);

  // clock: local time, icon follows the sky
  const clockTime = document.getElementById("clockTime");
  const clockIcon = document.getElementById("clockIcon");
  function tick() {
    clockTime.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    clockIcon.textContent = document.body.classList.contains("day") ? "☀️" : "🌙";
  }
  tick(); setInterval(tick, 1000);

  render();
})();
