import { useNavigate } from 'react-router-dom';
import { Check, RotateCw, X, Clock, Trash2, Tag } from 'lucide-react';

// Receives one tracked product object as a prop.
// Clicking the card navigates directly to product details.
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
    if (lower.includes('few') || lower.includes('low') || (lower.match(/\d+/) && parseInt(lower.match(/\d+/)[0], 10) < 5)) return 'stock-low';
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

  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  return (
    <div
      className="product-card clickable-card"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="product-card-top">
        <div className="product-card-info">
          <h3 className="product-card-name" title={product.product_name}>
            {product.product_name}
          </h3>
          <div className="product-card-option">
            <Tag size={13} className="option-icon" />
            <span>{product.option_name}</span>
            <span className="dot-sep">•</span>
            <span>{product.department || 'Product'}</span>
          </div>
          {product.brand && (
            <div className="product-card-brand">{product.brand}</div>
          )}
        </div>

        {outcome && (
          <span className={`badge badge-${outcome}`}>
            {outcome === 'success' && <Check size={13} strokeWidth={2.5} />}
            {outcome === 'retried' && <RotateCw size={12} strokeWidth={2.5} />}
            {outcome === 'failed' && <X size={13} strokeWidth={2.5} />}
            <span>{outcome}</span>
          </span>
        )}
      </div>

      <div className="product-card-body">
        {price !== null && price !== undefined ? (
          <div className="product-card-price">{formatPrice(price)}</div>
        ) : (
          <div className="product-card-price no-price">Price pending…</div>
        )}
        {stock && (
          <div className={`product-card-stock ${getStockClass(stock)}`}>
            <span className="stock-dot" />
            <span>{stock}</span>
          </div>
        )}
      </div>

      <div className="product-card-footer">
        <span className="product-card-scraped" title={scrapedAt ? new Date(scrapedAt).toISOString() : ''}>
          <Clock size={13} />
          <span>Last scraped: {formatDate(scrapedAt)}</span>
        </span>
        <button
          type="button"
          className="btn btn-ghost-danger btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            onUntrack(product.id);
          }}
          title="Stop tracking this product"
          aria-label="Stop tracking this product"
        >
          <Trash2 size={14} />
          <span>Untrack</span>
        </button>
      </div>
    </div>
  );
}
