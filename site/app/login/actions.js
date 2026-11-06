'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, makeToken, roleFor, hashCode, hashPassword, normCode } from '../../lib/auth';
import { db } from '../../lib/db';

// One box: a personal access code, or one of the shared passwords.
export async function login(_prev, form) {
  const typed = String(form.get('password') || '').trim();
  let role = roleFor(typed);
  let uid = 0;
  if (!role && typed) {
    // A personal access code, or a password the person chose for themselves.
    const hashes = [await hashPassword(typed), ...(normCode(typed).length === 12 ? [await hashCode(typed)] : [])];
    const { data } = await db.from('site_users').select('id, role, active').in('code_hash', hashes).limit(1);
    const u = data?.[0];
    if (u?.active) {
      role = u.role; uid = u.id;
      await db.from('site_users').update({ last_seen: new Date().toISOString() }).eq('id', u.id);
    } else if (u) {
      return { error: 'That access code has been switched off. Ask James for a new one.' };
    }
  }
  if (!role) return { error: 'That code or password isn’t right.' };
  const { token, maxAge } = await makeToken(role, uid);
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge });
  let next = String(form.get('next') || '/');
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';
  if (role === 'viewer' && next.startsWith('/admin')) next = '/';
  if (role === 'tagger' && next.startsWith('/admin') && !next.startsWith('/admin/live')) next = '/admin/live';
  redirect(next);
}
