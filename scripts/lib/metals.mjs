// Gold & silver rates, the same way as on IFC knowledge:
//  - today's rates and the last ~4 months: IBJA (India Bullion and Jewellers Association), ibjarates.com
//  - older days for the 5-year chart: international price (COMEX futures, Yahoo Finance) x dollar-rupee rate,
//    scaled to match IBJA over the months where both are known (marked as estimates on the site).
import { USER_AGENT, get, istDay } from "./util.mjs";

const ROWS = [
  { key: "Gold999", chart: ["HdnGold", "purity999"], id: "g24" },
  { key: "Gold916", chart: ["HdnGold", "purity916"], id: "g22" },
  { key: "Silver999", chart: ["HdnSilver", "silverRate"], id: "silver" },
];

const isoDay = (dmy) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

function num(html, id) {
  const m = html.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`));
  const n = m ? Number(m[1].replace(/[^\d]/g, "")) : NaN;
  return n > 0 ? n : 0;
}

function chartData(html, id) {
  const m = html.match(new RegExp(`id="${id}" value="([^"]*)"`));
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
}

export function parseIbja(html, today = istDay()) {
  const rows = {};
  let date = "";
  let session = "";
  for (const row of ROWS) {
    const am = num(html, `lbl${row.key}_AM`);
    const pm = num(html, `lbl${row.key}_PM`);
    const price = pm || am;
    if (!price) throw new Error(`no ${row.key} rate on the page`);
    const c = chartData(html, row.chart[0]) || {};
    const days = (c.labels || []).map(isoDay);
    const values = c[row.chart[1]] || [];
    let i = Math.min(days.length, values.length) - 1;
    const day = pm && i >= 0 && Number(values[i]) === pm ? days[i] : today;
    while (i >= 0 && !(days[i] < day)) i--;
    const prev = i >= 0 ? Number(values[i]) : 0;
    rows[row.id] = { price, change: prev > 0 ? price - prev : null };
    date ||= day;
    session ||= pm ? "PM" : "AM";
  }
  const { g24, g22, silver } = rows;
  const sane = g24.price > 10000 && g24.price < 1000000 && g22.price < g24.price && g22.price > g24.price * 0.85 && silver.price > 10000 && silver.price < 5000000;
  if (!sane) throw new Error(`rates look wrong: ${g24.price} / ${g22.price} / ${silver.price}`);
  const hist = (id, key) => {
    const c = chartData(html, id) || {};
    const v = c[key] || [];
    return (c.labels || []).map((d, i) => [isoDay(d), Number(v[i])]).filter(([d, x]) => d && x > 0);
  };
  return { date, session, rows, history: { gold22: hist("HdnGold", "purity916"), silver: hist("HdnSilver", "silverRate") }, fetched: new Date().toISOString() };
}

async function yahoo(symbol) {
  const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1d`, {
    accept: "application/json",
    headers: { "user-agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const r = JSON.parse(res.text).chart.result[0];
  const closes = r.indicators.quote[0].close;
  const out = r.timestamp.map((t, i) => [istDay(t * 1000), closes[i]]).filter(([, v]) => v > 0);
  if (out.length < 500) throw new Error(`${symbol}: only ${out.length} days`);
  return out;
}

// Returns fresh data, or the previous data (`old`) when a source can't be reached.
export async function updateMetals(old = {}) {
  const out = { ...old };
  try {
    const res = await get("https://ibjarates.com/", { accept: "text/html" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    out.ibja = parseIbja(res.text);
  } catch (err) {
    console.warn(`[metals] IBJA: ${err.message}`);
  }
  try {
    const [gold, silver, inr] = await Promise.all([yahoo("GC=F"), yahoo("SI=F"), yahoo("INR=X")]);
    out.intl = { gold, silver, inr, fetched: new Date().toISOString() };
  } catch (err) {
    console.warn(`[metals] international: ${err.message}`);
  }
  out.checked = Date.now();
  return out;
}

// ---------- numbers for the box and the 5-year charts (used by the build) ----------
const OZ = 31.1034768;

function inRupees(usd, inr, perUnit) {
  const rate = new Map(inr);
  const days = [...rate.keys()].sort();
  let j = 0;
  let last = 0;
  return usd
    .map(([d, v]) => {
      while (j < days.length && days[j] <= d) last = rate.get(days[j++]);
      return last ? [d, v * last * perUnit] : null;
    })
    .filter(Boolean);
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

function on(series, day) {
  let found = null;
  for (const p of series) {
    if (p[0] <= day) found = p;
    else break;
  }
  return found;
}

const minus = (day, { months = 0, years = 0 }) => {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y - years, m - 1 - months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
};

const W = 1000;
const H = 300;
function chart(series) {
  const pts = series.filter((p, i) => i % 3 === 0 || i === series.length - 1);
  const t0 = Date.parse(pts[0][0]);
  const t1 = Date.parse(pts[pts.length - 1][0]);
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(...vals) * 0.92;
  const hi = Math.max(...vals) * 1.06;
  const x = (day) => ((Date.parse(day) - t0) / (t1 - t0 || 1)) * W;
  const y = (v) => (1 - (v - lo) / (hi - lo)) * H;
  const line = `M${pts.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join("L")}`;
  const pct = (v, total) => +((v / total) * 100).toFixed(2);
  const yTicks = [1, 2, 3].map((k) => {
    const v = lo + ((hi - lo) * k) / 4;
    return { y: +y(v).toFixed(1), pct: pct(y(v), H), value: v };
  });
  const xTicks = [];
  for (let yr = Number(pts[0][0].slice(0, 4)) + 1; yr <= Number(pts.at(-1)[0].slice(0, 4)); yr++) {
    const px = x(`${yr}-01-01`);
    if (px > 30 && px < W - 30) xTicks.push({ x: +px.toFixed(1), pct: pct(px, W), label: String(yr) });
  }
  const end = pts.at(-1);
  return { W, H, line, area: `${line}L${W},${H}L0,${H}Z`, yTicks, xTicks, end: { xp: pct(x(end[0]), W), yp: pct(y(end[1]), H) } };
}

function metal(intlRupees, ibjaHistory, todayValue, todayDay) {
  const intlMap = new Map(intlRupees);
  const ratios = ibjaHistory.map(([d, v]) => (intlMap.has(d) ? v / intlMap.get(d) : 0)).filter((r) => r > 0.8 && r < 1.5);
  const scale = ratios.length >= 10 ? median(ratios) : null;
  if (!scale && !ibjaHistory.length) return null;
  const ibjaFrom = ibjaHistory.length ? ibjaHistory[0][0] : todayDay;
  const estimated = scale ? intlRupees.filter(([d]) => d < ibjaFrom).map(([d, v]) => [d, Math.round(v * scale), true]) : [];
  const series = [...estimated, ...ibjaHistory.map(([d, v]) => [d, v, false])];
  if (todayValue && (!series.length || series.at(-1)[0] < todayDay)) series.push([todayDay, todayValue, false]);
  if (series.length < 2) return null;
  const today = series.at(-1);
  const row = (key, day) => {
    const p = day ? on(series, day) : today;
    if (!p) return { key, missing: true };
    const change = p === today ? null : ((today[1] - p[1]) / p[1]) * 100;
    return { key, day: p[0], value: p[1], estimated: !!p[2], change };
  };
  return {
    today: row("today", null),
    rows: [row("m1", minus(today[0], { months: 1 })), row("y1", minus(today[0], { years: 1 })), row("y5", minus(today[0], { years: 5 }))],
    chart: chart(series.filter(([d]) => d >= minus(today[0], { years: 5, months: 1 }))),
    hasEstimates: estimated.length > 0,
  };
}

export function metalsView(m) {
  if (!m || (!m.ibja && !m.intl)) return null;
  const hist = m.ibja?.history || { gold22: [], silver: [] };
  const today = m.ibja?.date || (m.intl ? m.intl.gold.at(-1)[0] : "");
  const gold = m.intl ? inRupees(m.intl.gold, m.intl.inr, (10 / OZ) * 0.916) : [];
  const silver = m.intl ? inRupees(m.intl.silver, m.intl.inr, 1000 / OZ) : [];
  const view = {
    date: m.ibja?.date || "",
    session: m.ibja?.session || "",
    rates: m.ibja?.rows || null,
    gold22: metal(gold, hist.gold22, m.ibja?.rows?.g22?.price || 0, today),
    silver: metal(silver, hist.silver, m.ibja?.rows?.silver?.price || 0, today),
  };
  return view.gold22 || view.silver ? view : null;
}
