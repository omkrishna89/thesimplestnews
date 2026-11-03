// Runs every 30 minutes on GitHub:
//  1. reads all due news feeds and keeps the new stories (last 48 hours)
//  2. reads the full article of the most important new stories (only where robots.txt allows)
//  3. Google Gemini writes the shortest headline + 9 answers in Hindi and English
//  4. updates movie trailers/songs (YouTube) and gold/silver rates
//  5. forgets stories older than 7 days, and saves everything in .data/db.json.gz
// Options: --no-fetch (skip feeds), --no-ai (skip Gemini), MOCK_AI=1 (fake answers, for testing the site only)
import { readArticle, allowedByRobots } from "./lib/article.mjs";
import { loadDB, saveDB, similarity, words } from "./lib/db.mjs";
import { parseFeed } from "./lib/feeds.mjs";
import { NOT_SAID, QUESTIONS, QuotaError, hasKey, summarize } from "./lib/gemini.mjs";
import { updateMetals } from "./lib/metals.mjs";
import { COVERED, districtSlug, placeSlug, stateCode } from "./lib/places.mjs";
import { clip, config, get, hash, log, plain, pool, sleep, TZ } from "./lib/util.mjs";
import { updateVideos } from "./lib/youtube.mjs";

const args = new Set(process.argv.slice(2));
const site = config("site.json");
const FEEDS = config("sources.json").feeds;
const STATE_NAMES = config("places.json").states;
const KEEP_MS = (site.keepDays || 7) * 86400e3;
const NEW_MS = 48 * 3600e3; // stories older than this are not added
const AI_MAX_AGE = 36 * 3600e3; // older stories are not sent to Gemini any more
const UNSUMMARIZED_KEEP = 48 * 3600e3; // stories Gemini never wrote are forgotten after this
const MOCK = process.env.MOCK_AI === "1";
const started = Date.now();
const RUN_BUDGET_MS = Number(process.env.RUN_BUDGET_MS || 18 * 60e3);

const db = loadDB();
const now = Date.now();
const byId = new Map(db.stories.map((s) => [s.id, s]));

// ---------- 1. feeds ----------
const cleanTitle = (t) =>
  plain(t)
    .replace(/^[A-Za-z][A-Za-z .&-]{1,40} News\s*[:|]\s*/, "") // "Barabanki News: ..."
    .replace(/\s*[|–-]\s*(Amar Ujala|Patrika|ABP Live|Aaj Tak|Dainik Bhaskar|BBC Hindi|NDTV|India TV)\s*$/i, "")
    .trim();

function addStory(feed, item) {
  const id = hash(item.link);
  if (db.seen[id] || byId.has(id)) return null;
  db.seen[id] = now;
  let published = Number.isFinite(item.published) ? item.published : now;
  if (published > now + 10 * 60e3) published = now; // some feeds send future times
  if (now - published > NEW_MS) return null;
  const title = cleanTitle(item.title);
  if (title.length < 8) return null;
  const snippet = clip(item.text, 300);
  const story = {
    id,
    u: item.link,
    src: feed.id,
    pub: feed.source,
    l: feed.lang,
    t: title,
    ...(snippet && similarity(words(snippet), words(title)) < 0.8 ? { x: snippet } : {}),
    img: item.image || "",
    p: published,
    f: now,
    lv: feed.level,
    ...(feed.state ? { st: feed.state } : {}),
    ...(feed.district ? { d: feed.district } : {}),
    ...(feed.tehsil ? { th: feed.tehsil } : {}),
    ...(feed.groups ? { gh: feed.groups } : {}),
    pr: feed.priority || 5,
    s: "new",
    tr: 0,
  };
  // State feeds whose story addresses name the district: /local/rajasthan/jaipur/...
  if (feed.urlDistrict && !story.d) {
    try {
      const m = new RegExp(feed.urlDistrict).exec(new URL(item.link).pathname);
      if (m && !/^(news|photos?|videos?|live|gallery|web-stories|ampstories|g)$/.test(m[1])) story.d = districtSlug(feed.state, m[1]);
    } catch {}
  }
  db.stories.push(story);
  byId.set(id, story);
  return story;
}

async function readFeeds() {
  const due = FEEDS.filter((f) => {
    const st = db.feeds[f.id];
    if (!st?.last) return true;
    const every = (f.every || 30) * 60e3;
    // a feed that keeps failing is tried less often (up to once in 6 hours)
    const backoff = Math.min(6 * 3600e3, every * 2 ** Math.min(st.fail || 0, 4));
    return now - st.last >= (st.fail ? backoff : every) - 5 * 60e3;
  });
  log(`[feeds] ${due.length} of ${FEEDS.length} feeds are due`);
  let added = 0;
  let failed = 0;
  await pool(due, 12, async (feed) => {
    const st = (db.feeds[feed.id] ||= {});
    st.last = now;
    try {
      if (!(await allowedByRobots(feed.url))) throw new Error("robots.txt says no");
      const headers = {};
      if (st.etag) headers["if-none-match"] = st.etag;
      if (st.lm) headers["if-modified-since"] = st.lm;
      const res = await get(feed.url, { timeout: 20000, headers });
      if (res.status === 304) {
        st.fail = 0;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { items } = parseFeed(res.text);
      st.etag = res.headers.get("etag") || undefined;
      st.lm = res.headers.get("last-modified") || undefined;
      let n = 0;
      for (const item of items) if (addStory(feed, item)) n++;
      added += n;
      st.fail = 0;
      st.items = items.length;
      st.newest = Math.max(...items.map((i) => i.published).filter(Number.isFinite), st.newest || 0);
    } catch (err) {
      failed++;
      st.fail = (st.fail || 0) + 1;
      st.err = String(err.message || err).slice(0, 120);
    }
  });
  log(`[feeds] ${added} new stories, ${failed} feeds failed`);
}

// ---------- same story from many websites ----------
const tokenCache = new Map();
const toks = (s, text) => {
  const k = `${s.id}:${text.length}`;
  if (!tokenCache.has(k)) tokenCache.set(k, words(text));
  return tokenCache.get(k);
};

function markDuplicate(dup, master) {
  dup.s = "dup";
  dup.dup = master.id;
  master.also ||= [];
  if (!master.also.some((a) => a.u === dup.u) && master.also.length < 12) master.also.push({ u: dup.u, pub: dup.pub });
}

// Before Gemini: nearly the same title in the same language within 36 hours
function dedupeTitles() {
  const recent = db.stories.filter((s) => s.s !== "dup" && now - s.p < 36 * 3600e3).sort((a, b) => a.f - b.f || b.pr - a.pr);
  const kept = [];
  let n = 0;
  for (const s of recent) {
    const w = toks(s, s.t);
    const twin = s.s === "new" && kept.find((k) => k.l === s.l && Math.abs(k.p - s.p) < 36 * 3600e3 && similarity(toks(k, k.t), w) >= 0.6);
    if (twin) {
      markDuplicate(s, twin);
      n++;
    } else kept.push(s);
  }
  if (n) log(`[dedupe] ${n} stories were the same as another story`);
}

// After Gemini: compare the English headlines Gemini wrote (works across Hindi and English sources)
function dedupeHeadlines(fresh) {
  const pool_ = db.stories.filter((s) => s.s === "ok" && now - s.p < 36 * 3600e3);
  let n = 0;
  for (const s of fresh) {
    if (s.s !== "ok") continue;
    const w = words(s.a.en.h);
    const twin = pool_.find(
      (k) => k !== s && k.s === "ok" && k.f <= s.f && sameArea(k, s) && similarity(words(k.a.en.h), w) >= 0.55,
    );
    if (twin) {
      markDuplicate(s, twin);
      n++;
    }
  }
  if (n) log(`[dedupe] ${n} summarized stories were the same as an earlier one`);
}
const sameArea = (a, b) => (a.loc?.c || "in") === (b.loc?.c || "in") && (a.loc?.s || "") === (b.loc?.s || "") && (!a.loc?.d || !b.loc?.d || a.loc.d === b.loc.d);

// ---------- where a story happened ----------
const isIndia = (c) => !c || /^(india|bharat|भारत|इंडिया|in)$/i.test(c.trim());

function locate(story) {
  const a = story.a;
  const pl = a?.place || {};
  let st = stateCode(pl.state) || story.st || "";
  const world = a ? !isIndia(pl.country) : story.lv === "world";
  if (world) return { c: "world" };
  let d = pl.district ? districtSlug(st, pl.district) : "";
  if (!d && story.d && (!pl.state || stateCode(pl.state) === story.st)) d = story.d;
  if (!st && d) st = story.st || "";
  let t = pl.tehsil ? placeSlug(pl.tehsil) : "";
  if (!t && story.th && d === story.d) t = story.th;
  let l = pl.local ? placeSlug(pl.local) : "";
  const loc = { c: "in" };
  if (st) loc.s = st;
  if (st && d) loc.d = d;
  if (loc.d && t) loc.t = t;
  if (loc.d && l) loc.l = l;
  return loc;
}

function scopeOf(story, loc) {
  if (loc.c === "world") return "world";
  const sc = story.a?.scope;
  if (sc === "world") return "country"; // Gemini said world but the place is in India
  if (sc) {
    // never claim a smaller area than we know
    const order = ["local", "tehsil", "district", "state", "country"];
    const known = loc.l ? 0 : loc.t ? 1 : loc.d ? 2 : loc.s ? 3 : 4;
    return order[Math.max(order.indexOf(sc), known)] || "country";
  }
  if (story.lv === "district") return loc.t ? "tehsil" : "district";
  if (story.lv === "state") return "state";
  return "country";
}

// ---------- 2 + 3. read articles and let Gemini write ----------
const istTime = (t) => new Intl.DateTimeFormat("en-IN", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(t));

function candidates() {
  const list = db.stories.filter((s) => s.s === "new" && s.tr < 3 && now - s.p < AI_MAX_AGE);
  const score = (s) => s.pr * 10 - (now - s.p) / 3600e3 * 1.5 + (s.lv === "country" ? 5 : 0) + (s.tr ? -15 : 0);
  list.sort((a, b) => score(b) - score(a));
  // share Gemini fairly: at most 2 stories per district in one run
  const perDistrict = new Map();
  const out = [];
  for (const s of list) {
    if (s.lv === "district") {
      const k = `${s.st}/${s.d}`;
      const n = perDistrict.get(k) || 0;
      if (n >= 2) continue;
      perDistrict.set(k, n + 1);
    }
    out.push(s);
    if (out.length >= Number(process.env.GEMINI_PER_RUN || site.gemini.perRun)) break;
  }
  return out;
}

function mockAnswer(s) {
  const mk = (lang) => ({
    h: clip(s.t, 70),
    q: QUESTIONS.map((q, i) => (i === 0 ? clip(s.x || s.t, 120) : i === 4 && s.d ? s.d : i === 5 ? istTime(s.p) : NOT_SAID[lang])),
  });
  return { hi: mk("hi"), en: mk("en"), groups: s.gh || [], good: false, imp: s.pr, scope: "", place: { country: s.lv === "world" ? "World" : "India", state: s.st || "", district: s.d || "", tehsil: s.th || "", local: "", local_hi: "", district_hi: "" }, sameAs: 0 };
}

function apply(story, r, model) {
  const groups = [...new Set([...(r.groups || []), ...(story.gh || [])])].slice(0, 4);
  story.a = { hi: r.hi, en: r.en, g: groups, good: r.good, imp: r.imp, scope: r.scope, place: r.place, m: model, at: Date.now() };
  if (r.good && !groups.includes("good-news")) story.a.g.push("good-news");
  story.loc = locate(story);
  story.sc = scopeOf(story, story.loc);
  story.s = "ok";
  // learn Hindi names of places for the location bar
  if (story.loc.d && r.place.district_hi) db.names[`${story.loc.s}/${story.loc.d}`] ||= r.place.district_hi;
  if (story.loc.l && r.place.local_hi) db.names[`${story.loc.s}/${story.loc.d}/${story.loc.l}`] ||= r.place.local_hi;
}

async function writeStories() {
  if (args.has("--no-ai")) return log("[ai] skipped (--no-ai)");
  if (!hasKey() && !MOCK) return log("[ai] no GEMINI_API_KEY: stories show 'summary coming soon'");
  const list = candidates();
  log(`[ai] ${list.length} stories to write`);
  const batchSize = Number(process.env.GEMINI_BATCH || site.gemini.batch);
  const fresh = [];
  let calls = 0;
  for (let i = 0; i < list.length; i += batchSize) {
    if (Date.now() - started > RUN_BUDGET_MS) {
      log("[ai] time is up for this run; the rest waits for the next run");
      break;
    }
    const batch = list.slice(i, i + batchSize);
    // read the full articles (only where the website allows robots)
    await pool(batch, 8, async (s) => {
      const art = await readArticle(s.u).catch((e) => ({ ok: false, reason: e.message }));
      s._text = art.ok ? art.text : [s.t, s.x].filter(Boolean).join(". ");
      if (!s.img && art.image) s.img = art.image;
      s.rd = art.ok ? 1 : 0;
    });
    for (const s of batch) s.tr++;
    let out;
    try {
      if (MOCK) out = { model: "mock", results: batch.map(mockAnswer) };
      else {
        if (calls++ > 0) await sleep(Number(process.env.GEMINI_PAUSE_MS || site.gemini.pauseMs));
        out = await summarize(
          batch.map((s) => ({
            sourceName: s.pub.en,
            stateHint: s.st ? STATE_NAMES[s.st]?.en : "",
            districtHint: s.d || "",
            tehsilHint: s.th || "",
            publishedIST: istTime(s.p),
            title: s.t,
            text: clip(s._text, 3500),
          })),
        );
      }
    } catch (err) {
      for (const s of batch) delete s._text;
      if (err instanceof QuotaError) {
        log(`[ai] free limit reached: ${err.message.slice(0, 120)} — the rest waits for the next run`);
        for (const s of batch) s.tr--; // not their fault
        break;
      }
      log(`[ai] batch failed: ${String(err.message).slice(0, 160)}`);
      continue;
    }
    out.results.forEach((r, j) => {
      const s = batch[j];
      delete s._text;
      if (!r) return;
      apply(s, r, out.model);
      fresh.push(s);
      if (r.sameAs && r.sameAs !== j + 1 && batch[r.sameAs - 1]?.s === "ok") markDuplicate(s, batch[r.sameAs - 1]);
    });
    log(`[ai] batch ${i / batchSize + 1}: ${out.results.filter(Boolean).length}/${batch.length} written by ${out.model}`);
  }
  for (const s of list) if (s.s === "new" && s.tr >= 3) s.s = "fail";
  dedupeHeadlines(fresh);
}

// ---------- 4. trailers & songs, gold & silver ----------
async function extras() {
  if (args.has("--no-fetch")) return;
  if (!db.videosAt || now - db.videosAt > 55 * 60e3) {
    try {
      const r = await updateVideos(db.videos, { keepDays: site.keepDays });
      db.videos = r.videos;
      db.videosAt = now;
      log(`[youtube] ${r.fresh} new trailers/songs, ${r.videos.length} kept${r.failed ? `, ${r.failed} channels failed` : ""}`);
    } catch (err) {
      log(`[youtube] ${err.message}`);
    }
  }
  if (!db.metals?.checked || now - db.metals.checked > 2.5 * 3600e3) {
    db.metals = await updateMetals(db.metals || {});
    log(`[metals] IBJA ${db.metals.ibja ? `${db.metals.ibja.date} ${db.metals.ibja.session}` : "not available"}, history ${db.metals.intl ? "ok" : "not available"}`);
  }
}

// ---------- 5. forget old stories ----------
function prune() {
  const before = db.stories.length;
  const ids = new Set();
  db.stories = db.stories.filter((s) => {
    const age = now - s.p;
    const keep = s.s === "ok" || s.s === "dup" ? age < KEEP_MS : age < UNSUMMARIZED_KEEP;
    if (keep) ids.add(s.id);
    return keep;
  });
  for (const s of db.stories) if (s.s === "dup" && !ids.has(s.dup)) s.s = s.a ? "ok" : "new";
  for (const [k, t] of Object.entries(db.seen)) if (now - t > KEEP_MS + 86400e3) delete db.seen[k];
  log(`[prune] ${before - db.stories.length} old stories removed, ${db.stories.length} kept`);
}

// unsummarized stories still need a place
function locateAll() {
  for (const s of db.stories) {
    if (!s.loc) {
      s.loc = locate(s);
      s.sc = scopeOf(s, s.loc);
    }
  }
}

if (!args.has("--no-fetch")) await readFeeds();
dedupeTitles();
locateAll();
await writeStories();
await extras();
prune();
const size = saveDB(db);
const count = (st) => db.stories.filter((s) => s.s === st).length;
log(`[done] ${count("ok")} written, ${count("new")} waiting, ${count("dup")} duplicates, ${count("fail")} failed · db ${(size / 1e6).toFixed(1)} MB · ${((Date.now() - started) / 1000).toFixed(0)} s`);
if (COVERED.length === 0) log("warning: no covered states in config/places.json");
