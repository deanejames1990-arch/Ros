import { notFound } from 'next/navigation';
import { db } from '../../../lib/db';
import Profile from '../profile';

export const dynamic = 'force-dynamic';

export default async function Player({ params }) {
  const { data: p } = await db.from('players').select('id,name,club').eq('id', params.id).single();
  if (!p) notFound();
  return <Profile p={p} />;
}
