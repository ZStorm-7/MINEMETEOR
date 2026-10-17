// Vercel serverless function: POST /api/chat  { message, history?: [{role,text}] }  ->  streamed NDJSON
const { streamChat } = require("../lib/chat");
module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  await streamChat(req.body && typeof req.body === "object" ? req.body : {}, res, ip);
};
