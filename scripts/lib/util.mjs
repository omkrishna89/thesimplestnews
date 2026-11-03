// Small helpers shared by the update and build scripts.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
export const TZ = "Asia/Kolkata";

// The robot introduces itself honestly to every website it reads.
export const USER_AGENT =
  process.env.BOT_USER_AGENT ||
  "Mozilla/5.0 (compatible; TheSimplestNewsBot/1.0; +https://thesimplestnews.com/about/)";
export const BOT_NAME = "TheSimplestNewsBot";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, data, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0) + (pretty ? "\n" : ""));
}

export const config = (name) => readJSON(path.join(ROOT, "config", name), null);

export const hash = (s, len = 12) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, len);

// GET with a time limit. Returns { ok, status, url, headers, text } and never throws for HTTP errors.
export async function get(url, { timeout = 20000, headers = {}, maxBytes = 3_000_000, accept } = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
    headers: {
      "user-agent": USER_AGENT,
      accept: accept || "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
      "accept-language": "hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7",
      ...headers,
    },
  });
  let text = "";
  if (res.status !== 304) {
    // Read at most maxBytes, so a huge page can't fill the memory.
    const reader = res.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size > maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
    const buf = Buffer.concat(chunks);
    text = decode(buf, res.headers.get("content-type") || "");
  }
  return { ok: res.ok, status: res.status, url: res.url || url, headers: res.headers, text };
}

// Decode bytes using the charset from the header or the document itself (most Indian sites use UTF-8).
function decode(buf, contentType) {
  let charset = (/charset=["']?([\w-]+)/i.exec(contentType) || [])[1];
  if (!charset) {
    const head = buf.subarray(0, 2048).toString("latin1");
    charset = (/encoding=["']([\w-]+)["']/i.exec(head) || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try {
    return new TextDecoder(charset && charset.toLowerCase() !== "utf8" ? charset : "utf-8").decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

// Run fn over items with at most `limit` running at the same time.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (err) {
        out[i] = { error: err };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", zwj: "", zwnj: "", rupee: "₹", inr: "₹" };

export function decodeEntities(s = "") {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// HTML or text -> one clean line of plain text
export function plain(s = "") {
  return decodeEntities(
    String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[​­]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function clip(s = "", max = 300) {
  s = String(s).trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,.;:\-–—\s]+$/, "") + "…";
}

// Remove tracking parameters so the same story from two feeds gets the same address.
const TRACKING = /^(utm_\w+|fbclid|gclid|ref|ref_src|cmp|source|from|ito|ncid|icid|taid|s_cid|mc_cid|mc_eid|pfrom|rss|feed|rssfeed|sr_share|_gl|ss)$/i;
export function cleanUrl(u) {
  try {
    const url = new URL(String(u).trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.toLowerCase();
    let s = url.toString();
    if (s.endsWith("?")) s = s.slice(0, -1);
    return s;
  } catch {
    return "";
  }
}

export const domainOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^(www|m|amp)\./, "");
  } catch {
    return "";
  }
};

// "2026-11-03" in India time
export const istDay = (t = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(t));

export function parseDate(s) {
  if (!s) return NaN;
  // "03-11-2026 10:22": Indian sites write the day first (JavaScript would read it as 11 March)
  const dmy = /^\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (dmy) return Date.parse(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}T${(dmy[4] || "0").padStart(2, "0")}:${dmy[5] || "00"}:${dmy[6] || "00"}+05:30`);
  let t = Date.parse(s);
  if (Number.isFinite(t)) return t;
  // "Tue, 03 Nov 2026 10:22:00 IST" and similar
  const fixed = String(s).replace(/\bIST\b/, "+0530").replace(/\bGMT\+0?5:?30\b/, "+0530");
  t = Date.parse(fixed);
  if (Number.isFinite(t)) return t;
  return NaN;
}

// Simple slug from an English or Hindi place/name: "Lucknow District" -> "lucknow" (shared with the browser)
export { slug } from "../../src/assets/js/ui.js";

export function log(...a) {
  console.log(new Date().toISOString().slice(11, 19), ...a);
}
