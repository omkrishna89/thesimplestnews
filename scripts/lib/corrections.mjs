// Fixes for wrong stories, from config/corrections.json: remove a story, or show a correction note at its top.
// A story is named by its address (https://thesimplestnews.com/story/96665c1da439/) or just its id.
export const storyId = (x) => (/(?:^|\/story\/)([A-Za-z0-9_-]{3,40})\/?$/.exec(String(x ?? "").trim()) || [])[1] || "";

export function readCorrections(cfg) {
  const remove = new Set();
  const notes = new Map();
  for (const c of Array.isArray(cfg?.list) ? cfg.list : []) {
    const id = storyId(c?.story);
    if (!id) continue;
    if (c.remove === true) remove.add(id);
    else if (c.note_en || c.note_hi) {
      const en = String(c.note_en || c.note_hi).trim().slice(0, 500);
      const hi = String(c.note_hi || c.note_en).trim().slice(0, 500);
      notes.set(id, { en, hi, date: String(c.date ?? "").trim().slice(0, 40) });
    }
  }
  return { remove, notes };
}
