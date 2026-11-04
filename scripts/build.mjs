// Builds the website into _site/ from the news database (.data/db.json.gz).
// SITE_URL and PATH_PREFIX come from GitHub Pages, so the same files work at
// omkrishna89.github.io/thesimplestnews/ and later at https://thesimplestnews.com
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadDB } from "./lib/db.mjs";
import { metalsView } from "./lib/metals.mjs";
import { makePages } from "./lib/pages.mjs";
import { STATES, placesForBrowser } from "./lib/places.mjs";
import { ROOT, config, log } from "./lib/util.mjs";
import { metalsBox, videosStrip } from "./lib/widgets.mjs";
import { istDay, stockFile } from "../src/assets/js/ui.js";
import { HELP_PAGES } from "./lib/help-pages.mjs";
import { groupsFromWords, wordTest } from "./lib/words.mjs";

const OUT = path.resolve(ROOT, process.env.OUT_DIR || "_site");
const site = config("site.json");
const groups = config("groups.json").list;
const SLUGS = new Set(groups.map((g) => g.slug));
const siteUrl = (process.env.SITE_URL || site.url).replace(/\/$/, "");
const base = (process.env.PATH_PREFIX || "").replace(/\/$/, "");
const now = Date.now();
const LIST_CAP = 300; // most stories in one day-file
const STATIC_N = 30; // stories written into the page itself (for Google and slow phones)
const proxy = site.imageProxy ?? "https://wsrv.nl/?url={url}&w={w}&h={h}&fit=cover&a=attention&output=webp&q=70";
const proxyWide = site.imageProxy ?? "https://wsrv.nl/?url={url}&w={w}&h={h}&fit=cover&output=webp&q=75";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (rel, text) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
let jsonBytes = 0;
const writeJSON = (rel, data) => {
  const s = JSON.stringify(data);
  jsonBytes += s.length;
  write(rel, s);
};

// ---------- assets (file names carry a hash, so phones always get the newest version) ----------
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, "src/assets"), path.join(OUT, "assets"));
const ver = (rel) => crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, "src", rel))).digest("hex").slice(0, 10);
const assets = { css: `${base}/assets/css/style.css?v=${ver("assets/css/style.css")}`, js: `${base}/assets/js/app.js?v=${ver("assets/js/app.js")}` };

// ---------- stories ----------
const db = loadDB();
const icons = Object.fromEntries(groups.map((g) => [g.slug, g.icon]));
const titleCase = (slug) => (slug || "").split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

function placeName(s, lang) {
  const loc = s.loc || {};
  if (loc.c === "world") {
    const c = s.a?.place?.country;
    return c && lang === "en" ? c : c && /[ऀ-ॿ]/.test(c) ? c : "";
  }
  const p = s.a?.place || {};
  const key = loc.d ? `${loc.s}/${loc.d}` : "";
  if (lang === "hi") {
    const local = loc.l && (p.local_hi || db.names[`${key}/${loc.l}`]);
    const district = loc.d && (p.district_hi || db.names[key]);
    const parts = [local, district && district !== local ? district : ""].filter(Boolean);
    if (parts.length) return parts.join(", ");
    if (loc.d) return titleCase(loc.d);
    return loc.s ? STATES[loc.s]?.hi || "" : "";
  }
  const local = loc.l && (p.local || titleCase(loc.l));
  const district = loc.d && (p.district || titleCase(loc.d));
  const parts = [local, district && district.toLowerCase() !== String(local).toLowerCase() ? district : ""].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return loc.s ? STATES[loc.s]?.en || "" : "";
}

// Importance for stories Gemini hasn't written yet, from the kind of feed they came from
const guessImp = (s) => Math.max(2, Math.min(6, (s.pr || 5) - 2));

const masters = db.stories.filter((s) => s.s !== "dup");
const items = masters.map((s) => {
  const ok = s.s === "ok" && s.a;
  // Groups: the AI's (which already include the news feed's own group). Before the AI has written
  // a story: the feed's group plus groups from clear words in the headline (config/words.json).
  const g = (ok ? s.a.g : [...new Set([...(s.gh || []), ...groupsFromWords(s.t)])]).filter((x) => SLUGS.has(x) && x !== "local");
  const common = {
    i: s.id,
    t: Math.round(s.p / 1000),
    u: s.u,
    img: s.img || "",
    g,
    m: ok ? s.a.imp : guessImp(s),
    sc: s.sc || "country",
    p: [s.loc?.s || "", s.loc?.d || "", s.loc?.t || "", s.loc?.l || ""],
    ...(s.also?.length ? { n: s.also.length } : {}),
  };
  const lang = (l) => ({
    ...common,
    h: ok ? s.a[l].h : s.t,
    ...(ok ? { q: s.a[l].q } : s.x ? { x: s.x } : {}),
    src: s.pub?.[l] || s.pub?.en || "",
    pn: placeName(s, l),
  });
  return { s, ok, loc: s.loc || { c: "in" }, sc: common.sc, g, m: common.m, t: common.t, day: istDay(s.p), hi: lang("hi"), en: lang("en") };
});
items.sort((a, b) => b.t - a.t);
log(`[build] ${items.length} stories (${items.filter((i) => i.ok).length} written by AI), ${db.stories.length - masters.length} duplicates merged`);

// ---------- which list a story belongs to ----------
const inGroup = (it, group) => group === "all" || (group === "local" ? ["local", "tehsil", "district"].includes(it.sc) : it.g.includes(group));
const scopeKeys = (it) => {
  if (it.loc.c === "world") return ["world"];
  const keys = [];
  if (it.sc === "country" || it.m >= 7 || (!it.loc.s && it.s.lv === "country")) keys.push("in");
  if (it.loc.s) keys.push(`s-${it.loc.s}`);
  return keys;
};
// Country/world lists hold only summarized stories plus unsummarized ones from national feeds.
const listable = (it, key) => it.ok || key.startsWith("s-") || ["country", "world"].includes(it.s.lv) || it.s.lv === "state";

const lists = new Map(); // "in/cricket" -> Map(day -> [items])
const push = (key, it) => {
  if (!lists.has(key)) lists.set(key, new Map());
  const m = lists.get(key);
  if (!m.has(it.day)) m.set(it.day, []);
  m.get(it.day).push(it);
};
for (const it of items) {
  for (const sk of scopeKeys(it)) {
    if (!listable(it, sk)) continue;
    push(`${sk}/all`, it);
    if (["local", "tehsil", "district"].includes(it.sc)) push(`${sk}/local`, it);
    for (const g of it.g) push(`${sk}/${g}`, it);
  }
  if (it.loc.s && it.loc.d) push(`d/${it.loc.s}/${it.loc.d}`, it);
}

// Keep the most important ones when a day has too many, then newest first.
const capDay = (arr, cap = LIST_CAP) => (arr.length <= cap ? arr : [...arr].sort((a, b) => b.m - a.m || b.t - a.t).slice(0, cap)).sort((a, b) => b.t - a.t);

// index.days[key] = the days a list has (newest first); index.n[lang][key] = how many stories on each of those days
const index = { built: now, days: {}, n: { hi: {}, en: {} }, base };
for (const [key, days] of lists) {
  const ds = [...days.keys()].sort().reverse();
  index.days[key] = ds;
  index.n.hi[key] = [];
  index.n.en[key] = [];
  for (const day of ds) {
    const capped = capDay(days.get(day), key.endsWith("/all") ? 150 : LIST_CAP); // "all news" lists: the 150 most important a day
    // a story without its summary yet is shown only in its own language
    for (const lang of ["hi", "en"]) {
      const out = capped.filter((it) => it.ok || it.s.l === lang).map((it) => it[lang]);
      writeJSON(`data/${lang}/${key}/${day}.json`, out);
      index.n[lang][key].push(out.length);
    }
  }
}
// The Stocks box: every story that mentions a listed company (any group, India or world), one small file per
// company, so a phone loads only the news about the reader's own stocks. index.stocks[lang][SYMBOL] = how many.
// index.span = how many days of news the site has (at most 7), for "No news about TCS in the last 3 days".
const STOCKS = config("stocks.json")?.list || [];
const anyStock = wordTest(STOCKS.flatMap((s) => s.k), { names: true }); // quick first look, then company by company
const stockTests = STOCKS.map((s) => [s.s, wordTest(s.k, { names: true })]);
index.stocks = {};
for (const lang of ["hi", "en"]) {
  const found = new Map();
  for (const it of items) {
    if (!(it.ok || it.s.l === lang)) continue;
    const v = it[lang];
    const text = [v.h, v.x || "", ...(v.q || [])].join(" \n ");
    if (!anyStock?.(text)) continue;
    for (const [sym, test] of stockTests) if (test?.(text)) (found.get(sym) || found.set(sym, []).get(sym)).push(v);
  }
  index.stocks[lang] = {};
  for (const [sym, arr] of found) {
    writeJSON(`data/${lang}/stock/${stockFile(sym)}.json`, arr.slice(0, 100));
    index.stocks[lang][sym] = Math.min(arr.length, 100);
  }
}
index.span = Math.min(site.keepDays || 7, new Set(items.map((it) => it.day)).size);
writeJSON("data/index.json", index);
writeJSON("data/places.json", placesForBrowser(db.names));
writeJSON("data/stocks.json", config("stocks.json")?.list || []); // names for the Stocks box
log(`[build] ${lists.size} lists, ${(jsonBytes / 1e6).toFixed(1)} MB of data files`);

// ---------- pages ----------
const metals = metalsView(db.metals);
const ctx = {
  site,
  groups,
  base,
  siteUrl: `${siteUrl}${base}`,
  assets,
  proxyWide,
  render: { base, proxy, now, icon: (g) => icons[g] || "📰" },
};
const P = makePages(ctx);
ctx.metalsBox = metals ? (uid) => metalsBox(metals, uid, P.url) : null;

// The newest stories of a list, enough for n in each language
const latest = (key, n = STATIC_N) => {
  const days = lists.get(key);
  if (!days) return [];
  const out = [];
  const have = { hi: 0, en: 0 };
  for (const d of [...days.keys()].sort().reverse()) {
    for (const it of capDay(days.get(d))) {
      out.push(it);
      for (const l of ["hi", "en"]) if (it.ok || it.s.l === l) have[l]++;
      if (have.hi >= n && have.en >= n) return out;
    }
  }
  return out;
};

let pages = 0;
const sitemap = [];
const emit = (rel, html, { inSitemap = true, prio = "0.7", lastmod } = {}) => {
  write(rel, html);
  pages++;
  if (inSitemap) sitemap.push({ loc: `${ctx.siteUrl}/${rel.replace(/index\.html$/, "")}`, prio, lastmod });
};

const nameOf = (slug) => (slug === "all" ? { hi: "सारी खबरें", en: "All news" } : groups.find((g) => g.slug === slug));
const TAB_EN = { local: "Local", tehsil: "Tehsil", district: "District", state: "State", country: "India", world: "World" };
const TAB_HI = { local: "आसपास", tehsil: "तहसील", district: "ज़िला", state: "राज्य", country: "देश", world: "दुनिया" };

for (const slug of ["all", ...groups.map((g) => g.slug)]) {
  const n = nameOf(slug);
  let extraTop = "";
  let sideTop = "";
  if (slug === "movies") extraTop = videosStrip(db.videos, { limit: 12 });
  if (slug === "all") sideTop = videosStrip(db.videos, { limit: 6, side: true });
  if (slug === "gold-silver" && ctx.metalsBox) extraTop = ctx.metalsBox("top");
  for (const tab of ["country", "world", "state", "district", "tehsil", "local"]) {
    const key = tab === "world" ? `world/${slug}` : `in/${slug}`;
    const rel = slug === "all" ? (tab === "country" ? "index.html" : `all/${tab}/index.html`) : tab === "country" ? `${slug}/index.html` : `${slug}/${tab}/index.html`;
    const placeTab = !["country", "world"].includes(tab);
    const title =
      slug === "all" && tab === "country"
        ? `The Simplest News — ${site.tagline.hi} | ${site.tagline.en}`
        : `${n.hi} (${TAB_HI[tab]}) · ${n.en} news (${TAB_EN[tab]}) — The Simplest News`;
    const description = slug === "all" ? `${site.tagline.hi}. ${site.tagline.en}.` : `${n.about_hi || ""} ${n.about_en || ""}`.trim();
    emit(
      rel,
      P.listPage({ group: slug, tab, items: placeTab ? [] : latest(key), path: "/" + rel.replace(/index\.html$/, ""), title, description, extraTop, sideTop, noindex: placeTab }),
      { inSitemap: !placeTab, prio: slug === "all" && tab === "country" ? "1.0" : "0.8" },
    );
  }
}

// story pages (only stories Gemini has written)
const byGroupRecent = new Map();
for (const it of items) if (it.ok) for (const g of it.g) (byGroupRecent.get(g) || byGroupRecent.set(g, []).get(g)).push(it);
let storyPages = 0;
for (const it of items) {
  if (!it.ok) continue;
  const s = it.s;
  const related = (byGroupRecent.get(it.g[0]) || []).filter((r) => r !== it && Math.abs(r.t - it.t) < 2 * 86400).slice(0, 5);
  const view = { ...it.hi, i: s.id, hi: it.hi, en: it.en, g: it.g, u: s.u, pub: s.pub, also: s.also, img: s.img, t: it.t, at: s.a?.at };
  const keys = [`in/${it.g[0] || "all"}`, it.loc.s ? `s-${it.loc.s}/all` : "", it.loc.d ? `d/${it.loc.s}/${it.loc.d}` : ""].filter(Boolean);
  emit(`story/${s.id}/index.html`, P.storyPage(view, related, keys), { prio: "0.6", lastmod: new Date(s.a?.at || s.p).toISOString() });
  storyPages++;
}

// place pages: every state and district that has news (good for "Barabanki news" searches)
let placePages = 0;
for (const [key] of lists) {
  if (key.startsWith("s-") && key.endsWith("/all")) {
    const st = key.slice(2, -4);
    const S = STATES[st];
    if (!S) continue;
    emit(`place/${st}/index.html`, P.placePage({ title: `${S.hi} की ताज़ा खबरें · ${S.en} news — The Simplest News`, h1: P.bi(`📍 ${S.hi} की खबरें`, `📍 ${S.en} news`), path: `/place/${st}/`, items: latest(key, 40), keys: [key] }), { prio: "0.7" });
    placePages++;
  }
  if (key.startsWith("d/")) {
    const [, st, d] = key.split("/");
    const S = STATES[st];
    const hiName = db.names[`${st}/${d}`] || titleCase(d);
    const enName = titleCase(d);
    emit(
      `place/${st}/${d}/index.html`,
      P.placePage({ title: `${hiName} की ताज़ा खबरें · ${enName} news (${S?.en || ""}) — The Simplest News`, h1: P.bi(`📍 ${hiName} की खबरें`, `📍 ${enName} news`), path: `/place/${st}/${d}/`, items: latest(key, 40), about: P.bi(S?.hi || "", S?.en || ""), keys: [key] }),
      { prio: "0.7" },
    );
    placePages++;
  }
}

// help pages (about, contact, privacy, terms, disclaimer) and 404
for (const hp of HELP_PAGES(site)) emit(`${hp.slug}/index.html`, P.textPage({ path: `/${hp.slug}/`, title: `${hp.title} — The Simplest News`, hi: hp.hi, en: hp.en }), { prio: "0.3" });
write("404.html", P.textPage({ path: "/404.html", title: "404 — The Simplest News", hi: `<h1>यह पेज नहीं मिला</h1><p><a href="${base}/">होम पेज पर जाएं</a></p>`, en: `<h1>Page not found</h1><p><a href="${base}/">Go to the home page</a></p>` }));

// ---------- robots, sitemaps, ads.txt, app manifest ----------
write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /data/\n\nSitemap: ${ctx.siteUrl}/sitemap.xml\nSitemap: ${ctx.siteUrl}/news-sitemap.xml\n`);
const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap
    .map((u) => `<url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.prio}</priority></url>`)
    .join("\n")}\n</urlset>\n`,
);
const recent = items.filter((it) => it.ok && now - it.s.p < 48 * 3600e3).slice(0, 1000);
write(
  "news-sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${recent
    .map(
      (it) =>
        `<url><loc>${xmlEsc(`${ctx.siteUrl}/story/${it.s.id}/`)}</loc><news:news><news:publication><news:name>The Simplest News</news:name><news:language>hi</news:language></news:publication><news:publication_date>${new Date(it.s.p).toISOString()}</news:publication_date><news:title>${xmlEsc(it.hi.h)}</news:title></news:news></url>`,
    )
    .join("\n")}\n</urlset>\n`,
);
if (site.adsense?.client) write("ads.txt", `google.com, ${site.adsense.client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);

// IndexNow: the key file proves the site is ours; the list of story pages written in this run is sent to
// Bing, Yahoo, Yandex and others after the site is published (see .github/workflows/update.yml).
const indexNowKey = site.indexNow?.key || "";
if (/^[A-Za-z0-9-]{8,128}$/.test(indexNowKey)) {
  write(`${indexNowKey}.txt`, indexNowKey);
  const host = new URL(siteUrl).host;
  const fresh = items.filter((it) => it.ok && it.s.a?.at && now - it.s.a.at < 40 * 60e3).map((it) => `${ctx.siteUrl}/story/${it.s.id}/`);
  const listFile = process.env.INDEXNOW_OUT || path.join(ROOT, ".cache", "indexnow.json");
  fs.rmSync(listFile, { force: true });
  if (fresh.length && !/^(localhost|127\.)/.test(host)) {
    fs.mkdirSync(path.dirname(listFile), { recursive: true });
    fs.writeFileSync(listFile, JSON.stringify({ host, key: indexNowKey, keyLocation: `${ctx.siteUrl}/${indexNowKey}.txt`, urlList: fresh.slice(0, 10000) }));
    log(`[build] IndexNow: ${fresh.length} new story pages listed`);
  }
}
write(
  "manifest.webmanifest",
  JSON.stringify({ name: site.name.en, short_name: "Simplest News", start_url: `${base}/`, display: "standalone", background_color: "#0f1115", theme_color: "#0f1115", icons: [{ src: `${base}/assets/img/icon-192.png`, sizes: "192x192", type: "image/png" }, { src: `${base}/assets/img/icon-512.png`, sizes: "512x512", type: "image/png" }, { src: `${base}/assets/img/icon.svg`, sizes: "any", type: "image/svg+xml" }] }),
);
write(".nojekyll", "");

const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
log(`[build] ${pages} pages (${storyPages} stories, ${placePages} places) · site ${(size(OUT) / 1e6).toFixed(1)} MB · ${((Date.now() - now) / 1000).toFixed(1)} s`);
