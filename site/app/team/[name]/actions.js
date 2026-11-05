'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../lib/db';
import { requireAdmin } from '../../../lib/session';

// Saves (or removes, with an empty image) a team's crest.
export async function saveCrest(teamId, image) {
  try {
    await requireAdmin();
    const id = Number(teamId);
    if (!id) throw new Error('No team.');
    if (!image) {
      const { error } = await db.from('team_crests').delete().eq('team_id', id);
      if (error) throw new Error(error.message);
    } else {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(image)) throw new Error('That isn’t an image.');
      if (image.length > 400000) throw new Error('That image is too big: try a smaller one.');
      const { error } = await db.from('team_crests').upsert({ team_id: id, image, updated_at: new Date().toISOString() });
      if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message) ? 'Set up crests first: run the SQL shown under the crest in Supabase.' : error.message);
    }
  } catch (e) {
    return { error: String(e.message || e) };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}
