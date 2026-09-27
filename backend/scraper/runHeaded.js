/**
 * runHeaded.js — Standalone script for the screen-recording deliverable.
 *
 * Runs the scraper against ONE hardcoded product in headless:false mode so the
 * browser window is visible on screen. All retry attempts and outcomes are logged
 * to the console in real time.
 *
 * Retry strategy:
 *   ┌─ Outer loop (MAX_OUR_RETRIES = 3) ─────────────────────────────────────┐
 *   │  Re-opens the browser entirely. Handles quote-API failures and          │
 *   │  transient network errors.                                              │
 *   │                                                                         │
 *   │  ┌─ Inner loop (MAX_CHALLENGE_RETRIES = 10) ────────────────────────┐  │
 *   │  │  Re-clicks "Check today's price" within the SAME browser session. │  │
 *   │  │  Handles handshake / challenge failures (GET or POST).            │  │
 *   │  └──────────────────────────────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────────────────┘
 *   Worst case: 3 × 10 = 30 total click attempts before "Honest failure".
 *
 * Usage:  node scraper/runHeaded.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { chromium } = require('playwright');
const { insertPriceHistory } = require('../models/PriceHistory');
const supabase = require('../config/supabaseClient');

// ── CONFIG ──────────────────────────────────────────────────────────────────
const HARDCODED_URL     = 'https://demo.inelabteamdev.com/item/2229';
const OPTION_INDEX      = 1;    // 1-based index of the option chip to select
const TRACKED_PRODUCT_ID = null; // set to a real UUID to write to DB, or leave null

const MAX_OUR_RETRIES       = 3;   // outer: re-open browser (handles quote API failures)
const MAX_CHALLENGE_RETRIES = 10;  // inner: re-click button (handles handshake failures)
// ─────────────────────────────────────────────────────────────────────────────

function parsePrice(text) {
  if (!text) return null;
  let s = text.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.replace(/[,.]00(?:\s*\/.*)?$/, '');
  s = s.replace(/\/.*$/, '');
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  const num = parseInt(digitsOnly, 10);
  return isNaN(num) ? null : num;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Returns true if the offer panel's error message indicates a
 * handshake / challenge failure (type 1).
 * Returns false for an honest quote-API failure (type 2).
 */
function isChallengeFailure(errorMsg) {
  const lower = (errorMsg || '').toLowerCase();
  return lower.includes('challenge') || lower.includes('handshake') || lower.includes('unauthorized');
}

async function runHeaded() {
  let lastError    = null;
  let totalClicks  = 0;

  for (let outerAttempt = 1; outerAttempt <= MAX_OUR_RETRIES; outerAttempt++) {
    let browser = null;
    try {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`OUTER ATTEMPT ${outerAttempt}/${MAX_OUR_RETRIES}`);
      console.log(`${'═'.repeat(60)}`);

      // ──────────────────────────────────────────────────────────
      // STEP 1: Open full-screen browser
      // ──────────────────────────────────────────────────────────
      browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized', '--start-fullscreen'],
      });
      // viewport: null = no fixed viewport; browser fills the full window
      const context = await browser.newContext({ viewport: null });
      const page    = await context.newPage();
      console.log('[HEADED] Step 1 ✓ — Browser opened in full screen');

      // ──────────────────────────────────────────────────────────
      // STEP 2: Navigate to the product URL
      // ──────────────────────────────────────────────────────────
      console.log(`[HEADED] Step 2 — Navigating to ${HARDCODED_URL}...`);
      await page.goto(HARDCODED_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('[HEADED] Step 2 ✓ — Page loaded');

      // ──────────────────────────────────────────────────────────
      // STEP 3: Wait for cookie consent — do NOTHING else before it
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 3 — Waiting for cookie consent overlay...');
      const consentBtn = page.locator('.consent-scrim .ctl-main');
      await consentBtn.waitFor({ state: 'visible', timeout: 30000 });
      console.log('[HEADED] Step 3 ✓ — Cookie consent appeared');

      // ──────────────────────────────────────────────────────────
      // STEP 4: Dismiss the cookie consent
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 4 — Dismissing cookie consent...');
      await consentBtn.click({ force: true });
      console.log('[HEADED] Step 4 ✓ — Dismiss button clicked');

      // ──────────────────────────────────────────────────────────
      // STEP 5: Wait 1s, verify it's gone (retry dismiss if not)
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 5 — Verifying consent dismissed...');
      await sleep(1000);
      const scrim = page.locator('.consent-scrim');
      if (await scrim.isVisible().catch(() => false)) {
        console.warn('[HEADED] Step 5 — Scrim still present, clicking dismiss again...');
        await consentBtn.click({ force: true }).catch(() => {});
        await sleep(1000);
        if (await scrim.isVisible().catch(() => false)) {
          console.warn('[HEADED] Step 5 — Scrim persists, proceeding anyway');
        } else {
          console.log('[HEADED] Step 5 ✓ — Dismissed on second attempt');
        }
      } else {
        console.log('[HEADED] Step 5 ✓ — Consent fully gone');
      }

      // ──────────────────────────────────────────────────────────
      // STEP 6: Select the desired option chip
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 6 — Selecting option chip...');
      await page.waitForSelector('.opt-chip', { timeout: 10000 });
      const chips = await page.$$('.opt-chip');
      if (OPTION_INDEX > chips.length) {
        throw new Error(`Option index ${OPTION_INDEX} out of range (only ${chips.length} chips found)`);
      }
      const chipText = await chips[OPTION_INDEX - 1].textContent();
      await chips[OPTION_INDEX - 1].click();
      console.log(`[HEADED] Step 6 ✓ — Selected: "${chipText}"`);

      // ──────────────────────────────────────────────────────────
      // STEP 7: Wait 1s for page to settle after chip selection
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 7 — Waiting 1s...');
      await sleep(1000);
      console.log('[HEADED] Step 7 ✓');

      // ──────────────────────────────────────────────────────────
      // STEP 8: Hover over offer panel (unlocks the price button)
      //   Store anti-bot requires ≥8 mouse moves (>40ms apart) and ≥600ms dwell
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 8 — Hovering over price panel to unlock the button...');
      const offerPanel = page.locator('.offer-panel');
      await offerPanel.waitFor({ timeout: 10000 });
      await offerPanel.scrollIntoViewIfNeeded();
      const box = await offerPanel.boundingBox();
      if (!box) throw new Error('Offer panel bounding box could not be determined');

      for (let i = 0; i < 12; i++) {
        const x = box.x + 40 + (i % 6) * 15;
        const y = box.y + 25 + (i % 3) * 10;
        await page.mouse.move(x, y);
        await sleep(80);
      }
      await sleep(800); // satisfy minDwellMs = 600ms
      console.log('[HEADED] Step 8 ✓ — Hover complete');

      // ──────────────────────────────────────────────────────────
      // STEP 9: Wait for button to unlock, then wait 1s
      // ──────────────────────────────────────────────────────────
      console.log('[HEADED] Step 9 — Waiting for button to unlock...');
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('.offer-panel button');
          return btn && !btn.disabled;
        },
        { timeout: 15000 }
      );
      console.log('[HEADED] Step 9 — Button unlocked! Waiting 1s...');
      await sleep(1000);
      console.log('[HEADED] Step 9 ✓');

      // ──────────────────────────────────────────────────────────
      // STEP 10+11: Click button — inner retry loop (up to 10 clicks)
      //
      //   Click 1    : targets the "Check Today's Price" button
      //   Clicks 2-10: the original button is GONE after the first click;
      //                only the panel's RETRY button exists — click that.
      //
      //   Both outcome types run the full 10 inner retries:
      //   Outcome (a) challenge/handshake failure → keep clicking RETRY
      //   Outcome (b) quote-API failure           → keep clicking RETRY
      //   Only a successful price resolve breaks early.
      // ──────────────────────────────────────────────────────────
      let priceResolved = false;

      for (let clickAttempt = 1; clickAttempt <= MAX_CHALLENGE_RETRIES; clickAttempt++) {
        totalClicks++;
        console.log(`\n[HEADED] Step 10 — Click attempt ${clickAttempt}/${MAX_CHALLENGE_RETRIES} (total clicks so far: ${totalClicks})...`);

        if (clickAttempt === 1) {
          // First click: hit the original "Check Today's Price" button
          await page.click('.offer-panel button', { force: true });
        } else {
          // Subsequent clicks: the original button is gone; click the RETRY button
          // that appears inside the error panel after a failure.
          console.log('[HEADED] Waiting 2s before clicking RETRY...');
          await sleep(2000);

          // Wait for the RETRY button to be present and enabled
          await page.waitForFunction(
            () => {
              const btn = document.querySelector('.offer-panel button');
              return btn && !btn.disabled;
            },
            { timeout: 15000 }
          ).catch(() => {
            console.warn('[HEADED] RETRY button did not enable within 15s, clicking anyway');
          });

          await page.click('.offer-panel button', { force: true });
        }

        console.log('[HEADED] Step 11 — Waiting for store to resolve (up to 90s)...');

        // Wait for the panel to settle into a resolved or failed state
        await page.waitForFunction(
          () => {
            const panel = document.querySelector('.offer-panel');
            return panel && (
              panel.classList.contains('offer-ready') ||
              panel.classList.contains('offer-failed')
            );
          },
          { timeout: 90000 }
        );

        const isFailed = await page.evaluate(() =>
          document.querySelector('.offer-panel')?.classList.contains('offer-failed')
        );

        if (!isFailed) {
          priceResolved = true;
          console.log('[HEADED] Step 11 ✓ — Store resolved the price successfully!');
          break;
        }

        // Read the error message so we can log the failure type
        const errorMsg = await page.$eval(
          '.offer-panel .offer-msg',
          (el) => el.textContent.trim()
        ).catch(() => '');

        if (isChallengeFailure(errorMsg)) {
          // Outcome (a): handshake / challenge failure
          console.warn(`[HEADED] ⚠️  Challenge failure (attempt ${clickAttempt}/${MAX_CHALLENGE_RETRIES}): "${errorMsg}"`);
          if (clickAttempt === MAX_CHALLENGE_RETRIES) {
            console.warn(`[HEADED] All ${MAX_CHALLENGE_RETRIES} inner retries exhausted (challenge failures)`);
            lastError = new Error(`Challenge failed after ${MAX_CHALLENGE_RETRIES} attempts: ${errorMsg}`);
          }
          // Continue inner loop — next iteration will click the RETRY button
        } else {
          // Outcome (b): quote-API failure (demo store's own retry sequence ended)
          console.warn(`[HEADED] ⚠️  Quote-API failure (attempt ${clickAttempt}/${MAX_CHALLENGE_RETRIES}): "${errorMsg}"`);
          if (clickAttempt === MAX_CHALLENGE_RETRIES) {
            console.warn(`[HEADED] All ${MAX_CHALLENGE_RETRIES} inner retries exhausted (quote-API failures)`);
            lastError = new Error(`Quote API failed after ${MAX_CHALLENGE_RETRIES} attempts: ${errorMsg}`);
          }
          // Do NOT break — continue inner loop; next iteration clicks RETRY
        }
      }

      if (priceResolved) {
        // ──────────────────────────────────────────────────────────
        // STEP 12: Parse price + stock, log result
        // ──────────────────────────────────────────────────────────
        await sleep(2000); // let the result be visible on recording

        const offerFootText = await page.$eval('.offer-foot span', (el) => el.textContent.trim()).catch(() => '');
        console.log(`[HEADED] Store resolve message: "${offerFootText}"`);

        const priceText = await page.evaluate(() => {
          const offerRow = document.querySelector('.offer-panel .offer-row');
          if (!offerRow) return null;

          const candidates = Array.from(offerRow.querySelectorAll('*')).filter((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (el.getAttribute('aria-hidden') === 'true') return false;
            if (style.textDecorationLine.includes('line-through') || el.style.textDecoration?.includes('line-through')) return false;
            const text = el.textContent?.trim() || '';
            if (text.includes('saving') || text.includes('Member price') || text.includes('Refreshing')) return false;
            if (!/[0-9\uFF10-\uFF19]/.test(text)) return false;
            return true;
          });

          for (const el of candidates) {
            if (el.style?.fontSize === '2.4rem' || parseFloat(window.getComputedStyle(el).fontSize) >= 28) {
              return el.textContent.trim();
            }
          }

          const directChild = candidates.find((el) => el.parentElement === offerRow);
          if (directChild) return directChild.textContent.trim();
          return candidates.length > 0 ? candidates[0].textContent.trim() : null;
        });

        const price     = parsePrice(priceText);
        const stockText = await page.$eval('.avail-pill', (el) => el.textContent.trim()).catch(() => null);

        if (price === null) throw new Error(priceText === null ? 'Price element not found' : `Price unparseable: "${priceText}"`);
        if (stockText === null) throw new Error('Stock element (.avail-pill) not found');

        const outcome = outerAttempt > 1 ? 'retried' : 'success';
        console.log(`\n✅ SCRAPE SUCCESS`);
        console.log(`   Price:        ₹${price}`);
        console.log(`   Stock:        ${stockText}`);
        console.log(`   Outcome:      ${outcome}`);
        console.log(`   Outer attempt: ${outerAttempt}/${MAX_OUR_RETRIES}`);
        console.log(`   Total clicks:  ${totalClicks}`);

        if (TRACKED_PRODUCT_ID) {
          await insertPriceHistory({ trackedProductId: TRACKED_PRODUCT_ID, price, stock: stockText, outcome, attemptCount: outerAttempt, errorMessage: null });
          console.log('   Written to price_history ✓');
        }

        await sleep(5000); // visible pause before browser closes
        return; // all done
      }

      // Inner loop exhausted without success — outer loop will retry
      console.log(`[HEADED] Outer attempt ${outerAttempt} failed (${MAX_CHALLENGE_RETRIES} clicks exhausted). ${outerAttempt < MAX_OUR_RETRIES ? 'Retrying with a fresh browser...' : 'All outer retries exhausted.'}`);

    } catch (err) {
      lastError = err;
      console.warn(`[HEADED] Outer attempt ${outerAttempt} threw: ${err.message}`);
    } finally {
      if (browser) await browser.close();
    }

    if (outerAttempt < MAX_OUR_RETRIES) {
      const wait = outerAttempt === 1 ? 2000 : 5000;
      console.log(`[HEADED] Backing off ${wait}ms before next outer attempt...`);
      await sleep(wait);
    }
  }

  // ── All outer retries exhausted — HONEST FAILURE ──
  console.error(`\n${'═'.repeat(60)}`);
  console.error(`❌ HONEST FAILURE — All ${MAX_OUR_RETRIES} outer attempts × up to ${MAX_CHALLENGE_RETRIES} clicks failed`);
  console.error(`   Total clicks attempted: ${totalClicks}`);
  console.error(`   Last error: ${lastError?.message}`);
  console.error(`${'═'.repeat(60)}`);

  if (TRACKED_PRODUCT_ID) {
    await insertPriceHistory({
      trackedProductId: TRACKED_PRODUCT_ID,
      price: null,
      stock: null,
      outcome: 'failed',
      attemptCount: MAX_OUR_RETRIES,
      errorMessage: lastError?.message,
    });
    console.log('   Failure written to price_history ✓');
  }
}

runHeaded().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
