// The editor's fixes for wrong stories (config/corrections.json).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { readCorrections, storyId } from "../scripts/lib/corrections.mjs";

test("corrections: a story is named by its address or its id", () => {
  assert.equal(storyId("https://thesimplestnews.com/story/96665c1da439/"), "96665c1da439");
  assert.equal(storyId("thesimplestnews.com/story/96665c1da439"), "96665c1da439");
  assert.equal(storyId(" 96665c1da439 "), "96665c1da439");
  assert.equal(storyId("https://thesimplestnews.com/"), "", "not a story's address");
  assert.equal(storyId(undefined), "");
});

test("corrections: remove a story, or show a note in both languages", () => {
  const { remove, notes } = readCorrections({
    list: [
      { story: "https://thesimplestnews.com/story/aaa111/", remove: true },
      { story: "bbb222", note_en: "The district is Barabanki.", note_hi: "ज़िला बाराबंकी है।", date: "17 Nov 2026" },
      { story: "ccc333", note_en: "Only in English." },
      { story: "not a link", remove: true },
      null,
    ],
  });
  assert.deepEqual([...remove], ["aaa111"]);
  assert.deepEqual(notes.get("bbb222"), { en: "The district is Barabanki.", hi: "ज़िला बाराबंकी है।", date: "17 Nov 2026" });
  assert.equal(notes.get("ccc333").hi, "Only in English.", "a note in one language shows in both");
  assert.equal(readCorrections(null).remove.size, 0);
});

test("corrections: the site's own file is valid and starts empty", () => {
  const cfg = JSON.parse(fs.readFileSync(new URL("../config/corrections.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(cfg.list));
});
