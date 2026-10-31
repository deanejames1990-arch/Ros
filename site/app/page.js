import { db, MATCH_SELECT, loadEvents } from '../lib/db';
import { analyseMatch, combineSides, withoutNames, compType } from '../lib/analysis';
import { nameEvents } from '../lib/players';
import { isLiveNow } from '../lib/live';
import { currentRole } from '../lib/session';
import { score } from './components';
import { playerHref } from './report/sections';
import TrendChart from './TrendChart';

export const dynamic = 'force-dynamic';

const US = /roscommon/i;
const ROS = '#3b4f9e';
const OPP = '#c4572a';
const ORDER = ['Senior', 'Junior', 'U21', 'U20', 'Minor', 'U17', 'Club'];
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

// Home: where to go, how the season is going, and how it's trending.
export default async function Home({ searchParams }) {
  const role = await currentRole();
  const admin = role === 'admin';
  const { data: all } = await db.from('matches').select(MATCH_SELECT).order('match_date', { ascending: true });
  const games = all || [];
  const live = games.filter(isLiveNow);
  const ours = games.filter((m) => US.test(m.team1.name) || US.test(m.team2.name));

  const grades = [...new Set(ours.map((m) => m.competitions?.grade).filter(Boolean))]
    .sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
  const grade = grades.includes(searchParams.grade) ? searchParams.grade : grades[0] || '';
  const years = [...new Set(ours.filter((m) => m.competitions?.grade === grade).map((m) => m.competitions?.seasons?.year).filter(Boolean))].sort((a, b) => b - a);
  const year = years.includes(Number(searchParams.year)) ? Number(searchParams.year) : years[0] || null;
  const season = ours.filter((m) => m.competitions?.grade === grade && m.competitions?.seasons?.year === year);

  // Each game from Roscommon's side: result, and the tagged numbers where there are tags.
  const { data: apps } = season.length
    ? await db.from('appearances').select('match_id, team_id, jersey_no, players(id, name)').in('match_id', season.map((m) => m.id))
    : { data: [] };
  const rows = await Promise.all(season.map(async (m) => {
    const usFirst = US.test(m.team1.name);
    const usId = usFirst ? m.team1_id : m.team2_id;
    const oppId = usFirst ? m.team2_id : m.team1_id;
    const f = usFirst ? 3 * m.team1_goals + m.team1_points : 3 * m.team2_goals + m.team2_points;
    const a = usFirst ? 3 * m.team2_goals + m.team2_points : 3 * m.team1_goals + m.team1_points;
    const opp = usFirst ? m.team2.name : m.team1.name;
    const base = {
      m, usId, oppId, opp, f, a, res: f > a ? 'W' : f < a ? 'L' : 'D',
      line: usFirst ? `${score(m.team1_goals, m.team1_points)} – ${score(m.team2_goals, m.team2_points)}` : `${score(m.team2_goals, m.team2_points)} – ${score(m.team1_goals, m.team1_points)}`,
      short: opp.slice(0, 3).toUpperCase(),
      date: new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }),
    };
    const raw = await loadEvents(m.id);
    if (!raw.length) return base;
    const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    let events = nameEvents(raw, (apps || []).filter((x) => x.match_id === m.id), teams);
    if (m.competitions?.show_player_names === false && !admin) events = withoutNames(events);
    const r = analyseMatch({ events, teams });
    return { ...base, us: r.byTeam[usId], them: r.byTeam[oppId] };
  }));
  const tagged = rows.filter((r) => r.us);
  const usAll = combineSides(tagged.map((r) => r.us));
  const themAll = combineSides(tagged.map((r) => r.them));
  const rec = { W: rows.filter((r) => r.res === 'W').length, D: rows.filter((r) => r.res === 'D').length, L: rows.filter((r) => r.res === 'L').length };
  const chartGames = rows.map((r) => ({ id: r.m.id, short: r.short, opp: r.opp, date: r.date }));
  const tg = (fn) => rows.map((r) => (r.us ? fn(r) : null));
  const scorers = (usAll.players || []).filter((p) => p.points > 0 && !/^#?\d+$/.test(p.name)).slice(0, 6);
  const homeLink = (o) => `/?${new URLSearchParams({ ...(o.grade ?? grade ? { grade: o.grade ?? grade } : {}), ...(o.year ?? year ? { year: String(o.year ?? year) } : {}) })}`;
  const recent = [...rows].reverse().slice(0, 5);
  const form = [...rows].slice(-5);

  const tiles = [
    { href: '/games', t: 'Games', d: `${games.length} games: Roscommon and opposition, by season and competition` },
    { href: '/teams', t: 'Teams', d: 'Every county on the site: opposition reports and squads' },
    { href: `/team/Roscommon?${new URLSearchParams({ grade, ...(year ? { year: String(year) } : {}) })}`, t: 'Roscommon report', d: `${grade} ${year || ''}: kick-outs, shooting, turnovers, players` },
    ...(admin ? [
      { href: '/admin/live', t: 'Live tagger', d: 'Tag a game as it happens, with quarter and half-time numbers', admin: true },
      { href: '/admin/import', t: 'Add game', d: 'Load a Nacsport or Sportscode file', admin: true },
      { href: '/admin', t: 'Manage', d: 'Edit games, team sheets and competitions', admin: true },
    ] : []),
  ];

  return (
    <>
      {live.length > 0 && (
        <div className="home-live">
          {live.map((m) => (
            <a key={m.id} href={`/match/${m.id}`} className="card home-live-card">
              <span className="badge live">LIVE</span>
              <b>{m.team1.name} {score(m.team1_goals, m.team1_points)} – {score(m.team2_goals, m.team2_points)} {m.team2.name}</b>
              <span className="muted small">Being tagged now · open for live numbers and trends</span>
            </a>
          ))}
        </div>
      )}

      <nav className="home-tiles">
        {tiles.map((x) => (
          <a key={x.t} href={x.href} className={`card home-tile ${x.admin ? 'admin' : ''}`}>
            <b>{x.t}</b><span className="muted small">{x.d}</span>
          </a>
        ))}
      </nav>

      <div className="hero home-hero">
        <h1>Roscommon {grade && grade !== 'Senior' ? grade : ''} {year || ''}</h1>
        <nav className="toolbar">
          {grades.length > 1 && <div className="seg">{grades.map((g) => <a key={g} href={homeLink({ grade: g, year: '' })} className={g === grade ? 'on' : ''}>{g}</a>)}</div>}
          {years.length > 1 && <div className="seg">{years.map((y) => <a key={y} href={homeLink({ year: y })} className={y === year ? 'on' : ''}>{y}</a>)}</div>}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="card muted">No Roscommon games for this season yet.</p>
      ) : (
        <>
          <div className="home-stats">
            <div className="card stat"><span className="stat-k">Record</span><b className="num">{rec.W}-{rec.D}-{rec.L}</b><span className="muted small">won, drawn, lost in {rows.length} games</span></div>
            <div className="card stat"><span className="stat-k">Points a game</span><b className="num">{avg(rows.map((r) => r.f)).toFixed(1)} <small>v</small> {avg(rows.map((r) => r.a)).toFixed(1)}</b><span className="muted small">scored v conceded (goal = 3)</span></div>
            {tagged.length > 0 && <div className="card stat"><span className="stat-k">Shot conversion</span><b className="num">{usAll.conv ?? '–'}% <small>v</small> {themAll.conv ?? '–'}%</b><span className="muted small">us v opposition, {tagged.length} tagged game{tagged.length === 1 ? '' : 's'}</span></div>}
            {tagged.length > 0 && usAll.kickouts.retPct != null && <div className="card stat"><span className="stat-k">Own kick-outs won</span><b className="num">{usAll.kickouts.retPct ?? '–'}% <small>v</small> {themAll.kickouts.retPct ?? '–'}%</b><span className="muted small">ours v theirs</span></div>}
            {tagged.length > 0 && (usAll.turnoversWon + usAll.turnoversLost) > 0 && <div className="card stat"><span className="stat-k">Turnovers a game</span><b className="num">{(usAll.turnoversWon / tagged.length).toFixed(1)} <small>v</small> {(usAll.turnoversLost / tagged.length).toFixed(1)}</b><span className="muted small">won v lost, where tagged</span></div>}
            <div className="card stat"><span className="stat-k">Form</span>
              <span className="form-row">{form.map((r) => <a key={r.m.id} href={`/match/${r.m.id}`} className={`badge ${r.res}`} title={`v ${r.opp} ${r.line} (${r.date})`}>{r.res}</a>)}</span>
              <span className="muted small">last {form.length}, oldest first</span>
            </div>
          </div>

          <h2>Trends, game by game</h2>
          <div className="trend-grid">
            <TrendChart title="Points scored v conceded" games={chartGames}
              series={[{ name: 'Roscommon', color: ROS, values: rows.map((r) => r.f) }, { name: 'Opposition', color: OPP, values: rows.map((r) => r.a) }]} />
            <TrendChart title="Shot conversion" unit="%" min={0} max={100} games={chartGames}
              series={[{ name: 'Roscommon', color: ROS, values: tg((r) => r.us.conv) }, { name: 'Opposition', color: OPP, values: tg((r) => r.them.conv) }]}
              note={tagged.length < rows.length ? 'Gaps are games without tags.' : null} />
            {usAll.kickouts.retPct != null && (
              <TrendChart title="Own kick-outs won" unit="%" min={0} max={100} games={chartGames}
                series={[{ name: 'Roscommon', color: ROS, values: tg((r) => r.us.kickouts.retPct) }, { name: 'Opposition', color: OPP, values: tg((r) => r.them.kickouts.retPct) }]} />
            )}
            {usAll.shots > 0 && (
              <TrendChart title="Shots a game" games={chartGames}
                series={[{ name: 'Roscommon', color: ROS, values: tg((r) => r.us.shots) }, { name: 'Opposition', color: OPP, values: tg((r) => r.them.shots) }]} />
            )}
          </div>

          <div className="home-two">
            <div>
              <h2>Top scorers</h2>
              {scorers.length ? (
                <div className="card">
                  <table className="nums home-scorers">
                    <thead><tr><th>Player</th><th>Games</th><th>Score</th><th>Shots</th></tr></thead>
                    <tbody>
                      {scorers.map((p) => {
                        const href = playerHref('Roscommon', p.name, null);
                        return (
                          <tr key={p.name}>
                            <td>{href ? <a href={href}>{p.name}</a> : p.name}</td>
                            <td>{p.games}</td>
                            <td><b>{p.goals}-{p.points - 3 * p.goals}</b></td>
                            <td>{p.scores}/{p.shots}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="muted small">From the tags, {tagged.length} game{tagged.length === 1 ? '' : 's'}.</p>
                </div>
              ) : <p className="card muted small">{grade !== 'Senior' && !admin ? 'Names are hidden for this grade.' : 'No scorers named in the tags yet.'}</p>}
            </div>
            <div>
              <h2>Recent games</h2>
              <div className="game-strip">
                {recent.map((r) => (
                  <a key={r.m.id} href={`/match/${r.m.id}`} className={`card game ${r.us ? '' : 'untagged'}`}>
                    <span className={`badge ${r.res}`}>{r.res}</span>
                    <span className="game-main"><b>v {r.opp}</b><span className="num">{r.line}</span></span>
                    <span className="muted small game-meta">{compType(r.m.competitions?.name)} · {r.date}{r.us ? '' : ' · no tags'}</span>
                  </a>
                ))}
              </div>
              <p className="small"><a href={`/games?${new URLSearchParams({ grade, ...(year ? { year: String(year) } : {}) })}`}>All {grade} {year} games →</a></p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
