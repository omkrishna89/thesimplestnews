// Search that forgives spellings and works a little like Google. Used by the browser (app.js) and the tests,
// so it has no page code in it.
//
// 1. Words are "folded" into a simple form, so the common Indian spellings of a word look the same:
//    janata = janta, bharatiya = bhartiya, aadmi = admi, ee = i, oo = u, w = v, ph = f, ksh = x, Chennai = Chenai,
//    party = parties, and in Hindi ज़ = ज, ड़ = ड, ँ = ं, ी = ि, ू = ु, ॉ = ो, न्द = ंद.
// 2. A word you type matches the start of a word in the story ("protest" also finds "protesters").
// 3. Rare words count most: a story must have the rare words you typed; common words ("party", "delhi")
//    may be missing and only move a story up. Short forms: "Cockroach Janta Party" also finds CJP,
//    and "CJP" also finds "Cockroach Janta Party".
// 4. A word found nowhere is checked for a typing mistake ("cockroch" finds "cockroach").

const SEP = /[^\p{L}\p{M}\p{N}]+/u;
const MARKS = /[̀-़ͯ‌‍]/g; // accents, the Hindi dot (nukta) and invisible joiners
const DEVA = /[ऀ-ॿ]/;
const VOWELS = "aeiou";
const LATIN_MAP = { ph: "f", ksh: "x", w: "v", ee: "i", oo: "u", ou: "au" };
const LATIN_RE = /ph|ksh|w|ee|oo|ou/g;
// ँ→ं  ी→ि  ू→ु  ई→इ  ऊ→उ  ॉ→ो  ऑ→ओ  ॅ→े  ऍ→ए
const DEVA_MAP = { "ँ": "ं", "ी": "ि", "ू": "ु", "ई": "इ", "ऊ": "उ", "ॉ": "ो", "ऑ": "ओ", "ॅ": "े", "ऍ": "ए" };
const DEVA_RE = /[ँीूईऊॉऑॅऍ]/g;
const HALF_NASAL = /[ङञणनम]्(?=[क-ह])/g; // ङ् ञ् ण् न् म् before a letter = ं

function foldLatin(t) {
  const w = t.replace(LATIN_RE, (m) => LATIN_MAP[m]).replace(/y$/, "i");
  let out = "";
  let vowel = false; // the first syllable keeps its "a"
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    const last = out[out.length - 1];
    if (ch === last && ch >= "a" && ch <= "z") continue; // doubled letters (numbers stay as they are)
    const v = VOWELS.includes(ch);
    // a short "a" between two consonants is often left out: janata = janta, bharatiya = bhartiya
    if (ch === "a" && vowel && last && !VOWELS.includes(last) && i + 1 < w.length && !VOWELS.includes(w[i + 1])) continue;
    if (v) vowel = true;
    out += ch;
  }
  return out;
}
const foldDeva = (t) => t.replace(DEVA_RE, (m) => DEVA_MAP[m]).replace(HALF_NASAL, "ं");

const cache = new Map();
function foldWord(t) {
  let f = cache.get(t);
  if (f === undefined) {
    f = DEVA.test(t) ? foldDeva(t) : foldLatin(t);
    if (cache.size < 300000) cache.set(t, f);
  }
  return f;
}

// " jnta parti ..." style text: folded words with a space before and after each one
export function foldText(s) {
  const toks = String(s || "").toLowerCase().normalize("NFD").replace(MARKS, "").split(SEP);
  let out = " ";
  for (const t of toks) if (t) out += `${foldWord(t)} `;
  return out;
}

const STOP = new Set(
  (
    "a an and are as at be by for from has have how in is it its of on or that the this to was were what when where which who why will with " +
    "news latest today about vs live update updates " +
    "kya hai ka ki ke ko me mein se aur khabar samachar " +
    "का की के को में से पर और है हैं था थी थे ने एक यह वह भी तो ही खबर ख़बर खबरें ख़बरें न्यूज़ न्यूज ताज़ा ताजा आज"
  ).split(" "),
);

// The words of a search. "acr": a short form typed by the reader (CJP, BJP, rbi). "initials": the first letters
// of a name of 3 to 5 English words (cockroach janta party = cjp).
export function parseQuery(q) {
  const raw = String(q || "").normalize("NFC").split(SEP).filter(Boolean);
  let words = raw.map((r) => ({ r, f: foldText(r).trim() })).filter((w) => w.f && (w.r.length > 1 || DEVA.test(w.r)));
  const real = words.filter((w) => !STOP.has(w.r.toLowerCase()));
  if (real.length) words = real;
  const seen = new Set();
  words = words.filter((w) => !seen.has(w.f) && seen.add(w.f)).slice(0, 8);
  for (const w of words) w.acr = /^[a-z]{2,5}$/i.test(w.r) && (w.r === w.r.toUpperCase() || !/[aeiou]/i.test(w.r)) ? w.r.toLowerCase() : "";
  const names = words.filter((w) => /^[a-z]/i.test(w.r));
  const initials = names.length >= 3 && names.length <= 5 && names.length === words.length && !words.some((w) => w.acr) ? names.map((w) => w.r[0].toLowerCase()).join("") : "";
  return { q: String(q || ""), words, initials };
}

const has = (text, f) => (f.length <= 2 ? text.includes(` ${f} `) : text.includes(` ${f}`));
const original = (it) => `${it.h || ""} ${it.s || ""}`;
// the exact word, as written (for short forms: "AAP" is not "AP")
const rawHas = (it, word) => ` ${original(it).toLowerCase().split(SEP).join(" ")} `.includes(` ${word} `);
// "CJP" in a story that says "Cockroach Janta Party"
function longForm(acr) {
  const part = (ch) => `${ch.toUpperCase()}[\\p{Ll}\\p{M}'’-]+`;
  try {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${[...acr].map(part).join("\\s+(?:(?:of|and|the|for|&)\\s+)?")}(?![\\p{L}\\p{N}])`, "u");
  } catch {
    return null;
  }
}
// Headlines Like This One (most words capitalised) are skipped there: "Titan Company Share Price" is not TCS
function titleCased(h) {
  const ws = (String(h || "").match(/\p{L}[\p{L}\p{M}'’-]*/gu) || []).filter((w) => /^[a-z]/i.test(w));
  return ws.length >= 4 && ws.filter((w) => /^[A-Z]/.test(w)).length >= ws.length * 0.6;
}
const longIn = (it, re) => !!re && (re.test(it.s || "") || (!titleCased(it.h) && re.test(it.h || "")));
function wordIn(it, text, w, re) {
  if (w.acr) return (has(text, w.f) && rawHas(it, w.acr)) || longIn(it, re);
  return w.alts.some((a) => has(text, a));
}
const initialsIn = (it, text, ini, fi, re) => (text.includes(` ${fi} `) && rawHas(it, ini)) || longIn(it, re);

// Typing mistakes: words of the stories that differ from the typed word by one letter (two for long words)
function near(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

// Ranks the stories for a search: tiers.get(story) = how many of the words it has (more = shown first).
// Stories without the rare words are left out. "missing" = typed words that no story has.
export function rank(items, query) {
  const tiers = new Map();
  const words = query.words.map((w) => ({ ...w, alts: [w.f] }));
  const n = words.length;
  if (!n) return { tiers, missing: [] };
  const res = words.map((w) => (w.acr ? longForm(w.acr) : null));
  const ini = query.initials;
  const fi = ini ? foldText(ini).trim() : "";
  const iniRe = ini ? longForm(ini) : null;
  const FULL = 1 << 30;
  const texts = items.map((it) => (it._f ??= foldText(`${it.h || ""} ${it.s || ""} ${it.pn || ""}`)));
  const masks = new Array(items.length).fill(0);
  const df = new Array(n).fill(0);
  const look = (i) => {
    df[i] = 0;
    for (let k = 0; k < items.length; k++) {
      if (wordIn(items[k], texts[k], words[i], res[i])) {
        masks[k] |= 1 << i;
        df[i]++;
      } else masks[k] &= ~(1 << i);
    }
  };
  for (let i = 0; i < n; i++) look(i);
  if (ini) for (let k = 0; k < items.length; k++) if (initialsIn(items[k], texts[k], ini, fi, iniRe)) masks[k] |= FULL;
  // a word found nowhere: look for a word that is nearly the same ("cockroch" = "cockroach")
  const lost = words.map((w, i) => i).filter((i) => !df[i] && !words[i].acr && words[i].f.length >= 5);
  if (lost.length) {
    const vocab = new Set();
    for (const t of texts) for (const x of t.split(" ")) if (x.length >= 4) vocab.add(x);
    for (const i of lost) {
      const f = words[i].f;
      const max = f.length >= 9 ? 2 : 1;
      const alts = [];
      for (const v of vocab) if (v[0] === f[0] && near(f, v, max) && alts.push(v) >= 6) break;
      if (alts.length) {
        words[i].alts = alts;
        look(i);
      }
    }
  }
  // Rare words must be there. Common words (in at least 1 of every 100 stories, like "party" or "delhi") may be
  // missing; they only move a story up. When every word is common, all of them must be there.
  // A word no story has (even after the typing check) must be there too: then nothing is found.
  const missing = words.filter((w, i) => !df[i]).map((w) => w.r);
  const count = (m) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (m & (1 << i)) c++;
    return c;
  };
  const all = (1 << n) - 1;
  let need = 0;
  for (let i = 0; i < n; i++) if (!(df[i] >= 5 && df[i] >= items.length / 100)) need |= 1 << i;
  if (!need) need = all;
  for (let k = 0; k < items.length; k++) {
    const m = masks[k];
    if (m & FULL) tiers.set(items[k], n + 1);
    else if ((m & need) === need) tiers.set(items[k], count(m & all));
  }
  return { tiers, missing };
}

// Does a headline (from another website) talk about the search? At least one of the words, or the short form.
export function titleMatches(title, query) {
  const text = foldText(title);
  const it = { h: title };
  if (query.initials && initialsIn(it, text, query.initials, foldText(query.initials).trim(), longForm(query.initials))) return true;
  return query.words.some((w) => wordIn(it, text, { ...w, alts: [w.f] }, w.acr ? longForm(w.acr) : null));
}

// ---------- other news websites: the GDELT Project (a free, open news database; English words only) ----------
// Common Indian spellings of one English word, for GDELT's OR: janata → janta, aadmi → admi
export function spellings(w) {
  const out = new Set([w]);
  const first = w.search(/[aeiou]/);
  if (first >= 0) {
    for (let i = first + 1; i < w.length - 1; i++) {
      if (w[i] === "a" && !VOWELS.includes(w[i - 1]) && !VOWELS.includes(w[i + 1])) out.add(w.slice(0, i) + w.slice(i + 1));
    }
  }
  out.add(w.replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u"));
  return [...out].filter((x) => x.length >= 3).slice(0, 3);
}

// "cockroach (janata OR janta) party sourcelang:english"; "" when the search has Hindi letters (GDELT can't read them)
export function gdeltQuery(query, lang) {
  if (!query.words.length || query.words.some((w) => DEVA.test(w.r))) return "";
  const parts = query.words
    .filter((w) => w.r.length >= 3 && /^[a-z0-9]+$/i.test(w.r))
    .slice(0, 6)
    .map((w) => {
      const v = spellings(w.r.toLowerCase());
      return v.length > 1 ? `(${v.join(" OR ")})` : v[0];
    });
  if (!parts.length) return "";
  return `${parts.join(" ")} ${lang === "hi" ? "(sourcelang:hindi OR sourcelang:english)" : "sourcelang:english"}`;
}

// span: "&timespan=3m" (all days) or "&startdatetime=…&enddatetime=…" (the reader's Day choice)
export const gdeltUrl = (gq, span = "&timespan=3m") =>
  `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(gq)}&mode=artlist&maxrecords=75&format=json&sort=datedesc${span}`;

// Google News with the same words, in the reader's language (a normal link: nothing is sent before a click)
export const googleNewsUrl = (q, lang) =>
  `https://news.google.com/search?q=${encodeURIComponent(q)}&hl=${lang === "hi" ? "hi" : "en-IN"}&gl=IN&ceid=IN:${lang === "hi" ? "hi" : "en"}`;

// GDELT writes headlines with spaces around punctuation: "India 's vote , explained : why"
export function cleanTitle(t) {
  return String(t || "")
    .replace(/\s+([,.:;!?%)\]}’”])/g, "$1")
    .replace(/([(\[{‘“])\s+/g, "$1")
    .replace(/\s+(['’])\s*s\b/g, "$1s")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// "20261026T071500Z" -> seconds
export function gdeltTime(s) {
  const m = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(String(s || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : 0;
}

// GDELT's list -> [{ h, u, src, t }]: only headlines about the search, each story once
export function gdeltItems(json, query) {
  const arts = Array.isArray(json?.articles) ? json.articles : [];
  const seen = new Set();
  const out = [];
  for (const a of arts) {
    const u = String(a?.url || "");
    if (!/^https?:\/\//i.test(u)) continue;
    const h = cleanTitle(a.title).slice(0, 200);
    const key = foldText(h);
    if (!h || seen.has(u) || seen.has(key)) continue;
    seen.add(u);
    seen.add(key);
    if (!titleMatches(h, query)) continue;
    let src = String(a.domain || "");
    if (!src) {
      try {
        src = new URL(u).hostname;
      } catch {}
    }
    out.push({ h, u, src: src.replace(/^www\./, ""), t: gdeltTime(a.seendate) });
  }
  return out;
}
