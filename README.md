# The Simplest News — TheSimplestNews.com

Every news story in the **shortest, simplest words**, in **Hindi and English**, updated by itself every 30 minutes.
Each headline opens **9 answers**: what, who, whom, whose, where, when, why, which, how.

It costs nothing to run:

- **Hosting:** GitHub Pages (free)
- **Robot that reads the news every 30 minutes:** GitHub Actions (free for public repositories)
- **AI that writes the short versions:** Google Gemini, free tier
- **You pay only for the domain** TheSimplestNews.com (about ₹800–1,200 a year)

---

## 1. What the website does

| Feature | How it works |
| --- | --- |
| News from many websites | 389 free news feeds: national, world, 25 groups, 10 states and **277 districts** (UP, Bihar, MP, Rajasthan, Delhi, Haryana, Jharkhand, Uttarakhand, Chhattisgarh, Himachal). List: `config/sources.json` |
| Shortest, simplest headline + 9 answers | Gemini reads the full article (only where the website's robots.txt allows) and writes both languages |
| 25 groups | Local, Startups, AI, Movies, Good News, Road Accidents, Business, Cricket, Sports, Entertainment, Auto, Stock Market, Politics, Govt Schemes, Jobs & Results, Weather, Crime, Health, Education, Gold & Silver, Bank & Money, Farming & Mandi, Tech & Mobiles, Science & Space, Religion & Horoscope |
| Area tabs on every group | Local · Tehsil · District · State · Country · World. The reader's place comes from **GPS (one tap)**; without GPS it is guessed from their internet connection |
| Click a headline | 1st click: the 9 answers open right there (open as many as you like). 2nd click: the story's own page with **all sources** |
| Hover 1 second (computer) / hold 1 second (phone) | A pop-up box with the whole story and all 9 answers |
| Sort and day | Newest (default) · Big stories · Most important · Relevant (what this reader opens most) — and All days / Today / Yesterday / pick a day |
| Movies | New official trailers and songs from YouTube (T-Series, Zee Music, YRF, Netflix India…), play on the site |
| Gold & silver | Today's IBJA rates and 5-year charts, like on IFC knowledge |
| Look | Dark by default, **Light** button next to हिंदी / English. The language follows the phone; the reader's choice is remembered |
| Ads | Google AdSense spots on every page (banner, in the lists, beside the news, end of story) + Auto ads |
| Stories kept | 7 days. Stories Gemini has not written yet show "summary coming soon" for 2 days |

---

## 2. One-time setup (about 30 minutes)

### Step 1 — Turn on GitHub Pages
Repository → **Settings** → **Pages** → **Source: GitHub Actions**.

### Step 2 — Gemini key (free)
1. Open <https://aistudio.google.com/apikey> → **Create API key** → **Create API key in new project**
   (a new project has its own free daily limit, separate from IFC knowledge).
2. Copy the key.
3. Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   → Name: `GEMINI_API_KEY` → Secret: paste the key → **Add secret**.

Without the key the site still works: stories show their original headline with "summary coming soon".

### Step 3 — Start it
Merge the pull request into `main`. The **Update news** run starts by itself (Actions tab). After 10–15 minutes the site is live at
`https://omkrishna89.github.io/thesimplestnews-/` (the address follows the repository's name). From then on it updates every 30 minutes.

To run it by hand: **Actions** → **Update news** → **Run workflow**.

### Step 4 — Your own address TheSimplestNews.com
1. Buy `thesimplestnews.com` at any domain seller (Cloudflare, Namecheap, GoDaddy, Hostinger…). On 3 Nov 2026 it was still free.
2. At the seller, add these DNS records:

   | Type | Name / Host | Value |
   | --- | --- | --- |
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `omkrishna89.github.io` |

3. Repository → **Settings** → **Pages** → **Custom domain**: `thesimplestnews.com` → **Save**. When the check is green, tick **Enforce HTTPS**.
4. Run **Update news** once by hand (Step 3), so every link switches to the new address.

### Step 5 — Email contact@thesimplestnews.com
Most domain sellers forward email for free: create `contact@thesimplestnews.com` → forward to your Gmail.
The Contact page already shows this address.

### Step 6 — Google Search
Open <https://search.google.com/search-console>, add `thesimplestnews.com`, and submit the sitemaps
`https://thesimplestnews.com/sitemap.xml` and `https://thesimplestnews.com/news-sitemap.xml`.

### Step 7 — Google AdSense (after the site has run for a couple of weeks on TheSimplestNews.com)
1. Apply at <https://adsense.google.com> with `thesimplestnews.com`. The About, Contact, Privacy Policy, Terms and Disclaimer pages that AdSense asks for are already on the site.
2. When approved, open `config/site.json` on GitHub (pencil icon) and fill in:
   - `"client": "ca-pub-…"` — your publisher ID
   - `"slots"` — the ids of 4 display ad units you create in AdSense → **Ads** → **By ad unit**: `top`, `infeed`, `side`, `story`
3. **Commit changes.** The site rebuilds in a few minutes; `ads.txt` is made by itself.
   Spots without an id stay hidden. Add `?ads=preview` to any page address to see where the ads go.

---

## 3. Changing things

All settings are plain files in `config/`. Edit them on GitHub (pencil icon) and **Commit** — the site rebuilds by itself.

| File | What it holds |
| --- | --- |
| `config/site.json` | Name, address, email, AdSense ids, how many days to keep, Gemini settings |
| `config/groups.json` | The 25 news groups (name in Hindi/English, icon) |
| `config/sources.json` | All news feeds. `level`: country, world, state or district |
| `config/youtube.json` | Film and music channels for trailers & songs |
| `config/places.json` | States, and other spellings of district names (e.g. Allahabad = Prayagraj) |

To check that all feeds still work: `node scripts/check-feeds.mjs` (see section 5).

---

## 4. Good to know

- **Gemini's free limit:** about 1,000 requests a day (Google changes this). Each request writes 6 stories, and the biggest stories go first. If Google is busy ("high demand"), the robot stops and tries again in the next run.
  When the limit is used up, new stories show "summary coming soon" until the next day's limit (around 1:30 pm India time).
  Settings: `config/site.json` → `gemini`.
- **GitHub Pages limits:** the site must stay under 1 GB (it is about 40–200 MB) and about 100 GB of visits a month.
  If the site becomes very popular, move it to **Cloudflare Pages** (also free, no visit limit).
- **The 30-minute schedule:** GitHub may pause schedules in repositories with no changes for 60 days. If that happens:
  **Actions** → **Update news** → **Enable workflow**.
- **Copyright:** the site shows only its own short summary and a link to the original. Websites that ask robots to stay away
  (robots.txt) are not read. If a publisher asks for a story to be removed, delete it from the site and tell them.
- **Indian rules for digital news:** read the IT Rules 2021 (digital news publishers / news aggregators) and ask a lawyer
  whether you need to inform the Ministry of Information & Broadcasting and name a grievance officer. The Contact page already
  has a grievance section with your email.

---

## 5. For developers

Needs Node.js 20 or newer.

```sh
npm install
MOCK_AI=1 node scripts/update.mjs   # read the feeds (MOCK_AI: stand-in answers, no Gemini key needed)
node scripts/build.mjs              # build the site into _site/
npm start                           # preview at http://localhost:8080
npm test                            # tests
node scripts/check-feeds.mjs        # check every news feed
```

| Path | What it is |
| --- | --- |
| `scripts/update.mjs` | Reads feeds, reads articles, asks Gemini, keeps 7 days (database: `.data/db.json.gz`, saved in the `data` branch) |
| `scripts/build.mjs` | Makes every page and the data files the pages load (`/data/{hi,en}/…/{day}.json`) |
| `scripts/lib/` | Feed reader, article reader (robots.txt), Gemini, places, gold & silver, YouTube, page templates |
| `src/assets/js/app.js` | Everything in the browser: answers, pop-up, hold on phones, sort, days, tabs, GPS, language, light/dark |
| `src/assets/js/ui.js` | Shared by the build and the browser: labels in both languages and the HTML of a story |
| `src/assets/css/style.css` | The look (dark and light) |
| `.github/workflows/update.yml` | Runs everything every 30 minutes and publishes to GitHub Pages |
