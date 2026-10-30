// Server-side helpers (pages and server actions).
import { cookies } from 'next/headers';
import { COOKIE, readToken, authEnabled } from './auth';

export async function currentRole() {
  if (!authEnabled()) return 'admin';
  return readToken(cookies().get(COOKIE)?.value);
}

// Every admin server action calls this first, so a viewer can't call it directly.
export async function requireAdmin() {
  if ((await currentRole()) !== 'admin') throw new Error('Only an admin can do that. Log in with the admin password.');
}
