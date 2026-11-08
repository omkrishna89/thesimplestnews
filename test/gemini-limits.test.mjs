// The free limit is planned for the main model. A stand-in model's own small limit (one allows only 20 requests a
// day) must not be taken for it: that stopped every run for a night.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_MODEL = "main-model,stand-in";
const { summarize, dailyLimitOf, QuotaError, PRIMARY } = await import("../scripts/lib/gemini.mjs");

const story = { sourceName: "Amar Ujala", stateHint: "", districtHint: "", tehsilHint: "", publishedIST: "3 Nov 2026, 1:42 am", title: "Pond auctioned", text: "The pond was auctioned." };
const perDay = (value) =>
  new Response(JSON.stringify({ error: { code: 429, message: "You exceeded your current quota", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: String(value) }] }] } }), { status: 429 });

test("main model busy + stand-in at its own limit = Gemini is busy, not out of the free limit", async () => {
  globalThis.fetch = async (url) => (url.includes("main-model") ? new Response(JSON.stringify({ error: { code: 500, message: "internal" } }), { status: 500 }) : perDay(20));
  const e = await summarize([story]).catch((x) => x);
  assert.ok(e instanceof Error && !(e instanceof QuotaError), `a plain error: ${e.message}`);
  assert.equal(PRIMARY, "main-model");
  assert.equal(dailyLimitOf("main-model"), undefined, "the main model's limit is not touched");
  assert.deepEqual(dailyLimitOf("stand-in"), { value: 20 });
});

test("the main model's own daily limit is recorded with Google's number", async () => {
  globalThis.fetch = async () => perDay(500);
  await assert.rejects(() => summarize([story]), QuotaError);
  assert.deepEqual(dailyLimitOf("main-model"), { value: 500 });
});
