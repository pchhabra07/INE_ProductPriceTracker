/**
 * alertEngine.js
 *
 * Called after every successful scrape to compare the new result with the
 * previous successful scrape and fire in-app notifications for:
 *   1. price_drop      — new price is lower than the previous price
 *   2. back_in_stock   — stock changed from an out-of-stock state to in-stock
 *   3. structure_changed — DOM selectors were missing (detected in scraper)
 */

const { createNotification, getLastSuccessfulHistory } = require('../models/Notification');

// Words/phrases that mean "out of stock" in the store's stock pill text
const OUT_OF_STOCK_PHRASES = ['out of stock', 'unavailable', 'sold out'];

function isOutOfStock(stockText) {
  if (!stockText) return true; // null stock = treat as out-of-stock
  const lower = stockText.toLowerCase();
  return OUT_OF_STOCK_PHRASES.some((phrase) => lower.includes(phrase));
}

/**
 * Main alert check — call this after inserting a new price_history row.
 *
 * @param {object} opts
 * @param {string}        opts.trackedProductId
 * @param {string}        opts.productName
 * @param {string}        opts.optionName
 * @param {number|null}   opts.newPrice          - null on failure
 * @param {string|null}   opts.newStock          - null on failure
 * @param {string}        opts.outcome           - 'success' | 'retried' | 'failed' | 'structure_changed'
 * @param {string|null}   opts.errorMessage
 */
async function checkAndFireAlerts({ trackedProductId, productName, optionName, newPrice, newStock, outcome, errorMessage }) {
  try {
    // ── Structure-change alert ─────────────────────────────────────────────────
    if (outcome === 'structure_changed') {
      await createNotification({
        trackedProductId,
        type: 'structure_changed',
        message: `Page structure may have changed for "${productName}" (${optionName}). Required DOM selectors are missing. Manual inspection recommended.`,
        oldValue: null,
        newValue: errorMessage || 'selector missing',
      });
      console.log(`[ALERT] structure_changed notification created for "${productName}"`);
      return;
    }

    // Only run price/stock comparison on successful scrapes
    if (outcome !== 'success' && outcome !== 'retried') return;
    if (newPrice === null || newStock === null) return;

    // Fetch the 2 most recent successful rows so we can compare the previous one
    const recentHistory = await getLastSuccessfulHistory(trackedProductId);
    // recentHistory[0] = row we just inserted, recentHistory[1] = the one before it
    const prevRow = recentHistory?.[1];
    if (!prevRow) {
      // First ever successful scrape for this product — no comparison possible
      console.log(`[ALERT] First successful scrape for "${productName}" — no comparison, skipping alerts.`);
      return;
    }

    const prevPrice = prevRow.price ? Number(prevRow.price) : null;
    const prevStock = prevRow.stock;

    // ── Price-drop alert ───────────────────────────────────────────────────────
    if (prevPrice !== null && newPrice < prevPrice) {
      const drop = prevPrice - newPrice;
      const dropPct = ((drop / prevPrice) * 100).toFixed(1);
      await createNotification({
        trackedProductId,
        type: 'price_drop',
        message: `Price dropped by ₹${drop.toLocaleString('en-IN')} (${dropPct}%) for "${productName}" (${optionName}).`,
        oldValue: prevPrice,
        newValue: newPrice,
      });
      console.log(`[ALERT] price_drop: "${productName}" ₹${prevPrice} → ₹${newPrice}`);
    }

    // ── Back-in-stock alert ────────────────────────────────────────────────────
    const wasOutOfStock = isOutOfStock(prevStock);
    const isNowInStock = !isOutOfStock(newStock);

    if (wasOutOfStock && isNowInStock) {
      await createNotification({
        trackedProductId,
        type: 'back_in_stock',
        message: `"${productName}" (${optionName}) is back in stock! Stock: ${newStock}.`,
        oldValue: prevStock || 'Out of Stock',
        newValue: newStock,
      });
      console.log(`[ALERT] back_in_stock: "${productName}" — was: "${prevStock}" → now: "${newStock}"`);
    }
  } catch (err) {
    // Never let alert logic crash the main scrape flow
    console.error(`[ALERT] Error running alert checks for "${productName}":`, err.message);
  }
}

module.exports = { checkAndFireAlerts };
