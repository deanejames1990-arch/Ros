import { NextResponse } from 'next/server';
import { COOKIE, readToken, authEnabled } from './lib/auth';

// Everything needs a login; /admin needs the admin login.
export async function middleware(req) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  const role = await readToken(req.cookies.get(COOKIE)?.value);
  const needAdmin = pathname.startsWith('/admin');
  if (role === 'admin' || (role === 'viewer' && !needAdmin)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('next', pathname + search);
  if (role === 'viewer' && needAdmin) url.searchParams.set('need', 'admin');
  return NextResponse.redirect(url);
}

export const config = {
  // Leave the login page, logout and static files open.
  matcher: ['/((?!login|logout|_next/|crest\\.png|icon\\.png|apple-icon\\.png|favicon\\.ico).*)'],
};
