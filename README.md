# 🛒 INE Product Price Tracker

A resilient, full-stack product price and stock monitoring web application built for the **INE Software Engineer Intern Assignment**.

The application tracks product prices and stock availability over time from INE's mock storefront ([demo.inelabteamdev.com](https://demo.inelabteamdev.com/)), which is deliberately engineered with anti-scraping challenges, client-side rendering, synthetic latency, intermittent failures, and internal retry loops.

---

## 🚀 Live Demo & Repository

- **Live Frontend**: Deployed on Vercel
- **Live Backend API**: Deployed on Render
- **Database**: Supabase (PostgreSQL)
- **Repository**: [GitHub Repository](https://github.com/pchhabra07/INE_ProductPriceTracker)

---

## 🏗 Architecture & Tech Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React (Vite) | Single-page application, client routing (`react-router-dom`), responsive modern UI |
| **Styling** | Vanilla CSS | Custom design system with glassmorphism, responsive grids, sleek dark mode accents, micro-animations |
| **Backend** | Node.js + Express | RESTful API following MVC pattern, modular scrapers, CORS-enabled |
| **Database** | Supabase (PostgreSQL) | Relational schema with `tracked_products` and `price_history` tables |
| **Scraper** | Playwright (Headless & Headed) | Automated browser engine to handle SPA rendering, anti-bot mouse-tracking, and handshake resolution |
| **Scheduler** | External Cron (`cron-job.org`) | Protected webhook triggering unattended scraping runs every 2 hours |

---

## ⚡ The Scraping Challenge & Reliability Engineering

The mock storefront (`https://demo.inelabteamdev.com`) features several deliberate anti-scraping hurdles:

1. **Pure Client-Side React SPA**: Raw HTTP requests (e.g. `axios`/`curl`) receive an empty `<div id="root"></div>`. Product catalogs and option chips are rendered dynamically via JavaScript.
2. **Behavioral Anti-Bot Verification (`Ar` Tracker)**:
   - The "Check today’s price" button is locked initially (`.offer-locked`).
   - The store tracks mouse movements: it requires **at least 8 distinct `mousemove` events** spaced by at least **40ms** (`minMoves: 8, kr: 40ms`).
   - It requires a minimum dwell time of **600ms** (`minDwellMs: 600ms`) before the button becomes enabled.
   - It verifies that mouse events and clicks originate from trusted user input (`e.nativeEvent.isTrusted`).
3. **Cryptographic Handshake & WASM Proof-of-Work**:
   - The price request initiates `/api/v2/handshake` passing mouse movement snapshots.
   - A WebAssembly module verifies the cryptographic signature before returning a quote pass.
4. **Synthetic Errors & Store Internal Retries**:
   - The store simulates random network failures and 5xx errors, retrying up to 6 times internally with exponential backoff (`phase: 'retrying' (attempt n/6)`).
   - If the store succeeds, it transitions to `.offer-ready`.
   - If all 6 attempts fail, it transitions to `.offer-failed`.
5. **Text & Number Obfuscation**:
   - The price text contains injected zero-width spaces (`\u200B`), non-breaking spaces (`\u00A0`), spaced thousands, Euro-style formatting (`,00`), full-width Unicode numerals (`０-９`), and trailing tax disclaimers (`/- (incl. of all taxes)`).

### 🛠 How We Solved These in `scraper/scrapeProduct.js`

- **Reliable Button Unlocking**: The scraper scrolls `.offer-panel` into view, calculates its exact bounding box, and dispatches 12 jittered mouse movements separated by 60ms pauses, followed by a 700ms dwell wait. This guarantees the store's validation criteria are met 100% of the time.
- **Dual-State Settlement Detection**: Rather than waiting with a static sleep, the scraper waits dynamically for either `.offer-panel.offer-ready` OR `.offer-panel.offer-failed` (up to 90s). If `.offer-failed` occurs, it immediately catches it without unnecessary stalling.
- **Resilient Outer Retry Loop**: Our scraper wraps the operation in an outer 3-attempt retry loop with exponential backoff (2s, 5s) to recover from transient network drops.
- **Bulletproof Unicode Number Sanitizer**: The `parsePrice` function maps full-width Unicode numerals (`\uFF10-\uFF19`) to standard ASCII digits, strips zero-width and non-breaking characters, strips `,00` and `/-` tax notes, and safely extracts the exact integer price.
- **Honest Logging**: Every scrape attempt (success, retried, or failed) is stored in Supabase with exact timestamps, attempt counts, and error descriptions. Failed attempts leave price and stock `NULL`, never falsifying data.

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
  outcome             text        not null,        -- 'success' | 'retried' | 'failed'
  attempt_count       int         not null,
  error_message       text
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
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
CRON_SECRET=your-random-cron-secret-token
```

### Frontend (`frontend/.env`)
```env
VITE_SERVER_URL=http://localhost:3000
```
*(In production, set `VITE_SERVER_URL` to your Render backend URL)*

---

## 🏃 Setup & Local Development

### 1. Prerequisites
- Node.js 18+ (tested on Node v22)
- Playwright Chromium browser installed

### 2. Backend Setup
```bash
cd backend
npm install
npx playwright install chromium

# Start the server
node app.js
```
The backend will run on `http://localhost:3000`.

### 3. Frontend Setup
```bash
cd frontend
npm install

# Start development server
npm run dev
```
The frontend will run on `http://localhost:5173`.

---

## ⏰ Scraping Schedule & Cron Configuration

Because free-tier hosting (Render) sleeps after inactivity, scheduled scraping runs are triggered externally:

- **Schedule**: Every 2 hours (`0 */2 * * *`)
- **Trigger**: [cron-job.org](https://cron-job.org)
- **Endpoint**: `POST https://your-backend.onrender.com/scrape/run-scheduled-scrape?token=YOUR_CRON_SECRET`
- **Behavior**: The webhook wakes up the Render container, responds immediately with `{ "message": "Scrape job started" }` to prevent HTTP timeouts, and asynchronously iterates through all active tracked products in Supabase.

---

## 🎥 Observable (Headed) Run for Recording

To observe the scraper in headed mode (visible browser window with slow-motion actions) for the video deliverable:

```bash
cd backend
node scraper/runHeaded.js
```

What you will observe:
1. Browser opens with a visible window (`headless: false`).
2. Navigates to the product page.
3. Automatically dismisses cookie consent.
4. Selects the target product option chip.
5. Performs simulated mouse movements across the price panel and waits for dwell time.
6. The price button unlocks and is clicked.
7. The store's internal retry indicator (`Retrying Attempt (x/6)`) displays on screen during intermittent failures.
8. The final resolved price and stock pill are highlighted and logged in the console.

---

## 📝 Design Note

### Trade-offs Made
1. **Playwright vs. Lightweight HTTP**: While the assignment suggests preferring lightweight HTTP parsing where possible, deep inspection of the storefront revealed that the entire mock store is a client-side React SPA. Furthermore, the price retrieval mechanism executes a client-side WebAssembly handshake and tracks native browser mouse events. Utilizing Playwright for page navigation and price retrieval was therefore a deliberate engineering choice to achieve 100% reliability rather than fragile reverse-engineering of dynamic WASM blobs.
2. **Async Cron Webhook**: Render's free tier has an HTTP request timeout. Triggering the scrape responds immediately with HTTP 200 while executing the batch scrape asynchronously in the background.

### What AI Tools Got Wrong on First Attempt & How We Corrected It
1. **The ASCII vs. Unicode Apostrophe**: Initial code attempted to find the price button using `button[aria-label="Check today's price"]` (ASCII apostrophe `U+0027`). The mock store actually used a right single quotation mark `’` (`U+2019`). This caused button locators to time out. We resolved this by targeting the container `.offer-panel button` and using text matching.
2. **The Hover Illusion**: Initial AI generations assumed a simple `offerPanel.hover()` would unlock the button. Inspecting the compiled application bundle (`index-GaW5Fnef.js`) revealed the internal `Ar` tracker class requiring at least 8 moves separated by 40ms and 600ms dwell time. We replaced the single hover with a programmatic 12-step mouse trajectory.
3. **Number Parsing & Zero-Width Traps**: Standard `parseFloat` or basic regex failed on `₹ 4 2 , 1 4 1` due to hidden zero-width spaces (`\u200B`) and Euro-style `,00` endings. We designed a comprehensive Unicode-cleaning pipeline that normalizes full-width digits, strips invisible characters, and extracts the exact integer price.
