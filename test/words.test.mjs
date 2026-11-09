// Clear words in a headline put a story into a group before the AI has written it (config/words.json).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { groupsFromWords, wordTest } from "../scripts/lib/words.mjs";

const has = (title, group) => groupsFromWords(title).includes(group);

test("clear words find their group", () => {
  assert.ok(has("द बोनस मार्केट अपडेट: सेंसेक्स 1225 अंक चढ़ा, निफ्टी 23400 के पार", "stock-market"));
  assert.ok(has("Mahanadi Coalfields IPO: नवंबर में आ सकता है इश्यू", "stock-market"));
  assert.ok(has("SBI Recruitment 2026: Apply Online for 60 Posts", "jobs"));
  assert.ok(has("AI से काम लेना ही काफी नहीं", "ai"));
  assert.ok(has("ISRO to launch Gaganyaan test flight", "science"));
  assert.ok(has("सोने-चांदी के दाम आज फिर बढ़े", "gold-silver"));
  assert.ok(has("स्टार्टअप ने जुटाए 50 करोड़", "startup"));
  assert.ok(has("साइबर ठगों ने बुजुर्ग से 20 लाख ठगे", "scams"));
  assert.ok(has("Digital arrest scam: retired teacher loses ₹50 lakh", "scams"));
});

test("look-alike words don't", () => {
  assert.ok(!has("शाहरुख खान बर्थडे: पुरानी तस्वीर शेयर करते हुए अजय देवगन ने किया विश", "stock-market"), "शेयर करना = to share a photo");
  assert.ok(!has("बुजुर्ग को अस्पताल में भर्ती कराया गया", "jobs"), "अस्पताल में भर्ती = admitted to hospital");
  assert.ok(!has("AIIMS doctors begin strike", "ai"), "AI inside AIIMS");
  assert.ok(!has("Mandi district: landslide blocks highway", "farming"), "Mandi is also a district");
  assert.ok(!has("गोल्ड मेडल जीतकर लौटीं पहलवान", "gold-silver"), "a gold medal is sports");
  assert.deepEqual(groupsFromWords("सड़क हादसे में दो युवकों की मौत"), [], "road accidents are not one of the site's groups");
});

test("words in CAPITALS match exactly, others ignore case", () => {
  const t = wordTest(["AI", "stock market"]);
  assert.ok(t("New AI rules") && t("STOCK MARKET today") && t("Stock Market today"));
  assert.ok(!t("said the aide"), "'ai' in lower case is not AI");
});

test("company names: 'self-reliance' is not Reliance, but 'Reliance-backed' is", () => {
  const reliance = wordTest(["Reliance", "RIL", "रिलायंस"], { names: true });
  assert.ok(!reliance("To achieve self-reliance in defence technology"));
  assert.ok(reliance("Reliance-backed Jio plans a listing"));
  assert.ok(reliance("रिलायंस के शेयर चढ़े"));
  assert.ok(reliance("RIL shares rise"));
});

test("every word in config/words.json is valid and belongs to a real group", () => {
  const groups = new Set(JSON.parse(fs.readFileSync(new URL("../config/groups.json", import.meta.url))).list.map((g) => g.slug));
  const words = JSON.parse(fs.readFileSync(new URL("../config/words.json", import.meta.url))).groups;
  for (const [g, list] of Object.entries(words)) {
    assert.ok(groups.has(g), `${g} is a group`);
    assert.doesNotThrow(() => wordTest(list), `${g}: words are valid`);
  }
});

test("every stock in config/stocks.json has names and valid search words", () => {
  const list = JSON.parse(fs.readFileSync(new URL("../config/stocks.json", import.meta.url))).list;
  assert.ok(list.length >= 100);
  assert.equal(new Set(list.map((s) => s.s)).size, list.length, "symbols are unique");
  for (const s of list) {
    assert.ok(s.s && s.en && s.hi && s.k?.length, `${s.s} has names and words`);
    // the browser builds its test without look-behind (older iPhones): (?:^|edge)(?:words)(?=$|edge)
    assert.doesNotThrow(() => new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])(?:${s.k.join("|")})(?=$|[^\\p{L}\\p{M}\\p{N}])`, "iu"), s.s);
  }
});
