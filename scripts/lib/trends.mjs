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

// The topic as the news writes it: "bengal vs maharashtra" -> "Bengal vs Maharashtra", "gta vi ps5" -> "GTA VI PS5"
// (the whole topic from a headline, else word by word; and a capital first letter)
export function display(topic, titles = []) {
  const find = (w) => {
    const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")})(?![\\p{L}\\p{N}])`, "iu");
    for (const t of titles) {
      const m = re.exec(t);
      if (m) return m[1];
    }
    return null;
  };
  const out = find(topic) || topic.split(" ").map((w) => find(w) || w).join(" ");
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

// New topics join the ones of the last hours; the most searched first
export function mergeTrends(old = [], fresh = [], now = Date.now()) {
  const by = new Map();
  for (const t of [...old, ...fresh]) {
    if (now - t.p > KEEP_MS) continue;
    const had = by.get(t.q);
    by.set(t.q, had ? { ...t, n: Math.max(had.n, t.n), p: Math.max(had.p, t.p), news: t.p >= had.p ? t.news : had.news } : t);
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
