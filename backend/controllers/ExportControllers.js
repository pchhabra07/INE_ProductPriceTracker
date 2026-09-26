const { getAllHistoryForExport } = require('../models/PriceHistory');

// GET /export/export-history-csv
// Streams the full scrape history as a CSV download.
// Columns: store_product_id, product_name, option_name, timestamp, price, stock, outcome
async function exportHistoryCsv(req, res, next) {
  try {
    const rows = await getAllHistoryForExport();

    const header = 'store_product_id,product_name,option_name,timestamp,price,stock,outcome\n';

    const csvRows = rows.map((row) => {
      const { tracked_products: tp } = row;

      // Quote a CSV field — wraps in double quotes and escapes internal quotes
      const q = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') || str.includes('\n')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      };

      // Failed rows: price and stock are intentionally empty (not "null" string)
      const price = row.outcome === 'failed' ? '' : (row.price ?? '');
      const stock = row.outcome === 'failed' ? '' : (row.stock ?? '');

      return [
        q(tp?.store_product_id),
        q(tp?.product_name),
        q(tp?.option_name),
        q(row.scraped_at),   // ISO 8601 UTC from Supabase
        q(price),
        q(stock),
        q(row.outcome),
      ].join(',');
    });

    const csv = header + csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="price-history.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = { exportHistoryCsv };
