# Product Price Tracker — Implementation Plan
### INE Software Engineer Intern Assignment

---

## 1. Core Architectural Decision (resolves the tracking-model doubt)

**Model chosen: single global tracked list. No auth, no cookies, no per-user state.**

Rationale, straight from the assignment text:
- "Your **live dashboard** must have at least 2-3 products tracked" — singular dashboard, not per-visitor.
- "Persist tracked products in Supabase" — one durable list, not session-scoped.
- Nowhere does the spec mention login, accounts, or personalization.
- Evaluation criteria are 100% about scraper reliability and honest logging — never about multi-tenancy.

**How it works:**
1. `tracked_products` table in Supabase holds every product+option anyone has ever chosen to track.
2. Searching a product does **not** track it — it just previews search results from the mock store.
3. Clicking "Track this option" inserts a row into `tracked_products` (idempotent — skip if that store product ID + option is already tracked).
4. The scheduled scraper (triggered externally every 2 hours) iterates over **all rows** in `tracked_products`, not anything user-specific.
5. The dashboard, on load, simply does `GET /tracked-products` and renders every tracked product with its own chart + scrape log. Anyone who opens the site sees the same board.

This avoids auth entirely (not asked for, adds complexity with zero credit) and matches "no over-engineering."

---

## 2. Tech Stack (as mandated by the assignment — non-negotiable)

| Layer | Choice |
|---|---|
| Frontend | React + Vite, deployed on Vercel |
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Scraping | `axios` + `cheerio` (lightweight) as default; `Playwright` only for parts of the mock store that genuinely need JS rendering |
| Scheduling | External cron via cron-job.org hitting a protected backend endpoint |
| Styling | Vanilla CSS (per your methodology — no Tailwind) |
| No TypeScript, no Next.js, no Redux/Zustand — per your methodology doc |

---

## 3. Folder Structure (adapted from your MVC methodology)

Your standard structure fits well. Auth folder is dropped (not needed). A `scraper/` module is added since scraping is the heart of this assignment and deserves its own clean layer (still simple, not a "service layer" abstraction — just where scraping logic physically lives, same spirit as your `authentication/` folder).

```
project-root/
├── backend/
│   ├── app.js                        # middleware, DB connect, mounts routers, starts server
│   ├── package.json
│   ├── .env
│   ├── config/
│   │   └── supabaseClient.js         # single exported Supabase client instance
│   ├── models/
│   │   ├── TrackedProduct.js         # DB access functions for tracked_products table
│   │   └── ScrapeLog.js              # DB access functions for scrape_logs table
│   ├── controllers/
│   │   ├── ProductControllers.js     # search store, add/remove tracked product, list tracked
│   │   ├── ScrapeControllers.js      # trigger scrape (cron endpoint), get history, get logs
│   │   └── ExportControllers.js      # CSV export
│   ├── routers/
│   │   ├── productRouter.js
│   │   ├── scrapeRouter.js
│   │   └── exportRouter.js
│   └── scraper/
│       ├── scrapeProduct.js          # core scrape-one-product function (retry logic lives here)
│       ├── storeClient.js            # low-level fetch/parse helpers for the mock store
│       └── runHeaded.js              # standalone script: headless:false Playwright run for recording
│
└── frontend/
    └── price-tracker-Frontend/
        ├── index.html
        ├── vite.config.js
        ├── package.json
        ├── .env
        ├── src/
        │   ├── main.jsx
        │   ├── App.jsx                # only <Routes>
        │   └── App.css                # all global styles
        └── components/
            ├── pages/
            │   ├── SearchPage.jsx         # search mock store, preview results, "Track" button
            │   ├── DashboardPage.jsx      # lists all tracked products (cards)
            │   └── ProductDetailPage.jsx  # one product: chart + table + scrape log + export button
            └── shared/
                ├── ProductCard.jsx        # one tracked-product summary card, used on DashboardPage
                ├── PriceHistoryChart.jsx  # chart component, used on ProductDetailPage
                ├── ScrapeLogTable.jsx     # scrape log table, used on ProductDetailPage
                └── ExportButton.jsx       # CSV export trigger, used on DashboardPage
```

Pages can be composed from smaller, focused components (`shared/`) instead of being single monolithic files. Keep components small and purpose-specific — each one does one clearly named thing, matching your "explicit over implicit, no magic" principle. State that's specific to a page still lives in that page's own file; a shared component only takes props and renders.

---

## 4. Database Schema (Supabase / PostgreSQL)

### `tracked_products`
| column | type | notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | internal ID |
| store_product_id | text | the ID from the store's product page URL |
| product_name | text | |
| option_name | text | e.g. "128GB", "Pack of 3" |
| store_url | text | full product page URL, for the scraper to hit |
| created_at | timestamptz, default now() | when tracking started |
| is_active | boolean, default true | soft-disable instead of delete (keeps history intact) |

Unique constraint on `(store_product_id, option_name)` — this is what makes "track" idempotent.

### `price_history`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| tracked_product_id | uuid, FK → tracked_products.id | |
| price | numeric, nullable | null on failed scrape |
| stock | text, nullable | e.g. "In Stock" / "Out of Stock" / null on failure |
| scraped_at | timestamptz, default now() | |
| outcome | text | 'success' \| 'retried' \| 'failed' |
| attempt_count | int | how many retries it took |
| error_message | text, nullable | for failed/retried rows, short reason |

This single table serves **both** the "price/stock history chart" requirement and the "scrape log" requirement — one row per scrape attempt, successful or not. No need for two separate tables; keeps things simple per your "no over-engineering" instruction. The chart filters `outcome = 'success'`; the log table shows all rows.

---

## 5. Backend API Design (hyphenated, descriptive — per your convention)

| Method | Route | Purpose |
|---|---|---|
| GET | `/products/search-store?query=...` | Live-search the mock store, return matched products + their options (not persisted) |
| POST | `/products/track-product` | Body: `{ storeProductId, productName, optionName, storeUrl }` → inserts into `tracked_products` if not already tracked |
| GET | `/products/list-tracked` | Returns all rows from `tracked_products` (for the dashboard) |
| DELETE | `/products/untrack-product/:id` | Sets `is_active = false` |
| POST | `/scrape/run-scheduled-scrape` | **Cron-triggered.** Protected by a shared secret header/query param. Loops all active tracked products, scrapes each, writes to `price_history` |
| GET | `/scrape/product-history/:trackedProductId` | Returns price/stock history for chart + table |
| GET | `/scrape/product-log/:trackedProductId` | Returns scrape log rows (can reuse the same query as history, filtered/sorted) |
| GET | `/export/export-history-csv` | Streams full CSV across all products per spec's column list |

Every controller function gets a one-line comment above it stating what `req.body`/`req.params`/`req.query` must contain, per your methodology.

---

## 6. Scraping Strategy (the core of the assignment)

### 6.1 Reconnaissance step (do this first, before writing code)
Manually browse `https://demo.inelabteamdev.com/` in DevTools:
- Is the product list/price rendered in the initial HTML, or injected by JS after load? → decides `axios+cheerio` vs `Playwright`.
- Note the URL pattern for product pages (this gives you `store_product_id`).
- Watch Network tab for a few minutes — does the store simulate slow responses, random errors, or delayed content on every page, or only some?

### 6.2 Fetching approach
- Default: `axios` (with a reasonable timeout, e.g. 10s) + `cheerio` for parsing. This satisfies "prefer lightweight HTTP fetching."
- Escalate to Playwright **only** for the specific pages/elements confirmed in 6.1 to require JS rendering (e.g., if price loads async via a client-side fetch). Keep this isolated to `storeClient.js` so the rest of the code doesn't care which method is used underneath.

### 6.3 Reliability logic (lives entirely in `scraper/scrapeProduct.js`)
```
function scrapeProductWithRetry(product):
    attempt = 0
    max_attempts = 3
    while attempt < max_attempts:
        attempt += 1
        try:
            result = fetchAndParse(product.storeUrl)   # throws on timeout/5xx/parse-failure
            if result.price is null or result.stock is null:
                raise ParseError   # treat incomplete data as a failure, never store partial data
            outcome = attempt > 1 ? 'retried' : 'success'
            save price_history row (price, stock, outcome, attempt, error=null)
            return
        except error:
            wait(backoff(attempt))   # e.g. 1s, 3s, then give up
            last_error = error
    # all attempts exhausted
    save price_history row (price=null, stock=null, outcome='failed', attempt=max_attempts, error=last_error.message)
```

Key guarantees this gives you, matching the evaluation criteria directly:
- **Never stores wrong or partial data** — a scrape only counts as success if both price and stock parsed cleanly.
- **Retries with backoff** before giving up.
- **Failures are always logged**, never silently dropped — satisfies "Honest History and Logging."
- One try/catch boundary, no nested abstractions — satisfies "no over-engineering."

### 6.4 Handling page-structure drift (optional bonus, cheap to add)
In `fetchAndParse`, if your CSS selector for price/stock returns nothing, that's already caught as a `ParseError` above and logged as failed — you get "change detection" almost for free by just logging the error message (e.g. "price selector not found") distinctly from a timeout. This alone is enough to claim the "structure change flag" bonus without extra code.

### 6.5 Headed/observable run
`scraper/runHeaded.js` — a standalone Node script (not wired into the API) that launches Playwright with `headless: false`, navigates to one hardcoded tracked product's URL, and runs through the same fetch logic, deliberately logging each retry to the console so it's visible on screen. This is what you screen-record for the deliverable. Keep it a thin wrapper around the same `scrapeProduct` function used in production — don't duplicate logic.

---

## 7. Scheduling (2-hour cron via cron-job.org)

- Backend exposes `POST /scrape/run-scheduled-scrape`, protected by a secret (e.g. `?token=...` checked against an env var `CRON_SECRET`). Reject with 401 if missing/wrong.
- On cron-job.org: create a job hitting that URL every 2 hours.
- Because Render free tier sleeps, also either:
  - (a) let the cron call itself act as the wake-up ping (accept the extra ~30–60s cold-start delay), or
  - (b) add a second, more frequent cron job hitting a lightweight `GET /health` route just to keep the instance warm.
- Document the exact schedule and both env vars in the README, as required by deliverables.

---

## 8. Frontend Pages (per your MVC "View" conventions — component-based, local state only)

**`SearchPage.jsx`**
- Text input (via `useRef`, per your convention) + "Search" button.
- Calls `/products/search-store`, renders matched products with their options.
- Each option has a "Track" button → calls `/products/track-product`, then `useNavigate` to `/dashboard`.

**`DashboardPage.jsx`**
- On mount (`useEffect`), calls `/products/list-tracked`.
- Renders a `ProductCard` per tracked product: name, option, current/last price & stock, small link to detail page.
- Renders `ExportButton` at the top → triggers download from `/export/export-history-csv`.

**`ProductDetailPage.jsx`**
- Reads `trackedProductId` from route params.
- Fetches `/scrape/product-history/:id` → renders it via `PriceHistoryChart` (a lightweight library like `recharts`, or even a plain `<canvas>`/CSS-bar chart if you want zero new dependencies) plus a table of price/stock over time.
- Fetches `/scrape/product-log/:id` → renders via `ScrapeLogTable` (timestamp, outcome, attempt count, error if any).

Data fetching and page-level state (loading, fetched lists) stay in the page component; `shared/` components are presentational — they receive data as props and don't call the API themselves. No global state, no API service layer, no Redux — matches your methodology exactly.

---

## 9. CSV Export

`GET /export/export-history-csv`:
- Joins `price_history` with `tracked_products`.
- One row per scrape attempt: `store_product_id, product_name, option_name, timestamp (ISO 8601 UTC), price, stock, outcome`.
- Failed rows: leave `price`/`stock` empty (not "null" string — actually empty CSV fields).
- Use a minimal CSV writer (hand-rolled `join(',')` with basic quoting, or the tiny `json2csv` package) — no need for a heavy library.

---

## 10. Deployment Checklist

| Piece | Where | Notes |
|---|---|---|
| Frontend | Vercel | Set `VITE_SERVER_URL` env var to Render backend URL |
| Backend | Render | Set `MONGO_URL`→ N/A (using Supabase instead), `SUPABASE_URL`, `SUPABASE_KEY`, `CLIENT_URL`, `CRON_SECRET` |
| Database | Supabase | Create the two tables above via SQL editor; grab connection URL + anon/service key |
| Cron | cron-job.org | Point at `https://<render-backend>/scrape/run-scheduled-scrape?token=<CRON_SECRET>`, every 2 hours |

Before submission: confirm the live dashboard already shows 2–3 tracked products with real accumulated history (start tracking early, don't wait until the last day).

---

## 11. Build Order (suggested milestones)

1. Supabase project + both tables created; backend connects successfully (health check route).
2. Manual reconnaissance of the mock store (Section 6.1) — do not skip this.
3. `scraper/storeClient.js` + `scrapeProduct.js` — get one hardcoded product scraping reliably standalone (test via a plain script before wiring to Express).
4. `TrackedProduct` + `ScrapeLog`(reuses price_history) models, `ProductControllers`, `productRouter` — search + track + list-tracked working end-to-end via Postman/curl.
5. `ScrapeControllers` + `scrapeRouter` — wire the cron endpoint, test it manually a few times, confirm rows land correctly (including a forced-failure test).
6. Set up cron-job.org against the deployed backend; let it run for several hours before continuing, so real history accumulates in parallel with frontend work.
7. Frontend: `SearchPage` → `DashboardPage` → `ProductDetailPage` → `ScrapeLogTable`.
8. CSV export.
9. `runHeaded.js` script + record the screen capture (do this once you're confident retries/failures actually trigger — try to catch a genuine slow/failing response on camera, or briefly point at a bad URL to force one for the recording).
10. Deploy all three pieces; verify live cron is hitting the deployed backend, not just localhost.
11. Write README + design note.
12. If time remains, pick 1–2 bonus items (configurable scrape frequency per product and the "extra product info on dashboard" are the cheapest to add given the above structure).

---

## 12. Design Note — what to actually write

Per the deliverable requirement, be specific and honest:
- What made the store awkward (from your Section 6.1 findings) and which selector/timing issue caused the first scraping failures.
- Why you chose axios+cheerio vs. Playwright for which parts.
- The retry/backoff numbers you settled on and why.
- One concrete thing an AI-generated first draft got wrong (e.g., over-abstracted the scraper into multiple classes, or missed that a failed scrape must still log a row) and how you fixed it — this is explicitly asked for, don't skip it.

---

## 13. Explicit Non-Goals (to keep this from becoming over-engineered)

- No authentication/authorization anywhere.
- No global state library.
- No API service layer on the frontend.
- No repository/service-layer abstraction on the backend beyond the four folders above.
- No TypeScript, Tailwind, or Next.js.
- Bonus features are only attempted after the core four features are fully working and the live dashboard has real accumulated history.
