import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, SearchX, Plus, AlertCircle, Loader2, Check } from 'lucide-react';
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
      setResults(data.results || []);
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
      setOptions(data.options || []);
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
          <p className="page-subtitle">Search the mock store by product name, then pick an option to track.</p>
        </div>

        {/* Search bar */}
        <div className="search-bar">
          <div className="search-input-wrapper">
            <Search size={18} className="search-input-icon" />
            <input
              ref={queryRef}
              className="search-input"
              type="text"
              placeholder="e.g. MIDI Keyboard, Racing Wheel, Tablet…"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <>
                <Loader2 size={16} className="spin-icon" />
                <span>Searching…</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Search</span>
              </>
            )}
          </button>
        </div>

        {searchError && (
          <div className="alert alert-error">
            <AlertCircle size={18} />
            <span>{searchError}</span>
          </div>
        )}

        {/* Results */}
        {searching && (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>Searching catalog across store listings…</span>
          </div>
        )}

        {!searching && hasSearched && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <SearchX size={44} strokeWidth={1.5} />
            </div>
            <div className="empty-title">No products found</div>
            <p>Try a different keyword or part of the product name.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="search-layout">
            {/* Left: result list */}
            <div className="search-results-pane">
              <div className="section-label">{results.length} result{results.length !== 1 ? 's' : ''} found</div>
              <div className="result-list">
                {results.map((r) => (
                  <div
                    key={r.storeProductId}
                    className={`result-item${selectedProduct?.storeProductId === r.storeProductId ? ' selected' : ''}`}
                    onClick={() => handleSelectProduct(r)}
                  >
                    <div>
                      <div className="result-name">{r.productName}</div>
                      <div className="result-meta">{r.brand} • #{r.storeProductId}</div>
                    </div>
                    <span className="result-dept">{r.department}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: option picker */}
            {selectedProduct && (
              <div className="card option-picker-card">
                <h3 className="option-picker-title">
                  {selectedProduct.productName}
                </h3>
                <p className="option-picker-meta">
                  {selectedProduct.brand} • {selectedProduct.department}
                </p>

                <div className="section-label" style={{ marginTop: '1.25rem' }}>Select an option to track</div>

                {loadingOptions ? (
                  <div className="loading-wrap" style={{ padding: '1.5rem' }}>
                    <div className="spinner" />
                    <span>Loading available options…</span>
                  </div>
                ) : (
                  <div className="option-grid">
                    {options.map((opt) => (
                      <button
                        type="button"
                        key={opt.optionIndex}
                        className={`option-chip${selectedOption?.optionIndex === opt.optionIndex ? ' active' : ''}`}
                        onClick={() => setSelectedOption(opt)}
                      >
                        {selectedOption?.optionIndex === opt.optionIndex && (
                          <Check size={13} strokeWidth={2.5} />
                        )}
                        <span>{opt.optionName}</span>
                      </button>
                    ))}
                  </div>
                )}

                {trackError && (
                  <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                    <AlertCircle size={16} />
                    <span>{trackError}</span>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1.25rem', justifyContent: 'center' }}
                  disabled={!selectedOption || tracking}
                  onClick={handleTrack}
                >
                  {tracking ? (
                    <>
                      <Loader2 size={16} className="spin-icon" />
                      <span>Tracking & Fetching Initial Price…</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} strokeWidth={2.5} />
                      <span>Track this option</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
