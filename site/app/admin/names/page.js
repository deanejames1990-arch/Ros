import { db, loadEvents } from '../../../lib/db';
import { analyseMatch } from '../../../lib/analysis';
import { nameEvents, isNumberTag } from '../../../lib/players';
import { getAliases, ALIAS_SQL } from '../../../lib/aliases';
import NameRows from './NameRows';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tidy names · James Deane Analysis' };

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z' ]/g, '').trim();
const surname = (s) => strip(s).split(' ').filter(Boolean).slice(-1)[0] || '';
// For spotting misspellings: no fadas, Mac = Mc, O' = O, letters only.
const key = (s) => strip(s).replace(/\bmac/g, 'mc').replace(/\bo'\s?/g, 'o').replace(/[^a-z]/g, '');
function edits(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
// Same player, spelt differently? Surnames within 1 letter (2 for long names),
// and first names / initials that don't clash.
function looksSame(a, b) {
  // Surname with its particle (O, Mac, Mc, Ni, Ui, de): "O Connor" = "OConnor".
  const fullSur = (n) => { const t = strip(n).split(' ').filter(Boolean); const k = t.length > 1 && /^(o|mac|mc|ni|ui|nic|de|di)$/.test(t[t.length - 2]) ? t.slice(-2).join('') : t[t.length - 1] || ''; return key(k); };
  const sa = fullSur(a), sb = fullSur(b);
  if (!sa || !sb || sa.length < 4) return false;
  if (sa[0] !== sb[0]) return false; // misspellings rarely change the first letter (Doyle / Boyle)
  const limit = Math.max(sa.length, sb.length) >= 8 ? 2 : 1;
  if (sa !== sb && edits(sa, sb) > limit) return false;
  const fa = strip(a).split(' ').slice(0, -1).join(' '), fb = strip(b).split(' ').slice(0, -1).join(' ');
  if (fa && fb && fa[0] !== fb[0]) return false; // different first names
  return key(a) !== key(b) || a !== b;
}

export default async function TidyNames({ searchParams }) {
  const { error: tableErr } = await db.from('name_aliases').select('id').limit(1);
  const missing = tableErr && /does not exist|could not find|schema cache/i.test(tableErr.message);
  const { data: teams } = await db.from('teams').select('id, name').order('name');
  const team = (teams || []).find((t) => t.name.toLowerCase() === String(searchParams.team || '').toLowerCase());

  let rows = [], squad = [], byNumber = [], dupes = [];
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
      const opp = m.team1_id === team.id ? m.team2.name : m.team1.name;
      const nums = [];
      for (const p of r.byTeam[team.id]?.players || []) {
        if (isNumberTag(p.name)) {
          nums.push({ no: p.name, tags: p.shots + p.poss + p.koWon + p.freesWon + p.winbacks + p.turnoversLost + p.tackles + p.assists, points: p.points });
          continue;
        }
        const k = p.name.toLowerCase();
        const o = seen.get(k) || { name: p.name, games: 0, points: 0, shots: 0, actions: 0, last: '' };
        o.games += 1; o.points += p.points; o.shots += p.shots;
        o.actions += p.shots + p.poss + p.koWon + p.freesWon + p.winbacks + p.turnoversLost + p.tackles + p.assists;
        if (m.match_date > o.last) o.last = m.match_date;
        seen.set(k, o);
      }
      if (nums.length) byNumber.push({ id: m.id, date: m.match_date, opp, nums: nums.sort((a, b) => b.tags - a.tags) });
    }));
    byNumber.sort((a, b) => b.date.localeCompare(a.date));
    // Likely the same player spelt two ways, among names not tidied yet.
    const untidied = [...seen.values()].filter((r) => !mine.some((a) => a.alias.toLowerCase() === r.name.toLowerCase()));
    const used = new Set();
    for (let i = 0; i < untidied.length; i += 1) {
      if (used.has(i)) continue;
      const group = [untidied[i]];
      for (let j = i + 1; j < untidied.length; j += 1) {
        if (!used.has(j) && looksSame(untidied[i].name, untidied[j].name)) { group.push(untidied[j]); used.add(j); }
      }
      if (group.length > 1) {
        // Keep the fullest name, then the most used.
        // A real first name beats an initial ("Cian McKeon" over "C. McKeon"), then the longer name, then the more used.
        const initial = (n) => /^[A-Za-z]\.?$/.test(n.trim().split(/\s+/)[0]) || n.trim().split(/\s+/).length < 2;
        const target = [...group].sort((a, b) => (initial(a.name) ? 1 : 0) - (initial(b.name) ? 1 : 0) || b.name.length - a.name.length || b.actions - a.actions)[0];
        dupes.push({ names: group.map((g) => ({ name: g.name, games: g.games, actions: g.actions })), target: target.name });
      }
    }
    const squadMap = new Map();
    for (const a of apps || []) if (a.players?.name) squadMap.set(a.players.name.toLowerCase(), a.players.name);
    squad = [...new Set([...squadMap.values(), ...mine.map((a) => a.name)])].sort();
    rows = [...seen.values()].map((r) => {
      const al = mine.find((a) => a.alias.toLowerCase() === r.name.toLowerCase());
      // Suggest a squad player, or another tag name, that's the same surname
      // or a near spelling of it (fuller names first).
      const others = [...squad, ...[...seen.values()].map((x) => x.name)].filter((n) => n.toLowerCase() !== r.name.toLowerCase());
      const sugg = others.filter((n) => looksSame(r.name, n) && (n.split(' ').length > r.name.split(' ').length || key(surname(n)) !== key(surname(r.name))))
        .sort((a, b) => b.split(' ').length - a.split(' ').length);
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
              ? <NameRows teamId={team.id} teamName={team.name} rows={rows} squad={squad} dupes={dupes} />
              : <p className="card muted">No names in {team.name}’s tags yet.</p>
          )}
          {team && byNumber.length > 0 && (
            <>
              <h2>Tagged by number</h2>
              <div className="card">
                <p className="small">
                  These are jersey numbers (P13, No 9…), so they mean a different player from game to game. Fill in the team sheet for each game and
                  every number in it gets that player’s name: in the dashboards, reports and their profile.
                </p>
                <div className="wrap">
                  <table className="alias-table">
                    <thead><tr><th>Game</th><th>Numbers with no name yet</th><th /></tr></thead>
                    <tbody>
                      {byNumber.map((g) => (
                        <tr key={g.id} className="todo">
                          <td><b>v {g.opp}</b><div className="muted small">{new Date(g.date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' })}</div></td>
                          <td>{g.nums.map((n) => <span key={n.no} className="num-chip">{n.no}<small> {n.tags} tag{n.tags === 1 ? '' : 's'}{n.points ? `, ${n.points} pts` : ''}</small></span>)}</td>
                          <td><a href={`/admin/game/${g.id}#sheets`}>Fill team sheet</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
