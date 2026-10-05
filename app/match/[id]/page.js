import { notFound } from 'next/navigation';
import { db, MATCH_SELECT } from '../../../lib/db';
import { score } from '../../components';

export const dynamic = 'force-dynamic';

export default async function Match({ params }) {
  const { data: m } = await db.from('matches').select(MATCH_SELECT).eq('id', params.id).single();
  if (!m) notFound();
  const showNames = m.competitions.show_player_names;

  const [{ data: apps }, { data: evs }] = await Promise.all([
    db.from('appearances').select('team_id, jersey_no, started, goals, points, players(id,name)')
      .eq('match_id', m.id).order('jersey_no'),
    db.from('events').select('team_id, event_type, outcome').eq('match_id', m.id).limit(5000),
  ]);

  const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
  const events = evs || [];
  const n = (tid, f) => events.filter((e) => e.team_id === tid && f(e)).length;
  const types = [...new Set(events.map((e) => e.event_type))].sort();
  const outcomes = [...new Set(events.filter((e) => e.event_type.startsWith('Shot')).map((e) => e.outcome || '—'))].sort();

  return (
    <>
      <p className="muted">{m.competitions.name} · {m.competitions.seasons.year}{m.stage ? ` · ${m.stage}` : ''} · {m.match_date}</p>
      <div className="score">
        {m.team1.name} {score(m.team1_goals, m.team1_points)} — {score(m.team2_goals, m.team2_points)} {m.team2.name}
      </div>

      {(apps || []).length > 0 && <h2>Line-outs</h2>}
      {teams.map((t) => {
        const list = (apps || []).filter((a) => a.team_id === t.id);
        if (!list.length) return null;
        return (
          <div className="wrap" key={t.id}>
            <table>
              <thead><tr><th>{t.name}</th><th>Start</th><th>Score</th></tr></thead>
              <tbody>
                {list.map((a, i) => (
                  <tr key={i}>
                    <td>{a.jersey_no ? `${a.jersey_no}. ` : ''}{showNames ? <a href={`/player/${a.players.id}`}>{a.players.name}</a> : 'Player'}</td>
                    <td>{a.started ? '●' : 'Sub'}</td>
                    <td>{score(a.goals, a.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {events.length > 0 && (
        <>
          <h2>Match events</h2>
          <div className="wrap">
            <table>
              <thead><tr><th>Event</th><th>{teams[0].name}</th><th>{teams[1].name}</th></tr></thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t}><td>{t}</td><td>{n(teams[0].id, (e) => e.event_type === t)}</td><td>{n(teams[1].id, (e) => e.event_type === t)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Shot outcomes</h2>
          <div className="wrap">
            <table>
              <thead><tr><th>Outcome</th><th>{teams[0].name}</th><th>{teams[1].name}</th></tr></thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={o}>
                    <td>{o}</td>
                    <td>{n(teams[0].id, (e) => e.event_type.startsWith('Shot') && (e.outcome || '—') === o)}</td>
                    <td>{n(teams[1].id, (e) => e.event_type.startsWith('Shot') && (e.outcome || '—') === o)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
