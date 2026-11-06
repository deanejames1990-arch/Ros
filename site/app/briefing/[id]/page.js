import { notFound } from 'next/navigation';
import { db } from '../../../lib/db';
import { currentAccess } from '../../../lib/session';
import { briefingData, SECTIONS } from '../../../lib/briefing';
import { getCrests } from '../../../lib/crests';
import Crest from '../../Crest';
import { pssSummary, quarterTrend } from '../../../lib/pss';
import { targetFor } from '../../../lib/targets';
import { KickoutSection, ShootingSection, TurnoverSection, PlayerTable, PssTable, QuarterTrend, ZoneGrid, ShotZones, playerShotZones, playerHref } from '../../report/sections';
import { ShotLegend, hasShotMap } from '../../report/ShotMap';
import ShotMapSet from '../../report/ShotMapSet';
import { PrintButton, SectionImages } from '../../report/Export';
import Editor from './Editor';
import { suggestKeyMessages } from '../../../lib/briefing-suggest';
import { currentOrg } from '../../../lib/org';

export const dynamic = 'force-dynamic';

const TEAM = '#c4572a'; // the opposition being briefed on
const THEM = '#3b4f9e'; // the teams they played
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const sc = (g, p) => `${g}-${p - 3 * g}`;

function Part({ k, title, b, children, hide }) {
  const notes = lines(b.notes?.[k]);
  const link = b.links?.[k];
  if (hide && !notes.length && !link) return null;
  return (
    <section className="brief-part">
      <h2>{title}</h2>
      {(notes.length > 0 || link) && (
        <div className="brief-msg">
          {notes.length > 0 && <ul>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
          {link && <a className="hub-link no-print" href={link} target="_blank" rel="noreferrer">▶ Watch the clips in Nacsport Hub</a>}
        </div>
      )}
      {children}
    </section>
  );
}

export default async function Briefing({ params, searchParams }) {
  const access = await currentAccess();
  const admin = access?.role === 'admin';
  const { data: b } = await db.from('briefings').select('*').eq('id', Number(params.id)).single();
  if (!b || (!b.published && !admin)) notFound();
  { const o = await currentOrg(); if (o.ready && b.org_id !== o.id) notFound(); }
  const [d, crests] = await Promise.all([briefingData(b.team_id, b.game_ids, access, admin), getCrests()]);
  if (!d) notFound();
  const { team, rows, tagged, mine, opp, teamList } = d;
  const A = { name: team.name, color: TEAM };
  const B = { name: 'Their opponents', color: THEM };
  const grade = rows[0]?.m.competitions?.grade;
  const t = targetFor(grade);
  const pairs = tagged.map((r) => ({ mine: r.mine, opp: r.opp }));
  const topShooters = (mine?.players || []).filter((p) => p.shots >= 3 && Object.keys(p.boxes || {}).length).slice(0, 6);
  const allEvents = tagged.flatMap((r) => r.events.filter((e) => e.team_id === team.id).map((e) => ({ ...e, team_id: 0 })));

  return (
    <>
      <p className="muted no-print"><a href="/briefing">Briefings</a> · <a href={`/team/${encodeURIComponent(team.name)}`}>{team.name} full report</a>
        {admin && <> · {searchParams.edit ? <a href={`/briefing/${b.id}`}>Close editor</a> : <a href={`/briefing/${b.id}?edit=1`}>Edit</a>}</>}</p>
      {searchParams.saved && <p className="card check ok small no-print">Saved.</p>}
      {admin && searchParams.edit && <Editor b={b} candidates={d.candidates} sections={SECTIONS} suggestions={suggestKeyMessages(d, quarterTrend)} />}
      <div className="hero" data-export-title={`${b.title} · ${rows.length} games`}>
        <h1><Crest name={team.name} src={crests.byId[team.id]} size={44} className="brief-crest" />{b.title}{!b.published && <span className="muted"> · draft</span>}</h1>
        <div className="brief-actions no-print"><a className="button primary" href={`/briefing/${b.id}/card`}>Infographic</a><PrintButton /></div>
      </div>
      <SectionImages />

      <Part k="summary" title="Key messages" b={b} hide />

      <Part k="games" title={`Their last ${rows.length} game${rows.length === 1 ? '' : 's'}`} b={b}>
        <div className="game-strip">
          {rows.map((r) => (
            <a key={r.m.id} href={`/match/${r.m.id}`} className={`card game ${r.tagged ? '' : 'untagged'}`}>
              <span className={`badge ${r.res}`}>{r.res}</span>
              <span className="game-main"><b>v {r.oppName}</b><span className="num">{r.line}</span></span>
              <span className="muted small game-meta">{r.m.competitions?.name}{r.m.stage ? ` · ${r.m.stage}` : ''} · {new Date(r.m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}{r.tagged ? '' : ' · no tags'}</span>
            </a>
          ))}
        </div>
      </Part>

      <Part k="team" title="Team lists" b={b}>
        {teamList.length ? (
          <div className="card">
            <div className="wrap">
              <table className="nums team-list">
                <thead>
                  <tr><th>Player</th>{rows.map((r) => <th key={r.m.id} title={r.m.match_date}>v {r.oppName.slice(0, 3)}<br /><small>{new Date(r.m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</small></th>)}<th>Games</th><th>Starts</th><th>Mins</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {teamList.map((p) => {
                    const href = playerHref(team.name, p.name, null);
                    return (
                      <tr key={p.name}>
                        <td>{href ? <a href={href}>{p.name}</a> : p.name}</td>
                        {rows.map((r) => {
                          const c = p.cells[r.m.id];
                          return (
                            <td key={r.m.id} className={c ? (c.start ? 'tl-start' : c.tagsOnly ? 'tl-tags' : 'tl-sub') : 'tl-out'}>
                              {c ? <>
                                {c.no ? `#${c.no}` : ''}{c.tagsOnly ? '✓' : c.start ? '' : ' sub'}
                                {c.mins != null && <small> {c.mins}′</small>}
                                {c.points ? <div className="tl-pts">{sc(c.goals, c.points)}</div> : null}
                              </> : '–'}
                            </td>
                          );
                        })}
                        <td>{p.games}</td><td>{p.starts || '–'}</td><td>{p.minsKnown ? p.mins : '–'}</td>
                        <td><b>{p.points ? sc(p.goals, p.points) : '–'}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted small">#number = on the team sheet (blank = started, “sub” = came on); ✓ = named in the tags only (no team sheet for that game); minutes where the sheet has them. Fill team sheets on Edit game for full lists.</p>
          </div>
        ) : <p className="card muted small">No team sheets or named tags for these games yet.</p>}
      </Part>

      {mine && (
        <>
          <Part k="scorers" title="Scorers and shooting" b={b}>
            <PlayerTable T={A} s={mine} multi={tagged.length > 1} limit={15} />
            {topShooters.length > 0 && (
              <div className="card">
                <div className="vs-heading">Where their main shooters shoot from (box, attacking goal at the bottom)</div>
                <div className="shooter-grids">
                  {topShooters.map((p) => {
                    return <ShotZones key={p.name} name={`${p.name} · ${sc(p.goals, p.points)}`} zones={playerShotZones(p)} color={TEAM} />;
                  })}
                </div>
              </div>
            )}
            {hasShotMap(allEvents) && (
              <div className="card"><ShotMapSet one events={allEvents} maps={[{ teamId: 0, name: team.name, color: TEAM }]} /><ShotLegend /></div>
            )}
            <ShootingSection A={A} B={B} a={mine} b={opp} />
          </Part>

          <Part k="kickouts" title="Kick-outs" b={b}>
            <KickoutSection A={A} B={B} a={mine} b={opp} />
          </Part>

          <Part k="picture" title="Possessions, shots, scores and quarters" b={b}>
            <QuarterTrend name={team.name} trend={quarterTrend(pairs)} t={t} color={TEAM} />
            <PssTable t={t} rows={[
              { name: team.name, strong: true, color: TEAM, s: pssSummary(tagged.map((r) => r.mine)), trend: quarterTrend(pairs) },
              { name: 'Their opponents', color: THEM, s: pssSummary(tagged.map((r) => r.opp)), trend: quarterTrend(tagged.map((r) => ({ mine: r.opp, opp: r.mine }))) },
              ...tagged.map((r) => ({ name: `v ${r.oppName}`, note: new Date(r.m.match_date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }), s: pssSummary([r.mine]) })),
            ]} />
          </Part>

          <Part k="turnovers" title="Turnovers" b={b}>
            <TurnoverSection A={A} B={B} a={mine} />
          </Part>
        </>
      )}
      {!mine && <p className="card muted">None of the chosen games have tags yet.</p>}
    </>
  );
}
