import { notFound } from 'next/navigation';
import { db, MATCH_SELECT, loadEvents } from '../../../lib/db';
import { currentRole } from '../../../lib/session';
import { analyseMatch, PERIODS, QUARTERS, quarterOf, halfOf, withoutNames } from '../../../lib/analysis';
import { score } from '../../components';
import { Versus, ScoringFlow, SourceBars, pctTxt } from './charts';
import { PrintButton, SectionImages } from '../../report/Export';
import { ShotMap, ShotLegend, hasShotMap } from '../../report/ShotMap';
import { isLiveCode } from '../../../lib/live';
import { KickoutSection, ShootingSection, PeriodSection, TurnoverSection, PlayerTable } from '../../report/sections';

export const dynamic = 'force-dynamic';

const ROS = '#3b4f9e'; // Roscommon blue (crest blue, lifted for chart contrast)
const OPP = '#c4572a'; // opposition burnt orange

export default async function Match({ params, searchParams }) {
  const { data: m } = await db.from('matches').select(MATCH_SELECT).eq('id', params.id).single();
  if (!m) notFound();
  const showNames = m.competitions.show_player_names;
  const role = await currentRole();
  const view = searchParams.view === 'analyst' ? 'analyst' : 'coach';
  const period = PERIODS.includes(searchParams.period) ? searchParams.period : 'All';

  const [{ data: apps }, rawEvents] = await Promise.all([
    db.from('appearances').select('team_id, jersey_no, started, goals, points, sub_on_minute, sub_off_minute, players(id,name)')
      .eq('match_id', m.id).order('jersey_no'),
    loadEvents(m.id),
  ]);

  const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
  const rosIdx = teams.findIndex((t) => /roscommon/i.test(t.name));
  const colors = teams.map((_, i) => (rosIdx === -1 ? (i === 0 ? ROS : OPP) : i === rosIdx ? ROS : OPP));
  const [A, B] = teams.map((t, i) => ({ ...t, color: colors[i] }));

  // Underage competitions hide player names everywhere on the page.
  const events = showNames ? rawEvents : withoutNames(rawEvents);
  const r = analyseMatch({ events, teams, match: m, period });
  const a = r.byTeam[A.id];
  const b = r.byTeam[B.id];

  const href = (o) => {
    const p = new URLSearchParams();
    const v = o.view ?? view;
    const per = o.period ?? period;
    if (v === 'analyst') p.set('view', 'analyst');
    if (per !== 'All') p.set('period', per);
    const s = p.toString();
    return `/match/${m.id}${s ? `?${s}` : ''}`;
  };

  const nameFor = (teamId, no) => {
    if (!showNames || !no) return null;
    const n = parseInt(String(no).replace(/\D/g, ''), 10);
    const app = (apps || []).find((x) => x.team_id === teamId && x.jersey_no === n);
    return app?.players?.name || null;
  };

  const hasEvents = events.length > 0;
  const teamHref = (name) => `/team/${encodeURIComponent(name)}?${new URLSearchParams({ grade: m.competitions.grade || 'Senior', year: String(m.competitions.seasons.year) })}`;
  const pss = (q) => (r.has.poss ? `${q.poss}-${q.shots}-${q.scores}` : `${q.shots}-${q.scores}`);

  return (
    <>
      <p className="muted">
        {role === 'admin' && <span className="no-print">{isLiveCode(m.match_code) && <><a href={`/admin/live/${m.id}`}>Open in live tagger</a> · </>}<a href={`/admin/game/${m.id}`}>Edit game</a> · </span>}
        <a href="/">All games</a> · {m.competitions.name} · {m.competitions.seasons.year}{m.stage ? ` · ${m.stage}` : ''} · {m.match_date}
      </p>
      <div className="scoreline" data-export-title={`${A.name} ${score(m.team1_goals, m.team1_points)} – ${score(m.team2_goals, m.team2_points)} ${B.name} · ${m.competitions.name} ${m.competitions.seasons.year}${m.stage ? ` · ${m.stage}` : ''} · ${m.match_date}`}>
        <a className="team" href={teamHref(A.name)} title={`${A.name} team report`}><i className="sw" style={{ background: A.color }} />{A.name}</a>
        <span className="big">{score(m.team1_goals, m.team1_points)}</span>
        <span className="dash">–</span>
        <span className="big">{score(m.team2_goals, m.team2_points)}</span>
        <a className="team" href={teamHref(B.name)} title={`${B.name} team report`}>{B.name}<i className="sw" style={{ background: B.color }} /></a>
      </div>

      <div className="export-bar no-print">
        <span className="muted small">Team names open their full report.</span>
        <PrintButton />
      </div>
      <SectionImages />

      {hasEvents && (
        <nav className="toolbar">
          <div className="seg">
            <a href={href({ view: 'coach' })} className={view === 'coach' ? 'on' : ''}>Coaches</a>
            <a href={href({ view: 'analyst' })} className={view === 'analyst' ? 'on' : ''}>Analyst</a>
          </div>
          <div className="seg">
            {PERIODS.map((p) => (
              <a key={p} href={href({ period: p })} className={period === p ? 'on' : ''}>{p === 'All' ? 'Full game' : p.replace(' Half', '')}</a>
            ))}
          </div>
        </nav>
      )}

      {!hasEvents && <p className="card muted">No tagged events loaded for this game yet.</p>}

      {hasEvents && view === 'analyst' && r.check && (
        <div className={`card check ${r.check.every((c) => c.ok) ? 'ok' : 'warn'}`}>
          <b>{r.check.every((c) => c.ok) ? '✓ Tagged scores match the result' : '⚠ Tagged scores don’t match the result'}</b>
          <div className="muted">
            {r.check.map((c) => `${c.team}: tagged ${c.tagged}, official ${c.official}`).join(' · ')}
            {' · '}{r.total} events loaded
          </div>
        </div>
      )}

      {hasEvents && (
        <>
          <h2>At a glance{period !== 'All' && <span className="muted"> · {period}</span>}</h2>
          <div className="card">
            <Versus
              a={A}
              b={B}
              rows={[
                { label: 'Score', a: a.total, b: b.total, fmt: (v) => v },
                r.has.poss && { label: 'Possessions', a: a.possessions, b: b.possessions },
                r.has.attack && { label: 'Attacks', a: a.attacks, b: b.attacks },
                { label: 'Shots', a: a.shots, b: b.shots },
                { label: 'Scores', a: a.scores, b: b.scores },
                { label: 'Shot conversion', a: a.conv, b: b.conv, max: 100, fmt: pctTxt },
                r.has.poss && { label: 'Possessions → score', a: a.possToScore, b: b.possToScore, max: 100, fmt: pctTxt },
                r.has.goalChance && { label: 'Goal chances', a: a.goalChances, b: b.goalChances },
                r.has.kickout && { label: 'Own kick-outs won', a: a.kickouts.retPct, b: b.kickouts.retPct, max: 100, fmt: pctTxt },
                r.has.turnover && { label: 'Turnovers won', a: a.turnoversWon, b: b.turnoversWon },
                { label: 'Wides', a: a.wides, b: b.wides },
                r.has.foul && { label: 'Fouls conceded', a: a.fouls, b: b.fouls },
              ].filter(Boolean)}
            />
            <p className="muted small">Score shown as total points (goal = 3, two-pointer = 2).{r.has.poss ? ' Possessions → score: share of possessions that ended in a score.' : ''}</p>
          </div>

          {period === 'All' && (
            <>
              <h2>Scoring flow</h2>
              <div className="card">
                <ScoringFlow flow={r.flow} endMin={r.endMin} halfTime={r.halfTime} colors={colors} />
              </div>
            </>
          )}

          <h2>{r.has.poss ? 'Possessions – shots – scores' : 'Shots – scores'}</h2>
          <div className="wrap">
            <table className="nums">
              <thead>
                <tr><th>Quarter</th><th>{A.name}</th><th>Pts</th><th>{B.name}</th><th>Pts</th></tr>
              </thead>
              <tbody>
                {QUARTERS.map((q, i) => (
                  <tr key={q} className={inPeriodQ(period, i) ? '' : 'dim'}>
                    <td>{q}</td>
                    <td>{pss(a.pss[i])}</td><td>{a.pss[i].points}</td>
                    <td>{pss(b.pss[i])}</td><td>{b.pss[i].points}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total</td>
                  <td>{pss({ poss: a.possessions, shots: a.shots, scores: a.scores })}</td><td>{a.total}</td>
                  <td>{pss({ poss: b.possessions, shots: b.shots, scores: b.scores })}</td><td>{b.total}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <KickoutSection A={A} B={B} a={a} b={b} />
          {view === 'analyst' && [A, B].some((t) => r.byTeam[t.id].kickoutSetups.some((x) => x.key !== '—')) && (
            <div className="grid2">
              {[A, B].map((t) => (
                <div className="card" key={t.id}>
                  <h3><i className="sw" style={{ background: t.color }} />Setup faced on {t.name} kick-outs</h3>
                  <table className="nums small-table">
                    <tbody>{r.byTeam[t.id].kickoutSetups.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.n}</td></tr>)}</tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          <ShootingSection A={A} B={B} a={a} b={b} />

          {hasShotMap(r.events) && (
            <>
              <h2>Shot maps{period !== 'All' && <span className="muted"> · {period}</span>}</h2>
              <div className="card">
                <div className="shotmaps">
                  <ShotMap events={r.events} teamId={A.id} name={A.name} color={A.color} />
                  <ShotMap events={r.events} teamId={B.id} name={B.name} color={B.color} />
                </div>
                <ShotLegend />
              </div>
            </>
          )}

          {period === 'All' && <PeriodSection A={A} B={B} a={a} b={b} />}

          <TurnoverSection A={A} B={B} a={a} />

          <h2>Players</h2>
          <div className="players-stack">
            <PlayerTable T={A} s={a} hidden={!showNames} />
            <PlayerTable T={B} s={b} hidden={!showNames} />
          </div>

          <h2>Where the scores came from</h2>
          <div className="grid2">
            {[A, B].map((t) => (
              <div className="card" key={t.id}>
                <h3><i className="sw" style={{ background: t.color }} />{t.name}</h3>
                <SourceBars rows={r.byTeam[t.id].sources} color={t.color} />
              </div>
            ))}
          </div>
          <p className="muted small">
            Each shot is credited to how that team won the ball for the possession it came from.
            Where the source is only tagged on scores, misses show as “Not tagged”.
          </p>
        </>
      )}

      {hasEvents && view === 'analyst' && (
        <>
          <h2>Shooting detail</h2>
          <div className="grid2">
            {[A, B].map((t) => {
              const s = r.byTeam[t.id];
              return (
                <div className="card" key={t.id}>
                  <h3><i className="sw" style={{ background: t.color }} />{t.name}</h3>
                  {s.shotsByArea.some((x) => x.key !== '—') && (
                    <table className="nums small-table">
                      <thead><tr><th>Pitch area</th><th>Shots</th><th>Scores</th><th>Pts</th></tr></thead>
                      <tbody>{s.shotsByArea.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.shots}</td><td>{x.scores}</td><td>{x.points}</td></tr>)}</tbody>
                    </table>
                  )}
                  <table className="nums small-table">
                    <thead><tr><th>Outcome</th><th>Shots</th></tr></thead>
                    <tbody>{s.shotsByOutcome.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.n}</td></tr>)}</tbody>
                  </table>

                </div>
              );
            })}
          </div>

          <h2>Possession, turnovers and fouls</h2>
          <div className="grid2">
            {[A, B].map((t) => {
              const s = r.byTeam[t.id];
              return (
                <div className="card" key={t.id}>
                  <h3><i className="sw" style={{ background: t.color }} />{t.name}</h3>
                  {s.possFrom.some((x) => x.key !== '—') && (
                    <table className="nums small-table">
                      <thead><tr><th>Possession won from</th><th>No.</th></tr></thead>
                      <tbody>{s.possFrom.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.n}</td></tr>)}</tbody>
                    </table>
                  )}
                  {r.has.turnoverType && (
                    <table className="nums small-table">
                      <thead><tr><th>Turnovers lost, how</th><th>No.</th></tr></thead>
                      <tbody>{s.turnoversLostByType.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.n}</td></tr>)}</tbody>
                    </table>
                  )}
                  {r.has.area && (
                    <>
                      <table className="nums small-table">
                        <thead><tr><th>Turnovers lost, by area</th><th>No.</th></tr></thead>
                        <tbody>{s.turnoversLostByArea.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.n}</td></tr>)}</tbody>
                      </table>
                      <table className="nums small-table">
                        <thead><tr><th>Fouls conceded, by area</th><th>No.</th></tr></thead>
                        <tbody>{s.foulsByArea.map((x) => <tr key={x.key}><td>{x.key}</td><td>{x.n}</td></tr>)}</tbody>
                      </table>
                    </>
                  )}
                  {!r.has.area && (
                    <p className="muted small">Fouls conceded: {s.fouls} · Turnovers lost: {s.turnoversLost}</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small">Pitch areas are from the point of view of the team named on the event.</p>

          <details className="log-details">
            <summary><h2>Event log <span className="muted">· {r.events.length} events</span></h2></summary>
          <div className="wrap log">
            <table>
              <thead><tr><th>Min</th><th>Qtr</th><th>Team</th><th>Event</th><th>Outcome</th><th>Player</th><th>Detail</th></tr></thead>
              <tbody>
                {r.events.map((e) => {
                  const t = e.team_id === A.id ? A : e.team_id === B.id ? B : null;
                  const extra = Object.entries(e.labels || {})
                    .filter(([k]) => !['Half', 'Quarter'].includes(k))
                    .map(([k, v]) => `${k}: ${v}`).join(' · ');
                  return (
                    <tr key={e.id}>
                      <td>{e.minute != null ? Number(e.minute).toFixed(1) : ''}{halfOf(e).startsWith('2') ? ' (2H)' : ''}</td>
                      <td>{quarterOf(e)}</td>
                      <td>{t && <i className="sw" style={{ background: t.color }} />}{t?.name || ''}</td>
                      <td>{e.event_type}</td>
                      <td>{e.outcome || ''}</td>
                      <td>{e.player_no || ''}</td>
                      <td className="muted">{extra}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </details>
          {r.otherTypes.length > 0 && (
            <p className="muted small">Also tagged (shown in the log only): {r.otherTypes.join(', ')}.</p>
          )}
        </>
      )}

      {(apps || []).length > 0 && <h2>Line-outs</h2>}
      <div className="grid2">
        {[A, B].map((t) => {
          const list = (apps || []).filter((x) => x.team_id === t.id);
          if (!list.length) return null;
          return (
            <div className="wrap" key={t.id}>
              <table>
                <thead><tr><th>{t.name}</th><th>Start</th><th>Score</th></tr></thead>
                <tbody>
                  {list.map((x, i) => (
                    <tr key={i}>
                      <td>{x.jersey_no ? `${x.jersey_no}. ` : ''}{showNames ? <a href={`/player/${x.players.id}`}>{x.players.name}</a> : 'Player'}</td>
                      <td>{x.started ? '●' : `Sub${x.sub_on_minute ? ` ${x.sub_on_minute}′` : ''}`}</td>
                      <td>{score(x.goals, x.points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </>
  );
}

function inPeriodQ(period, i) {
  if (period === 'All') return true;
  if (period === '1st Half') return i < 2;
  if (period === '2nd Half') return i >= 2;
  return period === QUARTERS[i];
}

function distName(d) {
  return { SKO: 'Short', MKO: 'Medium', LKO: 'Long' }[d] || d;
}
