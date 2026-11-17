// The free Cloudflare Worker that writes other websites' headlines in simple words (worker/rewrite.js),
// with a pretend Google: which Gemma model it picks, what it asks, how it reads the answer, and who may use it.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../worker/rewrite.js";

const SITE = "https://thesimplestnews.com";
const env = { GEMINI_API_KEY: "test-key" };
const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

const MODELS = {
  models: [
    { name: "models/gemini-flash-lite-latest", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-3-4b-it", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-3n-e4b-it", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemma-3-27b-it", supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/gemma-3-12b-it", supportedGenerationMethods: ["generateContent"] },
    { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
  ],
};
// a pretend Google: answers the list of models, and every headline request with answer(prompt)
function google(answer, { status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, opts });
    assert.equal(opts.headers?.["x-goog-api-key"], "test-key", "the key goes in a header, never in the address");
    if (u.includes("/models?")) return new Response(JSON.stringify(MODELS));
    if (status !== 200) return new Response("{}", { status });
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

test("Worker: the biggest, newest Gemma writes the headlines; Gemini's own limit is not used", async () => {
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
  assert.match(ask.url, /models\/gemma-3-27b-it:generateContent$/);
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
  assert.match(ok.data, /gemma-3-27b-it/);
  const no = await run(new Request("https://simple.example.workers.dev/"), {});
  assert.match(no.data, /❌ Not ready: add the secret GEMINI_API_KEY/);
  // a model named in GEMMA_MODEL is used as it is
  const calls = google(() => '["Simple"]');
  await run(post({ lang: "en", items: ["A headline for the chosen model"] }), { ...env, GEMMA_MODEL: "gemma-3-12b-it" });
  assert.match(calls.at(-1).url, /models\/gemma-3-12b-it:generateContent$/);
});
