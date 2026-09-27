const supabase = require('../config/supabaseClient');

/**
 * Create a new notification row.
 * @param {{ trackedProductId, type, message, oldValue?, newValue? }} opts
 */
async function createNotification({ trackedProductId, type, message, oldValue = null, newValue = null }) {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      tracked_product_id: trackedProductId,
      type,
      message,
      old_value: oldValue !== null ? String(oldValue) : null,
      new_value: newValue !== null ? String(newValue) : null,
      is_read: false,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Return all notifications (newest first), optionally filtered to unread only.
 * Joins tracked_products to include product_name in each row.
 */
async function listNotifications({ unreadOnly = false } = {}) {
  let query = supabase
    .from('notifications')
    .select(`
      *,
      tracked_products (
        product_name,
        option_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Count unread notifications (used for the bell badge).
 */
async function countUnread() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Mark one notification as read by its id.
 */
async function markAsRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Mark ALL notifications as read at once.
 */
async function markAllAsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);

  if (error) throw new Error(error.message);
}

/**
 * Get the most recent SUCCESSFUL price history row for a product
 * (used by the alert engine to compare previous vs new price).
 */
async function getLastSuccessfulHistory(trackedProductId) {
  const { data, error } = await supabase
    .from('price_history')
    .select('price, stock, scraped_at')
    .eq('tracked_product_id', trackedProductId)
    .in('outcome', ['success', 'retried'])
    .not('price', 'is', null)
    .order('scraped_at', { ascending: false })
    .limit(2); // limit 2 so we can skip the row we just inserted

  if (error) throw new Error(error.message);
  return data; // array; caller picks index [1] (row before the latest)
}

module.exports = {
  createNotification,
  listNotifications,
  countUnread,
  markAsRead,
  markAllAsRead,
  getLastSuccessfulHistory,
};
