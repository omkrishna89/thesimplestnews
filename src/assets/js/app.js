// The Simplest News — everything that happens in the browser. Small and without frameworks, so it stays fast.
import { T, PLACE_TABS, ago, esc, istDay, itemHTML, qaHTML, slug, thumb } from "./ui.js";

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
  showPlace();
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
const onChip = $(".gnav .chip.is-on");
if (onChip) onChip.scrollIntoView({ block: "nearest", inline: "center" });
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
const list = { ready: false, dynamic: false, tab: view?.tab, group: view?.group, sort: store.get("sort", "newest"), day: "all", date: "", loaded: [], days: [], next: 0, shown: 30, items: [] };

function keyFor(tab, group) {
  if (tab === "world") return `world/${group}`;
  if (tab === "country") return `in/${group}`;
  if (!loc || loc.c !== "in") return null;
  if (tab === "state") return `s-${loc.s}/${group}`;
  return loc.d ? `d/${loc.s}/${loc.d}` : null;
}

function keep(it) {
  const { tab, group } = list;
  if (["district", "tehsil", "local"].includes(tab)) {
    if (group !== "all" && !(group === "local" ? ["local", "tehsil", "district"].includes(it.sc) : it.g?.includes(group))) return false;
    if (tab === "tehsil") return !!loc.t && (it.p[2] === loc.t || it.p[3] === loc.t);
    if (tab === "local") return !!it.p[3] && (it.p[3] === loc.l || it.p[3] === loc.t || it.p[2] === loc.l);
  }
  return true;
}

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

const today = () => istDay(Date.now());
const shiftDay = (day, n) => istDay(Date.parse(`${day}T12:00:00+05:30`) + n * 86400e3);

async function loadDays() {
  const idx = await index();
  const key = keyFor(list.tab, list.group);
  list.key = key;
  list.loaded = [];
  list.next = 0;
  list.days = [];
  if (!key || !idx) return;
  let days = idx.days[key] || [];
  if (list.day === "today") days = days.filter((d) => d === today());
  if (list.day === "yesterday") days = days.filter((d) => d === shiftDay(today(), -1));
  if (list.day === "pick") days = days.filter((d) => d === list.date);
  list.days = days;
  // one day first (small and fast); a second one only when the first is nearly empty
  await loadMore(1);
  if (list.loaded.filter(keep).length < 40 && list.next < list.days.length) await loadMore(1);
}

async function loadMore(n = 1) {
  const take = list.days.slice(list.next, list.next + n);
  list.next += take.length;
  const files = await Promise.all(take.map((d) => getJSON(`/data/${lang}/${list.key}/${d}.json`)));
  for (const f of files) if (f) list.loaded.push(...f);
}

function emptyText() {
  if (!loc && PLACE_TABS.has(list.tab)) return T[lang].finding;
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
  const shown = list.items.slice(0, list.shown);
  const ctx = rctx();
  const html = (a) => a.map((it) => itemHTML(it, lang, ctx)).join("");
  chunks[0].innerHTML = shown.length ? html(shown.slice(0, 6)) : `<p class="empty">${esc(emptyText())}</p>`;
  chunks[1].innerHTML = html(shown.slice(6, 18));
  chunks[2].innerHTML = html(shown.slice(18));
  $$(".ad", el).forEach((a, i) => (a.style.display = shown.length > (i === 0 ? 6 : 18) ? "" : "none"));
  const more = $("[data-more]");
  if (more) more.hidden = !(list.items.length > list.shown || list.next < list.days.length);
}

async function loadAndRender() {
  if (!view?.tab) return;
  if (PLACE_TABS.has(list.tab) && !loc) {
    render();
    await guessFromInternet();
    showPlace();
  }
  await loadDays();
  list.items = order(list.loaded.filter(keep));
  list.shown = 30;
  list.ready = true;
  render();
}

async function more() {
  if (list.items.length <= list.shown && list.next < list.days.length) {
    await loadMore(1);
    // newly loaded (older) stories go below the ones already shown
    const known = new Set(list.items.map((i) => i.i));
    list.items.push(...order(list.loaded.filter((it) => !known.has(it.i) && keep(it))));
  }
  list.shown += 30;
  render();
}
let busy = false;
async function onMore() {
  if (busy) return;
  busy = true;
  if (!list.dynamic) {
    // the page's own list becomes a list drawn from the data files, then grows
    list.items = order(list.loaded.filter(keep));
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
  $$("[data-date]").forEach((i) => {
    i.hidden = list.day !== "pick";
    i.max = max;
    i.min = shiftDay(max, -6);
    if (list.date) i.value = list.date;
  });
}
$$("[data-sort]").forEach((s) =>
  s.addEventListener("change", () => {
    list.sort = s.value;
    store.set("sort", list.sort);
    syncControls();
    list.items = order(list.loaded.filter(keep));
    list.shown = 30;
    render();
  }),
);
$$("[data-day]").forEach((s) =>
  s.addEventListener("change", () => {
    list.day = s.value;
    if (list.day === "pick" && !list.date) list.date = today();
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

// tabs switch without loading a new page
function tabPath(tab) {
  const g = list.group;
  if (g === "all") return tab === "country" ? `${base}/` : `${base}/all/${tab}/`;
  return tab === "country" ? `${base}/${g}/` : `${base}/${g}/${tab}/`;
}
function setTab(tab, push = true) {
  list.tab = tab;
  store.set("tab", tab);
  $$(".tab").forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle("is-on", on);
    on ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current");
  });
  if (push) history.pushState({ tab }, "", tabPath(tab));
  loadAndRender();
}
$$(".tab").forEach((t) =>
  t.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    if (t.dataset.tab !== list.tab) setTab(t.dataset.tab);
  }),
);
addEventListener("popstate", (e) => e.state?.tab && setTab(e.state.tab, false));

// ---------- one story: data for the answers ----------
async function findItem(id, el) {
  let it = list.loaded.find((x) => x.i === id);
  if (it) return it;
  const art = el?.closest("[data-id]");
  const dt = art && $("time", art)?.getAttribute("datetime");
  const day = dt ? istDay(Date.parse(dt)) : today();
  const keys = [...new Set([keyFor(list.tab, list.group), ...(view?.keys || []), "in/all", "world/all"].filter(Boolean))];
  for (const k of keys) {
    for (const d of [day, shiftDay(day, -1), shiftDay(day, 1)]) {
      const f = await getJSON(`/data/${lang}/${k}/${d}.json`);
      it = f?.find((x) => x.i === id);
      if (it) return it;
    }
  }
  return null;
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
  if (PLACE_TABS.has(list.tab)) loadAndRender();
  else if (list.sort !== "newest") loadAndRender();
  else
    (window.requestIdleCallback || setTimeout)(async () => {
      // the page already shows the newest stories; get their answers ready so the first click is instant
      await loadDays();
      list.items = order(list.loaded.filter(keep));
      list.ready = true;
      const more_ = $("[data-more]");
      if (more_) more_.hidden = !(list.items.length > 30 || list.next < list.days.length);
    });
  history.replaceState({ tab: list.tab }, "");
}
if (!loc) guessFromInternet().then(showPlace);
else showPlace();
