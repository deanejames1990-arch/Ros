import { db, loadEvents } from '../../../lib/db';
import { analyseMatch } from '../../../lib/analysis';
import { nameEvents } from '../../../lib/players';
import { getAliases, ALIAS_SQL } from '../../../lib/aliases';
import NameRows from './NameRows';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tidy names · James Deane Analysis' };

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z' ]/g, '').trim();
const surname = (s) => strip(s).split(' ').filter(Boolean).slice(-1)[0] || '';

export default async function TidyNames({ searchParams }) {
  const { error: tableErr } = await db.from('name_aliases').select('id').limit(1);
  const missing = tableErr && /does not exist|could not find|schema cache/i.test(tableErr.message);
  const { data: teams } = await db.from('teams').select('id, name').order('name');
  const team = (teams || []).find((t) => t.name.toLowerCase() === String(searchParams.team || '').toLowerCase());

  let rows = [], squad = [];
  if (team && !missing) {
    const [{ data: games }, { data: apps }, aliases] = await Promise.all([
      db.from('matches').select('id, match_date, team1_id, team2_id, team1:teams!team1_id(name), team2:teams!team2_id(name)')
        .or(`team1_id.eq.${team.id},team2_id.eq.${team.id}`),
      db.from('appearances').select('match_id, team_id, jersey_no, players(id, name)').eq('team_id', team.id).limit(5000),
      getAliases(),
    ]);
    const mine = aliases.filter((a) => a.team_id === team.id);
    // Every name in this team's tags, as tagged (before tidying), with how much it's used.
    const seen = new Map();
    await Promise.all((games || []).map(async (m) => {
      const ts = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
      const raw = await loadEvents(m.id);
      if (!raw.length) return;
      const r = analyseMatch({ events: nameEvents(raw, (apps || []).filter((a) => a.match_id === m.id), ts), teams: ts });
      for (const p of r.byTeam[team.id]?.players || []) {
        if (/^#?\d+$/.test(p.name)) continue;
        const k = p.name.toLowerCase();
        const o = seen.get(k) || { name: p.name, games: 0, points: 0, shots: 0, actions: 0, last: '' };
        o.games += 1; o.points += p.points; o.shots += p.shots;
        o.actions += p.shots + p.poss + p.koWon + p.freesWon + p.winbacks + p.turnoversLost + p.tackles + p.assists;
        if (m.match_date > o.last) o.last = m.match_date;
        seen.set(k, o);
      }
    }));
    const squadMap = new Map();
    for (const a of apps || []) if (a.players?.name) squadMap.set(a.players.name.toLowerCase(), a.players.name);
    squad = [...new Set([...squadMap.values(), ...mine.map((a) => a.name)])].sort();
    rows = [...seen.values()].map((r) => {
      const al = mine.find((a) => a.alias.toLowerCase() === r.name.toLowerCase());
      // Suggest a squad player, or a longer tag name, with the same surname.
      const sur = surname(r.name);
      const sugg = [...squad, ...[...seen.values()].map((x) => x.name)]
        .filter((n) => n.toLowerCase() !== r.name.toLowerCase() && surname(n) === sur && n.split(' ').length > r.name.split(' ').length);
      return { ...r, alias: al?.name || '', suggest: [...new Set(sugg)].slice(0, 3) };
    }).map((r) => ({ ...r, short: r.name.trim().split(/\s+/).length < 2 || /^[A-Z]\.?\s/.test(r.name) }))
      // Surname-only or initial names first (those are the ones to tidy), then by use.
      .sort((a, b) => (a.alias ? 1 : 0) - (b.alias ? 1 : 0) || (b.short ? 1 : 0) - (a.short ? 1 : 0) || b.actions - a.actions || a.name.localeCompare(b.name));
  }

  return (
    <>
      <p className="muted"><a href="/admin">Manage</a></p>
      <h1>Tidy names</h1>
      <p className="muted">
        Tags often carry a surname or a nickname (“Lundy”, “D Murtagh”). Give each one the player’s full name once and it’s used in every game for that team,
        including files you load later. Two spellings given the same full name become one player.
      </p>
      {missing ? (
        <div className="card">
          <h2>One-off setup</h2>
          <p>In Supabase, open <b>SQL Editor → New query</b>, paste this in and press <b>Run</b>. Then reload this page.</p>
          <pre className="sql">{ALIAS_SQL}</pre>
        </div>
      ) : (
        <>
          <form method="get" className="search">
            <select name="team" defaultValue={team?.name || ''}>
              <option value="">Pick a team…</option>
              {(teams || []).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <button type="submit">Show names</button>
          </form>
          {team && (
            rows.length
              ? <NameRows teamId={team.id} teamName={team.name} rows={rows} squad={squad} />
              : <p className="card muted">No names in {team.name}’s tags yet.</p>
          )}
        </>
      )}
    </>
  );
}
