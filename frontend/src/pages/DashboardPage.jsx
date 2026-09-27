import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, PackageOpen, AlertCircle, Search } from 'lucide-react';
import Navbar from '../components/shared/Navbar';
import ProductCard from '../components/shared/ProductCard';
import ExportButton from '../components/shared/ExportButton';

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

      setProducts(data.products || []);

      // Fetch latest history row for each product in parallel
      const historyEntries = await Promise.all(
        (data.products || []).map(async (p) => {
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
        <div className="page-header dashboard-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">
              {products.length > 0
                ? `Tracking ${products.length} product option${products.length !== 1 ? 's' : ''} • Scrapes every 2 hours`
                : 'No products currently tracked'}
            </p>
          </div>
          <div className="header-actions">
            <ExportButton />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/search')}
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Track Product</span>
            </button>
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>Loading dashboard…</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <PackageOpen size={48} strokeWidth={1.5} />
            </div>
            <div className="empty-title">Nothing tracked yet</div>
            <p style={{ marginBottom: '1.5rem' }}>
              Search for a product from the mock store and select an option to start tracking price history.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/search')}
            >
              <Search size={16} />
              <span>Search Products</span>
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
