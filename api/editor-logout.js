/* POST /api/editor-logout → signs out on this device. Built by AI Syndicate. */
import { send, sameSite } from './_lib/http.js';
import { clearCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameSite(req)) return send(res, 403, { error: 'forbidden' });
  return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}
