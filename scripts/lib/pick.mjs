// Which waiting stories Gemini writes in one run (its free limit allows only some of them).
// First the biggest stories. Then the rest is shared out turn by turn, so every group gets short summaries:
// one story per turn from each group's news feeds (Stocks, Sports, Jobs…), from each state's news, from each
// state's district (local) news, and two from national and from world news. Never more than `perFeed` stories
// from one news feed, or 2 from one district, in one run.

// How important a waiting story is: the feed's priority, newer first, all-India news a little higher.
export const scoreOf = (s, now) => s.pr * 10 - ((now - s.p) / 3600e3) * 1.5 + (s.lv === "country" ? 5 : 0) + (s.tr ? -15 : 0);

// The share a story belongs to when the rest is shared out
export const shareOf = (s) => s.gh?.[0] || (s.lv === "district" ? `district:${s.st}` : s.lv === "state" ? `state:${s.st}` : s.lv || "country");

export function pickForAI(waiting, { now = Date.now(), perRun = 96, topFirst = 24, perFeed = 4, perDistrict = 2 } = {}) {
  const list = [...waiting].sort((a, b) => scoreOf(b, now) - scoreOf(a, now));
  const fromFeed = new Map();
  const fromDistrict = new Map();
  const taken = new Set();
  const out = [];
  const districtKey = (s) => `${s.st}/${s.d}`;
  const fits = (s) => (fromFeed.get(s.src) || 0) < perFeed && (s.lv !== "district" || (fromDistrict.get(districtKey(s)) || 0) < perDistrict);
  const take = (s) => {
    fromFeed.set(s.src, (fromFeed.get(s.src) || 0) + 1);
    if (s.lv === "district") fromDistrict.set(districtKey(s), (fromDistrict.get(districtKey(s)) || 0) + 1);
    taken.add(s);
    out.push(s);
  };

  // 1. the biggest stories first
  for (const s of list) {
    if (out.length >= Math.min(topFirst, perRun)) break;
    if (fits(s)) take(s);
  }

  // 2. the rest, turn by turn (each share keeps its own best-first order; shares with bigger news go first)
  const shares = new Map();
  for (const s of list) {
    if (taken.has(s)) continue;
    const k = shareOf(s);
    if (!shares.has(k)) shares.set(k, []);
    shares.get(k).push(s);
  }
  const turns = (k) => (k === "country" || k === "world" ? 2 : 1);
  let moved = true;
  while (out.length < perRun && moved) {
    moved = false;
    for (const [k, queue] of shares) {
      for (let t = 0; t < turns(k) && out.length < perRun; t++) {
        while (queue.length && !fits(queue[0])) queue.shift();
        if (!queue.length) break;
        take(queue.shift());
        moved = true;
      }
    }
  }
  return out;
}
