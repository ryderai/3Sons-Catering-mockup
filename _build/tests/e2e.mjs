// End-to-end test in a real browser: the owner signs in, changes hours, saves, and the
// "redeployed" site shows the new hours everywhere. Also: phones, keyboard, accessibility,
// sideways scroll, tap sizes, the banner bug from 27 Oct, and console errors on every page.
//
// Run:  AXE_PATH=/path/to/axe.min.js node _build/tests/e2e.mjs   (Playwright + Chromium needed)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mockGitHub, devServer, siteCopy, redeploy } from './harness.js';
import * as H from '../../assets/hours-core.js';

const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROOF = process.env.PROOF_DIR || '/tmp/3sons-proof';
const AXE = fs.readFileSync(process.env.AXE_PATH, 'utf8');
fs.mkdirSync(PROOF, { recursive: true });

const PASSWORD = 'smoky-brisket-pit-2731';
const TOKEN = 'ghp_test';
const results = [];
const ok = (cond, msg) => { results.push([Boolean(cond), msg]); if (!cond) console.log('  ✗', msg); };
const step = (s) => console.log('\n▶', s);

const dir = siteCopy(ROOT);
const gh = await mockGitHub({ token: TOKEN, initial: fs.readFileSync(path.join(ROOT, 'hours.json'), 'utf8'),
  onCommit: (text) => setTimeout(() => redeploy(dir, text), 2500) }).listen();
Object.assign(process.env, { EDITOR_PASSWORD: PASSWORD, EDITOR_SECRET: 's'.repeat(48), GITHUB_TOKEN: TOKEN, GITHUB_API_URL: gh.url });
const srv = await devServer(dir).listen();
const BASE = srv.url.replace('127.0.0.1', 'localhost'); // Secure cookies work on localhost
const PAGES = ['/', '/menu', '/catering', '/visit', '/happy-hour', '/faq', '/terms', '/accessibility'];

const browser = await chromium.launch();
const consoleErrors = [];
function watch(page, label) {
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|net::ERR_ABORTED|Failed to load resource/.test(m.text())) consoleErrors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`${label}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  // Photos, the logo and map are on other websites the test box can't reach — answer with nothing.
  page.route(/^https?:\/\/(?!localhost)/, (r) => r.fulfill({ status: 204, body: '' }));
}

async function axe(page, label) {
  await page.evaluate(AXE);
  const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
  ok(r.length === 0, `axe ${label}: ${r.join('; ') || 'clean'}`);
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const text = (page, sel) => page.locator(sel).first().innerText();
const statusText = (page) => page.locator('#save-status').innerText();
async function waitLive(page, label) {
  try {
    await page.waitForFunction(() => document.querySelector('.savebar').dataset.state === 'live', null, { timeout: 30000 });
    ok(true, `${label}: editor says it is live`);
  } catch {
    ok(false, `${label}: editor never said live — last status "${await statusText(page)}"`);
  }
}
const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].flatMap((m) => { const j = JSON.parse(m[1]); return j['@graph'] || [j]; });
const fetchText = async (p) => (await fetch(BASE.replace('localhost', '127.0.0.1') + p)).text();

/* ========== 1. Phone: sign in ========== */
step('Phone: sign in');
const phone = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE });
let page = await phone.newPage();
watch(page, 'phone');
await page.goto('/edit-hours');
await page.locator('#view-signin').waitFor();
ok(await page.locator('#pw').isVisible(), 'sign-in form shows when signed out');
await page.screenshot({ path: `${PROOF}/01-phone-sign-in.png` });
await axe(page, 'editor: sign in (phone)');
await page.click('#signin-btn');
ok((await text(page, '#signin-err')) === 'Type your password first.', 'empty password → clear message');
await page.fill('#pw', 'brisket');
await page.click('#pw-show');
ok((await page.getAttribute('#pw', 'type')) === 'text', 'Show reveals the password');
await page.click('#pw-show');
await page.click('#signin-btn');
await page.waitForFunction(() => document.querySelector('#signin-err').textContent.includes('didn’t work'));
ok(await page.getAttribute('#pw', 'aria-invalid') === 'true', 'wrong password → message + field marked');
await page.fill('#pw', PASSWORD);
await page.click('#signin-btn');
await page.locator('#editor').waitFor();
ok((await text(page, '#preview-summary')) === 'Every day, 11a–8p', 'editor loads the real hours');
ok(await page.isChecked('#same'), '"Same hours every day" is on for today’s hours');
ok((await page.inputValue('#same-from')) === '11:00' && (await page.inputValue('#same-to')) === '20:00', 'times show 11:00 AM–8:00 PM');
ok((await page.locator('#special-list li').count()) === 2, 'Thanksgiving + Christmas are listed');
ok(await page.isDisabled('#save'), 'Save is off until something changes');
const ck = (await phone.cookies()).find((c) => c.name === 'hours_session');
ok(ck && ck.httpOnly && ck.secure && ck.sameSite === 'Strict' && ck.expires > Date.now() / 1000 + 89 * 86400, 'session cookie: HttpOnly, Secure, Strict, 90 days');
await page.screenshot({ path: `${PROOF}/02-phone-editor-top.png` });
await page.screenshot({ path: `${PROOF}/03-phone-editor-full.png`, fullPage: true });
await axe(page, 'editor: main (phone)');

/* ========== 2. Change the regular hours ========== */
step('Phone: change regular hours');
await page.click('label.switch');
ok(await page.locator('#days').isVisible(), 'switching off shows all 7 days');
const day = (d) => page.locator(`.day[data-day="${d}"]`);
await day('mon').locator('label.check').click();
await day('fri').locator('[data-to]').selectOption('21:00');
await day('sat').locator('[data-to]').selectOption('21:00');
ok((await text(page, '#preview-summary')) === 'Mon closed · Tue–Thu 11a–8p · Fri & Sat 11a–9p · Sun 11a–8p', 'preview updates as you change things');
ok(!(await page.isDisabled('#save')), 'Save turns on');
ok((await statusText(page)).includes('aren’t saved'), 'unsaved changes are flagged');
await day('wed').locator('[data-to]').selectOption('10:00');
await page.click('#save');
await page.locator('#save-errors li').first().waitFor();
ok((await text(page, '#save-errors')).includes('Wednesday: closing time has to be after opening time.'), 'bad times → plain error');
ok((await day('wed').locator('[data-to]').getAttribute('aria-invalid')) === 'true', 'the bad field is marked');
ok(await page.evaluate(() => document.activeElement.matches('.day[data-day="wed"] [data-to]')), 'focus jumps to the bad field');
await page.screenshot({ path: `${PROOF}/04-phone-error.png` });
await axe(page, 'editor: error state (phone)');
ok((await day('wed').locator('[data-state]').innerText()) === 'Check the times', 'the bad day says "Check the times"');
await day('wed').locator('[data-to]').selectOption('20:00');
ok(await page.locator('#save-errors').isHidden(), 'error list clears once you fix it');
ok((await day('wed').locator('[data-to]').getAttribute('aria-invalid')) === null, 'fixed field is no longer marked');

/* ========== 3. Special days ========== */
step('Phone: special days');
await page.click('#add-day');
ok(await page.evaluate(() => document.activeElement.id === 'sp-date'), 'Add a day → date box gets focus');
await page.fill('#sp-date', '2026-10-01');
await page.click('#sp-ok');
ok((await text(page, '#sp-err')).includes('already passed'), 'past date refused');
await page.fill('#sp-date', '2026-11-26');
await page.click('#sp-ok');
ok((await text(page, '#sp-err')).includes('already in your list'), 'duplicate date refused');
// Enter in the special-day form adds the day — it must never save the page without it
await page.fill('#sp-date', '2026-12-31');
await page.fill('#sp-label', 'New Year’s Eve');
await page.press('#sp-label', 'Enter');
ok((await page.locator('#special-list li[data-date="2026-12-31"]').count()) === 1, 'Enter in the special-day form = Add to list');
ok(gh.commits.length === 1, 'Enter did not save the page');
await page.click('#special-list [data-remove="2026-12-31"]');
await page.click('#add-day');
await page.fill('#sp-date', '2026-12-30');
await page.click('#save');
ok((await text(page, '#sp-err')).includes('Finish this special day first'), 'Save while a special day is half-entered → asks to finish it first');
ok(gh.commits.length === 1, 'nothing saved while the special day was half-entered');
await page.fill('#sp-date', '2026-12-24');
await page.fill('#sp-label', 'Christmas Eve');
await page.check('input[name=sp-kind][value=open]');
ok(await page.locator('#sp-times').isVisible(), 'choosing "Open, different hours" shows times');
await page.selectOption('#sp-from', '11:00');
await page.selectOption('#sp-to', '10:00');
await page.click('#sp-ok');
ok((await text(page, '#sp-err')).includes('closing time has to be after'), 'special day with bad times refused');
await page.selectOption('#sp-to', '15:00');
ok((await text(page, '#sp-err')) === '' && (await page.getAttribute('#sp-to', 'aria-invalid')) === null, 'special-day error clears once you fix it');
await page.screenshot({ path: `${PROOF}/05-phone-special-form.png` });
await axe(page, 'editor: special day form (phone)');
await page.click('#sp-ok');
ok((await page.locator('#special-list li').count()) === 3, 'Christmas Eve added');
ok((await text(page, '#special-list li[data-date="2026-12-24"]')).includes('Open 11a–3p · Christmas Eve'), 'Christmas Eve reads right');
await page.click('#closed-today');
const today = H.todayISO();
ok(await page.locator(`#special-list li[data-date="${today}"] .tag--today`).isVisible(), '"Closed today" adds today with a Today tag');
await page.click(`#special-list [data-remove="${today}"]`);
ok((await page.locator(`#special-list li[data-date="${today}"]`).count()) === 0, 'Remove takes it off');
ok(await page.evaluate(() => document.activeElement.id === 'add-day'), 'focus goes somewhere sensible after Remove');
await page.click('#special-list [data-change="2026-11-26"]');
await page.fill('#sp-label', 'Thanksgiving Day');
await page.click('#sp-ok');
ok((await text(page, '#special-list li[data-date="2026-11-26"]')).includes('Thanksgiving Day'), 'Change edits a day in place');

/* ========== 4. Notes ========== */
await page.fill('#note', 'Summer hours start Memorial Day');
ok((await text(page, '#note-count')) === '31 / 160', 'letter counter works');

/* ========== 5. Save → live ========== */
step('Phone: save and watch it go live');
await page.click('#save');
await page.waitForFunction(() => /Saved\. Updating your website/.test(document.querySelector('#save-status').textContent), null, { timeout: 10000 });
ok(true, 'save → "Saved. Updating your website now"');
await waitLive(page, 'first save');
await page.screenshot({ path: `${PROOF}/06-phone-live.png` });
ok(await page.isDisabled('#save'), 'Save turns off again after saving');
const saved = JSON.parse(gh.current().text);

step('Site: the new hours are everywhere');
const site = await phone.newPage();
watch(site, 'site');
await site.goto('/visit');
const visitDd = await site.locator('.hours div:first-child dd').innerText();
ok(visitDd === 'Mon closed · Tue–Thu 11a–8p · Fri & Sat 11a–9p · Sun 11a–8p · Summer hours start Memorial Day', `Visit hours row: "${visitDd}"`);
const coming = await site.locator('[data-hours-special] li').allInnerTexts();
ok(coming.length === 3 && coming[0] === 'Thu, Nov 26 — Closed (Thanksgiving Day)' && coming[1] === 'Thu, Dec 24 — 11a–3p (Christmas Eve)', `Visit "Coming up": ${coming.join(' | ')}`);
ok((await site.locator('.proof li').first().innerText()).replace(/\s+/g, ' ').startsWith('11a–9p Open Tue–Sun · hours vary'), 'Visit top tile updated');
await site.locator('[data-hours-status]').first().waitFor({ state: 'visible' });
const live = await site.locator('[data-hours-status]').first().innerText();
const expect = H.status(saved).text;
ok(live === expect, `footer "open now" line: "${live}" (expected "${expect}")`);
await site.locator('#find-us').scrollIntoViewIfNeeded();
await site.screenshot({ path: `${PROOF}/07-phone-visit-hours.png`, fullPage: false });
const vhtml = await fetchText('/visit');
const rest = ld(vhtml).find((n) => n['@type'] === 'Restaurant');
ok(JSON.stringify(rest.openingHoursSpecification) === JSON.stringify(H.schemaWeek(saved)), 'hidden schema: weekly hours updated');
ok(!rest.openingHoursSpecification.some((s) => s.dayOfWeek.includes('Monday')), 'hidden schema: Monday closed');
ok(rest.specialOpeningHoursSpecification.length === 3 && rest.specialOpeningHoursSpecification[1].closes === '15:00', 'hidden schema: 3 special days');
const faqHtml = await fetchText('/faq');
const faqLd = ld(faqHtml).find((n) => n['@type'] === 'FAQPage').mainEntity.find((q) => q.name === 'When is happy hour?').acceptedAnswer.text;
ok(faqLd === 'Après runs 2p–5p every day at our full-service bar. We’re open Tue–Thu 11a–8p, Fri & Sat 11a–9p and Sun 11a–8p, and closed Mon.', `FAQ schema answer: ${faqLd}`);
await site.goto('/faq');
ok((await site.locator('#q-happy-hour-a, .qa-a').filter({ hasText: 'Après runs' }).first().innerText()).includes('We’re open Tue–Thu 11a–8p, Fri & Sat 11a–9p and Sun 11a–8p, and closed Mon.'), 'FAQ page text updated');
await site.goto('/');
ok((await site.locator('.times div', { has: site.locator('span', { hasText: /^Open$/ }) }).locator('b').innerText()) === '11a–9p', 'home "Open" tile updated');
ok((await site.locator('.mm-foot .dest__grid > div:nth-child(2) p').first().innerText()) === 'Mon closed · Tue–Thu 11a–8p · Fri & Sat 11a–9p · Sun 11a–8p', 'footer hours updated');
await site.goto('/happy-hour');
ok((await site.locator('.proof li').first().textContent()).includes('Hours: Mon closed · Tue–Thu 11a–8p · Fri & Sat 11a–9p · Sun 11a–8p'), 'happy hour page updated');
const md = await fetchText('/visit.md');
ok(md.includes('Mon closed · Tue–Thu 11a–8p · Fri & Sat 11a–9p · Sun 11a–8p<!--/h--><!--h:noteSep--> · Summer hours start Memorial Day'), 'visit.md copy updated');
ok(md.includes('Coming up: Thu, Nov 26 — Closed (Thanksgiving Day); Thu, Dec 24 — 11a–3p (Christmas Eve); Fri, Dec 25 — Closed (Christmas Day)'), 'visit.md lists special days');
ok(JSON.parse(await fetchText('/hours.json')).rev === saved.rev, 'published hours.json is the saved version');

/* ========== 6. Two people editing ========== */
step('Conflict: someone else saved first');
await page.fill('#note', 'Note from phone A');
const other = JSON.parse(gh.current().text);
other.note = 'Saved from another phone';
gh.externalSave(JSON.stringify(other, null, 2) + '\n');
await page.click('#save');
await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Someone else saved'), null, { timeout: 10000 });
ok(true, 'conflict → plain message, nothing overwritten');
ok(JSON.parse(gh.current().text).note === 'Saved from another phone', 'the other person’s save is untouched');
await page.click('#save-status button');
await page.waitForFunction(() => document.querySelector('#note').value === 'Saved from another phone');
ok(true, 'Reload shows the newest saved hours');

/* ========== 7. Signed out mid-edit ========== */
step('Session ends mid-edit: changes are kept');
await page.fill('#holiday', 'Closed Thanksgiving, Christmas & New Year’s Day');
await phone.clearCookies();
await page.click('#save');
await page.locator('#view-signin').waitFor();
ok((await text(page, '#signin-why')).includes('your changes are still here'), 'asked to sign in again, told changes are kept');
await page.fill('#pw', PASSWORD);
await page.click('#signin-btn');
await page.locator('#editor').waitFor();
ok((await page.inputValue('#holiday')) === 'Closed Thanksgiving, Christmas & New Year’s Day', 'the change is still on screen after signing in');
await page.click('#save');
await waitLive(page, 'save after signing in again');
ok(JSON.parse(gh.current().text).holidayLine === 'Closed Thanksgiving, Christmas & New Year’s Day', 'saved to GitHub');
ok((await fetchText('/')).includes('<p style="margin-top:8px">Closed Thanksgiving, Christmas &amp; New Year’s Day</p>'), 'footer holiday line updated (with & escaped)');

/* ========== 8. Undo with recent changes ========== */
step('Undo: go back to the first version');
await page.click('#hist-load');
await page.locator('#hist-list li').first().waitFor();
const hist = await page.locator('#hist-list li').count();
ok(hist >= 4, `recent changes lists ${hist} versions`);
ok((await page.locator('#hist-list li').first().innerText()).includes('current version'), 'newest is marked current');
await page.locator('#hist-list li').last().getByRole('button', { name: /Use the version/ }).click();
ok((await text(page, '#preview-summary')) === 'Every day, 11a–8p', 'old version loaded into the editor');
ok(await page.isChecked('#same'), 'switch follows the loaded version');
await page.screenshot({ path: `${PROOF}/08-phone-history.png`, fullPage: true });
await page.click('#save');
await waitLive(page, 'restore save');
ok((await fetchText('/visit')).includes('<!--h:summary-->Every day, 11a–8p<!--/h-->'), 'site back to Every day, 11a–8p');

/* ========== 8b. GitHub trouble ========== */
step('GitHub trouble shows a "needs AI Syndicate" message, not "check your internet"');
gh.mode = 'down';
await page.fill('#note', 'Test while GitHub is down');
await page.click('#save');
await page.waitForFunction(() => document.querySelector('.savebar').dataset.state === 'error');
ok((await statusText(page)).includes('needs a quick fix from AI Syndicate'), 'save during GitHub trouble → clear message, changes kept');
ok((await page.inputValue('#note')) === 'Test while GitHub is down', 'the change is still on screen');
await page.reload();
await page.waitForFunction(() => document.querySelector('#view-loading').textContent.includes('quick fix'));
ok(true, 'loading during GitHub trouble → same clear message');
gh.mode = 'ok';
await page.reload();
await page.locator('#editor').waitFor();

/* ========== 9. Sign out ========== */
step('Sign out');
await page.click('#signout');
await page.locator('#view-signin').waitFor();
await page.reload();
await page.locator('#view-signin').waitFor();
ok(true, 'signed out stays signed out after reload');
await phone.close();

/* ========== 10. Desktop, keyboard only, "don't remember me" ========== */
step('Desktop + keyboard only');
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, baseURL: BASE });
page = await desk.newPage();
watch(page, 'desktop');
await page.goto('/edit-hours');
await page.locator('#view-signin').waitFor();
await page.focus('#pw');
await page.keyboard.type(PASSWORD);
await page.keyboard.press('Tab'); // Show
await page.keyboard.press('Tab'); // Keep me signed in
await page.keyboard.press('Space');
ok(!(await page.isChecked('#remember')), 'checkbox works from the keyboard');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Enter');
await page.locator('#editor').waitFor();
const dck = (await desk.cookies()).find((c) => c.name === 'hours_session');
ok(dck && dck.expires === -1, '"Keep me signed in" off → cookie ends with the browser');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement.id === 'same'), 'Tab from the heading lands on the first control');
const ring = await page.evaluate(() => getComputedStyle(document.querySelector('.switch__ui')).outlineStyle);
await page.keyboard.press('Space');
ok(await page.locator('#days').isVisible(), 'switch works from the keyboard');
ok(ring !== 'none', 'keyboard focus ring shows on the switch');
await page.screenshot({ path: `${PROOF}/09-desktop-editor.png`, fullPage: true });
await axe(page, 'editor: main (desktop)');
await desk.close();

/* ========== 11. Every page: phones, accessibility, sideways scroll, banner, footer ========== */
step('Every page at every size');
const ctx = await browser.newContext({ baseURL: BASE });
page = await ctx.newPage();
watch(page, 'pages');
for (const w of [320, 375, 390, 414, 768, 1280]) {
  await page.setViewportSize({ width: w, height: w < 800 ? 800 : 900 });
  for (const p of [...PAGES, '/edit-hours']) {
    await page.goto(p);
    await page.waitForTimeout(150);
    ok(await noSideScroll(page), `no sideways scroll: ${p} @${w}`);
    if (w === 390 || w === 1280) await axe(page, `${p} @${w}`);
  }
}
step('Tap sizes on the editor (phone)');
await page.setViewportSize({ width: 390, height: 844 });
const sctx = await browser.newContext({ ...devices['iPhone 13'], baseURL: BASE });
const sp = await sctx.newPage();
watch(sp, 'tap');
await sp.goto('/edit-hours');
await sp.fill('#pw', PASSWORD);
await sp.click('#signin-btn');
await sp.locator('#editor').waitFor();
await sp.click('label.switch');
await sp.click('#add-day');
const small = await sp.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('button, a, select, input, label.check, label.switch')) {
    if (el.closest('[hidden]') || el.offsetParent === null) continue;
    if (el.matches('input[type=checkbox], input[type=radio]')) continue; // their whole label is the target (checked below)
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const main = el.matches('button, select, input, label');
    if (r.width < 24 || r.height < 24 || (main && r.height < 44)) bad.push(`${el.tagName}#${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return bad;
});
ok(small.length === 0, `tap targets ≥44 px tall (≥24 px for links): ${small.join(', ') || 'all good'}`);
await sctx.close();

step('Banner stays on top (bug from 27 Oct)');
for (const [w, h] of [[1280, 900], [1715, 1236], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const p of PAGES) {
    await page.goto(p);
    await page.evaluate(() => { try { localStorage.clear(); } catch {} });
    await page.goto(p);
    const top = await page.evaluate(() => {
      const a = document.querySelector('.announce');
      if (!a || a.hidden || !a.offsetHeight) return 'missing';
      const r = a.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return a.contains(el) ? 'on top' : `covered by ${el && el.className}`;
    });
    ok(top === 'on top', `banner ${p} @${w}x${h}: ${top}`);
  }
}

step('Footer: hours + "open now" line visible and the footer still fits');
for (const [w, h] of [[1280, 900], [1440, 800], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const p of PAGES) {
    await page.goto(p);
    await page.locator('[data-hours-status]').first().waitFor({ state: 'attached' });
    await page.waitForFunction(() => !document.querySelector('[data-hours-status]').hidden, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    const f = await page.evaluate(() => {
      const s = document.querySelector('[data-hours-status]');
      const back = [...document.querySelectorAll('.dest__bar a')].find((a) => a.textContent.includes('Back to top'));
      const rs = s.getBoundingClientRect(); const rb = back.getBoundingClientRect();
      return { shown: !s.hidden && rs.height > 0, text: s.textContent,
               statusInView: rs.top >= 0 && rs.bottom <= innerHeight + 1, barInView: rb.top >= 0 && rb.bottom <= innerHeight + 1 };
    });
    ok(f.shown && f.text.length > 5, `footer open-now line shows on ${p} @${w}x${h} ("${f.text}")`);
    if (w > 900) ok(f.statusInView && f.barInView, `footer fits on screen at the bottom of ${p} @${w}x${h}`);
  }
}
await page.screenshot({ path: `${PROOF}/10-phone-footer.png` });

step('If /hours.json can’t load, the built-in hours still show');
await page.route('**/hours.json', (r) => r.abort());
await page.goto('/visit');
await page.waitForTimeout(800);
ok(await page.locator('[data-hours-status]').first().isHidden(), 'open-now line stays hidden (no wrong info)');
ok((await page.locator('.hours div:first-child dd').innerText()).startsWith('Every day, 11a–8p'), 'built-in hours still on the page');
await page.unroute('**/hours.json');

step('Special day that is already over disappears from Visit without a rebuild');
await page.route('**/hours.json', async (r) => {
  const h = JSON.parse(fs.readFileSync(path.join(dir, 'hours.json'), 'utf8'));
  h.special.unshift({ date: '2026-10-01', label: 'Old', closed: true });
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(h) });
});
await page.goto('/visit');
await page.waitForTimeout(800);
ok((await page.locator('[data-hours-special] li').allInnerTexts()).every((t) => !t.includes('Old')), 'past days are hidden on the live page');
await page.unroute('**/hours.json');

await ctx.close();
await browser.close();
await srv.close();
await gh.close();

ok(consoleErrors.length === 0, `no console errors or CSP blocks: ${consoleErrors.slice(0, 5).join(' || ') || 'none'}`);
const fails = results.filter(([g]) => !g);
console.log(`\n${results.length - fails.length} passed, ${fails.length} failed`);
for (const [, m] of fails) console.log('FAIL', m);
fs.writeFileSync(`${PROOF}/e2e-results.txt`, results.map(([g, m]) => `${g ? 'PASS' : 'FAIL'}  ${m}`).join('\n') + `\n\n${results.length - fails.length} passed, ${fails.length} failed\n`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fails.length ? 1 : 0);
