// Unit tests for assets/hours-core.js and the build step.  Run:  node --test _build/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as H from '../../assets/hours-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIG = process.env.ORIG_DIR; // optional: the site as it was before the hours editor (af36eee)
const TODAY = '2026-10-27';
const base = () => H.defaultHours();
const withWeek = (fn) => { const h = base(); fn(h.week); return h; };

test('times: formatting in the site style', () => {
  assert.equal(H.fmtTime('11:00'), '11a');
  assert.equal(H.fmtTime('20:00'), '8p');
  assert.equal(H.fmtTime('11:30'), '11:30a');
  assert.equal(H.fmtTime('12:00'), '12p');
  assert.equal(H.fmtTime('12:30'), '12:30p');
  assert.equal(H.fmtTime('23:30'), '11:30p');
  assert.equal(H.fmtTime('05:00'), '5a');
  assert.equal(H.fmtTimeLong('20:00'), '8:00 PM');
  assert.equal(H.fmtTimeLong('12:00'), '12:00 PM (noon)');
  assert.equal(H.fmtTimeLong('05:30'), '5:30 AM');
  assert.equal(H.fmtRange('11:00', '20:00'), '11a–8p');
});

test('times: only 30-minute steps from 5a to 11:30p are allowed', () => {
  const opts = H.timeOptions();
  assert.equal(opts.length, 38);
  assert.equal(opts[0], '05:00');
  assert.equal(opts.at(-1), '23:30');
  for (const ok of ['05:00', '11:00', '11:30', '20:00', '23:30']) assert.ok(H.isTime(ok), ok);
  for (const bad of ['04:30', '24:00', '23:45', '11:15', '1100', '11:00 ', '', null, 1100, '9:00', '00:00']) assert.ok(!H.isTime(bad), String(bad));
});

test('dates: day of week, adding days, formatting', () => {
  assert.equal(H.dayOf('2026-10-27'), 'tue');
  assert.equal(H.dayOf('2026-11-26'), 'thu');
  assert.equal(H.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(H.addDays('2026-11-01', 1), '2026-11-02'); // DST change day
  assert.equal(H.fmtDate('2026-11-26', TODAY), 'Thu, Nov 26');
  assert.equal(H.fmtDate('2027-01-01', TODAY), 'Fri, Jan 1, 2027');
  assert.ok(H.isISODate('2028-02-29'));
  assert.ok(!H.isISODate('2027-02-29'));
  assert.ok(!H.isISODate('2026-13-01'));
  assert.ok(!H.isISODate('26-11-01'));
});

test('todayISO uses Central time, not UTC', () => {
  // 11:30 PM Central on Oct 27 is already Oct 28 in UTC
  assert.equal(H.todayISO(new Date('2026-10-28T04:30:00Z')), '2026-10-27');
  assert.equal(H.todayISO(new Date('2026-10-28T05:30:00Z')), '2026-10-28');
});

test('words: same hours every day (today’s real hours)', () => {
  const w = H.words(base());
  assert.deepEqual(w, { summary: 'Every day, 11a–8p', stat: '11a–8p', statLabel: 'Open every day',
                        sentence: 'We’re open 11a–8p daily.', hhOpen: 'Open 11a–8p daily' });
});

test('words: closed one day, same hours otherwise', () => {
  const w = H.words(withWeek((wk) => { wk.mon.open = false; }));
  assert.equal(w.summary, 'Tue–Sun, 11a–8p · Closed Mon');
  assert.equal(w.statLabel, 'Open Tue–Sun');
  assert.equal(w.sentence, 'We’re open Tue–Sun, 11a–8p, and closed Mon.');
});

test('words: different hours on the weekend', () => {
  const w = H.words(withWeek((wk) => { wk.fri.to = '21:00'; wk.sat.to = '21:00'; }));
  assert.equal(w.summary, 'Mon–Thu 11a–8p · Fri & Sat 11a–9p · Sun 11a–8p');
  assert.equal(w.stat, '11a–9p');
  assert.equal(w.statLabel, 'Open every day · hours vary');
  assert.equal(w.sentence, 'We’re open Mon–Thu 11a–8p, Fri & Sat 11a–9p and Sun 11a–8p.');
});

test('words: scattered closed days and an all-closed week', () => {
  const h = withWeek((wk) => { wk.mon.open = false; wk.tue.open = false; wk.thu.open = false; wk.sun.from = '12:00'; });
  assert.equal(H.words(h).summary, 'Mon & Tue closed · Wed 11a–8p · Thu closed · Fri & Sat 11a–8p · Sun 12p–8p');
  assert.match(H.words(h).sentence, /and closed Mon & Tue, Thu\.$/);
  const shut = withWeek((wk) => { for (const d of H.DAYS) wk[d].open = false; });
  assert.equal(H.words(shut).stat, 'Closed');
});

test('validate: the real starting hours pass', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'hours.json'), 'utf8'));
  const r = H.validate(raw, { today: TODAY });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.value.special.length, 2);
});

test('validate: catches every kind of mistake', () => {
  const cases = [
    [null, 'hours'],
    ['nope', 'hours'],
    [{ ...base(), week: { ...base().week, wed: undefined } }, 'week.wed'],
    [withWeek((w) => { w.fri.to = '10:00'; }), 'week.fri.to'],
    [withWeek((w) => { w.fri.to = w.fri.from; }), 'week.fri.to'],
    [withWeek((w) => { w.sat.from = '11:15'; }), 'week.sat.from'],
    [withWeek((w) => { w.sat.to = '24:00'; }), 'week.sat.to'],
    [{ ...base(), special: [{ date: '2026-02-30', closed: true }] }, 'special.0.date'],
    [{ ...base(), special: [{ date: '2026-11-26', closed: true }, { date: '2026-11-26', closed: true }] }, 'special.1.date'],
    [{ ...base(), special: [{ date: '2029-01-01', closed: true }] }, 'special.0.date'],
    [{ ...base(), special: [{ date: '2026-12-24', closed: false, from: '15:00', to: '11:00' }] }, 'special.0.to'],
    [{ ...base(), special: [{ date: '2026-12-24', closed: false }] }, 'special.0.from'],
    [{ ...base(), special: 'x' }, 'special'],
    [{ ...base(), holidayLine: 'x'.repeat(121) }, 'holidayLine'],
    [{ ...base(), note: 'x'.repeat(161) }, 'note'],
    [{ ...base(), note: 42 }, 'note'],
  ];
  for (const [input, field] of cases) {
    const r = H.validate(input, { today: TODAY });
    assert.ok(!r.ok, `should fail: ${field}`);
    assert.ok(r.errors.some((e) => e.field === field), `${field} not in ${JSON.stringify(r.errors)}`);
  }
});

test('validate: drops past special days, sorts, cleans text, keeps closed-day times', () => {
  const h = base();
  h.week.mon = { open: false, from: 'junk', to: 'junk' };
  h.special = [
    { date: '2026-12-25', label: 'Christmas <script>alert(1)</script>', closed: true },
    { date: '2026-10-01', label: 'Old', closed: true },
    { date: '2026-11-26', label: '  Thanksgiving  ', closed: true },
    { date: '2026-12-24', label: 'Christmas Eve', closed: false, from: '11:00', to: '15:00', extra: 'ignored' },
  ];
  h.holidayLine = 'Closed\nThanksgiving & Christmas\u0007 Day';
  const r = H.validate(h, { today: TODAY });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.value.special.map((s) => s.date), ['2026-11-26', '2026-12-24', '2026-12-25']);
  assert.equal(r.value.special[0].label, 'Thanksgiving');
  assert.equal(r.value.special[2].label, 'Christmas <script>alert(1)</script>', 'typed text is kept as typed…');
  const out = H.applyToHtml(fs.readFileSync(path.join(ROOT, 'visit.html'), 'utf8'), r.value, TODAY);
  assert.ok(!out.includes('<script>alert'), '…and can never run as code on the page');
  assert.ok(out.includes('Christmas &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(out.includes('Christmas \\u003cscript>alert(1)\\u003c/script>'), 'escaped inside the hidden schema too');
  assert.equal(r.value.special[1].extra, undefined);
  assert.equal(r.value.holidayLine, 'Closed Thanksgiving & Christmas Day');
  assert.deepEqual(r.value.week.mon, { open: false, from: '11:00', to: '20:00' });
  // a special day that is today still counts
  assert.ok(H.validate({ ...base(), special: [{ date: TODAY, closed: true }] }, { today: TODAY }).value.special.length === 1);
});

test('status: open now / opens later / holidays / Central time across the DST change', () => {
  const h = base();
  h.special = [{ date: '2026-11-26', label: 'Thanksgiving', closed: true },
               { date: '2026-12-24', label: 'Christmas Eve', closed: false, from: '11:00', to: '15:00' }];
  const at = (iso) => H.status(h, new Date(iso)).text;
  assert.equal(at('2026-10-27T17:00:00Z'), 'Open now · until 8p');                    // noon CDT
  assert.equal(at('2026-10-27T15:00:00Z'), 'Closed now · opens today at 11a');        // 10a CDT
  assert.equal(at('2026-10-27T16:00:00Z'), 'Open now · until 8p');                    // 11:00 sharp
  assert.equal(at('2026-10-28T01:00:00Z'), 'Closed now · opens tomorrow at 11a');     // 8:00p sharp = closed
  assert.equal(at('2026-10-28T00:59:00Z'), 'Open now · until 8p');                    // 7:59p
  assert.equal(at('2026-10-28T05:00:00Z'), 'Closed now · opens today at 11a');        // midnight
  assert.equal(at('2026-11-26T17:00:00Z'), 'Closed today for Thanksgiving · opens tomorrow at 11a');
  assert.equal(at('2026-11-26T03:00:00Z'), 'Closed now · opens Friday at 11a');       // Wed 9p CST, Thu closed
  assert.equal(at('2026-12-24T20:00:00Z'), 'Open now · until 3p');                     // 2p CST
  assert.equal(at('2026-12-24T21:30:00Z'), 'Closed now · opens tomorrow at 11a');     // after 3p special close
  assert.equal(at('2026-11-01T16:30:00Z'), 'Closed now · opens today at 11a');        // 10:30a CST (DST ended)
  assert.equal(at('2026-11-01T17:30:00Z'), 'Open now · until 8p');                    // 11:30a CST
  const shut = withWeek((wk) => { for (const d of H.DAYS) wk[d].open = false; });
  assert.equal(H.status(shut, new Date('2026-10-27T17:00:00Z')).text, 'Closed now · please call for hours');
  const noLabel = { ...base(), special: [{ date: '2026-10-27', label: '', closed: true }] };
  assert.equal(H.status(noLabel, new Date('2026-10-27T17:00:00Z')).text, 'Closed today · opens tomorrow at 11a');
});

test('schema: weekly hours grouped, special days in Google’s format', () => {
  const h = withWeek((wk) => { wk.fri.to = '21:00'; wk.sat.to = '21:00'; wk.mon.open = false; });
  assert.deepEqual(H.schemaWeek(h), [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday', 'Wednesday', 'Thursday', 'Sunday'], opens: '11:00', closes: '20:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Friday', 'Saturday'], opens: '11:00', closes: '21:00' },
  ]);
  h.special = [{ date: '2026-10-01', closed: true, label: 'old' }, { date: '2026-11-26', closed: true, label: 'Thanksgiving' },
               { date: '2026-12-24', closed: false, from: '11:00', to: '15:00', label: '' }];
  assert.deepEqual(H.schemaSpecial(h, TODAY), [
    { '@type': 'OpeningHoursSpecification', name: 'Thanksgiving', validFrom: '2026-11-26', validThrough: '2026-11-26', opens: '00:00', closes: '00:00' },
    { '@type': 'OpeningHoursSpecification', validFrom: '2026-12-24', validThrough: '2026-12-24', opens: '11:00', closes: '15:00' },
  ]);
});

test('ldJson never lets text close the <script> tag', () => {
  const s = H.ldJson({ name: '</script><script>alert(1)</script>' });
  assert.ok(!s.includes('</script'));
  assert.equal(JSON.parse(s).name, '</script><script>alert(1)</script>');
});

test('markers: unknown markers stop the build', () => {
  assert.throws(() => H.fillMarkers('<!--h:nope--><!--/h-->', {}), /Unknown hours marker/);
});

// ---------- the built pages ----------
const pages = fs.readdirSync(ROOT).filter((f) => /\.(html|md)$/.test(f) && f !== 'README.md');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
}

test('built pages: applying the same hours twice changes nothing (safe to re-run)', () => {
  const h = H.validate(JSON.parse(read('hours.json')), { today: TODAY }).value;
  for (const f of pages) {
    const t = read(f);
    const once = f.endsWith('.html') ? H.applyToHtml(t, h, TODAY) : H.applyToMd(t, h, TODAY);
    const twice = f.endsWith('.html') ? H.applyToHtml(once, h, TODAY) : H.applyToMd(once, h, TODAY);
    assert.equal(twice, once, f);
  }
});

test('built pages: new hours reach every page, the hidden schema and the .md copies', () => {
  const h = withWeek((wk) => { for (const d of H.DAYS) { wk[d].from = '10:30'; wk[d].to = '21:00'; } wk.tue.open = false; });
  h.special = [{ date: '2026-12-31', label: 'New Year’s Eve & party', closed: false, from: '10:30', to: '16:00' }];
  h.holidayLine = 'Closed Thanksgiving, Christmas & "New Year’s" Day';
  h.note = 'Summer hours start May 1';
  const found = {};
  for (const f of pages.filter((p) => p.includes('.'))) {
    const t = read(f);
    const out = f.endsWith('.html') ? H.applyToHtml(t, h, TODAY) : H.applyToMd(t, h, TODAY);
    const hoursBits = [...out.matchAll(/<!--h:(\w+)-->([\s\S]*?)<!--\/h-->/g)];
    for (const [, k, v] of hoursBits) {
      found[k] = true;
      assert.ok(!/11a–8p/.test(v), `${f} ${k} still shows the old hours: ${v}`);
    }
    if (f.endsWith('.html')) {
      for (const block of ldBlocks(out)) {
        const nodes = block['@graph'] || [block];
        for (const n of nodes) {
          if (n['@type'] === 'Restaurant') {
            assert.deepEqual(n.openingHoursSpecification, H.schemaWeek(h), f);
            assert.equal(n.specialOpeningHoursSpecification[0].closes, '16:00', f);
          }
          if (n['@type'] === 'FAQPage') {
            const hh = n.mainEntity.find((q) => q.name === 'When is happy hour?');
            assert.equal(hh.acceptedAnswer.text, 'Après runs 2p–5p every day at our full-service bar. We’re open Mon, Wed–Sun, 10:30a–9p, and closed Tue.');
          }
        }
      }
      assert.ok(!out.includes('"New Year’s"'), `${f}: quotes must be escaped in HTML`);
      if (out.includes('Closed Thanksgiving, Christmas')) assert.ok(out.includes('Christmas &amp; &quot;New Year’s&quot; Day'), f);
    }
  }
  for (const k of ['summary', 'stat', 'statLabel', 'holiday', 'noteSep', 'faqHoliday', 'holidayFull', 'specialRow', 'specialMd', 'sentence', 'hhOpen', 'holidayP']) {
    assert.ok(found[k], `marker ${k} is not on any page`);
  }
  const visit = H.applyToHtml(read('visit.html'), h, TODAY);
  assert.ok(visit.includes('<li data-date="2026-12-31">Thu, Dec 31 — 10:30a–4p (New Year’s Eve &amp; party)</li>'));
  assert.ok(visit.replace(/<!--\/?h(:\w+)?-->/g, '').includes('Mon, Wed–Sun, 10:30a–9p · Closed Tue · Summer hours start May 1'));
  const visitMd = H.applyToMd(read('visit.md'), h, TODAY);
  assert.ok(visitMd.includes('Coming up: Thu, Dec 31 — 10:30a–4p (New Year’s Eve & party)'));
});

test('built pages: every page’s schema parses and the footer has hours + the live line', () => {
  for (const f of pages.filter((p) => p.endsWith('.html') && p !== 'edit-hours.html')) {
    const t = read(f);
    assert.ok(ldBlocks(t).length >= 1, f);
    assert.ok(t.includes('<!--h:summary-->Every day, 11a–8p<!--/h-->'), f);
    assert.ok(t.includes('data-hours-status hidden'), f);
    assert.ok(t.includes('<script type="module" src="/assets/hours-live.js?v='), f);
  }
});

test('CJ’s two changes: no Seaside, no street parking, anywhere in what we publish', () => {
  for (const f of [...pages, 'edit-hours.html', 'assets/site.js', 'hours.json', '_build/build.py', ...fs.readdirSync(path.join(ROOT, '_build/pages')).map((p) => '_build/pages/' + p)]) {
    const t = read(f);
    assert.ok(!/seaside/i.test(t), `${f} mentions Seaside`);
    assert.ok(!/street parking/i.test(t), `${f} mentions street parking`);
  }
});

test('the JS copy of the FAQ schema matches what build.py wrote (before this change)', { skip: !ORIG }, () => {
  const t = fs.readFileSync(path.join(ORIG, 'faq.html'), 'utf8');
  const faq = ldBlocks(t).flatMap((b) => b['@graph'] || [b]).find((n) => n['@type'] === 'FAQPage');
  assert.deepEqual(H.faqFromHtml(t), faq.mainEntity);
});

test('rewriting the schema keeps the exact formatting build.py used (before this change)', { skip: !ORIG }, () => {
  const h = base();
  h.special = [];
  for (const f of fs.readdirSync(ORIG).filter((x) => x.endsWith('.html'))) {
    const t = fs.readFileSync(path.join(ORIG, f), 'utf8');
    assert.equal(H.updateJsonLd(t, h, TODAY), t, f);
  }
});

test('build step: makes public/ with everything the site needs and nothing private', () => {
  execFileSync('node', ['scripts/apply-hours.js'], { cwd: ROOT });
  const pub = path.join(ROOT, 'public');
  const names = fs.readdirSync(pub);
  for (const must of ['index.html', 'visit.html', 'edit-hours.html', 'hours.json', 'robots.txt', 'assets', 'favicon.ico', 'site.webmanifest', 'visit.md']) assert.ok(names.includes(must), must);
  for (const never of ['api', 'scripts', '_build', 'package.json', 'vercel.json', 'README.md', '.git', 'public']) assert.ok(!names.includes(never), never);
  for (const f of ['hours-core.js', 'hours-live.js', 'hours-editor.js', 'hours-editor.css', 'site.css', 'site.js']) assert.ok(fs.existsSync(path.join(pub, 'assets', f)), f);
});

test('build step: only the website is published — notes, tools and secrets dropped in the repo stay private', () => {
  const tmp = fs.mkdtempSync('/tmp/3sons-allow-');
  fs.cpSync(ROOT, tmp, { recursive: true, filter: (s) => !s.includes('/.git') && !s.includes('/public') });
  for (const f of ['PUSH-STEPS.md', 'CONFIRM-WITH-CHRIS.md', '.env', 'notes.txt', 'hours.json.bak', 'Draft.html']) fs.writeFileSync(path.join(tmp, f), 'x');
  fs.mkdirSync(path.join(tmp, '_tools'));
  fs.writeFileSync(path.join(tmp, '_tools/secret.py'), 'x');
  execFileSync('node', ['scripts/apply-hours.js'], { cwd: tmp, stdio: 'pipe' });
  const pub = fs.readdirSync(path.join(tmp, 'public'));
  for (const f of ['PUSH-STEPS.md', 'CONFIRM-WITH-CHRIS.md', '.env', 'notes.txt', 'hours.json.bak', 'Draft.html', '_tools']) assert.ok(!pub.includes(f), f);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('FAQ holiday answer follows the holiday line', () => {
  const h = base();
  const faq = (hol) => { h.holidayLine = hol; return H.faqFromHtml(H.applyToHtml(fs.readFileSync(path.join(ROOT, 'faq.html'), 'utf8'), h, TODAY)).find((q) => q.name === 'What are your holiday hours?').acceptedAnswer.text; };
  assert.match(faq('Closed Thanksgiving & Christmas Day'), /^We are closed on Thanksgiving & Christmas Day\. Our operating hours on public holidays may vary\./);
  assert.match(faq('Open every holiday except Christmas'), /^Open every holiday except Christmas\. Our operating/);
  assert.match(faq(''), /^Our operating hours on public holidays may vary\./);
});

test('build step: broken hours.json stops the build (old site stays live)', () => {
  const tmp = fs.mkdtempSync('/tmp/3sons-badbuild-');
  fs.cpSync(ROOT, tmp, { recursive: true, filter: (s) => !s.includes('/.git') && !s.includes('/public') });
  const h = JSON.parse(fs.readFileSync(path.join(tmp, 'hours.json'), 'utf8'));
  h.week.fri.to = '09:00';
  fs.writeFileSync(path.join(tmp, 'hours.json'), JSON.stringify(h));
  assert.throws(() => execFileSync('node', ['scripts/apply-hours.js'], { cwd: tmp, stdio: 'pipe' }));
  assert.ok(!fs.existsSync(path.join(tmp, 'public', 'index.html')));
  fs.rmSync(tmp, { recursive: true, force: true });
});
