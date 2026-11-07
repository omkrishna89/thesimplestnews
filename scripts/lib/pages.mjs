// HTML of the website's pages (header, footer, group pages, story pages, place pages, help pages).
import { T, TABS, PLACE_TABS, esc, itemHTML, qaHTML, clock, thumb } from "../../src/assets/js/ui.js";

// Text in both languages; the page shows one of them (html[data-lang]).
export const bi = (hi, en, tag = "span", attrs = "") =>
  `<${tag} class="l-hi" lang="hi"${attrs}>${hi}</${tag}><${tag} class="l-en" lang="en"${attrs}>${en}</${tag}>`;
const biT = (key) => bi(esc(T.hi[key]), esc(T.en[key]));

// Google Analytics (visitor statistics), only when config/site.json has a Measurement ID.
// Its script loads 1 second after the page has finished, so reading is never slowed down.
// Only on the site's own address (e.g. thesimplestnews.com), so test copies don't count as visitors.
export const gaSnippet = (id, domain = "") => {
  if (!/^G-[A-Z0-9]{4,20}$/.test(id || "")) return "";
  const host = /^[a-z0-9.-]+$/i.test(domain) ? domain.toLowerCase().replace(/^www\./, "") : "";
  const onSite = host ? `/(^|\\.)${host.replace(/\./g, "\\.")}$/.test(location.hostname)` : "true";
  return `<script>if(${onSite}){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${id}");addEventListener("load",function(){setTimeout(function(){var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id=${id}";document.head.appendChild(s)},1000)})}</script>`;
};

export function makePages(ctx) {
  const { site, groups, base, assets } = ctx;
  const G = Object.fromEntries(groups.map((g) => [g.slug, g]));
  const url = (p) => `${base}${p}`;
  const abs = (p) => `${ctx.siteUrl}${p}`;
  const ads = site.adsense || {};
  const adOn = !!ads.client;

  const ad = (slot, cls = "") => {
    const id = ads.slots?.[slot];
    if (adOn && id) {
      return `<div class="ad ${cls}" data-ad="${slot}"><span class="ad__label">${biT("adLabel")}</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(ads.client)}" data-ad-slot="${esc(id)}" data-ad-format="auto" data-full-width-responsive="true"></ins></div>`;
    }
    // Without an AdSense id nothing is shown. "?ads=preview" shows where the ads will go.
    return `<div class="ad ad--empty ${cls}" data-ad="${slot}" hidden></div>`;
  };

  function head({ title, description, path, image, noindex, jsonld, type = "website" }) {
    const t = esc(title);
    const d = esc(description || "");
    const img = image || abs("/assets/img/og.png");
    return `<!doctype html>
<html lang="hi" data-lang="hi" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${esc(abs(path))}">
${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
<meta name="theme-color" content="#0f1115">
<meta property="og:site_name" content="${esc(site.name.en)}">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(abs(path))}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${url("/assets/img/icon.svg")}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${url("/assets/img/icon-192.png")}">
<link rel="manifest" href="${url("/manifest.webmanifest")}">
<script>(function(){var d=document.documentElement,l,t;try{l=localStorage.getItem("lang");t=localStorage.getItem("theme")}catch(e){}if(!l){l=[].concat(navigator.languages||[],navigator.language||"").some(function(x){return /^hi/i.test(x)})?"hi":"en"}d.setAttribute("data-lang",l);d.lang=l;d.setAttribute("data-theme",t||"dark")})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${assets.css}">
<script type="module" src="${assets.js}"></script>
${gaSnippet(site.analytics?.ga4, site.domain)}
${adOn ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ads.client)}" crossorigin="anonymous"></script>` : ""}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>`;
  }

  function header(active) {
    const chip = (slug, icon, hi, en) =>
      `<a class="chip${active === slug ? " is-on" : ""}" data-g="${slug}" href="${url(slug === "all" ? "/" : `/${slug}/`)}"${active === slug ? ' aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${bi(esc(hi), esc(en))}</a>`;
    return `<header class="hd">
<div class="hd__in">
<a class="logo" href="${url("/")}" aria-label="${esc(site.name.en)}"><img src="${url("/assets/img/icon.svg")}" alt="" width="30" height="30"><span class="logo__t">The Simplest <b>News</b></span></a>
<div class="hd__tools">
<a class="hd__search" href="${url("/?s=1")}" data-search-open aria-label="खोजें · Search" title="खोजें · Search"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></a>
<div class="seg" role="group" aria-label="भाषा · Language"><button type="button" data-set-lang="hi" lang="hi">हिंदी</button><button type="button" data-set-lang="en" lang="en"><span class="lg">English</span><span class="sm">EN</span></button></div>
<button type="button" class="theme" data-toggle-theme aria-label="Light / Dark"><span class="theme--to-light">☀︎<span class="lg"> ${biT("light")}</span></span><span class="theme--to-dark">☾<span class="lg"> ${biT("dark")}</span></span></button>
<button type="button" class="hd__loc" data-loc-chip hidden><span aria-hidden="true">📍</span><span class="loc__short" data-loc-short></span><span class="loc__full" data-loc-full></span></button>
</div>
</div>
</header>
<nav class="gnav" aria-label="${esc(T.en.groups)}"><div class="gnav__in">
${chip("all", "🏠", T.hi.home, T.en.home)}
${groups.map((g) => chip(g.slug, g.icon, g.nav_hi || g.hi, g.nav_en || g.en)).join("\n")}
<button type="button" class="chip chip--more" data-more-groups aria-expanded="false" hidden><span class="chip--more__more">${biT("moreGroups")}</span><span class="chip--more__less">${biT("lessGroups")}</span></button>
</div></nav>`;
  }

  function footer() {
    const link = (p, hi, en) => `<a href="${url(p)}">${bi(hi, en)}</a>`;
    return `<footer class="ft"><div class="ft__in">
<p class="ft__brand"><b>The Simplest News</b> · ${bi(esc(site.tagline.hi), esc(site.tagline.en))}</p>
<p class="ft__links">${link("/about/", "हमारे बारे में", "About")} · ${link("/contact/", "संपर्क", "Contact")} · ${link("/privacy/", "प्राइवेसी पॉलिसी", "Privacy Policy")} · ${link("/terms/", "शर्तें", "Terms")} · ${link("/disclaimer/", "अस्वीकरण", "Disclaimer")}</p>
<p class="ft__note">${bi(
      "हर खबर का छोटा सार और 9 जवाब AI (Google Gemini) ने मूल खबर से लिखे हैं; हर खबर के साथ मूल वेबसाइट का लिंक है। गलती दिखे तो हमें बताएं।",
      "Each short summary and its 9 answers are written by AI (Google Gemini) from the original story, which is always linked. Spotted a mistake? Tell us.",
    )}</p>
<p class="ft__note">© ${new Date().getFullYear()} The Simplest News · ${esc(site.domain)}</p>
</div></footer>`;
  }

  const page = (opts, body, active) =>
    `${head(opts)}
<body data-page="${esc(opts.kind || "page")}"${opts.data ? ` data-view='${esc(JSON.stringify(opts.data))}'` : ""} data-base="${esc(base)}">
<a class="skip" href="#main">${bi("खबरों पर जाएं", "Skip to news")}</a>
${header(active)}
${body}
${footer()}
<div id="pop" class="pop" role="dialog" aria-modal="false" hidden></div>
</body>
</html>`;

  // ---------- pieces ----------
  const tabsBar = (group, tab) =>
    `<nav class="tabs" aria-label="Area">${TABS.map((t) => {
      const p = group === "all" ? (t === "country" ? "/" : `/all/${t}/`) : t === "country" ? `/${group}/` : `/${group}/${t}/`;
      return `<a class="tab${t === tab ? " is-on" : ""}" data-tab="${t}" href="${url(p)}"${t === tab ? ' aria-current="page"' : ""}>${bi(esc(T.hi.tabs[t]), esc(T.en.tabs[t]))}</a>`;
    }).join("")}</nav>`;

  const controls = () => {
    const sel = (lang) => {
      const L = T[lang];
      return `<div class="ctl l-${lang}" lang="${lang}">
<label class="ctl__f"><span>${L.sortLabel}</span><select data-sort>${Object.entries(L.sort).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
<label class="ctl__f"><span>${L.dayLabel}</span><select data-day>${["all", "today", "yesterday", "pick", "range"].map((k) => `<option value="${k}">${esc(L.days[k])}</option>`).join("")}</select></label>
<input type="date" class="ctl__date" data-date hidden aria-label="${esc(L.days.pick)}">
<span class="ctl__range" data-range hidden><label class="ctl__f"><span>${L.from}</span><input type="date" class="ctl__date" data-from></label><label class="ctl__f"><span>${L.to}</span><input type="date" class="ctl__date" data-to></label></span>
</div>`;
    };
    return `<div class="ctls">${sel("hi")}${sel("en")}</div>`;
  };


  // Each language gets its own newest stories (a story without its summary yet is shown only in its own language).
  const staticLists = (items, n = ctx.staticN || 30) =>
    ["hi", "en"]
      .map((lang) => {
        const list = items.filter((it) => it.ok || it.s?.l === lang).slice(0, n).map((it) => it[lang]);
        const chunks = [list.slice(0, 6), list.slice(6, 18), list.slice(18)];
        return `<div class="list l-${lang}" lang="${lang}" data-static>${chunks
          .map((c, i) => `<div class="list__chunk">${c.map((it) => itemHTML(it, lang, ctx.render)).join("\n")}</div>${i < 2 && c.length ? ad("infeed", "ad--feed") : ""}`)
          .join("")}${list.length === 0 ? `<p class="empty">${esc(T[lang].empty)}</p>` : ""}</div>`;
      })
      .join("");

  // "🔥 Trending": topics India searches on Google right now (one line; "More" shows the rest).
  // The search box goes above it (app.js puts it right under the page heading).
  const trendsRow = (list = []) =>
    list.length
      ? `<div class="trend" data-trends><div class="trend__in"><span class="trend__label">🔥 ${biT("trending")}</span>${list
          .map((t) => `<a class="chip chip--trend" href="${url(`/?q=${encodeURIComponent(t.q)}`)}" data-trend="${esc(t.q)}" rel="nofollow"${t.n ? ` title="Google: ${esc(t.n.toLocaleString("en-IN"))}+"` : ""}>${esc(t.t)}</a>`)
          .join("")}<button type="button" class="chip chip--more" data-more-trends aria-expanded="false" hidden><span class="chip--more__more">${biT("moreGroups")}</span><span class="chip--more__less">${biT("lessGroups")}</span></button></div></div>`
      : "";

  // The right-hand column holds only the side ad. Without an ad it is not shown and the page uses the full width.
  const sidebar = () => `<aside class="side">${ad("side", "ad--side")}</aside>`;

  function listPage({ group, tab, items, path, title, description, extraTop = "", noindex }) {
    const g = group === "all" ? null : G[group];
    const h1hi = g ? `${g.icon} ${g.hi}` : T.hi.all;
    const h1en = g ? `${g.icon} ${g.en}` : T.en.all;
    const view = { group, tab };
    const wide = group === "gold-silver"; // the rates are this page's main content
    const body = `<main id="main" class="wrap${wide ? " wrap--wide" : ""}">
<div class="main">
${ad("top", "ad--top")}
<div class="pagehead"><h1>${bi(esc(h1hi), esc(h1en))}</h1>${g ? `<p class="pagehead__about">${bi(esc(g.about_hi), esc(g.about_en))}</p>` : ""}</div>
${extraTop}
${tabsBar(group, tab)}
${controls()}
<div class="lists" data-lists>${PLACE_TABS.has(tab) ? `<p class="empty" data-wait>${biT("loading")}</p>` : staticLists(items)}</div>
<button type="button" class="btn btn--more" data-more hidden>${biT("more")}</button>
</div>
${sidebar()}
</main>`;
    return page({ title, description, path, noindex, kind: "list", data: view }, body, group);
  }

  function storyPage(s, related, keys = []) {
    const L = (lang) => s[lang];
    const head1 = (lang) => `<h1 class="st__h">${esc(L(lang).h)}</h1>`;
    const meta = (lang) =>
      `<p class="st__meta">${esc(L(lang).src)} · <time datetime="${new Date(s.t * 1000).toISOString()}">${esc(clock(s.t, lang))}</time>${L(lang).pn ? ` · ${esc(L(lang).pn)}` : ""}</p>`;
    const groupsLine = s.g.filter((x) => G[x]).map((x) => `<a class="chip chip--small" href="${url(`/${x}/`)}">${G[x].icon} ${bi(esc(G[x].hi), esc(G[x].en))}</a>`).join("");
    const photo = s.img ? `<figure class="st__fig"><img src="${esc(thumb(s.img, 480, 270, ctx.proxyWide))}" data-full="${esc(s.img)}" alt="" loading="lazy" decoding="async" width="480" height="270"><figcaption>${biT("photo")}: ${bi(esc(s.hi.src), esc(s.en.src))}</figcaption></figure>` : "";
    const sources = [{ u: s.u, pub: s.pub }, ...(s.also || [])]
      .map((a) => `<li><a href="${esc(a.u)}" target="_blank" rel="noopener nofollow">${bi(esc(a.pub.hi), esc(a.pub.en))} ↗</a></li>`)
      .join("");
    const shareUrl = abs(`/story/${s.i}/`);
    const share = `<div class="share">
<a class="btn btn--wa" href="https://wa.me/?text=${encodeURIComponent(`${s.hi.h} ${shareUrl}`)}" target="_blank" rel="noopener">WhatsApp</a>
<a class="btn" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(s.en.h)}" target="_blank" rel="noopener">X</a>
<a class="btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}" target="_blank" rel="noopener">Facebook</a>
<button type="button" class="btn" data-copy="${esc(shareUrl)}">${biT("copy")}</button>
</div>`;
    const rel = (lang) => (related.length ? `<section class="rel l-${lang}" lang="${lang}"><h2>${esc(T[lang].related)}</h2>${related.map((r) => itemHTML(r[lang], lang, ctx.render)).join("")}</section>` : "");
    const body = `<main id="main" class="wrap">
<div class="main">
<article class="st" data-id="${s.i}">
<div class="st__groups">${groupsLine}</div>
${["hi", "en"].map((lang) => `<div class="l-${lang}" lang="${lang}">${head1(lang)}${meta(lang)}</div>`).join("")}
${["hi", "en"].map((lang) => `<div class="l-${lang}" lang="${lang}">${qaHTML(L(lang), lang)}</div>`).join("")}
${photo}
<section class="st__src"><h2>${biT("sources")}</h2><ul>${sources}</ul></section>
${share}
</article>
${ad("story", "ad--story")}
${rel("hi")}${rel("en")}
</div>
${sidebar()}
</main>`;
    const jsonld = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: s.en.h,
      alternativeHeadline: s.hi.h,
      inLanguage: ["hi", "en"],
      datePublished: new Date(s.t * 1000).toISOString(),
      dateModified: new Date((s.at || s.t * 1000)).toISOString(),
      image: s.img ? [s.img] : undefined,
      isBasedOn: s.u,
      publisher: { "@type": "Organization", name: site.name.en, logo: { "@type": "ImageObject", url: abs("/assets/img/icon-512.png") } },
      mainEntityOfPage: shareUrl,
    };
    return page(
      { title: `${s.hi.h} | ${s.en.h} — The Simplest News`, description: `${s.hi.q?.[0] || ""} ${s.en.q?.[0] || ""}`.trim().slice(0, 300), path: `/story/${s.i}/`, image: s.img || undefined, jsonld, type: "article", kind: "story", data: { keys } },
      body,
      s.g[0],
    );
  }

  function placePage({ title, h1, path, items, about, keys = [] }) {
    const body = `<main id="main" class="wrap">
<div class="main">
${ad("top", "ad--top")}
<div class="pagehead"><h1>${h1}</h1>${about ? `<p class="pagehead__about">${about}</p>` : ""}</div>
<div class="lists" data-lists>${staticLists(items, 40)}</div>
</div>
${sidebar()}
</main>`;
    return page({ title, description: title, path, kind: "place", data: { keys } }, body, "local");
  }

  function textPage({ path, title, hi, en }) {
    const body = `<main id="main" class="wrap wrap--text"><div class="main prose">
<div class="l-hi" lang="hi">${hi}</div><div class="l-en" lang="en">${en}</div>
</div></main>`;
    return page({ title, description: title, path, kind: "text" }, body, "");
  }

  return { page, listPage, storyPage, placePage, textPage, trendsRow, bi, ad, url, abs };
}
