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

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const fmtStamp = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  function add(text, cls, ts) {
    const d = document.createElement("div");
    d.className = "msg " + cls;
    if (ts) d.dataset.time = "  ·  " + fmtTime(ts);
    d.textContent = text; // textContent: never render model output as HTML
    log.appendChild(d);
    if (cls === "user") pinned = true;
    follow();
    return d;
  }

  function render() {
    log.textContent = "";
    add(GREETING, "bot");
    chat.msgs.forEach((m) => add(m.t, m.r === "user" ? "user" : "bot", m.ts));
    pinned = true; follow();
  }

  // ---------- talking to n8n (streamed newline-delimited JSON) ----------
  async function ask(message) {
    const c = chat; // keep writing to this chat even if the reader switches away mid-answer
    const sent = Date.now();
    c.msgs.push({ r: "user", t: message, ts: sent });
    if (c.title === "New chat") c.title = message.slice(0, 40);
    c.ts = sent; save();
    add(message, "user", sent);
    const bot = add("Mining for an answer… ⛏️", "bot", sent);
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
      else {
        const done = Date.now();
        c.msgs.push({ r: "bot", t: text.slice(0, 20000), ts: done });
        c.ts = done; bot.dataset.time = "  ·  " + fmtTime(done);
      }
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
      open.textContent = "💬 " + c.title + "  ·  " + fmtStamp(c.ts);
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


  // ---------- lava pools over the ore grid (blocks are 64px; the underground tile repeats every 1536px) ----------
  const stoneEl = document.querySelector(".stone");
  const POOLS = [[4, 4, 2, 1], [12, 3, 1, 2], [19, 4, 3, 1]]; // [col,row,w,h] in blocks, matching tools/make_underground.py
  function buildLava() {
    stoneEl.querySelectorAll(".lava").forEach((n) => n.remove());
    const periods = Math.ceil(window.innerWidth / 1536) + 1;
    for (let p = 0; p < periods; p++) {
      POOLS.forEach(([c, r, w, h]) => {
        const d = document.createElement("div");
        d.className = "lava";
        d.style.cssText = `left:${p * 1536 + c * 64}px;top:${r * 64}px;width:${w * 64}px;height:${h * 64}px`;
        stoneEl.appendChild(d);
      });
    }
  }
  buildLava();
  window.addEventListener("resize", buildLava);

  // ---------- explosions: small + large (pixel particles on a canvas) ----------
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fx = document.getElementById("fx");
  const ctx = fx.getContext("2d");
  const flashEl = document.getElementById("flash");
  let parts = [], running = false;
  function sizeFx() { fx.width = window.innerWidth; fx.height = window.innerHeight; }
  sizeFx(); window.addEventListener("resize", sizeFx);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const snap = (v, g = 4) => Math.round(v / g) * g;
  const FIRE = ["#fff3b0", "#ffd23f", "#ff9a2b", "#e8501a", "#b3290d"];
  const SMOKE = ["#4a4a4a", "#666", "#808080", "#9a9a9a"];
  const DEBRIS = ["#5a3d27", "#7a5539", "#6b6b6b", "#8b8b8b", "#3a3a3a"];

  function boom(x, y, big) {
    const n = big ? 130 : 30, sp = big ? 11 : 6;
    for (let i = 0; i < n; i++) {                     // fire burst
      const a = rnd(0, Math.PI * 2), s = rnd(1, sp);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, g: 0.12, life: rnd(20, big ? 46 : 30), max: 46,
        size: snap(rnd(big ? 8 : 4, big ? 20 : 10)), color: pick(FIRE), shrink: true });
    }
    for (let i = 0; i < (big ? 46 : 12); i++) {       // rising smoke
      const a = rnd(0, Math.PI * 2), s = rnd(0.3, sp * 0.45);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - rnd(0.5, 1.6), g: -0.02, life: rnd(40, big ? 90 : 60), max: 90,
        size: snap(rnd(big ? 12 : 8, big ? 32 : 16)), color: pick(SMOKE), fade: true });
    }
    for (let i = 0; i < (big ? 38 : 9); i++) {        // block debris with gravity
      const a = rnd(-Math.PI, 0), s = rnd(3, sp * 1.1);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.35, life: rnd(40, 80), max: 80,
        size: snap(rnd(4, big ? 12 : 8)), color: pick(DEBRIS) });
    }
    if (big) {                                         // expanding blocky shockwave ring
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        parts.push({ x, y, vx: Math.cos(a) * 9, vy: Math.sin(a) * 9, g: 0, life: 16, max: 16, size: 12, color: "#ffe9a8", fade: true });
      }
      if (!reduceMotion) {
        flashEl.classList.remove("on"); void flashEl.offsetWidth; flashEl.classList.add("on");
        const shaken = document.querySelectorAll(".chat, .hero");
        shaken.forEach((el) => { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); });
        setTimeout(() => shaken.forEach((el) => el.classList.remove("shake")), 520);
      }
    }
    if (!running) { running = true; requestAnimationFrame(stepFx); }
  }
  function stepFx() {
    ctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.97; p.life--;
      const t = p.life / p.max;
      const s = p.shrink ? Math.max(4, snap(p.size * Math.min(1, t * 2))) : p.size;
      ctx.globalAlpha = p.fade ? Math.max(0, Math.min(1, t * 1.6)) : 1;
      ctx.fillStyle = p.color;
      ctx.fillRect(snap(p.x), snap(p.y), s, s);
    }
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(stepFx); else running = false;
  }

  // a textured meteor crashes in, then explodes where it lands
  function strike(big) {
    const x = rnd(window.innerWidth * 0.08, window.innerWidth * 0.92);
    const y = window.innerHeight - rnd(40, 120);
    const size = big ? 140 : 72, D = y + size + 40;
    const img = document.createElement("img");
    img.src = "meteor.svg"; img.alt = ""; img.className = "strike"; img.style.width = img.style.height = size + "px";
    const tx = x - 0.29 * size, ty = y - 0.71 * size; // meteor head sits at ~29%,71% of the sprite
    img.style.left = tx + "px"; img.style.top = ty + "px";
    document.body.appendChild(img);
    const anim = img.animate(
      [{ transform: `translate(${D}px, ${-D}px)` }, { transform: "translate(0,0)" }],
      { duration: big ? 1100 : 750, easing: "ease-in" }
    );
    anim.onfinish = () => { img.remove(); boom(x, y, big); };
  }
  if (!reduceMotion) {
    const later = (fn, lo, hi) => setTimeout(() => { if (!document.hidden) fn(); later(fn, lo, hi); }, rnd(lo, hi));
    later(() => strike(false), 6000, 11000);
    later(() => strike(true), 35000, 55000);
  }

  // ---------- animated pickaxe cursor ----------
  if (window.matchMedia("(pointer: fine)").matches) {
    document.documentElement.classList.add("has-cursor");
    const pick = document.createElement("img");
    pick.src = "pickaxe.svg"; pick.alt = ""; pick.className = "pick";
    document.body.appendChild(pick);
    const HX = 39, HY = 24; // hotspot = lower tip of the pickaxe head (in the 48px sprite)
    let mx = -100, my = -100, swing = null, lastTrail = 0;
    const SPARK = ["#e8ffff", "#5decf5", "#4adbe6", "#ffd23f"];
    const CHIP = ["#7a5539", "#8b8b8b", "#6b6b6b", "#5f5f5f", "#4adbe6"];
    const place = (rot = 0) => { pick.style.transform = `translate(${mx - HX}px, ${my - HY}px) rotate(${rot}deg)`; };
    const addPart = (o) => { parts.push(o); if (!running) { running = true; requestAnimationFrame(stepFx); } };

    document.addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      pick.classList.add("on");
      const t = e.target;
      pick.classList.toggle("hover", !!t.closest("button, a, .hist-open, .hist-del"));
      pick.classList.toggle("text", !!t.closest("input"));
      if (!swing) place();
      const now = performance.now();
      if (!reduceMotion && now - lastTrail > 28) {          // sparkle trail
        lastTrail = now;
        addPart({ x: mx + rnd(-4, 4), y: my + rnd(-4, 4), vx: rnd(-0.4, 0.4), vy: rnd(0.2, 0.9), g: 0.03, life: 22, max: 22,
          size: snap(rnd(4, 8)), color: pick_(SPARK), shrink: true });
      }
    });
    function pick_(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    document.addEventListener("mouseleave", () => pick.classList.remove("on"));
    document.addEventListener("mouseenter", () => pick.classList.add("on"));

    // click = swing the pickaxe + throw block chips
    document.addEventListener("mousedown", () => {
      if (reduceMotion) return;
      for (let i = 0; i < 9; i++) {
        const a = rnd(-Math.PI, 0.2), s = rnd(1.5, 4);
        addPart({ x: mx, y: my, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.3, life: rnd(18, 32), max: 32, size: snap(rnd(4, 8)), color: pick_(CHIP) });
      }
      if (swing) swing.cancel();
      swing = pick.animate(
        [{ transform: `translate(${mx - HX}px, ${my - HY}px) rotate(0deg)` },
         { transform: `translate(${mx - HX}px, ${my - HY}px) rotate(-55deg)`, offset: 0.4 },
         { transform: `translate(${mx - HX}px, ${my - HY}px) rotate(8deg)`, offset: 0.7 },
         { transform: `translate(${mx - HX}px, ${my - HY}px) rotate(0deg)` }],
        { duration: 240, easing: "ease-out" });
      swing.onfinish = swing.oncancel = () => { swing = null; place(); };
    });
  }

  // click empty sky/background = small boom; click the logo = BIG boom
  document.addEventListener("click", (e) => {
    if (e.target.closest("button, input, .log, .menu, .composer, .clock")) return;
    boom(e.clientX, e.clientY, !!e.target.closest(".logo"));
  });

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
