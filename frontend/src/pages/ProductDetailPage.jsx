import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  const latestPrice = history[0]?.price ?? null;
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const failCount = history.filter((r) => r.outcome === 'failed').length;

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        {/* Back link */}
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: '1.5rem' }}
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>

        {loading && (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>Loading product detail…</span>
          </div>
        )}

        {error && <div className="alert alert-error">⚠ {error}</div>}

        {!loading && product && (
          <>
            {/* Product header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h1 className="page-title">{product.product_name}</h1>
                <p className="page-subtitle">
                  {product.option_name} · {product.department} · {product.brand}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  Store ID: #{product.store_product_id} ·{' '}
                  <a href={product.store_url} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    View on store ↗
                  </a>
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleScrapeNow}
                  disabled={scraping}
                >
                  {scraping ? (
                    <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Scraping…</>
                  ) : (
                    '🔄 Scrape Now'
                  )}
                </button>
                <ExportButton />
              </div>
            </div>

            <div className="glow-line" />

            {/* Empty history banner */}
            {history.length === 0 && (
              <div className="card-glass" style={{ textAlign: 'center', padding: '2rem', marginBottom: '2rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.5rem' }}>No scrape records yet</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  This product has not been scraped yet. Run its first scrape now to fetch its price and stock!
                </p>
                <button className="btn btn-primary" onClick={handleScrapeNow} disabled={scraping}>
                  {scraping ? (
                    <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Scraping Today’s Price…</>
                  ) : (
                    '⚡ Run First Scrape Now'
                  )}
                </button>
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              {[
                { label: 'Current Price', value: formatPrice(latestPrice), color: 'var(--accent)' },
                { label: 'Lowest Seen', value: formatPrice(minPrice), color: 'var(--success)' },
                { label: 'Highest Seen', value: formatPrice(maxPrice), color: 'var(--warning)' },
                { label: 'Total Scrapes', value: history.length, color: 'var(--text-primary)' },
                { label: 'Failed Scrapes', value: failCount, color: failCount > 0 ? 'var(--danger)' : 'var(--text-muted)' },
              ].map((stat) => (
                <div key={stat.label} className="card-glass" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {stat.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 800, color: stat.color }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {['chart', 'log'].map((tab) => (
                <button
                  key={tab}
                  className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'chart' ? '📈 Price Chart' : '📋 Scrape Log'}
                </button>
              ))}
            </div>

            {/* Chart */}
            {activeTab === 'chart' && <PriceHistoryChart history={history} />}

            {/* Log table */}
            {activeTab === 'log' && (
              <>
                <p className="section-label">{history.length} total scrape attempt{history.length !== 1 ? 's' : ''}</p>
                <ScrapeLogTable log={history} />
              </>
            )}
          </>
        )}

        {!loading && !product && !error && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">Product not found</div>
            <p>This product may have been untracked.</p>
          </div>
        )}
      </main>
    </div>
  );
}
