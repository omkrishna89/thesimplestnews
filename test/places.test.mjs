import assert from "node:assert/strict";
import { test } from "node:test";
import { districtSlug, stateCode } from "../scripts/lib/places.mjs";

test("state names and codes", () => {
  assert.equal(stateCode("IN-UP"), "up");
  assert.equal(stateCode("Uttar Pradesh"), "up");
  assert.equal(stateCode("IN-CT"), "cg");
  assert.equal(stateCode("Uttaranchal"), "uk");
  assert.equal(stateCode("Atlantis"), "");
});

test("one spelling for every district", () => {
  assert.equal(districtSlug("up", "Kanpur Nagar District"), "kanpur-nagar");
  assert.equal(districtSlug("up", "Kanpur"), "kanpur-nagar");
  assert.equal(districtSlug("up", "Allahabad"), "prayagraj");
  assert.equal(districtSlug("up", "Barabanki district"), "barabanki");
  assert.equal(districtSlug("hr", "Gurgaon"), "gurugram");
  assert.equal(districtSlug("dl", "South Delhi"), "delhi");
  assert.equal(districtSlug("br", "Purnea"), "purnia");
  assert.equal(districtSlug("jh", "Purbi Singhbhum district"), "east-singhbhum");
});
