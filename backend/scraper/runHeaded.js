/**
 * runHeaded.js — Standalone script for the screen-recording deliverable.
 *
 * Runs the scraper against ONE hardcoded product in headless:false mode so the
 * browser window is visible on screen. All retry attempts and outcomes are logged
 * to the console in real time.
 *
 * Usage:  node scraper/runHeaded.js
 *
 * Record your screen while running this. The store's intentional slow/failing
 * responses will be visible both on-screen (browser window) and in the terminal.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { chromium } = require('playwright');
const { insertPriceHistory } = require('../models/PriceHistory');
const supabase = require('../config/supabaseClient');

// ── CONFIG: change these to any product that is already in tracked_products ──
const HARDCODED_URL = 'https://demo.inelabteamdev.com/item/2229';
const OPTION_INDEX = 1; // 1 = first chip (Instrument only)
const TRACKED_PRODUCT_ID = null; // set to a real UUID after inserting via the API, or leave null to skip DB write

const MAX_OUR_RETRIES = 3;
const BACKOFF_MS = [2000, 5000];

// Sentinel error — store exhausted its own 6-attempt retry; we should not re-open the browser.
class StoreExhaustedError extends Error {
  constructor(msg) { super(msg); this.name = 'StoreExhaustedError'; }
}

// Parse price string handling intentional store obfuscation:
// zero-width spaces (\u200B), non-breaking spaces (\u00A0), full-width digits (\uFF10-\uFF19), euro (,00), trailing (/- taxes)
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

async function runHeaded() {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_OUR_RETRIES; attempt++) {
    let browser = null;
    try {
      console.log(`\n====== OUTER ATTEMPT ${attempt}/${MAX_OUR_RETRIES} ======`);
      browser = await chromium.launch({
        headless: false,  // ← visible browser window for recording
        slowMo: 400,      // slight slowdown so actions are visible on camera
      });

      const context = await browser.newContext();
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });

      console.log(`[HEADED] Navigating to ${HARDCODED_URL}`);
      await page.goto(HARDCODED_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Dismiss cookie consent if present
      const consentBtn = page.locator('.consent-scrim .ctl-main');
      if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('[HEADED] Dismissing cookie banner...');
        await consentBtn.click();
      }

      await page.waitForSelector('.opt-chip', { timeout: 10000 });
      const chips = await page.$$('.opt-chip');
      console.log(`[HEADED] Selecting option ${OPTION_INDEX}: "${await chips[OPTION_INDEX - 1].textContent()}"`);
      await chips[OPTION_INDEX - 1].click();

      const offerPanel = page.locator('.offer-panel');
      await offerPanel.waitFor({ timeout: 10000 });
      await offerPanel.scrollIntoViewIfNeeded();
      const box = await offerPanel.boundingBox();
      if (!box) throw new Error('Offer panel bounding box could not be determined');

      console.log('[HEADED] Moving mouse over price panel to satisfy store unlock requirements (8+ moves, 600ms+ dwell)...');
      for (let i = 0; i < 12; i++) {
        const x = box.x + 40 + (i % 6) * 15;
        const y = box.y + 25 + (i % 3) * 10;
        await page.mouse.move(x, y);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(700);

      await page.waitForFunction(
        () => {
          const btn = document.querySelector('.offer-panel button');
          return btn && !btn.disabled;
        },
        { timeout: 15000 }
      );

      console.log('[HEADED] Button unlocked — clicking "Check today’s price"...');
      await page.click('.offer-panel button');
      console.log('[HEADED] Waiting for store to resolve (watch the browser for retry messages)...');

      await page.waitForFunction(
        () => {
          const panel = document.querySelector('.offer-panel');
          return panel && (panel.classList.contains('offer-ready') || panel.classList.contains('offer-failed'));
        },
        { timeout: 90000 }
      );

      const isFailed = await page.evaluate(() =>
        document.querySelector('.offer-panel')?.classList.contains('offer-failed')
      );
      if (isFailed) {
        const errorMsg = await page.$eval('.offer-panel .offer-msg', (el) => el.textContent.trim()).catch(() => 'Store price fetch failed after 6 internal attempts');
        throw new StoreExhaustedError(`Store exhausted all retries: ${errorMsg}`);
      }

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
      const price = parsePrice(priceText);
      const stockText = await page.$eval('.avail-pill', (el) => el.textContent.trim()).catch(() => null);

      if (price === null) throw new Error(priceText === null ? 'Price element not found' : `Price unparseable: "${priceText}"`);
      if (stockText === null) throw new Error('Stock element not found');

      const outcome = attempt > 1 ? 'retried' : 'success';
      console.log(`\n✅ SCRAPE SUCCESS`);
      console.log(`   Price:   ₹${price}`);
      console.log(`   Stock:   ${stockText}`);
      console.log(`   Outcome: ${outcome} (outer attempt ${attempt})`);

      // Optionally write to DB if TRACKED_PRODUCT_ID is set
      if (TRACKED_PRODUCT_ID) {
        await insertPriceHistory({ trackedProductId: TRACKED_PRODUCT_ID, price, stock: stockText, outcome, attemptCount: attempt, errorMessage: null });
        console.log('   Written to price_history ✓');
      }

      // Pause briefly so the result is visible in the recording before closing
      await new Promise((r) => setTimeout(r, 3000));
      return;

    } catch (err) {
      lastError = err;
      if (err instanceof StoreExhaustedError) {
        console.warn(`[HEADED] Store exhausted all its retries — recording failure immediately (no outer retry).`);
        console.warn(`[HEADED] Reason: ${err.message}`);
        break;
      }
      console.warn(`[HEADED] Attempt ${attempt} transient failure: ${err.message}`);
      if (attempt < MAX_OUR_RETRIES) {
        const wait = BACKOFF_MS[attempt - 1] || 5000;
        console.log(`[HEADED] Backing off ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    } finally {
      if (browser) await browser.close();
    }
  }

  console.error(`\n❌ ALL ${MAX_OUR_RETRIES} ATTEMPTS FAILED`);
  console.error(`   Last error: ${lastError?.message}`);

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
