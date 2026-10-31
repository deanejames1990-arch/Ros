import { notFound } from 'next/navigation';
import { db, MATCH_SELECT, loadEvents } from '../../../lib/db';
import { analyseMatch, combineSides, withoutNames, compType } from '../../../lib/analysis';
import { CompareTypes } from '../../report/sections';
import { score } from '../../components';
import { KickoutSection, ShootingSection, PeriodSection, TurnoverSection, PlayerTable } from '../../report/sections';
import { PrintButton, SectionImages } from '../../report/Export';

export const dynamic = 'force-dynamic';

const TEAM = '#3b4f9e'; // the team the report is about (crest blue)
const OPP = '#c4572a'; // everyone they played

export default async function TeamReport({ params, searchParams }) {
  const name = decodeURIComponent(params.name);
  const { data: teams } = await db.from('teams').select('id,name').ilike('name', name);
  if (!teams?.length) notFound();
  const ids = teams.map((t) => t.id);
  const teamName = teams[0].name;

  const { data: all } = await db.from('matches').select(MATCH_SELECT)
    .or(`team1_id.in.(${ids.join(',')}),team2_id.in.(${ids.join(',')})`)
    .order('match_date', { ascending: false });
  // Grades this team has games in, senior first. Senior and underage numbers
  // shouldn't be mixed, so open on Senior (or the only grade) unless asked.
  const ORDER = ['Senior', 'Junior', 'U21', 'U20', 'Minor', 'U17', 'Club'];
  const grades = [...new Set((all || []).map((m) => m.competitions?.grade).filter(Boolean))]
    .sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
  const grade = searchParams.grade === 'all' ? '' : searchParams.grade || grades[0] || '';
  const years = [...new Set((all || []).filter((m) => !grade || m.competitions?.grade === grade)
    .map((m) => m.competitions?.seasons?.year).filter(Boolean))].sort((x, y) => y - x);
  // Open on the latest season; ?year=all combines every season.
  const year = searchParams.year === 'all' ? null : Number(searchParams.year) || years[0] || null;
  const inSeason = (all || []).filter(
    (m) => (!grade || m.competitions?.grade === grade) && (!year || m.competitions?.seasons?.year === year)
  );
  // League / Championship (from the competition name); both when not chosen.
  const types = [...new Set(inSeason.map((m) => compType(m.competitions?.name)))].sort();
  const comp = ['League', 'Championship'].find((x) => x.toLowerCase() === String(searchParams.comp || '').toLowerCase()) || '';

  // Analyse every tagged game and keep this team's side and the opposition's side.
  const analysed = await Promise.all(inSeason.map(async (m) => {
    const raw = await loadEvents(m.id);
    const events = m.competitions?.show_player_names === false ? withoutNames(raw) : raw;
    if (!events.length) return { m, tagged: false };
    const t = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const r = analyseMatch({ events, teams: t });
    const mineId = ids.includes(m.team1_id) ? m.team1_id : m.team2_id;
    const oppId = mineId === m.team1_id ? m.team2_id : m.team1_id;
    return { m, tagged: true, mine: r.byTeam[mineId], opp: r.byTeam[oppId], oppName: t.find((x) => x.id === oppId).name };
  }));
  // Games left out of the numbers (?x=12,15), e.g. a freak win or loss.
  const excluded = new Set(String(searchParams.x || '').split(',').map(Number).filter(Boolean));
  const listed = analysed.filter((d) => !comp || compType(d.m.competitions?.name) === comp);
  const done = listed.filter((d) => !excluded.has(d.m.id));
  const nExcluded = listed.length - done.length;
  const games = done.map((d) => d.m);
  const tagged = done.filter((d) => d.tagged);
  const a = combineSides(tagged.map((d) => d.mine));
  const b = combineSides(tagged.map((d) => d.opp));
  const A = { name: teamName, color: TEAM };
  const B = { name: tagged.length === 1 ? tagged[0].oppName : 'Opposition', color: OPP };

  const result = (m) => {
    const us = ids.includes(m.team1_id);
    const f = us ? 3 * m.team1_goals + m.team1_points : 3 * m.team2_goals + m.team2_points;
    const g = us ? 3 * m.team2_goals + m.team2_points : 3 * m.team1_goals + m.team1_points;
    return {
      res: f > g ? 'W' : f < g ? 'L' : 'D',
      opp: us ? m.team2.name : m.team1.name,
      line: us ? `${score(m.team1_goals, m.team1_points)} – ${score(m.team2_goals, m.team2_points)}` : `${score(m.team2_goals, m.team2_points)} – ${score(m.team1_goals, m.team1_points)}`,
    };
  };
  const link = (o) => {
    const p = new URLSearchParams();
    const gr = o.grade ?? (grade || 'all');
    // Changing grade goes back to that grade's latest season.
    const yr = o.year ?? (o.grade !== undefined ? null : year || 'all');
    const cp = o.comp ?? comp;
    const xs = o.x ?? [...excluded];
    if (gr && gr !== grades[0]) p.set('grade', gr);
    if (yr) p.set('year', yr);
    if (cp) p.set('comp', cp.toLowerCase());
    if (xs.length) p.set('x', [...xs].sort((a, b) => a - b).join(','));
    const s = p.toString();
    return `/team/${encodeURIComponent(teamName)}${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <p className="muted"><a href="/">All games</a></p>
      <div className="hero" data-export-title={`${teamName}${grade ? ` ${grade}` : ''}${year ? ` ${year}` : ' all seasons'}${comp ? ` ${comp}` : ''}${nExcluded ? ` (${nExcluded} excluded)` : ''} · ${tagged.length} game${tagged.length === 1 ? '' : 's'}`}>
        <h1>{teamName}{grade && grade !== 'Senior' ? <span className="muted"> · {grade}</span> : ''}{year ? <span className="muted"> · {year}</span> : ''}{comp ? <span className="muted"> · {comp}</span> : ''}</h1>
        <PrintButton />
      </div>
      <SectionImages />
      <nav className="toolbar">
        {grades.length > 1 && (
          <div className="seg">
            {grades.map((g) => <a key={g} href={link({ grade: g })} className={grade === g ? 'on' : ''}>{g}</a>)}
            <a href={link({ grade: 'all' })} className={!grade ? 'on' : ''}>All grades</a>
          </div>
        )}
        {years.length > 1 && (
          <div className="seg">
            {years.map((y) => <a key={y} href={link({ year: y })} className={year === y ? 'on' : ''}>{y}</a>)}
            <a href={link({ year: 'all' })} className={!year ? 'on' : ''}>All seasons</a>
          </div>
        )}
        {types.length > 1 && (
          <div className="seg">
            <a href={link({ comp: '' })} className={!comp ? 'on' : ''}>League &amp; Champ</a>
            <a href={link({ comp: 'League' })} className={comp === 'League' ? 'on' : ''}>League</a>
            <a href={link({ comp: 'Championship' })} className={comp === 'Championship' ? 'on' : ''}>Championship</a>
          </div>
        )}
      </nav>
      <p className="muted">
        {tagged.length} tagged game{tagged.length === 1 ? '' : 's'} combined
        {games.length > tagged.length && ` · ${games.length - tagged.length} more without tags`}
        {nExcluded > 0 && <> · <b>{nExcluded} excluded</b> (<a href={link({ x: [] })}>include all</a>)</>}
        . Numbers are totals across the games; rates are worked out from the totals. Use Exclude to leave a game out.
      </p>

      {!comp && types.length > 1 && (
        <CompareTypes
          name={teamName}
          rows={['League', 'Championship'].map((ty) => {
            const ds = analysed.filter((d) => compType(d.m.competitions?.name) === ty && !excluded.has(d.m.id));
            const tg = ds.filter((d) => d.tagged);
            const rs = ds.map((d) => result(d.m).res);
            const pts = ds.map((d) => {
              const us = ids.includes(d.m.team1_id);
              const f = us ? 3 * d.m.team1_goals + d.m.team1_points : 3 * d.m.team2_goals + d.m.team2_points;
              const g = us ? 3 * d.m.team2_goals + d.m.team2_points : 3 * d.m.team1_goals + d.m.team1_points;
              const gf = us ? d.m.team1_goals : d.m.team2_goals;
              const ga = us ? d.m.team2_goals : d.m.team1_goals;
              return [f, g, gf || 0, ga || 0];
            });
            return {
              type: ty, games: ds.length, taggedGames: tg.length,
              W: rs.filter((x) => x === 'W').length, D: rs.filter((x) => x === 'D').length, L: rs.filter((x) => x === 'L').length,
              ptsFor: pts.reduce((n, x) => n + x[0], 0), ptsAgainst: pts.reduce((n, x) => n + x[1], 0),
              goalsFor: pts.reduce((n, x) => n + x[2], 0), goalsAgainst: pts.reduce((n, x) => n + x[3], 0),
              us: combineSides(tg.map((d) => d.mine)), them: combineSides(tg.map((d) => d.opp)),
            };
          })}
          href={(ty) => link({ comp: ty })}
        />
      )}

      <div className="game-strip">
        {listed.map(({ m, tagged: t }) => {
          const r = result(m);
          const out = excluded.has(m.id);
          const toggled = out ? [...excluded].filter((id) => id !== m.id) : [...excluded, m.id];
          return (
            <div key={m.id} className={`game-row ${out ? 'excluded' : ''}`}>
            <a href={`/match/${m.id}`} className={`card game ${t ? '' : 'untagged'}`}>
              <span className={`badge ${r.res}`}>{r.res}</span>
              <span className="game-main"><b>v {r.opp}</b><span className="num">{r.line}</span></span>
              <span className="muted small game-meta">{!grade && m.competitions?.grade ? `${m.competitions.grade} · ` : ''}{!year && m.competitions?.seasons?.year ? `${m.competitions.seasons.year} · ` : ''}{!comp && types.length > 1 ? `${compType(m.competitions?.name)} · ` : ''}{m.stage ? `${m.stage} · ` : ''}{new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}{t ? '' : ' · no tags'}{out ? ' · excluded' : ''}</span>
            </a>
            <a className={`ex-btn no-export ${out ? 'on' : ''}`} href={link({ x: toggled })} title={out ? 'Put this game back into the numbers' : 'Leave this game out of the numbers'}>
              {out ? 'Include' : 'Exclude'}
            </a>
            </div>
          );
        })}
      </div>

      {tagged.length === 0 ? (
        <p className="card muted">No tagged games for {teamName} in this selection yet.</p>
      ) : (
        <>
          <KickoutSection A={A} B={B} a={a} b={b} />
          <ShootingSection A={A} B={B} a={a} b={b} />
          <PeriodSection A={A} B={B} a={a} b={b} />
          <TurnoverSection A={A} B={B} a={a} />
          <h2>{teamName} players</h2>
          <PlayerTable T={A} s={a} multi={tagged.length > 1} limit={20} />
        </>
      )}
    </>
  );
}
