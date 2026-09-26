# 🛒 INE Product Price Tracker

A resilient, full-stack product price and stock monitoring web application built for the **INE Software Engineer Intern Assignment**.

The application tracks product prices and stock availability over time from INE's mock storefront ([demo.inelabteamdev.com](https://demo.inelabteamdev.com/)), which is deliberately engineered with anti-scraping challenges, client-side rendering, synthetic latency, intermittent failures, and internal retry loops.

---

## 🚀 Live Demo & Repository

- **Live Frontend**: [https://your-app.vercel.app](https://your-app.vercel.app) *(replace after deployment)*
- **Live Backend API**: [https://your-app.onrender.com](https://your-app.onrender.com) *(replace after deployment)*
- **Database**: Supabase (PostgreSQL)
- **Repository**: [https://github.com/pchhabra07/INE_ProductPriceTracker](https://github.com/pchhabra07/INE_ProductPriceTracker)

---

## 🏗 Architecture & Tech Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React (Vite) | Single-page application, client routing (`react-router-dom`), responsive modern UI |
| **Styling** | Vanilla CSS | Custom design system with glassmorphism, responsive grids, sleek dark mode, micro-animations |
| **Backend** | Node.js + Express | RESTful API following MVC pattern, modular scrapers, CORS-enabled |
| **Database** | Supabase (PostgreSQL) | Relational schema with `tracked_products` and `price_history` tables |
| **Scraper** | Playwright (Headless & Headed) | Automated browser to handle SPA rendering, anti-bot mouse-tracking, and handshake resolution |
| **Scheduler** | External Cron (`cron-job.org`) | Protected webhook triggering unattended scraping runs every 2 hours |

---

## ⚡ The Scraping Challenge & Reliability Engineering

The mock storefront (`https://demo.inelabteamdev.com`) features several deliberate anti-scraping hurdles:

1. **Pure Client-Side React SPA**: Raw HTTP requests receive an empty `<div id="root"></div>`. Catalog and option chips are rendered dynamically via JavaScript.
2. **Behavioral Anti-Bot Verification (`Ar` Tracker)**:
   - The "Check today's price" button is locked initially (`.offer-locked`).
   - Requires **≥ 8 distinct `mousemove` events** spaced by ≥ 40ms (`minMoves: 8, kr: 40ms`).
   - Requires a minimum dwell time of **600ms** (`minDwellMs: 600ms`) before the button enables.
   - Verifies mouse events originate from trusted user input (`e.nativeEvent.isTrusted`).
3. **Cryptographic Handshake & WASM Proof-of-Work**:
   - The price request initiates `/api/v2/handshake` passing mouse snapshots.
   - A WebAssembly module verifies the signature before returning a price quote.
4. **Synthetic Errors & Store Internal Retries**:
   - The store simulates random network failures, retrying up to 6 times internally with exponential backoff.
   - If the store succeeds → `.offer-ready`. If all 6 fail → `.offer-failed`.
5. **Text & Number Obfuscation**:
   - Price text contains zero-width spaces (`\u200B`), non-breaking spaces (`\u00A0`), full-width Unicode numerals (`０-９`), Euro-style formatting (`,00`), and trailing tax disclaimers.

### 🛠 How We Solved These

- **Reliable Button Unlocking**: Scraper scrolls `.offer-panel` into view, computes its exact bounding box, and dispatches 12 jittered mouse movements (60ms apart) + 700ms dwell wait — exceeding the store's validation criteria 100% of the time.
- **Dual-State Settlement Detection**: Instead of a static sleep, waits dynamically for `.offer-panel.offer-ready` OR `.offer-panel.offer-failed` (up to 90s).
- **Smart Two-Tier Retry Logic**:
  - If the store exhausts all 6 of its own retries (`offer-failed`): failure is recorded **immediately** without re-opening the browser. This is honest — the store itself gave up; the next scheduled cron run (2h later) is the natural retry.
  - If a **transient technical error** occurs (timeout, DOM selector miss, network blip): our outer loop retries up to 3 times with 2s/5s backoff.
- **Bulletproof Unicode Number Sanitizer**: `parsePrice()` normalises full-width Unicode digits, strips invisible characters, removes `,00` and `/-` tax notes, and extracts the exact integer.
- **Honest Logging**: Every scrape attempt (success, retried, or failed) is stored in Supabase with timestamps, attempt counts, and error descriptions. Failed attempts store `NULL` price/stock — never falsifying data.

---

## 📊 Database Schema (Supabase)

```sql
-- 1. tracked_products table
create table if not exists tracked_products (
  id               uuid primary key default gen_random_uuid(),
  store_product_id text        not null,
  product_name     text        not null,
  option_name      text        not null,
  option_index     int         not null,
  store_url        text        not null,
  department       text,
  brand            text,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now(),
  unique (store_product_id, option_name)
);

-- 2. price_history table
create table if not exists price_history (
  id                  uuid primary key default gen_random_uuid(),
  tracked_product_id  uuid        not null references tracked_products(id) on delete cascade,
  price               numeric,                     -- null on failed scrape
  stock               text,                        -- null on failed scrape
  scraped_at          timestamptz not null default now(),
  outcome             text        not null,         -- 'success' | 'retried' | 'failed'
  attempt_count       int         not null,
  error_message       text                         -- null on success
);

create index if not exists idx_price_history_tracked_product
  on price_history(tracked_product_id, scraped_at desc);
```

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

```env
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-or-service-role-key
CLIENT_URL=http://localhost:5173
CRON_SECRET=your-random-secret-token
```

> On Render, set `CLIENT_URL` to your live Vercel frontend URL and `PORT` can be omitted (Render injects it automatically).

### Frontend (`frontend/.env`)

```env
VITE_SERVER_URL=http://localhost:3000
```

> In production on Vercel, set `VITE_SERVER_URL` to your Render backend URL (e.g. `https://your-app.onrender.com`).

---

## 🏃 Setup & Local Development

### Prerequisites

- Node.js 18+ (tested on Node v22)
- Playwright Chromium browser

### Backend

```bash
cd backend
npm install
npx playwright install chromium

# Start the server
node app.js
# or for auto-reload:
npm run dev
```

Backend runs on `http://localhost:3000`. On startup it logs connection status to Supabase.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

---

## ⏰ Scraping Schedule & Cron Configuration

Because free-tier Render instances sleep after inactivity, scheduled scrapes are triggered externally:

- **Schedule**: Every 2 hours (`0 */2 * * *`)
- **Trigger service**: [cron-job.org](https://cron-job.org)
- **Endpoint**: `POST https://your-backend.onrender.com/scrape/run-scheduled-scrape?token=YOUR_CRON_SECRET`
- **Behavior**: The webhook wakes the Render instance, responds immediately with `{ "message": "Scrape job started" }` to avoid HTTP timeouts, then asynchronously scrapes all active tracked products in Supabase.

> Set up a second cron job hitting `GET https://your-backend.onrender.com/health` every 10 minutes to keep the instance warm between scrape runs.

---

## 🎥 Observable (Headed) Run for Recording

To watch the scraper in headed mode (visible browser, slow-motion actions):

```bash
cd backend
node scraper/runHeaded.js
```

**What you will observe:**
1. Browser window opens visibly (`headless: false`, `slowMo: 400ms`).
2. Navigates to the product page and dismisses the cookie consent banner.
3. Selects the target product option chip.
4. Performs 12 simulated mouse movements across the price panel with dwell wait.
5. The "Check today's price" button unlocks and is clicked.
6. The store's internal retry indicator (`Retrying Attempt x/6`) displays on screen during intermittent failures.
7. If all store retries fail, the terminal logs honest failure immediately (no redundant outer retry).
8. On success, the resolved price and stock pill are highlighted and logged to the console.

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check / keep-warm ping |
| `GET` | `/products/search-store?query=` | Search store catalog (cached 15 min) |
| `GET` | `/products/product-options?storeUrl=` | Fetch option chips for a product |
| `POST` | `/products/track-product` | Track a product + run immediate first scrape |
| `GET` | `/products/list-tracked` | List all active tracked products |
| `DELETE` | `/products/untrack-product/:id` | Soft-delete (deactivate) a tracked product |
| `POST` | `/scrape/run-scheduled-scrape?token=` | Cron-triggered batch scrape (all products) |
| `POST` | `/scrape/scrape-now/:trackedProductId` | On-demand manual scrape for one product |
| `GET` | `/scrape/product-history/:trackedProductId` | Full price history for one product |
| `GET` | `/export/export-history-csv` | Download full history as CSV |

---

## 📝 Design Note

### Trade-offs Made

1. **Playwright vs. Lightweight HTTP**: The entire storefront is a client-side React SPA. The price retrieval executes a client-side WebAssembly handshake and validates native browser mouse events — making lightweight HTTP parsing infeasible. Playwright was the deliberate, correct choice for the price scrape. The catalog search and product options fetch, however, *do* use lightweight HTTP (`axios`) against the store's public `/api/v2/listings` and `/api/v2/items/:id` endpoints — only reaching for Playwright where the page genuinely requires it.

2. **Async Cron Webhook**: Render's free tier has a hard HTTP request timeout. The scrape endpoint responds immediately with HTTP 200 and runs the batch scrape asynchronously in the background to avoid the connection being dropped mid-scrape.

3. **Smart Two-Tier Retry**: Rather than blindly retrying 3 times regardless of the failure cause, our scraper distinguishes between *store-exhausted* failures (the store itself ran all 6 retries → record failure immediately, no re-open) and *transient* technical failures (network timeouts, DOM errors → retry up to 3 times with backoff). This is honest to the assignment's requirement that failures be recorded truthfully.

4. **In-Memory Catalog Cache**: The catalog (960 products, 16 pages) is fetched once via parallel HTTP requests and cached for 15 minutes. This reduces search latency from ~5s to ~0ms for repeated queries.

### What AI Tools Got Wrong on First Attempt & How We Corrected It

1. **The ASCII vs. Unicode Apostrophe**: Initial code targeted `button[aria-label="Check today's price"]` (ASCII `'`). The store uses a right single quotation mark `'` (`U+2019`). Locators timed out silently. Fixed by targeting `.offer-panel button` instead.

2. **The Hover Illusion**: Initial approach assumed `offerPanel.hover()` would unlock the button. Inspecting the compiled application bundle (`index-GaW5Fnef.js`) revealed the internal `Ar` tracker class requiring ≥ 8 moves at ≥ 40ms intervals and ≥ 600ms dwell time. Replaced with a 12-step programmatic mouse trajectory.

3. **Number Parsing & Zero-Width Traps**: Standard `parseFloat` failed on `₹ ４２,１４１` due to full-width Unicode digits and hidden zero-width spaces. Designed a comprehensive Unicode-cleaning pipeline that normalises full-width digits (`\uFF10-\uFF19`), strips invisible characters, removes `,00` cent suffixes, and extracts the correct integer.

4. **Blind Outer Retrying on Store Exhaustion**: Initial retry logic re-opened a browser up to 3 times even when the store's own 6-attempt mechanism had explicitly reported failure (`offer-failed`). This was wasteful (4.5 min worst case) and somewhat dishonest. Refactored using a `StoreExhaustedError` sentinel class: store exhaustion → record failure immediately; transient error → retry with backoff.
