// In-game trends panel: recent-spell numbers, call-outs and a momentum strip.
// Plain markup, used on the live match page and in the tagger.
import { trends } from '../../lib/trends';

export default function Trends({ events, teams, halfLen = 35, windowMin = 10, usId = null, controls = null }) {
  const t = trends({ events, teams, halfLen, windowMin, usId });
  if (!events.length) return null;
  const color = (id) => teams.find((x) => x.id === id)?.color;
  const max = Math.max(3, ...t.blocks.flatMap((b) => b.pts)) + 1; // headroom for the number
  return (
    <div className="card trends">
      <div className="trends-head">
        <b>Last {windowMin} minutes</b>
        <span className="muted small">to {t.nowLabel}</span>
        {controls}
      </div>
      <div className="trends-window">
        {t.window.map((w) => (
          <div key={w.id} style={{ '--tc': color(w.id) }}>
            <span className="tw-name">{teams.find((x) => x.id === w.id)?.name}</span>
            <b className="num">{w.line}</b>
            <span className="muted small">{w.scores}/{w.shots} shots{w.poss ? ` · ${w.poss} poss` : ''}</span>
          </div>
        ))}
      </div>
      {t.items.length ? (
        <ul className="trend-list">
          {t.items.slice(0, 8).map((i, n) => (
            <li key={n} className={`tr-${i.tone}`} style={{ '--tc': color(i.team) }}>{i.text}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nothing standing out yet.</p>
      )}
      {t.blocks.length > 0 && (
        <>
          <div className="vs-heading">Momentum: points per 5 minutes</div>
          <div className="momentum" style={{ '--n': t.blocks.length }}>
            {t.blocks.map((b, i) => (
              <div key={i} className={`mb ${i > 0 && b.half !== t.blocks[i - 1].half ? 'ht' : ''}`} title={`${b.half === 2 ? '2nd half ' : ''}${b.label}: ${teams[0].name} ${b.pts[0]}, ${teams[1].name} ${b.pts[1]}`}>
                <span className="up"><i style={{ height: `${(100 * b.pts[0]) / max}%`, background: teams[0].color }} />{b.pts[0] > 0 && <em>{b.pts[0]}</em>}</span>
                <span className="dn"><i style={{ height: `${(100 * b.pts[1]) / max}%`, background: teams[1].color }} />{b.pts[1] > 0 && <em>{b.pts[1]}</em>}</span>
                <small>{b.label}</small>
              </div>
            ))}
          </div>
          <p className="muted small center">
            <i className="sw" style={{ background: teams[0].color }} />{teams[0].name} above · <i className="sw" style={{ background: teams[1].color }} />{teams[1].name} below
          </p>
        </>
      )}
    </div>
  );
}
