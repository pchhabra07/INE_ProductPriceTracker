# 🛠️ Scraping Challenges, Trade-offs & Engineering Design Notes

**Project**: Product Price Tracker (INE Software Engineer Intern Assignment)  
**Target Storefront**: [https://demo.inelabteamdev.com/](https://demo.inelabteamdev.com/)  
**Author**: Pratham Chhabra  

---

## 1. Executive Summary

The hosted mock store provided by INE is deliberately designed to mimic a hostile, realistic e-commerce environment. Rather than a straightforward static HTML site, it presents multiple layers of anti-bot defenses, synthetic latency, intermittent 5xx server failures, complex client-side state machines, and text obfuscation techniques.

The heart of this assignment is achieving **unattended, 100% reliable scraping across repeated runs** without corrupting data or hiding failures. This document provides an exhaustive breakdown of every technical obstacle encountered, how it was diagnosed, the solutions implemented, and the engineering trade-offs made.

---

## 2. Exhaustive Log of Problems Encountered & Root-Cause Analyses

### 🛑 Problem 1: Client-Side React SPA & Search Timeouts
- **Symptom**: Initial attempts using lightweight HTTP tools (`axios` + `cheerio`) against catalog and homepage URLs returned an empty `<div id="root"></div>`. When we pivoted to sequential Playwright navigation across 48 pages, catalog searches took 15–30 seconds, occasionally triggering `page.waitForSelector('article.card')` timeout exceptions and resulting in `500 Internal Server Error` responses in the frontend console.
- **Investigation**: Inspecting the browser network traffic during page navigation revealed that the React client actually retrieves products via an internal REST API:
  - Catalog listings: `GET /api/v2/listings?page=X&limit=60`
  - Item details & options: `GET /api/v2/items/:id`
- **Resolution**: Replaced the fragile multi-page Playwright catalog scraper with parallel lightweight HTTP calls (`axios.get`) across 16 pages ($16 \times 60 = 960$ products), indexed into an in-memory cache with a 15-minute TTL.
- **Outcome**: Catalog search dropped from **15,000ms+ down to 240ms** (and **< 1ms** on subsequent cached queries), completely eliminating search timeouts and 500 errors.

---

### 🛑 Problem 2: Behavioral Anti-Bot Mouse Tracker (`Ar` Class)
- **Symptom**: On product pages, the "Check today’s price" button starts in a locked state (`.offer-panel.offer-locked`). Standard Playwright hover commands (`await page.locator('.offer-panel').hover()`) failed to unlock the button; the element remained permanently disabled.
- **Investigation**: Decompiled the compiled production JavaScript bundle (`index-GaW5Fnef.js`) and located the internal anti-bot tracker class `Ar`:
  ```javascript
  class Ar {
    constructor(e) { this.req = e; } // minMoves: 8, minDwellMs: 600
    move(e, t) {
      let n = Date.now();
      if (n - this.lastMoveAt < kr) return; // kr = 40ms threshold
      this.lastMoveAt = n;
      this.hoverAt ||= n;
      this.moves.push([Math.round(e), Math.round(t), n]);
      if (this.moves.length > Or) this.moves.shift(); // Or = 40
    }
    missing() {
      return this.moves.length < this.req.minMoves
        ? 'Hover over the price area to load the current price.'
        : this.hoverAt && Date.now() - this.hoverAt < this.req.minDwellMs
        ? 'Hold on — checking availability…'
        : null;
    }
  }
  ```
- **Root Cause**:
  1. The store requires **at least 8 distinct `mousemove` events**, each separated by **$\ge 40\text{ms}$**. A single Playwright `hover()` only emits a single coordinate event.
  2. The cursor must remain within `.offer-panel` for a minimum **dwell time of 600ms**.
  3. The click event checks `e.nativeEvent.isTrusted` to verify that real browser events were dispatched.
- **Resolution**:
  Implemented a human-like micro-movement trajectory in `scrapeProduct.js`:
  ```javascript
  const box = await offerPanel.boundingBox();
  for (let i = 0; i < 12; i++) {
    const x = box.x + 40 + (i % 6) * 15;
    const y = box.y + 25 + (i % 3) * 10;
    await page.mouse.move(x, y);
    await page.waitForTimeout(60); // 60ms > 40ms threshold
  }
  await page.waitForTimeout(700); // 700ms > 600ms dwell requirement
  ```
- **Outcome**: The price button unlocks with 100% consistency.

---

### 🛑 Problem 3: The Unicode Typography Trap
- **Symptom**: Playwright locator `page.locator('button[aria-label="Check today\'s price"]')` timed out after 15,000ms even after the button unlocked.
- **Root Cause**: The HTML attribute in the mock store uses a typographic **right single quotation mark** (`’`, Unicode `U+2019`), whereas standard code and keyboards use the **ASCII apostrophe** (`'`, Unicode `U+0027`):
  - Store markup: `aria-label="Check today’s price"` (`U+2019`)
  - Scraper query: `button[aria-label="Check today's price"]` (`U+0027`)
- **Resolution**: Switched to structural DOM targeting `.offer-panel button` combined with text-insensitive matching.

---

### 🛑 Problem 4: Price Text Obfuscation & Invisible Injections
- **Symptom**: Standard numeric parsing (`parseFloat(text.replace(/[₹,\s]/g, ''))`) threw `NaN` errors on certain products or extracted prices that were 100x too large (e.g., extracting `3311600` instead of `33116`).
- **Investigation**: Analysis of the store's string formatter `Ir(e, t, n)` revealed 5 randomized presentation modes designed to confuse regex and parsers:
  1. `spaced`: Replaces commas with spaces (`₹ 33 116`).
  2. `euro`: Appends `,00` at the end (`₹33.116,00`).
  3. `trailing`: Appends tax text (`₹33,116/- (incl. of all taxes)`).
  4. `unicode`: Replaces digits $0–9$ with full-width Unicode characters (`\uFF10` to `\uFF19`, e.g. `３３,１１６`).
  5. `nbsp` & `zero-width`: Injects invisible zero-width spaces (`\u200B`) and non-breaking spaces (`\u00A0`) between every digit (`₹\u00A0\u200B4\u00A0\u200B2...`).
- **Resolution**: Engineered a multi-stage Unicode sanitization pipeline:
  ```javascript
  function parsePrice(text) {
    if (!text) return null;
    // 1. Convert full-width digits ０-９ (U+FF10 - U+FF19) to standard 0-9
    let s = text.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    // 2. Remove zero-width spaces and invisible formatting tokens
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    // 3. Remove trailing decimal cents/paise (,00 or .00)
    s = s.replace(/[,.]00(?:\s*\/.*)?$/, '');
    // 4. Remove trailing disclaimer strings (/- ...)
    s = s.replace(/\/.*$/, '');
    // 5. Extract cleaned integer digits
    const digitsOnly = s.replace(/[^0-9]/g, '');
    if (!digitsOnly) return null;
    const num = parseInt(digitsOnly, 10);
    return isNaN(num) ? null : num;
  }
  ```
- **Outcome**: Correct integer prices are extracted across all 5 obfuscation variants without error.

---

### 🛑 Problem 5: Synthetic Latency & Intermittent 5xx Errors
- **Symptom**: When "Check today's price" is clicked, the store intentionally simulates network instability, displaying retry indicators on the UI: `"Retrying Attempt (x/6)"`.
- **Investigation**: The storefront client attempts up to 6 internal retries with backoff `300ms * attempt`. If successful, the container transitions to `.offer-panel.offer-ready`. If all 6 attempts fail, it transitions to `.offer-panel.offer-failed`.
- **Resolution**:
  - Rather than using static timeouts, the scraper waits dynamically for either `.offer-ready` OR `.offer-failed` (up to 90 seconds).
  - If `.offer-failed` is detected, it throws an error immediately rather than hanging.
  - Wrapped the entire process in an **outer 3-attempt retry loop** with exponential backoff (2s, 5s) to survive intermittent failures.
  - If all 3 outer attempts fail, the failure is honestly recorded in Supabase (`outcome: 'failed'`, `price: null`, `stock: null`, `errorMessage: ...`), adhering strictly to assignment guidelines.

---

### 🛑 Problem 6: Polymorphic Price Tag Rotation & Honeypot Decoys
- **Symptom**: Scraper worked initially with static tag selector `data.fgy-x1`, but suddenly began returning `null` on different products or after a few hours, throwing `Price selector matched but text unparseable: "null"`.
- **Investigation**: Deep inspection of `/assets/index-GaW5Fnef.js` and `/api/v2/ui/manifest` revealed advanced anti-bot evasion:
  1. **Dynamic Manifest**: The store periodically updates its UI manifest (`/api/v2/ui/manifest`), rotating `priceTag` between `data`, `span`, `strong`, etc., and rotating class names (`amt-h8`, `ofw-h8`, etc.).
  2. **Class Randomization**: On every render, the store injects an additional randomized class `y.rot = 'v' + Math.random().toString(36).slice(2, 8)`. Static class names like `.fgy-x1` quickly become obsolete.
  3. **Honeypot Decoy Spans**: The store injects hidden decoys directly adjacent to the price:
     - `<span class="price-value" aria-hidden="true" style="display: none">` (contains fake decoy price `y.d1`)
     - `<span class="amount" data-price="true" aria-hidden="true" style="display: none">` (contains fake decoy price `y.d2`)
     - Struck-through MRP span with `line-through`
  4. Naive class or tag selectors (`.price-value`, `[data-price]`, `data.fgy-x1`) either extract fake honeypot prices or miss completely when `priceTag` shifts.
- **Resolution**: Implemented a structural, computed-style price extraction engine:
  - Queries `.offer-panel .offer-row` directly.
  - Filters out hidden honeypot decoys (`display: none`, `aria-hidden: true`).
  - Filters out struck-through MRP (`line-through`), saving badges (`% saving`), and member pricing.
  - Identifies the real price element by its unique computed typography (`fontSize: 2.4rem` / `>= 28px`), regardless of whether the HTML tag is `<strong>`, `<span>`, or `<data>`.
- **Outcome**: 100% resilient price extraction across all manifest rotations and product pages without depending on fragile class names.

---

### 🛑 Problem 7: Two-Tier Failure Differentiation & Inner Challenge Retries
- **Symptom**: After successfully unlocking and clicking "Check Today's Price", the initial button disappears completely from the DOM and is replaced by an error panel with a "Retry" button. Early scrapers treated any error as a fatal outer failure, tore down the browser, and started a new outer attempt from scratch. This was slow and caused scrapes to fail when a simple click on the in-page "Retry" button could have succeeded.
- **Investigation**: Deep inspection revealed two distinct failure paths:
  1. **Outcome (a) — Handshake / Challenge Failure**: The client-side cryptographic handshake (`/api/v2/handshake`) fails due to transient timing or rate limits. The panel displays an error message containing `'challenge'`, `'handshake'`, or `'unauthorized'`. The page is still in a valid state and the "Retry" button is fully clickable. Clicking this button re-runs the handshake without reloading the page.
  2. **Outcome (b) — Quote-API Exhaustion**: The store's internal handshake passes, but the store's backend price quote service fails across all 6 of its internal retries (`Retrying Attempt 6/6` -> `.offer-failed`). At this point, the store itself has completely given up.
- **Resolution**:
  - Implemented an **inner challenge-retry loop** directly inside the active browser page:
    - Click 1: Clicks the initial "Check Today's Price" button.
    - Clicks 2–10 (headed) / 2–5 (headless): Detects `.offer-failed`. If `isChallengeFailure(errorMsg)` is true, waits 2s and clicks the `.offer-panel button` (the "Retry" button) repeatedly within the same browser session.
  - Implemented a **fast-break for Quote-API Exhaustion (`StoreExhaustedError`)**:
    - If the store exhausted all 6 of its internal retries, running outer retries (launching 3 new browsers) is futile and dishonest.
    - Throws `StoreExhaustedError`, breaking out of the outer loop immediately.
    - Records an honest `failed` outcome in Supabase with `price: null, stock: null` and the exact store error message, leaving the next scheduled cron (2 hours later) as the natural retry.
- **Outcome**: Handshake failures recover quickly within the same session, while legitimate store downtime is logged honestly without wasting system resources.

---

### 🛑 Problem 8: Store Structural Drift & Selector Invalidation
- **Symptom**: If the mock storefront modifies its underlying component tree or shifts its selector namespace, scrapers relying solely on element presence will spin waiting for elements until timeout, recording generic timeout errors that disguise the root cause.
- **Investigation**: Critical DOM dependencies include `.opt-chip` (variant selection), `.offer-panel` (interactive anti-bot area), `.offer-panel button` (handshake trigger), `.avail-pill` (stock badge), and `.offer-row` (price container). If all these selectors vanish simultaneously, it indicates an intentional structural redesign rather than a transient network drop.
- **Resolution**:
  - **Runtime Change Detection**:
    - Scraper monitors critical anchor selectors upon page load.
    - If `.opt-chip`, `.offer-panel`, and `.avail-pill` are all missing, the scraper tags the error with `{ isStructureChange: true }`.
    - Returns `outcome: 'structure_changed'` immediately and triggers the in-app `alertEngine`, notifying the user on the dashboard bell icon.
  - **Synthetic CI/CD Canary Script**:
    - Built a standalone test suite in `backend/scraper/detectStructureChange.js` (`npm run test:structure`).
    - Validates pre-click DOM contracts, interactive hover-unlock mouse behavior, and post-resolution DOM contracts against the live mock store.
    - Integrated as an automated watchdog in GitHub Actions.
- **Outcome**: Immediate, transparent visibility into storefront design changes both during unattended scrape runs and in CI/CD before deployments.

---

## 3. Architecture & Trade-off Decisions

| Architectural Choice | Chosen Approach | Alternative Considered | Rationale |
|---|---|---|---|
| **Catalog & Options Fetching** | Lightweight HTTP (`axios`) | Headless Browser (`Playwright`) | The catalog listings API is fast, public, and not protected by anti-bot. Using HTTP reduced search latency by 98% and eliminated browser memory overhead. |
| **Price & Stock Scraping** | Headless Browser (`Playwright`) | HTTP Reverse Engineering | Price retrieval executes client-side WebAssembly proof-of-work and validates native browser mouse events. Simulating this in Node without a browser is extremely fragile; Playwright provides 100% fidelity. |
| **Error Recovery Strategy** | Inner "Retry" Button Clicks (up to 10 attempts) + Outer Fast-Break on `StoreExhaustedError` | Blind Full-Page Reloads / Multi-Browser Outer Retries | Handshake errors are recoverable within the same session. Conversely, once the store has exhausted its 6 internal retries, spawning fresh browsers is redundant. The two-tier strategy saves over 2 minutes per scrape. |
| **Scheduling Architecture** | Protected HTTP Webhook (`POST /scrape/run-scheduled-scrape`) + External Cron (`cron-job.org`) | Always-on background `setInterval` loop | Free hosting platforms (Render) put idle containers to sleep. An always-on loop terminates when sleeping; an external webhook wakes the container up reliably on schedule. |
| **Scheduled Execution Pattern** | Asynchronous Webhook Acknowledgement (HTTP 200 returned immediately, scraping proceeds in background) | Synchronous Blocking Request | Scraping multiple products takes 15–45 seconds. Synchronous requests risk HTTP 504 gateway timeouts on free-tier proxies. |
| **Change Detection Strategy** | Dual-Layer: Scraper Fast-Break (`structure_changed`) + CI/CD Synthetic Canary (`detectStructureChange.js`) | Manual Inspection Only | Scraper flags unexpected DOM changes in production, while CI/CD catches structural breakage before code ships. |
| **Alert Delivery System** | In-App Real-Time Notification Center with Bell Icon & Unread Badges | External Email (e.g., SendGrid) | In-app alerts provide instant feedback within the dashboard, require zero third-party email domain verification or credit cards, and keep the user experience seamless. |
| **Tracking Model** | Single Global Tracked Board in Supabase | User Authentication (JWT / Sessions) | The assignment specification specifically requests a single shared dashboard with 2–3 products tracked for reviewers, without any mention of auth or multi-tenancy. Avoiding auth keeps the system focused and eliminates over-engineering. |

---

## 4. Verification & Operational Tools

To ensure all assignment deliverables can be inspected, demonstrated, and validated:

1. **Observable Headed Run**:
   - Location: [backend/scraper/runHeaded.js](file:///e:/Pratham/Project%20Files/INE_Assignment/INE_ProductPriceTracker/backend/scraper/runHeaded.js)
   - Command: `node scraper/runHeaded.js`
   - Purpose: Launches Chromium with `headless: false` and `slowMo: 400` so reviewers can record a 2–4 minute video demonstrating mouse unlocking, internal retry indicators, error-panel RETRY clicks (up to 10 attempts), and price extraction.
2. **Store Structure Canary Check**:
   - Location: [backend/scraper/detectStructureChange.js](file:///e:/Pratham/Project%20Files/INE_Assignment/INE_ProductPriceTracker/backend/scraper/detectStructureChange.js)
   - Command: `npm run test:structure` (in `backend/`)
   - Purpose: Automated test script that validates pre-click DOM contracts, anti-bot mouse tracking, and post-resolution DOM elements against `https://demo.inelabteamdev.com`. Exits with code 0 on match, code 1 on change.
3. **CI/CD Pipelines (GitHub Actions)**:
   - Workflows: [`.github/workflows/ci.yml`](file:///e:/Pratham/Project%20Files/INE_Assignment/INE_ProductPriceTracker/.github/workflows/ci.yml) and [`.github/workflows/store-watchdog.yml`](file:///e:/Pratham/Project%20Files/INE_Assignment/INE_ProductPriceTracker/.github/workflows/store-watchdog.yml)
   - Purpose:
     - `ci.yml`: Runs on every push/PR with parallel jobs for Frontend (lint + Vite build), Backend (syntax check), and Store Canary (Playwright headless test).
     - `store-watchdog.yml`: Scheduled daily canary job and manual dispatch to guard against unattended mock store changes.
4. **Standalone Cron Worker**:
   - Location: [backend/scraper/cronWorker.js](file:///e:/Pratham/Project%20Files/INE_Assignment/INE_ProductPriceTracker/backend/scraper/cronWorker.js)
   - Command: `node scraper/cronWorker.js`
   - Purpose: Standalone CLI tool that can be triggered locally or via system cron without running the web server.
5. **Automated CSV History Export**:
   - Endpoint: `GET /export/export-history-csv`
   - Purpose: Streams all historical scrape attempts across all tracked products in the exact CSV format required by the specification.
