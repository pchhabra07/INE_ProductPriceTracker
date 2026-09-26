// Renders a price/stock history chart using plain SVG — no external chart library needed.
// Receives: history = array of { price, scraped_at, outcome } (successful rows only for the chart line)
export default function PriceHistoryChart({ history }) {
  // Filter to successful rows with a real price, sorted oldest→newest
  const successRows = history
    .filter((r) => r.outcome !== 'failed' && r.price !== null)
    .sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));

  if (successRows.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Price History</div>
        <div className="empty-state" style={{ padding: '2rem' }}>
          <div className="empty-icon">📈</div>
          <div className="empty-title">No price data yet</div>
          <p>Price history will appear after the first successful scrape.</p>
        </div>
      </div>
    );
  }

  const prices = successRows.map((r) => Number(r.price));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const W = 800;
  const H = 240;
  const PAD = { top: 20, right: 24, bottom: 48, left: 72 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const n = successRows.length;

  // Map each row to an SVG coordinate
  const points = successRows.map((r, i) => {
    const x = PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = PAD.top + innerH - ((Number(r.price) - minPrice) / priceRange) * innerH;
    return { x, y, row: r };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Y-axis labels (4 ticks)
  const yTicks = [0, 0.33, 0.66, 1].map((pct) => ({
    y: PAD.top + innerH - pct * innerH,
    label: `₹${Math.round(minPrice + pct * priceRange).toLocaleString('en-IN')}`,
  }));

  // X-axis labels (show first, middle, last)
  const xLabelIdxs = n <= 4 ? successRows.map((_, i) => i) : [0, Math.floor(n / 2), n - 1];
  const xLabels = xLabelIdxs.map((i) => ({
    x: points[i].x,
    label: new Date(successRows[i].scraped_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="chart-container">
      <div className="chart-title">Price History — ₹{minPrice.toLocaleString('en-IN')} – ₹{maxPrice.toLocaleString('en-IN')}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        <defs>
          <linearGradient id="price-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6c63ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6c63ff" stopOpacity="0.02" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y}
            stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#price-area-grad)" />

        {/* Price line */}
        <path d={linePath} fill="none" stroke="#6c63ff" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#6c63ff"
            stroke="var(--bg-1)" strokeWidth="2">
            <title>₹{Number(p.row.price).toLocaleString('en-IN')} · {new Date(p.row.scraped_at).toLocaleString('en-IN')}</title>
          </circle>
        ))}

        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.left - 8} y={t.y + 4}
            textAnchor="end" fill="rgba(148,163,184,0.8)" fontSize="10" fontFamily="Inter, sans-serif">
            {t.label}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H - 10}
            textAnchor="middle" fill="rgba(148,163,184,0.7)" fontSize="10" fontFamily="Inter, sans-serif">
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
