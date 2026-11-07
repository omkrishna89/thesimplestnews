// Google Gemini (free tier) writes, for a batch of stories, in Hindi AND English:
// the shortest simple headline and short answers to 9 questions, plus groups, place and importance.
import { config, log, sleep } from "./util.mjs";

export const QUESTIONS = ["what", "who", "whom", "whose", "where", "when", "why", "which", "how"];
export const NOT_SAID = { en: "Not mentioned", hi: "जानकारी नहीं" };
const SCOPES = ["local", "tehsil", "district", "state", "country", "world"];

const site = config("site.json");
const GROUPS = config("groups.json").list.map((g) => g.slug).filter((s) => s !== "local");
const KEY = process.env.GEMINI_API_KEY || "";
const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MODELS = (process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.split(",") : site.gemini.models).map((m) => m.trim()).filter(Boolean);

export class QuotaError extends Error {}
export const hasKey = () => !!KEY;

const answerSchema = {
  type: "OBJECT",
  properties: { h: { type: "STRING" }, ...Object.fromEntries(QUESTIONS.map((q) => [q, { type: "STRING" }])) },
  required: ["h", ...QUESTIONS],
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    stories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "INTEGER" },
          hi: answerSchema,
          en: answerSchema,
          groups: { type: "ARRAY", items: { type: "STRING", enum: GROUPS } },
          good: { type: "BOOLEAN" },
          importance: { type: "INTEGER" },
          scope: { type: "STRING", enum: SCOPES },
          country: { type: "STRING" },
          state: { type: "STRING" },
          district: { type: "STRING" },
          tehsil: { type: "STRING" },
          place: { type: "STRING" },
          place_hi: { type: "STRING" },
          district_hi: { type: "STRING" },
          same_as: { type: "INTEGER" },
        },
        required: ["n", "hi", "en", "groups", "good", "importance", "scope", "country", "state", "district", "tehsil", "place", "place_hi", "district_hi", "same_as"],
      },
    },
  },
  required: ["stories"],
};

const SYSTEM = `You are the editor of "The Simplest News", an Indian news website that explains every story in the shortest and simplest words, in Hindi and in English, for people who read on their phones.

For every story you get, write:
1. "h": the shortest possible headline. English: at most 8 words. Hindi: at most 10 words. Use very simple everyday words that a 10-year-old understands. No clickbait, no "BREAKING", no question headlines.
2. Short answers to these 9 questions, in both languages:
   what = what happened; who = who did it or who is involved; whom = to whom it happened or who is affected; whose = whose thing, money, land, team or responsibility it is; where = the place; when = the day or time; why = the reason; which = which exact thing (scheme, team, vehicle, exam, company, department...); how = how it happened or how to do it.
   Each answer is ONE short simple sentence (at most 15 words). Use only facts from the story text. Never guess or add facts.
   If the story does not say it, write exactly "${NOT_SAID.en}" in English and "${NOT_SAID.hi}" in Hindi.
3. Hindi = simple spoken Hindi in Devanagari (common English words like IPL, UPI, GST, AI, SUV are fine). English = plain simple English.
4. "groups": 1 to 3 groups from the list, best first. "accidents" is only for road accidents. "good-news" only for clearly happy or hopeful news. "politics" for elections, parties and leaders.
5. "good": true only if the story is clearly good news.
6. "importance" 1-10: 9-10 = huge news for all India; 7-8 = big national or state news; 4-6 = normal news; 1-3 = small local or minor news.
7. "scope": where the news matters: local (one village, town or city area), tehsil, district, state, country (all India), world (outside India).
8. Place of the event in English standard spelling: "country", "state", "district" (official current district name, e.g. Prayagraj, Gurugram, Kanpur Nagar), "tehsil" (tehsil or block if known), "place" (the most specific place: village, town, city or area). Use "" when unknown. "place_hi" and "district_hi": the same names in Hindi.
9. "same_as": if a story is about the same event as an earlier story number in this batch, give that number, else 0.

Reply with JSON {"stories":[...]} with exactly one entry for every story, using its number "n".`;

function storyBlock(s, i) {
  const where = [s.tehsilHint, s.districtHint, s.stateHint].filter(Boolean).join(", ");
  return [
    `### Story ${i + 1}`,
    `Source: ${s.sourceName}${where ? ` (from its ${where} news page)` : ""}`,
    `Published: ${s.publishedIST}`,
    `Title: ${s.title}`,
    `Text: ${s.text || s.title}`,
  ].join("\n");
}

// Different Gemini models accept different settings, and Google answers only "invalid argument" (400)
// when one is not accepted. So each model starts with the full request and, after a 400, moves on to a
// simpler one: 0 = answer format + thinking switched off, 1 = answer format only, 2 = plain JSON
// (the answer's shape is then spelled out in the instructions).
export const VARIANTS = 3;
const JSON_SHAPE = `Reply with JSON only, exactly in this shape (one entry per story):
{"stories":[{"n":1,"hi":{"h":"","what":"","who":"","whom":"","whose":"","where":"","when":"","why":"","which":"","how":""},"en":{"h":"","what":"","who":"","whom":"","whose":"","where":"","when":"","why":"","which":"","how":""},"groups":["${GROUPS[0]}"],"good":false,"importance":5,"scope":"district","country":"India","state":"","district":"","tehsil":"","place":"","place_hi":"","district_hi":"","same_as":0}]}
"groups" may only use: ${GROUPS.join(", ")}. "scope" is one of: ${SCOPES.join(", ")}.`;

export function requestBody(stories, variant = 0) {
  return {
    systemInstruction: { parts: [{ text: variant >= 2 ? `${SYSTEM}\n\n${JSON_SHAPE}` : SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: stories.map(storyBlock).join("\n\n") }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 12000,
      responseMimeType: "application/json",
      ...(variant <= 1 ? { responseSchema: SCHEMA } : {}),
      ...(variant === 0 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
}

// The answer as JSON, even when Gemini wraps it in ``` fences or adds a sentence around it
export function parseAnswer(raw) {
  const s = String(raw || "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("answer is not JSON");
  }
}

const variantOf = new Map(); // model -> request shape that works for it in this run
const broken = new Set(); // models that refused every request shape in this run

async function callModel(model, stories) {
  for (;;) {
    const variant = variantOf.get(model) || 0;
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify(requestBody(stories, variant)),
      signal: AbortSignal.timeout(150000),
    });
    const text = await res.text();
    if (res.status === 429) throw new QuotaError(`${model}: free limit reached (429) ${text.slice(0, 200)}`);
    if (res.status === 400 && variant < VARIANTS - 1) {
      log(`[gemini] ${model} did not accept request shape ${variant} (${firstLine(text)}); trying a simpler one`);
      variantOf.set(model, variant + 1);
      continue;
    }
    if (res.status === 400 || res.status === 404) broken.add(model);
    if (!res.ok) {
      const err = new Error(`${model}: HTTP ${res.status} ${firstLine(text)}`);
      err.status = res.status;
      throw err;
    }
    const json = JSON.parse(text);
    const raw = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    const out = parseAnswer(raw);
    if (!Array.isArray(out.stories)) throw new Error(`${model}: answer has no stories`);
    return { stories: out.stories, variant, usage: tokens(json.usageMetadata) };
  }
}

// How many tokens a request used (Google bills by these): what we sent, the answer, and Gemini's own thinking
export const tokens = (u = {}) => ({ in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0, think: u.thoughtsTokenCount || 0 });

const firstLine = (text) => {
  try {
    return JSON.parse(text).error?.message?.slice(0, 160) || text.slice(0, 160);
  } catch {
    return String(text).replace(/\s+/g, " ").slice(0, 160);
  }
};

const outOfQuota = new Set();

// Returns { model, variant, results, usage } — results in the same order as `stories`, null where Gemini skipped one;
// usage = the tokens this request used. Throws QuotaError when every model's free limit is used up, or the last
// error when no model could answer.
export async function summarize(stories) {
  let lastErr;
  for (const model of MODELS) {
    if (outOfQuota.has(model) || broken.has(model)) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { stories: answer, variant, usage } = await callModel(model, stories);
        return { model, variant, usage, results: stories.map((_, i) => clean(answer.find((a) => Number(a.n) === i + 1))) };
      } catch (err) {
        lastErr = err;
        if (err instanceof QuotaError) {
          outOfQuota.add(model);
          log(`[gemini] ${err.message.slice(0, 160)}`);
          break;
        }
        log(`[gemini] ${String(err.message).slice(0, 200)}`);
        if (broken.has(model)) break;
        // "high demand" (503), a timeout or a broken answer: wait a little and try once more
        if (attempt === 1) await sleep(err.status === 503 ? 15000 : 4000);
      }
    }
  }
  if (MODELS.every((m) => outOfQuota.has(m) || broken.has(m)) && MODELS.some((m) => outOfQuota.has(m))) {
    throw new QuotaError("every model reached its free limit");
  }
  throw lastErr || new Error("no model available");
}

const tidy = (s, max) => {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : s;
};

function side(a, lang) {
  if (!a || typeof a !== "object") return null;
  const h = tidy(a.h, 110).replace(/^["'“]|["'”]$/g, "");
  if (h.length < 4) return null;
  const q = QUESTIONS.map((k) => tidy(a[k], 220) || NOT_SAID[lang]);
  return { h, q };
}

export function clean(a) {
  if (!a) return null;
  const hi = side(a.hi, "hi");
  const en = side(a.en, "en");
  if (!hi || !en) return null;
  const imp = Math.max(1, Math.min(10, Math.round(Number(a.importance) || 4)));
  return {
    hi,
    en,
    groups: [...new Set((a.groups || []).filter((g) => GROUPS.includes(g)))].slice(0, 3),
    good: a.good === true,
    imp,
    scope: SCOPES.includes(a.scope) ? a.scope : "",
    place: {
      country: tidy(a.country, 60),
      state: tidy(a.state, 60),
      district: tidy(a.district, 60),
      tehsil: tidy(a.tehsil, 60),
      local: tidy(a.place, 80),
      local_hi: tidy(a.place_hi, 80),
      district_hi: tidy(a.district_hi, 60),
    },
    sameAs: Number(a.same_as) > 0 ? Number(a.same_as) : 0,
  };
}
