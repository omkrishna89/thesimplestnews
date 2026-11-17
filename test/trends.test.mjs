// "Trending" (Google Trends India): which topics are kept, how they are written, and how they are ordered.
import assert from "node:assert/strict";
import { test } from "node:test";
import { display, mergeTrends, parseTrends, traffic } from "../scripts/lib/trends.mjs";

const item = (title, n, news) => `<item><title>${title}</title><ht:approx_traffic>${n}</ht:approx_traffic><pubDate>Tue, 3 Nov 2026 23:50:00 -0800</pubDate>${news
  .map(([h, u, src]) => `<ht:news_item><ht:news_item_title>${h}</ht:news_item_title><ht:news_item_url>${u}</ht:news_item_url><ht:news_item_source>${src}</ht:news_item_source></ht:news_item>`)
  .join("")}</item>`;
const xml = `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:ht="https://trends.google.com/trending/rss" version="2.0"><channel>
${item("bengal vs maharashtra", "1000+", [["Bengal vs MAH: Bengal vs Maharashtra, Match 60", "https://www.bcci.tv/x?utm_source=rss", "BCCI"]])}
${item("women&apos;s big bash league", "200+", [["Women&apos;s Big Bash League - T20", "https://cricket.example/w", "Cricket World"]])}
${item("వరి", "500+", [["బోరున్నా యాసంగిలో వరి", "https://eenadu.example/a", "Eenadu"]])}
${item("eenadu news", "200+", [["అంతర్జాతీయ నకిలీ కాల్‌సెంటర్‌", "https://eenadu.example/b", "Eenadu"]])}
${item("दिवाली", "20K+", [["दिवाली पर बाज़ार में रौनक", "https://hindi.example/d", "Hindi News"]])}
</channel></rss>`;

test("Google Trends: English and Hindi topics with their news links", () => {
  const t = parseTrends(xml);
  assert.deepEqual(t.map((x) => x.q), ["bengal vs maharashtra", "women's big bash league", "दिवाली"], "Telugu topics, and topics with only Telugu news, are left out");
  assert.equal(t[0].t, "Bengal vs Maharashtra", "written as the news writes it");
  assert.equal(t[1].t, "Women's Big Bash League");
  assert.equal(t[0].n, 1000);
  assert.equal(t[2].n, 20000);
  assert.deepEqual(t[0].news, [{ h: "Bengal vs MAH: Bengal vs Maharashtra, Match 60", u: "https://www.bcci.tv/x", src: "BCCI" }]);
  assert.equal(traffic("2M+"), 2000000);
  assert.equal(display("asteroid", ["Sandia model makes asteroid-deflection simulations faster"]), "Asteroid");
  assert.equal(display("gta vi ps5", ["GTA VI on PS5: release date leaked", "Sony's PS5 price"]), "GTA VI PS5", "word by word when the whole topic isn't in a headline");
});

test("Google Trends: names written properly even when the headlines don't have them", () => {
  assert.equal(display("rajat patidar", ["IND vs PAK: भारत के बाद पाकिस्तान ने भी किया टीम का ऐलान"]), "Rajat Patidar", "every word with a capital letter");
  assert.equal(display("ben vs mah", ["Maharashtra takes the lead against Bengal", "Bengal vs Maharashtra, Ranji Trophy Live"]), "Bengal vs Maharashtra", "short words written in full");
  assert.equal(display("im game", ["From Dulquer Salmaan's 'I'm Game' to more"]), "I'm Game", "the apostrophe the searchers left out");
  assert.equal(display("women's big bash league", ["Last-ball thriller gives Sixers winning start"]), "Women's Big Bash League");
  assert.equal(display("bbl women", ["Women's BBL: Sixers win"]), "BBL Women", "a word as a headline writes it");
  assert.equal(display("8th pay commission news", ["8th Pay Commission: what changes"]), "8th Pay Commission News");
  assert.equal(display("दिवाली", ["दिवाली पर बाज़ार में रौनक"]), "दिवाली");
  const bgmi = ["Krafton unveils BGMI 4.7 update with annual popularity competition", "PUBG MOBILE launches Version 4.7 with the Ancient Beast"];
  assert.equal(display("battlegrounds mobile india", bgmi), "Battlegrounds Mobile India", "a long word in capitals (a brand's styling) is not copied");
  assert.equal(display("bgmi new update", bgmi), "BGMI New Update", "short words in capitals are");
  assert.equal(display("icici bank share price", ["ICICI Bank shares jump 3%"]), "ICICI Bank Share Price");
});

test("Google Trends: topics of the last 8 hours, the most searched first", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const old = [
    { q: "rain delay", t: "Rain delay", n: 200, p: now - 9 * 3600e3, news: [] },
    { q: "asteroid", t: "Asteroid", n: 500, p: now - 2 * 3600e3, news: [{ h: "old" }] },
  ];
  const fresh = [
    { q: "asteroid", t: "Asteroid", n: 200, p: now - 600e3, news: [{ h: "new" }] },
    { q: "suspended", t: "Suspended", n: 1000, p: now - 600e3, news: [] },
  ];
  const m = mergeTrends(old, fresh, now);
  assert.deepEqual(m.map((x) => x.q), ["suspended", "asteroid"], "older than 8 hours: gone");
  assert.equal(m[1].n, 500, "a topic keeps its highest count");
  assert.equal(m[1].news[0].h, "new", "and its newest news links");
});

test("Google Trends: a topic keeps the groups Gemini sorted it into", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const m = mergeTrends([{ q: "sensex live", t: "Sensex live", n: 500, p: now - 3600e3, g: ["stock-market"], news: [] }], [{ q: "sensex live", t: "Sensex live", n: 900, p: now - 600e3, news: [] }], now);
  assert.deepEqual(m[0].g, ["stock-market"]);
  assert.equal(m[0].n, 900);
});
