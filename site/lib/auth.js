// Two-level login: viewers see the stats, admins can also add, edit and delete.
//
// Vercel environment variables:
//   VIEWER_PASSWORD  password for coaches / viewers (SITE_PASSWORD still works)
//   ADMIN_PASSWORD   password for admins (Add game, Manage)
//   AUTH_SECRET      optional; any long random text. If unset, it is derived from
//                    the passwords, so changing a password signs everyone out.
// With no passwords set at all the site stays open (handy for local testing).
//
// Runs in both the middleware (edge) and server code, so it only uses Web Crypto.

export const COOKIE = 'ros_session';
const DAYS = 30;

export const passwords = () => ({
  viewer: process.env.VIEWER_PASSWORD || process.env.SITE_PASSWORD || '',
  // Until ADMIN_PASSWORD is set, the viewer password also unlocks admin (as before).
  admin: process.env.ADMIN_PASSWORD || process.env.VIEWER_PASSWORD || process.env.SITE_PASSWORD || '',
  adminSet: Boolean(process.env.ADMIN_PASSWORD),
});
export const authEnabled = () => Boolean(passwords().viewer || passwords().admin);

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function key() {
  const p = passwords();
  const secret = process.env.AUTH_SECRET || `ros|${p.viewer}|${p.admin}`;
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(text) {
  return b64url(await crypto.subtle.sign('HMAC', await key(), enc.encode(text)));
}

// Constant-time string compare.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function makeToken(role) {
  const exp = Date.now() + DAYS * 864e5;
  const body = `${role}.${exp}`;
  return { token: `${body}.${await sign(body)}`, maxAge: DAYS * 86400 };
}

// Returns 'admin', 'viewer' or null.
export async function readToken(token) {
  if (!token) return null;
  const [role, exp, sig] = String(token).split('.');
  if (!['admin', 'viewer'].includes(role) || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  return same(sig, await sign(`${role}.${exp}`)) ? role : null;
}

// Which role a typed password unlocks. Admin wins if both happen to match.
export function roleFor(password) {
  const p = passwords();
  if (p.admin && same(password, p.admin)) return 'admin';
  if (p.viewer && same(password, p.viewer)) return 'viewer';
  return null;
}
