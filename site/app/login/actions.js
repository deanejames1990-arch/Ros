'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, makeToken, roleFor } from '../../lib/auth';

export async function login(_prev, form) {
  const role = roleFor(String(form.get('password') || ''));
  if (!role) return { error: 'That password isn’t right.' };
  const { token, maxAge } = await makeToken(role);
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge });
  let next = String(form.get('next') || '/');
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';
  if (role === 'viewer' && next.startsWith('/admin')) next = '/';
  redirect(next);
}
