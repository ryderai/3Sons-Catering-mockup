/* Reads and saves /hours.json in the site's GitHub repo. Built by AI Syndicate.
 *
 * Saving makes a normal commit on the main branch. Vercel sees the commit and republishes
 * the site (about a minute). Every save is kept in the repo's history, so any change can be undone.
 *
 * Settings (Vercel → Project → Settings → Environment Variables):
 *   GITHUB_TOKEN   fine-grained token, this repo only, "Contents: Read and write"
 *   GITHUB_REPO    optional, default ryderai/3Sons-Catering-mockup
 *   GITHUB_BRANCH  optional, default main
 */
const FILE = 'hours.json';

function cfg() {
  return {
    api: (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''),
    token: process.env.GITHUB_TOKEN || '',
    repo: process.env.GITHUB_REPO || 'ryderai/3Sons-Catering-mockup',
    branch: process.env.GITHUB_BRANCH || 'main',
  };
}

export const githubReady = () => Boolean(cfg().token);

async function gh(path, init = {}) {
  const c = cfg();
  const r = await fetch(`${c.api}/repos/${c.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': '3sons-hours-editor',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 200) }; }
  return { status: r.status, data };
}

const decode = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

/** The latest saved hours: { hours, sha }. */
export async function readHours() {
  const c = cfg();
  const { status, data } = await gh(`/contents/${FILE}?ref=${encodeURIComponent(c.branch)}`);
  if (status !== 200) throw Object.assign(new Error(`GitHub read failed (${status}): ${data && data.message}`), { status: 502 });
  return { hours: decode(data.content), sha: data.sha };
}

/** Saves. `sha` must be the version the owner started from, so two people can't overwrite each other. */
export async function saveHours(hours, sha, message) {
  const c = cfg();
  const content = Buffer.from(JSON.stringify(hours, null, 2) + '\n', 'utf8').toString('base64');
  const { status, data } = await gh(`/contents/${FILE}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content, sha, branch: c.branch }),
  });
  if ((status === 409 || status === 422) && /does not match|sha/i.test((data && data.message) || '')) {
    throw Object.assign(new Error('conflict'), { status: 409 });
  }
  if (status !== 200 && status !== 201) {
    throw Object.assign(new Error(`GitHub save failed (${status}): ${data && data.message}`), { status: 502 });
  }
  return { sha: data.content.sha, commit: data.commit.sha };
}

/** The last few saved versions, newest first: [{ commit, date, message, hours }]. */
export async function hoursHistory(n = 6) {
  const c = cfg();
  const list = await gh(`/commits?path=${FILE}&sha=${encodeURIComponent(c.branch)}&per_page=${n}`);
  if (list.status !== 200) throw Object.assign(new Error(`GitHub history failed (${list.status})`), { status: 502 });
  const out = [];
  for (const cm of list.data) {
    const f = await gh(`/contents/${FILE}?ref=${cm.sha}`);
    if (f.status !== 200) continue;
    out.push({ commit: cm.sha, date: cm.commit.committer.date, message: cm.commit.message, hours: decode(f.data.content) });
  }
  return out;
}
