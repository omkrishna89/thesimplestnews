// New trailers and songs from official film & music channels (free YouTube feeds, no key, no AI).
import { parseFeed } from "./feeds.mjs";
import { config, get, pool } from "./util.mjs";

const yt = config("youtube.json");
const keep = new RegExp(yt.keep, "i");
const skip = new RegExp(yt.skip, "i");

export function isTrailerOrSong(title) {
  return keep.test(title) && !skip.test(title);
}

export const videoKind = (title) => (/trailer|teaser|first look|glimpse|ट्रेलर|टीज़र|टीजर/i.test(title) ? "trailer" : "song");

export async function updateVideos(old = [], { keepDays = 7 } = {}) {
  const since = Date.now() - keepDays * 86400e3;
  const byId = new Map(old.filter((v) => v.p >= since).map((v) => [v.id, v]));
  const results = await pool(yt.channels, 6, async (ch) => {
    const res = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.id}`, { timeout: 20000 });
    if (!res.ok) throw new Error(`${ch.name}: HTTP ${res.status}`);
    return parseFeed(res.text).items.map((i) => ({ ...i, channelName: ch.name }));
  });
  let fresh = 0;
  for (const r of results) {
    if (!Array.isArray(r)) continue;
    for (const v of r) {
      if (!v.videoId || !(v.published >= since) || !isTrailerOrSong(v.title) || byId.has(v.videoId)) continue;
      byId.set(v.videoId, { id: v.videoId, t: v.title.slice(0, 160), ch: v.channelName, p: v.published, k: videoKind(v.title) });
      fresh++;
    }
  }
  const failed = results.filter((r) => !Array.isArray(r)).length;
  return { videos: [...byId.values()].sort((a, b) => b.p - a.p).slice(0, 120), fresh, failed };
}
