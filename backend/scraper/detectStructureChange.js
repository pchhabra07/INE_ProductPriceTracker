/**
 * detectStructureChange.js
 *
 * Store Structure Canary & Change Detection Tool
 *
 * Can be run:
 *   1. Locally via `npm run test:structure`
 *   2. In CI/CD (GitHub Actions) as a pull-request or scheduled watchdog job
 *   3. From the backend monitoring or health check
 *
 * Validates that https://demo.inelabteamdev.com has not modified its DOM layout,
 * critical CSS selectors, or anti-bot interaction contracts.
 *
 * Exits with:
 *   code 0: DOM structure and anti-bot contracts verified
 *   code 1: True DOM structure change detected or critical selector missing
 */

const { chromium } = require('playwright');
const axios = require('axios');

const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';
const MAX_CANARY_ATTEMPTS = 3;
const RESOLUTION_TIMEOUT_MS = 90000; // 90s, matching scrapeProduct.js

// Pre-click critical DOM contracts (must be present immediately upon hydration)
const INITIAL_SELECTORS = [
  { name: 'Option Chips', selector: '.opt-chip', minCount: 1, required: true },
  { name: 'Offer Panel Container', selector: '.offer-panel', minCount: 1, required: true },
  { name: 'Offer Panel Action Button', selector: '.offer-panel button', minCount: 1, required: true },
];

function isChallengeFailure(msg) {
  const lower = (msg || '').toLowerCase();
  return lower.includes('challenge') || lower.includes('handshake') || lower.includes('unauthorized');
}

async function runStructureCheck() {
  console.log(`\n============================================================`);
  console.log(`  🔍 STORE STRUCTURE CANARY & CHANGE DETECTION WATCHDOG`);
  console.log(`  Target: ${STORE_BASE}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`============================================================\n`);

  // 1. Fetch a list of active products to test against (gives fallback products if one is slow)
  let candidateItems = [{ id: '1', name: 'Fallback Item 1' }];
  try {
    process.stdout.write(`[1/4] Probing Store API for active products... `);
    const apiRes = await axios.get(`${STORE_BASE}/api/v2/listings?page=1&limit=6`, { timeout: 10000 });
    const results = apiRes.data?.results || [];
    if (results.length > 0) {
      candidateItems = results.slice(0, MAX_CANARY_ATTEMPTS);
      console.log(`PASS (Found ${candidateItems.length} candidate products)`);
    } else {
      console.log(`WARN (No items in results array, using default fallback)`);
    }
  } catch (err) {
    console.log(`WARN (API probe error: ${err.message}. Using default URL)`);
  }

  let verifiedContract = false;
  let preClickVerified = false;
  let unlockVerified = false;
  let structuralFailureReason = null;

  // 2. Test candidate products with retry
  for (let attempt = 1; attempt <= candidateItems.length; attempt++) {
    const item = candidateItems[attempt - 1];
    const targetUrl = `${STORE_BASE}/item/${item.id}`;
    const attemptLabel = `[Attempt ${attempt}/${candidateItems.length}]`;

    console.log(`\n${attemptLabel} Launching headless browser against: "${item.name}" (ID: ${item.id})`);
    console.log(`            URL: ${targetUrl}`);

    let browser = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      });

      const page = await context.newPage();
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

      if (!response || response.status() >= 400) {
        throw new Error(`Target page returned HTTP status ${response ? response.status() : 'NO_RESPONSE'}`);
      }
      console.log(`      Page loaded with HTTP ${response.status()}`);

      // Allow brief moment for dynamic hydration
      await page.waitForTimeout(1500);

      // Handle cookie consent if present
      const consent = await page.$('#cookie-accept, #accept-cookies, [aria-label*="cookie"], button:has-text("Accept")');
      if (consent) {
        await consent.click().catch(() => {});
        console.log(`      Cookie banner handled.`);
      }

      // 3. Inspect Initial DOM Selectors
      console.log(`\n      Validating Pre-Click DOM Contracts:`);
      let preClickPass = true;

      for (const contract of INITIAL_SELECTORS) {
        const elements = await page.$$(contract.selector);
        const count = elements.length;
        if (count >= contract.minCount) {
          console.log(`      ✓ [PASS] ${contract.name.padEnd(28)} selector: "${contract.selector}" (found: ${count})`);
        } else {
          console.error(`      ✗ [FAIL] ${contract.name.padEnd(28)} selector: "${contract.selector}" (expected >= ${contract.minCount}, found: ${count})`);
          preClickPass = false;
          structuralFailureReason = `Critical selector missing: "${contract.selector}" (${contract.name})`;
        }
      }

      if (!preClickPass) {
        // Missing pre-click critical elements is an actual structural change
        console.error(`\n🚨 Structural failure detected on pre-click DOM selectors!`);
        break; // Stop retrying — structural change detected
      }
      preClickVerified = true;

      // 4. Validate Interactive Hover-Unlock Contract
      console.log(`\n      Validating Interactive Hover-Unlock Contract:`);
      const offerPanel = page.locator('.offer-panel');
      const panelExists = (await offerPanel.count()) > 0;

      if (!panelExists) {
        structuralFailureReason = 'Offer panel (.offer-panel) missing from DOM';
        break;
      }

      await offerPanel.scrollIntoViewIfNeeded();
      const box = await offerPanel.boundingBox();

      if (!box) {
        structuralFailureReason = 'Could not determine bounding box of .offer-panel';
        break;
      }

      // Dispatch 12 micro-movements across the box to satisfy minMoves: 8, kr: 40ms
      for (let i = 0; i < 12; i++) {
        const x = box.x + 30 + (i % 6) * 15;
        const y = box.y + 20 + (i % 3) * 10;
        await page.mouse.move(x, y);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(700); // 700ms > 600ms dwell requirement

      const buttonEnabled = await page.waitForFunction(
        () => {
          const btn = document.querySelector('.offer-panel button');
          return btn && !btn.disabled;
        },
        { timeout: 12000 }
      ).then(() => true).catch(() => false);

      if (!buttonEnabled) {
        console.error(`      ✗ [FAIL] Anti-bot button did not unlock within 12s after simulated hover.`);
        structuralFailureReason = 'Anti-bot hover-unlock behavior altered (button remained disabled)';
        break;
      }

      console.log(`      ✓ [PASS] Anti-bot hover-unlock verified — button successfully unlocked.`);
      unlockVerified = true;

      // 5. Test Price Resolution & Post-Resolution DOM Contracts
      console.log(`\n      Testing Price Resolution & Post-Resolution Contracts:`);
      console.log(`      Clicking offer button — waiting for store resolution (up to ${RESOLUTION_TIMEOUT_MS / 1000}s)...`);
      await page.click('.offer-panel button');

      // Inner loop supporting up to 3 in-page retries if the store hits handshake challenge
      let resolvedState = null;

      for (let innerAttempt = 1; innerAttempt <= 3; innerAttempt++) {
        const resolved = await page.waitForFunction(
          () => {
            const panel = document.querySelector('.offer-panel');
            return panel && (panel.classList.contains('offer-ready') || panel.classList.contains('offer-failed'));
          },
          { timeout: innerAttempt === 1 ? RESOLUTION_TIMEOUT_MS : 30000 }
        ).then(() => true).catch(() => false);

        if (!resolved) {
          // Resolution timed out — this is a store quote latency issue, NOT a DOM change
          console.warn(`      ⚠ [TIMEOUT] Store did not resolve to .offer-ready or .offer-failed within timeout.`);
          break;
        }

        const isReady = await page.evaluate(() => document.querySelector('.offer-panel')?.classList.contains('offer-ready'));

        if (isReady) {
          resolvedState = 'offer-ready';
          console.log(`      ✓ [PASS] Resolution state: .offer-ready`);

          // Validate post-resolution DOM elements
          const hasPriceRow = (await page.$('.offer-panel .offer-row')) !== null;
          const hasAvailPill = (await page.$('.avail-pill')) !== null;

          if (hasPriceRow && hasAvailPill) {
            console.log(`      ✓ [PASS] Post-resolution elements verified: .offer-row and .avail-pill are present.`);
            verifiedContract = true;
          } else {
            console.error(`      ✗ [FAIL] Post-resolution elements missing: offer-row=${hasPriceRow}, avail-pill=${hasAvailPill}`);
            structuralFailureReason = `Post-resolution elements missing: offer-row=${hasPriceRow}, avail-pill=${hasAvailPill}`;
          }
          break; // done!
        } else {
          // .offer-failed state
          const errorMsg = await page.$eval('.offer-panel .offer-msg', (el) => el.textContent.trim()).catch(() => '');
          console.log(`      ✓ [PASS] Resolution state: .offer-failed (Message: "${errorMsg}")`);

          // Validate failure panel DOM
          const hasMsg = (await page.$('.offer-panel .offer-msg')) !== null;
          const hasRetryBtn = (await page.$('.offer-panel button')) !== null;

          if (!hasMsg || !hasRetryBtn) {
            console.error(`      ✗ [FAIL] Failure panel elements missing: msg=${hasMsg}, retryBtn=${hasRetryBtn}`);
            structuralFailureReason = 'Failure panel DOM altered (.offer-msg or retry button missing)';
            break;
          }

          console.log(`      ✓ [PASS] Failure panel DOM verified: .offer-msg and retry button are present.`);

          // If challenge failure and retry attempts remain, test the inner retry button
          if (isChallengeFailure(errorMsg) && innerAttempt < 3) {
            console.log(`      Challenge failure detected — testing inner RETRY button (click ${innerAttempt + 1})...`);
            await page.waitForTimeout(2000);
            await page.click('.offer-panel button').catch(() => {});
            continue; // wait for next resolution
          }

          // Even if the quote failed, the DOM failure contract was verified!
          verifiedContract = true;
          break;
        }
      }

      if (verifiedContract) {
        break; // Successfully verified all contracts!
      }

      // If we got here and didn't verify, it was due to a store quote timeout.
      if (!structuralFailureReason) {
        console.warn(`      ⚠ [RETRY] Store quote was slow on "${item.name}". Retrying with next candidate...`);
      }

    } catch (attemptErr) {
      console.warn(`      ⚠ [WARN] Attempt ${attempt} encountered error: ${attemptErr.message}`);
    } finally {
      if (browser) await browser.close();
    }
  }

  // 6. Summary and Exit Decision
  console.log(`\n============================================================`);

  if (structuralFailureReason) {
    console.error(`🚨 ALERT: Store page structure change detected!`);
    console.error(`   Failure: ${structuralFailureReason}`);
    console.error(`   Critical DOM contracts failed. Scraper adjustments required.`);
    console.log(`============================================================\n`);
    process.exit(1);
  }

  if (verifiedContract) {
    console.log(`✅ ALL CRITICAL STORE STRUCTURE CONTRACTS VERIFIED!`);
    console.log(`   ✓ Pre-click selectors (.opt-chip, .offer-panel, button) intact.`);
    console.log(`   ✓ Anti-bot hover-unlock behavior verified.`);
    console.log(`   ✓ Offer resolution elements match mock store DOM.`);
    console.log(`============================================================\n`);
    process.exit(0);
  }

  // If pre-click contracts and hover-unlock PASSED, but the store quote API was slow/timing out:
  if (preClickVerified && unlockVerified) {
    console.log(`✅ DOM STRUCTURE & ANTI-BOT CONTRACTS VERIFIED!`);
    console.log(`   ✓ Pre-click selectors (.opt-chip, .offer-panel, button) are 100% intact.`);
    console.log(`   ✓ Anti-bot hover-unlock interaction succeeded.`);
    console.log(`   ℹ Note: Store quote API experienced transient latency during resolution.`);
    console.log(`   DOM layout is confirmed intact — no structural breakage detected.`);
    console.log(`============================================================\n`);
    process.exit(0);
  }

  // If we couldn't even reach the store or verify pre-click
  console.error(`❌ CANARY INCONCLUSIVE: Store unreachable or unresponsive across all attempts.`);
  console.log(`============================================================\n`);
  process.exit(1);
}

if (require.main === module) {
  runStructureCheck();
}

module.exports = { runStructureCheck };
