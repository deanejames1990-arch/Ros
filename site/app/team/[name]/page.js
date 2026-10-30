import { notFound } from 'next/navigation';
import { db, MATCH_SELECT, loadEvents } from '../../../lib/db';
import { analyseMatch, combineSides, withoutNames } from '../../../lib/analysis';
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
  const games = (all || []).filter(
    (m) => (!grade || m.competitions?.grade === grade) && (!year || m.competitions?.seasons?.year === year)
  );

  // Analyse every tagged game and keep this team's side and the opposition's side.
  const done = await Promise.all(games.map(async (m) => {
    const raw = await loadEvents(m.id);
    const events = m.competitions?.show_player_names === false ? withoutNames(raw) : raw;
    if (!events.length) return { m, tagged: false };
    const t = [{ id: m.team1_id, name: m.team1.name }, { id: m.team2_id, name: m.team2.name }];
    const r = analyseMatch({ events, teams: t });
    const mineId = ids.includes(m.team1_id) ? m.team1_id : m.team2_id;
    const oppId = mineId === m.team1_id ? m.team2_id : m.team1_id;
    return { m, tagged: true, mine: r.byTeam[mineId], opp: r.byTeam[oppId], oppName: t.find((x) => x.id === oppId).name };
  }));
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
    if (gr && gr !== grades[0]) p.set('grade', gr);
    if (yr) p.set('year', yr);
    const s = p.toString();
    return `/team/${encodeURIComponent(teamName)}${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <p className="muted"><a href="/">All games</a></p>
      <div className="hero" data-export-title={`${teamName}${grade ? ` ${grade}` : ''}${year ? ` ${year}` : ' all seasons'} · ${tagged.length} game${tagged.length === 1 ? '' : 's'}`}>
        <h1>{teamName}{grade && grade !== 'Senior' ? <span className="muted"> · {grade}</span> : ''}{year ? <span className="muted"> · {year}</span> : ''}</h1>
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
      </nav>
      <p className="muted">
        {tagged.length} tagged game{tagged.length === 1 ? '' : 's'} combined
        {games.length > tagged.length && ` · ${games.length - tagged.length} more without tags`}. Numbers are totals across the games; rates are worked out from the totals.
      </p>

      <div className="game-strip">
        {done.map(({ m, tagged: t }) => {
          const r = result(m);
          return (
            <a key={m.id} href={`/match/${m.id}`} className={`card game ${t ? '' : 'untagged'}`}>
              <span className={`badge ${r.res}`}>{r.res}</span>
              <span className="game-main"><b>v {r.opp}</b><span className="num">{r.line}</span></span>
              <span className="muted small game-meta">{!grade && m.competitions?.grade ? `${m.competitions.grade} · ` : ''}{!year && m.competitions?.seasons?.year ? `${m.competitions.seasons.year} · ` : ''}{m.stage ? `${m.stage} · ` : ''}{new Date(m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}{t ? '' : ' · no tags'}</span>
            </a>
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
