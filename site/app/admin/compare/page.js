import { Fragment } from 'react';
import { db, MATCH_SELECT, loadEvents } from '../../../lib/db';
import { analyseMatch, withoutNames } from '../../../lib/analysis';
import { orgScope } from '../../../lib/org';
import { compareGrades, minutesPlayed } from '../../../lib/grade-compare';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Grades compared · James Deane Analysis' };

const ORDER = ['Senior', 'Junior', 'U21', 'U20', 'Minor', 'U17', 'Club'];
const fmt = (c, unit) => (c == null ? '—' : `${c.v}${unit || ''}`);

// Every tagged game (ours and scouted) in two grades, side by side: what's
// different about the game at each level.
export default async function Compare({ searchParams }) {
  const { data: all } = await (await orgScope())(db.from('matches').select(MATCH_SELECT)).order('match_date', { ascending: false });
  const grades = [...new Set((all || []).map((m) => m.competitions?.grade).filter(Boolean))]
    .sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
  const years = [...new Set((all || []).map((m) => m.competitions?.seasons?.year).filter(Boolean))].sort((a, b) => b - a);
  const a = grades.includes(searchParams?.a) ? searchParams.a : grades.includes('U20') ? 'U20' : grades[1] || grades[0] || '';
  const b = grades.includes(searchParams?.b) ? searchParams.b : grades.includes('Senior') && a !== 'Senior' ? 'Senior' : grades.find((g) => g !== a) || '';
  const year = years.includes(Number(searchParams?.year)) ? Number(searchParams.year) : null;

  const groups = { [a]: [], [b]: [] };
  const used = { [a]: [], [b]: [] };
  const pick = (all || []).filter((m) => (m.competitions?.grade === a || m.competitions?.grade === b) && (!year || m.competitions?.seasons?.year === year));
  await Promise.all(pick.map(async (m) => {
    const raw = await loadEvents(m.id);
    if (!raw.some((e) => /^Shot/.test(e.event_type || ''))) return;
    const teams = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const r = analyseMatch({ events: withoutNames(raw), teams });
    const mins = minutesPlayed(raw);
    const g = m.competitions.grade;
    for (const [s, o] of [[r.byTeam[m.team1_id], r.byTeam[m.team2_id]], [r.byTeam[m.team2_id], r.byTeam[m.team1_id]]]) {
      if (s && o) groups[g].push({ s, o, mins });
    }
    used[g].push({ id: m.id, name: `${m.team1.name} v ${m.team2.name}`, date: m.match_date, mins, calc: r.possCalculated });
  }));
  const rows = a && b && a !== b ? compareGrades(groups) : [];
  const games = (g) => used[g].length;
  const byGroup = rows.reduce((acc, r) => { (acc[r.group] ||= []).push(r); return acc; }, {});

  return (
    <>
      <p className="muted"><a href="/admin">Manage</a></p>
      <h1>Grades compared</h1>
      <p className="muted">Every tagged game in each grade (ours and scouted), both teams, averaged. Counts are <b>per 10 minutes played</b>, so shorter underage games compare fairly; rates are %. <b>Bold</b> rows are a clear gap (a quarter or more apart, or 8 points of %).</p>
      <form className="card cmp-filters">
        <label>Grade<select name="a" defaultValue={a}>{grades.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label>against<select name="b" defaultValue={b}>{grades.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label>Season<select name="year" defaultValue={year || ''}><option value="">All</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
        <button type="submit">Show</button>
      </form>
      {a === b || !rows.length ? <p className="card">Pick two different grades.</p> : (
        <>
          <p className="small muted">{a}: {games(a)} tagged game{games(a) === 1 ? '' : 's'} · {b}: {games(b)} tagged game{games(b) === 1 ? '' : 's'}. {Math.min(games(a), games(b)) < 5 ? 'Few games: treat the gaps as pointers, not settled numbers.' : ''}</p>
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>Per team, a game</th><th className="num">{a}</th><th className="num">{b}</th><th className="num">Difference</th></tr></thead>
              <tbody>
                {Object.entries(byGroup).map(([grp, list]) => (
                  <Fragment key={grp}>
                    <tr className="group-row"><th colSpan={4}>{grp}</th></tr>
                    {list.map((r) => {
                      const x = r.cells[a]?.v, y = r.cells[b]?.v;
                      const d = x != null && y != null ? Math.round((x - y) * 10) / 10 : null;
                      return (
                        <tr key={r.label} className={r.gap ? 'gap-row' : ''}>
                          <td>{r.gap ? <b>{r.label}</b> : r.label}{r.per10 ? <small className="muted"> · per 10 min</small> : ''}</td>
                          <td className="num">{fmt(r.cells[a], r.unit)}</td>
                          <td className="num">{fmt(r.cells[b], r.unit)}</td>
                          <td className="num">{d == null ? '—' : `${d > 0 ? '+' : ''}${d}${r.unit || ''}`}</td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Possessions: tagged in the file where there are possession tags, otherwise worked out by the site, so possession numbers can be counted a little differently from grade to grade. Kick-out lengths depend on how they were tagged (some files only use short and long).</p>
          <details className="card small">
            <summary>Games used</summary>
            {[a, b].map((g) => (
              <div key={g}><b>{g}</b>
                <ul>{used[g].sort((x, y) => String(y.date).localeCompare(String(x.date))).map((m) => (
                  <li key={m.id}><a href={`/match/${m.id}`}>{m.name}</a> <span className="muted">{new Date(m.date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: '2-digit' })} · {Math.round(m.mins || 0)} min{m.calc ? ' · possessions worked out' : ''}</span></li>
                ))}</ul>
              </div>
            ))}
          </details>
        </>
      )}
    </>
  );
}
