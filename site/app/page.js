import { db, MATCH_SELECT } from '../lib/db';
import { compType } from '../lib/analysis';
import { score } from './components';
import { isLiveNow } from '../lib/live';

export const dynamic = 'force-dynamic';

const US = /roscommon/i;
const total = (g, p) => 3 * (g ?? 0) + (p ?? 0);

// Result from one team's side (Roscommon unless another is chosen); null if they didn't play.
function fromOurSide(m, side = US) {
  const t1 = side.test(m.team1.name), t2 = side.test(m.team2.name);
  if (!t1 && !t2) return null;
  const us = t1 ? { g: m.team1_goals, p: m.team1_points } : { g: m.team2_goals, p: m.team2_points };
  const them = t1 ? { g: m.team2_goals, p: m.team2_points, name: m.team2.name } : { g: m.team1_goals, p: m.team1_points, name: m.team1.name };
  const diff = total(us.g, us.p) - total(them.g, them.p);
  return { us, them, diff, res: diff > 0 ? 'W' : diff < 0 ? 'L' : 'D', home: t1 };
}

export default async function Home({ searchParams }) {
  const grade = searchParams.grade || '';
  const who = ['opp', 'all'].includes(searchParams.who) ? searchParams.who : 'ros';
  const team = who === 'opp' ? (searchParams.team || '') : '';
  const comp = ['League', 'Championship'].find((x) => x.toLowerCase() === String(searchParams.comp || '').toLowerCase()) || '';
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
  const isRos = (m) => US.test(m.team1.name) || US.test(m.team2.name);
  const inScope = matches.filter(
    (m) => (!grade || m.competitions?.grade === grade) && (!year || m.competitions?.seasons?.year === year)
      && (!comp || compType(m.competitions?.name) === comp)
  );
  // Opposition teams: every team other than Roscommon in the games loaded.
  const oppTeams = [...new Set(inScope.flatMap((m) => [m.team1.name, m.team2.name]))].filter((n) => !US.test(n)).sort();
  const exact = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const teamRe = team ? exact(team) : null;
  const shown = inScope.filter((m) =>
    who === 'all' ? true
      : who === 'ros' ? isRos(m)
      : teamRe ? teamRe.test(m.team1.name) || teamRe.test(m.team2.name) // all their games, incl. v Roscommon
      : !isRos(m)
  );

  // Season summary from Roscommon's side, or from the chosen opposition team's side.
  const side = who === 'opp' ? teamRe : US;
  const ours = side ? shown.map((m) => fromOurSide(m, side)).filter(Boolean) : [];
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
    const w = o.who ?? who;
    const tm = o.team ?? (w === 'opp' ? team : '');
    const cp = o.comp ?? comp;
    if (cp) p.set('comp', cp.toLowerCase());
    if (w !== 'ros') p.set('who', w);
    if (tm) p.set('team', tm);
    if (gr) p.set('grade', gr);
    if (yr && yr !== years[0]) p.set('year', yr);
    const s = p.toString();
    return s ? `/?${s}` : '/';
  };

  return (
    <>
      <h1>Games</h1>

      {problem && (
        <div className="card check warn">
          <b>Couldn’t load games.</b> <span className="muted">{problem}</span>
        </div>
      )}

      <nav className="toolbar">
        <div className="seg">
          <a href={link({ who: 'ros', team: '' })} className={who === 'ros' ? 'on' : ''}>Roscommon</a>
          <a href={link({ who: 'opp', team: '' })} className={who === 'opp' ? 'on' : ''}>Opposition</a>
          <a href={link({ who: 'all', team: '' })} className={who === 'all' ? 'on' : ''}>All</a>
        </div>
        <div className="seg">
          <a href={link({ grade: '' })} className={!grade ? 'on' : ''}>All grades</a>
          {grades.map((g) => <a key={g} href={link({ grade: g })} className={grade === g ? 'on' : ''}>{g}</a>)}
        </div>
        <div className="seg">
          <a href={link({ comp: '' })} className={!comp ? 'on' : ''}>League &amp; Champ</a>
          <a href={link({ comp: 'League' })} className={comp === 'League' ? 'on' : ''}>League</a>
          <a href={link({ comp: 'Championship' })} className={comp === 'Championship' ? 'on' : ''}>Championship</a>
        </div>
        {years.length > 0 && (
          <div className="seg">
            {years.map((y) => <a key={y} href={link({ year: y })} className={year === y ? 'on' : ''}>{y}</a>)}
          </div>
        )}
      </nav>

      {who === 'opp' && oppTeams.length > 0 && (
        <div className="chips team-chips">
          <a href={link({ team: '' })} className={`chip ${!team ? 'on' : ''}`}>All opposition</a>
          {oppTeams.map((t) => (
            <a key={t} href={link({ team: t })} className={`chip ${team.toLowerCase() === t.toLowerCase() ? 'on' : ''}`}>{t}</a>
          ))}
        </div>
      )}

      {(who === 'ros' || team) && (
        <p className="report-link">
          <a href={`/team/${encodeURIComponent(who === 'ros' ? 'Roscommon' : team)}?${new URLSearchParams({ ...(year ? { year } : {}), ...(grade ? { grade } : {}), ...(comp ? { comp: comp.toLowerCase() } : {}) })}`}>
            Open the {who === 'ros' ? 'Roscommon' : team} report: kick-outs, shooting, quarters, turnovers, players →
          </a>
        </p>
      )}

      {sum.P > 0 && (
        <div className="card season">
          <div className="season-label muted small">{who === 'opp' ? team : 'Roscommon'}</div>
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
            const r = side ? fromOurSide(m, side) : null;
            const live = isLiveNow(m);
            return (
              <a key={m.id} className="card game" href={`/match/${m.id}`}>
                {live ? <span className="badge live">LIVE</span> : <span className={`badge ${r ? r.res : 'N'}`}>{r ? r.res : '–'}</span>}
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
