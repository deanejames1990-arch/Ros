// Server-side helpers (pages and server actions).
import { cache } from 'react';
import { cookies } from 'next/headers';
import { COOKIE, readSession, authEnabled, lookupUser } from './auth';

// The organisation a super admin is looking at (they can switch).
export const ORG_COOKIE = 'jda_org';

// Who is looking: { role, uid, name, grades, isSuper, orgId }.
//   role: viewer | tagger | admin (a super admin is also 'admin')
//   orgId: their organisation; for a super admin, the one they've picked (null = the first)
// People are re-read from the database on each request, so changes to their
// role, grades or organisation apply straight away.
export const currentAccess = cache(async () => {
  const picked = Number(cookies().get(ORG_COOKIE)?.value) || null;
  if (!authEnabled()) return { role: 'admin', uid: 0, name: null, grades: null, isSuper: true, orgId: picked };
  const s = await readSession(cookies().get(COOKIE)?.value);
  if (!s) return null;
  if (!s.uid) {
    // Shared passwords: the admin one is you (every organisation); the viewer one is the first organisation.
    const sup = s.role === 'admin' || s.role === 'super';
    return { role: sup ? 'admin' : s.role, uid: 0, name: null, grades: null, isSuper: sup, orgId: sup ? picked : null };
  }
  const u = await lookupUser(s.uid);
  if (!u) return null;
  const sup = u.role === 'super';
  return {
    role: sup ? 'admin' : u.role, uid: s.uid, name: u.name, grades: u.role === 'admin' || sup ? null : u.grades,
    isSuper: sup, orgId: sup ? picked || u.orgId : u.orgId,
  };
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

// Things that change data shared by every organisation (team names, merges): you only.
export async function requireSuper() {
  const a = await currentAccess();
  if (!a?.isSuper) throw new Error('Only the site owner can do that: teams are shared by every organisation.');
  return a;
}

// Live tagger and team sheets: taggers and admins. Pass a grade to check the
// tagger is allowed that grade.
export async function requireTagger(grade) {
  const a = await currentAccess();
  if (!a || !['admin', 'tagger'].includes(a.role)) throw new Error('Only a tagger or admin can do that.');
  if (grade !== undefined && !gradeOk(a, grade)) throw new Error(`You don’t have access to ${grade} games.`);
  return a;
}
