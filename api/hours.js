/* /api/hours — Built by AI Syndicate.
 *   GET  → the latest saved hours + its version (sha)            (signed in only)
 *   PUT  { hours, sha } → checks the hours, then saves them      (signed in only)
 * Saving commits hours.json to GitHub; Vercel republishes the site about a minute later. */
import { send, readJson, sameSite } from './_lib/http.js';
import { settings, signedIn } from './_lib/auth.js';
import { githubReady, readHours, saveHours } from './_lib/github.js';
import { validate, todayISO } from '../assets/hours-core.js';
import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') return send(res, 405, { error: 'method' }, { Allow: 'GET, PUT' });
  if (!settings().ready || !githubReady()) return send(res, 503, { error: 'not_set_up' });
  if (!signedIn(req)) return send(res, 401, { error: 'signin' });

  try {
    if (req.method === 'GET') {
      const { hours, sha } = await readHours();
      return send(res, 200, { hours, sha });
    }

    if (!sameSite(req)) return send(res, 403, { error: 'forbidden' });
    let body;
    try { body = await readJson(req); } catch (e) { return send(res, e.status || 400, { error: 'bad_request' }); }
    if (!body || typeof body.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha)) return send(res, 400, { error: 'bad_request' });

    const { ok, errors, value } = validate(body.hours, { today: todayISO() });
    if (!ok) return send(res, 400, { error: 'invalid', errors });

    value.rev = `${new Date().toISOString()}-${crypto.randomBytes(3).toString('hex')}`;
    value.updatedAt = new Date().toISOString();
    const saved = await saveHours(value, body.sha, 'Hours updated from the website editor (/edit-hours)');
    return send(res, 200, { ok: true, hours: value, sha: saved.sha, commit: saved.commit });
  } catch (e) {
    if (e.status === 409) return send(res, 409, { error: 'conflict' });
    console.error('[hours]', e.message);
    return send(res, e.status === 502 ? 502 : 500, { error: e.status === 502 ? 'github' : 'server' });
  }
}
