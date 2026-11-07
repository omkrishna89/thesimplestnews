// The news database: one gzip-compressed JSON file. On GitHub it lives in the "data" branch,
// which is replaced (not added to) on every run, so the repository doesn't keep growing.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ROOT } from "./util.mjs";

export const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || ".data");
const FILE = path.join(DATA_DIR, "db.json.gz");

export function loadDB() {
  try {
    const db = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8"));
    db.stories ||= [];
    db.seen ||= {};
    db.feeds ||= {};
    db.names ||= {};
    return db;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`[db] could not read ${FILE}: ${err.message} (starting empty)`);
    return { v: 1, stories: [], seen: {}, feeds: {}, names: {}, metals: null };
  }
}

export function saveDB(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db.saved = Date.now();
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(db), { level: 9 }));
  fs.renameSync(tmp, FILE);
  return fs.statSync(FILE).size;
}

// Words used to spot the same story from two websites
const STOP = new Set(
  "the a an of in on at to for and or is are was were be been with by from as after over into about new news latest live update updates today says said will can not no its it this that these those his her their our your india indian top big".split(" ").concat(
    "का की के में से को पर और है हैं था थे थी ने एक यह वह ये वो भी तो ही लिए बाद साथ अब तक कर किया किए गया गई गए हुआ हुई हुए होगा होगी जा रहा रही रहे नहीं कहा बोले बताया खबर ताज़ा ताजा लाइव अपडेट आज".split(" "),
  ),
);

export function words(s = "") {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ\s]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

export function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
