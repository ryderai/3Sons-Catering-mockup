/* Small helpers shared by the /api functions. Built by AI Syndicate.
 * Written against plain Node (req, res) so the same code runs on Vercel and in our local tests. */

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

const MAX_BODY = 32 * 1024;

/** The request body as an object. Works whether or not Vercel already parsed it. */
export async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const s = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (s.length > MAX_BODY) throw Object.assign(new Error('too big'), { status: 413 });
    return s ? JSON.parse(s) : {};
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error('too big'), { status: 413 });
    chunks.push(c);
  }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

/**
 * Blocks requests from other websites (CSRF). Every change must:
 *  - carry our custom header (another site can't add it without our permission), and
 *  - if the browser sent an Origin, come from this same site.
 */
export function sameSite(req) {
  if (req.headers['x-hours-editor'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
