/* 3 Sons Bar-B-Q — the owner's hours editor (/edit-hours). Built by AI Syndicate.
 * Uses the same rules as the website and the server (assets/hours-core.js). */
import {
  DAYS, DAY_NAME, TZ, LIMITS, timeOptions, fmtTimeLong, fmtRange, fmtDate, words, validate, todayISO,
  upcoming, toMin, defaultHours, isISODate, daysBetween,
} from './hours-core.js';

const $ = (id) => document.getElementById(id);
const clone = (o) => JSON.parse(JSON.stringify(o));
const VIEWS = ['view-loading', 'view-setup', 'view-signin', 'editor'];

let today = todayISO();
let loaded = null;      // last saved hours (what the website has, or will have)
let state = null;       // what's on screen
let sha = null;         // version of hours.json we started from
let sameMode = true;    // "Same hours every day" switch
let saving = false;
let editingDate = null; // special day being changed, or null when adding
let liveTimer = null;
let liveGen = 0;        // each save gets a number, so an old check can't report on a newer save
let keepEditsAfterSignin = false;

/* ---------------- talking to the server ---------------- */

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...opts,
    headers: { 'X-Hours-Editor': '1', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  let data = null;
  try { data = await r.json(); } catch { /* not JSON */ }
  return { status: r.status, data };
}

/* ---------------- helpers ---------------- */

function show(view) {
  for (const v of VIEWS) $(v).hidden = v !== view;
  $('signout').hidden = view !== 'editor';
}

function normalize(h) {
  const base = defaultHours();
  const v = validate(h, { today }).value || base;
  for (const d of DAYS) if (!v.week[d]) v.week[d] = base.week[d];
  delete v.rev; delete v.updatedAt;
  return v;
}

const canon = (h) => JSON.stringify({ week: h.week, special: h.special, holidayLine: h.holidayLine, note: h.note });
const isDirty = () => Boolean(state && loaded && canon(state) !== canon(loaded));
const allSame = (week) => DAYS.every((d) => week[d].open && week[d].from === week.mon.from && week[d].to === week.mon.to);

function fillTimes(select) {
  if (select.options.length) return;
  for (const t of timeOptions()) select.add(new Option(fmtTimeLong(t), t));
}

function setStatus(text, kind = '', html = false) {
  const p = $('save-status');
  if (html) p.replaceChildren(...html); else p.textContent = text;
  document.querySelector('.savebar').dataset.state = kind;
}

function clearErrors() {
  $('save-errors').hidden = true;
  $('save-errors').replaceChildren();
  document.querySelectorAll('[aria-invalid=true]').forEach((el) => el.removeAttribute('aria-invalid'));
}

/* ---------------- drawing the screen ---------------- */

function buildDays() {
  const box = $('days');
  for (const d of DAYS) {
    const fs = document.createElement('fieldset');
    fs.className = 'day';
    fs.dataset.day = d;
    fs.innerHTML = `
      <legend>${DAY_NAME[d]}</legend>
      <div class="day__top">
        <label class="check"><input type="checkbox" data-open> <span>Open</span><span class="sr"> on ${DAY_NAME[d]}</span></label>
        <span class="day__state" data-state></span>
      </div>
      <div class="times">
        <label class="field field--inline"><span class="field__label">Opens</span><select data-from data-time></select></label>
        <label class="field field--inline"><span class="field__label">Closes</span><select data-to data-time></select></label>
      </div>`;
    box.append(fs);
  }
  document.querySelectorAll('select[data-time]').forEach(fillTimes);
}

function renderWeek() {
  $('same').checked = sameMode;
  $('same-row').hidden = !sameMode;
  $('days').hidden = sameMode;
  $('copy-mon').hidden = sameMode;
  if (sameMode) {
    $('same-from').value = state.week.mon.from;
    $('same-to').value = state.week.mon.to;
  }
  for (const d of DAYS) {
    const fs = document.querySelector(`.day[data-day="${d}"]`);
    const w = state.week[d];
    fs.querySelector('[data-open]').checked = w.open;
    fs.classList.toggle('is-closed', !w.open);
    fs.querySelector('[data-state]').textContent = !w.open ? 'Closed all day'
      : toMin(w.to) <= toMin(w.from) ? 'Check the times' : fmtRange(w.from, w.to);
    fs.querySelector('[data-from]').value = w.from;
    fs.querySelector('[data-to]').value = w.to;
  }
  $('preview-summary').textContent = words(state).summary;
}

function renderSpecial() {
  const list = upcoming(state, today);
  state.special = list;
  const ul = $('special-list');
  ul.replaceChildren();
  for (const s of list) {
    const li = document.createElement('li');
    const txt = document.createElement('div');
    txt.className = 'special__txt';
    const date = document.createElement('span');
    date.className = 'special__date';
    date.textContent = fmtDate(s.date, today) + ' ';
    if (s.date === today) {
      const tag = document.createElement('span');
      tag.className = 'tag tag--today';
      tag.textContent = 'Today';
      date.append(tag);
    }
    const what = document.createElement('span');
    what.textContent = (s.closed ? 'Closed all day' : `Open ${fmtRange(s.from, s.to)}`) + (s.label ? ` · ${s.label}` : '');
    txt.append(date, what);
    const btns = document.createElement('div');
    btns.className = 'special__btns';
    const change = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--ghost btn--small', textContent: 'Change' });
    change.setAttribute('aria-label', `Change ${fmtDate(s.date, today)}`);
    change.dataset.change = s.date;
    const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--ghost btn--small', textContent: 'Remove' });
    remove.setAttribute('aria-label', `Remove ${fmtDate(s.date, today)}`);
    remove.dataset.remove = s.date;
    btns.append(change, remove);
    li.append(txt, btns);
    li.dataset.date = s.date;
    ul.append(li);
  }
  $('special-empty').hidden = list.length > 0;
}

function renderNotes() {
  $('holiday').value = state.holidayLine;
  $('note').value = state.note;
  counts();
}

function counts() {
  $('hol-count').textContent = `${$('holiday').value.length} / ${LIMITS.holidayLine}`;
  $('note-count').textContent = `${$('note').value.length} / ${LIMITS.note}`;
}

function renderAll() {
  renderWeek();
  renderSpecial();
  renderNotes();
  changed();
}

/** Called after every edit: keeps the Save button and message in step. */
function changed() {
  if (!$('save-errors').hidden) clearErrors(); // old error list goes away as soon as you change something
  $('preview-summary').textContent = words(state).summary;
  const dirty = isDirty();
  $('save').disabled = saving || (!dirty && $('special-form').hidden);
  if (saving) return;
  if (dirty) {
    stopLiveCheck();
    setStatus('You have changes that aren’t saved yet.', 'dirty');
  } else if (!liveTimer && document.querySelector('.savebar').dataset.state === 'dirty') {
    setStatus('No changes yet.');
  }
}

/* ---------------- loading ---------------- */

function useServerHours(data) {
  today = todayISO();
  loaded = normalize(data.hours);
  state = clone(loaded);
  sha = data.sha;
  sameMode = allSame(state.week);
  renderAll();
}

async function start() {
  show('view-loading');
  let r;
  try { r = await api('/api/hours'); } catch { return loadFailed('network'); }
  if (r.status === 200) {
    useServerHours(r.data);
    show('editor');
    setStatus('No changes yet.');
    return;
  }
  if (r.status === 401) { show('view-signin'); $('pw').focus(); return; }
  if (r.status === 503) { show('view-setup'); return; }
  loadFailed(r.status === 502 ? 'github' : 'network');
}

const NEEDS_US = 'The hours editor needs a quick fix from AI Syndicate. Your website and your hours are safe and unchanged. Please text Ryder.';

function loadFailed(why = 'network') {
  show('view-loading');
  const box = $('view-loading');
  box.replaceChildren();
  const p = document.createElement('p');
  p.className = 'error';
  p.setAttribute('role', 'alert');
  p.textContent = why === 'github' ? NEEDS_US : 'We couldn’t load your hours. Check your internet connection, then try again.';
  const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--red', textContent: 'Try again' });
  b.addEventListener('click', () => { box.innerHTML = '<p class="muted">Loading your hours…</p>'; start(); });
  box.append(p, b);
}

/* ---------------- signing in and out ---------------- */

$('pw-show').addEventListener('click', () => {
  const on = $('pw').type === 'password';
  $('pw').type = on ? 'text' : 'password';
  $('pw-show').textContent = on ? 'Hide' : 'Show';
  $('pw-show').setAttribute('aria-pressed', String(on));
});

$('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('signin-err');
  err.textContent = '';
  $('pw').removeAttribute('aria-invalid');
  if (!$('pw').value) {
    err.textContent = 'Type your password first.';
    $('pw').setAttribute('aria-invalid', 'true');
    $('pw').focus();
    return;
  }
  const btn = $('signin-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  let r;
  try {
    r = await api('/api/editor-login', { method: 'POST', body: JSON.stringify({ password: $('pw').value, remember: $('remember').checked }) });
  } catch {
    r = { status: 0 };
  }
  btn.disabled = false;
  btn.textContent = 'Sign in';
  if (r.status === 200) {
    $('pw').value = '';
    if (keepEditsAfterSignin && state) {
      keepEditsAfterSignin = false;
      show('editor');
      changed();
      setStatus('You’re signed in again. Your changes are still here. Tap Save changes.', 'dirty');
      $('save').focus();
    } else {
      await start();
      $('ed-h').setAttribute('tabindex', '-1');
      $('ed-h').focus();
    }
    return;
  }
  if (r.status === 401) err.textContent = 'That password didn’t work. Check it and try again.';
  else if (r.status === 503) { show('view-setup'); return; }
  else err.textContent = 'We couldn’t reach the website. Check your internet connection and try again.';
  $('pw').setAttribute('aria-invalid', 'true');
  $('pw').focus();
});

$('signout').addEventListener('click', async () => {
  if (isDirty() && !window.confirm('You have changes that aren’t saved. Sign out anyway?')) return;
  try { await api('/api/editor-logout', { method: 'POST', body: '{}' }); } catch { /* still sign out on screen */ }
  state = loaded = null;
  keepEditsAfterSignin = false;
  stopLiveCheck();
  show('view-signin');
  $('signin-why').textContent = 'You’re signed out.';
  $('pw').focus();
});

/* ---------------- regular hours ---------------- */

$('same').addEventListener('change', () => {
  sameMode = $('same').checked;
  if (sameMode) {
    const src = DAYS.map((d) => state.week[d]).find((w) => w.open) || state.week.mon;
    for (const d of DAYS) state.week[d] = { open: true, from: src.from, to: src.to };
  }
  renderWeek();
  changed();
});

function sameChanged() {
  for (const d of DAYS) state.week[d] = { open: true, from: $('same-from').value, to: $('same-to').value };
  renderWeek();
  changed();
}
$('same-from').addEventListener('change', sameChanged);
$('same-to').addEventListener('change', sameChanged);

$('days').addEventListener('change', (e) => {
  const fs = e.target.closest('.day');
  if (!fs) return;
  const w = state.week[fs.dataset.day];
  if (e.target.matches('[data-open]')) w.open = e.target.checked;
  if (e.target.matches('[data-from]')) w.from = e.target.value;
  if (e.target.matches('[data-to]')) w.to = e.target.value;
  renderWeek();
  changed();
});

$('copy-mon').addEventListener('click', () => {
  const m = state.week.mon;
  for (const d of DAYS) state.week[d] = { ...m };
  renderWeek();
  changed();
  setStatus('Copied Monday’s hours to every day. Tap Save changes when you’re ready.', 'dirty');
});

/* ---------------- special days ---------------- */

function openSpecialForm(s) {
  today = todayISO();
  editingDate = s ? s.date : null;
  $('special-form-h').textContent = s ? `Change ${fmtDate(s.date, today)}` : 'Add a special day';
  $('sp-ok').textContent = s ? 'Save this day' : 'Add to list';
  $('sp-date').min = today;
  $('sp-date').max = new Date(Date.parse(today + 'T12:00:00Z') + LIMITS.maxDaysAhead * 864e5).toISOString().slice(0, 10);
  $('sp-date').value = s ? s.date : '';
  $('sp-label').value = s ? s.label : '';
  const open = Boolean(s && !s.closed);
  document.querySelector(`input[name=sp-kind][value=${open ? 'open' : 'closed'}]`).checked = true;
  $('sp-from').value = open ? s.from : state.week.mon.from;
  $('sp-to').value = open ? s.to : state.week.mon.to;
  $('sp-times').hidden = !open;
  $('sp-err').textContent = '';
  $('sp-date').removeAttribute('aria-invalid');
  $('special-form').hidden = false;
  $('special-btns').hidden = true;
  changed();
  $('sp-date').focus();
}

function closeSpecialForm(focusId = 'add-day') {
  $('special-form').hidden = true;
  $('special-btns').hidden = false;
  editingDate = null;
  changed();
  const el = $(focusId) || $('add-day');
  el.focus();
}

document.querySelectorAll('input[name=sp-kind]').forEach((r) => r.addEventListener('change', () => {
  $('sp-times').hidden = document.querySelector('input[name=sp-kind]:checked').value !== 'open';
}));

$('add-day').addEventListener('click', () => openSpecialForm(null));
// Enter inside the special-day form means "Add to list", never "save the whole page".
$('special-form').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); $('sp-ok').click(); }
});
// Any change inside the special-day form clears its old error message.
$('special-form').addEventListener('input', () => {
  $('sp-err').textContent = '';
  $('special-form').querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
});
$('sp-cancel').addEventListener('click', () => closeSpecialForm());

$('closed-today').addEventListener('click', () => {
  today = todayISO();
  const s = state.special.find((x) => x.date === today);
  if (s) { openSpecialForm(s); return; }
  state.special.push({ date: today, label: '', closed: true });
  renderSpecial();
  changed();
  setStatus('Added: closed today. Tap Save changes to put it on your website.', 'dirty');
  $('save').focus();
});

$('sp-ok').addEventListener('click', () => {
  today = todayISO();
  const err = $('sp-err');
  const date = $('sp-date').value;
  const closed = document.querySelector('input[name=sp-kind]:checked').value === 'closed';
  const fail = (msg, el) => { err.textContent = msg; if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); } };
  $('sp-date').removeAttribute('aria-invalid');
  if (!isISODate(date)) return fail('Pick a date.', $('sp-date'));
  if (date < today) return fail('That date has already passed. Pick today or a later date.', $('sp-date'));
  if (daysBetween(today, date) > LIMITS.maxDaysAhead) return fail('Pick a date within the next 2 years.', $('sp-date'));
  if (date !== editingDate && state.special.some((s) => s.date === date)) {
    return fail(`${fmtDate(date, today)} is already in your list. Tap Change on it instead.`, $('sp-date'));
  }
  const row = { date, label: $('sp-label').value.trim().slice(0, LIMITS.label), closed };
  if (!closed) {
    row.from = $('sp-from').value;
    row.to = $('sp-to').value;
    if (toMin(row.to) <= toMin(row.from)) return fail('The closing time has to be after the opening time.', $('sp-to'));
  }
  state.special = state.special.filter((s) => s.date !== editingDate && s.date !== date);
  state.special.push(row);
  const was = editingDate;
  renderSpecial();
  changed();
  setStatus(`${was ? 'Changed' : 'Added'} ${fmtDate(date, today)}. Tap Save changes to put it on your website.`, 'dirty');
  closeSpecialForm();
});

$('special-list').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.change) {
    openSpecialForm(state.special.find((s) => s.date === b.dataset.change));
  } else if (b.dataset.remove) {
    const d = b.dataset.remove;
    state.special = state.special.filter((s) => s.date !== d);
    renderSpecial();
    changed();
    setStatus(`Removed ${fmtDate(d, today)}. Tap Save changes to put it on your website.`, 'dirty');
    $('add-day').focus();
  }
});

/* ---------------- notes ---------------- */

$('holiday').addEventListener('input', () => { state.holidayLine = $('holiday').value; counts(); changed(); });
$('note').addEventListener('input', () => { state.note = $('note').value; counts(); changed(); });

/* ---------------- recent changes ---------------- */

const whenFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

$('hist-load').addEventListener('click', async () => {
  const btn = $('hist-load');
  const list = $('hist-list');
  $('hist-err').textContent = '';
  btn.disabled = true;
  btn.textContent = 'Loading…';
  let r;
  try { r = await api('/api/hours-history'); } catch { r = { status: 0 }; }
  btn.disabled = false;
  btn.textContent = 'Refresh recent changes';
  if (r.status === 401) { keepEditsAfterSignin = true; show('view-signin'); $('signin-why').textContent = 'You were signed out. Sign in again — your changes are still here.'; $('pw').focus(); return; }
  if (r.status !== 200) { $('hist-err').textContent = 'We couldn’t load the recent changes. Try again in a minute.'; return; }
  list.replaceChildren();
  r.data.versions.forEach((v, i) => {
    const h = normalize(v.hours);
    const li = document.createElement('li');
    const txt = document.createElement('div');
    txt.className = 'hist__txt';
    const when = document.createElement('span');
    when.className = 'hist__when';
    when.textContent = whenFmt.format(new Date(v.date)) + (i === 0 ? ' · current version' : '');
    const what = document.createElement('span');
    const n = upcoming(h, today).length;
    what.textContent = words(h).summary + (n ? ` · ${n} special day${n === 1 ? '' : 's'}` : '');
    txt.append(when, what);
    li.append(txt);
    if (i > 0) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--ghost btn--small', textContent: 'Use this version' });
      b.setAttribute('aria-label', `Use the version from ${when.textContent}`);
      b.addEventListener('click', () => {
        state = clone(h);
        sameMode = allSame(state.week);
        renderAll();
        setStatus(`Loaded the version from ${when.textContent}. Check it, then tap Save changes.`, 'dirty');
        $('ed-h').setAttribute('tabindex', '-1');
        $('ed-h').focus();
        window.scrollTo({ top: 0 });
      });
      li.append(b);
    }
    list.append(li);
  });
  list.hidden = false;
});

/* ---------------- saving ---------------- */

function fieldFor(path) {
  const [a, b, c] = path.split('.');
  if (a === 'week') {
    if (sameMode) return $(c === 'from' ? 'same-from' : 'same-to');
    const fs = document.querySelector(`.day[data-day="${b}"]`);
    return fs && fs.querySelector(c === 'from' ? '[data-from]' : c === 'to' ? '[data-to]' : '[data-open]');
  }
  if (a === 'holidayLine') return $('holiday');
  if (a === 'note') return $('note');
  if (a === 'special' && b !== undefined) {
    const s = state.special[Number(b)];
    return s ? document.querySelector(`[data-change="${s.date}"]`) : $('add-day');
  }
  return null;
}

function showErrors(errors) {
  clearErrors();
  const ul = $('save-errors');
  for (const er of errors) {
    const el = fieldFor(er.field);
    if (el && el.tagName !== 'BUTTON') el.setAttribute('aria-invalid', 'true');
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { href: '#', textContent: er.message });
    a.addEventListener('click', (ev) => { ev.preventDefault(); if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); } });
    li.append(a);
    ul.append(li);
  }
  ul.hidden = false;
  setStatus(errors.length === 1 ? 'One thing needs fixing before you can save:' : `${errors.length} things need fixing before you can save:`, 'error');
  const first = fieldFor(errors[0].field);
  if (first) { first.scrollIntoView({ block: 'center' }); first.focus(); }
}

$('editor').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (saving) return;
  if (!$('special-form').hidden) {
    $('sp-err').textContent = 'Finish this special day first: tap “Add to list” (or Cancel), then Save changes.';
    $('sp-ok').focus();
    return;
  }
  if (!isDirty()) return;
  today = todayISO();
  clearErrors();
  const check = validate(state, { today });
  if (!check.ok) return showErrors(check.errors);

  saving = true;
  $('save').disabled = true;
  $('save').textContent = 'Saving…';
  setStatus('Saving…', 'saving');
  let r;
  try { r = await api('/api/hours', { method: 'PUT', body: JSON.stringify({ hours: check.value, sha }) }); } catch { r = { status: 0 }; }
  saving = false;
  $('save').textContent = 'Save changes';

  if (r.status === 200) {
    loaded = normalize(r.data.hours);
    state = clone(loaded);
    sha = r.data.sha;
    renderAll();
    startLiveCheck(r.data.hours.rev);
    return;
  }
  changed();
  if (r.status === 400 && r.data && r.data.errors) return showErrors(r.data.errors);
  if (r.status === 401) {
    keepEditsAfterSignin = true;
    show('view-signin');
    $('signin-why').textContent = 'You were signed out. Sign in again — your changes are still here.';
    $('pw').focus();
    return;
  }
  if (r.status === 409) {
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'link-btn', textContent: 'Reload' });
    btn.addEventListener('click', () => {
      if (window.confirm('Reloading shows the newest saved hours. The changes on this screen will be lost. Reload now?')) start();
    });
    setStatus('', 'error', [document.createTextNode('Someone else saved changes a moment ago, so this screen is out of date. '), btn]);
    return;
  }
  if (r.status === 503) { show('view-setup'); return; }
  setStatus(r.status === 0
    ? 'No internet connection. Your changes are still here — try again when you’re back online.'
    : r.status === 502 ? `Nothing was saved. ${NEEDS_US}`
    : 'Something went wrong and nothing was saved. Your changes are still here — try again in a minute.', 'error');
});

/* ---------------- "is it live yet?" ---------------- */

function stopLiveCheck() {
  liveGen++;
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = null;
}

function startLiveCheck(rev) {
  stopLiveCheck();
  const gen = liveGen;
  const started = Date.now();
  setStatus('Saved. Updating your website now — this takes about a minute. You can close this page.', 'saving');
  const tick = async () => {
    let live = false;
    try {
      const r = await fetch(`/hours.json?check=${Date.now()}`, { cache: 'no-store' });
      live = r.ok && (await r.json()).rev === rev;
    } catch { /* try again */ }
    if (gen !== liveGen) return; // a newer save (or an edit) took over
    if (isDirty()) { liveTimer = null; return; }
    if (live) {
      liveTimer = null;
      const a = Object.assign(document.createElement('a'), { href: '/visit', target: '_blank', rel: 'noopener', textContent: 'See it' });
      setStatus('', 'live', [document.createTextNode('✓ Live on your website now. '), a]);
      return;
    }
    if (Date.now() - started > 4 * 60 * 1000) {
      liveTimer = null;
      setStatus('Saved. Your website is taking longer than usual to update. It should catch up in a few minutes. If it hasn’t in 10 minutes, text Ryder.', 'error');
      return;
    }
    liveTimer = setTimeout(tick, 5000);
  };
  liveTimer = setTimeout(tick, 4000);
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------------- go ---------------- */
document.querySelectorAll('select[data-time]').forEach(fillTimes);
buildDays();
start();
