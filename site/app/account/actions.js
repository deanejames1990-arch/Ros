'use server';

import { db } from '../../lib/db';
import { currentAccess } from '../../lib/session';

// The signed-in person's own details, read-only: only an admin changes them
// (Manage → People).
export async function getMe() {
  try {
    const a = await currentAccess();
    if (!a?.uid) return { ok: false, error: 'You’re signed in with the shared password.' };
    const { data, error } = await db.from('site_users').select('name, email, role, grades, last_seen').eq('id', a.uid).single();
    if (error) throw new Error(error.message);
    return { ok: true, me: data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
