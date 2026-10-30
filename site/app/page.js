import { db, MATCH_SELECT } from '../lib/db';
import { score } from './components';

export const dynamic = 'force-dynamic';

const US = /roscommon/i;
const total = (g, p) => 3 * (g ?? 0) + (p ?? 0);

// Result from Roscommon's side; null when Roscommon didn't play.
function fromOurSide(m) {
  const t1 = US.test(m.team1.name), t2 = US.test(m.team2.name);
  if (!t1 && !t2) return null;
  const us = t1 ? { g: m.team1_goals, p: m.team1_points } : { g: m.team2_goals, p: m.team2_points };
  const them = t1 ? { g: m.team2_goals, p: m.team2_points, name: m.team2.name } : { g: m.team1_goals, p: m.team1_points, name: m.team1.name };
  const diff = total(us.g, us.p) - total(them.g, them.p);
  return { us, them, diff, res: diff > 0 ? 'W' : diff < 0 ? 'L' : 'D', home: t1 };
}

export default async function Home({ searchParams }) {
  const grade = searchParams.grade || '';
  let matches = [];
  let problem = null;
  try {
    const { data, error } = await db.from('matches').select(MATCH_SELECT).order('match_date', { ascending: false }).limit(500);
    if (error) problem = error.message;
    matches = data || [];
  } catch (e) {
    problem = String(e.message || e);
  }

  const grades = [...new Set(matches.map((m) => m.competitions?.grade).filter(Boolean))];
  const years = [...new Set(matches.map((m) => m.competitions?.seasons?.year).filter(Boolean))].sort((a, b) => b - a);
  const year = Number(searchParams.year) || years[0] || null;
  const shown = matches.filter(
    (m) => (!grade || m.competitions?.grade === grade) && (!year || m.competitions?.seasons?.year === year)
  );

  // Season summary for Roscommon over the games shown.
  const ours = shown.map(fromOurSide).filter(Boolean);
  const sum = ours.reduce(
    (s, r) => ({
      P: s.P + 1,
      W: s.W + (r.res === 'W'),
      D: s.D + (r.res === 'D'),
      L: s.L + (r.res === 'L'),
      F: s.F + total(r.us.g, r.us.p),
      A: s.A + total(r.them.g, r.them.p),
    }),
    { P: 0, W: 0, D: 0, L: 0, F: 0, A: 0 }
  );

  // Group by competition, keeping the order of the most recent game in each.
  const groups = [];
  for (const m of shown) {
    const key = m.competition_id;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, name: m.competitions?.name || 'Other', grade: m.competitions?.grade, games: [] }));
    g.games.push(m);
  }

  const link = (o) => {
    const p = new URLSearchParams();
    const gr = o.grade ?? grade;
    const yr = o.year ?? year;
    if (gr) p.set('grade', gr);
    if (yr && yr !== years[0]) p.set('year', yr);
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };

  return (
    <>
      <div className="hero">
        <h1>Games</h1>
        <a className="btn" href="/admin/import">+ Add a game</a>
      </div>

      {problem && (
        <div className="card check warn">
          <b>Couldn’t load games.</b> <span className="muted">{problem}</span>
        </div>
      )}

      <nav className="toolbar">
        <div className="seg">
          <a href={link({ grade: '' })} className={!grade ? 'on' : ''}>All grades</a>
          {grades.map((g) => <a key={g} href={link({ grade: g })} className={grade === g ? 'on' : ''}>{g}</a>)}
        </div>
        {years.length > 0 && (
          <div className="seg">
            {years.map((y) => <a key={y} href={link({ year: y })} className={year === y ? 'on' : ''}>{y}</a>)}
          </div>
        )}
      </nav>

      {sum.P > 0 && (
        <div className="card season">
          <div><span className="muted small">Played</span><b>{sum.P}</b></div>
          <div><span className="muted small">Won</span><b>{sum.W}</b></div>
          <div><span className="muted small">Drawn</span><b>{sum.D}</b></div>
          <div><span className="muted small">Lost</span><b>{sum.L}</b></div>
          <div><span className="muted small">Avg pts for</span><b>{(sum.F / sum.P).toFixed(1)}</b></div>
          <div><span className="muted small">Avg pts against</span><b>{(sum.A / sum.P).toFixed(1)}</b></div>
        </div>
      )}

      {shown.length === 0 && !problem && <p className="muted">No games loaded for this selection yet.</p>}

      {groups.map((g) => (
        <section key={g.key}>
          <h2>{g.name}{g.grade && g.grade !== 'Senior' ? <span className="muted"> · {g.grade}</span> : ''}</h2>
          {g.games.map((m) => {
            const r = fromOurSide(m);
            return (
              <a key={m.id} className="card game" href={`/match/${m.id}`}>
                <span className={`badge ${r ? r.res : 'N'}`}>{r ? r.res : '–'}</span>
                <span className="game-main">
                  {r ? (
                    <>
                      <b>v {r.them.name}</b>
                      <span className="num">{score(r.us.g, r.us.p)} – {score(r.them.g, r.them.p)}</span>
                    </>
                  ) : (
                    <>
                      <b>{m.team1.name} v {m.team2.name}</b>
                      <span className="num">{score(m.team1_goals, m.team1_points)} – {score(m.team2_goals, m.team2_points)}</span>
                    </>
                  )}
                </span>
                <span className="muted small game-meta">
                  {m.stage ? `${m.stage} · ` : ''}
                  {new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}
                  {r && r.diff !== 0 ? ` · ${r.diff > 0 ? '+' : ''}${r.diff}` : ''}
                </span>
              </a>
            );
          })}
        </section>
      ))}
    </>
  );
}
