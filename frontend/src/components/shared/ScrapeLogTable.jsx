import { useState } from 'react';
import { ClipboardList, Check, RotateCw, X, ChevronDown, ChevronUp } from 'lucide-react';

function ExpandableError({ message, limit = 80 }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!message) return <span>—</span>;

  if (message.length <= limit) {
    return <span className="error-text">{message}</span>;
  }

  return (
    <div className="expandable-error">
      <span className="error-text">
        {isExpanded ? message : `${message.slice(0, limit)}…`}
      </span>
      <button
        type="button"
        className="readmore-btn"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <span>{isExpanded ? 'Show less' : 'Read more'}</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
    </div>
  );
}

// Receives: log = array of price_history rows sorted newest first
export default function ScrapeLogTable({ log }) {
  if (!log || log.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <ClipboardList size={40} strokeWidth={1.5} />
        </div>
        <div className="empty-title">No scrape logs yet</div>
        <p>Logs appear after the first scheduled scrape run.</p>
      </div>
    );
  }

  const formatDate = (iso) =>
    new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

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
            <th style={{ textAlign: 'center' }}>Attempts</th>
            <th>Error Details</th>
          </tr>
        </thead>
        <tbody>
          {log.map((row) => (
            <tr key={row.id}>
              <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatDate(row.scraped_at)}
              </td>
              <td>
                <span className={`badge badge-${row.outcome}`}>
                  {row.outcome === 'success' && <Check size={12} strokeWidth={2.5} />}
                  {row.outcome === 'retried' && <RotateCw size={11} strokeWidth={2.5} />}
                  {row.outcome === 'failed' && <X size={12} strokeWidth={2.5} />}
                  <span>{row.outcome}</span>
                </span>
              </td>
              <td
                style={{
                  fontWeight: row.price ? '600' : '400',
                  color: row.price ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatPrice(row.price, row.outcome)}
              </td>
              <td>{row.stock || '—'}</td>
              <td style={{ textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {row.attempt_count}
              </td>
              <td className="error-cell">
                <ExpandableError message={row.error_message} limit={85} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
