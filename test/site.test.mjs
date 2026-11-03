import assert from "node:assert/strict";
import { test } from "node:test";
import { clean } from "../scripts/lib/gemini.mjs";
import { parseIbja, metalsView } from "../scripts/lib/metals.mjs";
import { itemHTML, qaHTML, esc } from "../src/assets/js/ui.js";

const ctx = { base: "/x", proxy: "", now: Date.parse("2026-11-03T12:00:00Z"), icon: () => "📰" };
const nine = (w) => Array.from({ length: 9 }, (_, i) => (i === 6 ? w : `answer ${i}`));

test("Gemini's answer is checked and tidied", () => {
  const r = clean({
    n: 1,
    hi: { h: "जैदपुर का तालाब नीलाम", what: "क्या हुआ", who: "", whom: "x", whose: "x", where: "x", when: "x", why: "x", which: "x", how: "x" },
    en: { h: "Zaidpur pond auctioned", what: "It was sold", who: "Town panchayat", whom: "x", whose: "x", where: "x", when: "x", why: "x", which: "x", how: "x" },
    groups: ["business", "not-a-group"],
    good: false,
    importance: 42,
    scope: "local",
    country: "India", state: "Uttar Pradesh", district: "Barabanki", tehsil: "", place: "Zaidpur", place_hi: "जैदपुर", district_hi: "बाराबंकी", same_as: 0,
  });
  assert.equal(r.hi.q[1], "जानकारी नहीं", "an empty answer becomes 'not mentioned'");
  assert.deepEqual(r.groups, ["business"], "unknown groups are dropped");
  assert.equal(r.imp, 10, "importance is kept within 1-10");
  assert.equal(clean({ hi: { h: "" }, en: { h: "ok ok" } }), null, "no headline, no story");
});

test("answers: rows Gemini couldn't fill are left out", () => {
  const html = qaHTML({ q: nine("Not mentioned") }, "en");
  assert.equal((html.match(/qa__row/g) || []).length, 8);
  assert.match(html, /<dt>What\?<\/dt>/);
  assert.match(qaHTML({ x: "snip" }, "hi"), /छोटा सार जल्द आएगा/);
});

test("a story links to our page once summarized, else to the original website", () => {
  const base = { i: "abc", t: Date.parse("2026-11-03T11:00:00Z") / 1000, u: "https://news.example/a", img: "", g: ["cricket"], h: "Head <b>", src: "Src", pn: "Delhi", m: 5 };
  const done = itemHTML({ ...base, q: nine("x") }, "en", ctx);
  assert.match(done, /href="\/x\/story\/abc\/"/);
  assert.match(done, /Head &lt;b&gt;/, "headline is escaped");
  assert.match(done, /1h ago/);
  const waiting = itemHTML(base, "hi", ctx);
  assert.match(waiting, /href="https:\/\/news.example\/a" target="_blank"/);
  assert.match(waiting, /छोटा सार जल्द आएगा/);
  assert.equal(esc(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});

test("gold and silver: IBJA page and the 5-year view", () => {
  const html = `
    <span id="lblGold999_AM">1,36,000</span><span id="lblGold999_PM">1,37,576</span>
    <span id="lblGold916_AM">1,25,000</span><span id="lblGold916_PM">1,26,020</span>
    <span id="lblSilver999_AM">1,70,000</span><span id="lblSilver999_PM">1,76,425</span>
    <input id="HdnGold" value="{&quot;labels&quot;:[&quot;02/11/2026&quot;,&quot;03/11/2026&quot;],&quot;purity999&quot;:[137524,137576],&quot;purity916&quot;:[125990,126020]}">
    <input id="HdnSilver" value="{&quot;labels&quot;:[&quot;02/11/2026&quot;,&quot;03/11/2026&quot;],&quot;silverRate&quot;:[179972,176425]}">`;
  const r = parseIbja(html, "2026-11-03");
  assert.equal(r.date, "2026-11-03");
  assert.equal(r.session, "PM");
  assert.equal(r.rows.g24.price, 137576);
  assert.equal(r.rows.g24.change, 52);
  assert.equal(r.rows.silver.change, -3547);
  const v = metalsView({ ibja: r });
  assert.equal(v.gold22.today.value, 126020);
  assert.ok(v.gold22.chart.line.startsWith("M"));
  assert.throws(() => parseIbja(html.replace("1,37,576", "999"), "2026-11-03"), /look wrong/);
});
