// One standard spelling for every state and district, so news and the reader's place match.
import { config, slug } from "./util.mjs";

const places = config("places.json");
export const STATES = places.states;
export const COVERED = places.covered;

const stateByKey = new Map();
for (const [code, s] of Object.entries(STATES)) {
  stateByKey.set(code, code);
  stateByKey.set(slug(s.en), code);
  for (const iso of s.iso || []) stateByKey.set(iso.toLowerCase(), code);
  for (const a of s.aliases || []) stateByKey.set(a, code);
}
stateByKey.set("uttaranchal", "uk");
stateByKey.set("orissa", "od");

// "Uttar Pradesh" / "IN-UP" / "up" -> "up"
export function stateCode(s) {
  if (!s) return "";
  const k = String(s).trim().toLowerCase();
  return stateByKey.get(k) || stateByKey.get(slug(s)) || "";
}

// District in a state -> standard slug ("Kanpur" in UP -> "kanpur-nagar"; any Delhi district -> "delhi")
export function districtSlug(state, name) {
  const aliases = places.districtAlias[state] || {};
  if (aliases["*"]) return aliases["*"];
  const s = slug(name);
  if (!s) return "";
  return aliases[s] || s;
}

export const placeSlug = (name) => slug(name);

// What the browser needs to turn a GPS answer into the same slugs (written to /data/places.json)
export function placesForBrowser(names = {}) {
  const iso = {};
  const st = {};
  for (const [code, s] of Object.entries(STATES)) {
    st[code] = { en: s.en, hi: s.hi };
    for (const i of s.iso || []) iso[i] = code;
  }
  return { states: st, iso, alias: places.districtAlias, covered: COVERED, names };
}
