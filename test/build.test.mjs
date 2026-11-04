// Builds the whole website from a tiny news database and checks the important pages.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { test } from "node:test";

test("the website builds and has the key pages", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tsn-"));
  const now = Date.now();
  const nine = (p) => Array.from({ length: 9 }, (_, i) => `${p} ${i}`);
  const story = (id, extra) => ({ id, u: `https://news.example/${id}`, src: "f", pub: { en: "Amar Ujala", hi: "अमर उजाला" }, l: "hi", t: `Title ${id}`, img: "", p: now - 3600e3, f: now, lv: "district", st: "up", d: "barabanki", pr: 4, s: "new", tr: 0, loc: { c: "in", s: "up", d: "barabanki" }, sc: "district", ...extra });
  const db = {
    v: 1, seen: {}, feeds: {}, names: { "up/barabanki": "बाराबंकी" }, videos: [{ id: "abcdefghijk", t: "New Song (Official Video)", ch: "T-Series", p: now, k: "song" }], metals: null,
    stories: [
      story("aaa111", { s: "ok", a: { hi: { h: "हिंदी शीर्षक", q: nine("जवाब") }, en: { h: "English headline", q: nine("answer") }, g: ["cricket"], good: false, imp: 8, scope: "country", place: { country: "India", state: "Uttar Pradesh", district: "Barabanki", local: "Zaidpur", local_hi: "जैदपुर" }, at: now - 60e3 }, loc: { c: "in", s: "up", d: "barabanki", l: "zaidpur" }, sc: "country" }),
      story("bbb222"),
      story("ccc333", { t: "सेंसेक्स 500 अंक चढ़ा, निफ्टी भी उछला" }),
      story("ddd444", { t: "रिलायंस के शेयर 3% चढ़े, टीसीएस में गिरावट" }),
    ],
  };
  fs.mkdirSync(path.join(tmp, "data"));
  fs.writeFileSync(path.join(tmp, "data", "db.json.gz"), zlib.gzipSync(JSON.stringify(db)));
  const out = path.join(tmp, "site");
  const indexNowOut = path.join(tmp, "indexnow.json");
  execFileSync(process.execPath, ["scripts/build.mjs"], { env: { ...process.env, DATA_DIR: path.join(tmp, "data"), OUT_DIR: out, PATH_PREFIX: "/thesimplestnews", SITE_URL: "https://omkrishna89.github.io", INDEXNOW_OUT: indexNowOut }, stdio: "pipe" });
  const read = (p) => fs.readFileSync(path.join(out, p), "utf8");
  const home = read("index.html");
  assert.match(home, /English headline/);
  assert.match(home, /href="\/thesimplestnews\/story\/aaa111\/"/, "links carry the GitHub Pages path");
  assert.match(home, /<link rel="canonical" href="https:\/\/omkrishna89.github.io\/thesimplestnews\/">/);
  for (const p of ["cricket/index.html", "cricket/world/index.html", "cricket/district/index.html", "story/aaa111/index.html", "place/up/barabanki/index.html", "privacy/index.html", "about/index.html", "contact/index.html", "terms/index.html", "disclaimer/index.html", "404.html", "robots.txt", "sitemap.xml", "news-sitemap.xml", "data/index.json", "data/places.json", "manifest.webmanifest"]) {
    assert.ok(fs.existsSync(path.join(out, p)), `${p} exists`);
  }
  const storyPage = read("story/aaa111/index.html");
  assert.match(storyPage, /answer 0/);
  assert.match(storyPage, /"@type":"NewsArticle"/);
  assert.match(read("cricket/district/index.html"), /noindex/, "personal tabs are not for Google");
  const idx = JSON.parse(read("data/index.json"));
  assert.ok(idx.days["d/up/barabanki"].length >= 1);
  const day = idx.days["d/up/barabanki"][0];
  const hi = JSON.parse(read(`data/hi/d/up/barabanki/${day}.json`));
  const en = JSON.parse(read(`data/en/d/up/barabanki/${day}.json`));
  assert.equal(hi.length, 4, "Hindi list: all stories");
  assert.equal(en.length, 1, "English list: only the summarized one (the others are Hindi stories without their summary yet)");
  assert.deepEqual(idx.n.hi["d/up/barabanki"], [4], "story counts per day, for 'See N stories in …'");
  // the Stocks box: one file per company, found from any group
  assert.deepEqual(JSON.parse(read("data/hi/stock/reliance.json")).map((s) => s.i), ["ddd444"]);
  assert.deepEqual(JSON.parse(read("data/hi/stock/tcs.json")).map((s) => s.i), ["ddd444"]);
  assert.equal(idx.stocks.hi.RELIANCE, 1);
  assert.equal(idx.stocks.en.RELIANCE, undefined, "a Hindi story without its summary yet is not in the English files");
  assert.ok(idx.span >= 1, "how many days of news the site has");
  // search: every story of the day in a small form; a written story carries "k" and the other language's words
  assert.ok(idx.days.search.includes(day));
  const sHi = JSON.parse(read(`data/hi/search/${day}.json`));
  assert.deepEqual(sHi.map((s) => s.i).sort(), ["aaa111", "bbb222", "ccc333", "ddd444"]);
  const written = sHi.find((s) => s.i === "aaa111");
  assert.equal(written.k, 1);
  assert.equal(written.q, undefined, "no answers in the search file (they load when a result is opened)");
  assert.match(written.s, /English headline/, "an English search also finds the Hindi version");
  assert.deepEqual(JSON.parse(read(`data/en/search/${day}.json`)).map((s) => s.i), ["aaa111"], "English: only stories that have English");
  assert.ok(idx.days["s-up/stock-market"], "a headline with सेंसेक्स puts the story into Stock Market before the AI has written it");
  assert.deepEqual(JSON.parse(read(`data/hi/s-up/stock-market/${day}.json`)).map((s) => s.i), ["ccc333"]);
  assert.ok(JSON.parse(read("data/stocks.json")).some((s) => s.s === "RELIANCE"), "names for the Stocks box");
  // IndexNow: the key file, and the story written in this run listed for the search engines
  const site = JSON.parse(fs.readFileSync(new URL("../config/site.json", import.meta.url)));
  assert.equal(read(`${site.indexNow.key}.txt`), site.indexNow.key);
  const indexNow = JSON.parse(fs.readFileSync(indexNowOut, "utf8"));
  assert.equal(indexNow.host, "omkrishna89.github.io");
  assert.deepEqual(indexNow.urlList, ["https://omkrishna89.github.io/thesimplestnews/story/aaa111/"]);
  assert.equal(indexNow.keyLocation, `https://omkrishna89.github.io/thesimplestnews/${site.indexNow.key}.txt`);
  if (!site.analytics?.ga4) assert.doesNotMatch(home, /googletagmanager/, "no Google Analytics without a Measurement ID");
  assert.ok(!fs.existsSync(path.join(out, "ads.txt")), "no ads.txt before AdSense is set up");
  assert.match(read("movies/index.html"), /abcdefghijk/, "trailers & songs on the Movies page");
  fs.rmSync(tmp, { recursive: true, force: true });
});
