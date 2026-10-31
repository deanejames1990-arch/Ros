import { notFound } from 'next/navigation';
import { db, loadEvents, hiddenPlayerIds } from '../../lib/db';
import { currentRole } from '../../lib/session';
import { analyseMatch, isShot } from '../../lib/analysis';
import { nameEvents } from '../../lib/players';
import { ShotMap, ShotLegend, hasShotMap } from '../report/ShotMap';
import { ZoneGrid } from '../report/sections';
import MergePlayer from './[id]/MergePlayer';


const FIELDS = ['shots', 'scores', 'points', 'goals', 'oneTried', 'oneScored', 'twoTried', 'twoScored', 'frees', 'freesScored', 'wides',
  'freesWon', 'winbacks', 'koWon', 'turnoversLost', 'tackles', 'assists', 'poss'];
const sc = (r) => `${r.goals}-${r.points - 3 * r.goals}`;
const of = (a, b) => (b ? `${a}/${b}` : '–');
const dash = (v) => v || '–';

const MATCH_COLS = 'id, match_date, stage, team1_id, team2_id, team1_goals, team1_points, team2_goals, team2_points, team1:teams!team1_id(name), team2:teams!team2_id(name), competitions(name, grade, show_player_names, seasons(year))';

// A player's profile: every game they're on a team sheet for, plus every game
// of their team(s) where their name is in the tags. `p` is a saved player
// ({ id, name }) or just a name from the tags ({ id: null, name }).
export default async function Profile({ p, teamIds: givenTeams = [] }) {
  const role = await currentRole();
  const admin = role === 'admin';
  const hidden = p.id ? (await hiddenPlayerIds([p.id])).size > 0 : false;
  if (hidden && !admin) notFound();

  const { data: apps } = p.id
    ? await db.from('appearances').select(`match_id, team_id, jersey_no, started, goals, points, matches(${MATCH_COLS})`).eq('player_id', p.id)
    : { data: [] };
  const sheetGames = (apps || []).filter((a) => a.matches);
  // Other games of the same team(s): the name may be in the tags without a sheet.
  const teamIds = [...new Set([...givenTeams, ...sheetGames.map((a) => a.team_id)])];
  const { data: teamGames } = teamIds.length
    ? await db.from('matches').select(MATCH_COLS).or(`team1_id.in.(${teamIds.join(',')}),team2_id.in.(${teamIds.join(',')})`)
    : { data: [] };
  const have = new Set(sheetGames.map((a) => a.match_id));
  const extra = (teamGames || []).filter((m) => !have.has(m.id)).map((m) => ({
    match_id: m.id, team_id: teamIds.includes(m.team1_id) ? m.team1_id : m.team2_id, jersey_no: null, started: null, goals: 0, points: 0, matches: m, fromTags: true,
  }));
  const list = [...sheetGames, ...extra]
    // Underage games: names are for admins only.
    .filter((a) => admin || a.matches.competitions?.show_player_names !== false)
    .sort((a, b) => b.matches.match_date.localeCompare(a.matches.match_date));

  // Each game: this player's row from the tags, named from that game's team sheets.
  const myShots = [];
  const games = await Promise.all(list.map(async (a) => {
    const m = a.matches;
    const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const [{ data: sheet }, raw] = await Promise.all([
      db.from('appearances').select('team_id, jersey_no, players(name)').eq('match_id', m.id),
      loadEvents(m.id),
    ]);
    const events = nameEvents(raw, sheet || [], teams);
    const r = analyseMatch({ events, teams });
    const row = r.byTeam[a.team_id]?.players.find((x) => x.name.toLowerCase() === p.name.toLowerCase()) || null;
    for (const e of events) {
      if (e.team_id === a.team_id && isShot(e) && String(e.labels?.Players || '').toLowerCase() === p.name.toLowerCase()) myShots.push({ ...e, team_id: 0 });
    }
    const us = m.team1_id === a.team_id;
    return {
      a, m, row, tagged: events.length > 0,
      team: us ? m.team1.name : m.team2.name, opp: us ? m.team2.name : m.team1.name,
      year: m.competitions?.seasons?.year, grade: m.competitions?.grade || '', comp: m.competitions?.name || '',
    };
  }));

  // Keep sheet games, and tag-only games where the name actually turns up.
  const shown = games.filter((g) => !g.a.fromTags || g.row);
  games.length = 0; games.push(...shown);
  if (!games.length && !p.id) notFound();

  // Season totals (by year and grade).
  const seasons = new Map();
  for (const g of games) {
    const k = `${g.year}|${g.grade}|${g.team}`;
    const s = seasons.get(k) || { year: g.year, grade: g.grade, team: g.team, games: 0, starts: 0, tagged: 0, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) };
    s.games += 1; if (g.a.started) s.starts += 1; if (g.a.fromTags) s.fromTags = (s.fromTags || 0) + 1;
    if (g.row) { s.tagged += 1; for (const f of FIELDS) s[f] += g.row[f] || 0; }
    else if (g.a.goals || g.a.points) { s.goals += g.a.goals || 0; s.points += 3 * (g.a.goals || 0) + (g.a.points || 0); }
    seasons.set(k, s);
  }
  const teamsPlayed = [...new Set(games.map((g) => g.team))];
  let candidates = [];
  if (admin && p.id) {
    const { data: mates } = teamIds.length ? await db.from('appearances').select('player_id, players(id, name)').in('team_id', teamIds).limit(5000) : { data: [] };
    const seen = new Map();
    for (const x of mates || []) if (x.players && x.players.id !== p.id) seen.set(x.players.id, x.players);
    candidates = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const total = [...seasons.values()].reduce((t, s) => { for (const f of [...FIELDS, 'games', 'starts']) t[f] = (t[f] || 0) + s[f]; return t; }, {});

  return (
    <>
      <p className="muted"><a href="/">All games</a>{teamsPlayed.map((t) => <span key={t}> · <a href={`/team/${encodeURIComponent(t)}`}>{t}</a></span>)}</p>
      <div className="hero">
        <h1>{p.name}</h1>
      </div>
      {(hidden || games.some((g) => g.m.competitions?.show_player_names === false)) && <p className="card check warn small">Includes underage games: those are only shown to admins.</p>}
      {!p.id && <p className="muted small">Built from the names in the tags{teamsPlayed.length ? ` for ${teamsPlayed.join(', ')}` : ''}. Add this player to a team sheet to record numbers and starts.</p>}
      <div className="player-strip">
        <div><b className="num">{total.games || 0}</b><span>{total.games === 1 ? 'game' : 'games'}</span></div>
        {sheetGames.length > 0 && <div><b className="num">{total.starts || 0}</b><span>starts</span></div>}
        <div><b className="num">{total.goals || 0}-{(total.points || 0) - 3 * (total.goals || 0)}</b><span>scored</span></div>
        <div><b className="num">{total.shots ? `${Math.round((100 * total.scores) / total.shots)}%` : '–'}</b><span>shot conversion</span></div>
        {total.games > 0 && total.points > 0 && <div><b className="num">{(total.points / total.games).toFixed(1)}</b><span>points a game</span></div>}
        {(total.twoTried || total.twoScored) > 0 && <div><b className="num">{total.twoTried ? `${total.twoScored}/${total.twoTried}` : total.twoScored}</b><span>2-pointers{total.twoTried ? ' (scored/tried)' : ''}</span></div>}
        {total.frees > 0 && <div><b className="num">{total.freesScored}/{total.frees}</b><span>frees, 45s, marks</span></div>}
        {total.shots > 0 && <div><b className="num">{total.wides || 0}</b><span>wides</span></div>}
        {/* Only where the tagging records them: blank otherwise rather than 0. */}
        {total.freesWon > 0 && <div><b className="num">{total.freesWon}</b><span>frees won</span></div>}
        {total.winbacks > 0 && <div><b className="num">{total.winbacks}</b><span>turnovers won</span></div>}
        {total.koWon > 0 && <div><b className="num">{total.koWon}</b><span>kick-outs won</span></div>}
      </div>

      <h2>Season by season</h2>
      <div className="wrap">
        <table className="player-table">
          <thead><tr><th>Season</th><th>Team</th><th>Games</th><th>Starts</th><th>Score</th><th>Shots</th><th>1-pt</th><th>2-pt</th><th>Frees</th><th>Wides</th><th>Frees won</th><th>T/O won</th><th>KOs won</th><th>T/O lost</th><th>Tackles</th><th>Assists</th></tr></thead>
          <tbody>
            {[...seasons.values()].map((s) => (
              <tr key={`${s.year}${s.grade}${s.team}`}>
                <td>{s.year} {s.grade !== 'Senior' ? s.grade : ''}</td><td>{s.team}</td><td>{s.games}</td><td>{s.fromTags === s.games ? '–' : s.starts}</td>
                <td><b>{sc(s)}</b></td><td>{of(s.scores, s.shots)}</td><td>{of(s.oneScored, s.oneTried)}</td><td>{s.twoTried ? of(s.twoScored, s.twoTried) : dash(s.twoScored)}</td>
                <td>{of(s.freesScored, s.frees)}</td><td>{dash(s.wides)}</td><td>{dash(s.freesWon)}</td><td>{dash(s.winbacks)}</td><td>{dash(s.koWon)}</td>
                <td>{dash(s.turnoversLost)}</td><td>{dash(s.tackles)}</td><td>{dash(s.assists)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(() => {
        // Shots by box, where the tagging records a box (no exact spot).
        const zones = {};
        for (const g of games) {
          for (const [z, n] of Object.entries(g.row?.boxes || {})) (zones[z] ||= { n: 0, won: 0 }).n += n;
          for (const [z, n] of Object.entries(g.row?.boxesScored || {})) (zones[z] ||= { n: 0, won: 0 }).won += n;
        }
        const tot = Object.values(zones).reduce((a, z) => a + z.n, 0);
        if (!tot) return null;
        const boxGames = games.filter((g) => Object.keys(g.row?.boxes || {}).length).length;
        return (
          <>
            <h2>Shots by box</h2>
            <div className="card">
              <div style={{ maxWidth: 380, margin: '0 auto' }}>
                <ZoneGrid name={p.name} zones={zones} color="#3b4f9e" kind="shot" />
              </div>
              <p className="muted small center">Attacking goal at the bottom. {tot} shots with a box tagged, from {boxGames} of {games.length} game{games.length === 1 ? '' : 's'}.</p>
            </div>
          </>
        );
      })()}

      {hasShotMap(myShots) && (
        <>
          <h2>Shot map</h2>
          <div className="card">
            <div className="shotmaps one"><ShotMap events={myShots} teamId={0} name={p.name} color="#3b4f9e" /></div>
            <ShotLegend />
          </div>
        </>
      )}

      <h2>Game by game</h2>
      <div className="wrap">
        <table className="player-table">
          <thead><tr><th>Date</th><th>Game</th><th>#</th><th /><th>Score</th><th>Shots</th><th>1-pt</th><th>2-pt</th><th>Frees</th><th>Frees won</th><th>T/O won</th><th>KOs won</th><th>T/O lost</th></tr></thead>
          <tbody>
            {games.map((g) => {
              const r = g.row;
              return (
                <tr key={g.m.id}>
                  <td className="nowrap">{new Date(g.m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td><a href={`/match/${g.m.id}`}>{g.team} v {g.opp}</a><div className="muted small">{g.comp}{g.m.stage ? ` · ${g.m.stage}` : ''}</div></td>
                  <td>{g.a.jersey_no || ''}</td>
                  <td>{g.a.fromTags ? <span className="muted small">tags</span> : g.a.started ? 'Start' : 'Sub'}</td>
                  {r ? (
                    <>
                      <td><b>{sc(r)}</b></td><td>{of(r.scores, r.shots)}</td><td>{of(r.oneScored, r.oneTried)}</td><td>{r.twoTried ? of(r.twoScored, r.twoTried) : dash(r.twoScored)}</td>
                      <td>{of(r.freesScored, r.frees)}</td><td>{dash(r.freesWon)}</td><td>{dash(r.winbacks)}</td><td>{dash(r.koWon)}</td><td>{dash(r.turnoversLost)}</td>
                    </>
                  ) : (
                    <td colSpan={9} className="muted small">{g.tagged ? 'Nothing tagged to this player' : `Not tagged${g.a.goals || g.a.points ? ` · scored ${g.a.goals}-${g.a.points}` : ''}`}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {games.length === 0 && <p className="muted">No games on a team sheet yet.</p>}

      {admin && p.id && <MergePlayer player={{ id: p.id, name: p.name }} candidates={candidates} />}
    </>
  );
}
