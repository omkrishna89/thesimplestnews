// The 9 answers as the website shows them.
//
// "Where?" is always the complete location, built here from the place details Gemini gives with every story
// (and the news feed's own state and district), so it is the same for every story, old or new, in Hindi and English:
//
//   [exact spot,] place (tehsil X, district Y), state, country
//   Sadar Hospital, Supaul (tehsil Supaul, district Supaul), Bihar, India
//   जैदपुर (तहसील नवाबगंज, ज़िला बाराबंकी), उत्तर प्रदेश, भारत
//
// A part that is not known is left out — nothing is guessed. News from outside India has no tehsils and districts:
// "Temple Hills, Maryland, United States". When Gemini's own answer is about several places, or about a wider area
// than one town ("Bihar", "Worldwide"), its words stay and only the missing country is added: "Bihar and Jharkhand, India".
import { foldText } from "../../src/assets/js/search.js";

export const QUESTIONS = ["what", "who", "whom", "whose", "where", "when", "why", "which", "how"];
export const WHERE = QUESTIONS.indexOf("where");
export const NOT_SAID = { en: "Not mentioned", hi: "जानकारी नहीं" };

const LABEL = { en: { tehsil: "tehsil", district: "district" }, hi: { tehsil: "तहसील", district: "ज़िला" } };
const INDIA = { en: "India", hi: "भारत" };

// "Not mentioned" in either language (Gemini sometimes writes the English words inside its Hindi answers,
// and sometimes writes them where a place's name should be)
const NOT_RE = /^(?:not (?:mentioned|specified|stated|given|available|known|applicable)|n\/?a|none|unknown|जानकारी नहीं|ज्ञात नहीं|उल्लेख नहीं)[.।!]*$/i;
export const isNotSaid = (answer) => !String(answer ?? "").trim() || NOT_RE.test(String(answer).trim());
export const fixNotSaid = (answers, lang) => answers.map((a) => (isNotSaid(a) ? NOT_SAID[lang] : a));

const DEVA = /[ऀ-ॿ]/;
const said = (x) => (isNotSaid(x) ? "" : String(x).trim()); // a name, or "" when it says nothing
export const inHindi = (x) => (DEVA.test(x || "") ? said(x) : ""); // a Hindi name must be in Hindi letters
const tokens = (x) => foldText(x || "").trim().split(" ").filter(Boolean); // spellings folded: Billari = Bilari
const joined = (x) => tokens(String(x || "").replace(/[\s-]+/g, "")).join(""); // a name as one word: "Bihar Sharif" = "Biharsharif"
const same = (a, b) => !!a && !!b && joined(a) === joined(b);
// "kanpur-nagar" -> "Kanpur Nagar" (the news feed's district; "" for a district once saved as "not-mentioned")
const titleCase = (slug) => said(String(slug || "").split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" "));
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : x);
// "In Kochi, Kerala." -> "Kochi, Kerala"
const tidy = (x) => cap(String(x || "").trim().replace(/[.।\s]+$/, "").replace(/^(?:in|at)\s+/i, ""));

// Words that say nothing new next to the place names ("Mauganj district" is just Mauganj)
const GENERIC = new Set(
  tokens(
    "district tehsil taluk taluka block mandal subdivision division state region area village town city in at of the near and or new old north south east west central " +
      "जिला ज़िला जिले तहसील ब्लॉक प्रखंड राज्य गांव गाँव शहर कस्बा क्षेत्र इलाका में के का की पास और तथा एवं व या नई नया पुराना उत्तर दक्षिण पूर्व पश्चिम मध्य",
  ),
);
const AND = { en: /(?:^|\s)(?:and|or)(?=\s|$)|&|\//i, hi: /(?:^|\s)(?:और|तथा|एवं|व|या)(?=\s|$)|\// };
// An exact spot: one building, office, road, market… ("schools" or "prisons" are many places, not a spot)
const SPOT = {
  en: /\b(?:hospital|college|school|university|institute|temple|mandir|mosque|masjid|church|gurdwara|court|station|thana|chowk|chauraha|market|bazaa?r|mandi|office|bhawan|bhavan|ground|stadium|airport|centre|center|hall|auditorium|park|sector|colony|road|marg|highway|expressway|nh-?\s?\d+|bridge|flyover|ghat|collectorate|secretariat|mantralaya|assembly|vidhan sabha|parliament|jail|fort|museum|hotel|mall|campus|aiims|bank|depot|bus stand|terminal|dam|canal|plant|factory|mine)\b/i,
  hi: /अस्पताल|कॉलेज|कालेज|स्कूल|विद्यालय|यूनिवर्सिटी|संस्थान|मंदिर|मस्जिद|गुरुद्वारा|चर्च|कोर्ट|न्यायालय|स्टेशन|थाना|थाने|चौक|चौराहा|तिराहा|बाजार|बाज़ार|मार्केट|मंडी|कार्यालय|ऑफिस|भवन|मैदान|स्टेडियम|एयरपोर्ट|हवाई अड्डा|केंद्र|सेंटर|सभागार|ऑडिटोरियम|हॉल|पार्क|सेक्टर|कॉलोनी|रोड|मार्ग|हाईवे|एक्सप्रेसवे|पुल|फ्लाईओवर|घाट|कलेक्ट्रेट|सचिवालय|मंत्रालय|विधानसभा|संसद|जेल|किला|संग्रहालय|होटल|मॉल|कैंपस|परिसर|एम्स|बैंक|डिपो|बस स्टैंड|बांध|नहर|प्लांट|फैक्ट्री|खदान/,
};

// A country's Hindi name: from config/countries.json, else Gemini's
const countryIndex = new WeakMap();
function countryHi(name, given, countries = {}) {
  if (!countryIndex.has(countries)) countryIndex.set(countries, new Map(Object.entries(countries).map(([en, hi]) => [joined(en), hi])));
  return countryIndex.get(countries).get(joined(name)) || inHindi(given);
}

// The names of a story's place, from the smallest to the biggest, in one language ("" = not known)
function partsOf({ place: p = {}, loc = {}, lang, states = {}, names = {}, countries }) {
  const en = lang === "en";
  const learned = (key) => inHindi(names[key]);
  const countryEn = said(p.country);
  let out;
  if (loc.c === "world") {
    out = { world: true, place: en ? said(p.local) : inHindi(p.local_hi), tehsil: "", district: en ? said(p.district) : inHindi(p.district_hi), state: en ? said(p.state) : inHindi(p.state_hi), country: en ? countryEn : countryHi(countryEn, p.country_hi, countries) };
  } else {
    const key = loc.s && loc.d ? `${loc.s}/${loc.d}` : "";
    const districtEn = said(p.district) || titleCase(loc.d);
    const district = en ? districtEn : inHindi(p.district_hi) || (key && learned(key));
    const tehsilEn = said(p.tehsil) || titleCase(loc.t);
    const place = en ? said(p.local) : inHindi(p.local_hi) || (key && loc.l && learned(`${key}/${loc.l}`));
    // a tehsil's Hindi name: Gemini's, or the place's or district's when it has the same name, or one learned earlier
    const tehsil = en ? tehsilEn : inHindi(p.tehsil_hi) || (same(tehsilEn, p.local) && place) || (same(tehsilEn, districtEn) && district) || (key && loc.t && learned(`${key}/${loc.t}`));
    const state = states[loc.s]?.[lang] || (en ? said(p.state) : inHindi(p.state_hi));
    // India for sure: Gemini said so, or the story's state is known
    out = { world: false, place: place || "", tehsil: tehsil || "", district: district || "", state: state || "", country: countryEn || loc.s ? INDIA[lang] : "" };
  }
  if (same(out.place, out.country)) out.place = ""; // "India" is not a place in India
  return out;
}
const smallOf = (p) => [p.place, p.tehsil, p.district].filter(Boolean);
const knownOf = (p) => new Set([...smallOf(p), p.state, p.country].filter(Boolean).flatMap(tokens));

// Gemini's own words, unless they say nothing or (in Hindi) are written in English letters
const ownWords = (answer, lang) => (isNotSaid(answer) || (lang === "hi" && !DEVA.test(answer)) ? "" : tidy(answer));
// two spellings of one name: "Badaun" = "Budaun", "Keralam" = "Kerala" (one letter apart; two for long names)
function near(a, b) {
  if (a === b) return true;
  const max = Math.min(a.length, b.length) >= 9 ? 2 : 1;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length] <= max;
}
const has = (T, t) => T.some((x) => near(x, t)); // a word of the text is this word, or nearly
// is the name x in the text, written as one word or as several? ("Biharsharif" / "Bihar Sharif")
function hasJoined(text, x) {
  const j = joined(x);
  if (j.length < 5) return false;
  const w = String(text).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) if (joined(w.slice(i, i + n).join("")) === j) return true;
  return false;
}
// does the text name x in full?
const namesAll = (text, x) => !!text && !!x && (tokens(x).every((t) => has(tokens(text), t)) || hasJoined(text, x));
// does the text mention the town x? A word that is also in the state's or country's name (`wider`) is no proof:
// "Bihar" does not mention "Bihar Sharif"
function mentions(text, x, wider) {
  if (!text || !x) return false;
  const T = tokens(text);
  const nx = tokens(x).filter((t) => !GENERIC.has(t));
  if (nx.length && (nx.every((t) => has(T, t)) || nx.some((t) => !wider.has(t) && has(T, t)))) return true;
  return hasJoined(text, x);
}

// The exact spot: the one Gemini gives with the place details, or (older stories) one inside its own answer:
// "Gorakhnath Temple, Gorakhpur" -> "Gorakhnath Temple"
function spotOf(place, own, p, lang) {
  const known = knownOf(p);
  const given = lang === "en" ? said(place.spot) : inHindi(place.spot_hi);
  if (given && !tokens(given).every((t) => known.has(t) || GENERIC.has(t))) return tidy(given);
  const extra = new Set(tokens(own).filter((t) => !known.has(t) && !GENERIC.has(t)));
  if (!extra.size) return "";
  return own
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter((s) => s && s.split(/\s+/).length <= 6 && SPOT[lang].test(s) && tokens(s).some((t) => extra.has(t)))
    .join(", ");
}

// What Gemini's own (English) answer is, next to the story's place details:
//   bare  — nothing smaller than the country is known: its own words stay ("India", "Worldwide")
//   multi — it names several places: its words, plus the country
//   wide  — it is about a wider area than the story's town, or about another place ("Bihar"): its words stay
//   full  — the complete location is built from the place details
function decide(own, p, spot) {
  const small = smallOf(p);
  if (!small.length && !p.state) return "bare";
  if (!own) return "full";
  const known = knownOf(p);
  if (AND.en.test(own) && tokens(own).some((t) => !known.has(t) && !GENERIC.has(t))) return "multi";
  const wider = new Set([p.state, p.country].filter(Boolean).flatMap(tokens));
  if (small.length && !spot && !small.some((x) => mentions(own, x, wider))) return "wide";
  return "full";
}

// place (tehsil X, district Y), state, country — outside India: place, region, country
function compose(p, spot, lang) {
  let list;
  if (p.world) {
    list = [];
    for (const x of [p.place, p.district, p.state, p.country]) if (x && !list.some((y) => same(x, y))) list.push(x); // each name once
  } else {
    const L = LABEL[lang];
    const inner = [p.tehsil && `${L.tehsil} ${p.tehsil}`, p.district && `${L.district} ${p.district}`].filter(Boolean).join(", ");
    const head = p.place ? (inner ? `${p.place} (${inner})` : p.place) : cap(inner);
    // a state with the same name as the place (Delhi, Chandigarh) is written once
    const state = same(p.state, p.place || p.district) ? "" : p.state;
    list = [head, state, p.country].filter(Boolean);
  }
  return [spot, ...list].filter(Boolean).join(", ");
}

// answer: Gemini's own "where" answer in this language (answerEn: its English one); place: the story's place
// details from Gemini (a.place); loc: where the story was filed (story.loc); states: config/places.json states;
// names: Hindi place names learned so far; countries: config/countries.json (Hindi names of countries)
export function fullWhere({ answer, answerEn = answer, place = {}, loc = {}, lang, states, names, countries }) {
  const opt = { place, loc, states, names, countries };
  // English decides what kind of answer it is (the English place details are the most complete)
  const pEn = partsOf({ ...opt, lang: "en" });
  const ownEn = ownWords(answerEn, "en");
  const mode = decide(ownEn, pEn, spotOf(place, ownEn, pEn, "en"));
  const stateNamed = namesAll(ownEn, pEn.state);

  const p = lang === "en" ? pEn : partsOf({ ...opt, lang });
  const own = lang === "en" ? ownEn : ownWords(answer, lang);
  const nothing = () => (isNotSaid(answer) ? NOT_SAID[lang] : tidy(answer));
  const withCountry = () => (p.country && !namesAll(own, p.country) ? `${own}, ${p.country}` : own);

  if (mode === "bare") return own || p.country || nothing();
  if (mode === "multi" && own) return withCountry();
  if (mode === "wide") {
    if (own) return stateNamed || namesAll(own, p.state) ? withCountry() : own;
    // (Hindi answer missing) the same area as the English answer, when its Hindi name is known
    if (stateNamed && p.state) return [p.state, p.country].filter(Boolean).join(", ");
    if (namesAll(ownEn, pEn.country) && p.country) return p.country;
  }
  // the complete location; in Hindi, when no Hindi name of the place is known: Gemini's own Hindi words + the country
  if (!smallOf(p).length && !p.state) return own ? withCountry() : p.country || nothing();
  return compose(p, spotOf(place, own, p, lang), lang);
}

// A story's 9 answers for the website: "not mentioned" in the reader's language, and the complete "Where?"
export function siteAnswers(story, lang, { states, names, countries }) {
  const q = fixNotSaid(story.a[lang].q, lang);
  q[WHERE] = fullWhere({ answer: q[WHERE], answerEn: story.a.en.q[WHERE], place: story.a.place, loc: story.loc, lang, states, names, countries });
  return q;
}
