// Server-rendered charts for the match dashboard. Plain SVG/HTML, no chart library.
// Hover detail uses native <title> tooltips so it works without client JavaScript.

const pctTxt = (v) => (v == null ? '—' : `${v}%`);

// Head-to-head row: value, two bars growing out from the centre, value.
export function Versus({ rows, a, b }) {
  return (
    <div className="versus">
      <div className="vs-head">
        <span><i className="sw" style={{ background: a.color }} />{a.name}</span>
        <span>{b.name}<i className="sw" style={{ background: b.color }} /></span>
      </div>
      {rows.map((r) => {
        const max = Math.max(r.a ?? 0, r.b ?? 0, r.max ?? 0) || 1;
        const fmt = r.fmt || ((v) => v ?? '—');
        return (
          <div className="vs-row" key={r.label}>
            <b className="num">{fmt(r.a)}</b>
            <div className="vs-bar left" title={`${a.name}: ${fmt(r.a)} ${r.label}`}>
              <span style={{ width: `${(100 * (r.a ?? 0)) / max}%`, background: a.color }} />
            </div>
            <span className="vs-label">{r.label}</span>
            <div className="vs-bar" title={`${b.name}: ${fmt(r.b)} ${r.label}`}>
              <span style={{ width: `${(100 * (r.b ?? 0)) / max}%`, background: b.color }} />
            </div>
            <b className="num">{fmt(r.b)}</b>
          </div>
        );
      })}
    </div>
  );
}

// Cumulative score through the game, one step line per team.
export function ScoringFlow({ flow, endMin, halfTime, colors }) {
  const W = 640, H = 220, L = 34, R = 16, T = 12, B = 26;
  const maxPts = Math.max(5, ...flow.map((f) => f.points[f.points.length - 1].total));
  const yMax = Math.ceil(maxPts / 5) * 5;
  const x = (m) => L + ((W - L - R) * Math.min(m, endMin)) / endMin;
  const y = (v) => T + (H - T - B) * (1 - v / yMax);
  const ticks = [];
  for (let v = 0; v <= yMax; v += yMax > 20 ? 10 : 5) ticks.push(v);
  const mins = [0, 10, 20, 30, 40, 50, 60, 70].filter((m) => m <= endMin);

  // End-of-line labels: keep at least 14px apart so level scores don't overlap.
  const labelY = flow.map((f) => y(f.points[f.points.length - 1].total) - 6);
  const order = labelY.map((v, i) => i).sort((p, q) => labelY[p] - labelY[q]);
  for (let k = 1; k < order.length; k++) {
    const prev = labelY[order[k - 1]], cur = order[k];
    if (labelY[cur] - prev < 14) labelY[cur] = prev + 14;
  }

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cumulative score through the match">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
            <text x={L - 6} y={y(v) + 4} className="tick" textAnchor="end">{v}</text>
          </g>
        ))}
        {mins.map((m) => (
          <text key={m} x={x(m)} y={H - 8} className="tick" textAnchor="middle">{m}′</text>
        ))}
        {halfTime > 0 && (
          <g>
            <line x1={x(halfTime)} x2={x(halfTime)} y1={T} y2={H - B} className="ht" />
            <text x={x(halfTime) + 4} y={T + 10} className="tick">HT</text>
          </g>
        )}
        {flow.map((f, i) => {
          const pts = f.points;
          let d = `M${x(0)},${y(0)}`;
          for (const p of pts.slice(1)) d += ` H${x(p.min)} V${y(p.total)}`;
          d += ` H${x(endMin)}`;
          const last = pts[pts.length - 1];
          return (
            <g key={f.team.id}>
              <path d={d} fill="none" stroke={colors[i]} strokeWidth="2" strokeLinejoin="round" />
              {pts.slice(1).map((p, j) => (
                <g key={j}>
                  <circle cx={x(p.min)} cy={y(p.total)} r="4" fill={colors[i]} stroke="#fff" strokeWidth="2" />
                  <circle cx={x(p.min)} cy={y(p.total)} r="10" fill="transparent">
                    <title>{`${f.team.name} ${p.outcome}${p.value > 1 ? ` (+${p.value})` : ''}${p.player ? ` · ${p.player}` : ''} · ${Math.round(p.min)}′ · total ${p.total}`}</title>
                  </circle>
                </g>
              ))}
              <text x={W - R - 2} y={labelY[i]} className="end-label" textAnchor="end">
                {f.team.name} {last.total}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="muted">Total points through the game (goal = 3). Hover a dot for the score.</figcaption>
    </figure>
  );
}

// One stacked bar: own kick-outs won clean / won break / lost break / lost clean.
export function KickoutBar({ k, color }) {
  const segs = [
    { n: k.wonClean, label: 'Won clean', cls: 'won-clean' },
    { n: k.wonBreak, label: 'Won break', cls: 'won-break' },
    { n: k.lostBreak, label: 'Lost break', cls: 'lost-break' },
    { n: k.lostClean, label: 'Lost clean', cls: 'lost-clean' },
  ];
  if (!k.total) return <p className="muted">No kick-outs in this period.</p>;
  return (
    <>
      <div className="stack">
        {segs.map((s) =>
          s.n ? (
            <span
              key={s.cls}
              className={s.cls}
              style={{ flex: s.n, '--c': color }}
              title={`${s.label}: ${s.n}`}
            >
              {s.n}
            </span>
          ) : null
        )}
      </div>
      <div className="legend">
        {segs.map((s) => (
          <span key={s.cls}><i className={`sw ${s.cls}`} style={{ '--c': color }} />{s.label} {s.n}</span>
        ))}
      </div>
    </>
  );
}

// Horizontal bars: shots from each source, with the scoring part filled solid.
export function SourceBars({ rows, color }) {
  if (!rows.length) return <p className="muted">No shots in this period.</p>;
  const max = Math.max(...rows.map((r) => r.shots));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.source} title={`${r.source}: ${r.scores} scores from ${r.shots} shots (${r.points} pts)`}>
          <span className="hbar-label">{r.source}</span>
          <div className="hbar-track">
            <span className="hbar-shots" style={{ width: `${(100 * r.shots) / max}%`, '--c': color }}>
              <span className="hbar-scores" style={{ width: `${(100 * r.scores) / r.shots}%`, background: color }} />
            </span>
          </div>
          <span className="hbar-val">{r.scores}/{r.shots} · {r.points} pts</span>
        </div>
      ))}
      <div className="legend">
        <span><i className="sw" style={{ background: color }} />Scored</span>
        <span><i className="sw hollow" style={{ '--c': color }} />Shot, not scored</span>
      </div>
    </div>
  );
}

export { pctTxt };
