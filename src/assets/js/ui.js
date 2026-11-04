// Shared by the website build (Node) and the browser: words in both languages and the HTML of one story.
// Keep it free of browser-only code so the build can use it too.

export const LANGS = ["hi", "en"];

export const T = {
  hi: {
    q: ["क्या", "कौन", "किसे", "किसका", "कहां", "कब", "क्यों", "कौन-सा", "कैसे"],
    tabs: { local: "आसपास", tehsil: "तहसील", district: "ज़िला", state: "राज्य", country: "देश", world: "दुनिया" },
    sort: { newest: "सबसे नई", big: "बड़ी खबरें", important: "सबसे ज़रूरी", relevant: "आपकी पसंद" },
    days: { all: "सारे दिन", today: "आज", yesterday: "कल", pick: "दिन चुनें…", range: "तारीखें चुनें…" },
    sortLabel: "क्रम",
    dayLabel: "दिन",
    from: "से",
    to: "तक",
    moreGroups: "और ▾",
    lessGroups: "कम ▴",
    seeMore: (n, tab) => `${tab} में ${n} खबरें देखें →`,
    stockPh: "शेयर का नाम लिखें, जैसे रिलायंस, टीसीएस",
    stockAdd: "जोड़ें",
    stockClear: "सब हटाएं",
    stockRemove: "हटाएं",
    stockOnly: "सिर्फ़ इन शेयरों की खबरें:",
    noStockNews: "इन शेयरों की कोई खबर अभी नहीं मिली। और नाम जोड़ें या बाद में देखें।",
    noStockNewsDays: (names, n) => `${n > 1 ? `पिछले ${n} दिनों में` : "आज"} ${names} की कोई खबर नहीं मिली। जैसे ही कोई खबर आएगी, यहां दिखेगी।`,
    search: "खोजें",
    searchPh: "खबर खोजें, जैसे: कॉकरोच जनता पार्टी",
    searchTitle: (q) => `“${q}” की खबरें`,
    noResults: (q, n) => `${n > 1 ? `पिछले ${n} दिनों में` : "आज"} “${q}” की कोई खबर नहीं मिली। दूसरे शब्द आज़माएं।`,
    coming: "छोटा सार जल्द आएगा",
    readAt: "पूरी खबर पढ़ें:",
    sources: "सभी स्रोत",
    more: "और खबरें",
    share: "शेयर करें",
    copy: "लिंक कॉपी करें",
    copied: "कॉपी हो गया",
    light: "लाइट",
    dark: "डार्क",
    home: "होम",
    all: "सारी खबरें",
    big: "बड़ी खबर",
    approx: "अनुमानित",
    useGps: "मेरी सही जगह (GPS)",
    setPlace: "जगह चुनें",
    finding: "आपकी जगह ढूंढ रहे हैं…",
    noPlace: "आपकी जगह पता नहीं चली।",
    gpsDenied: "जगह की इजाज़त नहीं मिली। फ़ोन की सेटिंग में Location चालू करें, या अनुमानित जगह से खबरें देखें।",
    yourArea: "आपकी जगह",
    change: "बदलें",
    empty: "अभी यहां कोई खबर नहीं है।",
    emptyLocal: "आपके गांव/कस्बे की खबर अभी नहीं मिली। तहसील या ज़िले की खबरें देखें।",
    tapAgain: "पूरी खबर और सभी स्रोत के लिए शीर्षक पर फिर टैप करें",
    clickAgain: "पूरी खबर और सभी स्रोत के लिए शीर्षक पर फिर क्लिक करें",
    related: "ऐसी और खबरें",
    trailers: "नए ट्रेलर और गाने",
    trailer: "ट्रेलर",
    song: "गाना",
    updated: "अपडेट",
    ago: { now: "अभी", m: "मिनट पहले", h: "घंटे पहले", d: "दिन पहले" },
    alsoN: (n) => `+${n} और स्रोत`,
    close: "बंद करें",
    loading: "लोड हो रहा है…",
    groups: "खबरों के समूह",
    placeNews: (p) => `${p} की खबरें`,
    menu: "मेन्यू",
    photo: "फ़ोटो",
    adLabel: "विज्ञापन",
  },
  en: {
    q: ["What", "Who", "Whom", "Whose", "Where", "When", "Why", "Which", "How"],
    tabs: { local: "Local", tehsil: "Tehsil", district: "District", state: "State", country: "Country", world: "World" },
    sort: { newest: "Newest", big: "Big stories", important: "Most important", relevant: "Relevant" },
    days: { all: "All days", today: "Today", yesterday: "Yesterday", pick: "Pick a day…", range: "Pick dates…" },
    sortLabel: "Sort",
    dayLabel: "Day",
    from: "From",
    to: "To",
    moreGroups: "More ▾",
    lessGroups: "Less ▴",
    seeMore: (n, tab) => `See ${n} stories in ${tab} →`,
    stockPh: "Type a stock name, e.g. Reliance, TCS",
    stockAdd: "Add",
    stockClear: "Clear all",
    stockRemove: "Remove",
    stockOnly: "Only news about:",
    noStockNews: "No news about these stocks yet. Add more names or check again later.",
    noStockNewsDays: (names, n) => `No news about ${names} ${n > 1 ? `in the last ${n} days` : "today"}. It will show here as soon as there is some.`,
    search: "Search",
    searchPh: "Search news, e.g. cockroach janta party",
    searchTitle: (q) => `News about “${q}”`,
    noResults: (q, n) => `No news about “${q}” ${n > 1 ? `in the last ${n} days` : "today"}. Try other words.`,
    coming: "Short summary coming soon",
    readAt: "Read the full story:",
    sources: "All sources",
    more: "More news",
    share: "Share",
    copy: "Copy link",
    copied: "Copied",
    light: "Light",
    dark: "Dark",
    home: "Home",
    all: "All news",
    big: "Big story",
    approx: "approximate",
    useGps: "Use my exact place (GPS)",
    setPlace: "Set place",
    finding: "Finding your area…",
    noPlace: "We could not find your area.",
    gpsDenied: "Location permission was not given. Turn on Location in your phone settings, or read news for your approximate area.",
    yourArea: "Your area",
    change: "Change",
    empty: "No news here yet.",
    emptyLocal: "No news from your village/town yet. Try the Tehsil or District tab.",
    tapAgain: "Tap the headline again for the full story and all sources",
    clickAgain: "Click the headline again for the full story and all sources",
    related: "More like this",
    trailers: "New trailers & songs",
    trailer: "Trailer",
    song: "Song",
    updated: "Updated",
    ago: { now: "just now", m: "min ago", h: "h ago", d: "d ago" },
    alsoN: (n) => `+${n} more sources`,
    close: "Close",
    loading: "Loading…",
    groups: "News groups",
    placeNews: (p) => `${p} news`,
    menu: "Menu",
    photo: "Photo",
    adLabel: "Advertisement",
  },
};

// Simple slug from an English or Hindi place name: "Lucknow District" -> "lucknow".
// The build and the browser must use exactly this, so news and the reader's GPS place match.
export function slug(s = "") {
  return String(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(district|distt|dist|tehsil|tahsil|taluka|taluk|subdivision|sub-division|block|division|city|nagar nigam|municipal corporation)\b/g, " ")
    .replace(/[^a-z0-9\u0900-\u097f]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// The file with the news about one company: "M&M" -> "m-m" (build and browser must agree)
export const stockFile = (symbol) => String(symbol).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const TABS = ["local", "tehsil", "district", "state", "country", "world"];
export const PLACE_TABS = new Set(["local", "tehsil", "district", "state"]);

export const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TZ = "Asia/Kolkata";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
export const istDay = (ms) => dayFmt.format(new Date(ms));

export function ago(sec, lang, now = Date.now()) {
  const L = T[lang].ago;
  const m = Math.max(0, Math.round((now - sec * 1000) / 60000));
  if (m < 2) return L.now;
  if (m < 60) return `${m} ${L.m}`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "en" ? `${h}${L.h}` : `${h} ${L.h}`;
  const d = Math.round(h / 24);
  return lang === "en" ? `${d}${L.d}` : `${d} ${L.d}`;
}

export function clock(sec, lang) {
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(sec * 1000));
}

// Small photo through a free resizing service, so phones download a few KB instead of a big photo.
export function thumb(url, w, h, proxy) {
  if (!url) return "";
  if (!proxy) return url;
  return proxy.replace("{url}", encodeURIComponent(url.replace(/^https?:\/\//, ""))).replace("{w}", w).replace("{h}", h);
}

// Answers, as a list of 9 rows. Rows Gemini could not fill are left out to keep it short.
export function qaHTML(item, lang) {
  const L = T[lang];
  if (!item.q) return `<p class="qa__coming">${esc(L.coming)}${item.x ? `<span class="qa__snip">${esc(item.x)}</span>` : ""}</p>`;
  const NOT = lang === "hi" ? "जानकारी नहीं" : "Not mentioned";
  const rows = item.q
    .map((a, i) => (a && a !== NOT ? `<div class="qa__row"><dt>${L.q[i]}?</dt><dd>${esc(a)}</dd></div>` : ""))
    .join("");
  return `<dl class="qa">${rows}</dl>`;
}

// One story in a list. `href` = our story page (or the original website when Gemini hasn't written it yet).
export function itemHTML(item, lang, ctx) {
  const L = T[lang];
  const done = !!(item.q || item.k); // k: written by the AI (search results carry the answers separately)
  const href = done ? `${ctx.base}/story/${item.i}/` : item.u;
  const ext = done ? "" : ` target="_blank" rel="noopener nofollow"`;
  const img = item.img ? `<img class="it__img" src="${esc(thumb(item.img, 144, 144, ctx.proxy))}" data-full="${esc(item.img)}" alt="" loading="lazy" decoding="async" width="72" height="72">` : `<span class="it__img it__img--icon" aria-hidden="true">${ctx.icon(item.g?.[0])}</span>`;
  const big = item.big ? `<span class="badge badge--big">${L.big}</span>` : "";
  const coming = done ? "" : `<span class="badge">${L.coming}</span>`;
  const place = item.pn ? `<span class="it__place">${esc(item.pn)}</span>` : "";
  const also = item.n ? `<span class="it__also">${esc(L.alsoN(item.n))}</span>` : "";
  return `<article class="it" data-id="${item.i}">
<a class="it__link" href="${esc(href)}"${ext} data-id="${item.i}">${img}<span class="it__body"><span class="it__h">${big}${esc(item.h)}</span>
<span class="it__meta">${esc(item.src)} · <time datetime="${new Date(item.t * 1000).toISOString()}">${esc(ago(item.t, lang, ctx.now))}</time>${place ? ` · ${place}` : ""}${also ? ` · ${also}` : ""} ${coming}</span></span></a>
</article>`;
}
