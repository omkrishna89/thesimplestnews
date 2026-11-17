// The Simplest News — the "On other news websites" headlines in the shortest, simplest words.
//
// A free Cloudflare Worker (workers.dev). When a reader searches, the website sends the other websites' headlines
// here, and Google's free Gemma model writes each one again: at most 8 words in English, 10 in Hindi.
// Gemma has its own free limit (about 14,400 requests a day), so the website's Gemini limit is not touched.
//
// Setup (once, all free): README, Step 10.
//   1. dash.cloudflare.com > Workers & Pages > Create > Worker > Deploy, then "Edit code": paste this file, Deploy.
//   2. Settings > Variables and Secrets > Add > Secret: GEMINI_API_KEY = the same Gemini key as on GitHub.
//   3. Put the Worker's address (https://<name>.<you>.workers.dev) in config/site.json > "rewrite" > "url".
// Optional (plain text variable): GEMMA_MODEL = a model name (e.g. gemma-3-27b-it). Empty = the Worker picks the best Gemma.
//
// The website sends:  POST {"lang": "en" | "hi", "items": ["headline", ...]}   (at most 40 headlines)
// The Worker answers: {"items": ["simple headline" | null, ...]}               (null = keep the website's own headline)
// Opening the Worker's address in a browser shows whether it works.

const API = "https://generativelanguage.googleapis.com/v1beta";
// only these websites may use the Worker (and a copy of the site on this computer, for testing)
const SITES = ["https://thesimplestnews.com", "https://www.thesimplestnews.com", "https://omkrishna89.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const MAX_ITEMS = 40;
const MAX_LEN = 220; // characters in one headline sent
const MAX_BODY = 16000;
const DAY = 86400e3;
const WORDS = { en: 8, hi: 10 }; // what Gemma is asked for
const MOST = { en: 12, hi: 15 }; // longer answers are thrown away

const memo = new Map(); // "lang|headline" -> simple headline (kept while this copy of the Worker runs)
let picked = { name: "", at: 0 };

const okOrigin = (o) => SITES.includes(o) || LOCAL.test(o || "");
function cors(origin) {
  return okOrigin(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" }
    : { vary: "Origin" };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

// ---------- which Gemma model ----------
// The newest Gemma, and the biggest of it: "gemma-3-27b-it" before "gemma-3-12b-it" before "gemma-3n-e4b-it".
function rank(name) {
  const m = /^gemma-(\d+(?:\.\d+)?)(n?)-(?:e)?(\d+(?:\.\d+)?)b/.exec(name) || [];
  const version = Number(m[1]) || 0;
  const size = Math.min(Number(m[3]) || 0, 900);
  return version * 10000 - (m[2] ? 5000 : 0) + size + (/-it$/.test(name) ? 0.5 : 0);
}
async function model(env, fresh = false) {
  if (env.GEMMA_MODEL) return String(env.GEMMA_MODEL).replace(/^models\//, "").trim();
  if (!fresh && picked.name && Date.now() - picked.at < DAY) return picked.name;
  const r = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
  if (!r.ok) throw new Error(`Google answered ${r.status} for the list of models${r.status === 400 || r.status === 403 ? " (is GEMINI_API_KEY right?)" : ""}`);
  const names = ((await r.json()).models || [])
    .filter((m) => /^models\/gemma-/.test(m.name || "") && (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.slice("models/".length))
    .sort((a, b) => rank(b) - rank(a));
  if (!names.length) throw new Error("Google has no Gemma model for this key");
  picked = { name: names[0], at: Date.now() };
  return picked.name;
}

// ---------- what Gemma is asked ----------
function prompt(lang, items) {
  const en = lang !== "hi";
  return `You make news headlines short and simple for "The Simplest News", an Indian news website read on phones.
Write each headline below again as the shortest, simplest ${en ? "English" : "Hindi"} headline:
- at most ${WORDS[en ? "en" : "hi"]} words, in very simple everyday words that a 10-year-old understands
- ${en ? "plain simple English" : "simple spoken Hindi in Devanagari letters (common English words like IPL, UPI, GST, AI are fine)"}; a headline in another language: write it in ${en ? "English" : "Hindi"}
- keep the main fact: who did what, with the names, numbers and places right
- add nothing that the headline does not say; no opinions, no clickbait, no "BREAKING"
- no quote marks, no emojis, no website names, no full stop at the end
Answer with ONLY a JSON array of exactly ${items.length} strings, in the same order as the headlines. Nothing else.

Headlines:
${items.map((h, i) => `${i + 1}. ${h}`).join("\n")}`;
}

// ---------- reading Gemma's answer (it may wrap the list in ``` or write numbered lines) ----------
const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN = /\p{Script=Latin}/u;
function tidy(s, lang) {
  if (s && typeof s === "object") s = Object.values(s).find((v) => typeof v === "string");
  if (typeof s !== "string") return null;
  s = s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’«»`*]+|["'“”‘’«»`*]+$/g, "")
    .replace(/(?<!\p{Lu})[\s.।|]+$/u, "") // no full stop at the end ("U.S." keeps its own)
    .trim();
  if (!s || s.length > 140) return null;
  const words = s.split(" ").length;
  if (words > MOST[lang === "hi" ? "hi" : "en"]) return null;
  if (lang === "hi" ? !DEVANAGARI.test(s) : !LATIN.test(s) || DEVANAGARI.test(s)) return null; // the wrong language
  return s;
}
function readList(text, n, lang) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("[");
  const b = t.lastIndexOf("]");
  let list = null;
  if (a >= 0 && b > a) {
    try {
      list = JSON.parse(t.slice(a, b + 1));
    } catch {}
  }
  if (!Array.isArray(list)) {
    // numbered lines: "1. ...", "2) ..."
    const lines = [...t.matchAll(/^\s*(\d{1,2})[.):]\s+(.+?)\s*$/gm)];
    if (lines.length !== n || lines.some((m, i) => Number(m[1]) !== i + 1)) return Array(n).fill(null);
    list = lines.map((m) => m[2]);
  }
  if (list.length !== n) return Array(n).fill(null); // the wrong number: the order can't be trusted
  return list.map((s) => tidy(s, lang));
}

async function ask(env, lang, items) {
  let name = await model(env);
  for (let tries = 0; tries < 2; tries++) {
    const r = await fetch(`${API}/models/${encodeURIComponent(name)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt(lang, items) }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2048 } }),
    });
    if (r.status === 404 && !env.GEMMA_MODEL && tries === 0) {
      name = await model(env, true); // the model is gone: pick again
      continue;
    }
    if (!r.ok) {
      const e = new Error(`Gemma answered ${r.status}`);
      e.status = r.status;
      throw e;
    }
    const data = await r.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    return readList(text, items.length, lang);
  }
  throw new Error("no Gemma model answered");
}

// ---------- the Worker ----------
async function rewrite(request, env) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return { status: 413, data: { error: "too big" } };
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { status: 413, data: { error: "too big" } };
    body = JSON.parse(text);
  } catch {
    return { status: 400, data: { error: "send JSON" } };
  }
  const lang = body?.lang === "hi" ? "hi" : "en";
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items || !items.length || items.length > MAX_ITEMS || items.some((h) => typeof h !== "string")) return { status: 400, data: { error: `send 1 to ${MAX_ITEMS} headlines` } };
  const heads = items.map((h) => h.replace(/\s+/g, " ").trim().slice(0, MAX_LEN));
  const key = (h) => `${lang}|${h}`;
  const out = heads.map((h) => memo.get(key(h)) ?? null);
  const todo = [...new Set(heads.filter((h, i) => h && out[i] === null && !memo.has(key(h))))];
  if (todo.length) {
    if (!env.GEMINI_API_KEY) return { status: 500, data: { error: "the Worker has no GEMINI_API_KEY secret" } };
    let got;
    try {
      got = await ask(env, lang, todo);
    } catch (e) {
      return { status: e.status === 429 ? 429 : 502, data: { error: String(e.message || e), items: out } };
    }
    // a headline Gemma could not write is not asked again (unless its whole answer was unreadable)
    const readable = got.some(Boolean);
    todo.forEach((h, i) => {
      if (got[i] === null && !readable) return;
      if (memo.size > 5000) memo.delete(memo.keys().next().value); // the oldest first
      memo.set(key(h), got[i]);
    });
    heads.forEach((h, i) => (out[i] = memo.get(key(h)) ?? null));
  }
  return { status: 200, data: { items: out } };
}

async function status(env) {
  if (!env.GEMINI_API_KEY) return "❌ Not ready: add the secret GEMINI_API_KEY (Settings > Variables and Secrets), then open this page again.";
  try {
    return `✅ The Simplest News headline writer works. Model: ${await model(env)}.\nPut this page's address in config/site.json > "rewrite" > "url".`;
  } catch (e) {
    return `❌ ${e.message || e}`;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: okOrigin(origin) ? 204 : 403, headers });
    if (request.method === "GET") return new Response(await status(env), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
    if (request.method !== "POST") return json({ error: "use POST" }, 405, headers);
    if (!okOrigin(origin)) return json({ error: "only for thesimplestnews.com" }, 403, headers);
    const { status: code, data } = await rewrite(request, env);
    return json(data, code, headers);
  },
};
