import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  LineChart as LineChartIcon,
  ClipboardList,
  ExternalLink,
  Play,
  AlertCircle,
  Clock,
  Search,
  Loader2,
} from 'lucide-react';
import Navbar from '../components/shared/Navbar';
import PriceHistoryChart from '../components/shared/PriceHistoryChart';
import ScrapeLogTable from '../components/shared/ScrapeLogTable';
import ExportButton from '../components/shared/ExportButton';

const SERVER = import.meta.env.VITE_SERVER_URL;

export default function ProductDetailPage() {
  // trackedProductId comes from route: /product/:id
  const { id } = useParams();
  const navigate = useNavigate();

  const [history, setHistory] = useState([]);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('chart'); // 'chart' | 'log'

  useEffect(() => {
    loadDetail();
  }, [id]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch product info from list-tracked (find by id)
      const pRes = await fetch(`${SERVER}/products/list-tracked`);
      const pData = await pRes.json();
      const found = pData.products?.find((p) => p.id === id);
      setProduct(found || null);

      // Fetch full history (includes both chart data and log data)
      const hRes = await fetch(`${SERVER}/scrape/product-history/${id}`);
      const hData = await hRes.json();
      if (!hRes.ok) throw new Error(hData.error || 'Failed to load history');
      setHistory(hData.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScrapeNow = async () => {
    setScraping(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER}/scrape/scrape-now/${id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');
      await loadDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setScraping(false);
    }
  };

  const formatPrice = (p) =>
    p !== null && p !== undefined ? `₹${Number(p).toLocaleString('en-IN')}` : '—';

  // Stats derived from history
  const successRows = history.filter((r) => r.outcome !== 'failed' && r.price !== null);
  const prices = successRows.map((r) => Number(r.price));
  const latestPrice = successRows[0]?.price ?? history[0]?.price ?? null;
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const failCount = history.filter((r) => r.outcome === 'failed').length;

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        {/* Back link */}
        <button
          type="button"
          className="btn btn-secondary btn-sm back-btn"
          style={{ marginBottom: '1.5rem' }}
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft size={15} />
          <span>Back to Dashboard</span>
        </button>

        {loading && (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>Loading product detail…</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!loading && product && (
          <>
            {/* Product header */}
            <div className="page-header detail-header">
              <div>
                <h1 className="page-title">{product.product_name}</h1>
                <p className="page-subtitle">
                  {product.option_name} • {product.department} {product.brand ? `• ${product.brand}` : ''}
                </p>
                <div className="store-link-row">
                  <span className="store-id-tag">ID: #{product.store_product_id}</span>
                  <a
                    href={product.store_url}
                    target="_blank"
                    rel="noreferrer"
                    className="store-ext-link"
                  >
                    <span>View on store</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleScrapeNow}
                  disabled={scraping}
                >
                  {scraping ? (
                    <>
                      <Loader2 size={15} className="spin-icon" />
                      <span>Scraping…</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={15} />
                      <span>Scrape Now</span>
                    </>
                  )}
                </button>
                <ExportButton />
              </div>
            </div>

            {/* Empty history banner */}
            {history.length === 0 && (
              <div className="card empty-banner">
                <div className="empty-banner-icon">
                  <Clock size={36} strokeWidth={1.5} />
                </div>
                <h3 className="empty-banner-title">No scrape records yet</h3>
                <p className="empty-banner-desc">
                  This product has not been scraped yet. Run its first scrape now to fetch the latest price and stock.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleScrapeNow}
                  disabled={scraping}
                >
                  {scraping ? (
                    <>
                      <Loader2 size={16} className="spin-icon" />
                      <span>Scraping Today's Price…</span>
                    </>
                  ) : (
                    <>
                      <Play size={15} />
                      <span>Run First Scrape Now</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Stats row */}
            <div className="stats-grid">
              {[
                { label: 'Current Price', value: formatPrice(latestPrice), color: 'var(--accent)' },
                { label: 'Lowest Seen', value: formatPrice(minPrice), color: 'var(--success)' },
                { label: 'Highest Seen', value: formatPrice(maxPrice), color: 'var(--warning)' },
                { label: 'Total Scrapes', value: history.length, color: 'var(--text-primary)' },
                { label: 'Failed Scrapes', value: failCount, color: failCount > 0 ? 'var(--danger)' : 'var(--text-muted)' },
              ].map((stat) => (
                <div key={stat.label} className="card stat-card">
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-value" style={{ color: stat.color }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tab switcher */}
            <div className="tab-switcher">
              <button
                type="button"
                className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
                onClick={() => setActiveTab('chart')}
              >
                <LineChartIcon size={15} />
                <span>Price Chart</span>
              </button>
              <button
                type="button"
                className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`}
                onClick={() => setActiveTab('log')}
              >
                <ClipboardList size={15} />
                <span>Scrape Log</span>
              </button>
            </div>

            {/* Chart */}
            {activeTab === 'chart' && <PriceHistoryChart history={history} />}

            {/* Log table */}
            {activeTab === 'log' && (
              <div className="log-section">
                <div className="section-label">
                  {history.length} scrape attempt{history.length !== 1 ? 's' : ''} recorded
                </div>
                <ScrapeLogTable log={history} />
              </div>
            )}
          </>
        )}

        {!loading && !product && !error && (
          <div className="empty-state">
            <div className="empty-icon">
              <Search size={44} strokeWidth={1.5} />
            </div>
            <div className="empty-title">Product not found</div>
            <p>This product may have been untracked or removed.</p>
          </div>
        )}
      </main>
    </div>
  );
}
