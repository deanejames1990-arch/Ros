import { db, MATCH_SELECT } from '../../lib/db';
import { score } from '../components';
import { passwords } from '../../lib/auth';
import { CompetitionForm } from './forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manage · James Deane Analysis' };

export default async function Manage({ searchParams }) {
  const [{ data: matches }, { data: comps }, { data: counts }] = await Promise.all([
    db.from('matches').select(MATCH_SELECT).order('match_date', { ascending: false }).limit(1000),
    db.from('competitions').select('id, name, grade, show_player_names, seasons(year)'),
    db.from('matches').select('competition_id'),
  ]);
  const competitions = (comps || []).map((c) => ({ ...c, year: c.seasons?.year }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (a.grade || '').localeCompare(b.grade || '') || a.name.localeCompare(b.name));
  const n = {};
  for (const r of counts || []) n[r.competition_id] = (n[r.competition_id] || 0) + 1;
  const q = String(searchParams.q || '').toLowerCase();
  const list = (matches || []).filter((m) => !q || `${m.team1.name} ${m.team2.name} ${m.competitions?.name} ${m.match_date}`.toLowerCase().includes(q));

  return (
    <>
      <h1>Manage</h1>
      {!passwords().adminSet && (
        <p className="card check warn small">
          No separate admin password is set yet, so the viewer password can also add and change games.
          Add <b>ADMIN_PASSWORD</b> in Vercel → Settings → Environment Variables, then redeploy.
        </p>
      )}
      {searchParams.deleted && <p className="card check ok small">Game deleted.</p>}
      {searchParams.merged && <p className="card check ok small">Competitions merged.</p>}

      <a href="/admin/names" className="card people-link"><b>Tidy names</b> <span className="muted small">Match the names in the tags (“Lundy”) to players’ full names, team by team</span></a>
      <a href="/admin/people" className="card people-link"><b>People</b> <span className="muted small">Give each person their own access code, limit them to a grade, switch them off</span></a>

      <h2>Games</h2>
      <form method="get" className="search"><input name="q" defaultValue={searchParams.q || ''} placeholder="Filter by team, competition or date" /><button type="submit">Filter</button></form>
      <div className="wrap">
        <table className="admin-table">
          <thead><tr><th>Date</th><th>Game</th><th>Score</th><th>Competition</th><th /></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id}>
                <td>{m.match_date}</td>
                <td>{m.team1.name} v {m.team2.name}</td>
                <td className="num">{score(m.team1_goals, m.team1_points)} – {score(m.team2_goals, m.team2_points)}</td>
                <td className="muted small">{m.competitions?.seasons?.year} · {m.competitions?.name}{m.stage ? ` · ${m.stage}` : ''}</td>
                <td><a href={`/admin/game/${m.id}`}>Edit</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Competitions</h2>
      <p className="muted small">Rename, set the grade, hide player names (underage), or merge a duplicate into another competition.</p>
      <div className="admin-comps">
        {competitions.map((c) => (
          <CompetitionForm key={c.id} c={c} games={n[c.id] || 0} others={competitions.filter((o) => o.id !== c.id)} />
        ))}
      </div>
    </>
  );
}
