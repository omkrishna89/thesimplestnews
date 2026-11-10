// Google Gemini (free tier):
//  - sorts new headlines into the site's groups (cheap: many headlines in one request), and
//  - writes, for a batch of stories, in Hindi AND English: the shortest simple headline and short answers
//    to 9 questions, plus groups, place and importance.
// The site shows only news in its groups (config/groups.json); "other" = none of them.
import { config, log, sleep } from "./util.mjs";

export const QUESTIONS = ["what", "who", "whom", "whose", "where", "when", "why", "which", "how"];
export const NOT_SAID = { en: "Not mentioned", hi: "जानकारी नहीं" };
const SCOPES = ["local", "tehsil", "district", "state", "country", "world"];

const site = config("site.json");
const GROUP_LIST = config("groups.json").list;
const GROUPS = GROUP_LIST.map((g) => g.slug);
export const OTHER = "other";
const CHOICES = [...GROUPS, OTHER];
// The same rules for sorting and for writing, so Gemini doesn't sort a story in and then find it out after writing it
const NOT_OURS = "cricket or other sports, films, TV and celebrities, other crime (theft, murder, fights) and police and court cases that are not about fraud, accidents and disasters, war, terror attacks and the army, festivals, temples and religion, horoscope, weather";
const POLITICS = `"politics" = elections, political parties, politicians and the laws and government decisions they make — not police work, festival arrangements, wars abroad or the army. "scams" = frauds that cheat people (online, cyber, bank, UPI, OTP, fake calls, 'digital arrest', job, loan and investment scams, chit funds), fraudsters caught, warnings on how to stay safe, big money scams, bank-loan frauds, government scams and corruption cases`;
const KEY = process.env.GEMINI_API_KEY || "";
const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
const MODELS = (process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.split(",") : site.gemini.models).map((m) => m.trim()).filter(Boolean);

export class QuotaError extends Error {}
export const PRIMARY = MODELS[0]; // the model the free limit is planned for; the others only stand in when it is busy
// Models whose free limit for today is used up, with the limit Google gave (e.g. 500 requests a day)
const dailyLimits = new Map();
export const dailyLimitOf = (model) => dailyLimits.get(model);
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
          groups: { type: "ARRAY", items: { type: "STRING", enum: CHOICES } },
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
        required: ["n", "hi", "en", "groups", "importance", "scope", "country", "state", "district", "tehsil", "place", "place_hi", "district_hi", "same_as"],
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
4. "groups": 1 to 3 groups from the list, best first. ${POLITICS}. If the story fits none of the groups (for example ${NOT_OURS}), give ["${OTHER}"].
5. "importance" 1-10: 9-10 = huge news for all India; 7-8 = big national or state news; 4-6 = normal news; 1-3 = small local or minor news.
6. "scope": where the news matters: local (one village, town or city area), tehsil, district, state, country (all India), world (outside India).
7. Place of the event in English standard spelling: "country", "state", "district" (official current district name, e.g. Prayagraj, Gurugram, Kanpur Nagar), "tehsil" (tehsil or block if known), "place" (the most specific place: village, town, city or area). Use "" when unknown. "place_hi" and "district_hi": the same names in Hindi.
8. "same_as": if a story is about the same event as an earlier story number in this batch, give that number, else 0.

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
{"stories":[{"n":1,"hi":{"h":"","what":"","who":"","whom":"","whose":"","where":"","when":"","why":"","which":"","how":""},"en":{"h":"","what":"","who":"","whom":"","whose":"","where":"","when":"","why":"","which":"","how":""},"groups":["${GROUPS[0]}"],"importance":5,"scope":"district","country":"India","state":"","district":"","tehsil":"","place":"","place_hi":"","district_hi":"","same_as":0}]}
"groups" may only use: ${CHOICES.join(", ")}. "scope" is one of: ${SCOPES.join(", ")}.`;

const generation = (variant, schema, maxOutputTokens, temperature) => ({
  temperature,
  maxOutputTokens,
  responseMimeType: "application/json",
  ...(variant <= 1 ? { responseSchema: schema } : {}),
  ...(variant === 0 ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
});

export function requestBody(stories, variant = 0) {
  return {
    systemInstruction: { parts: [{ text: variant >= 2 ? `${SYSTEM}\n\n${JSON_SHAPE}` : SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: stories.map(storyBlock).join("\n\n") }] }],
    generationConfig: generation(variant, SCHEMA, 32000, 0.2),
  };
}

// ---------- sorting: which group a headline belongs to (before anything is written) ----------
const SORT_SYSTEM = `You sort Indian news (Hindi or English) into the groups of "The Simplest News". The website shows ONLY news in these groups:
${GROUP_LIST.map((g) => `- ${g.slug}: ${g.en} (${g.about_en})`).join("\n")}

For every numbered item give "g": 1 to 3 group slugs from the list, best first. ${POLITICS}.
If the item fits none of the groups (for example ${NOT_OURS}), give ["${OTHER}"]. When in doubt, give ["${OTHER}"].
Reply with JSON {"items":[{"n":1,"g":["politics"]}]} with exactly one entry for every item, using its number "n".`;

const SORT_SCHEMA = {
  type: "OBJECT",
  properties: { items: { type: "ARRAY", items: { type: "OBJECT", properties: { n: { type: "INTEGER" }, g: { type: "ARRAY", items: { type: "STRING", enum: CHOICES } } }, required: ["n", "g"] } } },
  required: ["items"],
};

// items: [{ text }] — a headline with a few words of the story, or a trending topic with its news headlines
export function sortBody(items, variant = 0) {
  return {
    systemInstruction: { parts: [{ text: variant >= 2 ? `${SORT_SYSTEM}\n"g" may only use: ${CHOICES.join(", ")}. Reply with JSON only.` : SORT_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: items.map((it, i) => `${i + 1}. ${String(it.text).replace(/\s+/g, " ").trim()}`).join("\n") }] }],
    generationConfig: generation(variant, SORT_SCHEMA, 16000, 0),
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

const variantOf = new Map(); // model -> request shape that works for it
const broken = new Set(); // models that refused every request shape in this run

// The request shape each model accepts, kept between runs (the database stores it), so no run wastes a request
// on a shape that model refuses
export const requestShapes = {
  get: () => Object.fromEntries(variantOf),
  set: (shapes = {}) => {
    for (const [model, v] of Object.entries(shapes)) if (Number.isInteger(v) && v >= 0 && v < VARIANTS) variantOf.set(model, v);
  },
};

// One request to one model. makeBody(variant) builds it; `key` is the list the answer must have ("stories" or "items").
async function callModel(model, makeBody, key) {
  for (;;) {
    const variant = variantOf.get(model) || 0;
    const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify(makeBody(variant)),
      signal: AbortSignal.timeout(150000),
    });
    const text = await res.text();
    if (res.status === 429) {
      // Google says which limit it was: per minute (wait a little) or per day (the free limit for today is used up)
      const q = quotaOf(text);
      if (/PerMinute/i.test(q.id) && !/PerDay/i.test(q.id)) {
        const err = new Error(`${model}: too many requests this minute (${q.id})`);
        err.status = 429;
        throw err;
      }
      dailyLimits.set(model, { value: Number(q.value) || 0 });
      throw new QuotaError(`${model}: free limit reached (429)${q.id ? ` ${q.id}${q.value ? ` = ${q.value}` : ""}` : ` ${firstLine(text)}`}`);
    }
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
    if (!Array.isArray(out[key])) throw new Error(`${model}: answer has no ${key}`);
    return { list: out[key], variant, usage: tokens(json.usageMetadata) };
  }
}

// Which limit a 429 answer is about, e.g. { id: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", value: "500" }
export function quotaOf(text) {
  try {
    for (const d of JSON.parse(text).error?.details || []) {
      const v = d.violations?.find((x) => x.quotaId);
      if (v) return { id: String(v.quotaId), value: v.quotaValue ? String(v.quotaValue) : "" };
    }
  } catch {}
  return { id: "", value: "" };
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

// Asks the models in order. Returns { model, variant, list, usage } (usage = the tokens this request used).
// Throws QuotaError when every model's free limit is used up, or the last error when no model could answer.
async function ask(makeBody, key) {
  let lastErr;
  for (const model of MODELS) {
    if (outOfQuota.has(model) || broken.has(model)) continue;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return { model, ...(await callModel(model, makeBody, key)) };
      } catch (err) {
        lastErr = err;
        if (err instanceof QuotaError) {
          outOfQuota.add(model);
          log(`[gemini] ${err.message.slice(0, 160)}`);
          break;
        }
        log(`[gemini] ${String(err.message).slice(0, 200)}`);
        if (broken.has(model)) break;
        // "high demand" (503), too many requests this minute (429), a timeout or a broken answer: wait a little and try once more
        if (attempt === 1) await sleep(err.status === 429 ? 30000 : err.status === 503 ? 15000 : 4000);
      }
    }
  }
  if (MODELS.every((m) => outOfQuota.has(m) || broken.has(m)) && MODELS.some((m) => outOfQuota.has(m))) {
    throw new QuotaError("every model reached its free limit");
  }
  // e.g. the main model busy (503) and a stand-in model at its own small limit: Gemini is busy, not out of its limit
  if (lastErr instanceof QuotaError) throw new Error(`Gemini is busy (${lastErr.message.slice(0, 120)})`);
  throw lastErr || new Error("no model available");
}

const byNumber = (list, i) => list.find((a) => Number(a?.n) === i + 1);

// Writes a batch: { model, variant, usage, results } — results in the same order as `stories`, null where Gemini
// skipped one. A result's groups are only the site's groups ([] = "other": not news for this site).
export async function summarize(stories) {
  const r = await ask((v) => requestBody(stories, v), "stories");
  return { model: r.model, variant: r.variant, usage: r.usage, results: stories.map((_, i) => clean(byNumber(r.list, i))) };
}

// Sorts items ({ text }) into the site's groups: { model, usage, groups } — for each item its groups,
// [] = "other" (none of the site's groups), or null where Gemini skipped it (it is sorted again next time).
export async function sortHeadlines(items) {
  const r = await ask((v) => sortBody(items, v), "items");
  const groups = items.map((_, i) => {
    const a = byNumber(r.list, i);
    if (!a || !Array.isArray(a.g)) return null;
    return [...new Set(a.g.filter((g) => GROUPS.includes(g)))].slice(0, 3);
  });
  return { model: r.model, usage: r.usage, groups };
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
