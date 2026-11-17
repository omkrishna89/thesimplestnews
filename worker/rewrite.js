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
// Cloudflare's own free AI is asked first: Settings > Bindings > Add > Workers AI, variable name AI (README, Step 10).
// Optional plain-text variables: AI_MODEL = Cloudflare models to use, in order (e.g. @cf/mistralai/mistral-small-3.1-24b-instruct).
// GEMMA_MODEL = Google models to use, in order (e.g. gemma-4-26b-a4b-it,gemma-3-27b-it).
// Empty = the Worker lists Google's Gemma models itself: the fast new ones first.
// A model that is busy, fails or takes more than 12 seconds rests for 10 minutes, and the next one is asked.
//
// The website sends:  POST {"lang": "en" | "hi", "items": ["headline", ...]}   (at most 40 headlines)
// The Worker answers: {"items": ["simple headline" | null, ...], "model": "…"} (null = keep the website's own headline)
// Opening the Worker's address in a browser shows whether it works.

const API = "https://generativelanguage.googleapis.com/v1beta";
// only these websites may use the Worker (and a copy of the site on this computer, for testing)
const SITES = ["https://thesimplestnews.com", "https://www.thesimplestnews.com", "https://omkrishna89.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const MAX_ITEMS = 40;
const MAX_LEN = 220; // characters in one headline sent
const MAX_BODY = 16000;
const DAY = 86400e3;
const TRY_MS = 12000; // one model gets 12 seconds; then the next one is asked
const TOTAL_MS = 22000; // all of them together about 22 seconds (the website waits 25)
const REST_MS = 10 * 60e3; // a busy, failing or slow model rests 10 minutes
const MAX_TRIES = 3; // models asked for one request at most (each try uses the free limit)
const WORDS = { en: 8, hi: 10 }; // what Gemma is asked for
const MOST = { en: 12, hi: 15 }; // longer answers are thrown away

const memo = new Map(); // "lang|headline" -> simple headline (kept while this copy of the Worker runs)
const resting = new Map(); // model -> until when it is not asked
let known = { list: [], at: 0 }; // Google's Gemma models, best first (read again every day)

const okOrigin = (o) => SITES.includes(o) || LOCAL.test(o || "");
function cors(origin) {
  return okOrigin(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" }
    : { vary: "Origin" };
}
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

// ---------- which Gemma models, in which order ----------
// First the fast ones of the newest Gemma ("26b-a4b": 26 billion parameters, but only 4 billion work on each word),
// then the others by size, a newer Gemma counting a little bigger:
// gemma-4-26b-a4b-it, gemma-4-31b-it, gemma-3-27b-it, gemma-3-12b-it, gemma-4-e4b-it, gemma-3n-e4b-it, …
function score(name) {
  const m = /^gemma-(\d+(?:\.\d+)?)(n?)-(e?)(\d+(?:\.\d+)?)b(?:-a(\d+(?:\.\d+)?)b)?/.exec(name);
  if (!m) return -1e6;
  const version = Number(m[1]);
  const size = Math.min(Number(m[4]), 900) * (version >= 4 ? 1.3 : 1) * (m[2] ? 0.9 : 1);
  const fast = m[5] ? 1e5 + version * 1e3 : 0; // a "mixture of experts" model: big but quick
  return fast + size - (/-it$/.test(name) ? 0 : 5e5); // only instruction-tuned ("-it") models follow instructions well
}
async function models(env, fresh = false) {
  if (env.GEMMA_MODEL) return String(env.GEMMA_MODEL).split(",").map((s) => s.replace(/^\s*models\//, "").trim()).filter(Boolean);
  if (!fresh && known.list.length && Date.now() - known.at < DAY) return known.list;
  const r = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
  if (!r.ok) throw new Error(`Google answered ${r.status} for the list of models${r.status === 400 || r.status === 403 ? " (is GEMINI_API_KEY right?)" : ""}`);
  const list = ((await r.json()).models || [])
    .filter((m) => /^models\/gemma-/.test(m.name || "") && (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.slice("models/".length))
    .sort((a, b) => score(b) - score(a));
  if (!list.length) throw new Error("Google has no Gemma model for this key");
  known = { list, at: Date.now() };
  return list;
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
function lastList(t) {
  const end = t.lastIndexOf("]");
  for (let i = t.lastIndexOf("[", end); end > 0 && i >= 0; i = i > 0 ? t.lastIndexOf("[", i - 1) : -1) {
    try {
      const v = JSON.parse(t.slice(i, end + 1));
      if (Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}
function readList(text, n, lang) {
  const t = String(text || "").replace(/```(?:json)?/gi, "");
  // the last JSON list: a model that "thinks" first may write other brackets before its answer
  let list = lastList(t);
  if (!Array.isArray(list)) {
    // numbered lines: "1. ...", "2) ..."
    const lines = [...t.matchAll(/^\s*(\d{1,2})[.):]\s+(.+?)\s*$/gm)];
    if (lines.length !== n || lines.some((m, i) => Number(m[1]) !== i + 1)) return Array(n).fill(null);
    list = lines.map((m) => m[2]);
  }
  if (list.length !== n) return Array(n).fill(null); // the wrong number: the order can't be trusted
  return list.map((s) => tidy(s, lang));
}

// ---------- Cloudflare's own AI (Workers AI): asked first when the Worker has the "AI" binding ----------
// Free: a daily allowance of "neurons" (a few hundred requests). Models that Cloudflare has removed, or that this
// account may not use, are skipped. Measured on 17 Nov 2026: Mistral Small 3.1 answered in 0.6–1.8 s, in good English
// and Hindi; Llama 4 Scout in 2–5 s, but its Hindi could not be used; Gemma 3 12B: "not allowed" for this account.
const AI_MODELS = ["@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-4-scout-17b-16e-instruct", "@cf/meta/llama-3.1-8b-instruct-fast", "@cf/google/gemma-3-12b-it"];
const aiModels = (env) => (env.AI_MODEL ? String(env.AI_MODEL).split(",").map((s) => s.trim()).filter(Boolean) : AI_MODELS);
async function askAI(env, name, text) {
  let r;
  try {
    r = await env.AI.run(name, { messages: [{ role: "user", content: text }], max_tokens: 1024, temperature: 0.2 });
  } catch (e) {
    const m = String(e?.message || e);
    // a model Cloudflare doesn't have (any more) / the free daily allowance used up / anything else
    const status = /5007|5018|no such model|not found|unknown model|not allowed to access/i.test(m) ? 404 : /4006|neuron|allocation|limit/i.test(m) ? 429 : 502;
    throw Object.assign(new Error(`${name}: ${m.slice(0, 120)}`), { status });
  }
  const out = typeof r === "string" ? r : (r?.response ?? r?.choices?.[0]?.message?.content ?? r?.result?.response);
  if (typeof out === "string") return out;
  if (out && typeof out === "object") return JSON.stringify(out); // some models hand back the list already read
  throw Object.assign(new Error(`${name} gave no text`), { status: 502 });
}

// ---------- Google's Gemma (the backup) ----------
async function askGemma(env, name, text, signal) {
  const r = await fetch(`${API}/models/${encodeURIComponent(name)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } }),
    signal,
  });
  if (r.status === 404 && !env.GEMMA_MODEL) known.at = 0; // a model is gone: read Google's list again next time
  if (!r.ok) throw Object.assign(new Error(`${name} answered ${r.status}`), { status: r.status });
  const data = await r.json();
  return (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

// an answer within ms milliseconds, or a "504"
function inTime(run, ms) {
  const ctrl = new AbortController();
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(Object.assign(new Error(`no answer in ${Math.round(ms / 1000)} seconds`), { status: 504 }));
    }, ms);
  });
  return Promise.race([run(ctrl.signal), late]).finally(() => clearTimeout(timer));
}

// One model after the other: Cloudflare's AI first, then Google's Gemma, the best first. A model that is busy,
// fails or is slow rests 10 minutes and the next one is asked; a model that doesn't exist doesn't count as a try.
async function ask(env, lang, items) {
  const start = Date.now();
  const tryMs = Number(env.TRY_MS) || TRY_MS;
  const totalMs = Number(env.TOTAL_MS) || TOTAL_MS;
  const text = prompt(lang, items);
  const rest = (name, ms = REST_MS) => resting.set(name, Date.now() + ms);
  const helpers = async function* () {
    if (env.AI?.run) for (const name of aiModels(env)) yield { name, run: () => askAI(env, name, text) };
    if (env.GEMINI_API_KEY) {
      let list = [];
      try {
        list = await models(env);
      } catch {}
      for (const name of list) yield { name, run: (signal) => askGemma(env, name, text, signal) };
    }
  };
  // the resting ones last (they are asked only when no other one is left)
  const all = [];
  for await (const h of helpers()) all.push(h);
  const now = Date.now();
  const order = [...all.filter((h) => !(resting.get(h.name) > now)), ...all.filter((h) => resting.get(h.name) > now)];
  let tries = 0;
  let failed = null;
  let unreadable = null;
  const tried = []; // which models were asked, how long each took, and why one failed (shown in the answer, for checking)
  for (const h of order) {
    if (tries >= MAX_TRIES) break;
    const left = totalMs - (Date.now() - start);
    if (left < Math.min(1500, tryMs)) break;
    let out;
    const t0 = Date.now();
    try {
      out = await inTime(h.run, Math.min(tryMs, left));
      tried.push({ m: h.name, ms: Date.now() - t0 });
    } catch (e) {
      tried.push({ m: h.name, ms: Date.now() - t0, e: String(e.message || e).slice(0, 100) });
      failed = Object.assign(new Error(e.status === 504 ? `${h.name}: ${e.message}` : String(e.message || e)), { status: e.status || 502 });
      rest(h.name, e.status === 404 ? DAY : REST_MS);
      if (e.status !== 404) tries++;
      continue;
    }
    tries++;
    const got = readList(out, items.length, lang);
    if (got.some(Boolean)) {
      resting.delete(h.name);
      return { model: h.name, items: got, tried };
    }
    rest(h.name); // an answer that can't be read: the next model
    tried[tried.length - 1].e = "answer could not be read";
    unreadable = { model: h.name, items: got, tried };
  }
  if (unreadable) return unreadable;
  throw Object.assign(failed || Object.assign(new Error("no model could be asked"), { status: 502 }), { tried });
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
    if (!env.AI?.run && !env.GEMINI_API_KEY) return { status: 500, data: { error: "the Worker has neither the AI binding nor the GEMINI_API_KEY secret" } };
    let got;
    let model;
    let tried;
    try {
      ({ items: got, model, tried } = await ask(env, lang, todo));
    } catch (e) {
      return { status: e.status === 429 ? 429 : e.status === 504 ? 504 : 502, data: { error: String(e.message || e), items: out, tried: e.tried } };
    }
    // a headline Gemma could not write is not asked again (unless its whole answer was unreadable)
    const readable = got.some(Boolean);
    todo.forEach((h, i) => {
      if (got[i] === null && !readable) return;
      if (memo.size > 5000) memo.delete(memo.keys().next().value); // the oldest first
      memo.set(key(h), got[i]);
    });
    heads.forEach((h, i) => (out[i] = memo.get(key(h)) ?? null));
    return { status: 200, data: { items: out, model, tried } };
  }
  return { status: 200, data: { items: out, model: "memory" } };
}

async function status(env) {
  const now = Date.now();
  const show = (list) => list.map((m) => (resting.get(m) > now ? `${m} (resting)` : m)).join(", ");
  const ai = env.AI?.run ? `on — models, in order: ${show(aiModels(env))}` : 'off (add a "Workers AI" binding named AI: Settings > Bindings)';
  let gemma = "off (no GEMINI_API_KEY secret)";
  if (env.GEMINI_API_KEY) {
    try {
      gemma = `on — models, in order: ${show(await models(env))}`;
    } catch (e) {
      gemma = `❌ ${e.message || e}`;
    }
  }
  const ok = !!env.AI?.run || /^on/.test(gemma);
  return `${ok ? "✅ The Simplest News headline writer works." : "❌ Not ready: add the AI binding or the GEMINI_API_KEY secret, then open this page again."}
Cloudflare AI (first): ${ai}.
Google Gemma (backup): ${gemma}.
Put this page's address in config/site.json > "rewrite" > "url".`;
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
