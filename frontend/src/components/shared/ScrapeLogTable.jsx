// Receives: log = array of price_history rows sorted newest first
export default function ScrapeLogTable({ log }) {
  if (!log || log.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div className="empty-title">No scrape logs yet</div>
        <p>Logs appear after the first scheduled scrape run.</p>
      </div>
    );
  }

  const formatDate = (iso) =>
    new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' });

  const formatPrice = (price, outcome) => {
    if (outcome === 'failed' || price === null || price === undefined) return '—';
    return `₹${Number(price).toLocaleString('en-IN')}`;
  };

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Outcome</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Attempts</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {log.map((row) => (
            <tr key={row.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDate(row.scraped_at)}</td>
              <td>
                <span className={`badge badge-${row.outcome}`}>
                  {row.outcome === 'success' ? '✓ success'
                    : row.outcome === 'retried' ? '↻ retried'
                    : '✕ failed'}
                </span>
              </td>
              <td style={{ fontWeight: row.price ? '600' : '400', color: row.price ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {formatPrice(row.price, row.outcome)}
              </td>
              <td>{row.stock || '—'}</td>
              <td style={{ textAlign: 'center' }}>{row.attempt_count}</td>
              <td style={{ fontSize: '0.8125rem', color: 'var(--danger)', maxWidth: '240px', wordBreak: 'break-word' }}>
                {row.error_message || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
