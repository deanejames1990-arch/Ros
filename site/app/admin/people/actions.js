'use server';

import { db } from '../../../lib/db';
import { requireAdmin } from '../../../lib/session';
import { newCode, hashCode, hashPassword, passwordProblem, ROLES } from '../../../lib/auth';

const clean = (s) => String(s || '').trim();
const fields = (form) => {
  const role = ROLES.includes(form.get('role')) ? form.get('role') : 'viewer';
  const grades = form.getAll('grades').map(String).filter(Boolean);
  return { name: clean(form.get('name')), email: clean(form.get('email')) || null, role, grades: role === 'admin' || !grades.length ? null : grades };
};

// Adds a person and returns their new code (shown once).
export async function addPerson(_prev, form) {
  try {
    await requireAdmin();
    const f = fields(form);
    if (!f.name) throw new Error('Give the person a name.');
    const code = newCode();
    const { error } = await db.from('site_users').insert({ ...f, code_hash: await hashCode(code), active: true });
    if (error) throw new Error(error.message);
    return { ok: true, code, name: f.name };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function updatePerson(id, _prev, form) {
  try {
    await requireAdmin();
    const f = fields(form);
    if (!f.name) throw new Error('Name can’t be empty.');
    const { error } = await db.from('site_users').update(f).eq('id', Number(id));
    if (error) throw new Error(error.message);
    return { ok: true, saved: Date.now() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// New code for a person; the old one stops working at once.
export async function resetCode(id) {
  try {
    await requireAdmin();
    const code = newCode();
    const { error } = await db.from('site_users').update({ code_hash: await hashCode(code), active: true }).eq('id', Number(id));
    if (error) throw new Error(error.message);
    return { ok: true, code };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function setActive(id, active) {
  try {
    await requireAdmin();
    const { error } = await db.from('site_users').update({ active: Boolean(active) }).eq('id', Number(id));
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

export async function removePerson(id) {
  try {
    await requireAdmin();
    const { error } = await db.from('site_users').delete().eq('id', Number(id));
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// Sets a password for a person (instead of a code); the old code or password stops working.
export async function setPassword(id, _prev, form) {
  try {
    await requireAdmin();
    const pw = String(form.get('password') || '');
    if (pw !== String(form.get('confirm') || '')) throw new Error('The two passwords don’t match.');
    const bad = passwordProblem(pw);
    if (bad) throw new Error(bad);
    const { error } = await db.from('site_users').update({ code_hash: await hashPassword(pw), active: true }).eq('id', Number(id));
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Someone already uses that password: pick another.' : error.message);
    return { ok: true, msg: 'Password set. Their old code or password has stopped working.' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// A person's photo (a small data URL), or none to remove it.
export async function saveAvatar(id, image) {
  try {
    await requireAdmin();
    const uid = Number(id);
    if (!image) {
      const { error } = await db.from('user_avatars').delete().eq('user_id', uid);
      if (error) throw new Error(error.message);
    } else {
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(image)) throw new Error('That isn’t an image.');
      if (image.length > 300000) throw new Error('That image is too big: try a smaller one.');
      const { error } = await db.from('user_avatars').upsert({ user_id: uid, image, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message) ? 'Set up photos first: run the SQL shown on this page in Supabase.' : error.message);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
