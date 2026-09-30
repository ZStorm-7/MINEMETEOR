(() => {
  const cfg = window.MINE_METEOR_CONFIG || {};
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

  async function ask(message) {
    if (!cfg.WEBHOOK_URL) {
      add("The n8n webhook isn't configured yet — set WEBHOOK_URL in config.js.", "bot err");
      return;
    }
    add(message, "user");
    const pending = add("Mining for an answer… ⛏️", "bot");
    btn.disabled = true;
    try {
      const res = await fetch(cfg.WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const raw = await res.text();
      let reply = raw;
      try {
        const j = JSON.parse(raw);
        const o = Array.isArray(j) ? j[0] : j;
        reply = o.output ?? o.text ?? o.reply ?? o.message ?? raw;
      } catch {}
      pending.textContent = String(reply);
    } catch (e) {
      pending.textContent = "A creeper blew up the connection (" + e.message + "). Try again!";
      pending.classList.add("err");
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

  add("Meteor incoming! ☄️ What are we digging into today?", "bot");
})();
