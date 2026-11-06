'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '../../../lib/db';
import { requireSuper, ORG_COOKIE } from '../../../lib/session';

const clean = (s) => String(s || '').trim();
const kindOf = (k) => (k === 'club' ? 'club' : 'county');

// Look at the site as one organisation (site owner only).
export async function switchOrg(form) {
  await requireSuper();
  const id = Number(form.get('org')) || 0;
  cookies().set(ORG_COOKIE, String(id), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 365 * 86400 });
  const next = clean(form.get('next'));
  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

export async function addOrg(_prev, form) {
  try {
    await requireSuper();
    const row = { name: clean(form.get('name')), kind: kindOf(form.get('kind')), team_name: clean(form.get('team')) };
    if (!row.name || !row.team_name) throw new Error('Give it a name and its own team’s name (as it appears in the files, e.g. “Drumshanbo”).');
    const { data, error } = await db.from('organisations').insert(row).select('id').single();
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    return { ok: true, id: data.id, name: row.name };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function updateOrg(id, _prev, form) {
  try {
    await requireSuper();
    const row = { name: clean(form.get('name')), kind: kindOf(form.get('kind')), team_name: clean(form.get('team')) };
    if (!row.name || !row.team_name) throw new Error('Name and team are both needed.');
    const { error } = await db.from('organisations').update(row).eq('id', Number(id));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function saveOrgCrest(id, image) {
  try {
    await requireSuper();
    if (image && !/^data:image\/(png|jpeg|webp);base64,/.test(image)) throw new Error('That isn’t an image.');
    if (image && image.length > 400000) throw new Error('That image is too big: try a smaller one.');
    const { error } = await db.from('organisations').update({ crest: image || null }).eq('id', Number(id));
    if (error) throw new Error(error.message);
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
