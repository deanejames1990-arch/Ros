import { db } from '../../../lib/db';
import ImportForm from './ImportForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Add a game · Roscommon GAA Stats' };

export default async function ImportPage() {
  const [{ data: teams }, { data: comps }, { data: recent }] = await Promise.all([
    db.from('teams').select('id,name').order('name'),
    db.from('competitions').select('id,name,grade,seasons(year)').order('id', { ascending: false }),
    db.from('matches').select('match_code').not('match_code', 'is', null),
  ]);
  const competitions = (comps || [])
    .map((c) => ({ id: c.id, name: c.name, grade: c.grade, year: c.seasons?.year }))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));

  return (
    <>
      <p className="muted"><a href="/">All games</a></p>
      <h1>Add a game</h1>
      <p className="muted">
        Drop in a Nacsport <b>.nac_to_import</b> file. You’ll see a preview and a score check before anything is saved.
        Loading the same file again updates that game instead of adding a copy.
      </p>
      <ImportForm
        teams={(teams || []).map((t) => t.name)}
        competitions={competitions}
        existingCodes={(recent || []).map((r) => r.match_code)}
      />
    </>
  );
}
