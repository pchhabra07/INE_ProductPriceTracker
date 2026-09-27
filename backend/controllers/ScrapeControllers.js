const { listTrackedProducts, getTrackedProductById } = require('../models/TrackedProduct');
const { insertPriceHistory, getHistoryForProduct } = require('../models/PriceHistory');
const { scrapeProductWithRetry } = require('../scraper/scrapeProduct');
const { checkAndFireAlerts } = require('../scraper/alertEngine');

// POST /scrape/run-scheduled-scrape
// Protected by CRON_SECRET (query param: ?token=...).
// Triggered by cron-job.org every 2 hours.
// Scrapes all active tracked products sequentially and writes results to price_history.
async function runScheduledScrape(req, res, next) {
  // Validate cron secret
  const { token } = req.query;
  if (!token || token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately so cron-job.org doesn't time out waiting
  res.json({ message: 'Scrape job started', startedAt: new Date().toISOString() });

  // Run scraping asynchronously after response is sent
  try {
    const products = await listTrackedProducts();
    console.log(`[CRON] Starting scrape run — ${products.length} products to scrape`);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const productNum = i + 1;
      const total = products.length;
      const label = `[Tracked Product ${productNum}/${total}]`;

      console.log(`[CRON] ${label} Scraping: "${product.product_name}" (${product.option_name})`);
      const result = await scrapeProductWithRetry(product.store_url, product.option_index, label);

      await insertPriceHistory({
        trackedProductId: product.id,
        price: result.price,
        stock: result.stock,
        outcome: result.outcome,
        attemptCount: result.attemptCount,
        errorMessage: result.errorMessage,
      });

      // Fire in-app alerts (price drop, back-in-stock, structure change)
      await checkAndFireAlerts({
        trackedProductId: product.id,
        productName: product.product_name,
        optionName: product.option_name,
        newPrice: result.price,
        newStock: result.stock,
        outcome: result.outcome,
        errorMessage: result.errorMessage,
      });

      console.log(`[CRON] ${label} Done: "${product.product_name}" — ${result.outcome} (price: ${result.price})`);
    }

    console.log(`[CRON] Scrape run complete at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[CRON] Fatal error during scrape run:', err.message);
  }
}

// POST /scrape/scrape-now/:trackedProductId
// Manually triggers an immediate scrape for one product on demand.
// Awaited so caller receives the latest price history row in response.
async function scrapeNow(req, res, next) {
  try {
    const { trackedProductId } = req.params;
    const product = await getTrackedProductById(trackedProductId);
    if (!product) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    const label = `"${product.product_name}"`;
    console.log(`[MANUAL SCRAPE] Scraping: ${label} (${product.option_name})...`);
    const result = await scrapeProductWithRetry(product.store_url, product.option_index, label);

    const historyRow = await insertPriceHistory({
      trackedProductId: product.id,
      price: result.price,
      stock: result.stock,
      outcome: result.outcome,
      attemptCount: result.attemptCount,
      errorMessage: result.errorMessage,
    });

    // Fire in-app alerts (price drop, back-in-stock, structure change)
    await checkAndFireAlerts({
      trackedProductId: product.id,
      productName: product.product_name,
      optionName: product.option_name,
      newPrice: result.price,
      newStock: result.stock,
      outcome: result.outcome,
      errorMessage: result.errorMessage,
    });

    console.log(`[MANUAL SCRAPE] Complete: ${result.outcome} (Price: ${result.price})`);
    res.json({ message: 'Scrape completed', result: historyRow });
  } catch (err) {
    next(err);
  }
}

// GET /scrape/product-history/:trackedProductId
// Returns all price history rows for a single tracked product (for chart + table).
async function getProductHistory(req, res, next) {
  try {
    const { trackedProductId } = req.params;
    const history = await getHistoryForProduct(trackedProductId);
    res.json({ history });
  } catch (err) {
    next(err);
  }
}

module.exports = { runScheduledScrape, scrapeNow, getProductHistory };
