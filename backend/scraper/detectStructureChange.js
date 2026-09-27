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
 *   code 0: All DOM contracts intact
 *   code 1: Structure change detected or network failure
 */

const { chromium } = require('playwright');
const axios = require('axios');

const STORE_BASE = process.env.STORE_BASE_URL || 'https://demo.inelabteamdev.com';

// Pre-click critical DOM contracts (present immediately upon hydration)
const INITIAL_SELECTORS = [
  { name: 'Option Chips', selector: '.opt-chip', minCount: 1, required: true },
  { name: 'Offer Panel Container', selector: '.offer-panel', minCount: 1, required: true },
  { name: 'Offer Panel Action Button', selector: '.offer-panel button', minCount: 1, required: true },
];

async function runStructureCheck() {
  console.log(`\n============================================================`);
  console.log(`  🔍 STORE STRUCTURE CANARY & CHANGE DETECTION WATCHDOG`);
  console.log(`  Target: ${STORE_BASE}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`============================================================\n`);

  let targetUrl = `${STORE_BASE}/item/1`;

  // 1. Verify API accessibility & get an active item URL
  try {
    process.stdout.write(`[1/4] Checking Store API reachability... `);
    const apiRes = await axios.get(`${STORE_BASE}/api/v2/listings?page=1&limit=5`, { timeout: 8000 });
    const firstItem = apiRes.data?.results?.[0];
    if (firstItem && firstItem.id) {
      targetUrl = `${STORE_BASE}/item/${firstItem.id}`;
      console.log(`PASS (Testing product: "${firstItem.name}" ID: ${firstItem.id})`);
    } else {
      console.log(`WARN (Could not parse first item, falling back to ${targetUrl})`);
    }
  } catch (err) {
    console.log(`WARN (API probe failed: ${err.message}. Probing target URL directly)`);
  }

  // 2. Launch browser & load product page
  console.log(`[2/4] Launching headless browser against ${targetUrl}...`);
  let browser = null;
  let hasCriticalFailure = false;

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
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (!response || response.status() >= 400) {
      throw new Error(`Target page returned HTTP status ${response ? response.status() : 'NO_RESPONSE'}`);
    }
    console.log(`      Page loaded with HTTP ${response.status()}`);

    // Wait a brief moment for dynamic hydration
    await page.waitForTimeout(1500);

    // Check cookie consent banner if present
    const consent = await page.$('#cookie-accept, #accept-cookies, [aria-label*="cookie"], button:has-text("Accept")');
    if (consent) {
      await consent.click().catch(() => {});
      console.log(`      Cookie banner detected and handled.`);
    }

    // 3. Inspect Initial DOM selectors
    console.log(`\n[3/4] Validating Pre-Click DOM Contracts:`);

    for (const contract of INITIAL_SELECTORS) {
      try {
        const elements = await page.$$(contract.selector);
        const count = elements.length;
        const pass = count >= contract.minCount;

        if (pass) {
          console.log(`  ✓ [PASS] ${contract.name.padEnd(28)} selector: "${contract.selector}" (found: ${count})`);
        } else {
          console.error(`  ✗ [FAIL] ${contract.name.padEnd(28)} selector: "${contract.selector}" (expected >= ${contract.minCount}, found: ${count})`);
          if (contract.required) hasCriticalFailure = true;
        }
      } catch (err) {
        console.error(`  ✗ [FAIL] ${contract.name.padEnd(28)} selector: "${contract.selector}" error: ${err.message}`);
        if (contract.required) hasCriticalFailure = true;
      }
    }

    // 4. Validate hover-unlock & post-resolution contracts
    console.log(`\n[4/4] Validating Interactive Unlock & Price Resolution Contracts:`);
    const offerPanel = page.locator('.offer-panel');
    const panelExists = await offerPanel.count() > 0;

    if (panelExists) {
      await offerPanel.scrollIntoViewIfNeeded();
      const box = await offerPanel.boundingBox();

      if (box) {
        // Dispatch micro-movements across the offer panel to test anti-bot contract
        for (let i = 0; i < 12; i++) {
          const x = box.x + 30 + (i % 6) * 15;
          const y = box.y + 20 + (i % 3) * 10;
          await page.mouse.move(x, y);
          await page.waitForTimeout(50);
        }
        await page.waitForTimeout(700); // dwell requirement

        const buttonEnabled = await page.waitForFunction(
          () => {
            const btn = document.querySelector('.offer-panel button');
            return btn && !btn.disabled;
          },
          { timeout: 10000 }
        ).then(() => true).catch(() => false);

        if (buttonEnabled) {
          console.log(`  ✓ [PASS] Anti-bot hover-unlock verified — button successfully unlocked.`);

          // Click button to test post-click contract
          console.log(`      Clicking offer button to verify price resolution DOM contract...`);
          await page.click('.offer-panel button');

          // Wait for offer resolution (either offer-ready or offer-failed)
          const resolved = await page.waitForFunction(
            () => {
              const panel = document.querySelector('.offer-panel');
              return panel && (panel.classList.contains('offer-ready') || panel.classList.contains('offer-failed'));
            },
            { timeout: 60000 }
          ).then(() => true).catch(() => false);

          if (!resolved) {
            console.error(`  ✗ [FAIL] Store did not resolve to .offer-ready or .offer-failed within 60s`);
            hasCriticalFailure = true;
          } else {
            const isReady = await page.evaluate(() => document.querySelector('.offer-panel')?.classList.contains('offer-ready'));
            if (isReady) {
              console.log(`  ✓ [PASS] Resolution state: .offer-ready`);
              const hasPriceRow = await page.$('.offer-panel .offer-row') !== null;
              const hasAvailPill = await page.$('.avail-pill') !== null;
              if (hasPriceRow && hasAvailPill) {
                console.log(`  ✓ [PASS] Post-resolution elements verified: .offer-row and .avail-pill are present.`);
              } else {
                console.error(`  ✗ [FAIL] Post-resolution elements missing: offer-row=${hasPriceRow}, avail-pill=${hasAvailPill}`);
                hasCriticalFailure = true;
              }
            } else {
              console.log(`  ✓ [PASS] Resolution state: .offer-failed (Handshake or store attempt in progress)`);
              const hasMsg = await page.$('.offer-panel .offer-msg') !== null;
              const hasRetryBtn = await page.$('.offer-panel button') !== null;
              if (hasMsg && hasRetryBtn) {
                console.log(`  ✓ [PASS] Failure panel DOM verified: .offer-msg and retry button are present.`);
              } else {
                console.error(`  ✗ [FAIL] Failure panel elements missing: msg=${hasMsg}, retryBtn=${hasRetryBtn}`);
                hasCriticalFailure = true;
              }
            }
          }
        } else {
          console.error(`  ✗ [FAIL] Button was not enabled within 10s after hover simulation. Anti-bot rules changed.`);
          hasCriticalFailure = true;
        }
      }
    }

  } catch (fatalErr) {
    console.error(`\n❌ FATAL CANARY ERROR: ${fatalErr.message}`);
    hasCriticalFailure = true;
  } finally {
    if (browser) await browser.close();
  }

  // Summary and exit
  console.log(`\n============================================================`);
  if (hasCriticalFailure) {
    console.error(`🚨 ALERT: Store page structure changes detected!`);
    console.error(`   Critical DOM contracts failed. Scraper adjustments required.`);
    console.log(`============================================================\n`);
    process.exit(1);
  } else {
    console.log(`✅ ALL CRITICAL STORE STRUCTURE CONTRACTS VERIFIED!`);
    console.log(`   Scraper selectors match current mock store DOM.`);
    console.log(`============================================================\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  runStructureCheck();
}

module.exports = { runStructureCheck };
