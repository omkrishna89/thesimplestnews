// Groups from clear words in a headline, for stories the AI hasn't written yet (config/words.json).
// A word must stand on its own: "शेयर बाजार" matches, but "AI" does not match inside "AIIMS".
// Regular-expression text is allowed, e.g. "किसान(?:ों)?" for both forms.
// A word written only in CAPITAL letters (AI, IPO, ISRO) must match exactly; other words ignore upper/lower case.
import { config } from "./util.mjs";

const EDGE_L = "(?<![\\p{L}\\p{M}\\p{N}])";
const EDGE_R = "(?![\\p{L}\\p{M}\\p{N}])";

export function wordTest(words) {
  if (!Array.isArray(words) || !words.length) return null;
  const exact = words.filter((w) => /[A-Z]/.test(w) && !/[a-z]/.test(w));
  const loose = words.filter((w) => !exact.includes(w));
  const res = [];
  if (loose.length) res.push(new RegExp(`${EDGE_L}(?:${loose.join("|")})${EDGE_R}`, "iu"));
  if (exact.length) res.push(new RegExp(`${EDGE_L}(?:${exact.join("|")})${EDGE_R}`, "u"));
  return (text) => res.some((r) => r.test(text));
}

const SLUGS = config("groups.json").list.map((g) => g.slug);
const WORDS = config("words.json")?.groups || {};
// in the order of the group buttons
const RULES = SLUGS.map((slug) => [slug, wordTest(WORDS[slug])]).filter(([, t]) => t);

// ["stock-market", "business"] for "द बोनस मार्केट अपडेट: सेंसेक्स 1225 अंक चढ़ा"
export const groupsFromWords = (text) => (text ? RULES.filter(([, t]) => t(String(text))).map(([slug]) => slug) : []);
