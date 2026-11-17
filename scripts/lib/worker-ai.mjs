// Cloudflare's free AI as a second helper when Google's Gemini is busy, through the site's own Worker
// (worker/rewrite.js, job "ai"). The Worker answers only the site's robot: the request is signed with the Gemini key,
// which both of them already have (GitHub secret GEMINI_API_KEY and the Worker's secret of the same name).
import crypto from "node:crypto";
import { config } from "./util.mjs";

const site = config("site.json");
export const workerReady = () => !!(site.rewrite?.url && process.env.GEMINI_API_KEY);
export const sign = (key, ts) => crypto.createHmac("sha256", key).update(`ai|${ts}`).digest("hex");

export async function workerAI(prompt, max = 3000, timeoutMs = 75000) {
  const ts = Date.now();
  const r = await fetch(site.rewrite.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "ai", prompt, max, ts, proof: sign(process.env.GEMINI_API_KEY, ts) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || typeof data?.text !== "string") throw new Error(`Cloudflare AI: ${data?.error || `HTTP ${r.status}`}`);
  return { text: data.text, model: data.model };
}
