const supabase = require('../config/supabaseClient');

// Insert a new tracked product. Returns the inserted row.
// Skips insert (returns existing) if store_product_id + option_name already tracked.
async function addTrackedProduct({ storeProductId, productName, optionName, optionIndex, storeUrl, department, brand }) {
  // Check if already tracked (idempotent)
  const { data: existing } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('store_product_id', storeProductId)
    .eq('option_name', optionName)
    .single();

  if (existing) return { data: existing, alreadyTracked: true };

  const { data, error } = await supabase
    .from('tracked_products')
    .insert({
      store_product_id: storeProductId,
      product_name: productName,
      option_name: optionName,
      option_index: optionIndex,
      store_url: storeUrl,
      department,
      brand,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { data, alreadyTracked: false };
}

// Return all active tracked products
async function listTrackedProducts() {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

// Soft-delete a tracked product by id
async function untrackProduct(id) {
  const { error } = await supabase
    .from('tracked_products')
    .update({ is_active: false })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// Get a single tracked product by id
async function getTrackedProductById(id) {
  const { data, error } = await supabase
    .from('tracked_products')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

module.exports = { addTrackedProduct, listTrackedProducts, untrackProduct, getTrackedProductById };
