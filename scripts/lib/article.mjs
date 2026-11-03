// Reads the full text of a news article from its own website, so Gemini can answer all 9 questions.
// - Every website's robots.txt is respected: if it says our robot may not read a page, we don't.
// - The text is only used to write our own short summary. It is never saved or published.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import robotsParser from "robots-parser";
import { BOT_NAME, clip, get, plain } from "./util.mjs";

const robotsCache = new Map();

async function robotsFor(url) {
  const origin = new URL(url).origin;
  if (!robotsCache.has(origin)) {
    robotsCache.set(
      origin,
      (async () => {
        try {
          const res = await get(`${origin}/robots.txt`, { timeout: 10000, accept: "text/plain", maxBytes: 500_000 });
          // No robots.txt (404) means everything is allowed; a server error means "try again later".
          if (res.status >= 500) return { blockedAll: true };
          if (!res.ok) return robotsParser(`${origin}/robots.txt`, "");
          return robotsParser(`${origin}/robots.txt`, res.text);
        } catch {
          return { blockedAll: true };
        }
      })(),
    );
  }
  return robotsCache.get(origin);
}

export async function allowedByRobots(url) {
  const r = await robotsFor(url);
  if (r.blockedAll) return false;
  return r.isAllowed(url, BOT_NAME) !== false;
}

const meta = (doc, ...names) => {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`);
    const v = el?.getAttribute("content");
    if (v) return v.trim();
  }
  return "";
};

// Returns { ok, text, image, title, reason }
export async function readArticle(url, { maxChars = 6000 } = {}) {
  if (!(await allowedByRobots(url))) return { ok: false, reason: "robots" };
  let res;
  try {
    res = await get(url, { timeout: 20000, accept: "text/html,application/xhtml+xml", maxBytes: 2_500_000 });
  } catch (err) {
    return { ok: false, reason: `fetch: ${err.message}` };
  }
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
  if (!/<html|<body|<article/i.test(res.text)) return { ok: false, reason: "not html" };

  let doc;
  try {
    ({ document: doc } = parseHTML(res.text));
  } catch (err) {
    return { ok: false, reason: `parse: ${err.message}` };
  }
  // A page can ask robots not to use it ("noindex"/"noarchive"/"none"): respect it.
  const robotsMeta = `${meta(doc, "robots")} ${meta(doc, BOT_NAME.toLowerCase())}`.toLowerCase();
  if (/\b(none|noarchive|nosnippet)\b/.test(robotsMeta)) return { ok: false, reason: "meta robots" };

  const image = meta(doc, "og:image", "twitter:image", "og:image:url");
  const title = meta(doc, "og:title", "twitter:title");
  let text = "";
  try {
    const parsed = new Readability(doc, { charThreshold: 200 }).parse();
    text = plain(parsed?.textContent || "");
  } catch {
    text = "";
  }
  if (text.length < 200) {
    // Some sites keep the article in JSON-LD
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(s.textContent);
        const list = Array.isArray(data) ? data : data["@graph"] || [data];
        const art = list.find((d) => d && d.articleBody);
        if (art) {
          text = plain(art.articleBody);
          break;
        }
      } catch {}
    }
  }
  if (text.length < 200) text = plain(meta(doc, "og:description", "description")) || text;
  // ad labels that some sites leave inside the article text
  text = text.replace(/(^|\s)(विज्ञापन|Advertisement|ADVERTISEMENT|Also Read|यह भी पढ़ें)(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "no text", image, title };
  return { ok: true, text: clip(text, maxChars), image: /^https?:\/\//.test(image) ? image : "", title };
}
