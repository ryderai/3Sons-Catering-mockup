// Test harness: a fake GitHub + a local copy of how Vercel serves this site. Built by AI Syndicate.
// Used by api.test.js and e2e.cjs. Nothing here is deployed (_build/ is in .vercelignore).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const blobSha = (s) => crypto.createHash('sha1').update(`blob ${Buffer.byteLength(s)}\0${s}`).digest('hex');
const commitSha = () => crypto.randomBytes(20).toString('hex');

/**
 * Fake GitHub "contents" + "commits" API for one repo and one file (hours.json).
 * onCommit(text) runs after every successful save — the e2e test uses it to "redeploy".
 */
export function mockGitHub({ token, repo = 'ryderai/3Sons-Catering-mockup', initial, onCommit } = {}) {
  const commits = [{ sha: commitSha(), date: '2026-10-27T05:00:00Z', message: 'Initial hours', text: initial }];
  const g = { mode: 'ok', calls: [], commits, current: () => commits[0] };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (s, body) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    g.calls.push(`${req.method} ${u.pathname}${u.search}`);
    if (g.mode === 'down') return send(500, { message: 'Server Error' });
    if (g.mode === 'ruleset' && req.method === 'PUT') return send(409, { message: 'Repository rule violations found' });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { message: 'Bad credentials' });
    const base = `/repos/${repo}`;
    if (req.method === 'GET' && u.pathname === `${base}/contents/hours.json`) {
      const ref = u.searchParams.get('ref');
      const c = ref === 'main' ? commits[0] : commits.find((x) => x.sha === ref);
      if (!c) return send(404, { message: 'Not Found' });
      return send(200, { type: 'file', encoding: 'base64', content: b64(c.text).replace(/(.{60})/g, '$1\n'), sha: blobSha(c.text) });
    }
    if (req.method === 'PUT' && u.pathname === `${base}/contents/hours.json`) {
      let body = '';
      for await (const ch of req) body += ch;
      const j = JSON.parse(body);
      if (j.branch !== 'main') return send(422, { message: 'branch' });
      if (j.sha !== blobSha(commits[0].text)) return send(409, { message: `hours.json does not match ${j.sha}` });
      const text = Buffer.from(j.content, 'base64').toString('utf8');
      const c = { sha: commitSha(), date: new Date().toISOString(), message: j.message, text };
      commits.unshift(c);
      if (onCommit) setTimeout(() => onCommit(text), 0);
      return send(200, { content: { sha: blobSha(text) }, commit: { sha: c.sha } });
    }
    if (req.method === 'GET' && u.pathname === `${base}/commits`) {
      const n = Number(u.searchParams.get('per_page') || 30);
      return send(200, commits.slice(0, n).map((c) => ({ sha: c.sha, commit: { message: c.message, committer: { date: c.date } } })));
    }
    send(404, { message: 'Not Found' });
  });
  g.listen = () => new Promise((r) => server.listen(0, '127.0.0.1', () => { g.url = `http://127.0.0.1:${server.address().port}`; r(g); }));
  g.close = () => new Promise((r) => server.close(r));
  /** Someone else saves (for the "two people editing" test). */
  g.externalSave = (text) => commits.unshift({ sha: commitSha(), date: new Date().toISOString(), message: 'other', text });
  return g;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/**
 * Serves siteDir/public the way Vercel does (cleanUrls, the vercel.json headers and redirects)
 * and runs siteDir/api/*.js as functions.
 */
export function devServer(siteDir) {
  const vc = JSON.parse(fs.readFileSync(path.join(siteDir, 'vercel.json'), 'utf8'));
  const handlers = {};
  const matchSrc = (src, p) => src === '/(.*)' || src === p;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = decodeURIComponent(u.pathname);
    try {
      if (p.startsWith('/api/')) {
        const name = p.slice(5);
        if (!/^[a-z-]+$/.test(name)) { res.writeHead(404); return res.end(); }
        const file = path.join(siteDir, 'api', name + '.js');
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
        handlers[name] ||= (await import(pathToFileURL(file).href)).default;
        return await handlers[name](req, res);
      }
      for (const r of vc.redirects || []) if (r.source === p) { res.writeHead(308, { Location: r.destination }); return res.end(); }
      if (p.endsWith('.html')) { res.writeHead(308, { Location: p.replace(/(index)?\.html$/, '') || '/' }); return res.end(); }
      const pub = path.join(siteDir, 'public');
      let file = path.join(pub, p);
      if (!file.startsWith(pub)) { res.writeHead(400); return res.end(); }
      if (p === '/') file = path.join(pub, 'index.html');
      else if (!path.extname(p) && fs.existsSync(file + '.html')) file += '.html';
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('<h1>404</h1>'); }
      const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
      for (const h of vc.headers || []) if (matchSrc(h.source, p)) for (const { key, value } of h.headers) headers[key] = value;
      res.writeHead(200, headers);
      res.end(fs.readFileSync(file));
    } catch (e) {
      console.error('devServer', e);
      if (!res.headersSent) res.writeHead(500);
      res.end('error');
    }
  });
  const s = { server };
  s.listen = () => new Promise((r) => server.listen(0, '127.0.0.1', () => { s.url = `http://127.0.0.1:${server.address().port}`; r(s); }));
  s.close = () => new Promise((r) => server.close(r));
  return s;
}

/** A throw-away copy of the site, built, for tests that save and "redeploy". */
export function siteCopy(siteDir) {
  const tmp = fs.mkdtempSync('/tmp/3sons-e2e-');
  fs.cpSync(siteDir, tmp, { recursive: true, filter: (s) => !s.includes('/.git') && !s.endsWith('/public') && !s.includes('/public/') });
  execFileSync('node', ['scripts/apply-hours.js'], { cwd: tmp, stdio: 'pipe' });
  return tmp;
}

/** What Vercel does after a commit: take the new hours.json and rebuild public/. */
export function redeploy(dir, text) {
  fs.writeFileSync(path.join(dir, 'hours.json'), text);
  execFileSync('node', ['scripts/apply-hours.js'], { cwd: dir, stdio: 'pipe' });
}
