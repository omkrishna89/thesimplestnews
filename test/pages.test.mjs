// Settings in config/site.json that go into every page: Google Search Console's code and the simple-headlines Worker.
import assert from "node:assert/strict";
import { test } from "node:test";
import { makePages } from "../scripts/lib/pages.mjs";

const make = (extra = {}) =>
  makePages({
    site: { name: { en: "The Simplest News", hi: "द सिंपलेस्ट न्यूज़" }, tagline: { en: "t", hi: "t" }, domain: "thesimplestnews.com", ...extra },
    groups: [],
    base: "",
    assets: { css: "/a.css", js: "/a.js" },
    siteUrl: "https://thesimplestnews.com",
  });
const html = (P) => P.page({ title: "Home", description: "d", path: "/" }, "<main></main>", "all");

test("pages: Search Console's code and the Worker's address, only when they are set and look right", () => {
  const on = html(make({ searchConsole: { verification: "AbC123_xyz-987654" }, rewrite: { url: "https://simple-headlines.someone.workers.dev" } }));
  assert.match(on, /<meta name="google-site-verification" content="AbC123_xyz-987654">/);
  assert.match(on, /<body [^>]*data-rewrite="https:\/\/simple-headlines\.someone\.workers\.dev"/);

  const off = html(make({ searchConsole: { verification: "" }, rewrite: { url: "" } }));
  assert.doesNotMatch(off, /google-site-verification|data-rewrite/);

  const bad = html(make({ searchConsole: { verification: '"><script>' }, rewrite: { url: "http://not-https.example" } }));
  assert.doesNotMatch(bad, /google-site-verification|data-rewrite|<script>"/, "a wrong value is left out");
});
