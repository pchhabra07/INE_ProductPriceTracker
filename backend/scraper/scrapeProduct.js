const { chromium } = require('playwright');

const MAX_OUR_RETRIES = 3;       // our own outer retry loop (on top of the store's 6-attempt UI retry)
const BACKOFF_MS = [2000, 5000]; // wait 2s after attempt 1, 5s after attempt 2

// Parse price string handling intentional store obfuscation:
// zero-width spaces (\u200B), non-breaking spaces (\u00A0), full-width digits (\uFF10-\uFF19), euro (,00), trailing (/- taxes)
function parsePrice(text) {
  if (!text) return null;
  // Convert full-width digits ０-９ (U+FF10 - U+FF19) to standard 0-9
  let s = text.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  // Remove zero-width formatting characters
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  // Remove trailing decimal cents/paise like ,00 or .00 (euro style)
  s = s.replace(/[,.]00(?:\s*\/.*)?$/, '');
  // Remove trailing tax text like "/- (incl. of all taxes)"
  s = s.replace(/\/.*$/, '');
  // Extract all digit characters
  const digitsOnly = s.replace(/[^0-9]/g, '');
  if (!digitsOnly) return null;
  const num = parseInt(digitsOnly, 10);
  return isNaN(num) ? null : num;
}

// Core scrape function for ONE product.
// Uses Playwright to navigate, hover-unlock the price panel, click "Check today's price",
// wait for the store's own retry mechanism to resolve, then extract price + stock from the DOM.
//
// Returns: { price: number|null, stock: string|null, outcome: string, attemptCount: number, errorMessage: string|null }
async function scrapeProductWithRetry(storeUrl, optionIndex) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_OUR_RETRIES; attempt++) {
    let browser = null;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      console.log(`[SCRAPE] Attempt ${attempt}/${MAX_OUR_RETRIES} — ${storeUrl} opt o${optionIndex}`);

      await page.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Dismiss cookie consent banner if it appears
      const consentBtn = page.locator('.consent-scrim .ctl-main');
      if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await consentBtn.click();
        console.log(`[SCRAPE] Cookie consent dismissed`);
      }

      // Wait for option chips to appear, then select the target option
      await page.waitForSelector('.opt-chip', { timeout: 10000 });
      const chips = await page.$$('.opt-chip');
      if (optionIndex > chips.length) {
        throw new Error(`Option index ${optionIndex} out of range (product has ${chips.length} options)`);
      }
      // Click the chip for this option (optionIndex is 1-based)
      await chips[optionIndex - 1].click();

      // Unlock the offer panel: store anti-bot requires >= 8 mouse moves (>40ms apart) and >= 600ms dwell time
      const offerPanel = page.locator('.offer-panel');
      await offerPanel.waitFor({ timeout: 10000 });
      await offerPanel.scrollIntoViewIfNeeded();
      const box = await offerPanel.boundingBox();
      if (!box) throw new Error('Offer panel bounding box could not be determined');

      // Dispatch 12 mouse movements across the panel to satisfy minMoves
      for (let i = 0; i < 12; i++) {
        const x = box.x + 40 + (i % 6) * 15;
        const y = box.y + 25 + (i % 3) * 10;
        await page.mouse.move(x, y);
        await page.waitForTimeout(60);
      }

      // Wait 700ms to satisfy minDwellMs (600ms requirement)
      await page.waitForTimeout(700);

      // Wait for the button inside offer-panel to become enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('.offer-panel button');
          return btn && !btn.disabled;
        },
        { timeout: 15000 }
      );

      // Click the price button inside offer-panel
      await page.click('.offer-panel button');
      console.log(`[SCRAPE] Clicked price button — waiting for store to resolve (up to 6 attempts internally)...`);

      // Wait for the store's own retry mechanism to finish and the panel to show "offer-ready" or "offer-failed"
      // The store retries up to 6 times internally; we give it up to 90s to complete
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
        throw new Error(`Store internal failure: ${errorMsg}`);
      }

      // Read how many attempts the store took (shown in .offer-foot span)
      const offerFootText = await page.$eval('.offer-foot span', (el) => el.textContent.trim()).catch(() => '');
      const storeAttemptMatch = offerFootText.match(/(\d+)\s+attempt/);
      const storeAttempts = storeAttemptMatch ? parseInt(storeAttemptMatch[1], 10) : 1;

      // Extract displayed price from data.fgy-x1 (the large styled price element)
      const priceText = await page.$eval('data.fgy-x1', (el) => el.textContent.trim()).catch(() => null);
      const price = parsePrice(priceText);

      // Extract stock from .avail-pill
      const stockText = await page.$eval('.avail-pill', (el) => el.textContent.trim()).catch(() => null);

      // Validate — never store partial data
      if (price === null) throw new Error(`Price selector matched but text unparseable: "${priceText}"`);
      if (stockText === null) throw new Error('Stock element (.avail-pill) not found after offer-ready');

      const outcome = (attempt > 1 || storeAttempts > 1) ? 'retried' : 'success';
      console.log(`[SCRAPE] Success — price: ${price}, stock: "${stockText}", outcome: ${outcome}`);

      return { price, stock: stockText, outcome, attemptCount: attempt, errorMessage: null };

    } catch (err) {
      lastError = err;
      console.warn(`[SCRAPE] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_OUR_RETRIES) {
        const wait = BACKOFF_MS[attempt - 1] || 5000;
        console.log(`[SCRAPE] Backing off ${wait}ms before retry...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    } finally {
      if (browser) await browser.close();
    }
  }

  // All attempts exhausted — log a failed row (never silently drop failures)
  console.error(`[SCRAPE] All ${MAX_OUR_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  return {
    price: null,
    stock: null,
    outcome: 'failed',
    attemptCount: MAX_OUR_RETRIES,
    errorMessage: lastError?.message || 'Unknown error',
  };
}

module.exports = { scrapeProductWithRetry };
