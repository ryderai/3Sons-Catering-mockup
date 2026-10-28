/* Sign-in for the hours editor. Built by AI Syndicate.
 *
 * One shared password (EDITOR_PASSWORD) for the owner. After signing in, the browser keeps a
 * signed cookie. The cookie is signed with EDITOR_SECRET and with the password itself, so
 * changing the password in Vercel signs everybody out at once.
 */
import crypto from 'node:crypto';

export const COOKIE = 'hours_session';
const REMEMBER_DAYS = 90;
const SESSION_HOURS = 12;

export function settings() {
  const password = process.env.EDITOR_PASSWORD || '';
  const secret = process.env.EDITOR_SECRET || '';
  // Production only: preview deployments must never be able to change the live hours.
  const env = process.env.VERCEL_ENV;
  const live = !env || env === 'production';
  return { password, secret, ready: live && password.length >= 16 && secret.length >= 32 };
}

const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();

export function passwordMatches(input, password) {
  if (typeof input !== 'string' || !input || !password) return false;
  return crypto.timingSafeEqual(sha(input), sha(password));
}

function sign(secret, password, exp) {
  return crypto.createHmac('sha256', secret).update(`v1.${exp}.`).update(sha(password)).digest('base64url');
}

export function makeToken({ secret, password }, remember, now = Date.now()) {
  const exp = now + (remember ? REMEMBER_DAYS * 864e5 : SESSION_HOURS * 36e5);
  return { token: `v1.${exp}.${sign(secret, password, exp)}`, maxAge: remember ? REMEMBER_DAYS * 86400 : null };
}

export function tokenValid(token, { secret, password }, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const m = /^v1\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (!(exp > now)) return false;
  const good = Buffer.from(sign(secret, password, exp));
  const got = Buffer.from(m[2]);
  return good.length === got.length && crypto.timingSafeEqual(good, got);
}

export function readCookie(req, name = COOKIE) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

export function cookieHeader(token, maxAge) {
  const age = maxAge === null ? '' : `; Max-Age=${maxAge}`;
  return `${COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict${age}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function signedIn(req) {
  const s = settings();
  return s.ready && tokenValid(readCookie(req), s);
}
