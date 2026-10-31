// Server-side helpers (pages and server actions).
import { cache } from 'react';
import { cookies } from 'next/headers';
import { COOKIE, readSession, authEnabled, lookupUser } from './auth';

// Who is looking: { role, uid, name, grades } (grades null = every grade).
// People are re-read from the database on each request, so changes to their
// role or grades apply straight away.
export const currentAccess = cache(async () => {
  if (!authEnabled()) return { role: 'admin', uid: 0, name: null, grades: null };
  const s = await readSession(cookies().get(COOKIE)?.value);
  if (!s) return null;
  if (!s.uid) return { role: s.role, uid: 0, name: null, grades: null };
  const u = await lookupUser(s.uid);
  if (!u) return null;
  return { role: u.role, uid: s.uid, name: u.name, grades: u.role === 'admin' ? null : u.grades };
});

export async function currentRole() {
  return (await currentAccess())?.role || null;
}

// Can this person see games of this grade?
export const gradeOk = (access, grade) => !access?.grades || access.grades.includes(grade || '');

// Every admin server action calls this first, so nobody else can call it directly.
export async function requireAdmin() {
  if ((await currentRole()) !== 'admin') throw new Error('Only an admin can do that.');
}

// Live tagger and team sheets: taggers and admins. Pass a grade to check the
// tagger is allowed that grade.
export async function requireTagger(grade) {
  const a = await currentAccess();
  if (!a || !['admin', 'tagger'].includes(a.role)) throw new Error('Only a tagger or admin can do that.');
  if (grade !== undefined && !gradeOk(a, grade)) throw new Error(`You don’t have access to ${grade} games.`);
  return a;
}
