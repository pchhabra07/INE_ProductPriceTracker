import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Plus,
  AlertCircle,
  Loader2,
  Check,
  Sparkles,
  ArrowRight,
  Layers,
} from 'lucide-react';
import { useSearch } from '../../context/SearchContext';

const SERVER = import.meta.env.VITE_SERVER_URL;
const DEBOUNCE_DELAY_MS = 2200; // 2.2s debouncer as requested (2-3 seconds)

const RECOMMENDATIONS = [
  { label: 'MIDI Keyboard', category: 'Instruments' },
  { label: 'Racing Wheel', category: 'Gaming' },
  { label: 'Studio Monitor', category: 'Audio' },
  { label: 'Mechanical Keyboard', category: 'Peripherals' },
  { label: 'Microphone', category: 'Audio' },
  { label: 'Gaming Mouse', category: 'Peripherals' },
];

export default function SearchOverlay() {
  const { isOpen, closeSearch } = useSearch();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected product & option
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);

  const [tracking, setTracking] = useState(false);
  const [trackError, setTrackError] = useState(null);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      // Reset state on close
      setQuery('');
      setResults([]);
      setSearching(false);
      setIsDebouncing(false);
      setSearchError(null);
      setHasSearched(false);
      setSelectedProduct(null);
      setOptions([]);
      setSelectedOption(null);
      setTrackError(null);
    }
  }, [isOpen]);

  // Execute search API call
  const performSearch = async (searchTerm) => {
    const q = (searchTerm ?? query).trim();
    if (q.length < 2) return;

    setSearching(true);
    setIsDebouncing(false);
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

  // 2-3s debouncer effect on typing
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setIsDebouncing(false);
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      performSearch(trimmed);
    }, DEBOUNCE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Clicking a recommendation
  const handleSelectRecommendation = (rec) => {
    setQuery(rec);
    performSearch(rec);
  };

  // When a result is selected, fetch its options
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

  // Track product + option
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

      // Notify dashboard to re-fetch
      window.dispatchEvent(new CustomEvent('product-tracked', { detail: { id: data.trackedProduct?.id } }));

      // Close modal and navigate to dashboard
      closeSearch();
      navigate('/dashboard');
    } catch (err) {
      setTrackError(err.message);
    } finally {
      setTracking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="search-overlay-backdrop" onClick={closeSearch}>
      <div
        className="search-overlay-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search and Track Products"
      >
        {/* Top Search Bar */}
        <div className="search-overlay-header">
          <Search size={19} className="search-overlay-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-overlay-input"
            placeholder="Search mock store products… (auto-searches as you type)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(query);
              }
            }}
          />

          {isDebouncing && !searching && (
            <span className="debounce-indicator" title="Debouncing query (2s)...">
              <span className="debounce-pulse" />
              <span>Searching in 2s…</span>
            </span>
          )}

          {searching && (
            <Loader2 size={16} className="spin-icon" style={{ color: 'var(--accent)', marginRight: '0.5rem' }} />
          )}

          {query && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => {
                setQuery('');
                setResults([]);
                setHasSearched(false);
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}

          <button
            type="button"
            className="search-close-btn"
            onClick={closeSearch}
            title="Close (Esc)"
          >
            <span className="search-esc-key">Esc</span>
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="search-overlay-body">
          {searchError && (
            <div className="alert alert-error" style={{ margin: '1rem' }}>
              <AlertCircle size={16} />
              <span>{searchError}</span>
            </div>
          )}

          {/* Initial State: Recommendations */}
          {!hasSearched && !searching && (
            <div className="search-recommendations-pane">
              <div className="recommendations-header">
                <Sparkles size={15} className="rec-sparkle" />
                <span>Suggested Searches</span>
              </div>
              <p className="recommendations-sub">
                Quickly search the 960+ products in INE's mock catalog:
              </p>
              <div className="recommendations-grid">
                {RECOMMENDATIONS.map((rec) => (
                  <button
                    key={rec.label}
                    type="button"
                    className="recommendation-chip"
                    onClick={() => handleSelectRecommendation(rec.label)}
                  >
                    <span className="rec-label">{rec.label}</span>
                    <span className="rec-cat">{rec.category}</span>
                  </button>
                ))}
              </div>
              <div className="recommendations-hint">
                <kbd>↵ Enter</kbd> to search immediately • <kbd>Esc</kbd> to close
              </div>
            </div>
          )}

          {/* Loading state */}
          {searching && (
            <div className="search-overlay-loading">
              <div className="spinner" style={{ width: 28, height: 28 }} />
              <span>Scanning catalog listings…</span>
            </div>
          )}

          {/* No results */}
          {!searching && hasSearched && results.length === 0 && !searchError && (
            <div className="search-overlay-empty">
              <p className="empty-title">No products found</p>
              <p className="empty-desc">No items matched "{query}". Try another search term from the suggestions above.</p>
            </div>
          )}

          {/* Results split view */}
          {!searching && results.length > 0 && (
            <div className="search-results-split">
              {/* Left Column: Product matches */}
              <div className="search-results-column">
                <div className="search-column-label">
                  Found {results.length} product{results.length !== 1 ? 's' : ''}
                </div>
                <div className="search-results-scroll">
                  {results.map((r) => {
                    const isSelected = selectedProduct?.storeProductId === r.storeProductId;
                    return (
                      <div
                        key={r.storeProductId}
                        className={`search-result-row ${isSelected ? 'active' : ''}`}
                        onClick={() => handleSelectProduct(r)}
                      >
                        <div className="result-row-info">
                          <div className="result-row-name">{r.productName}</div>
                          <div className="result-row-meta">
                            {r.brand} • #{r.storeProductId}
                          </div>
                        </div>
                        <div className="result-row-action">
                          <span className="result-row-dept">{r.department}</span>
                          <ArrowRight size={14} className="result-row-arrow" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Option Picker & Tracking */}
              <div className="search-options-column">
                {selectedProduct ? (
                  <div className="selected-product-pane">
                    <div className="selected-product-header">
                      <div className="selected-prod-name">{selectedProduct.productName}</div>
                      <div className="selected-prod-sub">
                        {selectedProduct.brand} • {selectedProduct.department}
                      </div>
                    </div>

                    <div className="options-selector-section">
                      <div className="options-label">
                        <Layers size={14} />
                        <span>Select Option to Track</span>
                      </div>

                      {loadingOptions ? (
                        <div className="options-loading">
                          <Loader2 size={16} className="spin-icon" />
                          <span>Loading options…</span>
                        </div>
                      ) : (
                        <div className="options-chips-wrap">
                          {options.map((opt) => {
                            const isOptActive = selectedOption?.optionIndex === opt.optionIndex;
                            return (
                              <button
                                key={opt.optionIndex}
                                type="button"
                                className={`option-chip-modal ${isOptActive ? 'selected' : ''}`}
                                onClick={() => setSelectedOption(opt)}
                              >
                                {isOptActive && <Check size={13} strokeWidth={2.5} />}
                                <span>{opt.optionName}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {trackError && (
                      <div className="alert alert-error" style={{ marginTop: '0.75rem', padding: '0.65rem 0.85rem' }}>
                        <AlertCircle size={15} />
                        <span style={{ fontSize: '0.8rem' }}>{trackError}</span>
                      </div>
                    )}

                    <div className="track-action-section">
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%', justifyContent: 'center' }}
                        disabled={!selectedOption || tracking}
                        onClick={handleTrack}
                      >
                        {tracking ? (
                          <>
                            <Loader2 size={15} className="spin-icon" />
                            <span>Adding to Dashboard…</span>
                          </>
                        ) : (
                          <>
                            <Plus size={15} strokeWidth={2.5} />
                            <span>Track this Option</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="no-product-selected">
                    <Layers size={32} strokeWidth={1.5} className="no-prod-icon" />
                    <p className="no-prod-title">Select a product</p>
                    <p className="no-prod-desc">
                      Choose any item from the left to view available options and track it.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
