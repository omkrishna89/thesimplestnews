import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { parseFeed } from "../scripts/lib/feeds.mjs";
import { cleanUrl, parseDate, plain, slug } from "../scripts/lib/util.mjs";
import { similarity, words } from "../scripts/lib/db.mjs";

const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("RSS: titles, clean links, text, photos and dates", () => {
  const { title, items } = parseFeed(fx("rss.xml"));
  assert.equal(title, "Test Feed");
  assert.equal(items.length, 2, "the item without a title is skipped");
  assert.equal(items[0].title, "Barabanki News: जैदपुर तालाब एक करोड़ 53 लाख रुपये में नीलाम");
  assert.equal(items[0].link, "https://www.example.com/uttar-pradesh/barabanki/pond-auction?id=7", "utm_ tracking removed");
  assert.equal(items[0].text, "नीलामी दूसरी बार & पूरी हुई");
  assert.equal(items[0].image, "https://img.example.com/a.jpg");
  assert.equal(new Date(items[0].published).toISOString(), "2026-11-02T20:12:30.000Z");
  assert.equal(items[1].title, "Ranji Trophy: Karnataka in control & Aneesh scores 120", "a stray & does not break the feed");
  assert.equal(items[1].image, "https://img.example.com/b.jpg");
});

test("Atom (YouTube): video id, channel, thumbnail", () => {
  const { items } = parseFeed(fx("atom.xml"));
  assert.equal(items.length, 1);
  assert.equal(items[0].videoId, "abcdefghijk");
  assert.equal(items[0].channel, "T-Series");
  assert.equal(items[0].image, "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
  assert.ok(Number.isFinite(items[0].published));
});

test("not a feed is reported, not crashed", () => {
  assert.throws(() => parseFeed("<html><body>hello</body></html>"), /not a feed/);
});

test("helpers", () => {
  assert.equal(cleanUrl("https://WWW.Site.com/a?b=1&utm_medium=x#top"), "https://www.site.com/a?b=1");
  assert.equal(cleanUrl("javascript:alert(1)"), "");
  assert.equal(plain("<p>a&nbsp;&amp;&nbsp;b</p><script>x()</script>"), "a & b");
  assert.equal(new Date(parseDate("03-11-2026 10:22")).toISOString(), "2026-11-03T04:52:00.000Z", "day-first dates are India time");
  assert.equal(slug("Kanpur Nagar District"), "kanpur-nagar");
  assert.equal(slug("Nawabganj tehsil"), "nawabganj");
  assert.equal(slug("बाराबंकी"), "बाराबंकी");
});

test("same story from two websites is spotted", () => {
  const a = words("Delhi-Pune IndiGo flight: passenger tampers with emergency door, case filed");
  const b = words("IndiGo flight passenger tampers with emergency door on Delhi Pune flight");
  const c = words("Sensex jumps 600 points as banks rally");
  assert.ok(similarity(a, b) >= 0.55, `similar: ${similarity(a, b)}`);
  assert.ok(similarity(a, c) < 0.2);
});
