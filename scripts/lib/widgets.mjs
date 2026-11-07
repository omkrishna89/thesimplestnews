// Gold & silver box with 5-year charts (like IFC knowledge), and the trailers & songs strip.
import { esc } from "../../src/assets/js/ui.js";
import { bi } from "./pages.mjs";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const money = (v) => `₹${inr.format(v)}`;
const shortMoney = (v, lang) =>
  v >= 1e5
    ? lang === "hi"
      ? `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)} लाख`
      : `₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)} lakh`
    : lang === "hi"
      ? `₹${Math.round(v / 1000)} हज़ार`
      : `₹${Math.round(v / 1000)}k`;
const pct = (c) => (c === null || c === undefined ? "" : `${c >= 0 ? "+" : ""}${c.toFixed(Math.abs(c) >= 100 ? 0 : 1)}%`);
const dayHi = (d) => (d ? new Intl.DateTimeFormat("hi-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d)) : "");
const dayEn = (d) => (d ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d)) : "");

const ROWS = { m1: ["1 महीना पहले", "1 month ago"], y1: ["1 साल पहले", "1 year ago"], y5: ["5 साल पहले", "5 years ago"] };

function card(m, key, titleHi, titleEn, unitHi, unitEn, daily, uid) {
  const c = m.chart;
  const up = daily !== null && daily !== undefined ? daily >= 0 : null;
  return `<div class="mbox metal--${key}">
<div class="mbox__head"><span class="mbox__name">${bi(esc(titleHi), esc(titleEn))}<small>${bi(esc(unitHi), esc(unitEn))}</small></span>
<span class="mbox__now"><b>${money(m.today.value)}</b>${up === null ? "" : `<span class="chg ${up ? "chg--up" : "chg--down"}">${up ? "▲" : "▼"} ${inr.format(Math.abs(daily))}</span>`}</span></div>
<div class="metal__plot" role="img" aria-label="${esc(titleEn)}: 5 years">
<svg viewBox="0 0 ${c.W} ${c.H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${uid}-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="metal__stop1"/><stop offset="1" class="metal__stop2"/></linearGradient></defs>
${c.yTicks.map((t) => `<line class="metal__grid" x1="0" x2="${c.W}" y1="${t.y}" y2="${t.y}"/>`).join("")}${c.xTicks.map((t) => `<line class="metal__grid" x1="${t.x}" x2="${t.x}" y1="0" y2="${c.H}"/>`).join("")}
<path d="${c.area}" fill="url(#${uid}-${key})"/><path class="metal__line" d="${c.line}"/></svg>
${c.yTicks.slice(1).map((t) => `<span class="metal__ylab" style="top:${t.pct}%">${bi(esc(shortMoney(t.value, "hi")), esc(shortMoney(t.value, "en")))}</span>`).join("")}
<span class="metal__dot" style="left:${c.end.xp}%;top:${c.end.yp}%"></span>
</div>
<div class="metal__xaxis" aria-hidden="true">${c.xTicks.map((t) => `<span style="left:${t.pct}%">${t.label}</span>`).join("")}</div>
<dl class="mbox__then">${m.rows
    .map((r) => {
      const [hi, en] = ROWS[r.key];
      return `<div><dt>${bi(hi, en)}</dt><dd>${r.missing ? "—" : `${money(r.value)}${r.estimated ? "<sup>*</sup>" : ""}<span class="chg ${r.change >= 0 ? "chg--up" : "chg--down"}">${pct(r.change)}</span>`}</dd></div>`;
    })
    .join("")}</dl>
</div>`;
}

export function metalsBox(view, uid, url) {
  if (!view) return "";
  const r = view.rates;
  const g24 = r?.g24;
  const est = view.gold22?.hasEstimates || view.silver?.hasEstimates;
  return `<section class="panel metals" aria-label="Gold and silver rates">
<h2><a href="${url("/gold-silver/")}">${bi("आज का सोना-चांदी भाव", "Today's gold & silver rates")}</a></h2>
${g24 ? `<p class="mbox__g24">${bi("सोना 24 कैरेट", "Gold 24 carat")} <small>${bi("10 ग्राम", "10 g")}</small> <b>${money(g24.price)}</b>${g24.change === null ? "" : ` <span class="chg ${g24.change >= 0 ? "chg--up" : "chg--down"}">${g24.change >= 0 ? "▲" : "▼"} ${inr.format(Math.abs(g24.change))}</span>`}</p>` : ""}
${view.gold22 ? card(view.gold22, "gold", "सोना 22 कैरेट", "Gold 22 carat", "10 ग्राम", "10 g", r?.g22?.change, uid) : ""}
${view.silver ? card(view.silver, "silver", "चांदी", "Silver", "1 किलो", "1 kg", r?.silver?.change, uid) : ""}
<p class="rates-foot">${bi(
    `स्रोत: <a href="https://ibjarates.com/" rel="noopener">IBJA</a>${view.date ? ` · ${dayHi(view.date)}, ${view.session === "PM" ? "शाम" : "दोपहर"} का भाव` : ""}। ▲▼ = पिछले दिन से बदलाव। GST और मेकिंग चार्ज अलग।${est ? " <sup>*</sup>पुराने भाव अनुमानित: अंतरराष्ट्रीय भाव × डॉलर-रुपया दर, IBJA के हाल के भावों से मिलाकर।" : ""}`,
    `Source: <a href="https://ibjarates.com/" rel="noopener">IBJA</a>${view.date ? ` · ${dayEn(view.date)}, ${view.session === "PM" ? "evening" : "noon"} rate` : ""}. ▲▼ = change from the day before. GST and making charges extra.${est ? " <sup>*</sup>Older rates are estimates: world price × dollar-rupee rate, matched to IBJA's recent rates." : ""}`,
  )}</p>
</section>`;
}

export function videosStrip(videos, { limit = 8 } = {}) {
  if (!videos?.length) return "";
  return `<section class="vids" aria-label="Trailers and songs">
<h2>🎬 ${bi("नए ट्रेलर और गाने", "New trailers & songs")}</h2>
<div class="vids__row">${videos
    .slice(0, limit)
    .map(
      (v) => `<button type="button" class="vid" data-yt="${esc(v.id)}" aria-label="${esc(v.t)}"><span class="vid__img"><img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180"><span class="vid__play" aria-hidden="true">▶</span><span class="vid__kind">${v.k === "trailer" ? bi("ट्रेलर", "Trailer") : bi("गाना", "Song")}</span></span><span class="vid__t">${esc(v.t)}</span><span class="vid__ch">${esc(v.ch)}</span></button>`,
    )
    .join("")}</div>
</section>`;
}
