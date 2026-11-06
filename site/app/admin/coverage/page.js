import { db, MATCH_SELECT, loadEvents } from '../../../lib/db';
import { isShot, zoneOf } from '../../../lib/analysis';
import { isLiveCode } from '../../../lib/live';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data check · James Deane Analysis' };

const isFree = (e) => /\((F|45|Mark|Pen)/i.test(e.event_type || '');
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

// Per team in one game: how much of the data has a location / a name.
function coverage(events, teamId) {
  const mine = events.filter((e) => e.team_id === teamId && !(e.event_type === 'Poss' && e.labels?.Auto));
  const play = mine.filter((e) => isShot(e) && !isFree(e));
  const frees = mine.filter((e) => isShot(e) && isFree(e));
  const kos = mine.filter((e) => e.event_type === 'Kickout');
  const named = (e) => Boolean(e.labels?.Players || e.player_no);
  // A box, or a tapped spot on the pitch (live tagger), counts as located.
  const located = (e) => zoneOf(e) != null || e.labels?.ShotX != null;
  return {
    play: { n: play.length, box: play.filter(located).length },
    frees: { n: frees.length, box: frees.filter(located).length },
    ko: { n: kos.length, box: kos.filter((e) => zoneOf(e) != null).length },
    shooter: { n: play.length + frees.length, named: [...play, ...frees].filter(named).length },
  };
}

function Cell({ a, b, warnBelow = 80 }) {
  if (!b) return <td className="num muted">—</td>;
  const p = pct(a, b);
  return <td className={`num cov ${p >= warnBelow ? 'good' : p > 0 ? 'part' : 'none'}`}>{a}/{b}<small> {p}%</small></td>;
}

export default async function Coverage({ searchParams }) {
  const { data: all } = await db.from('matches').select(MATCH_SELECT).order('match_date', { ascending: false });
  const grades = [...new Set((all || []).map((m) => m.competitions?.grade).filter(Boolean))];
  const grade = grades.includes(searchParams?.grade) ? searchParams.grade : '';
  const games = (all || []).filter((m) => !grade || m.competitions?.grade === grade);
  const { data: apps } = await db.from('appearances').select('match_id, team_id');
  const sheet = new Set((apps || []).map((a) => `${a.match_id}:${a.team_id}`));
  const rows = await Promise.all(games.map(async (m) => {
    const ev = await loadEvents(m.id);
    return { m, n: ev.length, sides: [[m.team1_id, m.team1.name], [m.team2_id, m.team2.name]].map(([id, name]) => ({ id, name, ...coverage(ev, id), sheet: sheet.has(`${m.id}:${id}`) })) };
  }));
  const tagged = rows.filter((r) => r.n);
  // The gaps worth fixing: tagged games where a team's shots from play have no boxes.
  const gaps = tagged.flatMap((r) => r.sides.filter((s) => s.play.n >= 5 && pct(s.play.box, s.play.n) < 50).map((s) => ({ r, s })));
  const sum = (k, f) => tagged.reduce((t, r) => t + r.sides.reduce((u, s) => u + s[k][f], 0), 0);
  return (
    <>
      <p className="muted"><a href="/admin">Manage</a></p>
      <h1>Data check</h1>
      <p className="muted">How much of each game has a location or a name: shots from play with a box, frees with a box, kick-outs with a landing box, shots with a shooter named, and whether there’s a team sheet. Green is 80%+, amber part-done, red none.</p>
      {grades.length > 1 && (
        <nav className="seg">
          <a href="/admin/coverage" className={!grade ? 'on' : ''}>All</a>
          {grades.map((g) => <a key={g} href={`/admin/coverage?grade=${encodeURIComponent(g)}`} className={g === grade ? 'on' : ''}>{g}</a>)}
        </nav>
      )}
      <div className="stat-tiles cov-tiles">
        <div className="card"><b>{pct(sum('play', 'box'), sum('play', 'n')) ?? '—'}%</b><span>shots from play with a box</span><small>{sum('play', 'box')} of {sum('play', 'n')}</small></div>
        <div className="card"><b>{pct(sum('ko', 'box'), sum('ko', 'n')) ?? '—'}%</b><span>kick-outs with a landing box</span><small>{sum('ko', 'box')} of {sum('ko', 'n')}</small></div>
        <div className="card"><b>{pct(sum('shooter', 'named'), sum('shooter', 'n')) ?? '—'}%</b><span>shots with the shooter named</span><small>{sum('shooter', 'named')} of {sum('shooter', 'n')}</small></div>
        <div className="card"><b>{gaps.length}</b><span>team-games with shots but no boxes</span><small>listed below</small></div>
      </div>
      {gaps.length > 0 && (
        <div className="card">
          <h2>Missing shot locations</h2>
          <ul className="cov-gaps">
            {gaps.map(({ r, s }) => (
              <li key={`${r.m.id}:${s.id}`}><a href={`/match/${r.m.id}`}>{r.m.team1.name} v {r.m.team2.name}</a> <span className="muted small">{r.m.match_date} · {r.m.competitions?.name}</span> — <b>{s.name}</b>: {s.play.box} of {s.play.n} shots from play have a box</li>
            ))}
          </ul>
        </div>
      )}
      <div className="wrap">
        <table className="cov-table">
          <thead>
            <tr><th>Game</th><th>Team</th><th title="Shots from play with a box">Shot boxes</th><th title="Frees, 45s and marks with a box">Free boxes</th><th title="Kick-outs with a landing box">KO boxes</th><th title="Shots with the shooter named">Shooters</th><th>Sheet</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => r.sides.map((s, i) => (
              <tr key={`${r.m.id}:${s.id}`} className={i === 0 ? 'cov-first' : ''}>
                {i === 0 && (
                  <td rowSpan={2}>
                    <a href={`/match/${r.m.id}`}>{r.m.team1.name} v {r.m.team2.name}</a>
                    <div className="muted small">{r.m.match_date} · {r.m.competitions?.name}{isLiveCode(r.m.match_code) ? ' · live tagger' : ''}{!r.n ? ' · no tags' : ''}</div>
                  </td>
                )}
                <td>{s.name}</td>
                <Cell a={s.play.box} b={s.play.n} />
                <Cell a={s.frees.box} b={s.frees.n} />
                <Cell a={s.ko.box} b={s.ko.n} />
                <Cell a={s.shooter.named} b={s.shooter.n} />
                <td className={s.sheet ? 'cov good' : 'muted'}>{s.sheet ? '✓' : '—'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </>
  );
}
