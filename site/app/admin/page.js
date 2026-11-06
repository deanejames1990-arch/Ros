import { db, MATCH_SELECT } from '../../lib/db';
import { score } from '../components';
import { passwords } from '../../lib/auth';
import { CompetitionForm, TeamForm } from './forms';
import { scoped, orgScope, onlyOrgComps, currentOrg } from '../../lib/org';
import { currentAccess } from '../../lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manage · James Deane Analysis' };

export default async function Manage({ searchParams }) {
  const [{ data: matches }, { data: allComps }, { data: counts }, access, org] = await Promise.all([
    (await orgScope())(db.from('matches').select(MATCH_SELECT)).order('match_date', { ascending: false }).limit(1000),
    db.from('competitions').select('id, name, grade, show_player_names, seasons(year)'),
    scoped(db.from('matches').select('competition_id')),
    currentAccess(),
    currentOrg(),
  ]);
  const owner = Boolean(access?.isSuper);
  const comps = await onlyOrgComps(allComps);
  const competitions = (comps || []).map((c) => ({ ...c, year: c.seasons?.year }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || (a.grade || '').localeCompare(b.grade || '') || a.name.localeCompare(b.name));
  const n = {};
  for (const r of counts || []) n[r.competition_id] = (n[r.competition_id] || 0) + 1;
  // Teams, with game counts; flag a name that sits inside another ("York" / "New York").
  const { data: allTeams } = await db.from('teams').select('id, name').order('name');
  const gc = {};
  for (const m of matches || []) { gc[m.team1_id] = (gc[m.team1_id] || 0) + 1; gc[m.team2_id] = (gc[m.team2_id] || 0) + 1; }
  const teamList = (allTeams || []).map((t) => {
    const twin = (allTeams || []).find((o) => o.id !== t.id && o.name.length > t.name.length
      && new RegExp(`(^|\\s)${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i').test(o.name));
    return { ...t, games: gc[t.id] || 0, suspect: twin?.name || null };
  }).sort((a, b) => (b.suspect ? 1 : 0) - (a.suspect ? 1 : 0) || a.name.localeCompare(b.name));
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

      <a href="/admin/coverage" className="card people-link"><b>Data check</b> <span className="muted small">Which games are missing shot boxes, kick-out boxes, shooter names or team sheets</span></a>
      <a href="/admin/excel-shots" className="card people-link"><b>Shot boxes from Excel</b> <span className="muted small">Add shot boxes and shooters from an analyst’s workbook to games already on the site</span></a>
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

      {owner && <a href="/admin/orgs" className="card people-link"><b>Organisations</b> <span className="muted small">Clubs and counties using the site: add one, its crest and team, and its first admin</span></a>}

      {owner && <>
      <h2 id="teams">Teams</h2>
      {searchParams.teams && <p className="card check ok small">Team {searchParams.teams}.</p>}
      <p className="muted small">Rename a team, or merge a duplicate into the right one (all its games, tags, team sheets and tidied names move across). Likely duplicates are flagged.</p>
      <details className="card" open={teamList.some((t) => t.suspect)}>
        <summary><b>{teamList.length} teams</b>{teamList.some((t) => t.suspect) && <span className="muted small"> · {teamList.filter((t) => t.suspect).length} look like duplicates</span>}</summary>
        <div className="team-tools">
          {teamList.map((t) => <TeamForm key={t.id} t={t} games={t.games} suspect={t.suspect} others={teamList.filter((o) => o.id !== t.id)} />)}
        </div>
      </details>
      </>}

      <h2>Competitions</h2>
      <p className="muted small">Rename, set the grade, hide player names (underage), or merge a duplicate into another competition.{!owner && org.ready ? ' A competition other organisations also use can only be changed by the site owner.' : ''}</p>
      <div className="admin-comps">
        {competitions.map((c) => (
          <CompetitionForm key={c.id} c={c} games={n[c.id] || 0} others={competitions.filter((o) => o.id !== c.id)} />
        ))}
      </div>
    </>
  );
}
