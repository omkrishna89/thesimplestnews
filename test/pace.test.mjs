// Gemini's free limit spread over the whole day (Google's day starts at midnight in California)
import assert from "node:assert/strict";
import { test } from "node:test";
import { googleDay, learnLimit, msToReset, runBudget } from "../scripts/lib/pace.mjs";

test("Google's day and the time until it starts again", () => {
  assert.equal(googleDay(Date.parse("2026-11-07T07:59:00Z")), "2026-11-06", "11:59 PM in California");
  assert.equal(googleDay(Date.parse("2026-11-07T08:00:00Z")), "2026-11-07", "midnight in California = 1:30 PM in India");
  assert.equal(msToReset(Date.parse("2026-11-07T16:00:00Z")), 16 * 3600e3, "8 AM in California: 16 hours left");
  assert.equal(msToReset(Date.parse("2026-11-08T07:30:00Z")), 30 * 60e3);
});

test("each run gets its share of what is left today", () => {
  assert.equal(runBudget({ limit: 420, used: 0, msLeft: 24 * 3600e3 }), 8, "48 runs left: 420 / 48");
  assert.equal(runBudget({ limit: 420, used: 400, msLeft: 3600e3 }), 10, "2 runs left: 20 / 2");
  assert.equal(runBudget({ limit: 420, used: 0, msLeft: 20 * 60e3 }), 420, "the last run may use the rest");
  assert.equal(runBudget({ limit: 420, used: 430, msLeft: 3600e3 }), 0);
});

test("the free limit is learned", () => {
  assert.equal(learnLimit(420, { hit: true, req: 300 }), 300, "the limit was reached after 300 requests");
  assert.equal(learnLimit(420, { hit: false, req: 400 }), 462, "nearly all used without reaching it: try 10% more");
  assert.equal(learnLimit(420, { hit: false, req: 100 }), 420, "a quiet day says nothing");
  assert.equal(learnLimit(420, undefined), 420);
});
