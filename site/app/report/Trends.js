// In-game trends panel: recent-spell numbers, call-outs and a momentum strip.
// Plain markup, used on the live match page and in the tagger.
import { trends } from '../../lib/trends';
import { Pss } from './sections';
import { targetText } from '../../lib/targets';

export default function Trends({ events, teams, halfLen = 35, windowMin = 10, usId = null, controls = null, target = null }) {
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
      {t.quarterNow && (
        <div className="trends-q">
          <span className="stat-k">{t.quarterNow.q} so far{target ? ` · target ${targetText(target)}` : ''}</span>
          {t.quarterNow.teams.map((q) => (
            <span key={q.id}><i className="sw" style={{ background: color(q.id) }} />{teams.find((x) => x.id === q.id)?.name} <b className="num"><Pss q={q} t={q.id === usId || usId == null ? target : null} /></b></span>
          ))}
        </div>
      )}
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
      {teams.filter((tm) => tm.id !== usId).map((tm) => {
        const rows = (t.danger[tm.id] || []).slice(0, 6);
        const us = teams.find((x) => x.id !== tm.id);
        return (
          <div key={tm.id}>
            <div className="vs-heading">{usId == null ? `${tm.name} danger players` : `${tm.name} players hurting us`}</div>
            {rows.length ? (
              <div className="wrap">
                <table className="danger" style={{ '--tc': tm.color }}>
                  <thead><tr><th /><th>Score</th><th>Shots</th><th title={`Frees won off ${us.name}`}>Frees won</th><th title={`Turnovers won off ${us.name}`}>T/O won</th><th title="2-pointers scored / tried">2-pt</th><th title={`${tm.name} kick-outs won by this player`}>Own KOs won</th><th title={`${us.name} kick-outs won`}>{usId == null ? `${us.name.split(' ')[0]} KOs won` : 'Our KOs won'}</th><th>Last {windowMin}′</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.who} className={r.recent ? 'hot' : ''}>
                        <td><i className="sw" style={{ background: tm.color }} />{r.who}</td>
                        <td className="num"><b>{r.pts ? r.line : '–'}</b></td>
                        <td className="num">{r.shots ? `${r.scores}/${r.shots}` : '–'}</td>
                        <td className="num">{r.freesWon || '–'}</td>
                        <td className="num">{r.toWon || '–'}</td>
                        <td className="num">{r.twoTried ? `${r.twoScored}/${r.twoTried}` : '–'}</td>
                        <td className="num">{r.ownKo || '–'}</td>
                        <td className="num">{r.koWon || '–'}</td>
                        <td className="num">{r.recent ? <b>{r.recent}</b> : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">No {tm.name} players tagged yet. Pick the player when you tag a shot, free, turnover or kick-out.</p>
            )}
          </div>
        );
      })}
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
