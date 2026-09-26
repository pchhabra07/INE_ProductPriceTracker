import { useNavigate } from 'react-router-dom';

// Receives one tracked product object as a prop.
// Renders a dashboard card with current price, stock, last scraped time, and links.
export default function ProductCard({ product, lastHistory, onUntrack }) {
  const navigate = useNavigate();

  // lastHistory is the most recent price_history row for this product (or null)
  const price = lastHistory?.price;
  const stock = lastHistory?.stock;
  const scrapedAt = lastHistory?.scraped_at;
  const outcome = lastHistory?.outcome;

  // Determine stock display class
  const getStockClass = (stockText) => {
    if (!stockText) return '';
    const lower = stockText.toLowerCase();
    if (lower.includes('out')) return 'stock-out';
    if (lower.includes('few') || lower.includes('low') || lower.match(/\d+/) && parseInt(lower.match(/\d+/)[0]) < 5) return 'stock-low';
    return 'stock-in';
  };

  const formatPrice = (p) => {
    if (p === null || p === undefined) return null;
    return `₹${Number(p).toLocaleString('en-IN')}`;
  };

  const formatDate = (iso) => {
    if (!iso) return 'Never scraped';
    return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className="product-card">
      <div className="product-card-top">
        <div>
          <div className="product-card-name">{product.product_name}</div>
          <div className="product-card-option">{product.option_name} · {product.department || 'Product'}</div>
          {product.brand && <div className="product-card-option" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{product.brand}</div>}
        </div>
        {outcome && (
          <span className={`badge badge-${outcome}`}>
            {outcome === 'success' ? '✓' : outcome === 'retried' ? '↻' : '✕'} {outcome}
          </span>
        )}
      </div>

      <div>
        {price !== null && price !== undefined ? (
          <div className="product-card-price">{formatPrice(price)}</div>
        ) : (
          <div className="product-card-price no-price">Price pending…</div>
        )}
        {stock && (
          <div className={`product-card-stock ${getStockClass(stock)}`}>
            {stock}
          </div>
        )}
      </div>

      <div className="product-card-footer">
        <span className="product-card-scraped">
          Last scraped: {formatDate(scrapedAt)}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => navigate(`/product/${product.id}`)}
          >
            Details →
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onUntrack(product.id)}
          >
            Untrack
          </button>
        </div>
      </div>
    </div>
  );
}
