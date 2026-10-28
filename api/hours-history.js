/* GET /api/hours-history → the last few saved versions, newest first (signed in only). Built by AI Syndicate. */
import { send } from './_lib/http.js';
import { settings, signedIn } from './_lib/auth.js';
import { githubReady, hoursHistory } from './_lib/github.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  if (!settings().ready || !githubReady()) return send(res, 503, { error: 'not_set_up' });
  if (!signedIn(req)) return send(res, 401, { error: 'signin' });
  try {
    return send(res, 200, { versions: await hoursHistory(6) });
  } catch (e) {
    console.error('[hours-history]', e.message);
    return send(res, 502, { error: 'github' });
  }
}
