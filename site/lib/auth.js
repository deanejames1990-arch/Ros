// Logins: viewers see the stats, taggers can also use the live tagger and team
// sheets, admins can do everything. People log in with their own access code
// (site_users table, managed on Manage → People); the shared passwords below
// still work as a fallback.
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

export const ROLES = ['viewer', 'tagger', 'admin'];

// Token: role.expiry.userId.signature. userId 0 = a shared password from Vercel;
// otherwise a person from the site_users table (checked on every request, so
// removing someone takes effect straight away).
export async function makeToken(role, uid = 0) {
  const exp = Date.now() + DAYS * 864e5;
  const body = `${role}.${exp}.${Number(uid) || 0}`;
  return { token: `${body}.${await sign(body)}`, maxAge: DAYS * 86400 };
}

// Returns { role, uid } or null. Older tokens (role.exp.sig) still read as uid 0.
export async function readSession(token) {
  if (!token) return null;
  const parts = String(token).split('.');
  const [role, exp] = parts;
  const uid = parts.length === 4 ? Number(parts[2]) || 0 : 0;
  const sig = parts[parts.length - 1];
  if (!ROLES.includes(role) || !exp || !sig) return null;
  if (Number(exp) < Date.now()) return null;
  const body = parts.length === 4 ? `${role}.${exp}.${parts[2]}` : `${role}.${exp}`;
  return same(sig, await sign(body)) ? { role, uid } : null;
}
export async function readToken(token) {
  return (await readSession(token))?.role || null;
}

// Personal access codes: shown once, stored only as a hash.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const c = [...b].map((x) => ALPHA[x % ALPHA.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function hashCode(code) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(`ros-code|${normCode(code)}`));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// A password someone chose for themselves: case-sensitive, kept only as a hash
// (in the same column as codes, so the one sign-in box finds either).
export const PASSWORD_MIN = 8;
export async function hashPassword(pw) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(`ros-pass|${String(pw)}`));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (/^(.)\1+$/.test(p) || /^(password|12345678|roscommon)/i.test(p)) return 'Pick something harder to guess.';
  return null;
}

// A person's current access from the database (edge-safe: plain fetch).
// Returns { role, grades, name } or null if removed / switched off / no table.
export async function lookupUser(uid) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || !uid) return null;
  try {
    const r = await fetch(`${url}/rest/v1/site_users?id=eq.${Number(uid)}&select=id,name,role,grades,active`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store',
    });
    if (!r.ok) return null;
    const [u] = await r.json();
    if (!u || !u.active || !ROLES.includes(u.role)) return null;
    return { role: u.role, grades: u.grades?.length ? u.grades : null, name: u.name };
  } catch {
    return null;
  }
}

// Which role a typed password unlocks. Admin wins if both happen to match.
export function roleFor(password) {
  const p = passwords();
  if (p.admin && same(password, p.admin)) return 'admin';
  if (p.viewer && same(password, p.viewer)) return 'viewer';
  return null;
}
