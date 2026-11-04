// The search box: forgiving spellings, rare words first, short forms, and the helpers for other news websites.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanTitle, foldText, gdeltItems, gdeltQuery, gdeltTime, googleNewsUrl, parseQuery, rank, spellings, titleMatches } from "../src/assets/js/search.js";
import { itemHTML } from "../src/assets/js/ui.js";

const same = (a, b) => assert.equal(foldText(a), foldText(b), `${a} = ${b}`);

test("common Indian spellings of a word fold together", () => {
  same("Cockroach Janata Party", "cockroach janta party");
  same("Bharatiya", "Bhartiya");
  same("Aadmi", "Admi");
  same("Mamata", "Mamta");
  same("Lakshmi", "Laxmi");
  same("Chennai", "Chenai");
  same("Gaurav", "Gourav");
  same("Vishwas", "Vishvas");
  same("café", "cafe");
  same("ज़िला", "जिला");
  same("हिन्दी", "हिंदी");
  same("कॉकरोच", "कोकरोच");
  same("पार्टी", "पार्टि");
  assert.notEqual(foldText("Mata"), foldText("Mamta"), "the first syllable keeps its 'a'");
  assert.notEqual(foldText("2000"), foldText("200"), "numbers stay as they are");
});

const story = (i, h, s = "") => ({ i, h, s, t: 1793700000, sc: "country", p: ["", "", "", ""] });
const found = (items, q) => [...rank(items, parseQuery(q)).tiers.keys()].map((x) => x.i).sort();

test("Cockroach Janta Party: spelling forgiven, CJP found, other cockroaches and BJP left out", () => {
  const items = [
    story("cjp1", "Cockroach Janta Party backs INDIA bloc's rally"),
    story("cjp2", "CJP leaders appear before Delhi court"),
    story("cjp3", "Police detain protesters", "The Cockroach Janta Party called the march"),
    story("bug", "Cockroach found in sweets in Shimla"),
    story("bjp", "Bharatiya Janata Party wins the ward election"),
    ...Array.from({ length: 300 }, (_, k) => story(`p${k}`, `Party news number ${k}`)),
  ];
  assert.deepEqual(found(items, "cockroach janata party"), ["cjp1", "cjp2", "cjp3"]);
  assert.deepEqual(found(items, "CJP"), ["cjp1", "cjp2", "cjp3"], "the short form also finds the full name");
  assert.deepEqual(found(items, "cockroch"), ["bug", "cjp1", "cjp3"], "a typing mistake is forgiven");
  assert.deepEqual(found(items, "कॉकरोच"), [], "Hindi words find Hindi stories only");
});

test("a common word may be missing; stories with more of the words come first", () => {
  const items = [
    story("r1", "Heavy rain in Delhi, traffic slow"),
    story("r2", "Rain lashes Mumbai"),
    story("r3", "Rains hit Kerala farmers"),
    ...Array.from({ length: 200 }, (_, k) => story(`d${k}`, `Delhi update ${k}`)),
  ];
  const r = rank(items, parseQuery("delhi rain"));
  const list = [...r.tiers].sort((a, b) => b[1] - a[1]).map(([it]) => it.i);
  assert.deepEqual(list.slice().sort(), ["r1", "r2", "r3"], "'delhi' is common, 'rain' is rare");
  assert.equal(list[0], "r1", "the story with both words is first");
});

test("a word no story has finds nothing (not other companies' share prices)", () => {
  const items = [story("a", "SBI share price target"), story("b", "Titan Company Share Price Live Updates")];
  assert.deepEqual(found(items, "tcs share price"), []);
  assert.deepEqual(found(items, "TCS"), [], "Title Case headlines are not read as short forms");
});

test("short forms with vowels must be exact: AAP is not AP", () => {
  const items = [story("aap", "AAP and BJP clash over pollution"), story("ap", "AP government starts new scheme"), story("full", "Aam Aadmi Party MLA joins BJP")];
  assert.deepEqual(found(items, "aam aadmi party"), ["aap", "full"]);
  assert.deepEqual(found(items, "AAP"), ["aap"]);
});

test("other news websites: GDELT search words, headlines and links", () => {
  assert.deepEqual(spellings("janata"), ["janata", "janta"]);
  assert.deepEqual(spellings("party"), ["party"]);
  assert.equal(gdeltQuery(parseQuery("cockroach janata party"), "en"), "cockroach (janata OR janta) party sourcelang:english");
  assert.equal(gdeltQuery(parseQuery("CJP news"), "hi"), "cjp (sourcelang:hindi OR sourcelang:english)");
  assert.equal(gdeltQuery(parseQuery("कॉकरोच जनता पार्टी"), "hi"), "", "GDELT can't search Hindi letters");
  assert.equal(cleanTitle("India 's vote , explained : why ( and how )"), "India's vote, explained: why (and how)");
  assert.equal(gdeltTime("20261026T071500Z"), Date.UTC(2026, 9, 26, 7, 15) / 1000);
  const q = parseQuery("cockroach janata party");
  assert.ok(titleMatches("CJP leaders freed from jail", q));
  assert.ok(!titleMatches("42 % of recent college grads work jobs that dont need a degree", q));
  const items = gdeltItems(
    {
      articles: [
        { url: "https://www.dw.com/a", title: "India : 'Cockroaches' back Gandhi 's rally", domain: "dw.com", seendate: "20261025T110000Z" },
        { url: "https://other.example/a", title: "India : 'Cockroaches' back Gandhi 's rally", domain: "other.example", seendate: "20261025T110000Z" },
        { url: "https://fortune.com/x", title: "42 % of recent college grads", domain: "fortune.com", seendate: "20261026T071500Z" },
        { url: "javascript:alert(1)", title: "CJP" },
      ],
    },
    q,
  );
  assert.deepEqual(items, [{ h: "India: 'Cockroaches' back Gandhi's rally", u: "https://www.dw.com/a", src: "dw.com", t: Date.UTC(2026, 9, 25, 11) / 1000 }], "same headline once, only about the search, only web links");
  assert.equal(googleNewsUrl("cockroach janta party", "hi"), "https://news.google.com/search?q=cockroach%20janta%20party&hl=hi&gl=IN&ceid=IN:hi");
});

test("an old story the AI never wrote doesn't say 'summary coming soon'", () => {
  const now = Date.now();
  const ctx = { base: "", proxy: "", now, icon: () => "📰" };
  const it = (hours) => ({ i: "x", h: "Headline", u: "https://news.example/x", src: "Site", t: Math.round(now / 1000 - hours * 3600), g: [] });
  assert.match(itemHTML(it(2), "en", ctx), /Short summary coming soon/);
  assert.doesNotMatch(itemHTML(it(40), "en", ctx), /coming soon/);
});
