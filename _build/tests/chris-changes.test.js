// Guards for Chris Vaughn's change list (email 13 Nov 2026) and the footer email sign-up.  Run:  node --test _build/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subscribe, { looksLikeEmail } from '../../api/subscribe.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pages = fs.readdirSync(ROOT).filter((f) => /^[a-z-]+\.(html|md)$/.test(f) && f !== 'edit-hours.html');
const sources = ['_build/build.py', 'assets/site.js', ...fs.readdirSync(path.join(ROOT, '_build/pages')).map((p) => '_build/pages/' + p)];
const visible = (html) => html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');

test('Happy Hour, not Après — everywhere we publish', () => {
  for (const f of [...pages, ...sources]) assert.ok(!/apr[eè]s/i.test(read(f)), `${f} still says Après`);
});

test('30A Beach Bites, not 30A Grub to Go', () => {
  for (const f of [...pages, ...sources]) assert.ok(!/grub to go/i.test(read(f)), `${f} still says Grub to Go`);
  for (const f of ['faq.html', 'visit.html', 'index.html']) assert.ok(read(f).includes('30A Beach Bites'), f);
});

test('no 5-day rule for 50+ catering', () => {
  for (const f of ['catering.html', 'catering.md', 'assets/site.js', '_build/pages/catering.html']) {
    assert.ok(!/5 days|five days/i.test(read(f)), `${f} still has the 5-day rule`);
  }
});

test('sausage and pulled chicken are in the home page list of meats', () => {
  assert.match(read('index.html'), /Brisket, pulled pork, ribs, turkey, sausage and pulled chicken, smoked/);
});

test('2024 and 2026 Best of the Emerald Coast, with the 2026 seal', () => {
  const t = read('index.html');
  assert.ok(t.includes('/assets/img/best-of-ec-2026.png') && t.includes('/assets/img/best-of-ec-2026.webp'));
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/img/best-of-ec-2026.png')));
  assert.ok(t.includes('2024 &amp; 2026'));
  for (const f of pages.filter((p) => p.endsWith('.html'))) {
    assert.ok(read(f).includes('2024 &amp; 2026 Best of the Emerald Coast'), `${f} footer`);
    // Rule 115 (26 Nov 2026): the full Restaurant node (with its awards) prints only on / and /visit.
    if (['index.html', 'visit.html'].includes(f)) assert.ok(read(f).includes('"2026 Best of the Emerald Coast — Emerald Coast Magazine"'), `${f} schema`);
  }
});

test('"Mile Marker 1" always sits in a no-wrap span in visible text', () => {
  for (const f of pages.filter((p) => p.endsWith('.html'))) {
    const body = visible(read(f));
    const text = body.replace(/<[^>]+>/g, (tag) => tag.replace(/Mile Marker 1/g, '')); // attributes do not count
    const bare = text.split('<span class="nw">Mile Marker 1</span>').join('');
    assert.ok(!/>[^<]*Mile Marker 1/.test(bare), `${f} has a "Mile Marker 1" that can break`);
  }
});

test('footer sign reads MILE 1, and every page has the email sign-up', () => {
  for (const f of pages.filter((p) => p.endsWith('.html'))) {
    const t = read(f);
    assert.ok(t.includes('<span class="dest__sign" aria-hidden="true"><span>Mile<b>1</b></span></span>'), f);
    assert.ok(t.includes('id="signup" action="/api/subscribe"') && t.includes('id="signup-email"'), f);
  }
});

// ---- /api/subscribe ----
function call({ method = 'POST', headers = { 'x-signup': '1', host: 'x.test' }, body, url = '/api/subscribe', env = {}, fetch } = {}) {
  return new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { resolve({ status: this.statusCode, body: JSON.parse(s) }); } };
    subscribe({ method, headers, body, url }, res, { env, fetch });
  });
}
const KEY = { RESEND_API_KEY: 're_test' };

test('subscribe: checks the email address', () => {
  assert.ok(looksLikeEmail('a@b.co'));
  for (const bad of ['', 'a@b', 'a b@c.com', 'a@b.c', '<x>@y.com', 'a@b.com\nBcc: x@y.com']) assert.ok(!looksLikeEmail(bad), bad);
});

test('subscribe: sends one email to the restaurant, reply-to the visitor', async () => {
  const sent = [];
  const fake = async (u, o) => { sent.push({ u, o, b: JSON.parse(o.body) }); return { ok: true, status: 200, text: async () => '' }; };
  const r = await call({ body: { email: 'guest@example.com', website: '', page: '/' }, env: KEY, fetch: fake });
  assert.deepEqual(r, { status: 200, body: { ok: true } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].u, 'https://api.resend.com/emails');
  assert.deepEqual(sent[0].b.to, ['brisket@3sonsbarbq.com']);
  assert.equal(sent[0].b.reply_to, 'guest@example.com');
  assert.match(sent[0].b.from, /@contact\.aisyndicate\.com>$/);
});

test('subscribe: never says ok when it could not send', async () => {
  assert.equal((await call({ body: { email: 'guest@example.com' } })).status, 503); // no key
  const down = async () => ({ ok: false, status: 403, text: async () => 'domain not verified' });
  assert.deepEqual(await call({ body: { email: 'guest@example.com' }, env: KEY, fetch: down }), { status: 502, body: { error: 'send' } });
  const boom = async () => { throw new Error('network'); };
  assert.equal((await call({ body: { email: 'guest@example.com' }, env: KEY, fetch: boom })).status, 502);
});

test('subscribe: blocks other sites, bad emails and bots', async () => {
  let calls = 0; const fake = async () => { calls++; return { ok: true, status: 200, text: async () => '' }; };
  assert.equal((await call({ headers: { host: 'x.test' }, body: { email: 'a@b.co' }, env: KEY, fetch: fake })).status, 403);
  assert.equal((await call({ headers: { 'x-signup': '1', host: 'x.test', origin: 'https://evil.test' }, body: { email: 'a@b.co' }, env: KEY, fetch: fake })).status, 403);
  assert.deepEqual(await call({ body: { email: 'nope' }, env: KEY, fetch: fake }), { status: 400, body: { error: 'email' } });
  assert.deepEqual(await call({ body: { email: 'a@b.co', website: 'spam' }, env: KEY, fetch: fake }), { status: 200, body: { ok: true } });
  assert.equal((await call({ method: 'GET', env: KEY })).status, 405);
  assert.equal(calls, 0);
});

test('subscribe: diag says whether it is set up, never shows the key', async () => {
  const r = await call({ method: 'GET', url: '/api/subscribe?diag=1', env: KEY });
  assert.equal(r.status, 200);
  assert.equal(r.body.keySet, true);
  assert.ok(!JSON.stringify(r.body).includes('re_test'));
});
