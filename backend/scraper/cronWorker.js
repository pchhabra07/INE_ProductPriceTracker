/**
 * cronWorker.js — Standalone CLI script for scheduled scraping runs.
 *
 * Can be run manually or via crontab/Task Scheduler/GitHub Actions:
 *   node scraper/cronWorker.js
 *
 * Iterates through all active products in `tracked_products`, scrapes their
 * current price and stock, and persists the results to `price_history`.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { listTrackedProducts } = require('../models/TrackedProduct');
const { insertPriceHistory } = require('../models/PriceHistory');
const { scrapeProductWithRetry } = require('./scrapeProduct');

async function runCron() {
  console.log(`\n======================================================`);
  console.log(`[CRON WORKER] Starting scrape run at ${new Date().toISOString()}`);
  console.log(`======================================================`);

  try {
    const products = await listTrackedProducts();
    if (!products || products.length === 0) {
      console.log('[CRON WORKER] No active products found to scrape.');
      return;
    }

    console.log(`[CRON WORKER] Found ${products.length} active product(s) to scrape.\n`);

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      console.log(`[CRON WORKER] [${i + 1}/${products.length}] Scraping: "${p.product_name}" (${p.option_name})`);
      console.log(`              URL: ${p.store_url} | Option Index: ${p.option_index}`);

      const result = await scrapeProductWithRetry(p.store_url, p.option_index);

      await insertPriceHistory({
        trackedProductId: p.id,
        price: result.price,
        stock: result.stock,
        outcome: result.outcome,
        attemptCount: result.attemptCount,
        errorMessage: result.errorMessage,
      });

      console.log(`              Result: ${result.outcome.toUpperCase()} | Price: ${result.price ? `₹${result.price}` : 'N/A'} | Stock: "${result.stock || 'N/A'}"\n`);
    }

    console.log(`======================================================`);
    console.log(`[CRON WORKER] Scrape run completed successfully at ${new Date().toISOString()}`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error(`[CRON WORKER] Fatal error during scrape run:`, err);
    process.exit(1);
  }
}

runCron();
