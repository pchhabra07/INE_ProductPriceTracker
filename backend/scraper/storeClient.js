const axios = require('axios');
const { chromium } = require('playwright');

const STORE_BASE = 'https://demo.inelabteamdev.com';

// In-memory catalog cache with 15-minute TTL
let cachedCatalog = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Fetch all products across all pages from the store's public listings API.
 * Uses lightweight parallel HTTP requests (16 pages x 60 items = 960 products).
 * Cached in memory so subsequent searches resolve in 0ms.
 */
async function getFullCatalog() {
  const now = Date.now();
  if (cachedCatalog && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  try {
    // 16 pages of 60 items covers all 960 products
    const pageRequests = Array.from({ length: 16 }, (_, i) =>
      axios.get(`${STORE_BASE}/api/v2/listings?page=${i + 1}&limit=60`, { timeout: 10000 })
    );

    const responses = await Promise.all(pageRequests);
    const allProducts = responses.flatMap((res) => res.data?.results || []);

    if (allProducts.length > 0) {
      cachedCatalog = allProducts.map((p) => ({
        productName: p.name,
        brand: p.brand,
        department: p.category,
        sku: p.sku,
        storeProductId: String(p.id),
        storeUrl: `${STORE_BASE}/item/${p.id}`,
      }));
      lastCacheTime = now;
      return cachedCatalog;
    }
  } catch (err) {
    console.warn('[STORE CLIENT] Fast API catalog fetch error, falling back if cache exists:', err.message);
    if (cachedCatalog) return cachedCatalog;
  }

  // Fallback: fetch page 1 and whatever we can
  const res = await axios.get(`${STORE_BASE}/api/v2/listings?page=1&limit=60`, { timeout: 10000 });
  return (res.data?.results || []).map((p) => ({
    productName: p.name,
    brand: p.brand,
    department: p.category,
    sku: p.sku,
    storeProductId: String(p.id),
    storeUrl: `${STORE_BASE}/item/${p.id}`,
  }));
}

/**
 * Search the store catalog by partial or full product name (case-insensitive).
 * Can also match brand or department.
 */
async function searchStoreCatalog(query, maxResults = 30) {
  const catalog = await getFullCatalog();
  const q = query.toLowerCase().trim();

  const matched = catalog.filter((p) =>
    p.productName.toLowerCase().includes(q) ||
    p.brand.toLowerCase().includes(q) ||
    p.department.toLowerCase().includes(q)
  );

  return matched.slice(0, maxResults);
}

/**
 * Fetch available options for a product.
 * Primary: Ultra-fast HTTP request to `/api/v2/items/:id`.
 * Fallback: Playwright DOM extraction if HTTP API fails.
 */
async function fetchProductOptions(storeUrl) {
  // Extract numeric product ID from URL
  const match = storeUrl.match(/item\/(\d+)/);
  const productId = match ? match[1] : null;

  if (productId) {
    try {
      const res = await axios.get(`${STORE_BASE}/api/v2/items/${productId}`, { timeout: 8000 });
      if (res.data?.options && Array.isArray(res.data.options)) {
        return res.data.options.map((opt, idx) => ({
          optionName: opt.label || opt.name,
          optionIndex: idx + 1, // 1-based
        }));
      }
    } catch (err) {
      console.warn(`[STORE CLIENT] HTTP options fetch failed for ${productId}, falling back to Playwright:`, err.message);
    }
  }

  // Fallback: Headless browser DOM extraction
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(storeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const consentBtn = page.locator('.consent-scrim .ctl-main');
    if (await consentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await consentBtn.click();
    }
    await page.waitForSelector('.opt-chip', { timeout: 10000 });
    return await page.$$eval('.opt-chip', (chips) =>
      chips.map((chip, idx) => ({
        optionName: chip.textContent.trim(),
        optionIndex: idx + 1,
      }))
    );
  } finally {
    await browser.close();
  }
}

module.exports = { searchStoreCatalog, fetchProductOptions };
