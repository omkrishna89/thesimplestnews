// Google Analytics: only with a real Measurement ID, loaded after the page; the Privacy Policy tells readers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { gaSnippet } from "../scripts/lib/pages.mjs";
import { HELP_PAGES } from "../scripts/lib/help-pages.mjs";

test("Google Analytics loads only with a real Measurement ID, after the page has loaded", () => {
  assert.equal(gaSnippet(""), "");
  assert.equal(gaSnippet(undefined), "");
  assert.equal(gaSnippet('G-1"><script>alert(1)</script>'), "", "anything odd is refused");
  const s = gaSnippet("G-AB12CD34EF", "thesimplestnews.com");
  assert.match(s, /gtag\("config","G-AB12CD34EF"\)/);
  assert.match(s, /addEventListener\("load"/);
  assert.match(s, /googletagmanager\.com\/gtag\/js\?id=G-AB12CD34EF/);
});

test("Google Analytics counts visits only on the site's own address", () => {
  const s = gaSnippet("G-AB12CD34EF", "thesimplestnews.com");
  const runsOn = (hostname) => {
    let loaded = false;
    const location = { hostname };
    const window = {};
    const dataLayer = [];
    const addEventListener = () => (loaded = true);
    // the snippet's own code, with this page's address
    new Function("location", "window", "dataLayer", "addEventListener", s.replace(/^<script>|<\/script>$/g, ""))(location, window, dataLayer, addEventListener);
    return loaded;
  };
  assert.equal(runsOn("thesimplestnews.com"), true);
  assert.equal(runsOn("www.thesimplestnews.com"), true);
  assert.equal(runsOn("localhost"), false, "a test copy on this computer");
  assert.equal(runsOn("thesimplestnews.com.example.org"), false);
});

test("the Privacy Policy mentions Google Analytics only when it is on", () => {
  const site = { email: "contact@thesimplestnews.com", domain: "thesimplestnews.com" };
  const privacy = (s) => HELP_PAGES(s).find((p) => p.slug === "privacy");
  assert.doesNotMatch(privacy(site).en, /Google Analytics/);
  const on = privacy({ ...site, analytics: { ga4: "G-AB12CD34EF" } });
  assert.match(on.en, /Visitor statistics \(Google Analytics\)/);
  assert.match(on.hi, /Google Analytics/);
  assert.match(on.en, /gaoptout/, "how to turn it off");
});
