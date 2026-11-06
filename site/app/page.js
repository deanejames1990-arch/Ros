import { db, MATCH_SELECT, loadEvents } from '../lib/db';
import { analyseMatch, combineSides, withoutNames, compType } from '../lib/analysis';
import { nameEvents, isNumberTag } from '../lib/players';
import { getAliases } from '../lib/aliases';
import { isLiveNow } from '../lib/live';
import { currentAccess, gradeOk } from '../lib/session';
import { winningTrends, koRanges } from '../lib/winning';
import { currentOrg, ourTeamRe, scoped, orgScope } from '../lib/org';
import { score } from './components';
import { playerHref } from './report/sections';
import TrendChart from './TrendChart';
import { targetFor, targetText, hitRates } from '../lib/targets';
import { pssSummary, quarterTrend } from '../lib/pss';
import { PssTable, QuarterTrend } from './report/sections';

export const dynamic = 'force-dynamic';

const ROS = '#3b4f9e';
const OPP = '#c4572a';
const ORDER = ['Senior', 'Junior', 'U21', 'U20', 'Minor', 'U17', 'Club'];
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

// Home: where to go, how the season is going, and how it's trending.
export default async function Home({ searchParams }) {
  const access = await currentAccess();
  const role = access?.role;
  const admin = role === 'admin';
  const org = await currentOrg();
  const US = ourTeamRe(org);
  const OUR = org.team_name;
  const ourHref = `/team/${encodeURIComponent(OUR)}`;
  const { data: all } = await (await orgScope())(db.from('matches').select(MATCH_SELECT)).order('match_date', { ascending: true });
  // Only the grades this person can see.
  const games = (all || []).filter((m) => gradeOk(access, m.competitions?.grade));
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
  const aliases = await getAliases();
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
    let events = nameEvents(raw, (apps || []).filter((x) => x.match_id === m.id), teams, aliases);
    if (m.competitions?.show_player_names === false && !admin) events = withoutNames(events);
    const r = analyseMatch({ events, teams });
    return { ...base, us: r.byTeam[usId], them: r.byTeam[oppId] };
  }));
  const tagged = rows.filter((r) => r.us);

  // Every other game this season (opposition scouting), for each team's numbers.
  const scouted = games.filter((m) => m.competitions?.grade === grade && m.competitions?.seasons?.year === year
    && !US.test(m.team1.name) && !US.test(m.team2.name));
  const scoutedGames = [];
  const scoutedSides = (await Promise.all(scouted.map(async (m) => {
    const raw = await loadEvents(m.id);
    if (!raw.length) return [];
    const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const r = analyseMatch({ events: withoutNames(raw), teams });
    scoutedGames.push({ a: r.byTeam[m.team1_id], b: r.byTeam[m.team2_id], pa: 3 * m.team1_goals + m.team1_points, pb: 3 * m.team2_goals + m.team2_points, ros: null });
    return teams.map((t, i) => ({ name: t.name, side: r.byTeam[t.id], opp: r.byTeam[teams[1 - i].id] }));
  }))).flat();
  const oppSides = {};
  for (const r of tagged) {
    const o = (oppSides[r.opp] ||= { v: 0, list: [], pairs: [] });
    o.list.push(r.them); o.pairs.push({ mine: r.them, opp: r.us }); o.v += 1;
  }
  for (const x of scoutedSides) {
    const o = (oppSides[x.name] ||= { v: 0, list: [], pairs: [] });
    o.list.push(x.side); o.pairs.push({ mine: x.side, opp: x.opp });
  }
  // What winning teams do, from every tagged game this season.
  const winGames = [...tagged.map((r) => ({ a: r.us, b: r.them, pa: r.f, pb: r.a, ros: 'a' })), ...scoutedGames];
  const win = winningTrends(winGames);
  const koR = koRanges(winGames);
  const usTrend = quarterTrend(tagged.map((r) => ({ mine: r.us, opp: r.them })));
  const oppRows = Object.entries(oppSides)
    .map(([name, o]) => ({ name, s: pssSummary(o.list), v: o.v, trend: quarterTrend(o.pairs) }))
    .filter((r) => r.s)
    .sort((a, b) => b.s.games - a.s.games || a.name.localeCompare(b.name));
  const usAll = combineSides(tagged.map((r) => r.us));
  const themAll = combineSides(tagged.map((r) => r.them));
  const rec = { W: rows.filter((r) => r.res === 'W').length, D: rows.filter((r) => r.res === 'D').length, L: rows.filter((r) => r.res === 'L').length };
  const chartGames = rows.map((r) => ({ id: r.m.id, short: r.short, opp: r.opp, date: r.date }));
  const tg = (fn) => rows.map((r) => (r.us ? fn(r) : null));
  const scorers = (usAll.players || []).filter((p) => p.points > 0 && !isNumberTag(p.name)).slice(0, 6);
  const homeLink = (o) => `/?${new URLSearchParams({ ...(o.grade ?? grade ? { grade: o.grade ?? grade } : {}), ...(o.year ?? year ? { year: String(o.year ?? year) } : {}) })}`;
  const recent = [...rows].reverse().slice(0, 5);
  const form = [...rows].slice(-5);

  const tiles = [
    { href: '/games', t: 'Games', d: `${games.length} games: ${OUR} and opposition, by season and competition` },
    { href: '/teams', t: 'Teams', d: 'Every county on the site: opposition reports and squads' },
    { href: '/briefing', t: 'Opposition briefings', d: 'Team lists, scorers, shooting, kick-outs and clips for the next opponent' },
    { href: `${ourHref}?${new URLSearchParams({ grade, ...(year ? { year: String(year) } : {}) })}`, t: `${OUR} report`, d: `${grade} ${year || ''}: kick-outs, shooting, turnovers, players` },
    ...(admin || role === 'tagger' ? [
      { href: '/admin/live', t: 'Live tagger', d: 'Tag a game as it happens, with quarter and half-time numbers', admin: true },
    ] : []),
    ...(admin ? [
      { href: '/admin/import', t: 'Add game', d: 'Load a Nacsport or Sportscode file', admin: true },
      { href: '/admin', t: 'Manage', d: 'Edit games, team sheets and competitions', admin: true },
    ] : []),
  ];

  // A welcome for whoever is signed in, with the one thing most worth opening.
  const hour = Number(new Intl.DateTimeFormat('en-IE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Dublin' }).format(new Date()));
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = String(access?.name || '').trim().split(/\s+/)[0] || '';
  const { data: briefs } = await (await orgScope())(db.from('briefings').select('id, title, updated_at, published')).eq('published', true).order('updated_at', { ascending: false }).limit(1);
  const brief = (briefs || [])[0];
  const freshBrief = brief && Date.now() - new Date(brief.updated_at).getTime() < 14 * 864e5 ? brief : null;
  const last = [...rows].reverse()[0];

  return (
    <>
      <div className="home-welcome">
        <h2>{hello}{first ? `, ${first}` : ''}.</h2>
        <p>
          {live.length > 0 ? <>A game is being tagged now — <a href={`/match/${live[0].id}`}>follow it live</a>.</>
            : freshBrief ? <>Latest briefing: <a href={`/briefing/${freshBrief.id}`}>{freshBrief.title}</a>{' · '}<a href={`/briefing/${freshBrief.id}/card`}>infographic</a>.</>
            : last ? <>Last game: <a href={`/match/${last.m.id}`}>{last.res === 'W' ? 'won' : last.res === 'L' ? 'lost' : 'drew'} v {last.opp}, {last.line}</a> ({last.date}).</>
            : 'Welcome to James Deane Analysis.'}
          {role === 'tagger' && !live.length && <> Ready for match day? <a href="/admin/live">Open the live tagger</a>.</>}
        </p>
      </div>

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
        <h1>{OUR} {grade && grade !== 'Senior' ? grade : ''} {year || ''}</h1>
        <nav className="toolbar">
          {grades.length > 1 && <div className="seg">{grades.map((g) => <a key={g} href={homeLink({ grade: g, year: '' })} className={g === grade ? 'on' : ''}>{g}</a>)}</div>}
          {years.length > 1 && <div className="seg">{years.map((y) => <a key={y} href={homeLink({ year: y })} className={y === year ? 'on' : ''}>{y}</a>)}</div>}
        </nav>
      </div>

      {rows.length === 0 ? (
        <p className="card muted">No {OUR} games for this season yet.</p>
      ) : (
        <>
          <div className="home-stats">
            <div className="card stat"><span className="stat-k">Record</span><b className="num">{rec.W}-{rec.D}-{rec.L}</b><span className="muted small">won, drawn, lost in {rows.length} games</span></div>
            <div className="card stat"><span className="stat-k">Points a game</span><b className="num">{avg(rows.map((r) => r.f)).toFixed(1)} <small>v</small> {avg(rows.map((r) => r.a)).toFixed(1)}</b><span className="muted small">scored v conceded (goal = 3)</span></div>
            {tagged.length > 0 && <div className="card stat"><span className="stat-k">Shot conversion</span><b className="num">{usAll.conv ?? '–'}% <small>v</small> {themAll.conv ?? '–'}%</b><span className="muted small">us v opposition, {tagged.length} tagged game{tagged.length === 1 ? '' : 's'}</span></div>}
            {tagged.length > 0 && usAll.kickouts.retPct != null && <div className="card stat"><span className="stat-k">Own kick-outs won</span><b className="num">{usAll.kickouts.retPct ?? '–'}% <small>v</small> {themAll.kickouts.retPct ?? '–'}%</b><span className="muted small">ours v theirs</span></div>}
            {tagged.length > 0 && (usAll.turnoversWon + usAll.turnoversLost) > 0 && <div className="card stat"><span className="stat-k">Turnovers a game</span><b className="num">{(usAll.turnoversWon / tagged.length).toFixed(1)} <small>v</small> {(usAll.turnoversLost / tagged.length).toFixed(1)}</b><span className="muted small">won v lost, where tagged</span></div>}
            {(() => {
              const t = targetFor(grade);
              const qs = tagged.filter((r) => r.us.possessions > 0).flatMap((r) => r.us.pss);
              const h = hitRates(qs, t);
              return h ? (
                <a href={`${ourHref}?${new URLSearchParams({ grade, ...(year ? { year: String(year) } : {}) })}`} className="card stat stat-link">
                  <span className="stat-k">Quarters at {targetText(t)}</span>
                  <b className="num">{h.all} <small>of</small> {h.n}</b>
                  <span className="muted small">poss {h.poss} · shots {h.shots} · scores {h.scores} of {h.n} met</span>
                </a>
              ) : null;
            })()}
            <div className="card stat"><span className="stat-k">Form</span>
              <span className="form-row">{form.map((r) => <a key={r.m.id} href={`/match/${r.m.id}`} className={`badge ${r.res}`} title={`v ${r.opp} ${r.line} (${r.date})`}>{r.res}</a>)}</span>
              <span className="muted small">last {form.length}, oldest first</span>
            </div>
          </div>

          <h2>Possessions – shots – scores</h2>
          <QuarterTrend name={OUR} trend={usTrend} t={targetFor(grade)} color={ROS} />
          <PssTable t={targetFor(grade)}
            rows={[
              { name: OUR, strong: true, color: ROS, href: `${ourHref}?${new URLSearchParams({ grade, ...(year ? { year: String(year) } : {}) })}`, s: pssSummary(tagged.map((r) => r.us)), trend: usTrend },
              { name: `Opposition v ${OUR}`, color: OPP, s: pssSummary(tagged.map((r) => r.them)), trend: quarterTrend(tagged.map((r) => ({ mine: r.them, opp: r.us }))) },
              ...oppRows.map((r) => ({
                name: r.name, s: r.s, trend: r.trend, note: r.v ? `(${r.v} v Ros)` : '',
                href: `/team/${encodeURIComponent(r.name)}?${new URLSearchParams({ grade, ...(year ? { year: String(year) } : {}) })}`,
              })),
            ]}
            caption={`${grade} ${year || ''}: ${OUR}'s tagged games, then every opposition team from all their tagged games on the site this season (against ${OUR} and scouted). Possessions are as tagged, or worked out from the play where a file has none.${targetFor(grade) ? ` Average quarter marked against ${targetText(targetFor(grade))}.` : ''}`} />

          {win.rows.length > 0 && <WinningTrends win={win} grade={grade} year={year} our={OUR} />}
          {(koR.opp || koR.own) && <KickoutRanges r={koR} our={OUR} />}

          <h2>Trends, game by game</h2>
          <div className="trend-grid">
            <TrendChart title="Points scored v conceded" games={chartGames}
              series={[{ name: OUR, color: ROS, values: rows.map((r) => r.f) }, { name: 'Opposition', color: OPP, values: rows.map((r) => r.a) }]} />
            <TrendChart title="Shot conversion" unit="%" min={0} max={100} games={chartGames}
              series={[{ name: OUR, color: ROS, values: tg((r) => r.us.conv) }, { name: 'Opposition', color: OPP, values: tg((r) => r.them.conv) }]}
              note={tagged.length < rows.length ? 'Gaps are games without tags.' : null} />
            {usAll.kickouts.retPct != null && (
              <TrendChart title="Own kick-outs won" unit="%" min={0} max={100} games={chartGames}
                series={[{ name: OUR, color: ROS, values: tg((r) => r.us.kickouts.retPct) }, { name: 'Opposition', color: OPP, values: tg((r) => r.them.kickouts.retPct) }]} />
            )}
            {usAll.shots > 0 && (
              <TrendChart title="Shots a game" games={chartGames}
                series={[{ name: OUR, color: ROS, values: tg((r) => r.us.shots) }, { name: 'Opposition', color: OPP, values: tg((r) => r.them.shots) }]} />
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
                        const href = playerHref(OUR, p.name, null);
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

// What winning teams do: the stats where being ahead goes with winning.
function WinningTrends({ win, grade, year, our }) {
  const top = win.rows.filter((r) => !r.few && r.winPct >= 60).slice(0, 3);
  const fmt = (r, v) => (v == null ? '—' : r.side ? `${v}% of games` : `${v}${r.unit || ''}`);
  const better = (r) => {
    if (r.ros == null) return null;
    if (r.side) return r.ros >= 50;
    if (r.winners == null) return null;
    return r.low ? r.ros <= r.winners : r.ros >= r.winners;
  };
  return (
    <>
      <h2>What wins games</h2>
      <div className="card win-card">
        <p className="small muted">{grade} {year || ''}: the winner and loser compared in {win.games} tagged game{win.games === 1 ? '' : 's'} ({our}’s and scouted, draws left out).</p>
        {top.length > 0 && (
          <div className="win-calls">
            {top.map((r) => (
              <div key={r.key} className="win-call">
                <b>{r.winPct}%</b>
                <span>of the time, the team that <b>{r.short}</b> won the game <small className="muted">({r.games} games)</small></span>
              </div>
            ))}
          </div>
        )}
        <div className="wrap">
          <table className="win-table">
            <thead><tr><th>When a team…</th><th>…it won</th><th>Winners</th><th>Losers</th><th>{our}</th></tr></thead>
            <tbody>
              {win.rows.map((r) => {
                const ok = better(r);
                return (
                  <tr key={r.key} className={r.few ? 'win-few' : ''}>
                    <td>{r.short}</td>
                    <td className="num">{r.few
                      ? <small className="muted">{r.games ? `${r.winPct}% of ${r.games} — too few games yet` : 'level in every game so far'}</small>
                      : <><span className="win-bar"><i style={{ width: `${r.winPct}%` }} /></span> <b>{r.winPct}%</b> <small className="muted">of {r.games}</small></>}</td>
                    <td className="num">{r.side ? '—' : fmt(r, r.winners)}</td>
                    <td className="num">{r.side ? '—' : fmt(r, r.losers)}</td>
                    <td className={`num ${ok == null ? '' : ok ? 'win-ok' : 'win-no'}`}>{fmt(r, r.ros)}{ok == null ? '' : ok ? ' ✓' : ' ✗'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">“…it won” is how often the team ahead on that stat won (games level on it are left out). Winners / losers are the averages a game. {our}’s column is our average this season: ✓ at or better than the winners’ average, ✗ short of it. Small numbers of games swing these a lot.</p>
      </div>
    </>
  );
}

// Kick-out ranges that go with winning: the other team's kick-outs won, and our own kept.
function KickoutRanges({ r, our }) {
  const Part = ({ title, d, what }) => {
    if (!d) return null;
    const band = (b) => (b.hi > 100 ? `${b.lo}%+` : b.lo === 0 ? `under ${b.hi}%` : `${b.lo}–${b.hi - 1}%`);
    const rosBand = d.ros == null ? null : d.bands.find((b) => d.ros >= b.lo && d.ros < b.hi);
    return (
      <div className="ko-range">
        <h3>{title}</h3>
        {d.best && (
          <p className="ko-range-call"><b>{d.best.t}%+</b> {what}: won <b>{d.best.up.won} of {d.best.up.n}</b> ({d.best.up.pct}%). Under {d.best.t}%: won {d.best.down.won} of {d.best.down.n} ({d.best.down.pct}%).</p>
        )}
        <table className="ko-range-table">
          <thead><tr><th>{what}</th><th>Games won</th></tr></thead>
          <tbody>
            {d.bands.filter((b) => b.n).map((b) => (
              <tr key={b.lo} className={rosBand === b ? 'ros' : ''}>
                <td>{band(b)}{rosBand === b ? <small> · {our} avg</small> : ''}</td>
                <td className="num"><span className="win-bar"><i style={{ width: `${b.pct}%` }} /></span> {b.won} of {b.n} <small className="muted">({b.pct}%)</small></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Middle value: winners {d.winners}% · losers {d.losers}%{d.ros != null ? <> · <b>{our} {d.ros}%</b> ({d.rosGames} game{d.rosGames === 1 ? '' : 's'})</> : ''}</p>
      </div>
    );
  };
  return (
    <>
      <h2>Kick-outs: the % that wins games</h2>
      <div className="card ko-ranges">
        <Part title="The other team’s kick-outs" d={r.opp} what="of their kick-outs won" />
        <Part title="Our own kick-outs" d={r.own} what="of own kick-outs kept" />
        <p className="small muted ko-ranges-note">Each team in each decided tagged game counts once ({r.opp?.n || r.own?.n} performances). The headline split is the one that best separates wins from losses. Kick-outs are only one part of a result, and a handful of games moves these a lot.</p>
      </div>
    </>
  );
}
