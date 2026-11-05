import { notFound } from 'next/navigation';
import { db, MATCH_SELECT, loadEvents } from '../../../../lib/db';
import { analyseMatch } from '../../../../lib/analysis';
import { nameEvents, isNumberTag } from '../../../../lib/players';
import { getAliases } from '../../../../lib/aliases';
import { GameForm, DeleteGame } from '../../forms';
import { sheetData } from '../../../../lib/sheets-data';
import SheetEditor from '../../SheetEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit game · James Deane Analysis' };

export default async function EditGame({ params }) {
  const [{ data: g }, { data: comps }, { data: teams }, { count }] = await Promise.all([
    db.from('matches').select(MATCH_SELECT).eq('id', params.id).single(),
    db.from('competitions').select('id, name, grade, seasons(year)'),
    db.from('teams').select('name').order('name'),
    db.from('events').select('id', { count: 'exact', head: true }).eq('match_id', params.id),
  ]);
  if (!g) notFound();
  const competitions = (comps || []).map((c) => ({ ...c, year: c.seasons?.year }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));
  const label = `${g.team1.name} v ${g.team2.name} (${g.match_date})`;
  const sides = [{ id: g.team1_id, name: g.team1.name, color: '#3b4f9e' }, { id: g.team2_id, name: g.team2.name, color: '#c4572a' }];
  if (/roscommon/i.test(sides[1].name)) { sides.reverse(); sides[0].color = '#3b4f9e'; sides[1].color = '#c4572a'; }
  const [sheets, raw, { data: apps }] = await Promise.all([
    sheetData(g.id, sides),
    loadEvents(g.id),
    db.from('appearances').select('team_id, jersey_no, players(name)').eq('match_id', g.id),
  ]);
  // Names already in the tags, per team, for "Add names from the tags".
  if (raw.length) {
    const r = analyseMatch({ events: nameEvents(raw, apps || [], sides, await getAliases()), teams: sides });
    for (const t of sides) {
      sheets[t.id].tagNames = (r.byTeam[t.id]?.players || []).map((p) => p.name).filter((n) => !isNumberTag(n));
    }
    // First and last minute each player was tagged, through the game: a guide
    // for the came-on / went-off minutes.
    const halfLen = Number(String(g.match_code || '').match(/^LIVE-\d+-(\d+)/)?.[1]) || (g.competitions?.grade === 'Senior' ? 35 : 30);
    const at = (e) => Math.round((String(e.half || '').startsWith('2') ? halfLen : 0) + (Number(e.minute) || 0));
    for (const t of sides) {
      const span = {};
      for (const e of r.allEvents || []) {
        const l = e.labels || {};
        if (e.event_type === 'Poss') continue;
        const own = e.team_id === t.id;
        const names = [
          ...(own ? String(l.Players || '').split(',') : []),
          ...(!own ? [l.WonBackBy, l.FreeWonBy] : []),
        ].map((x) => String(x || '').trim()).filter(Boolean);
        for (const nm of names) {
          const k = nm.toLowerCase();
          const m = at(e);
          span[k] = span[k] ? [Math.min(span[k][0], m), Math.max(span[k][1], m)] : [m, m];
        }
      }
      sheets[t.id].tagSpan = span;
      sheets[t.id].gameLen = 2 * halfLen;
    }
  }
  return (
    <>
      <p className="muted"><a href="/admin">Manage</a> · <a href={`/match/${g.id}`}>View game</a></p>
      <h1>{g.team1.name} v {g.team2.name}</h1>
      <p className="muted">{count ?? 0} tagged events. To replace the tags, load the file again through <a href="/admin/import">Add game</a>.</p>
      <GameForm g={{ ...g, team1: g.team1.name, team2: g.team2.name }} competitions={competitions} teams={(teams || []).map((t) => t.name)} />
      <h2 id="sheets">Team sheets</h2>
      <p className="muted small">Who wore which number. Players build up a profile from every game they’re on a sheet for, and tags made by number pick up the name from here. Saves as you type.</p>
      <div className="lt-sheets">
        {sides.map((t, i) => <SheetEditor key={t.id} matchId={g.id} team={t} info={sheets[t.id]} hideNote={i > 0} />)}
      </div>
      <DeleteGame id={g.id} label={label} />
    </>
  );
}
