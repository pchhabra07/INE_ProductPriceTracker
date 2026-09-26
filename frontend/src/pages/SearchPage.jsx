import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/shared/Navbar';

const SERVER = import.meta.env.VITE_SERVER_URL;

export default function SearchPage() {
  const queryRef = useRef(null);
  const navigate = useNavigate();

  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected product for option picking
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);

  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState(null);

  // Search the store catalog via backend
  const handleSearch = async () => {
    const q = queryRef.current.value.trim();
    if (q.length < 2) return;

    setSearching(true);
    setSearchError(null);
    setSelectedProduct(null);
    setOptions([]);
    setSelectedOption(null);
    setHasSearched(true);

    try {
      const res = await fetch(`${SERVER}/products/search-store?query=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setResults(data.results);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  };

  // When a result is clicked, fetch that product's options
  const handleSelectProduct = async (product) => {
    setSelectedProduct(product);
    setSelectedOption(null);
    setOptions([]);
    setLoadingOptions(true);
    setTrackError(null);

    try {
      const res = await fetch(`${SERVER}/products/product-options?storeUrl=${encodeURIComponent(product.storeUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load options');
      setOptions(data.options);
    } catch (err) {
      setTrackError(err.message);
    } finally {
      setLoadingOptions(false);
    }
  };

  // Track the selected product+option
  const handleTrack = async () => {
    if (!selectedProduct || !selectedOption) return;
    setTracking(true);
    setTrackError(null);

    try {
      const res = await fetch(`${SERVER}/products/track-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeProductId: selectedProduct.storeProductId,
          productName: selectedProduct.productName,
          optionName: selectedOption.optionName,
          optionIndex: selectedOption.optionIndex,
          storeUrl: selectedProduct.storeUrl,
          department: selectedProduct.department,
          brand: selectedProduct.brand,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to track product');

      // Navigate to dashboard after tracking
      navigate('/dashboard');
    } catch (err) {
      setTrackError(err.message);
    } finally {
      setTracking(false);
    }
  };

  return (
    <div className="app-shell">
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1 className="page-title">Search Products</h1>
          <p className="page-subtitle">Search the INE store by product name, then pick an option to track.</p>
        </div>

        <div className="glow-line" />

        {/* Search bar */}
        <div className="search-bar">
          <input
            ref={queryRef}
            className="search-input"
            type="text"
            placeholder="e.g. MIDI Keyboard, Racing Wheel, Tablet…"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
            {searching ? (
              <><span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Searching…</>
            ) : '🔍 Search'}
          </button>
        </div>

        {searchError && <div className="alert alert-error">⚠ {searchError}</div>}

        {/* Results */}
        {searching && (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>Scanning 960 products across 48 pages…</span>
          </div>
        )}

        {!searching && hasSearched && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No products found</div>
            <p>Try a different search term.</p>
          </div>
        )}

        {results.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedProduct ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
            {/* Left: result list */}
            <div>
              <p className="section-label">{results.length} result{results.length !== 1 ? 's' : ''}</p>
              <div className="result-list">
                {results.map((r) => (
                  <div
                    key={r.storeProductId}
                    className={`result-item${selectedProduct?.storeProductId === r.storeProductId ? ' selected' : ''}`}
                    onClick={() => handleSelectProduct(r)}
                  >
                    <div>
                      <div className="result-name">{r.productName}</div>
                      <div className="result-meta">{r.brand} · #{r.storeProductId}</div>
                    </div>
                    <span className="result-dept">{r.department}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: option picker */}
            {selectedProduct && (
              <div className="card" style={{ alignSelf: 'start', position: 'sticky', top: '80px' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {selectedProduct.productName}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  {selectedProduct.brand} · {selectedProduct.department}
                </p>

                <p className="section-label">Select an option to track</p>

                {loadingOptions ? (
                  <div className="loading-wrap" style={{ padding: '1.5rem' }}>
                    <div className="spinner" />
                    <span>Loading options…</span>
                  </div>
                ) : (
                  <div className="option-grid">
                    {options.map((opt) => (
                      <button
                        key={opt.optionIndex}
                        className={`option-chip${selectedOption?.optionIndex === opt.optionIndex ? ' active' : ''}`}
                        onClick={() => setSelectedOption(opt)}
                      >
                        {opt.optionName}
                      </button>
                    ))}
                  </div>
                )}

                {trackError && <div className="alert alert-error" style={{ marginTop: '1rem' }}>⚠ {trackError}</div>}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
                  disabled={!selectedOption || tracking}
                  onClick={handleTrack}
                >
                  {tracking ? '⏳ Tracking & Scraping Initial Price…' : '＋ Track this option'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
