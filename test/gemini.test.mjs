// Gemini requests: a model that refuses a setting (HTTP 400) gets a simpler request,
// and Google being busy (503) never counts against the stories.
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_MODEL = "lite-model,big-model";
const { requestBody, sortBody, parseAnswer, summarize, sortHeadlines, requestShapes, quotaOf, QuotaError, VARIANTS } = await import("../scripts/lib/gemini.mjs");

const story = { sourceName: "Amar Ujala", stateHint: "Uttar Pradesh", districtHint: "barabanki", tehsilHint: "", publishedIST: "3 Nov 2026, 1:42 am", title: "Pond auctioned", text: "The pond was auctioned for 1.53 crore." };
const side = (h) => ({ h, what: "a", who: "b", whom: "c", whose: "d", where: "e", when: "f", why: "g", which: "h", how: "i" });
const answer = { stories: [{ n: 1, hi: side("तालाब नीलाम"), en: side("Pond auctioned"), groups: ["business"], good: false, importance: 3, scope: "local", country: "India", state: "Uttar Pradesh", district: "Barabanki", tehsil: "", place: "Zaidpur", place_hi: "जैदपुर", district_hi: "बाराबंकी", same_as: 0 }] };
const ok = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const err = (status, message) => new Response(JSON.stringify({ error: { code: status, message } }), { status });

test("request shapes get simpler step by step", () => {
  assert.equal(VARIANTS, 3);
  const [v0, v1, v2] = [0, 1, 2].map((v) => requestBody([story], v));
  assert.ok(v0.generationConfig.thinkingConfig && v0.generationConfig.responseSchema);
  assert.ok(!v1.generationConfig.thinkingConfig && v1.generationConfig.responseSchema);
  assert.ok(!v2.generationConfig.thinkingConfig && !v2.generationConfig.responseSchema);
  assert.match(v2.systemInstruction.parts[0].text, /Reply with JSON only/);
  assert.match(v0.contents[0].parts[0].text, /Story 1[\s\S]*Pond auctioned/);
});

test("answers wrapped in ``` or with extra words are still read", () => {
  assert.deepEqual(parseAnswer('```json\n{"stories":[]}\n```'), { stories: [] });
  assert.deepEqual(parseAnswer('Here it is: {"stories":[1]} Thanks'), { stories: [1] });
  assert.throws(() => parseAnswer("no json here"));
});

test("400 'invalid argument' -> the same model is asked again with a simpler request", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ model: url.match(/models\/([^:]+)/)[1], thinking: !!body.generationConfig.thinkingConfig });
    return calls.length === 1 ? err(400, "Request contains an invalid argument.") : ok(answer);
  };
  const out = await summarize([story]);
  assert.equal(out.model, "lite-model");
  assert.equal(out.variant, 1);
  assert.equal(out.results[0].en.h, "Pond auctioned");
  assert.deepEqual(calls.map((c) => [c.model, c.thinking]), [["lite-model", true], ["lite-model", false]]);
  assert.deepEqual(out.usage, { in: 0, out: 0, think: 0 }, "no token counts in this answer");
});

test("the tokens of every request are counted (what a paid plan bills)", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }], usageMetadata: { promptTokenCount: 1480, candidatesTokenCount: 390, thoughtsTokenCount: 120, totalTokenCount: 1990 } }), { status: 200 });
  const out = await summarize([story]);
  assert.deepEqual(out.usage, { in: 1480, out: 390, think: 120 });
});

test("only the site's groups: 'other' means not news for this site", async () => {
  const body = requestBody([story], 1);
  const choices = body.generationConfig.responseSchema.properties.stories.items.properties.groups.items.enum;
  assert.ok(choices.includes("politics") && choices.includes("scams") && choices.includes("other"));
  assert.ok(!choices.includes("cricket") && !choices.includes("movies") && !choices.includes("local"));
  assert.match(body.systemInstruction.parts[0].text, /give \["other"\]/);
  globalThis.fetch = async () => ok({ stories: [{ ...answer.stories[0], groups: ["other"] }] });
  assert.deepEqual((await summarize([story])).results[0].groups, [], "a story Gemini calls 'other' has none of the site's groups");
});

test("sorting: many headlines in one request, each into the site's groups or 'other'", async () => {
  const items = [{ text: "सेंसेक्स 800 अंक चढ़ा" }, { text: "कोहली का शतक, भारत जीता" }, { text: "PM Kisan की नई किस्त" }, { text: "skipped one" }];
  const b = sortBody(items, 1);
  assert.match(b.contents[0].parts[0].text, /^1\. सेंसेक्स 800 अंक चढ़ा\n2\. कोहली/);
  assert.match(b.systemInstruction.parts[0].text, /- stock-market: Stock Market/);
  globalThis.fetch = async () => ok({ items: [{ n: 1, g: ["stock-market", "business"] }, { n: 2, g: ["other"] }, { n: 3, g: ["govt-schemes", "farming", "cricket"] }] });
  const r = await sortHeadlines(items);
  assert.deepEqual(r.groups, [["stock-market", "business"], [], ["govt-schemes", "farming"], null], "'other' -> [], unknown groups dropped, a skipped item -> null");
});

test("a per-minute 429 is not the daily free limit", () => {
  const body = (quotaId, quotaValue) => JSON.stringify({ error: { code: 429, message: "You exceeded your current quota", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId, quotaValue }] }] } });
  assert.deepEqual(quotaOf(body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "500")), { id: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", value: "500" });
  assert.deepEqual(quotaOf(body("GenerateContentInputTokensPerModelPerMinute-FreeTier", "250000")).id, "GenerateContentInputTokensPerModelPerMinute-FreeTier");
  assert.deepEqual(quotaOf("not json"), { id: "", value: "" });
});

test("the request shape a model accepts is remembered between runs", () => {
  assert.equal(requestShapes.get()["lite-model"], 1, "lite-model refused shape 0 earlier in this file");
  requestShapes.set({ "big-model": 2, "bad-model": 9 });
  assert.equal(requestShapes.get()["big-model"], 2);
  assert.equal(requestShapes.get()["bad-model"], undefined, "a shape that doesn't exist is ignored");
  requestShapes.set({ "big-model": 0 });
});

test("busy (503) -> waits, retries once, then the next model; free limit (429) -> QuotaError", async () => {
  const seen = [];
  globalThis.fetch = async (url) => {
    const model = url.match(/models\/([^:]+)/)[1];
    seen.push(model);
    return model === "lite-model" ? err(429, "quota") : ok(answer);
  };
  const out = await summarize([story]);
  assert.equal(out.model, "big-model");
  globalThis.fetch = async () => err(429, "quota");
  await assert.rejects(() => summarize([story]), QuotaError);
});
