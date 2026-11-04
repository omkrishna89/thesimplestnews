// Gemini's free limit allows only some stories per run: the biggest first, then a fair share for every group.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pickForAI, shareOf } from "../scripts/lib/pick.mjs";

const now = Date.UTC(2026, 10, 4, 2, 0);
let n = 0;
const story = (extra) => ({ id: `s${n++}`, s: "new", tr: 0, p: now - 3600e3, pr: 7, lv: "country", src: "national", ...extra });

test("the biggest stories first, then every group, state and district gets a share", () => {
  const waiting = [
    ...Array.from({ length: 40 }, (_, i) => story({ src: `national-${i % 8}`, pr: 8 })),
    ...Array.from({ length: 10 }, () => story({ src: "markets", pr: 6, gh: ["stock-market"] })),
    ...Array.from({ length: 10 }, () => story({ src: "jobs", pr: 6, gh: ["jobs"] })),
    ...Array.from({ length: 10 }, () => story({ src: "world-news", pr: 6, lv: "world" })),
    ...Array.from({ length: 12 }, (_, i) => story({ src: `city-${i}`, pr: 4, lv: "district", st: "up", d: i < 6 ? "lucknow" : `d${i}` })),
    ...Array.from({ length: 6 }, () => story({ src: "rajasthan", pr: 6, lv: "state", st: "rj" })),
  ];
  const out = pickForAI(waiting, { now, perRun: 30, topFirst: 8, perFeed: 4 });
  assert.equal(out.length, 30);
  assert.ok(out.slice(0, 8).every((s) => s.pr === 8), "the first ones are the biggest news");
  for (const share of ["stock-market", "jobs", "world", "district:up", "state:rj"]) {
    assert.ok(out.some((s) => shareOf(s) === share), `${share} gets a share`);
  }
  const perFeed = new Map();
  for (const s of out) perFeed.set(s.src, (perFeed.get(s.src) || 0) + 1);
  assert.ok([...perFeed.values()].every((c) => c <= 4), "never more than 4 from one news feed");
  assert.ok(out.filter((s) => s.d === "lucknow").length <= 2, "never more than 2 from one district");
  assert.equal(new Set(out).size, out.length, "no story twice");
});

test("with few stories waiting, all of them are written", () => {
  const waiting = [story({ src: "a" }), story({ src: "b", gh: ["cricket"] }), story({ src: "c", lv: "district", st: "br", d: "patna", pr: 4 })];
  assert.equal(pickForAI(waiting, { now, perRun: 96 }).length, 3);
});
