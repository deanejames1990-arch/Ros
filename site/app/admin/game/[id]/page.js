import { notFound } from 'next/navigation';
import { db, MATCH_SELECT } from '../../../../lib/db';
import { GameForm, DeleteGame } from '../../forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit game · Roscommon GAA Stats' };

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
  return (
    <>
      <p className="muted"><a href="/admin">Manage</a> · <a href={`/match/${g.id}`}>View game</a></p>
      <h1>{g.team1.name} v {g.team2.name}</h1>
      <p className="muted">{count ?? 0} tagged events. To replace the tags, load the file again through <a href="/admin/import">Add game</a>.</p>
      <GameForm g={{ ...g, team1: g.team1.name, team2: g.team2.name }} competitions={competitions} teams={(teams || []).map((t) => t.name)} />
      <DeleteGame id={g.id} label={label} />
    </>
  );
}
