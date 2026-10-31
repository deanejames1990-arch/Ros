import { NextResponse } from 'next/server';
import { COOKIE, readSession, authEnabled, lookupUser } from './lib/auth';

// Everything needs a login. /admin needs an admin, except the live tagger,
// which taggers can use too. A person's access is checked against the
// database on each request, so removing them works straight away.
export async function middleware(req) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const s = await readSession(req.cookies.get(COOKIE)?.value);
  let role = s?.role || null;
  if (s?.uid) role = (await lookupUser(s.uid))?.role || null;
  const needAdmin = pathname.startsWith('/admin') && !pathname.startsWith('/admin/live');
  const needTagger = pathname.startsWith('/admin/live');
  const ok = role === 'admin' || (role === 'tagger' && !needAdmin) || (role === 'viewer' && !needAdmin && !needTagger);
  if (ok) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname + search);
  if (role) url.searchParams.set('need', needTagger ? 'tagger' : 'admin');
  else if (s?.uid) url.searchParams.set('removed', '1');
  const res = NextResponse.redirect(url);
  if (s?.uid && !role) res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export const config = {
  // Leave the login page, logout and static files open.
  matcher: ['/((?!login|logout|_next/|crest\\.png|icon\\.png|apple-icon\\.png|favicon\\.ico).*)'],
};
