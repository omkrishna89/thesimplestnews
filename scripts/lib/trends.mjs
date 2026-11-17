// "Trending now": what people in India search on Google right now, from Google Trends' public feed
// (trends.google.com/trending/rss?geo=IN, allowed for robots). Each topic comes with up to 3 news links.
// Only topics in English or Hindi letters are kept (the feed also has Telugu, Tamil, … topics).
import { XMLParser } from "fast-xml-parser";
import { allowedByRobots } from "./article.mjs";
import { cleanUrl, get, plain } from "./util.mjs";

export const TRENDS_URL = "https://trends.google.com/trending/rss?geo=IN";
const KEEP_MS = 8 * 3600e3; // topics of the last 8 hours
const MAX = 15;

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true, trimValues: true, parseTagValue: false, isArray: (n) => n === "item" || n === "ht:news_item" });
// Latin or Devanagari letters only (numbers and signs are fine)
const READABLE = /^[\p{Script=Latin}\p{Script=Devanagari}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+$/u;
const readable = (s) => !!s && READABLE.test(s) && /[\p{Script=Latin}\p{Script=Devanagari}]/u.test(s);

// "1000+" -> 1000, "20K+" -> 20000
export function traffic(s) {
  const m = /([\d.,]+)\s*([KkMm]?)/.exec(String(s || ""));
  if (!m) return 0;
  return Math.round(parseFloat(m[1].replace(/,/g, "")) * (/k/i.test(m[2]) ? 1e3 : /m/i.test(m[2]) ? 1e6 : 1));
}

// The topic as the news writes it:
//   "bengal vs maharashtra" -> "Bengal vs Maharashtra", "gta vi ps5" -> "GTA VI PS5" (as a headline writes it)
//   "ben vs mah" -> "Bengal vs Maharashtra"  (a headline writes the short words in full)
//   "im game" -> "I'm Game"                   (apostrophes left out by the searchers)
//   "rajat patidar" -> "Rajat Patidar"        (no headline has it: every word with a capital letter)
const SMALL = new Set(["vs", "v", "and", "or", "of", "the", "in", "on", "at", "to", "for", "by", "from", "with", "a", "an"]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const APOS = "['’ʼ]?"; // an apostrophe may be left out
const LETTER = "[\\p{L}\\p{M}\\p{N}]";
// the words, letter by letter with an optional apostrophe between, and spaces or dashes between words
const pattern = (words) => words.map((w) => [...w].map(esc).join(APOS)).join("[\\s-]+");
export function display(topic, titles = []) {
  const words = topic.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return topic;
  const find = (re) => {
    for (const t of titles) {
      const m = re.exec(t);
      if (m) return m[1];
    }
    return null;
  };
  const whole = (ws) => find(new RegExp(`(?<!${LETTER})(${pattern(ws)})(?!${LETTER})`, "iu"));
  // 1. the whole topic, as a headline writes it
  let out = whole(words);
  // 2. short words a headline writes in full: every word starts a word of the headline, in the same order
  if (!out && words.length > 1 && words.some((w) => !SMALL.has(w.toLowerCase()))) {
    const re = new RegExp(`(?<!${LETTER})(${words.map((w) => (SMALL.has(w.toLowerCase()) ? esc(w) : `${esc(w)}${LETTER}*`)).join("[\\s-]+")})(?!${LETTER})`, "iu");
    out = find(re);
  }
  // 3. word by word: as a headline writes the word, else with a capital letter (small words stay small).
  //    All capitals only for short words (BGMI, CJI, ICICI): a longer word in capitals is a brand's styling ("PUBG MOBILE").
  if (!out) {
    const forms = (w) => {
      const re = new RegExp(`(?<!${LETTER})(${pattern([w])})(?!${LETTER})`, "giu");
      return titles.flatMap((h) => [...h.matchAll(re)].map((m) => m[1])).filter((s) => s !== s.toLowerCase());
    };
    const letters = (s) => s.replace(/[^\p{L}]/gu, "").length;
    out = words
      .map((w, i) => {
        const seen = forms(w);
        const mixed = seen.find((s) => s !== s.toUpperCase()); // "Mobile", "iPhone"
        if (mixed) return mixed;
        const caps = seen.find((s) => letters(s) <= 5);
        if (caps) return caps;
        if (/\p{Script=Devanagari}/u.test(w) || (i > 0 && SMALL.has(w.toLowerCase()))) return w;
        return w[0].toUpperCase() + w.slice(1);
      })
      .join(" ");
  }
  return out[0].toUpperCase() + out.slice(1);
}

export function parseTrends(xml) {
  const items = parser.parse(String(xml || ""))?.rss?.channel?.item || [];
  const out = [];
  for (const it of items) {
    const q = plain(String(it.title ?? "")).replace(/\s+/g, " ").trim();
    if (!readable(q) || q.length > 60) continue;
    const news = (it["ht:news_item"] || [])
      .map((n) => ({ h: plain(String(n["ht:news_item_title"] ?? "")).trim(), u: cleanUrl(String(n["ht:news_item_url"] ?? "")), src: plain(String(n["ht:news_item_source"] ?? "")).trim() }))
      .filter((n) => n.h && /^https?:\/\//.test(n.u) && readable(n.h))
      .slice(0, 3);
    if (!news.length) continue; // e.g. "eenadu news" with only Telugu headlines
    const p = Date.parse(it.pubDate);
    out.push({ q: q.toLowerCase(), t: display(q, news.map((n) => n.h)), n: traffic(it["ht:approx_traffic"]), p: Number.isFinite(p) ? p : Date.now(), news });
  }
  return out;
}

// New topics join the ones of the last hours; the most searched first. A topic keeps the groups Gemini sorted it into (g).
export function mergeTrends(old = [], fresh = [], now = Date.now()) {
  const by = new Map();
  for (const t of [...old, ...fresh]) {
    if (now - t.p > KEEP_MS) continue;
    const had = by.get(t.q);
    const g = t.g ?? had?.g;
    by.set(t.q, had ? { ...t, n: Math.max(had.n, t.n), p: Math.max(had.p, t.p), news: t.p >= had.p ? t.news : had.news, ...(g ? { g } : {}) } : t);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.p - a.p).slice(0, MAX);
}

export async function updateTrends(old = []) {
  if (!(await allowedByRobots(TRENDS_URL))) throw new Error("robots.txt says no");
  const res = await get(TRENDS_URL, { timeout: 20000, maxBytes: 1_000_000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const fresh = parseTrends(res.text);
  return { list: mergeTrends(old, fresh), fresh: fresh.length };
}
