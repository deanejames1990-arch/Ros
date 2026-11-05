import { notFound, redirect } from 'next/navigation';
import { db } from '../../../../../lib/db';
import Profile from '../../../../player/profile';
import { getAliases } from '../../../../../lib/aliases';

export const dynamic = 'force-dynamic';

// A player known only from the names in a team's tags (no team sheet yet).
// If they're on a team sheet for this team, their saved profile is used.
export default async function TagPlayer({ params }) {
  const team = decodeURIComponent(params.name);
  const name = decodeURIComponent(params.player).trim();
  const { data: teams } = await db.from('teams').select('id,name').ilike('name', team);
  if (!teams?.length || !name) notFound();
  const ids = teams.map((t) => t.id);
  // An old link by the tag name ("Lundy"): go to the tidied full name.
  const al = (await getAliases()).find((a) => ids.includes(a.team_id) && a.alias.toLowerCase() === name.toLowerCase());
  if (al) redirect(`/team/${encodeURIComponent(teams[0].name)}/player/${encodeURIComponent(al.name)}`);
  const { data: apps } = await db.from('appearances').select('player_id, players(id, name)').in('team_id', ids).limit(5000);
  const saved = (apps || []).find((a) => a.players?.name?.toLowerCase() === name.toLowerCase());
  if (saved) redirect(`/player/${saved.players.id}`);
  return <Profile p={{ id: null, name }} teamIds={ids} />;
}
