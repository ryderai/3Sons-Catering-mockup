// Go-live guards for 3sonsbarbq.com (26 Nov 2026).  Run:  node --test _build/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devServer, siteCopy } from './harness.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = ['index', 'menu', 'catering', 'happy-hour', 'visit', 'faq', 'terms', 'accessibility'];
const SITE = 'https://3sonsbarbq.com';
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (html) => ld(html).flatMap((b) => b['@graph'] || [b]);

let srv, dir;
test.before(async () => { dir = siteCopy(ROOT); srv = await devServer(dir).listen(); });
test.after(async () => { await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });
import http from 'node:http';
// fetch() won't let us set Host, so use http.request (status, headers, text()).
const get = (p, host) => new Promise((resolve, reject) => {
  const u = new URL(srv.url);
  const req = http.request({ host: u.hostname, port: u.port, path: p, headers: host ? { Host: host } : {} }, (res) => {
    let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode,
      headers: { get: (k) => res.headers[k.toLowerCase()] ?? null }, text: async () => b }));
  });
  req.on('error', reject); req.end();
});

test('every page points at the real domain: canonical, og:url, og:image, schema', () => {
  for (const p of PAGES) {
    const h = read(p + '.html');
    const url = SITE + (p === 'index' ? '/' : '/' + p);
    assert.ok(h.includes(`<link rel="canonical" href="${url}">`), p + ' canonical');
    assert.ok(h.includes(`<meta property="og:url" content="${url}">`), p + ' og:url');
    assert.match(h, /<meta property="og:image" content="https:\/\/3sonsbarbq\.com\/assets\/img\/og-[a-z-]+\.jpg">/, p);
    assert.ok(!/vercel\.app|website-files\.com|googleusercontent\.com/.test(h), p + ' still links a preview host or a hotlinked image');
    assert.ok(!/noindex/.test(h), p + ' has a noindex meta');
    assert.match(h, /<meta name="robots" content="index, follow/, p);
  }
});

test('no hotlinked images left anywhere we publish', () => {
  for (const f of ['assets/site.css', 'edit-hours.html', 'vercel.json', 'llms.txt', 'llms-full.txt', 'agents.md'])
    assert.ok(!/website-files\.com|googleusercontent\.com/.test(read(f)), f);
});

test('every local image a page uses is listed for download or already in the repo', () => {
  const listed = new Set(read('_build/image-sources.txt').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(' ')[0]));
  for (const p of PAGES) {
    const h = read(p + '.html');
    for (const [, src] of h.matchAll(/(?:src|srcset|href)="\/(assets\/img\/[^"?\s]+)"|url\('\/(assets\/img\/[^')]+)'\)/g).map((m) => [m[0], m[1] || m[2]])) {
      assert.ok(listed.has(src) || fs.existsSync(path.join(ROOT, src)), `${p}: ${src} is neither in the repo nor in image-sources.txt`);
    }
  }
});

test('rule 115: one Restaurant entity, FAQPage only on /faq, no AI Syndicate attribution', () => {
  for (const p of PAGES) {
    const h = read(p + '.html');
    const n = nodes(h);
    const r = n.filter((x) => x['@type'] === 'Restaurant');
    assert.ok(r.length <= 1, p + ' has 2 Restaurant nodes');
    for (const x of r) assert.equal(x['@id'], SITE + '/#restaurant', p);
    if (['index', 'visit'].includes(p)) assert.equal(r.length, 1, p + ' should carry the full Restaurant node');
    else assert.equal(r.length, 0, p + ' should only reference the Restaurant by @id');
    assert.equal(n.some((x) => x['@type'] === 'FAQPage'), p === 'faq', p + ' FAQPage scope');
    assert.ok(!n.some((x) => ['Organization', 'LocalBusiness', 'Service', 'SpeakableSpecification'].includes(x['@type'])), p + ' extra entity');
    assert.ok(!/AI Syndicate|aisyndicate/i.test(h), p + ' mentions AI Syndicate');
    assert.ok(!/Design preview|Photo coming/.test(h), p + ' still shows a preview note');
  }
  const faq = nodes(read('faq.html')).find((x) => x['@type'] === 'FAQPage');
  const visible = read('faq.html');
  for (const q of faq.mainEntity) assert.ok(visible.includes(q.name.replace(/&/g, '&amp;')) || visible.includes(q.name), 'FAQ question not visible: ' + q.name);
});

test('preview hosts stay hidden from Google; the real domain is indexable', async () => {
  for (const p of ['/', '/menu', '/faq', '/llms.txt']) {
    assert.equal((await get(p, '3sons-catering-mockup.vercel.app')).headers.get('x-robots-tag'), 'noindex, nofollow', 'preview ' + p);
    const live = await get(p, '3sonsbarbq.com');
    assert.equal(live.status, 200, p);
    assert.equal(live.headers.get('x-robots-tag'), null, 'live ' + p);
  }
  assert.equal((await get('/edit-hours', '3sonsbarbq.com')).headers.get('x-robots-tag'), 'noindex, nofollow', 'editor stays hidden on the real domain');
});

test('old Webflow URLs land on a real page', async () => {
  const map = { '/policies': '/terms', '/checkout': '/catering', '/paypal-checkout': '/catering', '/order-confirmation': '/catering', '/product/brisket-box': '/catering' };
  for (const [from, to] of Object.entries(map)) {
    const r = await get(from, '3sonsbarbq.com');
    assert.equal(r.status, 308, from);
    assert.equal(r.headers.get('location'), to, from);
  }
  for (const p of ['/', '/faq', '/catering']) assert.equal((await get(p, '3sonsbarbq.com')).status, 200, p);
});

test('crawler files: robots, sitemap, llms, agents', async () => {
  const robots = await (await get('/robots.txt', '3sonsbarbq.com')).text();
  assert.match(robots, /Allow: \//); assert.ok(!/Disallow: \/\s*$/m.test(robots)); assert.match(robots, /Sitemap: https:\/\/3sonsbarbq\.com\/sitemap\.xml/);
  const sm = await (await get('/sitemap.xml', '3sonsbarbq.com')).text();
  assert.equal((sm.match(/<loc>/g) || []).length, 8); assert.ok(!sm.includes('edit-hours'));
  for (const f of ['/llms.txt', '/llms-full.txt', '/agents.md']) {
    const r = await get(f, '3sonsbarbq.com'); assert.equal(r.status, 200, f);
    const t = await r.text(); assert.ok(t.includes('6931 W County Hwy 30A'), f);
    assert.ok(!/<!--h:\w+--><!--\/h-->/.test(t), f + ' has an empty hours marker');
    assert.ok(!/deliver(y|ed|s)? (your )?catering|catering delivery/i.test(t.split('\n').filter((l) => !/never|not catering|pickup only/i.test(l)).join('\n')), f + ' promises catering delivery');
  }
});
