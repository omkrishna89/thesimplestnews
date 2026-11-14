// "Where?" is always the complete location: [exact spot,] place (tehsil X, district Y), state, country.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { NOT_SAID, QUESTIONS, WHERE, fixNotSaid, fullWhere, inHindi, isNotSaid, siteAnswers } from "../scripts/lib/answers.mjs";

const states = JSON.parse(fs.readFileSync(new URL("../config/places.json", import.meta.url))).states;
const countries = JSON.parse(fs.readFileSync(new URL("../config/countries.json", import.meta.url))).hi;
const names = { "up/barabanki": "बाराबंकी", "hr/yamunanagar": "यमुनानगर", "hr/yamunanagar/chhachhrauli": "छछरौली" };
// Gemini's own answers (English, Hindi) + the story's place details -> the answers the website shows
const where = (en, hi, place, loc) => {
  const opt = { answerEn: en, place, loc, states, names, countries };
  return [fullWhere({ ...opt, answer: en, lang: "en" }), fullWhere({ ...opt, answer: hi, lang: "hi" })];
};
const IN = (s, d, t, l) => ({ c: "in", ...(s && { s }), ...(d && { d }), ...(t && { t }), ...(l && { l }) });

test("place (tehsil, district), state, country — in English and Hindi", () => {
  assert.equal(QUESTIONS[WHERE], "where");
  const zaidpur = { country: "India", state: "Uttar Pradesh", district: "Barabanki", tehsil: "Nawabganj", local: "Zaidpur", local_hi: "जैदपुर", tehsil_hi: "नवाबगंज", district_hi: "बाराबंकी" };
  assert.deepEqual(where("Zaidpur", "जैदपुर", zaidpur, IN("up", "barabanki", "nawabganj", "zaidpur")), [
    "Zaidpur (tehsil Nawabganj, district Barabanki), Uttar Pradesh, India",
    "जैदपुर (तहसील नवाबगंज, ज़िला बाराबंकी), उत्तर प्रदेश, भारत",
  ]);
  // the same name at every level is still written with its label (an old story's tehsil gets the place's Hindi name)
  const hamirpur = { country: "India", state: "Uttar Pradesh", district: "Hamirpur", tehsil: "Hamirpur", local: "Hamirpur", local_hi: "हमीरपुर", district_hi: "हमीरपुर" };
  assert.deepEqual(where("Hamirpur", "हमीरपुर", hamirpur, IN("up", "hamirpur", "hamirpur", "hamirpur")), [
    "Hamirpur (tehsil Hamirpur, district Hamirpur), Uttar Pradesh, India",
    "हमीरपुर (तहसील हमीरपुर, ज़िला हमीरपुर), उत्तर प्रदेश, भारत",
  ]);
  // "Bihar Sharif" and "Biharsharif" are the same place
  const bs = { country: "India", state: "Bihar", district: "Nalanda", tehsil: "", local: "Bihar Sharif", local_hi: "बिहार शरीफ", district_hi: "नालंदा" };
  assert.deepEqual(where("Biharsharif", "बिहारशरीफ", bs, IN("br", "nalanda", "", "bihar-sharif")), ["Bihar Sharif (district Nalanda), Bihar, India", "बिहार शरीफ (ज़िला नालंदा), बिहार, भारत"]);
});

test("a part that is not known is left out", () => {
  const dhakwala = { country: "India", state: "Haryana", district: "Yamunanagar", tehsil: "", local: "Dhakwala", local_hi: "ढाकवाला", district_hi: "यमुनानगर" };
  assert.deepEqual(where("Dhakwala", "ढाकवाला", dhakwala, IN("hr", "yamunanagar", "", "dhakwala")), ["Dhakwala (district Yamunanagar), Haryana, India", "ढाकवाला (ज़िला यमुनानगर), हरियाणा, भारत"]);
  assert.deepEqual(where("Bhubaneswar, Odisha.", "भुवनेश्वर, ओडिशा।", { country: "India", state: "Odisha", local: "Bhubaneswar", local_hi: "भुवनेश्वर" }, IN("od")), ["Bhubaneswar, Odisha, India", "भुवनेश्वर, ओडिशा, भारत"]);
  // no place, only the news feed's district
  assert.deepEqual(where("Not mentioned", "जानकारी नहीं", { country: "India" }, IN("up", "barabanki")), ["District Barabanki, Uttar Pradesh, India", "ज़िला बाराबंकी, उत्तर प्रदेश, भारत"]);
  assert.deepEqual(where("Koriya district", "कोरिया जिला", { country: "India", state: "Chhattisgarh", district: "Koriya", district_hi: "कोरिया" }, IN("cg", "koriya")), ["District Koriya, Chhattisgarh, India", "ज़िला कोरिया, छत्तीसगढ़, भारत"]);
  // an old story's tehsil without a Hindi name is left out of the Hindi answer; a name learned earlier is used
  const old = { country: "India", state: "Haryana", district: "Yamunanagar", tehsil: "Jagadhri", local: "Dhakwala", local_hi: "ढाकवाला", district_hi: "यमुनानगर" };
  assert.equal(where("Dhakwala", "ढाकवाला", old, IN("hr", "yamunanagar", "jagadhri", "dhakwala"))[1], "ढाकवाला (ज़िला यमुनानगर), हरियाणा, भारत");
  assert.equal(where("Dhakwala", "ढाकवाला", { ...old, tehsil: "Chhachhrauli" }, IN("hr", "yamunanagar", "chhachhrauli", "dhakwala"))[1], "ढाकवाला (तहसील छछरौली, ज़िला यमुनानगर), हरियाणा, भारत");
  // Gemini wrote "Not mentioned" where a name should be: that is no name
  const none = { country: "India", state: "Not mentioned", district: "Not mentioned", tehsil: "", local: "", local_hi: "जानकारी नहीं", district_hi: "जानकारी नहीं" };
  assert.deepEqual(where("Not mentioned", "Not mentioned", none, IN()), ["India", "भारत"]);
  assert.equal(inHindi("जानकारी नहीं"), "");
});

test("the exact spot comes first", () => {
  const supaul = { country: "India", state: "Bihar", district: "Supaul", tehsil: "", local: "Supaul", local_hi: "सुपौल", district_hi: "सुपौल", spot: "Sadar Hospital", spot_hi: "सदर अस्पताल" };
  const loc = IN("br", "supaul", "", "supaul");
  assert.deepEqual(where("Supaul", "सुपौल", supaul, loc), ["Sadar Hospital, Supaul (district Supaul), Bihar, India", "सदर अस्पताल, सुपौल (ज़िला सुपौल), बिहार, भारत"]);
  assert.equal(where("Supaul", "सुपौल", { ...supaul, spot: "Supaul", spot_hi: "" }, loc)[0], "Supaul (district Supaul), Bihar, India", "a 'spot' that is only the place's name adds nothing");
  // older stories: the spot is taken from Gemini's own answer
  const gorakhpur = { country: "India", state: "Uttar Pradesh", district: "Gorakhpur", tehsil: "Gorakhpur", local: "Gorakhpur", local_hi: "गोरखपुर", district_hi: "गोरखपुर" };
  assert.deepEqual(where("Gorakhnath Temple, Gorakhpur, Uttar Pradesh.", "गोरखनाथ मंदिर, गोरखपुर, उत्तर प्रदेश।", gorakhpur, IN("up", "gorakhpur", "gorakhpur", "gorakhpur")), [
    "Gorakhnath Temple, Gorakhpur (tehsil Gorakhpur, district Gorakhpur), Uttar Pradesh, India",
    "गोरखनाथ मंदिर, गोरखपुर (तहसील गोरखपुर, ज़िला गोरखपुर), उत्तर प्रदेश, भारत",
  ]);
  const mirzapur = { country: "India", state: "Uttar Pradesh", district: "Mirzapur", tehsil: "", local: "Mirzapur" };
  assert.equal(where("City block auditorium", "", mirzapur, IN("up", "mirzapur", "", "mirzapur"))[0], "City block auditorium, Mirzapur (district Mirzapur), Uttar Pradesh, India");
  // …but a whole sentence is not a spot
  const jodhpur = { country: "India", state: "Rajasthan", district: "Jodhpur", tehsil: "", local: "Jodhpur" };
  assert.equal(where("The recruitment is for Jodhpur.", "", jodhpur, IN("rj", "jodhpur", "", "jodhpur"))[0], "Jodhpur (district Jodhpur), Rajasthan, India");
});

test("several places: Gemini's own words, plus the country", () => {
  assert.deepEqual(where("Bihar and Jharkhand", "बिहार और झारखंड", { country: "India", state: "Bihar" }, IN("br")), ["Bihar and Jharkhand, India", "बिहार और झारखंड, भारत"]);
  assert.equal(where("Delhi, Mumbai and Bengaluru, India.", "", { country: "India", state: "Delhi", local: "Delhi" }, IN("dl"))[0], "Delhi, Mumbai and Bengaluru, India");
});

test("an answer about a wider area than the story's town keeps Gemini's words", () => {
  const patna = { country: "India", state: "Bihar", district: "Patna", tehsil: "Patna", local: "Patna", local_hi: "पटना", district_hi: "पटना" };
  const loc = IN("br", "patna", "patna", "patna");
  assert.deepEqual(where("Bihar", "बिहार", patna, loc), ["Bihar, India", "बिहार, भारत"], "news about all of Bihar is not narrowed to Patna");
  assert.deepEqual(where("Patna", "पटना", patna, loc), ["Patna (tehsil Patna, district Patna), Bihar, India", "पटना (तहसील पटना, ज़िला पटना), बिहार, भारत"]);
  assert.deepEqual(where("India", "भारत", patna, loc), ["India", "भारत"]);
  // Gemini wrote the Hindi answer in English letters: Hindi follows the English answer
  assert.deepEqual(where("Bihar", "Bihar", patna, loc), ["Bihar, India", "बिहार, भारत"]);
  assert.deepEqual(where("India", "India", patna, loc), ["India", "भारत"]);
  // "Jammu and Kashmir" is one place, not several
  const srinagar = { country: "India", state: "Jammu and Kashmir", district: "Srinagar", tehsil: "", local: "Srinagar" };
  assert.equal(where("Jammu and Kashmir", "", srinagar, IN("jk", "srinagar", "", "srinagar"))[0], "Jammu and Kashmir, India");
  assert.equal(where("Srinagar", "", srinagar, IN("jk", "srinagar", "", "srinagar"))[0], "Srinagar (district Srinagar), Jammu & Kashmir, India");
  // many places of one kind are not one spot
  const hyd = { country: "India", state: "Telangana", district: "Hyderabad", tehsil: "", local: "Hyderabad", local_hi: "हैदराबाद", district_hi: "हैदराबाद" };
  assert.deepEqual(where("In Telangana prisons.", "तेलंगाना की जेलों में।", hyd, IN("tg", "hyderabad", "", "hyderabad")), ["Telangana prisons, India", "तेलंगाना की जेलों में, भारत"]);
  // Gemini's answer names another place than its place details: its own words stay, nothing is added
  const jodhpur = { country: "India", state: "Rajasthan", district: "Jodhpur", tehsil: "", local: "Jodhpur" };
  assert.equal(where("Ludhiana", "", jodhpur, IN("rj", "jodhpur", "", "jodhpur"))[0], "Ludhiana");
  // outside India
  const tokyo = { country: "Japan", state: "Tokyo", district: "", tehsil: "", local: "Tokyo", local_hi: "टोक्यो" };
  assert.deepEqual(where("Asia", "एशिया", tokyo, { c: "world" }), ["Asia", "एशिया"]);
  assert.deepEqual(where("Tokyo", "टोक्यो", tokyo, { c: "world" }), ["Tokyo, Japan", "टोक्यो, जापान"], "the country's Hindi name comes from config/countries.json");
});

test("only the country is known, or nothing", () => {
  assert.deepEqual(where("Worldwide", "दुनियाभर", { country: "United States" }, { c: "world" }), ["Worldwide", "दुनियाभर"]);
  assert.deepEqual(where("India.", "भारत।", { country: "India", local: "India" }, IN()), ["India", "भारत"]);
  assert.deepEqual(where("Not mentioned", "Not mentioned", { country: "India" }, IN()), ["India", "भारत"]);
  assert.deepEqual(where("United States", "United States", { country: "United States" }, { c: "world" }), ["United States", "अमेरिका"], "a Hindi answer in English letters gets the country's Hindi name");
  assert.deepEqual(where("Not mentioned", "", {}, IN()), [NOT_SAID.en, NOT_SAID.hi], "nothing known: the row stays hidden");
  assert.deepEqual(where("Not mentioned", "जानकारी नहीं", { country: "Not mentioned" }, IN()), [NOT_SAID.en, NOT_SAID.hi]);
});

test("news from outside India: place, region, country — no tehsil or district labels", () => {
  const md = { country: "United States", state: "Maryland", district: "Prince George's", tehsil: "Temple Hills", local: "Temple Hills", local_hi: "टेम्पल हिल्स", district_hi: "प्रिंस जॉर्ज", state_hi: "मैरीलैंड", country_hi: "संयुक्त राज्य अमेरिका" };
  assert.deepEqual(where("Temple Hills Maryland", "टेम्पल हिल्स मैरीलैंड", md, { c: "world" }), ["Temple Hills, Prince George's, Maryland, United States", "टेम्पल हिल्स, प्रिंस जॉर्ज, मैरीलैंड, अमेरिका"]);
  const asuncion = { country: "Paraguay", state: "Capital District", district: "Asuncion", tehsil: "Asuncion", local: "Asuncion" };
  assert.equal(where("Asuncion, Paraguay.", "", asuncion, { c: "world" })[0], "Asuncion, Capital District, Paraguay", "each name once");
  assert.equal(where("Nasdaq Global Select Market", "", { country: "United States", local: "New York" }, { c: "world" })[0], "Nasdaq Global Select Market, New York, United States");
  // an old story: only the state is known, and it has no Hindi name -> Gemini's own Hindi words + the country
  assert.deepEqual(where("Florida", "फ्लोरिडा", { country: "United States", state: "Florida" }, { c: "world" }), ["Florida, United States", "फ्लोरिडा, अमेरिका"]);
  // a country that is not in config/countries.json: Gemini's Hindi name
  assert.equal(where("Tarawa", "तरावा", { country: "Kiribati", local: "Tarawa", local_hi: "तरावा", country_hi: "किरिबाती" }, { c: "world" })[1], "तरावा, किरिबाती");
});

test("special cases: a state named like its city, and Hindi answers written in English letters", () => {
  const delhi = { country: "India", state: "Delhi", district: "Central Delhi", tehsil: "", local: "Delhi", local_hi: "दिल्ली", district_hi: "मध्य दिल्ली" };
  // Gemini wrote the Hindi answer in English letters: the Hindi names of the place are used
  assert.deepEqual(where("Delhi.", "New Delhi", delhi, IN("dl", "delhi", "", "delhi")), ["Delhi (district Central Delhi), India", "दिल्ली (ज़िला मध्य दिल्ली), भारत"]);
  assert.ok(isNotSaid("Not mentioned.") && isNotSaid("जानकारी नहीं।") && isNotSaid("") && !isNotSaid("Delhi"));
  assert.deepEqual(fixNotSaid(["Not mentioned", "दिल्ली", "जानकारी नहीं"], "hi"), ["जानकारी नहीं", "दिल्ली", "जानकारी नहीं"]);
  assert.deepEqual(fixNotSaid(["जानकारी नहीं", "Delhi"], "en"), ["Not mentioned", "Delhi"]);
});

test("a story's 9 answers for the website", () => {
  const q = (w) => QUESTIONS.map((k) => (k === "where" ? w : k === "whose" ? "Not mentioned" : `${k}…`));
  const place = { country: "India", state: "Uttar Pradesh", district: "Barabanki", tehsil: "Nawabganj", local: "Zaidpur", local_hi: "जैदपुर", tehsil_hi: "नवाबगंज", district_hi: "बाराबंकी" };
  const story = { a: { hi: { q: q("जैदपुर") }, en: { q: q("Zaidpur") }, place }, loc: IN("up", "barabanki", "nawabganj", "zaidpur") };
  const hi = siteAnswers(story, "hi", { states, names, countries });
  assert.equal(hi[WHERE], "जैदपुर (तहसील नवाबगंज, ज़िला बाराबंकी), उत्तर प्रदेश, भारत");
  assert.equal(hi[3], "जानकारी नहीं", "the English 'Not mentioned' inside Hindi answers is put right");
  assert.equal(siteAnswers(story, "en", { states, names, countries })[WHERE], "Zaidpur (tehsil Nawabganj, district Barabanki), Uttar Pradesh, India");
  assert.equal(story.a.hi.q[WHERE], "जैदपुर", "the stored answers are not changed");
});

test("every country in config/countries.json has a Hindi name in Hindi letters", () => {
  for (const [en, hi] of Object.entries(countries)) assert.match(hi, /[ऀ-ॿ]/, en);
  assert.equal(countries["United States"], "अमेरिका");
});
