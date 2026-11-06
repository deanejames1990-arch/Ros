import { db } from '../../../lib/db';
import ImportForm from './ImportForm';
import { scoped, pickerTeams, onlyOrgComps, currentOrg } from '../../../lib/org';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add a game · James Deane Analysis' };

export default async function ImportPage() {
  const [{ data: allTeams }, { data: allComps }, { data: recent }, org] = await Promise.all([
    db.from('teams').select('id,name').order('name'),
    db.from('competitions').select('id,name,grade,seasons(year)').order('id', { ascending: false }),
    scoped(db.from('matches').select('id, match_date, match_code, team1:teams!team1_id(name), team2:teams!team2_id(name), competitions(name, seasons(year))')),
    currentOrg(),
  ]);
  const teams = await pickerTeams(allTeams);
  const comps = await onlyOrgComps(allComps);
  const competitions = (comps || [])
    .map((c) => ({ id: c.id, name: c.name, grade: c.grade, year: c.seasons?.year }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));

  return (
    <>
      <p className="muted"><a href="/games">All games</a></p>
      <h1>Add a game</h1>
      <p className="muted">
        Drop in a Nacsport <b>.nac_to_import</b> file or a Sportscode/Hudl <b>.xml</b> export, or a Nacsport <b>.csv</b> export (Time, Period, Team Name, Name, Outcome, Player). You’ll see a preview and a score check before anything is saved.
        Loading the same file again updates that game instead of adding a copy.
      </p>
      <ImportForm
        ourTeam={org.team_name}
        teams={(teams || []).map((t) => t.name)}
        competitions={competitions}
        existingCodes={(recent || []).map((r) => r.match_code).filter(Boolean)}
        games={(recent || []).map((r) => ({
          id: r.id, date: r.match_date, t1: r.team1?.name || '', t2: r.team2?.name || '', competition: r.competitions?.name || '', year: r.competitions?.seasons?.year || null,
        }))}
      />
    </>
  );
}
