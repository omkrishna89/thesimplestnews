// Checks that news feeds work. Useful when a source stops sending news.
//   node scripts/check-feeds.mjs                 -> every feed in config/sources.json
//   node scripts/check-feeds.mjs list.txt        -> URLs in a text file (one per line)
//   node scripts/check-feeds.mjs --find <page>   -> lists feed links found on a website's "RSS" page
import fs from "node:fs";
import { parseFeed } from "./lib/feeds.mjs";
import { config, get, pool } from "./lib/util.mjs";

const args = process.argv.slice(2);

async function check(url) {
  const t0 = Date.now();
  try {
    const res = await get(url, { timeout: 25000 });
    if (!res.ok) return { url, status: res.status, ms: Date.now() - t0 };
    const feed = parseFeed(res.text);
    const items = feed.items;
    const newest = Math.max(...items.map((i) => i.published).filter(Number.isFinite), 0);
    const pct = (f) => (items.length ? Math.round((items.filter(f).length / items.length) * 100) : 0);
    return {
      url,
      status: res.status,
      ms: Date.now() - t0,
      items: items.length,
      ageH: newest ? +((Date.now() - newest) / 3600e3).toFixed(1) : null,
      text: pct((i) => i.text.length > 60),
      img: pct((i) => i.image),
      sample: items[0]?.title.slice(0, 70) || "",
      final: res.url !== url ? res.url : "",
    };
  } catch (err) {
    return { url, status: "ERR", error: String(err.message || err).slice(0, 80), ms: Date.now() - t0 };
  }
}

async function find(page) {
  const res = await get(page, { accept: "text/html" });
  const base = new URL(res.url || page);
  const links = new Set();
  for (const m of res.text.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (/rss|feed|\.xml(\?|$)|\.cms(\?|$)/i.test(href) && !/\.(css|js|png|jpg)(\?|$)/i.test(href)) {
      try {
        links.add(new URL(href, base).toString());
      } catch {}
    }
  }
  console.log([...links].join("\n"));
}

if (args[0] === "--find") {
  await find(args[1]);
} else {
  let urls;
  if (args[0]) {
    urls = fs.readFileSync(args[0], "utf8").split("\n").map((l) => l.trim()).filter((l) => /^https?:\/\//.test(l)).map((l) => l.split(/\s+/)[0]);
  } else {
    urls = (config("sources.json")?.feeds || []).map((f) => f.url);
  }
  const results = await pool(urls, 8, check);
  let bad = 0;
  for (const r of results) {
    const ok = r.status === 200 && r.items > 0;
    if (!ok) bad++;
    console.log(
      [
        ok ? "OK " : "BAD",
        String(r.status).padEnd(3),
        String(r.items ?? "-").padStart(3),
        `age ${r.ageH ?? "-"}h`.padEnd(10),
        `txt ${r.text ?? "-"}%`.padEnd(8),
        `img ${r.img ?? "-"}%`.padEnd(8),
        r.url,
        r.error ? `(${r.error})` : "",
        r.final ? `-> ${r.final}` : "",
        r.sample ? `| ${r.sample}` : "",
      ].join(" "),
    );
  }
  console.log(`\n${results.length - bad} working, ${bad} not working`);
}
