import { useState, useEffect } from 'react';
import Navbar from '../components/shared/Navbar';
import ProductCard from '../components/shared/ProductCard';
import ExportButton from '../components/shared/ExportButton';
import { useNavigate } from 'react-router-dom';

const SERVER = import.meta.env.VITE_SERVER_URL;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [historyMap, setHistoryMap] = useState({}); // { [productId]: latestHistoryRow }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all tracked products and their latest history row on mount
  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER}/products/list-tracked`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load products');

      setProducts(data.products);

      // Fetch latest history row for each product in parallel
      const historyEntries = await Promise.all(
        data.products.map(async (p) => {
          try {
            const hRes = await fetch(`${SERVER}/scrape/product-history/${p.id}`);
            const hData = await hRes.json();
            const latest = hData.history?.[0] || null; // history is newest-first
            return [p.id, latest];
          } catch {
            return [p.id, null];
          }
        })
      );

      setHistoryMap(Object.fromEntries(historyEntries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUntrack = async (id) => {
    if (!confirm('Stop tracking this product?')) return;
    try {
      await fetch(`${SERVER}/products/untrack-product/${id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert('Failed to untrack: ' + err.message);
    }
  };

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">
              {products.length > 0
                ? `Tracking ${products.length} product option${products.length !== 1 ? 's' : ''} · scrapes every 2 hours`
                : 'No products tracked yet'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <ExportButton />
            <button className="btn btn-primary" onClick={() => navigate('/search')}>
              ＋ Track Product
            </button>
          </div>
        </div>

        <div className="glow-line" />

        {/* States */}
        {loading && (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>Loading dashboard…</span>
          </div>
        )}

        {error && <div className="alert alert-error">⚠ {error}</div>}

        {!loading && !error && products.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-title">Nothing tracked yet</div>
            <p style={{ marginBottom: '1.5rem' }}>Search for a product and click "Track this option" to get started.</p>
            <button className="btn btn-primary" onClick={() => navigate('/search')}>
              🔍 Search Products
            </button>
          </div>
        )}

        {/* Product grid */}
        {!loading && products.length > 0 && (
          <div className="dashboard-grid">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                lastHistory={historyMap[p.id]}
                onUntrack={handleUntrack}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
