// The free Cloudflare Worker that writes other websites' headlines in simple words (worker/rewrite.js),
// with a pretend Google: which Gemma model it picks, what it asks, how it reads the answer, and who may use it.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../worker/rewrite.js";

const SITE = "https://thesimplestnews.com";
const env = { GEMINI_API_KEY: "test-key" };
const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

const gen = ["generateContent"];
const MODELS = {
  models: [
    { name: "models/gemini-flash-lite-latest", supportedGenerationMethods: gen },
    { name: "models/gemma-3-4b-it", supportedGenerationMethods: gen },
    { name: "models/gemma-4-e4b-it", supportedGenerationMethods: gen },
    { name: "models/gemma-3n-e4b-it", supportedGenerationMethods: gen },
    { name: "models/gemma-4-31b-it", supportedGenerationMethods: gen },
    { name: "models/gemma-3-27b-it", supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/gemma-4-26b-a4b-it", supportedGenerationMethods: gen },
    { name: "models/gemma-3-12b-it", supportedGenerationMethods: gen },
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
  ],
};
const asked = (calls) => calls.filter((c) => c.url.includes(":generateContent")).map((c) => /models\/([^:]+):/.exec(c.url)[1]);
// a pretend Google: answers the list of models, and every headline request with answer(prompt).
// per: how one model behaves instead (a status number, or "hang" = never answers)
function google(answer, { status = 200, per = {} } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts });
    assert.equal(opts.headers?.["x-goog-api-key"], "test-key", "the key goes in a header, never in the address");
    if (u.includes("/models?")) return new Response(JSON.stringify(MODELS));
    const how = per[/models\/([^:]+):/.exec(u)?.[1]] ?? status;
    if (how === "hang") {
      // like a real request that never answers: it keeps Node running until the Worker gives up on it
      const alive = setInterval(() => {}, 1000);
      return new Promise((_, reject) => opts.signal?.addEventListener("abort", () => (clearInterval(alive), reject(opts.signal.reason))));
    }
    if (how !== 200) return new Response("{}", { status: how });
    const body = JSON.parse(opts.body);
    const text = answer(body.contents[0].parts[0].text, body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  };
  return calls;
}
const post = (body, origin = SITE) => new Request("https://simple.example.workers.dev/", { method: "POST", headers: { origin, "content-type": "text/plain" }, body: JSON.stringify(body) });
const run = async (req, e = env) => {
  const r = await worker.fetch(req, e);
  return { status: r.status, headers: r.headers, data: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};

test("Worker: the fast new Gemma writes the headlines; Gemini's own limit is not used", async () => {
  const calls = google((p) => {
    assert.match(p, /at most 8 words/);
    assert.match(p, /1\. Sensex tanks 800 points as FIIs pull out amid global sell-off/);
    assert.match(p, /2\. RBI keeps repo rate unchanged at 5\.5%, says inflation under control/);
    return '```json\n["Sensex falls 800 points", "RBI keeps loan rate same."]\n```';
  });
  const r = await run(post({ lang: "en", items: ["Sensex tanks 800 points as FIIs pull out amid global sell-off", "RBI keeps repo rate unchanged at 5.5%, says inflation under control"] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, ["Sensex falls 800 points", "RBI keeps loan rate same"], "no full stop at the end");
  assert.equal(r.headers.get("access-control-allow-origin"), SITE);
  const ask = calls.find((c) => c.url.includes(":generateContent"));
  assert.match(ask.url, /models\/gemma-4-26b-a4b-it:generateContent$/, "26b-a4b: big, but only 4b work on each word, so it is quick");
  assert.equal(r.data.model, "gemma-4-26b-a4b-it");
  const body = JSON.parse(ask.opts.body);
  assert.equal(body.systemInstruction, undefined, "Gemma takes no system instruction: everything is in the message");
  assert.equal(body.generationConfig.responseMimeType, undefined, "and no JSON mode");

  // the same headline again: from memory, Google is not asked again
  const again = google(() => assert.fail("asked again"));
  const r2 = await run(post({ lang: "en", items: ["Sensex tanks 800 points as FIIs pull out amid global sell-off"] }));
  assert.deepEqual(r2.data.items, ["Sensex falls 800 points"]);
  assert.equal(again.length, 0);
});

test("Worker: Hindi headlines in Hindi letters; an answer in the wrong language, or too long, is not used", async () => {
  google(() => '1. सेंसेक्स 800 अंक गिरा\n2. RBI keeps rate same\n3. ' + "बहुत ".repeat(20).trim());
  const r = await run(post({ lang: "hi", items: ["Sensex crashes 800 pts", "RBI holds repo rate", "A very long headline about many things"] }));
  assert.deepEqual(r.data.items, ["सेंसेक्स 800 अंक गिरा", null, null]);
});

test("Worker: a busy model or one that doesn't answer in time rests, and the next one writes", async () => {
  const calls = google(() => 'Thinking: [a] or [b]? Keep it short.\n["Sensex falls", "RBI holds rate"]', { per: { "gemma-4-26b-a4b-it": 503, "gemma-4-31b-it": "hang" } });
  const fast = { ...env, TRY_MS: 50 };
  const r = await run(post({ lang: "en", items: ["Sensex tanks on heavy selling", "RBI holds repo rate steady"] }), fast);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, ["Sensex falls", "RBI holds rate"], "the last list in the answer, after the model's thinking");
  assert.deepEqual(asked(calls), ["gemma-4-26b-a4b-it", "gemma-4-31b-it", "gemma-3-27b-it"]);
  assert.equal(r.data.model, "gemma-3-27b-it");
  // the next reader: the resting models are not asked
  const next = google(() => '["Gold up"]');
  await run(post({ lang: "en", items: ["Gold price rises sharply today"] }), fast);
  assert.deepEqual(asked(next), ["gemma-3-27b-it"]);
});

test("Worker: when the answer has the wrong number of headlines, the website's own headlines stay", async () => {
  google(() => '["Only one"]');
  const r = await run(post({ lang: "en", items: ["First odd headline here", "Second odd headline here"] }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, [null, null]);
  // an unreadable answer is not remembered: the next reader's request asks again
  google(() => '["First simple", "Second simple"]');
  const r2 = await run(post({ lang: "en", items: ["First odd headline here", "Second odd headline here"] }));
  assert.deepEqual(r2.data.items, ["First simple", "Second simple"]);
});

test("Worker: Google's free limit reached = 429 and the website's own headlines", async () => {
  google(() => "", { status: 429 });
  const r = await run(post({ lang: "en", items: ["A headline when Google is busy"] }));
  assert.equal(r.status, 429);
  assert.deepEqual(r.data.items, [null]);
});

test("Worker: only for thesimplestnews.com, and only small requests", async () => {
  google(() => assert.fail("not asked"));
  assert.equal((await run(post({ lang: "en", items: ["x"] }, "https://other.example"))).status, 403);
  assert.equal((await run(post({ lang: "en", items: ["x"] }, ""))).status, 403, "no Origin (not a browser on the site)");
  assert.equal((await run(post({ lang: "en", items: Array(41).fill("x") }))).status, 400);
  assert.equal((await run(post({ lang: "en", items: [] }))).status, 400);
  assert.equal((await run(post({ lang: "en", items: [42] }))).status, 400);
  const pre = await worker.fetch(new Request("https://simple.example.workers.dev/", { method: "OPTIONS", headers: { origin: "https://www.thesimplestnews.com" } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), "https://www.thesimplestnews.com");
  const local = await run(post({ lang: "en", items: [] }, "http://localhost:8091"));
  assert.equal(local.headers.get("access-control-allow-origin"), "http://localhost:8091", "a copy of the site on this computer, for testing");
});

test("Worker: opening its address in a browser says whether it works", async () => {
  google(() => "");
  const ok = await run(new Request("https://simple.example.workers.dev/"));
  assert.match(ok.data, /✅/);
  assert.match(ok.data, /Cloudflare AI \(first\): off/);
  assert.match(ok.data, /Google Gemma \(backup\): on — models, in order: gemma-4-26b-a4b-it( \(resting\))?, gemma-4-31b-it( \(resting\))?, gemma-3-27b-it/);
  const no = await run(new Request("https://simple.example.workers.dev/"), {});
  assert.match(no.data, /❌ Not ready: add the AI binding or the GEMINI_API_KEY secret/);
  assert.equal((await run(post({ lang: "en", items: ["Nothing to ask"] }), {})).status, 500, "neither Cloudflare's AI nor a Gemini key");
  // a model named in GEMMA_MODEL is used as it is
  const calls = google(() => '["Simple"]');
  await run(post({ lang: "en", items: ["A headline for the chosen model"] }), { ...env, GEMMA_MODEL: "gemma-3-1b-it, gemma-2-9b-it" });
  assert.deepEqual(asked(calls), ["gemma-3-1b-it"], "models named in GEMMA_MODEL, in that order");
});

// a pretend Cloudflare AI (the Worker's "AI" binding): how each model answers, and what it was asked
function cloudflare(how) {
  const asked = [];
  return { asked, run: async (model, input) => (asked.push({ model, input }), how(model, input)) };
}
const noGoogle = () => (globalThis.fetch = async () => assert.fail("Google is not asked when Cloudflare's AI answers"));

test("Worker: Cloudflare's own AI writes first (when the Worker has the AI binding)", async () => {
  noGoogle();
  const AI = cloudflare(() => ({ response: '["Gold price rises", "Petrol cheaper"]' }));
  const r = await run(post({ lang: "en", items: ["Gold prices surge to record high amid global uncertainty", "Petrol, diesel prices cut by Rs 2 per litre"] }), { ...env, AI });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, ["Gold price rises", "Petrol cheaper"]);
  assert.equal(r.data.model, "@cf/mistralai/mistral-small-3.1-24b-instruct", "the fastest one, with good Hindi");
  assert.equal(AI.asked[0].input.messages[0].role, "user");
  assert.match(AI.asked[0].input.messages[0].content, /1\. Gold prices surge to record high/);
  const page = await run(new Request("https://simple.example.workers.dev/"), { ...env, AI });
  assert.match(page.data, /Cloudflare AI \(first\): on — models, in order: @cf\/mistralai\/mistral-small-3\.1-24b-instruct/);
});

test("Worker: a Cloudflare model that is gone is skipped; an answer already read as a list is fine", async () => {
  noGoogle();
  const AI = cloudflare((model) => {
    if (model === "@cf/x/gone") throw new Error("AiError: 5007: No such model @cf/x/gone");
    if (model === "@cf/x/locked") throw new Error("AiError: 5018: This account is not allowed to access @cf/x/locked.");
    return { response: ["सोना महंगा हुआ"] };
  });
  const r = await run(post({ lang: "hi", items: ["Gold rates jump again today in Delhi"] }), { ...env, AI, AI_MODEL: "@cf/x/gone, @cf/x/locked, @cf/x/works" });
  assert.deepEqual(r.data.items, ["सोना महंगा हुआ"]);
  assert.equal(r.data.model, "@cf/x/works");
  assert.deepEqual(AI.asked.map((a) => a.model), ["@cf/x/gone", "@cf/x/locked", "@cf/x/works"], "models this account can't use don't count as tries");
});

test("Worker: when Cloudflare's free allowance is used up, Google's Gemma is the backup", async () => {
  const AI = cloudflare(() => {
    throw new Error("AiError: 4006: you have used up your daily free allocation of 10,000 neurons");
  });
  const calls = google(() => '["Rupee gains"]');
  const r = await run(post({ lang: "en", items: ["Rupee rises 20 paise against US dollar in early trade"] }), { ...env, AI, AI_MODEL: "@cf/x/full" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items, ["Rupee gains"]);
  assert.match(r.data.model, /^gemma-/);
  assert.ok(asked(calls).length >= 1);
});
