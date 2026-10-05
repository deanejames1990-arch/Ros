import { notFound } from 'next/navigation';
import { db, hiddenPlayerIds } from '../../../lib/db';
import { score } from '../../components';

export const dynamic = 'force-dynamic';

export default async function Player({ params }) {
  const { data: p } = await db.from('players').select('id,name,club').eq('id', params.id).single();
  if (!p) notFound();
  if ((await hiddenPlayerIds([p.id])).size) notFound();

  const { data: seasons } = await db.from('player_season_totals').select('*')
    .eq('player_id', p.id).order('year', { ascending: false });
  const { data: apps } = await db.from('appearances')
    .select('started, goals, points, matches(id, match_date, team1:teams!team1_id(name), team2:teams!team2_id(name))')
    .eq('player_id', p.id);
  const games = (apps || []).sort((a, b) => b.matches.match_date.localeCompare(a.matches.match_date));

  return (
    <>
      <h1>{p.name}</h1>
      <p className="muted">{p.club}</p>
      <h2>Season by season</h2>
      <div className="wrap">
        <table>
          <thead><tr><th>Year</th><th>Grade</th><th>Team</th><th>Apps</th><th>Starts</th><th>Score</th></tr></thead>
          <tbody>
            {(seasons || []).map((s, i) => (
              <tr key={i}><td>{s.year}</td><td>{s.grade}</td><td>{s.team}</td><td>{s.appearances}</td><td>{s.starts}</td><td>{score(s.goals, s.points)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Appearances</h2>
      {games.map((a, i) => (
        <a key={i} className="card" href={`/match/${a.matches.id}`}>
          {a.matches.team1.name} v {a.matches.team2.name} <span className="muted">· {a.matches.match_date} · {a.started ? 'Started' : 'Sub'} · {score(a.goals, a.points)}</span>
        </a>
      ))}
    </>
  );
}
