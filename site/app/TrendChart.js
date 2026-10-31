// Small line chart of one measure across games, one line per side.
// Server-rendered SVG; hover detail via native tooltips on each point.
export default function TrendChart({ title, games, series, fmt = (v) => v, unit = '', min = null, max = null, note }) {
  const W = 320, H = 150, L = 30, R = 10, T = 12, B = 28;
  const vals = series.flatMap((s) => s.values).filter((v) => v != null);
  if (!vals.length) return null;
  const lo = min ?? Math.min(0, ...vals);
  const hi = max ?? (Math.max(...vals) * 1.1 || 1);
  const x = (i) => L + (games.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (games.length - 1));
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
  const ticks = [lo, (lo + hi) / 2, hi].map((t) => Math.round(t));
  const path = (vs) => {
    let d = '', pen = false;
    vs.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const last = (vs) => { for (let i = vs.length - 1; i >= 0; i -= 1) if (vs[i] != null) return i; return -1; };
  // Direct label on each line's last point, nudged apart if they'd overlap.
  const labels = series.map((s) => {
    const i = last(s.values);
    return i < 0 ? null : { x: x(i) + 6, y: y(s.values[i]) - 6, v: s.values[i] };
  });
  if (labels[0] && labels[1] && Math.abs(labels[0].y - labels[1].y) < 11) {
    const [hi1, lo1] = labels[0].y <= labels[1].y ? [labels[0], labels[1]] : [labels[1], labels[0]];
    const mid = (hi1.y + lo1.y) / 2;
    hi1.y = mid - 6; lo1.y = mid + 6;
  }
  return (
    <figure className="trend-chart card">
      <figcaption>
        <b>{title}</b>
        <span className="tc-legend">
          {series.map((s) => <span key={s.name}><i className="sw" style={{ background: s.color }} />{s.name}</span>)}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="tc-grid" />
            <text x={L - 5} y={y(t) + 3} textAnchor="end" className="tc-axis">{t}{unit}</text>
          </g>
        ))}
        {games.map((g, i) => (
          <text key={g.id} x={x(i)} y={H - 8} textAnchor="middle" className="tc-axis">{g.short}</text>
        ))}
        {series.map((s, si) => (
          <g key={s.name}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => v != null && (
              <g key={i}>
                <circle cx={x(i)} cy={y(v)} r="4" fill={s.color} stroke="var(--card-bg, #fff)" strokeWidth="2" />
                <circle cx={x(i)} cy={y(v)} r="11" fill="transparent">
                  <title>{`${s.name} v ${games[i].opp} (${games[i].date}): ${fmt(v)}${unit}`}</title>
                </circle>
              </g>
            ))}
            {labels[si] && <text x={labels[si].x} y={labels[si].y} className="tc-label">{fmt(labels[si].v)}{unit}</text>}
          </g>
        ))}
      </svg>
      {note && <p className="muted small">{note}</p>}
    </figure>
  );
}
