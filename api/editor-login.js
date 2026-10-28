/* POST /api/editor-login  { password, remember }  → signs the owner in. Built by AI Syndicate. */
import { send, readJson, sameSite, sleep } from './_lib/http.js';
import { settings, passwordMatches, makeToken, cookieHeader } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameSite(req)) return send(res, 403, { error: 'forbidden' });
  const s = settings();
  if (!s.ready) return send(res, 503, { error: 'not_set_up' });
  let body;
  try { body = await readJson(req); } catch (e) { return send(res, e.status || 400, { error: 'bad_request' }); }
  if (!passwordMatches(body && body.password, s.password)) {
    await sleep(900); // slows down guessing
    return send(res, 401, { error: 'wrong_password' });
  }
  const { token, maxAge } = makeToken(s, body.remember !== false);
  return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(token, maxAge) });
}
