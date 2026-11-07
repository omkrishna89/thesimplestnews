// Gemini's free limit is a number of requests a day, and Google's day starts at midnight in California.
// Used as fast as possible, it ran out at about 6 AM in India and came back only at 1:30 PM — the Indian morning
// got no short summaries. So each run (one every 30 minutes) may use only its share of what is left today.

const CA = "America/Los_Angeles";
export const googleDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: CA }).format(new Date(t));

// Milliseconds until the next midnight in California
export function msToReset(t) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: CA, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const get = (k) => Number(parts.find((p) => p.type === k)?.value || 0);
  return Math.max(60e3, ((24 - get("hour")) * 3600 - get("minute") * 60 - get("second")) * 1000);
}

// Requests this run may use: an equal share, for every run still to come today, of what is left
export function runBudget({ limit, used, msLeft, every = 30 * 60e3 }) {
  const runsLeft = Math.max(1, Math.ceil(msLeft / every));
  return Math.max(0, Math.floor((limit - used) / runsLeft));
}

// The free limit is not published, so it is learned: when every model said "limit reached", the requests made
// that day are the limit. A day that used nearly all of the guess without reaching it raises the guess by 10%.
export function learnLimit(limit, yesterday) {
  if (!yesterday) return limit;
  if (yesterday.hit) return Math.max(24, yesterday.req);
  return yesterday.req >= limit * 0.9 ? Math.round(limit * 1.1) : limit;
}
