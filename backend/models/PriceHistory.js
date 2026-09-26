const supabase = require('../config/supabaseClient');

// Insert one price history row. price and stock are null on failure.
async function insertPriceHistory({ trackedProductId, price, stock, outcome, attemptCount, errorMessage }) {
  const { data, error } = await supabase
    .from('price_history')
    .insert({
      tracked_product_id: trackedProductId,
      price: price ?? null,
      stock: stock ?? null,
      outcome,           // 'success' | 'retried' | 'failed'
      attempt_count: attemptCount,
      error_message: errorMessage ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// Return price history rows for a given tracked product, newest first
async function getHistoryForProduct(trackedProductId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('*')
    .eq('tracked_product_id', trackedProductId)
    .order('scraped_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

// Return all price history joined with tracked_products (for CSV export)
async function getAllHistoryForExport() {
  const { data, error } = await supabase
    .from('price_history')
    .select(`
      *,
      tracked_products (
        store_product_id,
        product_name,
        option_name
      )
    `)
    .order('scraped_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

module.exports = { insertPriceHistory, getHistoryForProduct, getAllHistoryForExport };
