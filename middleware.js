import { NextResponse } from 'next/server';

// Set SITE_PASSWORD in Vercel to put the whole site behind a password (any username works).
export function middleware(req) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next();
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Basic ')) {
    const decoded = atob(auth.slice(6));
    if (decoded.slice(decoded.indexOf(':') + 1) === pw) return NextResponse.next();
  }
  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Roscommon GAA Stats"' },
  });
}
