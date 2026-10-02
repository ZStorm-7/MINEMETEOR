(() => {
  const log = document.getElementById("log");
  const form = document.getElementById("form");
  const input = document.getElementById("input");
  const chips = document.getElementById("chips");
  const btn = form.querySelector("button");

  let sessionId;
  try { sessionId = localStorage.getItem("mm-session"); } catch {}
  if (!sessionId) {
    sessionId = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random();
    try { localStorage.setItem("mm-session", sessionId); } catch {}
  }

  function add(text, cls) {
    const d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text; // textContent: never render model output as HTML
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
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
        if (text) { bot.textContent = text; log.scrollTop = log.scrollHeight; }
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
      log.scrollTop = log.scrollHeight;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const m = input.value.trim();
    if (!m) return;
    input.value = "";
    chips.hidden = true;
    ask(m);
  });
  chips.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") { chips.hidden = true; ask(e.target.textContent); }
  });

  // navy night sky -> sky blue day after 60 seconds
  setTimeout(() => document.body.classList.add("day"), 60000);

  add("Meteor incoming! ☄️ What are we digging into today?", "bot");
})();
