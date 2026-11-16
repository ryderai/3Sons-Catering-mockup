/* /api/subscribe — the email sign-up in the site footer. Built by AI Syndicate (16 Nov 2026).
 *
 * Chris asked for the email sign-up his old Webflow site had (email 13 Nov 2026).
 * Each sign-up is emailed to the restaurant, server-side, with Resend. The page only
 * says "You're on the list" when Resend accepted the email. Nothing is stored here.
 *
 *   POST { email, website (hidden trap field, must be empty), page }  → { ok: true }
 *   GET  ?diag=1  → is it set up? (sends nothing, never shows the key)
 *
 * Settings (Vercel → Settings → Environment Variables, Production):
 *   RESEND_API_KEY     required. A "Sending access" key from the Resend team that owns
 *                      contact.aisyndicate.com. Without it this returns 503 and the page
 *                      tells the visitor to email the restaurant instead.
 *   SIGNUP_TO_EMAIL    optional. Who gets each sign-up. Default brisket@3sonsbarbq.com.
 *   SIGNUP_FROM_EMAIL  optional. Default "3 Sons Bar-B-Q Website <signups@contact.aisyndicate.com>".
 *   SIGNUP_BCC_EMAIL   optional. A copy for AI Syndicate.
 */
import { send, readJson } from './_lib/http.js';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TO = 'brisket@3sonsbarbq.com';
const DEFAULT_FROM = '3 Sons Bar-B-Q Website <signups@contact.aisyndicate.com>';

export const looksLikeEmail = (s) =>
  typeof s === 'string' && s.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(s.trim());

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);

/** Blocks other websites from posting here: our custom header, and a same-site Origin if one is sent. */
function sameSite(req) {
  if (req.headers['x-signup'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default async function handler(req, res, deps = {}) {
  const env = deps.env || process.env;
  const fetchFn = deps.fetch || globalThis.fetch;
  const key = env.RESEND_API_KEY;
  const to = env.SIGNUP_TO_EMAIL || DEFAULT_TO;
  const from = env.SIGNUP_FROM_EMAIL || DEFAULT_FROM;

  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://x');
    if (url.searchParams.get('diag') !== '1') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
    return send(res, 200, {
      ok: true, keySet: Boolean(key), keyLooksLikeResend: Boolean(key && key.startsWith('re_')),
      to, from, bcc: env.SIGNUP_BCC_EMAIL || null,
      verdict: key ? 'Key is set. A real sign-up will be emailed to "to".' : 'No RESEND_API_KEY set. Sign-ups cannot send yet.',
    });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameSite(req)) return send(res, 403, { error: 'forbidden' });

  let body;
  try { body = await readJson(req); } catch (e) { return send(res, e.status || 400, { error: 'bad_request' }); }
  body = body && typeof body === 'object' ? body : {};

  // Bots fill every field. A filled trap field gets a quiet "ok" and nothing is sent.
  if (body.website) return send(res, 200, { ok: true });

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!looksLikeEmail(email)) return send(res, 400, { error: 'email' });
  if (!key) return send(res, 503, { error: 'not_set_up' });

  const page = oneLine(body.page || '/').slice(0, 80);
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  const payload = {
    from, to: [to], reply_to: oneLine(email),
    subject: `New email sign-up: ${oneLine(email)}`,
    text: `Someone joined the 3 Sons email list on the website.\n\nEmail: ${email}\nPage: ${page}\nWhen: ${when} CT\n\nReply to this email to write back to them.`,
    html: `<p>Someone joined the 3 Sons email list on the website.</p>
<p><b>Email:</b> ${esc(email)}<br><b>Page:</b> ${esc(page)}<br><b>When:</b> ${esc(when)} CT</p>
<p>Reply to this email to write back to them.</p>`,
  };
  if (env.SIGNUP_BCC_EMAIL) payload.bcc = [env.SIGNUP_BCC_EMAIL];

  try {
    const r = await fetchFn(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.error('[subscribe] resend', r.status, (await r.text().catch(() => '')).slice(0, 300));
      return send(res, 502, { error: 'send' });
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error('[subscribe]', e.message);
    return send(res, 502, { error: 'send' });
  }
}
