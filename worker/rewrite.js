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
// Three jobs (POST, JSON):
//   {"lang": "en" | "hi", "items": ["headline", ...]}  -> {"items": ["simple headline" | null, ...]}  (at most 40)
//   {"mode": "story", "lang", "url", "title"}          -> {"story": {"h": "shortest headline", "q": [9 short answers]}}
//                                                         (reads the article where its robots.txt allows)
//   {"mode": "query", "q": "Hindi search words"}       -> {"q": "the English words news headlines use"}
// The website sends:  POST {"lang": "en" | "hi", "items": ["headline", ...]}   (at most 40 headlines)
// The Worker answers: {"items": ["simple headline" | null, ...], "model": "…"} (null = keep the website's own headline)
// Opening the Worker's address in a browser shows whether it works.

const API = "https://generativelanguage.googleapis.com/v1beta";
// only these websites may use the Worker (and a copy of the site on this computer, for testing)
const SITES = ["https://thesimplestnews.com", "https://www.thesimplestnews.com", "https://omkrishna89.github.io"];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const MAX_ITEMS = 40;
const MAX_LEN = 220; // characters in one headline sent
const MAX_BODY = 64000;
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
// meta (optional) gets the tokens the answer used, so the robot can count its part of the free daily allowance
async function askAI(env, name, text, maxTokens = 1024, meta) {
  let r;
  try {
    r = await env.AI.run(name, { messages: [{ role: "user", content: text }], max_tokens: maxTokens, temperature: 0.2 });
  } catch (e) {
    const m = String(e?.message || e);
    // a model Cloudflare doesn't have (any more) / the free daily allowance used up / anything else
    const status = /5007|5018|no such model|not found|unknown model|not allowed to access/i.test(m) ? 404 : /4006|neuron|allocation|limit/i.test(m) ? 429 : 502;
    throw Object.assign(new Error(`${name}: ${m.slice(0, 120)}`), { status });
  }
  if (meta && r?.usage) meta.usage = r.usage;
  const out = typeof r === "string" ? r : (r?.response ?? r?.choices?.[0]?.message?.content ?? r?.result?.response);
  if (typeof out === "string") return out;
  if (out && typeof out === "object") return JSON.stringify(out); // some models hand back the list already read
  throw Object.assign(new Error(`${name} gave no text`), { status: 502 });
}

// ---------- Google's Gemma (the backup) ----------
async function askGemma(env, name, text, signal, maxTokens = 4096) {
  const r = await fetch(`${API}/models/${encodeURIComponent(name)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }], generationConfig: { temperature: 0.2, maxOutputTokens: Math.max(maxTokens, 2048) } }),
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
// read(answer) turns a model's answer into the result, or null when it can't be used (then the next model is asked).
async function ask(env, text, read, maxTokens = 1024, opts = {}) {
  const start = Date.now();
  const tryMs = opts.tryMs || Number(env.TRY_MS) || TRY_MS;
  const totalMs = opts.totalMs || Number(env.TOTAL_MS) || TOTAL_MS;
  const rest = (name, ms = REST_MS) => resting.set(name, Date.now() + ms);
  const helpers = async function* () {
    if (env.AI?.run) for (const name of opts.models || aiModels(env)) yield { name, run: () => askAI(env, name, text, maxTokens, opts.meta) };
    if (env.GEMINI_API_KEY) {
      let list = [];
      try {
        list = await models(env);
      } catch {}
      for (const name of list) yield { name, run: (signal) => askGemma(env, name, text, signal, maxTokens) };
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
    const value = read(out);
    if (value) {
      resting.delete(h.name);
      return { model: h.name, value, tried };
    }
    rest(h.name); // an answer that can't be read: the next model
    tried[tried.length - 1].e = "answer could not be read";
    unreadable = { model: h.name, value: null, tried };
  }
  if (unreadable) return unreadable;
  throw Object.assign(failed || Object.assign(new Error("no model could be asked"), { status: 502 }), { tried });
}

// ---------- one news story from the internet: its shortest headline and the 9 short answers ----------
const UA = "Mozilla/5.0 (compatible; TheSimplestNewsBot/1.0; +https://thesimplestnews.com/about/)";
const BOT = "thesimplestnewsbot";
const NOT_SAID = { en: "Not mentioned", hi: "जानकारी नहीं" };
const STORY_MAX = 6000; // characters of the article the AI reads
const robotsMemo = new Map(); // website -> its robots.txt rules (read again every day)

// robots.txt: the rules for our robot (or for every robot), the longest matching rule wins, Allow wins a tie
function robotsRules(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of String(txt || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === "user-agent") {
      if (!lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (k === "allow" || k === "disallow") && v) cur.rules.push({ allow: k === "allow", path: v });
    }
  }
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && BOT.includes(a)));
  return (ours.length ? ours : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
}
function robotsAllow(rules, path) {
  let best = null;
  for (const r of rules) {
    const re = new RegExp(`^${r.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
    if (!re.test(path)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}
async function allowed(url) {
  const u = new URL(url);
  let r = robotsMemo.get(u.origin);
  if (!r || Date.now() - r.at > DAY) {
    let txt = "";
    try {
      const res = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(4000) });
      if (res.ok) txt = (await res.text()).slice(0, 200000);
    } catch {}
    r = { at: Date.now(), rules: robotsRules(txt) };
    if (robotsMemo.size > 500) robotsMemo.delete(robotsMemo.keys().next().value);
    robotsMemo.set(u.origin, r);
  }
  return robotsAllow(r.rules, u.pathname + u.search);
}

// The article's text: its paragraphs (Cloudflare's own fast HTML reader; plain text search where it isn't there)
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const unescape = (s) => s.replace(/&(#\d+|#x[\da-f]+|[a-z]+\d*);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));
const clean = (s) => unescape(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// The story's text that many news sites keep for search engines ("articleBody" in their JSON-LD data)
function ldBody(blocks) {
  let best = "";
  const walk = (v, depth = 0) => {
    if (!v || typeof v !== "object" || depth > 6) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v.articleBody === "string" && v.articleBody.length > best.length) best = v.articleBody;
    for (const k of ["@graph", "mainEntity", "mainEntityOfPage"]) walk(v[k], depth + 1);
  };
  for (const b of blocks) {
    try {
      walk(JSON.parse(b));
    } catch {}
  }
  return clean(best);
}
function textOf(paras, desc, title, body = "") {
  let text = "";
  for (const p of paras) {
    if (p.length < 40) continue; // menus, captions, buttons
    if (text.length + p.length > STORY_MAX) break;
    text += `${p}\n`;
  }
  if (text.length < 300 && body.length > text.length) text = body.slice(0, STORY_MAX); // the story's text is not in paragraphs
  if (text.length < 300 && desc) text = `${desc}\n${text}`;
  return { text: text.trim(), title };
}
function pageText(html) {
  const lds = [...String(html || "").matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const h = String(html || "").replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  const body = /<article\b[\s\S]*?<\/article>/i.exec(h)?.[0] || h;
  const paras = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1]));
  const desc = clean(/<meta[^>]+(?:property|name)=["'](?:og:)?description["'][^>]*content=["']([^"']*)["']/i.exec(h)?.[1] || "");
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] || "");
  return textOf(paras, desc, title, ldBody(lds));
}
async function readPage(url) {
  if (!(await allowed(url))) return { blocked: true };
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
  if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) return { status: res.status, text: "" };
  if (typeof HTMLRewriter === "undefined") return pageText((await res.text()).slice(0, 1_500_000));
  const paras = [];
  const lds = [];
  let cur = null;
  let desc = "";
  let title = "";
  await new HTMLRewriter()
    .on('script[type="application/ld+json"]', {
      element: () => lds.push(""),
      text: (x) => (lds[lds.length - 1] += x.text),
    })
    .on("p", {
      element(e) {
        cur = [];
        e.onEndTag(() => {
          paras.push(clean(cur.join("")));
          cur = null;
        });
      },
      text(x) {
        if (cur) cur.push(x.text);
      },
    })
    .on('meta[property="og:description"], meta[name="description"]', { element: (e) => (desc ||= clean(e.getAttribute("content") || "")) })
    .on("title", { text: (x) => (title += x.text) })
    .transform(res)
    .arrayBuffer();
  return textOf(paras, desc, clean(title), ldBody(lds));
}

function storyPrompt(lang, title, text) {
  const en = lang !== "hi";
  return `You make news simple for "The Simplest News", an Indian news website read on phones.
Read the news article below and write, in ${en ? "plain simple English" : "simple spoken Hindi in Devanagari letters (common English words like IPL, UPI, GST, AI are fine)"}:
1. "h": the shortest possible headline: at most ${WORDS[en ? "en" : "hi"]} words, very simple everyday words that a 10-year-old understands. No clickbait.
2. "q": short answers to these 9 questions, in this order: what = what happened; who = who did it or who is involved; whom = to whom it happened or who is affected; whose = whose thing, money, land, team or responsibility it is; where = the place in a few words; when = the day or time; why = the reason; which = which exact thing (scheme, team, vehicle, company, department...); how = how it happened or how to do it.
Each answer is ONE short simple sentence (at most 15 words). Use only facts from the article. Never guess or add facts. If the article does not say it, write exactly "${NOT_SAID[en ? "en" : "hi"]}".
Answer with ONLY a JSON object, nothing else: {"h": "...", "q": ["what", "who", "whom", "whose", "where", "when", "why", "which", "how"]}

Headline: ${title}
Article:
${text}`;
}
function lastObject(t) {
  const end = t.lastIndexOf("}");
  for (let i = t.lastIndexOf("{", end); end > 0 && i >= 0; i = i > 0 ? t.lastIndexOf("{", i - 1) : -1) {
    try {
      const v = JSON.parse(t.slice(i, end + 1));
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}
function readStory(text, lang) {
  const o = lastObject(String(text || "").replace(/```(?:json)?/gi, ""));
  if (!o || !Array.isArray(o.q) || o.q.length !== 9) return null;
  const NOT = NOT_SAID[lang === "hi" ? "hi" : "en"];
  const q = o.q.map((a) => {
    const s = typeof a === "string" ? a.replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”]+$/g, "") : "";
    if (!s || s.length > 220) return NOT;
    if (lang === "hi" ? !DEVANAGARI.test(s) && s.length > 24 : DEVANAGARI.test(s)) return NOT; // the wrong language
    return s;
  });
  if (q.every((a) => a === NOT)) return null;
  return { h: tidy(o.h, lang), q };
}
async function story(env, body) {
  const lang = body?.lang === "hi" ? "hi" : "en";
  const url = String(body?.url || "").trim();
  const title = String(body?.title || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url) || url.length > 2000) return { status: 400, data: { error: "send the story's url" } };
  const key = `story|${lang}|${url}`;
  if (memo.has(key)) return { status: 200, data: { story: memo.get(key), model: "memory" } };
  if (!env.AI?.run && !env.GEMINI_API_KEY) return { status: 500, data: { error: "the Worker has neither the AI binding nor the GEMINI_API_KEY secret" } };
  let page = null;
  try {
    page = await readPage(url);
  } catch (e) {
    page = { status: 0, text: "", err: String(e?.message || e).slice(0, 80) };
  }
  if (page?.blocked) return { status: 403, data: { error: "the website asks robots not to read this page" } };
  if (!page?.text || page.text.length < 200) {
    const why = !page ? "no answer" : page.status ? `HTTP ${page.status}` : `only ${page.text.length} characters of text`;
    return { status: 422, data: { error: `the article could not be read (${why})` } };
  }
  try {
    const r = await ask(env, storyPrompt(lang, title || page.title, page.text), (out) => readStory(out, lang), 1200);
    if (!r.value) return { status: 502, data: { error: "the answer could not be read", tried: r.tried } };
    if (memo.size > 5000) memo.delete(memo.keys().next().value);
    memo.set(key, r.value);
    return { status: 200, data: { story: r.value, model: r.model, tried: r.tried } };
  } catch (e) {
    return { status: e.status === 429 ? 429 : e.status === 504 ? 504 : 502, data: { error: String(e.message || e), tried: e.tried } };
  }
}

// ---------- a search typed in Hindi letters: the English words news headlines use ----------
function readEnglish(text) {
  for (const raw of String(text || "").split("\n")) {
    const s = raw.replace(/^\s*(english|search|answer)\s*:\s*/i, "").replace(/^["'`*]+|["'`*.]+$/g, "").trim();
    if (s && s.length <= 80 && /^[\p{Script=Latin}\d\s'&.,-]+$/u.test(s) && /\p{Script=Latin}/u.test(s)) return s;
  }
  return null;
}
async function query(env, body) {
  const q = String(body?.q || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!q) return { status: 400, data: { error: "send the search words" } };
  const key = `query|${q}`;
  if (memo.has(key)) return { status: 200, data: { q: memo.get(key), model: "memory" } };
  if (!env.AI?.run && !env.GEMINI_API_KEY) return { status: 500, data: { error: "the Worker has neither the AI binding nor the GEMINI_API_KEY secret" } };
  const text = `Turn this Indian news search, typed in Hindi, into the English words that English news headlines would use. Write names of people, places, parties and companies in their usual English spelling. Answer with ONLY the English words (at most 8 words), nothing else.

Search: ${q}`;
  try {
    const r = await ask(env, text, readEnglish, 64);
    if (!r.value) return { status: 502, data: { error: "the answer could not be read", tried: r.tried } };
    memo.set(key, r.value);
    return { status: 200, data: { q: r.value, model: r.model, tried: r.tried } };
  } catch (e) {
    return { status: e.status === 429 ? 429 : 502, data: { error: String(e.message || e), tried: e.tried } };
  }
}

// ---------- job "ai": Cloudflare's AI for the site's own news robot, when Google's Gemini is busy ----------
// Only for the robot: it signs the request with the Gemini key both have (HMAC-SHA256 of "ai|<time>", 10 minutes valid).
async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function aiJob(env, body) {
  const ts = Number(body?.ts);
  if (!env.GEMINI_API_KEY || !ts || Math.abs(Date.now() - ts) > 10 * 60e3) return { status: 401, data: { error: "not signed" } };
  if (!sameText(await hmacHex(env.GEMINI_API_KEY, `ai|${ts}`), String(body?.proof || ""))) return { status: 401, data: { error: "not signed" } };
  if (!env.AI?.run) return { status: 503, data: { error: "the Worker has no AI binding" } };
  const prompt = String(body?.prompt || "").slice(0, 60000);
  if (!prompt) return { status: 400, data: { error: "send the prompt" } };
  const max = Math.min(Math.max(Number(body?.max) || 2000, 64), 8000);
  // the robot may ask for some of Cloudflare's models only (stories: Mistral, whose Hindi is the best of them)
  const only = Array.isArray(body?.models) ? AI_MODELS.filter((m) => body.models.includes(m)) : null;
  if (only && !only.length) return { status: 400, data: { error: `unknown models; these can be asked: ${AI_MODELS.join(", ")}` } };
  const meta = {};
  try {
    // Cloudflare's models only (the robot comes here because Google is busy)
    const r = await ask({ ...env, GEMINI_API_KEY: "" }, prompt, (out) => (typeof out === "string" && out.trim() ? out : null), max, { tryMs: 50000, totalMs: 60000, meta, ...(only ? { models: only } : {}) });
    if (!r.value) return { status: 502, data: { error: "no answer", tried: r.tried } };
    return { status: 200, data: { text: r.value, model: r.model, tried: r.tried, ...(meta.usage ? { usage: meta.usage } : {}) } };
  } catch (e) {
    return { status: e.status === 429 ? 429 : 502, data: { error: String(e.message || e), tried: e.tried } };
  }
}

// ---------- the Worker ----------
async function rewrite(request, env, origin = "") {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return { status: 413, data: { error: "too big" } };
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { status: 413, data: { error: "too big" } };
    body = JSON.parse(text);
  } catch {
    return { status: 400, data: { error: "send JSON" } };
  }
  if (body?.mode === "ai") return aiJob(env, body); // signed by the site's robot: no browser, no Origin
  if (!okOrigin(origin)) return { status: 403, data: { error: "only for thesimplestnews.com" } };
  if (body?.mode === "story") return story(env, body);
  if (body?.mode === "query") return query(env, body);
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
      let value;
      ({ value, model, tried } = await ask(env, prompt(lang, todo), (out) => {
        const list = readList(out, todo.length, lang);
        return list.some(Boolean) ? list : null;
      }));
      got = value || todo.map(() => null);
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
    const { status: code, data } = await rewrite(request, env, origin);
    return json(data, code, headers);
  },
};
