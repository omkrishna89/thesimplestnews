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
      story("aaa111", { s: "ok", a: { hi: { h: "हिंदी शीर्षक", q: nine("जवाब") }, en: { h: "English headline", q: nine("answer") }, g: ["cricket"], good: false, imp: 8, scope: "country", place: { country: "India", state: "Uttar Pradesh", district: "Barabanki", local: "Zaidpur", local_hi: "जैदपुर" } }, loc: { c: "in", s: "up", d: "barabanki", l: "zaidpur" }, sc: "country" }),
      story("bbb222"),
    ],
  };
  fs.mkdirSync(path.join(tmp, "data"));
  fs.writeFileSync(path.join(tmp, "data", "db.json.gz"), zlib.gzipSync(JSON.stringify(db)));
  const out = path.join(tmp, "site");
  execFileSync(process.execPath, ["scripts/build.mjs"], { env: { ...process.env, DATA_DIR: path.join(tmp, "data"), OUT_DIR: out, PATH_PREFIX: "/thesimplestnews", SITE_URL: "https://omkrishna89.github.io" }, stdio: "pipe" });
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
  assert.equal(hi.length, 2, "Hindi list: both stories");
  assert.equal(en.length, 1, "English list: only the summarized one (the other is a Hindi story without its summary yet)");
  assert.ok(!fs.existsSync(path.join(out, "ads.txt")), "no ads.txt before AdSense is set up");
  assert.match(read("movies/index.html"), /abcdefghijk/, "trailers & songs on the Movies page");
  fs.rmSync(tmp, { recursive: true, force: true });
});
