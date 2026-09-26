const { searchStoreCatalog, fetchProductOptions } = require('../scraper/storeClient');
const { addTrackedProduct, listTrackedProducts, untrackProduct } = require('../models/TrackedProduct');
const { scrapeProductWithRetry } = require('../scraper/scrapeProduct');
const { insertPriceHistory, getHistoryForProduct } = require('../models/PriceHistory');

// GET /products/search-store?query=...
// Searches the mock store catalog by partial/full product name.
// Returns: array of matched products with their available options.
async function searchStore(req, res, next) {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'query must be at least 2 characters' });
    }

    const results = await searchStoreCatalog(query.trim());
    res.json({ results });
  } catch (err) {
    next(err);
  }
}

// GET /products/product-options?storeUrl=...
// Fetches the available option chips for a specific product page.
// Used by the frontend after selecting a search result, before tracking.
async function getProductOptions(req, res, next) {
  try {
    const { storeUrl } = req.query;
    if (!storeUrl) return res.status(400).json({ error: 'storeUrl is required' });

    const options = await fetchProductOptions(storeUrl);
    res.json({ options });
  } catch (err) {
    next(err);
  }
}

// POST /products/track-product
// Body: { storeProductId, productName, optionName, optionIndex, storeUrl, department, brand }
// Inserts into tracked_products (idempotent — skips if already tracked) and runs immediate initial scrape.
async function trackProduct(req, res, next) {
  try {
    const { storeProductId, productName, optionName, optionIndex, storeUrl, department, brand } = req.body;
    if (!storeProductId || !productName || !optionName || !optionIndex || !storeUrl) {
      return res.status(400).json({ error: 'storeProductId, productName, optionName, optionIndex, and storeUrl are required' });
    }

    const { data, alreadyTracked } = await addTrackedProduct({
      storeProductId,
      productName,
      optionName,
      optionIndex: parseInt(optionIndex, 10),
      storeUrl,
      department: department || null,
      brand: brand || null,
    });

    // Check if product already has any history
    let existingHistory = [];
    if (alreadyTracked) {
      existingHistory = await getHistoryForProduct(data.id);
    }

    // Run initial scrape immediately if new or never scraped before
    let initialScrapeResult = null;
    if (!alreadyTracked || existingHistory.length === 0) {
      console.log(`[TRACK] Running initial scrape for "${productName}" (${optionName})...`);
      try {
        const scrapeResult = await scrapeProductWithRetry(storeUrl, parseInt(optionIndex, 10), `"${productName}"`);
        initialScrapeResult = await insertPriceHistory({
          trackedProductId: data.id,
          price: scrapeResult.price,
          stock: scrapeResult.stock,
          outcome: scrapeResult.outcome,
          attemptCount: scrapeResult.attemptCount,
          errorMessage: scrapeResult.errorMessage,
        });
        console.log(`[TRACK] Initial scrape complete: ${scrapeResult.outcome} (Price: ${scrapeResult.price})`);
      } catch (scrapeErr) {
        console.warn(`[TRACK] Initial scrape attempt failed:`, scrapeErr.message);
      }
    }

    res.status(alreadyTracked ? 200 : 201).json({
      trackedProduct: data,
      alreadyTracked,
      initialScrape: initialScrapeResult,
    });
  } catch (err) {
    next(err);
  }
}

// GET /products/list-tracked
// Returns all active tracked products for the dashboard.
async function listTracked(req, res, next) {
  try {
    const products = await listTrackedProducts();
    res.json({ products });
  } catch (err) {
    next(err);
  }
}

// DELETE /products/untrack-product/:id
// Soft-deletes a tracked product (sets is_active = false).
async function untrack(req, res, next) {
  try {
    const { id } = req.params;
    await untrackProduct(id);
    res.json({ message: 'Product untracked successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchStore, getProductOptions, trackProduct, listTracked, untrack };
