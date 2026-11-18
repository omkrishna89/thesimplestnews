// Cloudflare's free AI as a second helper when Google's Gemini is busy, through the site's own Worker
// (worker/rewrite.js, job "ai"). The Worker answers only the site's robot: the request is signed with the Gemini key,
// which both of them already have (GitHub secret GEMINI_API_KEY and the Worker's secret of the same name).
import crypto from "node:crypto";
import { config } from "./util.mjs";

const site = config("site.json");
const CF = site.rewrite || {};
const URL = process.env.REWRITE_URL || CF.url; // (another address for testing)
export const workerReady = () => !!(URL && process.env.GEMINI_API_KEY);
export const sign = (key, ts) => crypto.createHmac("sha256", key).update(`ai|${ts}`).digest("hex");
// The model that writes stories (only this one: its Hindi is the best of Cloudflare's models)
export const CF_WRITER = CF.writer || "@cf/mistralai/mistral-small-3.1-24b-instruct";

// models: ask only these of Cloudflare's models. Returns { text, model, usage } (usage = the tokens, when Cloudflare says)
export async function workerAI(prompt, max = 3000, { timeoutMs = 75000, models } = {}) {
  const ts = Date.now();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "ai", prompt, max, ts, proof: sign(process.env.GEMINI_API_KEY, ts), ...(models ? { models } : {}) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok || typeof data?.text !== "string") throw new Error(`Cloudflare AI: ${data?.error || `HTTP ${r.status}`}`);
  return { text: data.text, model: data.model, usage: data.usage };
}

// ---------- the robot's part of Cloudflare's free daily allowance ----------
// Cloudflare counts its free allowance in "neurons" (10,000 a day, from midnight UTC). The site's visitors use it too
// (simple headlines for internet news, answers written on tap), so the robot keeps to its part (robotShare), and
// sorting headlines may use only a part of that (sortShare): writing stories comes first.
// Neurons per million tokens, from Cloudflare's price list: [what is sent, the answer]
const NEURONS = {
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31876, 50488],
  "@cf/meta/llama-4-scout-17b-16e-instruct": [24545, 77273],
  "@cf/meta/llama-3.1-8b-instruct-fast": [4119, 34868],
  "@cf/google/gemma-3-12b-it": [31371, 50560],
};
// The neurons one request used: from the tokens Cloudflare reports or, without them, about one token per 2.5 letters
export function neuronsOf({ model, usage, text = "" }, prompt = "") {
  const [a, b] = NEURONS[model] || [31876, 77273];
  const sent = Number(usage?.prompt_tokens) || Math.ceil(prompt.length / 2.5);
  const got = Number(usage?.completion_tokens) || Math.ceil(String(text).length / 2.5);
  return (sent * a + got * b) / 1e6;
}

// Today's use, kept in the database: db.cfUse = { day, sort, write (neurons), req, sorted, stories }
export function cfUse(db, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (db.cfUse?.day !== day) db.cfUse = { day, sort: 0, write: 0, req: 0, sorted: 0, stories: 0 };
  return db.cfUse;
}
// Neurons left today for a job ("sort" or "write")
export function cfLeft(db, job, now = Date.now()) {
  const u = cfUse(db, now);
  const robot = (CF.dailyNeurons ?? 10000) * (CF.robotShare ?? 0.5);
  const left = robot - u.sort - u.write;
  return Math.max(0, Math.round(job === "sort" ? Math.min(left, robot * (CF.sortShare ?? 0.2) - u.sort) : left));
}
