// Tests for the /api functions against a fake GitHub.  Run:  node --test _build/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockGitHub, devServer, siteCopy } from './harness.js';
import { makeToken } from '../../api/_lib/auth.js';
import hoursHandler from '../../api/hours.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PASSWORD = 'smoky-brisket-pit-2731';
const SECRET = 'x'.repeat(48);
const TOKEN = 'ghp_test_token';
const initial = fs.readFileSync(path.join(ROOT, 'hours.json'), 'utf8');

let gh, srv, dir;
const env = () => Object.assign(process.env, {
  EDITOR_PASSWORD: PASSWORD, EDITOR_SECRET: SECRET, GITHUB_TOKEN: TOKEN, GITHUB_API_URL: gh.url,
});

test.before(async () => {
  gh = await mockGitHub({ token: TOKEN, initial }).listen();
  dir = siteCopy(ROOT);
  srv = await devServer(dir).listen();
  env();
});
test.after(async () => { await gh.close(); await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const H = { 'X-Hours-Editor': '1', 'Content-Type': 'application/json' };
const call = (p, { method = 'GET', headers = {}, body, cookie } = {}) =>
  fetch(srv.url + p, { method, headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) }, body, redirect: 'manual' });

async function login(remember = true) {
  const r = await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: PASSWORD, remember }) });
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

test('not set up yet: everything says so and nothing breaks', async () => {
  delete process.env.EDITOR_SECRET;
  assert.equal((await call('/api/hours')).status, 503);
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: H, body: '{"password":"x"}' })).status, 503);
  assert.equal((await call('/api/hours-history')).status, 503);
  process.env.EDITOR_SECRET = 'short';
  assert.equal((await call('/api/hours')).status, 503, 'a short secret is refused');
  env();
  delete process.env.GITHUB_TOKEN;
  const c = await login();
  assert.equal((await call('/api/hours', { cookie: c })).status, 503);
  env();
});

test('sign in: wrong password, missing header, other website, wrong method', async () => {
  const t0 = Date.now();
  const bad = await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: 'brisket' }) });
  assert.equal(bad.status, 401);
  assert.ok(Date.now() - t0 >= 850, 'wrong password is slowed down');
  assert.equal(bad.headers.get('set-cookie'), null);
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) })).status, 403);
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: { ...H, Origin: 'https://evil.example' }, body: JSON.stringify({ password: PASSWORD }) })).status, 403);
  assert.equal((await call('/api/editor-login')).status, 405);
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: H, body: '{not json' })).status, 400);
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: '' }) })).status, 401);
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: ['x'] }) })).status, 401);
});

test('sign in: cookie is locked down; "keep me signed in" lasts 90 days, otherwise ends with the browser', async () => {
  const r = await call('/api/editor-login', { method: 'POST', headers: { ...H, Origin: srv.url }, body: JSON.stringify({ password: PASSWORD, remember: true }) });
  assert.equal(r.status, 200);
  const sc = r.headers.get('set-cookie');
  for (const part of ['hours_session=v1.', 'Path=/api', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=7776000']) assert.ok(sc.includes(part), part);
  const r2 = await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: PASSWORD, remember: false }) });
  assert.ok(!r2.headers.get('set-cookie').includes('Max-Age'));
  const out = await call('/api/editor-logout', { method: 'POST', headers: H, body: '{}' });
  assert.ok(out.headers.get('set-cookie').includes('Max-Age=0'));
});

test('reading hours needs a valid, unexpired, untampered session', async () => {
  assert.equal((await call('/api/hours')).status, 401);
  const c = await login();
  const ok = await call('/api/hours', { cookie: c });
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.hours.week.mon.from, '11:00');
  assert.match(j.sha, /^[0-9a-f]{40}$/);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const tampered = c.slice(0, -2) + (c.endsWith('AA') ? 'BB' : 'AA');
  assert.equal((await call('/api/hours', { cookie: tampered })).status, 401);
  const old = makeToken({ secret: SECRET, password: PASSWORD }, true, Date.now() - 91 * 864e5).token;
  assert.equal((await call('/api/hours', { cookie: `hours_session=${old}` })).status, 401, 'expired');
  const forged = makeToken({ secret: 'y'.repeat(48), password: PASSWORD }, true).token;
  assert.equal((await call('/api/hours', { cookie: `hours_session=${forged}` })).status, 401, 'signed with another secret');
  process.env.EDITOR_PASSWORD = 'a-brand-new-password';
  assert.equal((await call('/api/hours', { cookie: c })).status, 401, 'changing the password signs everyone out');
  env();
  assert.equal((await call('/api/hours', { cookie: 'hours_session=v1.9999999999999.' + 'a'.repeat(43) })).status, 401);
  assert.equal((await call('/api/hours', { method: 'DELETE', cookie: c })).status, 405);
});

test('saving: checks, CSRF guard, version conflicts, and a real commit', async () => {
  const c = await login();
  const { hours, sha } = await (await call('/api/hours', { cookie: c })).json();
  const put = (body, headers = H) => call('/api/hours', { method: 'PUT', headers, cookie: c, body: JSON.stringify(body) });

  assert.equal((await put({ hours, sha }, { 'Content-Type': 'application/json' })).status, 403, 'no custom header');
  assert.equal((await put({ hours, sha }, { ...H, Origin: 'https://evil.example' })).status, 403, 'other website');
  assert.equal((await put({ hours, sha: 'nope' })).status, 400);
  assert.equal((await put({ hours })).status, 400);

  const broken = JSON.parse(JSON.stringify(hours));
  broken.week.fri.to = '10:00';
  const b = await put({ hours: broken, sha });
  assert.equal(b.status, 400);
  const bj = await b.json();
  assert.equal(bj.error, 'invalid');
  assert.equal(bj.errors[0].field, 'week.fri.to');

  const next = JSON.parse(JSON.stringify(hours));
  next.week.fri.to = '21:00';
  next.week.sat.to = '21:00';
  next.special.push({ date: '2020-01-01', closed: true, label: 'long gone' }, { date: '2026-12-24', closed: false, from: '11:00', to: '15:00', label: 'Christmas Eve' });
  next.note = '<b>Summer</b> hours start May 1';
  next.rev = 'client-tried-to-set-this';
  const before = gh.commits.length;
  const s = await put({ hours: next, sha });
  assert.equal(s.status, 200);
  const sj = await s.json();
  assert.equal(gh.commits.length, before + 1);
  const saved = JSON.parse(gh.current().text);
  assert.equal(saved.week.fri.to, '21:00');
  assert.equal(saved.note, '<b>Summer</b> hours start May 1', 'kept as typed (every page escapes it)');
  assert.deepEqual(saved.special.map((x) => x.date), ['2026-11-26', '2026-12-24', '2026-12-25']);
  assert.notEqual(saved.rev, 'client-tried-to-set-this');
  assert.match(saved.rev, /^\d{4}-\d\d-\d\dT.*-[0-9a-f]{6}$/);
  assert.equal(sj.hours.rev, saved.rev);
  assert.equal(gh.current().message, 'Hours updated from the website editor (/edit-hours)');
  assert.ok(gh.current().text.endsWith('\n'));

  const stale = await put({ hours: next, sha });
  assert.equal(stale.status, 409, 'saving from an old version is refused');
  const again = await put({ hours: next, sha: sj.sha });
  assert.equal(again.status, 200, 'saving from the new version works');
});

test('history: newest first, with the hours of each version', async () => {
  const c = await login();
  const r = await call('/api/hours-history', { cookie: c });
  assert.equal(r.status, 200);
  const { versions } = await r.json();
  assert.ok(versions.length >= 3);
  assert.ok(versions.length <= 6);
  assert.equal(versions[0].commit, gh.current().sha);
  assert.equal(versions.at(-1).hours.week.mon.to, versions.at(-1).hours.week.mon.to);
  assert.ok(Date.parse(versions[0].date) >= Date.parse(versions[1].date));
  assert.equal((await call('/api/hours-history')).status, 401);
});

test('GitHub trouble: down, or the token stopped working → a clear error, nothing half-saved', async () => {
  const c = await login();
  const { hours, sha } = await (await call('/api/hours', { cookie: c })).json();
  gh.mode = 'down';
  assert.equal((await call('/api/hours', { cookie: c })).status, 502);
  const p = await call('/api/hours', { method: 'PUT', headers: H, cookie: c, body: JSON.stringify({ hours, sha }) });
  assert.equal(p.status, 502);
  assert.deepEqual(await p.json(), { error: 'github' }, 'no GitHub details leak to the browser, just which side failed');
  assert.equal((await call('/api/hours-history', { cookie: c })).status, 502);
  gh.mode = 'ok';
  process.env.GITHUB_TOKEN = 'expired';
  assert.equal((await call('/api/hours', { cookie: c })).status, 502);
  env();
});

test('preview deployments can never change the live hours', async () => {
  process.env.VERCEL_ENV = 'preview';
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: PASSWORD }) })).status, 503);
  process.env.VERCEL_ENV = 'production';
  const c = await login();
  assert.equal((await call('/api/hours', { cookie: c })).status, 200);
  delete process.env.VERCEL_ENV;
});

test('a short password is refused as "not set up" (16+ letters required)', async () => {
  process.env.EDITOR_PASSWORD = 'brisket1';
  assert.equal((await call('/api/editor-login', { method: 'POST', headers: H, body: JSON.stringify({ password: 'brisket1' }) })).status, 503);
  env();
});

test('a garbled cookie is just "signed out", not a crash', async () => {
  assert.equal((await call('/api/hours', { cookie: 'hours_session=%E0%A4' })).status, 401);
  assert.equal((await call('/api/hours-history', { cookie: 'hours_session=%' })).status, 401);
});

test('a GitHub refusal that is not a version clash is not reported as "someone else saved"', async () => {
  const c = await login();
  const { hours, sha } = await (await call('/api/hours', { cookie: c })).json();
  gh.mode = 'ruleset';
  const r = await call('/api/hours', { method: 'PUT', headers: H, cookie: c, body: JSON.stringify({ hours, sha }) });
  gh.mode = 'ok';
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'github' });
});

test('a huge request is refused', async () => {
  const c = await login();
  const r = await call('/api/hours', { method: 'PUT', headers: H, cookie: c, body: JSON.stringify({ pad: 'x'.repeat(40000) }) });
  assert.equal(r.status, 413);
});

test('works when Vercel has already read the body (req.body is set)', async () => {
  const c = await login();
  const { hours, sha } = await (await call('/api/hours', { cookie: c })).json();
  const hrs = JSON.parse(JSON.stringify(hours));
  hrs.note = 'Vercel-style body';
  const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
  await hoursHandler({ method: 'PUT', headers: { cookie: c, 'x-hours-editor': '1', host: 'example.com' }, body: { hours: hrs, sha } }, res);
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(JSON.parse(gh.current().text).note, 'Vercel-style body');
  const res2 = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b) { this.body = b; } };
  await hoursHandler({ method: 'PUT', headers: { cookie: c, 'x-hours-editor': '1', host: 'example.com' }, body: '{"broken' }, res2);
  assert.equal(res2.statusCode, 400);
});

test('the editor page is served with its security headers; source code is not public', async () => {
  const r = await call('/edit-hours');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
  for (const p of ['/api/_lib/auth.js', '/scripts/apply-hours.js', '/package.json', '/vercel.json', '/_build/build.py']) {
    assert.equal((await call(p)).status, 404, p);
  }
  assert.equal((await call('/hours.json')).status, 200);
});
