const CHART_COLORS = [
  "#ff7a33",
  "#4fb6e8",
  "#3ddc97",
  "#c084fc",
  "#f472b6",
  "#f2c94c",
  "#38bdf8",
  "#a78bfa",
];

export function BarChart({ data, height = 220 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barW = Math.min(48, Math.floor(600 / data.length) - 8);

  return (
    <div className="chart-wrap" style={{ height }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${data.length * (barW + 16) + 16} ${height}`} preserveAspectRatio="xMidYMid meet">
        {data.map((d, i) => {
          const barH = (d.value / max) * (height - 48);
          const x = 16 + i * (barW + 16);
          const y = height - 32 - barH;
          const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
          return (
            <g key={d.label}>
              <defs>
                <linearGradient id={`bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="1" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.55" />
                </linearGradient>
              </defs>
              <rect x={x} y={y} width={barW} height={barH} rx={6} fill={`url(#bar-grad-${i})`} />
              <text x={x + barW / 2} y={y - 8} textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="600" fontFamily="var(--font-mono)">
                {d.value}%
              </text>
              <text x={x + barW / 2} y={height - 10} textAnchor="middle" fill="var(--text-muted)" fontSize="12" fontFamily="var(--font-body)">
                {d.short || d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({ data, size = 200, totalLabel = "TOTAL" }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 16;
  const inner = r * 0.58;
  let angle = -Math.PI / 2;

  const slices = data.map((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const ix1 = cx + inner * Math.cos(angle - slice);
    const iy1 = cy + inner * Math.sin(angle - slice);
    const ix2 = cx + inner * Math.cos(angle);
    const iy2 = cy + inner * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
    const path = [
      `M ${x1} ${y1}`,
      `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1}`,
      "Z",
    ].join(" ");
    return { path, color, label: d.label, value: d.value, pct: Math.round((d.value / total) * 100) };
  });

  return (
    <div className="donut-chart-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--panel)" strokeWidth="2" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="28" fontWeight="700" fontFamily="var(--font-display)">
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--text-dim)" fontSize="12" fontFamily="var(--font-mono)">
          {totalLabel}
        </text>
      </svg>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div key={i} className="donut-legend-item">
            <span className="donut-swatch" style={{ background: s.color }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-value mono">{s.value} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--accent)", height = 56 }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const w = 200;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = height - 8 - (v / max) * (height - 16);
    return `${x},${y}`;
  });

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="sparkline">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${w},${height}`} fill="url(#spark-fill)" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatRing({ value, max = 100, color = "var(--accent)", size = 88, label }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const offset = circ * (1 - pct);

  return (
    <div className="stat-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="stat-ring-label">
        <span className="stat-ring-value">{value}%</span>
        {label && <span className="stat-ring-sub">{label}</span>}
      </div>
    </div>
  );
}

export { CHART_COLORS };
