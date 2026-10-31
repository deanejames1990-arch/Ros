'use server';

import { db } from '../../../lib/db';
import { requireAdmin } from '../../../lib/session';
import { newCode, hashCode, ROLES } from '../../../lib/auth';

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
