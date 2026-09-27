import { useState, useRef } from 'react';
import { LineChart as LineChartIcon, Clock, CheckCircle2, RotateCw } from 'lucide-react';

// Renders a price/stock history chart using SVG with time markings and custom hover tooltip layover
export default function PriceHistoryChart({ history }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const containerRef = useRef(null);

  // Filter to successful rows with a real price, sorted oldest→newest
  const successRows = (history || [])
    .filter((r) => r.outcome !== 'failed' && r.price !== null)
    .sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));

  if (successRows.length === 0) {
    return (
      <div className="chart-container">
        <div className="chart-title">Price History</div>
        <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
          <div className="empty-icon">
            <LineChartIcon size={40} strokeWidth={1.5} />
          </div>
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

  const W = 840;
  const H = 270;
  const PAD = { top: 28, right: 28, bottom: 58, left: 76 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const n = successRows.length;

  // Map each row to an SVG coordinate
  const points = successRows.map((r, i) => {
    const x = PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = PAD.top + innerH - ((Number(r.price) - minPrice) / priceRange) * innerH;
    return { x, y, row: r, index: i };
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

  // X-axis labels with date and time
  const getTickIndices = () => {
    if (n <= 4) return successRows.map((_, i) => i);
    if (n <= 7) return [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
    return [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
  };

  const xLabelIdxs = getTickIndices();
  const xLabels = xLabelIdxs.map((i) => {
    const d = new Date(successRows[i].scraped_at);
    const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    return {
      x: points[i].x,
      date: dateStr,
      time: timeStr,
    };
  });

  const formatCurrency = (val) => `₹${Number(val).toLocaleString('en-IN')}`;

  const formatFullDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="chart-container" ref={containerRef}>
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Price Trend</h3>
          <p className="chart-subtitle">
            Range: <span className="price-tag">{formatCurrency(minPrice)}</span> to{' '}
            <span className="price-tag">{formatCurrency(maxPrice)}</span> across {n} point{n !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="chart-svg-wrapper">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart-svg"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="price-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {yTicks.map((t, i) => (
            <line
              key={i}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          {/* Area fill */}
          <path d={areaPath} fill="url(#price-area-grad)" />

          {/* Price line */}
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover Crosshair Vertical Line */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="3 3"
              strokeOpacity="0.6"
            />
          )}

          {/* Data Points */}
          {points.map((p, i) => {
            const isHovered = hoveredPoint?.index === i;
            return (
              <g key={i}>
                {/* Invisible large target for easy hover */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="14"
                  fill="transparent"
                  className="chart-hit-target"
                  onMouseEnter={() => setHoveredPoint(p)}
                  onClick={() => setHoveredPoint(p)}
                />
                {/* Active halo */}
                {isHovered && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="8"
                    fill="var(--accent)"
                    fillOpacity="0.3"
                  />
                )}
                {/* Actual node dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? '5.5' : '4'}
                  fill="var(--accent)"
                  stroke="var(--bg-1)"
                  strokeWidth="2.5"
                  className="chart-node"
                />
              </g>
            );
          })}

          {/* Y-axis labels */}
          {yTicks.map((t, i) => (
            <text
              key={i}
              x={PAD.left - 10}
              y={t.y + 4}
              textAnchor="end"
              className="chart-tick-text"
              fill="var(--text-muted)"
              fontSize="11"
              fontFamily="var(--font-sans)"
              fontWeight="500"
            >
              {t.label}
            </text>
          ))}

          {/* X-axis labels: Date line and Time line */}
          {xLabels.map((l, i) => (
            <g key={i} transform={`translate(${l.x}, ${H - 28})`}>
              <text
                x="0"
                y="0"
                textAnchor="middle"
                className="chart-tick-text"
                fill="var(--text-secondary)"
                fontSize="11"
                fontFamily="var(--font-sans)"
                fontWeight="600"
              >
                {l.date}
              </text>
              <text
                x="0"
                y="14"
                textAnchor="middle"
                className="chart-tick-subtext"
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="var(--font-sans)"
                fontWeight="400"
              >
                {l.time}
              </text>
            </g>
          ))}
        </svg>

        {/* Custom Tooltip Layover */}
        {hoveredPoint && (
          <div
            className="chart-tooltip-layover"
            style={{
              left: `${(hoveredPoint.x / W) * 100}%`,
              top: `${(hoveredPoint.y / H) * 100}%`,
              transform:
                hoveredPoint.x / W > 0.7
                  ? 'translate(-105%, -110%)'
                  : hoveredPoint.x / W < 0.25
                  ? 'translate(5%, -110%)'
                  : 'translate(-50%, -115%)',
            }}
          >
            <div className="tooltip-price">
              {formatCurrency(hoveredPoint.row.price)}
            </div>
            <div className="tooltip-meta">
              <Clock size={12} />
              <span>{formatFullDate(hoveredPoint.row.scraped_at)}</span>
            </div>
            {hoveredPoint.row.stock && (
              <div className="tooltip-stock">
                <span className="tooltip-stock-dot" />
                <span>{hoveredPoint.row.stock}</span>
              </div>
            )}
            <div className="tooltip-status">
              {hoveredPoint.row.outcome === 'success' ? (
                <span className="tooltip-badge badge-success">
                  <CheckCircle2 size={11} /> Success
                </span>
              ) : (
                <span className="tooltip-badge badge-retried">
                  <RotateCw size={11} /> Retried
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
