// The Simplest News — everything that happens in the browser. Small and without frameworks, so it stays fast.
import { T, PLACE_TABS, ago, esc, istDay, itemHTML, qaHTML, slug, stockFile, thumb } from "./ui.js";
import { foldText, gdeltItems, gdeltQuery, gdeltUrl, googleNewsUrl, parseQuery, rank } from "./search.js";

const D = document;
const H = D.documentElement;
const B = D.body;
const base = B.dataset.base || "";
const view = JSON.parse(B.dataset.view || "null");
const PROXY = "https://wsrv.nl/?url={url}&w={w}&h={h}&fit=cover&a=attention&output=webp&q=70";
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
let lang = H.dataset.lang === "en" ? "en" : "hi";

// ---------- small helpers ----------
const raw = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => raw.set(k, JSON.stringify(v)) };
const $ = (s, el = D) => el.querySelector(s);
const $$ = (s, el = D) => [...el.querySelectorAll(s)];
const jsonCache = new Map();
const getJSON = (p) => {
  if (!jsonCache.has(p)) jsonCache.set(p, fetch(base + p).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return jsonCache.get(p);
};
const index = () => getJSON("/data/index.json");
const placesData = () => getJSON("/data/places.json");
const icons = {};
$$(".gnav .chip").forEach((a) => {
  const m = /\/([a-z-]+)\/$/.exec(a.getAttribute("href") || "");
  if (m) icons[m[1]] = a.firstElementChild?.textContent || "";
});
const rctx = () => ({ base, proxy: PROXY, now: Date.now(), icon: (g) => icons[g] || "📰" });

// ---------- language and light/dark ----------
function setLang(l) {
  lang = l;
  H.dataset.lang = l;
  H.lang = l;
  raw.set("lang", l);
  $$("[data-set-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.setLang === l)));
  closePop();
  $$(".it.is-open").forEach((a) => {
    a.classList.remove("is-open");
    $(".it__qa", a)?.remove();
  });
  if (list.dynamic) loadAndRender();
  else seeMore();
  showPlace();
  drawWatch();
  searchBox();
  // the buttons' words have another width in the other language
  fitGroups();
  showTrends();
}
$$("[data-set-lang]").forEach((b) => {
  b.setAttribute("aria-pressed", String(b.dataset.setLang === lang));
  b.addEventListener("click", () => b.dataset.setLang !== lang && setLang(b.dataset.setLang));
});
$("[data-toggle-theme]")?.addEventListener("click", () => {
  const t = H.dataset.theme === "light" ? "dark" : "light";
  H.dataset.theme = t;
  raw.set("theme", t);
  $('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#ffffff" : "#0f1115");
});
if (H.dataset.theme === "light") $('meta[name="theme-color"]')?.setAttribute("content", "#ffffff");

// keep the active group chip in view, and open groups on the reader's favourite tab
const favTab = store.get("tab", "country");
if (favTab !== "country") {
  $$(".gnav .chip").forEach((a) => {
    const href = a.getAttribute("href");
    a.setAttribute("href", href === `${base}/` ? `${base}/all/${favTab}/` : `${href}${favTab}/`);
  });
}

// fresh "5 min ago" times (the page itself may be a few minutes old)
function refreshTimes(el = D) {
  const now = Date.now();
  $$("time[datetime]", el).forEach((t) => {
    if (t.closest(".st__meta")) return;
    t.textContent = ago(Date.parse(t.getAttribute("datetime")) / 1000, t.closest("[lang]")?.getAttribute("lang") === "en" ? "en" : "hi", now);
  });
}
refreshTimes();

// ---------- the reader's area ----------
let loc = store.get("loc", null);

async function canon(s, name) {
  const P = await placesData();
  const a = P?.alias?.[s] || {};
  if (a["*"]) return a["*"];
  const k = slug(name);
  return a[k] || k;
}
const clean = (n = "") => String(n).replace(/\b(district|tehsil|block|taluk|taluka|subdivision)\b/gi, "").replace(/\s+/g, " ").trim();

async function fromBDC(d, approx) {
  const P = await placesData();
  if (!d || !P) return null;
  if (d.countryCode && d.countryCode !== "IN") return { c: "world", approx, names: { l: d.city || d.locality || d.countryName } };
  let s = P.iso[d.principalSubdivisionCode] || "";
  if (!s) for (const [code, st] of Object.entries(P.states)) if (slug(st.en) === slug(d.principalSubdivision)) s = code;
  if (!s) return null;
  const adm = d.localityInfo?.administrative || [];
  const dist = adm.find((a) => a.adminLevel === 5 && /district/i.test(a.name || "")) || adm.find((a) => a.adminLevel === 5);
  const teh = adm.find((a) => a.adminLevel === 6 && /tehsil|taluk|block|subdivision|mandal/i.test(a.name || ""));
  const town = d.city || d.locality || "";
  return {
    c: "in",
    s,
    d: dist ? await canon(s, dist.name) : "",
    t: teh ? slug(teh.name) : "",
    l: town ? slug(town) : "",
    approx,
    names: { d: clean(dist?.name), t: clean(teh?.name), l: town },
    at: Date.now(),
  };
}

async function fromOSM(a) {
  const P = await placesData();
  if (!a || !P) return null;
  if (a.country_code && a.country_code !== "in") return { c: "world", names: { l: a.city || a.town || a.country } };
  let s = "";
  for (const [code, st] of Object.entries(P.states)) if (slug(st.en) === slug(a.state)) s = code;
  if (!s) return null;
  const town = a.village || a.town || a.city || a.suburb || a.hamlet || "";
  return { c: "in", s, d: a.state_district ? await canon(s, a.state_district) : "", t: a.county ? slug(a.county) : "", l: town ? slug(town) : "", approx: false, names: { d: clean(a.state_district), t: clean(a.county), l: town }, at: Date.now() };
}

async function guessFromInternet() {
  try {
    const r = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en", { signal: AbortSignal.timeout(8000) });
    const l = await fromBDC(await r.json(), true);
    if (l) store.set("loc", (loc = l));
  } catch {}
  return loc;
}

function gps() {
  const btn = $("[data-loc-chip]");
  if (!navigator.geolocation) return alert(T[lang].gpsDenied);
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-busy");
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: la, longitude: lo } = pos.coords;
      let l = null;
      try {
        const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${la}&longitude=${lo}&localityLanguage=en`, { signal: AbortSignal.timeout(10000) });
        l = await fromBDC(await r.json(), false);
      } catch {}
      if (!l || !l.d) {
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${lo}&zoom=14&addressdetails=1&accept-language=en`, { signal: AbortSignal.timeout(10000) });
          l = (await fromOSM((await r.json()).address)) || l;
        } catch {}
      }
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
      if (!l) return alert(T[lang].noPlace);
      store.set("loc", (loc = l));
      showPlace();
      if (list.ready && PLACE_TABS.has(list.tab)) loadAndRender();
    },
    () => {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-busy");
      }
      alert(T[lang].gpsDenied);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 6 * 3600e3 },
  );
}
$("[data-loc-chip]")?.addEventListener("click", gps);

// The reader's place in the top bar: "📍 Sanganer" on phones, "📍 Sanganer, Jaipur, Rajasthan" on computers.
// Tapping it finds the exact place with GPS.
async function showPlace() {
  const chip = $("[data-loc-chip]");
  if (!chip) return;
  const L = T[lang];
  const short = $("[data-loc-short]", chip);
  const full = $("[data-loc-full]", chip);
  chip.hidden = false;
  if (!loc) {
    short.textContent = full.textContent = L.setPlace;
    chip.classList.add("is-approx");
    chip.title = L.useGps;
    return;
  }
  const P = await placesData();
  const key = loc.d ? `${loc.s}/${loc.d}` : "";
  const hiD = P?.names?.[key];
  const dName = lang === "hi" && hiD ? hiD : loc.names?.d || "";
  const lName = lang === "hi" && P?.names?.[`${key}/${loc.l}`] ? P.names[`${key}/${loc.l}`] : loc.names?.l || "";
  const st = P?.states?.[loc.s]?.[lang] || "";
  const parts = [lName, dName && dName !== lName ? dName : "", st].filter(Boolean);
  full.textContent = parts.join(", ") || L.setPlace;
  short.textContent = lName || dName || st || L.setPlace;
  chip.classList.toggle("is-approx", !!loc.approx);
  chip.title = loc.approx ? `${parts.join(", ")} (${L.approx}) — ${L.useGps}` : `${parts.join(", ")} — ${L.useGps}`;
}

// ---------- lists: which stories, in what order ----------
const list = { ready: false, dynamic: false, loading: 0, tab: view?.tab, groups: [], q: "", query: null, rank: null, sort: store.get("sort", "newest"), day: "all", date: "", from: "", to: "", keys: [], loaded: [], ids: new Set(), days: [], next: 0, shown: 30, items: [] };
const LOCAL_SCOPES = ["local", "tehsil", "district"];
const PLACE_KEY_TABS = new Set(["district", "tehsil", "local"]); // these tabs read the district's list and filter it here

// The groups shown: one or more, picked with the group buttons (remembered on this phone). None = all news.
const chipEls = $$(".gnav .chip[data-g]");
const GROUP_OK = new Set(chipEls.map((a) => a.dataset.g).filter((g) => g !== "all"));
const cleanGroups = (arr) => [...new Set((Array.isArray(arr) ? arr : []).filter((g) => GROUP_OK.has(g)))];
const pageGroups = view?.group && view.group !== "all" ? [view.group] : [];
{
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("g");
  list.groups = fromUrl !== null ? cleanGroups(fromUrl.split(",")) : view?.group === "all" ? cleanGroups(store.get("groups", [])) : pageGroups;
  // a search address: /?q=cockroach%20janta%20party
  const q = (params.get("q") || "").trim().slice(0, 80);
  if (q && view?.tab) {
    list.groupsBefore = list.groups;
    list.groups = [];
    list.q = q;
  }
}

// The Stocks box: the reader's own stocks, e.g. [{ s: "RELIANCE" }, { t: "Suzlon" }] (kept only on this phone)
let watch = store.get("stocks", []).filter((w) => w && (w.s || w.t));
const watching = () => !list.q && list.groups.length === 1 && list.groups[0] === "stock-market" && watch.length > 0;
// Search (the box on Home, or 🔍 in the top bar): every story of the last days, by words in its headline and
// summary. Spellings are forgiven and rare words count most (src/assets/js/search.js).
const searching = () => !!list.q;
const found = (it) => !!list.rank?.tiers.has(it);
const reRank = () => (list.rank = rank(list.loaded, list.query || (list.query = parseQuery(list.q))));
// company news is often in Business, so the Stocks box looks there too
const loadGroups = () => (watching() ? ["stock-market", "business"] : list.groups);

function keyFor(tab, group) {
  if (tab === "world") return `world/${group}`;
  if (tab === "country") return `in/${group}`;
  if (!loc || loc.c !== "in") return null;
  if (tab === "state") return `s-${loc.s}/${group}`;
  return loc.d ? `d/${loc.s}/${loc.d}` : null;
}
function keysFor(tab) {
  if (searching()) return ["search"]; // data/<lang>/search/<day>.json: all stories of a day
  if (PLACE_KEY_TABS.has(tab)) {
    const k = keyFor(tab, "all");
    return k ? [k] : [];
  }
  const gs = loadGroups();
  return [...new Set((gs.length ? gs : ["all"]).map((g) => keyFor(tab, g)).filter(Boolean))];
}
const inGroups = (it) => {
  const gs = loadGroups();
  return !gs.length || gs.some((g) => (g === "local" ? LOCAL_SCOPES.includes(it.sc) : it.g?.includes(g)));
};

// Search results by tab: World = news from outside India, Country = all of India, State/District/… = the reader's area
function inTab(it, tab) {
  if (tab === "world") return it.sc === "world";
  if (tab === "country") return it.sc !== "world";
  if (!loc || loc.c !== "in" || it.p[0] !== loc.s) return false;
  if (tab === "state") return true;
  if (it.p[1] !== loc.d) return false;
  if (tab === "district") return true;
  if (tab === "tehsil") return !!loc.t && (it.p[2] === loc.t || it.p[3] === loc.t);
  return !!it.p[3] && (it.p[3] === loc.l || it.p[3] === loc.t || it.p[2] === loc.l);
}

function keep(it) {
  const { tab } = list;
  if (searching()) return found(it) && inTab(it, tab);
  if (watching()) {
    // the reader's own stocks: news from every group; Country and World both show India + world news,
    // the place tabs only news from the reader's state / district
    if (!dayWanted(istDay(it.t * 1000))) return false;
    if (PLACE_TABS.has(tab) && !(loc?.c === "in" && it.p[0] === loc.s)) return false;
    if (PLACE_KEY_TABS.has(tab) && it.p[1] !== loc.d) return false;
  } else if (PLACE_KEY_TABS.has(tab)) {
    if (!inGroups(it)) return false;
  }
  if (tab === "tehsil" && PLACE_KEY_TABS.has(tab) && !(loc.t && (it.p[2] === loc.t || it.p[3] === loc.t))) return false;
  if (tab === "local" && !(it.p[3] && (it.p[3] === loc.l || it.p[3] === loc.t || it.p[2] === loc.l))) return false;
  return !watching() || matchesWatch(it);
}

// All news about the reader's stocks at once: one small file per listed company (made by the build), and for names
// typed by the reader that aren't in the list, the day files of all groups, India and world.
const WIDE = ["all", "stock-market", "business", "tech", "ai", "startup", "money", "auto", "jobs"];
async function loadWatch() {
  const idx = await index();
  Object.assign(list, { keys: [], loaded: [], ids: new Set(), next: 0, days: [] });
  if (!idx) return;
  const have = idx.stocks?.[lang] || {};
  const jobs = watch.filter((w) => w.s && have[w.s]).map((w) => getJSON(`/data/${lang}/stock/${stockFile(w.s)}.json`));
  if (watch.some((w) => !w.s)) {
    for (const k of WIDE.flatMap((g) => [`in/${g}`, `world/${g}`])) for (const d of (idx.days[k] || []).filter(dayWanted)) jobs.push(getJSON(`/data/${lang}/${k}/${d}.json`));
  }
  for (const f of await Promise.all(jobs)) {
    for (const it of f || []) {
      if (list.ids.has(it.i)) continue;
      list.ids.add(it.i);
      list.loaded.push(it);
    }
  }
}

// Stock names must stand on their own ("Tata" is not found inside "Tatanagar").
// Words in CAPITALS (TCS, ITC, SBI) must match exactly. No look-behind, so older iPhones work too.
const EDGE = "[^\\p{L}\\p{M}\\p{N}]";
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function wordTests(words) {
  const exact = words.filter((w) => /[A-Z]/.test(w) && !/[a-z]/.test(w));
  const loose = words.filter((w) => !exact.includes(w));
  const mk = (ws, flags) => {
    try {
      // in front: not a letter, digit or hyphen ("self-reliance" is not Reliance); after: not a letter or digit
      return new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}-])(?:${ws.join("|")})(?=$|${EDGE})`, flags);
    } catch {
      return null;
    }
  };
  return [loose.length ? mk(loose, "iu") : null, exact.length ? mk(exact, "u") : null].filter(Boolean);
}
let stocksList = null;
const stocksData = async () => (stocksList ||= (await getJSON("/data/stocks.json")) || []);
async function watchEntries() {
  const all = await stocksData();
  const own = (t) => ({ en: t, hi: t, k: [reEsc(t)] });
  return watch.map((w) => (w.s ? all.find((x) => x.s === w.s) || own(w.s) : own(w.t)));
}
let watchTests = [];
const matchesWatch = (it) => {
  const text = [it.h, it.x || "", ...(it.q || [])].join(" \n ");
  return watchTests.some((r) => r.test(text));
};

// what the reader opens most (kept only on their own phone)
const profile = store.get("prof", { g: {}, w: {}, at: Date.now() });
const STOP = new Set("the and for with from that this have has are was were will after over into about news what when where which बाद लिए में से की का के को पर और है हैं था थी थे ने एक यह वह भी तो ही".split(" "));
const tokens = (s) => String(s).toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
function learn(it) {
  if (!it) return;
  const days = (Date.now() - profile.at) / 86400e3;
  if (days > 1) {
    const f = 0.97 ** days;
    for (const m of [profile.g, profile.w]) for (const k in m) if ((m[k] *= f) < 0.2) delete m[k];
    profile.at = Date.now();
  }
  for (const g of it.g || []) profile.g[g] = (profile.g[g] || 0) + 1;
  for (const w of tokens(it.h)) profile.w[w] = (profile.w[w] || 0) + 1;
  const words = Object.entries(profile.w).sort((a, b) => b[1] - a[1]).slice(0, 400);
  profile.w = Object.fromEntries(words);
  store.set("prof", profile);
}
const relevance = (it, now) => (it.g || []).reduce((n, g) => n + (profile.g[g] || 0) * 2, 0) + tokens(it.h).reduce((n, w) => n + (profile.w[w] || 0), 0) + Math.max(0, 3 - (now - it.t * 1000) / 8 / 3600e3);

function order(items) {
  const arr = [...items];
  const now = Date.now();
  arr.forEach((it) => delete it.big);
  switch (list.sort) {
    case "important":
      return arr.sort((a, b) => b.m - a.m || b.t - a.t);
    case "relevant":
      return arr.sort((a, b) => relevance(b, now) - relevance(a, now) || b.t - a.t);
    case "big": {
      arr.sort((a, b) => b.t - a.t);
      const newest = arr[0]?.t || 0;
      const top = arr.filter((it) => it.m >= 6 && newest - it.t < 6 * 3600).sort((a, b) => b.m - a.m || b.t - a.t).slice(0, 3);
      top.forEach((it) => (it.big = true));
      return [...top, ...arr.filter((it) => !top.includes(it))];
    }
    default:
      return arr.sort((a, b) => b.t - a.t);
  }
}
// A search: the stories with more of the words first, each part in the reader's order (newest first, …)
function arrange(items) {
  if (!searching() || !list.rank) return order(items);
  const by = new Map();
  for (const it of items) {
    const t = list.rank.tiers.get(it) || 0;
    if (!by.has(t)) by.set(t, []);
    by.get(t).push(it);
  }
  return [...by.keys()].sort((a, b) => b - a).flatMap((t) => order(by.get(t)));
}

const today = () => istDay(Date.now());
const shiftDay = (day, n) => istDay(Date.parse(`${day}T12:00:00+05:30`) + n * 86400e3);

function dayWanted(d) {
  if (list.day === "today") return d === today();
  if (list.day === "yesterday") return d === shiftDay(today(), -1);
  if (list.day === "pick") return d === list.date;
  if (list.day === "range") return (!list.from || d >= list.from) && (!list.to || d <= list.to);
  return true;
}

async function loadDays() {
  const idx = await index();
  const keys = keysFor(list.tab);
  Object.assign(list, { keys, loaded: [], ids: new Set(), next: 0, days: [] });
  if (!keys.length || !idx) return;
  list.days = [...new Set(keys.flatMap((k) => idx.days[k] || []))].sort().reverse().filter(dayWanted);
  // one day first (small and fast); a second one only when the first is nearly empty.
  // For the reader's own stocks: older days too, until enough news about them is found.
  await loadMore(1);
  if (searching()) {
    // a search keeps reading older days until it has a page of results (the words are weighed again each time)
    for (reRank(); list.loaded.filter(keep).length < 30 && list.next < list.days.length; reRank()) await loadMore(1);
    return;
  }
  const want = watching() ? 15 : 40;
  while (list.loaded.filter(keep).length < want && list.next < list.days.length && (watching() || list.next < 2)) await loadMore(1);
}

async function loadMore(n = 1) {
  const idx = await index();
  const keys = list.keys;
  const take = list.days.slice(list.next, list.next + n);
  list.next += take.length;
  const files = await Promise.all(take.flatMap((d) => keys.filter((k) => idx?.days[k]?.includes(d)).map((k) => getJSON(`/data/${lang}/${k}/${d}.json`))));
  if (keys !== list.keys) return; // the reader switched to other groups meanwhile
  // a story in two picked groups is shown once
  for (const f of files) {
    for (const it of f || []) {
      if (list.ids.has(it.i)) continue;
      list.ids.add(it.i);
      list.loaded.push(it);
    }
  }
}

function emptyText() {
  if (list.loading) return T[lang].searching;
  if (!loc && PLACE_TABS.has(list.tab)) return T[lang].finding;
  if (searching()) return T[lang].noResults(list.q, list.span || 1);
  // "No news about TCS in the last 3 days."
  if (watching()) return list.watchNames && list.span ? T[lang].noStockNewsDays(list.watchNames, list.span) : T[lang].noStockNews;
  if (list.tab === "local") return T[lang].emptyLocal;
  return T[lang].empty;
}

function adSlot() {
  const client = B.dataset.adClient;
  const slot = B.dataset.adInfeed;
  const div = D.createElement("div");
  div.className = "ad ad--feed";
  if (client && slot) {
    div.innerHTML = `<span class="ad__label">${esc(T[lang].adLabel)}</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  } else {
    div.classList.add("ad--empty");
    div.hidden = !previewAds;
  }
  return div;
}

function ensureDynamicList() {
  const box = $("[data-lists]");
  let el = $(".list[data-dyn]", box);
  if (!el) {
    box.innerHTML = "";
    el = D.createElement("div");
    el.className = "list";
    el.dataset.dyn = "1";
    // chunks of stories with ad spots between them; re-sorting fills the chunks again but keeps the ads
    el.append(D.createElement("div"), adSlot(), D.createElement("div"), adSlot(), D.createElement("div"));
    [...el.children].filter((c) => !c.classList.contains("ad")).forEach((c) => (c.className = "list__chunk"));
    box.append(el);
    pushAds();
  }
  list.dynamic = true;
  return el;
}

function render() {
  const el = ensureDynamicList();
  el.lang = lang;
  const chunks = $$(".list__chunk", el);
  // while a search reads its files: "Searching…" (not the old stories, and not "No news" yet)
  const shown = list.loading ? [] : list.items.slice(0, list.shown);
  const ctx = rctx();
  const html = (a) => a.map((it) => itemHTML(it, lang, ctx)).join("");
  chunks[0].innerHTML = shown.length ? html(shown.slice(0, 6)) : `<p class="empty">${esc(emptyText())}</p>`;
  chunks[1].innerHTML = html(shown.slice(6, 18));
  chunks[2].innerHTML = html(shown.slice(18));
  $$(".ad", el).forEach((a, i) => (a.style.display = shown.length > (i === 0 ? 6 : 18) ? "" : "none"));
  const more = $("[data-more]");
  if (more) more.hidden = !!list.loading || (searching() && !shown.length) || !(list.items.length > list.shown || list.next < list.days.length);
  seeMore();
}

let gen = 0; // only the newest request draws the list (taps on group buttons can be quick)
async function loadAndRender() {
  if (!view?.tab) return;
  const my = ++gen;
  if (PLACE_TABS.has(list.tab) && !loc) {
    render();
    await guessFromInternet();
    showPlace();
  }
  outside(); // other news websites (slow), at the same time as our own files; hidden when not searching
  if (searching()) {
    list.query = parseQuery(list.q);
    list.rank = null;
    watchTests = [];
    list.loading = my;
    render();
    list.span = (await index())?.span || 0;
    await loadDays();
    if (list.loading === my) list.loading = 0;
  } else if (watching()) {
    const entries = await watchEntries();
    watchTests = wordTests(entries.flatMap((w) => w.k));
    list.watchNames = entries.map((w) => (lang === "hi" ? w.hi || w.en : w.en || w.hi)).join(", ");
    list.span = (await index())?.span || 0;
    await loadWatch();
  } else {
    watchTests = [];
    await loadDays();
  }
  if (my !== gen) return;
  list.loading = 0;
  list.items = arrange(list.loaded.filter(keep));
  list.shown = 30;
  list.ready = true;
  render();
}

// A nearly empty tab points to the tab with the most stories for the same groups:
// "See 94 stories in Country →"
async function seeMore() {
  let el = $("[data-seemore]");
  if (!el) {
    const box = $("[data-lists]");
    if (!box) return;
    el = D.createElement("p");
    el.className = "seemore";
    el.dataset.seemore = "";
    box.after(el);
  }
  el.hidden = true;
  if (!list.ready || watching() || list.items.length >= 5 || list.next < list.days.length) return;
  if (PLACE_TABS.has(list.tab) && !loc) return;
  let count;
  if (searching()) {
    // the search results of the other tabs are already here
    count = (tab) => list.loaded.filter((it) => found(it) && inTab(it, tab)).length;
  } else {
    const idx = await index();
    const n = idx?.n?.[lang];
    if (!n) return;
    const gs = list.groups.length ? list.groups : ["all"];
    count = (tab) =>
      gs
        .map((g) => keyFor(tab, g))
        .filter(Boolean)
        .reduce((sum, k) => sum + (idx.days[k] || []).reduce((s, d, i) => s + (dayWanted(d) ? n[k]?.[i] || 0 : 0), 0), 0);
  }
  let best = null;
  for (const tab of ["state", "country", "world"]) {
    if (tab === list.tab || (tab === "state" && loc?.c !== "in")) continue;
    const c = count(tab);
    if (c > list.items.length && (!best || c > best.c)) best = { tab, c };
  }
  if (!best) return;
  el.lang = lang;
  el.innerHTML = `<a href="${esc(pathFor(best.tab))}" data-tab-link="${best.tab}">${esc(T[lang].seeMore(best.c, T[lang].tabs[best.tab]))}</a>`;
  el.hidden = false;
}
D.addEventListener("click", (e) => {
  const a = e.target.closest("[data-tab-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  e.preventDefault();
  setTab(a.dataset.tabLink);
});

async function more() {
  if (list.items.length <= list.shown && list.next < list.days.length) {
    await loadMore(1);
    if (searching()) reRank();
    // newly loaded (older) stories go below the ones already shown
    const known = new Set(list.items.map((i) => i.i));
    list.items.push(...arrange(list.loaded.filter((it) => !known.has(it.i) && keep(it))));
  }
  list.shown += 30;
  render();
}
let busy = false;
async function onMore() {
  if (busy || list.loading) return;
  busy = true;
  if (!list.dynamic) {
    // the page's own list becomes a list drawn from the data files, then grows
    list.items = arrange(list.loaded.filter(keep));
    list.shown = 30;
    render();
  }
  await more();
  busy = false;
}
$("[data-more]")?.addEventListener("click", onMore);
if ("IntersectionObserver" in window && $("[data-more]")) {
  new IntersectionObserver((e) => e[0].isIntersecting && !$("[data-more]").hidden && list.ready && onMore(), { rootMargin: "300px" }).observe($("[data-more]"));
}

// sort and day menus (one set per language; keep both in step)
function syncControls() {
  $$("[data-sort]").forEach((s) => (s.value = list.sort));
  $$("[data-day]").forEach((s) => (s.value = list.day));
  const max = today();
  const min = shiftDay(max, -6); // stories are kept 7 days
  $$("[data-date]").forEach((i) => {
    i.hidden = list.day !== "pick";
    i.max = max;
    i.min = min;
    if (list.date) i.value = list.date;
  });
  $$("[data-range]").forEach((r) => (r.hidden = list.day !== "range"));
  for (const [sel, key] of [["[data-from]", "from"], ["[data-to]", "to"]]) {
    $$(sel).forEach((i) => {
      i.max = max;
      i.min = min;
      if (list[key]) i.value = list[key];
    });
  }
}
$$("[data-sort]").forEach((s) =>
  s.addEventListener("change", () => {
    list.sort = s.value;
    store.set("sort", list.sort);
    syncControls();
    list.items = arrange(list.loaded.filter(keep));
    list.shown = 30;
    render();
  }),
);
$$("[data-day]").forEach((s) =>
  s.addEventListener("change", () => {
    list.day = s.value;
    if (list.day === "pick" && !list.date) list.date = today();
    if (list.day === "range" && !list.from) {
      list.from = shiftDay(today(), -2);
      list.to = today();
    }
    syncControls();
    loadAndRender();
  }),
);
$$("[data-date]").forEach((i) =>
  i.addEventListener("change", () => {
    list.date = i.value;
    syncControls();
    loadAndRender();
  }),
);
// a range of days: From … To (swapped when typed the wrong way round)
$$("[data-from], [data-to]").forEach((i) =>
  i.addEventListener("change", () => {
    list[i.hasAttribute("data-from") ? "from" : "to"] = i.value;
    if (list.from && list.to && list.from > list.to) [list.from, list.to] = [list.to, list.from];
    syncControls();
    loadAndRender();
  }),
);

// The web address of a list: /cricket/world/, or /all/world/?g=cricket,business for several groups
function pagePath(gs, tab) {
  if (gs.length === 1) return tab === "country" ? `${base}/${gs[0]}/` : `${base}/${gs[0]}/${tab}/`;
  const p = tab === "country" ? `${base}/` : `${base}/all/${tab}/`;
  return gs.length > 1 ? `${p}?g=${gs.map(encodeURIComponent).join(",")}` : p;
}
// tabs switch without loading a new page
function setTab(tab, push = true) {
  list.tab = tab;
  store.set("tab", tab);
  $$(".tab").forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle("is-on", on);
    on ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current");
  });
  if (push) history.pushState({ tab, groups: list.groups, q: list.q }, "", pathFor(tab));
  loadAndRender();
}
$$(".tab").forEach((t) =>
  t.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    if (t.dataset.tab !== list.tab) setTab(t.dataset.tab);
  }),
);
addEventListener("popstate", (e) => {
  if (!e.state?.tab) return;
  if (Array.isArray(e.state.groups)) {
    list.groups = cleanGroups(e.state.groups);
    list.q = e.state.q || "";
    showGroups();
  }
  setTab(e.state.tab, false);
});

// ---------- group buttons: tap to add a group, tap again to remove it; Home = all news ----------
function chipLabel(g) {
  const a = chipEls.find((x) => x.dataset.g === g);
  if (!a) return "";
  const [icon, ...names] = [...a.children];
  return `${icon.outerHTML} ${names.map((n) => n.outerHTML).join("")}`;
}
function showGroups() {
  const on = new Set(list.groups);
  for (const a of chipEls) {
    const pressed = a.dataset.g === "all" ? on.size === 0 : on.has(a.dataset.g);
    a.classList.toggle("is-on", pressed);
    a.setAttribute("aria-pressed", String(pressed));
    a.removeAttribute("aria-current");
  }
  // the heading: "🏏 Cricket + 💼 Business", or "🔍 News about “…”" for a search
  const same = !searching() && list.groups.join() === pageGroups.join();
  const h1 = $(".pagehead h1");
  if (h1) {
    h1.dataset.orig ??= h1.innerHTML;
    h1.innerHTML = searching()
      ? `🔍 <span class="l-hi" lang="hi">${esc(T.hi.searchTitle(list.q))}</span><span class="l-en" lang="en">${esc(T.en.searchTitle(list.q))}</span>`
      : same
        ? h1.dataset.orig
        : list.groups.length
          ? list.groups.map(chipLabel).join(" + ")
          : `<span class="l-hi" lang="hi">${esc(T.hi.all)}</span><span class="l-en" lang="en">${esc(T.en.all)}</span>`;
  }
  const about = $(".pagehead__about");
  if (about) about.hidden = !same;
  $$(".tab").forEach((t) => t.setAttribute("href", pathFor(t.dataset.tab)));
  stockBox();
  searchBox();
  fitGroups();
  showTrends();
}
// the address of a list, or of a search: /?q=cockroach%20janta%20party
const pathFor = (tab) => (searching() ? `${pagePath([], tab)}?q=${encodeURIComponent(list.q)}` : pagePath(list.groups, tab));
if (view?.tab) {
  for (const a of chipEls) {
    a.setAttribute("role", "button");
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      const g = a.dataset.g;
      if (searching()) {
        // a group button during a search: leave the search and show that group
        list.q = "";
        list.groupsBefore = null;
        list.groups = [];
      }
      list.groups = g === "all" ? [] : list.groups.includes(g) ? list.groups.filter((x) => x !== g) : [...list.groups, g];
      store.set("groups", list.groups);
      showGroups();
      history.replaceState({ tab: list.tab, groups: list.groups }, "", pagePath(list.groups, list.tab));
      closePop();
      loadAndRender();
    });
  }
}

// One line of buttons; "More" shows all of them, "Less" one line again. Picked buttons always show.
// Used for the group buttons and for the "Trending" topics. `fixed`: things on the line that always stay.
function fitRow(row, chips, btn, open, fixed = []) {
  if (!row || !btn || !chips.length) return;
  chips.forEach((a) => (a.hidden = false));
  btn.hidden = false;
  btn.setAttribute("aria-expanded", String(open));
  row.classList.toggle("is-open", open);
  if (open) return;
  const cs = getComputedStyle(row);
  const gap = parseFloat(cs.columnGap) || 6;
  const room0 = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - fixed.reduce((s, f) => s + (f?.offsetWidth || 0) + gap, 0);
  const w = new Map(chips.map((a) => [a, a.offsetWidth]));
  if (chips.reduce((s, a) => s + w.get(a) + gap, -gap) <= room0) {
    btn.hidden = true; // all of them fit on one line
    return;
  }
  let room = room0 - btn.offsetWidth - gap;
  const show = new Set(chips.filter((a) => a.classList.contains("is-on")));
  for (const a of show) room -= w.get(a) + gap;
  for (const a of chips) {
    if (show.has(a)) continue;
    if (w.get(a) + gap > room) break;
    room -= w.get(a) + gap;
    show.add(a);
  }
  chips.forEach((a) => (a.hidden = !show.has(a)));
}
const gnav = $(".gnav__in");
const moreGroupsBtn = $("[data-more-groups]");
let groupsOpen = false;
const fitGroups = () => fitRow(gnav, chipEls, moreGroupsBtn, groupsOpen);
moreGroupsBtn?.addEventListener("click", () => {
  groupsOpen = !groupsOpen;
  fitGroups();
});

// "🔥 Trending": what India searches on Google right now (from the build); a tap searches our news for it
const trendRow = $(".trend__in");
const trendChips = $$("[data-trend]");
const moreTrendsBtn = $("[data-more-trends]");
let trendsOpen = false;
function showTrends() {
  if (!trendChips.length) return;
  const q = list.q ? foldText(list.q) : "";
  for (const a of trendChips) {
    const on = !!q && foldText(a.dataset.trend) === q;
    a.classList.toggle("is-on", on);
    on ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current");
  }
  fitRow(trendRow, trendChips, moreTrendsBtn, trendsOpen, [$(".trend__label", trendRow)]);
}
for (const a of trendChips) {
  a.addEventListener("click", (e) => {
    if (!view?.tab || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    runSearch(a.dataset.trend);
  });
}
moreTrendsBtn?.addEventListener("click", () => {
  trendsOpen = !trendsOpen;
  showTrends();
});

let fitFrame = 0;
addEventListener("resize", () => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    fitGroups();
    showTrends();
  });
});
D.fonts?.ready.then(() => {
  fitGroups();
  showTrends();
});

// ---------- the Stocks box (when Stocks is the only group picked) ----------
function stockBox() {
  const show = !!view?.tab && list.groups.length === 1 && list.groups[0] === "stock-market";
  let box = $("[data-stocks]");
  if (!show) {
    if (box) box.hidden = true;
    return;
  }
  if (!box) {
    box = D.createElement("div");
    box.className = "stk";
    box.dataset.stocks = "";
    box.innerHTML = `<div class="stk__f"><span aria-hidden="true">🔍</span><input type="search" class="stk__in" data-stk-in autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" role="combobox" aria-expanded="false" aria-controls="stk-sug" aria-autocomplete="list"></div><ul class="stk__sug" id="stk-sug" role="listbox" data-stk-sug hidden></ul><div class="stk__list" data-stk-list></div>`;
    ($(".tabs") || $("[data-lists]"))?.before(box);
    wireStockBox(box);
  }
  box.hidden = false;
  drawWatch();
}
async function drawWatch() {
  const box = $("[data-stocks]");
  if (!box || box.hidden) return;
  const L = T[lang];
  const input = $("[data-stk-in]", box);
  input.placeholder = L.stockPh;
  input.setAttribute("aria-label", L.stockPh);
  const entries = watch.length ? await watchEntries() : [];
  const name = (w) => (lang === "hi" ? w.hi || w.en : w.en || w.hi);
  $("[data-stk-list]", box).innerHTML = entries.length
    ? `<span class="stk__only">${esc(L.stockOnly)}</span>${entries
        .map((w, i) => `<span class="stk__pill">${esc(name(w))}<button type="button" data-stk-x="${i}" aria-label="${esc(`${L.stockRemove}: ${name(w)}`)}">✕</button></span>`)
        .join("")}${entries.length > 1 ? `<button type="button" class="stk__clear" data-stk-clear>${esc(L.stockClear)}</button>` : ""}`
    : "";
}
function setWatch(next) {
  watch = next;
  store.set("stocks", watch);
  drawWatch();
  loadAndRender();
}
async function suggest(q) {
  const box = $("[data-stocks]");
  const ul = $("[data-stk-sug]", box);
  const input = $("[data-stk-in]", box);
  q = q.trim();
  if (!q) {
    ul.hidden = true;
    input.setAttribute("aria-expanded", "false");
    return;
  }
  const lq = q.toLowerCase();
  const have = new Set(watch.map((w) => w.s).filter(Boolean));
  const score = (s) => {
    const names = [s.en, s.hi, s.s, ...s.k].map((x) => String(x).toLowerCase());
    return names.some((x) => x.startsWith(lq)) ? 2 : names.some((x) => x.includes(lq)) ? 1 : 0;
  };
  const hits = (await stocksData())
    .filter((s) => !have.has(s.s))
    .map((s) => [s, score(s)])
    .filter(([, n]) => n)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([s]) => s);
  if (input.value.trim() !== q) return; // the reader kept typing
  const L = T[lang];
  ul.innerHTML =
    hits.map((s) => `<li role="option"><button type="button" data-stk-add="${esc(s.s)}">${esc(lang === "hi" ? s.hi : s.en)}<small>${esc(lang === "hi" ? s.en : s.hi)}</small></button></li>`).join("") +
    `<li role="option"><button type="button" data-stk-free>“${esc(q)}” · ${esc(L.stockAdd)}</button></li>`;
  ul.hidden = false;
  input.setAttribute("aria-expanded", "true");
}
function wireStockBox(box) {
  const input = $("[data-stk-in]", box);
  const ul = $("[data-stk-sug]", box);
  const close = () => {
    ul.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };
  const add = (w) => {
    if (!watch.some((x) => (w.s ? x.s === w.s : x.t?.toLowerCase() === w.t.toLowerCase()))) setWatch([...watch, w]);
    input.value = "";
    close();
  };
  input.addEventListener("input", () => suggest(input.value));
  input.addEventListener("focus", () => {
    stocksData();
    if (input.value) suggest(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return close();
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!ul.hidden) $("button", ul)?.click();
  });
  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.stkAdd) add({ s: b.dataset.stkAdd });
    else if (b.hasAttribute("data-stk-free")) input.value.trim() && add({ t: input.value.trim().slice(0, 40) });
    else if (b.dataset.stkX !== undefined) setWatch(watch.filter((_, i) => i !== Number(b.dataset.stkX)));
    else if (b.hasAttribute("data-stk-clear")) setWatch([]);
  });
  D.addEventListener("click", (e) => !box.contains(e.target) && close());
}

// ---------- the search box (always on Home; on other pages after 🔍 in the top bar) ----------
function searchBox(show = false) {
  if (!view?.tab) return null;
  let box = $("[data-search]");
  if (!box) {
    box = D.createElement("form");
    box.className = "srch";
    box.dataset.search = "";
    box.setAttribute("role", "search");
    box.innerHTML = `<span class="srch__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="17" height="17"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></span><input type="search" name="q" class="srch__in" data-search-in autocomplete="off" enterkeyhint="search" maxlength="80"><button type="submit" class="srch__go" data-search-go></button>`;
    const head = $(".pagehead");
    if (head) head.after(box);
    else ($(".tabs") || $("[data-lists]"))?.before(box);
    box.addEventListener("submit", (e) => {
      e.preventDefault();
      runSearch($("[data-search-in]", box).value);
    });
    // the ✕ inside the box (or an emptied box) ends the search
    $("[data-search-in]", box).addEventListener("search", (e) => !e.target.value && searching() && runSearch(""));
  }
  const L = T[lang];
  const input = $("[data-search-in]", box);
  input.placeholder = L.searchPh;
  input.setAttribute("aria-label", L.search);
  $("[data-search-go]", box).textContent = L.search;
  if (D.activeElement !== input) input.value = list.q;
  box.hidden = !(show || searching() || view.group === "all" || !box.hidden);
  return box;
}
function runSearch(q) {
  q = String(q || "").trim().slice(0, 80);
  if (q === list.q) return;
  if (q && !searching()) {
    list.groupsBefore = list.groups; // back to these when the search ends
    list.groups = [];
  }
  if (!q) {
    list.groups = cleanGroups(list.groupsBefore || []);
    list.groupsBefore = null;
  }
  list.q = q;
  showGroups();
  history.replaceState({ tab: list.tab, groups: list.groups, q }, "", pathFor(list.tab));
  closePop();
  loadAndRender();
}
$("[data-search-open]")?.addEventListener("click", (e) => {
  if (!view?.tab || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // other pages: the link opens Home's search
  e.preventDefault();
  const box = searchBox(true);
  box.hidden = false;
  scrollTo({ top: 0, behavior: "smooth" });
  $("[data-search-in]", box).focus();
});

// ---------- a search on other news websites (below our own results) ----------
// 1. the topic's own news links when it is in "Trending" (Google Trends), 2. headlines from the GDELT Project
// (a free, open news database; slow, and only for English words), 3. a link to the same search on Google News.
const ox = { key: "", state: "", items: [], trend: null, ctrl: null, last: 0, shown: 10, cache: new Map() };
const trendsData = () => getJSON("/data/trends.json");
function oxBox() {
  let el = $("[data-ox]");
  if (!el) {
    const after = $("[data-more]") || $("[data-lists]");
    if (!after) return null;
    el = D.createElement("section");
    el.className = "ox";
    el.dataset.ox = "";
    el.hidden = true;
    after.after(el);
  }
  return el;
}
// GDELT's dates: all days = the last 3 months; Today, Yesterday, a day or a range = those days (India time)
function gdeltSpan() {
  const at = (day, add = 0) => new Date(Date.parse(`${day}T00:00:00+05:30`) + add * 86400e3).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const range = (from, to) => `&startdatetime=${at(from)}&enddatetime=${at(to, 1)}`;
  if (list.day === "today") return range(today(), today());
  if (list.day === "yesterday") return range(shiftDay(today(), -1), shiftDay(today(), -1));
  if (list.day === "pick" && list.date) return range(list.date, list.date);
  if (list.day === "range" && (list.from || list.to)) return range(list.from || shiftDay(today(), -6), list.to || today());
  return "&timespan=3m";
}
async function outside(again = false) {
  const box = oxBox();
  if (!box) return;
  if (!searching()) {
    box.hidden = true;
    ox.ctrl?.abort();
    ox.key = "";
    return;
  }
  const query = parseQuery(list.q);
  const gq = gdeltQuery(query, lang);
  const span = gdeltSpan();
  const key = `${lang}|${list.q}|${span}`;
  if (key === ox.key && !again) return drawOx(); // the same search (another tab): nothing new to fetch
  ox.key = key;
  ox.shown = 10;
  ox.ctrl?.abort();
  ox.items = [];
  ox.state = gq ? "wait" : "hindi";
  if (gq && ox.cache.has(key)) {
    ox.items = ox.cache.get(key);
    ox.state = "done";
  }
  const tq = foldText(list.q);
  ox.trend = ((await trendsData()) || []).find((t) => foldText(t.q) === tq) || null;
  if (key !== ox.key) return;
  drawOx();
  if (ox.state !== "wait") return;
  const ctrl = (ox.ctrl = new AbortController()); // aborted when the reader searches something else
  for (let tries = 0; tries < 2; tries++) {
    // GDELT asks for at most one search every 5 seconds from one computer. Its "too many" answer can't be
    // read by the browser (no CORS header), so any failure is tried once more, 5 seconds later.
    const wait = ox.last + 5500 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (ctrl.signal.aborted) return;
    ox.last = Date.now();
    const one = new AbortController();
    const stop = () => one.abort();
    ctrl.signal.addEventListener("abort", stop);
    const timer = setTimeout(stop, 25000);
    try {
      const r = await fetch(gdeltUrl(gq, span), { signal: one.signal });
      if (!r.ok) continue;
      const items = gdeltItems(JSON.parse(await r.text()), query);
      if (ctrl.signal.aborted) return;
      ox.cache.set(key, items);
      ox.items = items;
      ox.state = "done";
      return drawOx();
    } catch {
      if (ctrl.signal.aborted) return;
    } finally {
      clearTimeout(timer);
      ctrl.signal.removeEventListener("abort", stop);
    }
  }
  if (ctrl.signal.aborted) return;
  ox.state = "fail";
  drawOx();
}
function drawOx() {
  const box = oxBox();
  if (!box) return;
  box.hidden = !searching();
  if (box.hidden) return;
  const L = T[lang];
  const trend = ox.trend?.news || [];
  const seen = new Set(trend.map((n) => n.u));
  const items = ox.items.filter((n) => !seen.has(n.u));
  const li = (n, tag = "") =>
    `<li class="ox__it"><a href="${esc(n.u)}" target="_blank" rel="noopener nofollow">${esc(n.h)}</a><span class="ox__meta">${tag}${esc(n.src)}${n.t ? ` · ${esc(ago(n.t, lang))}` : ""}</span></li>`;
  const rows = [...trend.map((n) => li(n, `<span class="ox__tag">🔥 Google Trends</span> · `)), ...items.slice(0, ox.shown).map((n) => li(n))];
  const msg = {
    wait: `<p class="ox__msg ox__msg--wait">${esc(L.oxWait)}</p>`,
    fail: `<p class="ox__msg">${esc(L.oxFail)} <button type="button" class="btn btn--small" data-ox-retry>${esc(L.retry)}</button></p>`,
    hindi: `<p class="ox__msg">${esc(L.oxHindi)}</p>`,
    done: rows.length ? "" : `<p class="ox__msg">${esc(L.oxNone)}</p>`,
  }[ox.state] || "";
  const left = items.length - ox.shown;
  box.lang = lang;
  box.innerHTML = `<h2 class="ox__h">🌐 ${esc(L.ox)}</h2>
${rows.length ? `<ol class="ox__list">${rows.join("")}</ol>` : ""}
${left > 0 ? `<button type="button" class="btn btn--small ox__more" data-ox-more>${esc(L.oxMore(Math.min(20, left)))}</button>` : ""}
${msg}
${items.length ? `<p class="ox__credit">${L.oxCredit('<a href="https://www.gdeltproject.org/" target="_blank" rel="noopener">GDELT Project</a>')}</p>` : ""}
<p class="ox__gn"><a class="btn" href="${esc(googleNewsUrl(list.q, lang))}" target="_blank" rel="noopener">${esc(L.googleNews(list.q))}</a></p>`;
}
D.addEventListener("click", (e) => {
  if (e.target.closest("[data-ox-retry]")) outside(true);
  else if (e.target.closest("[data-ox-more]")) {
    ox.shown += 20;
    drawOx();
  }
});

// ---------- one story: data for the answers ----------
async function findItem(id, el) {
  let it = list.loaded.find((x) => x.i === id);
  // a search result written by the AI carries no answers: they are in the story's own lists
  if (it && (it.q || !it.k)) return it;
  const found = it;
  const art = el?.closest("[data-id]");
  const dt = art && $("time", art)?.getAttribute("datetime");
  const day = found ? istDay(found.t * 1000) : dt ? istDay(Date.parse(dt)) : today();
  const [st, dist] = found?.p || [];
  const own = found ? ["in/all", "world/all", st && `s-${st}/all`, st && dist && `d/${st}/${dist}`, ...(found.g || []).flatMap((g) => [`in/${g}`, `world/${g}`, st && `s-${st}/${g}`])] : [];
  const idx = await index();
  const keys = [...new Set([...own, ...keysFor(list.tab), ...(view?.keys || []), "in/all", "world/all"].filter((k) => k && k !== "search"))];
  for (const k of keys) {
    for (const d of [day, shiftDay(day, -1), shiftDay(day, 1)]) {
      if (idx && !idx.days[k]?.includes(d)) continue;
      const f = await getJSON(`/data/${lang}/${k}/${d}.json`);
      it = f?.find((x) => x.i === id);
      if (it) return it;
    }
  }
  return found || null;
}

// ---------- first click: answers open in the list; second click: the full story page ----------
let suppressClick = null;
D.addEventListener("click", async (e) => {
  const a = e.target.closest(".it__link");
  if (!a) return;
  if (suppressClick === a) {
    e.preventDefault();
    suppressClick = null;
    return;
  }
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const art = a.closest(".it");
  if (art.classList.contains("is-open")) {
    const it = await findItem(art.dataset.id, a);
    learn(it);
    return; // let the browser open the story page (or the original website)
  }
  e.preventDefault();
  closePop();
  art.classList.add("is-open");
  const box = D.createElement("div");
  box.className = "it__qa";
  box.innerHTML = `<p class="qa__wait">${esc(T[lang].loading)}</p>`;
  art.append(box);
  const it = await findItem(art.dataset.id, a);
  learn(it);
  const L = T[lang];
  box.innerHTML = it
    ? `${qaHTML(it, lang)}<p class="it__links">${it.q ? `<a href="${base}/story/${it.i}/">${esc(L.sources)} →</a> · ` : ""}<a href="${esc(it.u)}" target="_blank" rel="noopener nofollow">${esc(L.readAt)} ${esc(it.src)} ↗</a></p><p class="it__hint">${esc(fine ? L.clickAgain : L.tapAgain)}</p>`
    : `<p class="qa__coming">${esc(L.coming)}</p>`;
});

// ---------- pop-up box: hover 1 second (computer) or hold 1 second (phone) ----------
const pop = $("#pop");
let popFor = null;
let hoverTimer = 0;
let leaveTimer = 0;
let backdrop = null;

function closePop() {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  pop.classList.remove("pop--sheet");
  popFor = null;
  backdrop?.remove();
  backdrop = null;
}

async function openPop(art, sheet) {
  const id = art.dataset.id;
  const it = await findItem(id, art);
  if (!it || (fine && !sheet && (art.classList.contains("is-open") || !art.matches(":hover")))) return;
  learn(it);
  const L = T[lang];
  const img = it.img ? `<img class="pop__img" src="${esc(thumb(it.img, 640, 360, PROXY.replace("&a=attention", "")))}" alt="" width="640" height="360">` : "";
  pop.innerHTML = `<button type="button" class="pop__x" data-close aria-label="${esc(L.close)}">✕</button>
${img}<h3 class="pop__h">${esc(it.h)}</h3>
<p class="pop__meta">${esc(it.src)} · ${esc(ago(it.t, lang))}${it.pn ? ` · ${esc(it.pn)}` : ""}</p>
${qaHTML(it, lang)}
<p class="it__links">${it.q ? `<a href="${base}/story/${it.i}/">${esc(L.sources)}${it.n ? ` (${it.n + 1})` : ""} →</a> · ` : ""}<a href="${esc(it.u)}" target="_blank" rel="noopener nofollow">${esc(L.readAt)} ${esc(it.src)} ↗</a></p>`;
  pop.lang = lang;
  popFor = art;
  pop.hidden = false;
  if (sheet) {
    pop.classList.add("pop--sheet");
    pop.style.left = pop.style.top = "";
    backdrop = D.createElement("div");
    backdrop.className = "pop-bg";
    backdrop.addEventListener("click", closePop);
    D.body.append(backdrop);
  } else {
    const r = art.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.left + 40), innerWidth - w - 8);
    const below = r.bottom + 6;
    const header = $(".hd")?.offsetHeight || 0;
    const top = below + h < innerHeight - 8 ? below : r.top - h - 6 > header + 8 ? r.top - h - 6 : Math.max(header + 8, (innerHeight - h) / 2);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
}

if (pop) {
  pop.addEventListener("click", (e) => e.target.closest("[data-close]") && closePop());
  addEventListener("keydown", (e) => e.key === "Escape" && closePop());
  if (fine) {
    D.addEventListener("mouseover", (e) => {
      const art = e.target.closest(".it");
      if (art && art !== popFor && !art.classList.contains("is-open")) {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => openPop(art, false), 1000);
      }
      if (art || e.target.closest("#pop")) clearTimeout(leaveTimer);
    });
    D.addEventListener("mouseout", (e) => {
      const from = e.target.closest(".it, #pop");
      const to = e.relatedTarget?.closest?.(".it, #pop");
      if (from && from !== to) {
        if (from.classList.contains("it") && to !== pop) clearTimeout(hoverTimer);
        if (!pop.hidden && to !== pop && to !== popFor) leaveTimer = setTimeout(closePop, 250);
      }
    });
    D.addEventListener("mousedown", (e) => e.target.closest(".it__link") && clearTimeout(hoverTimer));
    addEventListener("scroll", () => !pop.hidden && !pop.classList.contains("pop--sheet") && closePop(), { passive: true });
  }
  // phones: press and hold a headline for 1 second
  let pressTimer = 0;
  let start = null;
  D.addEventListener(
    "touchstart",
    (e) => {
      const a = e.target.closest(".it__link");
      if (!a) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, a };
      pressTimer = setTimeout(() => {
        suppressClick = a;
        navigator.vibrate?.(15);
        openPop(a.closest(".it"), true);
      }, 1000);
    },
    { passive: true },
  );
  const cancel = () => clearTimeout(pressTimer);
  D.addEventListener("touchmove", (e) => start && (Math.abs(e.touches[0].clientX - start.x) > 10 || Math.abs(e.touches[0].clientY - start.y) > 10) && cancel(), { passive: true });
  D.addEventListener("touchend", cancel, { passive: true });
  D.addEventListener("touchcancel", cancel, { passive: true });
  D.addEventListener("contextmenu", (e) => e.target.closest(".it__link") && e.preventDefault());
}

// ---------- videos, copy link, ads ----------
D.addEventListener("click", (e) => {
  const v = e.target.closest("[data-yt]");
  if (v) {
    const box = $(".vid__img", v);
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.dataset.yt)}?autoplay=1&rel=0" title="YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
    v.removeAttribute("data-yt");
  }
  const c = e.target.closest("[data-copy]");
  if (c) {
    navigator.clipboard?.writeText(c.dataset.copy).then(() => {
      const old = c.textContent;
      c.textContent = T[lang].copied;
      setTimeout(() => (c.textContent = old), 1500);
    });
  }
});

const previewAds = /[?&]ads=preview\b/.test(location.search);
function pushAds() {
  if (previewAds) $$(".ad--empty").forEach((a) => (a.hidden = false));
  $$("ins.adsbygoogle:not([data-pushed])").forEach((ins) => {
    ins.dataset.pushed = "1";
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {}
  });
}
pushAds();
// remember AdSense ids for ad spots added later (in lists drawn in the browser)
const firstIns = $("ins.adsbygoogle");
if (firstIns) {
  B.dataset.adClient = firstIns.dataset.adClient;
  const feed = $('.ad[data-ad="infeed"] ins.adsbygoogle');
  if (feed) B.dataset.adInfeed = feed.dataset.adSlot;
}

// photos that fail through the small-photo service: try the original once, then hide
D.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.dataset.full) return;
    if (img.src !== img.dataset.full) img.src = img.dataset.full;
    else img.style.visibility = "hidden";
  },
  true,
);

// ---------- start ----------
syncControls();
if (view?.tab) {
  showGroups();
  const samePage = list.groups.join() === pageGroups.join();
  if (!samePage || PLACE_TABS.has(list.tab) || list.sort !== "newest" || watching() || searching()) loadAndRender();
  else
    (window.requestIdleCallback || setTimeout)(async () => {
      // the page already shows the newest stories; get their answers ready so the first click is instant
      const my = gen;
      await loadDays();
      if (my !== gen) return;
      list.items = order(list.loaded.filter(keep));
      list.ready = true;
      const more_ = $("[data-more]");
      if (more_) more_.hidden = !(list.items.length > 30 || list.next < list.days.length);
      seeMore();
    });
  history.replaceState({ tab: list.tab, groups: list.groups, q: list.q }, "");
  // 🔍 on another page opens Home with the cursor in the search box (/?s=1)
  if (new URLSearchParams(location.search).has("s")) {
    const box = searchBox(true);
    $("[data-search-in]", box)?.focus();
    history.replaceState(history.state, "", pathFor(list.tab));
  }
} else fitGroups();
if (!loc) guessFromInternet().then(showPlace);
else showPlace();
