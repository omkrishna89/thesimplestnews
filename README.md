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
| News from many websites | 377 free news feeds: national (NDTV, The Hindu, ThePrint, India Today, BBC Hindi, Aaj Tak…), world, the groups, 10 states and **275 districts** (UP, Bihar, MP, Rajasthan, Delhi, Haryana, Jharkhand, Uttarakhand, Chhattisgarh, Himachal). List: `config/sources.json` |
| Shortest, simplest headline + 9 answers | Gemini reads the full article (only where the website's robots.txt allows) and writes both languages |
| "Where?" = the complete location | Always `[exact spot,] place (tehsil X, district Y), state, country`, e.g. **Sadar Hospital, Supaul (tehsil Supaul, district Supaul), Bihar, India** — in Hindi **जैदपुर (तहसील नवाबगंज, ज़िला बाराबंकी), उत्तर प्रदेश, भारत**. The website builds it from the place details Gemini gives with every story, so old and new stories look the same. A part that is not known is left out (the tehsil is never guessed). News about a whole state, the whole country or several places keeps Gemini's words (**Bihar, India** · **Bihar and Jharkhand, India**); news from outside India has no tehsil or district (**Paris, France**). Code: `scripts/lib/answers.mjs` |
| 11 groups — and only these | Scams & Fraud (online, bank and UPI frauds, fake calls, digital arrest, job/loan/investment scams, big money scams and corruption), Startups, AI, Business, Stock Market, Politics, Govt Schemes, Bank & Money, Farming & Mandi, Tech & Mobiles, Science & Space. Every other story (cricket and sports, films, crime, accidents, weather, religion, jobs and exam results, health, schools and colleges, cars and bikes, gold and silver prices…) is left out, so all news fits in Gemini's free limit. **All scam and fraud news is only in Scams & Fraud** (not also in Bank & Money, Business…). List: `config/groups.json` |
| Sorting | In every run, Gemini first sorts the new headlines into the 11 groups (150 headlines in one request, so it costs little of the free limit), or "other" — those are left out and never written. A leader at a festival, temple or wedding, police raids, fires and accidents, meetings that decide nothing new, wishes and birthdays are "other" too. The 🔥 Trending topics are sorted the same way |
| Group buttons | One line of buttons; **More ▾** shows all of them, **Less ▴** one line again. Tap one group, then more: the news of **all picked groups** shows together (tap again to remove one, **Home** = all news). The reader's picks are remembered on their phone |
| A story's groups | The AI picks them when it writes the story. Before that: the groups it sorted the headline into; before sorting, the news feed's group and clear words in the headline (सेंसेक्स, IPO → Stocks…). Words: `config/words.json` |
| Stocks | On Stock Market there is one search bar, like on every page: while typing it also suggests stocks (Hindi or English, about 145 big companies, e.g. Reliance = रिलायंस). Tap a suggestion to follow that stock: then only news about the followed stocks shows, from Stock Market and Business (remembered as the reader's watchlist). **Enter** still searches the news |
| Area tabs on every group | District · State · Country · World. **World shows all news** (India’s and the rest of the world’s). The reader's place comes from **GPS (one tap)**; without GPS it is guessed from their internet connection. A nearly empty tab shows a link like "See 94 stories in Country →" |
| Search | The search box on Home (and 🔍 in the top bar of every page) looks through every story of the last 7 days, in both languages, with the same tabs, sort and day choices. Spellings are forgiven (janata = janta, bharatiya = bhartiya, हिन्दी = हिंदी, कॉकरोच = कोकरोच) and small typing mistakes too; rare words count most (a common word like "party" may be missing); short forms work both ways (Cockroach Janta Party = CJP). Code: `src/assets/js/search.js` |
| News from the whole internet | A search also looks through news websites worldwide (the free **GDELT Project**, 10–20 seconds) and the topic's news links from Google Trends. That news joins the same list, mixed in by time, in the same short simple form: its headline is written again by AI (Hindi view: simple Hindi), and a tap writes its 9 short answers from the article right then (the website's link is at the bottom). A search in Hindi letters is turned into English words for this. The AI is Cloudflare's own free AI, through a free Cloudflare Worker (Step 10); it reads an article only where the website's robots.txt allows. At the end: a **Google News** button with the same words |
| 🔥 Trending | Only on Home, under the search box: what India searches on Google right now (Google Trends' free feed, every 30 minutes; Hindi and English topics, only the ones in our groups). Names are written properly (rajat patidar → **Rajat Patidar**, ben vs mah → **Bengal vs Maharashtra**). One line; **More ▾** shows the rest. Tap a topic to search it |
| Click a headline | 1st click: the 9 answers open right there (open as many as you like). 2nd click: closed again. The **Open news page** button at the bottom of an open story goes to its own page with **all sources** (before Gemini has written it: the news website) |
| Hover 1 second (computer) / hold 1 second (phone) | A pop-up box with the whole story and all 9 answers |
| Sort and day | Newest (default) · Big stories · Most important · Relevant (what this reader opens most) — and All days / Today / Yesterday / pick a day / pick dates (from … to) |
| Page width | The news uses the full width. A right-hand column appears only for the side ad, once AdSense is on |
| Look | Dark by default, **Light** button next to हिंदी / English. The language follows the phone; the reader's choice is remembered |
| Ads | Google AdSense spots on every page (banner, in the lists, right-hand column, end of story) + Auto ads |
| Trust pages | About (with the editor, **Om Krishna, Founder & Editor**), **Editorial Policy** (how stories are chosen and written by AI, corrections, independence), Contact (grievance officer), Privacy Policy, Terms, Disclaimer. Every story page tells Google its author (The Simplest News Desk), publisher and editorial policy. Editor: `config/site.json` → `editor` |
| Corrections | A wrong story can be removed, or get a dated correction note at its top — see "Fix or remove a wrong story" below |
| Stories kept | 7 days, also the ones Gemini has not written (so the search finds a whole week). Gemini writes a story only in its first 36 hours; until then it shows "summary coming soon", after that just its headline and link |
| Search engines | Sitemaps for Google and Bing; after every update the new story pages are sent to Bing, Yahoo, Yandex and others through **IndexNow**, so they appear within minutes |
| Visitor statistics | Google Analytics, once its Measurement ID is in `config/site.json` (Step 9). It loads after the page, so reading is not slowed |

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
`https://omkrishna89.github.io/thesimplestnews/` (the address follows the repository's name). From then on it updates every 30 minutes
once the timer of Step 8 is set up.

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

### Step 6 — Google Search Console (free: proves the site is yours and gives Google the sitemaps)
1. Open <https://search.google.com/search-console> and sign in with your Gmail.
2. Top left, open the property menu → **Add property** → in the right-hand box (**URL prefix**) type `https://thesimplestnews.com/` → **Continue**.
3. Under "Other verification methods" open **HTML tag**. It shows `<meta name="google-site-verification" content="ABC…xyz" />`.
   Copy only the code between the quotes after `content=` (`ABC…xyz`).
4. On GitHub open `config/site.json` (pencil icon) and put the code in `"searchConsole": { … "verification": "ABC…xyz" }` → **Commit changes**.
   Then **Actions** → **Update news** → **Run workflow**, and wait until it is green (10–15 minutes).
5. Back in Search Console → **Verify** → "Ownership verified". Keep the code in `site.json`: Google checks it again from time to time.
6. Left menu **Sitemaps** → type `sitemap.xml` → **Submit**; then `news-sitemap.xml` → **Submit**. "Success" can take a day.
7. Optional, Bing too: <https://www.bing.com/webmasters> → sign in → **Import** from Google Search Console (no code needed).

### Step 6b — Google News
Google News now finds news websites by itself: there is **no "submit" button** any more. The site already does what helps — a
Google News sitemap (`news-sitemap.xml`, Step 6), news markup on every story page, and About, Contact and Privacy pages.
New websites usually wait weeks or months; keep the site updating every 30 minutes.
- To check: open <https://news.google.com> and search `thesimplestnews.com`.
- Once your stories show there, you can set the name, logo (`https://thesimplestnews.com/assets/img/icon-512.png`) and contact at
  <https://publishercenter.google.com> (same Gmail; Google may already have made the publication for you).

### Step 7 — Google AdSense (after the site has run for a couple of weeks on TheSimplestNews.com)
AdSense is free; Google pays you. It wants "valuable, original content", so a site of short summaries can be refused the first
time — Google then says why, and you can fix it and ask again. The About, Contact, Privacy Policy, Terms and Disclaimer pages it asks for are already on the site.
1. Open <https://adsense.google.com> → **Get started** → sign in with your Gmail → your site `thesimplestnews.com` → country **India** → accept the terms.
2. Fill in the payment profile (your name and address, so Google can pay you).
3. Your **publisher ID** (AdSense → **Account** → **Settings** → **Account information**) is already in `config/site.json` →
   `"adsense": { … "client": "ca-pub-3030782557899421" }`. It puts the AdSense code on every page and makes `ads.txt` by itself.
4. Back in AdSense → **Sites** → `thesimplestnews.com` → tick that the code is placed → **Request review**. It takes a few days to a few weeks; Google emails you.
5. After approval: **Ads** → **By ad unit** → make 4 **Display ads** and put their ids in `"slots"`: `top`, `infeed`, `side`, `story`
   (Auto ads already work without them). Spots without an id stay hidden. Add `?ads=preview` to any page address to see where the ads go.
6. When you have earned about $10, Google posts a PIN to your address: type it in AdSense so payments can start.

### Step 8 — The 30-minute timer (free, cron-job.org)
GitHub's own timer often starts hours late, or not at all. A free outside timer presses **Run workflow** every 30 minutes instead
(GitHub's timer stays as a backup; a backup run right after another run skips the news step, to save Gemini's free limit).

1. **A GitHub key that can only press "Run workflow":** open <https://github.com/settings/personal-access-tokens/new>
   - Token name: `cron-job timer` · Expiration: **No expiration** (or the longest you can pick)
   - Repository access: **Only select repositories** → `omkrishna89/thesimplestnews`
   - Permissions → **Actions: Read and write** (nothing else)
   - **Generate token** and copy it (starts with `github_pat_`). Keep it secret.
2. **The timer:** sign up at <https://console.cron-job.org/signup> → **CREATE CRONJOB**
   - COMMON: Title `The Simplest News update` · URL
     `https://api.github.com/repos/omkrishna89/thesimplestnews/actions/workflows/update.yml/dispatches` · Schedule **Every 30 minutes**
   - ADVANCED: Request method **POST** · Headers `Accept` = `application/vnd.github+json` and `Authorization` = `Bearer github_pat_…` (your key)
     · Request body `{"ref":"main"}`. (No `X-GitHub-Api-Version` header: GitHub then uses its current default version, so the timer
     keeps working when an old version is switched off — version 2022-11-28 announces its end for 10 March 2028.)
   - **TEST RUN** → it should answer **204**; then **CREATE**. A new **Update news** run appears on the Actions tab.
3. If the key ever expires, make a new one (point 1) and paste it into the `Authorization` header.

### Step 9 — Visitor statistics (Google Analytics, free)
1. <https://analytics.google.com> → **Start measuring** → account `The Simplest News` → property `TheSimplestNews.com`
   (time zone India, currency ₹) → business details → **Create** → platform **Web** → `thesimplestnews.com` → **Create stream**.
2. Copy the **Measurement ID** (`G-…`), open `config/site.json` on GitHub (pencil icon) and put it in `"analytics": { "ga4": "G-…" }` → **Commit changes**.
   The Privacy Policy page then explains Google Analytics by itself. Reports: <https://analytics.google.com> → **Reports** (live readers under **Realtime**).

### Step 10 — Simple headlines for "On other news websites" (free Cloudflare Worker)
The news from other websites under the search results comes with those websites' own long headlines. A small free program on
Cloudflare (a "Worker", `worker/rewrite.js`) asks Google's free **Gemma** AI to write each one in the shortest, simplest words.
Gemma has its **own free daily limit** (much bigger than Gemini's), so the stories' summaries are not slowed down. Your Gemini key stays
secret inside Cloudflare. No card is needed; Cloudflare's free plan allows 100,000 Worker requests a day. The Worker only works for thesimplestnews.com.
1. Sign up: <https://dash.cloudflare.com/sign-up> → email + password → confirm the email.
2. Left menu **Workers & Pages** (it may be under **Compute**) → **Create application** → **Start with Hello World!** → Worker name
   `simple-headlines` → **Deploy**. (The first time, Cloudflare asks you to pick your free `….workers.dev` name.)
3. **Edit code** → in the code box select everything (Ctrl+A) and delete it → open
   <https://github.com/omkrishna89/thesimplestnews/blob/main/worker/rewrite.js> → **Copy raw file** (the two-squares button above the code)
   → paste into Cloudflare → **Deploy**.
4. Back on the Worker's page → **Settings** → **Variables and Secrets** → **+ Add** → Type **Secret** · Variable name `GEMINI_API_KEY` ·
   Value: your Gemini key (the same one as on GitHub; copy it again at <https://aistudio.google.com/apikey>) → **Deploy**.
   Then Cloudflare's own free AI: **Settings** → **Bindings** → **+ Add binding** → **Workers AI** → Variable name `AI` → **Add binding**.
5. Open the Worker's address (on its page, like `https://simple-headlines.yourname.workers.dev`). It should say
   **✅ The Simplest News headline writer works.**, with "Cloudflare AI (first): on" and "Google Gemma (backup): on". If it shows ❌ or "off",
   it says what is missing.
6. Put the address in `config/site.json` on GitHub → `"rewrite": { … "url": "https://simple-headlines.yourname.workers.dev" }` →
   **Commit changes**, then run **Update news** once. Search something on the site: the other websites' headlines turn simple after a few seconds.

The Worker asks **Cloudflare's own free AI** first (Workers AI: Mistral Small 3.1 — about 1 second, good Hindi — then other models; a free
daily allowance of "neurons", enough for a few hundred searches), and **Google's Gemma** only as a backup (on 17 Nov 2026 Google's free
Gemma 4 models were too busy to use). A model that is busy, fails or takes more than 12 seconds rests for 10 minutes and the next one is
asked (at most 3 for one search). To choose the models yourself, add plain-text variables in **Settings** → **Variables and Secrets**:
`AI_MODEL` (Cloudflare's, e.g. `@cf/meta/llama-4-scout-17b-16e-instruct`) and `GEMMA_MODEL` (Google's) — several separated by commas.
**When `worker/rewrite.js` changes:** Claude deploys it through Cloudflare's API, with an API token ("Edit Cloudflare Workers",
saved only in Claude's private environment "The Simplest News"; delete it anytime at <https://dash.cloudflare.com/profile/api-tokens>).
By hand: open the Worker → **Edit code** → Ctrl+A → paste the new file (step 3) → **Deploy**.
Each answer of the Worker lists the models it asked and how long each took ("tried"), to check its speed.

---

## 3. Changing things

All settings are plain files in `config/`. Edit them on GitHub (pencil icon) and **Commit** — the site rebuilds by itself.

| File | What it holds |
| --- | --- |
| `config/site.json` | Name, address, email, AdSense ids, Google Analytics id, Search Console code, the simple-headlines Worker's address, IndexNow key, how many days to keep, Gemini settings |
| `config/groups.json` | The 11 news groups (name in Hindi/English, icon) |
| `config/words.json` | Clear words that put a story into a group before the AI has written it |
| `config/stocks.json` | Companies the Stocks box suggests (Hindi and English names, and the words that find their news) |
| `config/sources.json` | All news feeds. `level`: country, world, state or district |
| `config/places.json` | States, and other spellings of district names (e.g. Allahabad = Prayagraj) |
| `config/countries.json` | Hindi names of countries, for the "Where?" answer of news from outside India |
| `config/corrections.json` | Wrong stories: removed, or with a correction note (see below) |

To check that all feeds still work: `node scripts/check-feeds.mjs` (see section 5).

### Fix or remove a wrong story
1. Open the story's own page on the site and copy its address, e.g. `https://thesimplestnews.com/story/96665c1da439/`.
2. On GitHub open `config/corrections.json` → pencil icon.
3. Between the `[` and `]` after `"list":`, add one line per story (put a comma between two lines):
   - **Remove it** from the whole site:
     `{ "story": "https://thesimplestnews.com/story/96665c1da439/", "remove": true, "date": "17 Nov 2026" }`
   - **Or add a correction note** at the top of the story, in both languages:
     `{ "story": "https://thesimplestnews.com/story/96665c1da439/", "note_en": "The district is Barabanki, not Lucknow.", "note_hi": "ज़िला बाराबंकी है, लखनऊ नहीं।", "date": "17 Nov 2026" }`
4. **Commit changes.** The site changes with the next update (within 30 minutes), or run **Update news** by hand.
   If the file has a typing mistake (like a missing comma), the site keeps working without the corrections and the run's log says so.

---

## 4. Good to know

- **Gemini's free limit:** a number of requests a day (about 500; Google changes it and doesn't publish it, so the robot
  learns it). Google's day starts at midnight in California (1:30 pm India time). The limit is **spread over the whole day**:
  each run uses only its share of what is left, so the Indian morning gets short summaries too. Each run first sorts the
  new headlines (1–4 requests), then writes 12 stories per request. The 24 biggest stories go first; the rest is shared out
  so every group, every state and every state's districts get some (never more than 4 from one news feed). If Google is
  busy ("high demand"), the robot stops and tries again in the next run. The log shows the tokens each run used — what a
  paid plan would charge. Settings: `config/site.json` → `gemini`.
- **GitHub Pages limits:** the site must stay under 1 GB (it is about 40–200 MB) and about 100 GB of visits a month.
  If the site becomes very popular, move it to **Cloudflare Pages** (also free, no visit limit).
- **The 30-minute schedule:** cron-job.org (Step 8) starts the update every 30 minutes. GitHub's own timer is only a backup:
  it often starts late, and GitHub pauses it in repositories with no changes for 60 days (**Actions** → **Update news** → **Enable workflow**).
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
| `scripts/lib/` | Feed reader, article reader (robots.txt), Gemini, the 9 answers (complete "Where?"), places, Google Trends, page templates |
| `worker/rewrite.js` | The free Cloudflare Worker that writes other websites' headlines in simple words with Gemma (Step 10) |
| `src/assets/js/app.js` | Everything in the browser: answers, pop-up, hold on phones, sort, days, tabs, GPS, language, light/dark |
| `src/assets/js/ui.js` | Shared by the build and the browser: labels in both languages and the HTML of a story |
| `src/assets/css/style.css` | The look (dark and light) |
| `.github/workflows/update.yml` | Runs everything every 30 minutes and publishes to GitHub Pages |
