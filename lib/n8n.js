// Provider: your self-hosted n8n. The Vercel function only forwards the chat to the n8n "Chat Trigger" webhook,
// so the Anthropic credential lives inside n8n and Vercel needs no AI key.
//   N8N_WEBHOOK_URL   the Chat Trigger's production URL (https://<your-n8n>/webhook/<id>/chat)
//   N8N_AUTH_HEADER   optional: header name that carries a shared secret (e.g. "X-Meteor-Key") ...
//   N8N_AUTH_VALUE    ... and its value (set the same check in n8n: Chat Trigger -> Authentication -> Header Auth)
const url = () => (process.env.N8N_WEBHOOK_URL || "").trim();
exports.hasUrl = () => Boolean(url());
class N8nError extends Error {}
exports.N8nError = N8nError;

// emit(textDelta). n8n streams newline-delimited JSON: {"type":"begin"} {"type":"item","content":"..."} {"type":"end"}
exports.runN8n = async function runN8n({ message, sessionId, emit }) {
  const headers = { "Content-Type": "application/json", Accept: "application/x-ndjson, application/json" };
  if (process.env.N8N_AUTH_HEADER && process.env.N8N_AUTH_VALUE) headers[process.env.N8N_AUTH_HEADER] = process.env.N8N_AUTH_VALUE;
  let res;
  try {
    res = await fetch(url(), {
      method: "POST",
      headers,
      // n8n's Conversation Memory is keyed by sessionId, so the browser's chat id keeps each chat's context separate
      body: JSON.stringify({ action: "sendMessage", sessionId: String(sessionId || "web").slice(0, 80), chatInput: String(message).slice(0, 2000) }),
      signal: AbortSignal.timeout(55000),
    });
  } catch (e) {
    throw new N8nError("could not reach n8n (" + String((e && e.message) || e).slice(0, 80) + "). Is the workflow Active and the URL reachable from the internet?");
  }
  if (!res.ok) {
    const hint = res.status === 404 ? " - is the workflow Active, and is N8N_WEBHOOK_URL the *production* URL (not /webhook-test/)?"
      : res.status === 401 || res.status === 403 ? " - the n8n auth header does not match" : "";
    throw new N8nError(`n8n answered HTTP ${res.status}${hint}`);
  }

  let got = false, buf = "";
  const handle = (line) => {
    if (!line.trim()) return;
    let j;
    try { j = JSON.parse(line); } catch { got = true; emit(line); return; }          // plain text fallback
    if (j.type === "error") throw new N8nError("n8n workflow error: " + String(j.content || j.message || "unknown").slice(0, 160));
    if (j.type === "item" && typeof j.content === "string") { got = true; emit(j.content); }
    else if (typeof j.output === "string") { got = true; emit(j.output); }          // non-streaming response mode
    else if (typeof j.text === "string") { got = true; emit(j.text); }
  };
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    lines.forEach(handle);
  }
  handle(buf);
  if (!got) throw new N8nError("n8n returned an empty answer (check the workflow's Chat Trigger response mode and the agent's execution log)");
};
