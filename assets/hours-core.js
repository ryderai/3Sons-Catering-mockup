/* 3 Sons Bar-B-Q — hours logic. Built by AI Syndicate.
 *
 * ONE file, used in four places so they can never disagree:
 *   1. the website (assets/hours-live.js)  → "Open now" line + upcoming special days
 *   2. the owner's editor (/edit-hours)     → time lists, preview, checks before saving
 *   3. the save API (api/hours.js)          → the same checks again on the server
 *   4. the build step (scripts/apply-hours.js) → writes the hours into every page,
 *      the hidden Google/AI code (JSON-LD) and the .md copies
 *
 * The hours themselves live in /hours.json. Only the editor writes that file.
 */

export const TZ = 'America/Chicago'; // Santa Rosa Beach, FL (Walton County) is on Central time
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_NAME = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
export const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const LIMITS = { label: 40, holidayLine: 120, note: 160, special: 40, maxDaysAhead: 731 };
export const TIME_FIRST = '05:00';
export const TIME_LAST = '23:30';
export const STEP_MIN = 30;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const JS_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/* ---------------- times ---------------- */

export function toMin(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function isTime(t) {
  if (typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return false;
  const m = toMin(t);
  return m >= toMin(TIME_FIRST) && m <= toMin(TIME_LAST) && m % STEP_MIN === 0;
}

/** Every time the owner can pick: 5:00 AM to 11:30 PM, every 30 minutes. */
export function timeOptions() {
  const out = [];
  for (let m = toMin(TIME_FIRST); m <= toMin(TIME_LAST); m += STEP_MIN) {
    out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
  }
  return out;
}

/** "11:00" → "11a", "20:00" → "8p", "11:30" → "11:30a", "12:00" → "12p" (the site's own style). */
export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const s = h < 12 ? 'a' : 'p';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${s}` : `${h12}${s}`;
}

/** "20:00" → "8:00 PM" (for the editor's drop-downs). */
export function fmtTimeLong(t) {
  const [h, m] = t.split(':').map(Number);
  const s = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  if (h === 12 && m === 0) return '12:00 PM (noon)';
  return `${h12}:${String(m).padStart(2, '0')} ${s}`;
}

export const fmtRange = (from, to) => `${fmtTime(from)}–${fmtTime(to)}`;

/* ---------------- dates (always Central time) ---------------- */

function parts(now, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const x of f.formatToParts(now)) p[x.type] = x.value;
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute) };
}

/** Today's date in Santa Rosa Beach, as "YYYY-MM-DD". */
export function todayISO(now = new Date(), tz = TZ) {
  return parts(now, tz).date;
}

export function nowParts(now = new Date(), tz = TZ) {
  return parts(now, tz);
}

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
}

export function dayOf(iso) {
  return JS_DOW[new Date(iso + 'T12:00:00Z').getUTCDay()];
}

/** "2026-11-26" → "Thu, Nov 26" (adds the year when it isn't this year). */
export function fmtDate(iso, today) {
  const d = new Date(iso + 'T12:00:00Z');
  const base = `${DAY_SHORT[dayOf(iso)]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return today && today.slice(0, 4) !== iso.slice(0, 4) ? `${base}, ${iso.slice(0, 4)}` : base;
}

/* ---------------- cleaning + checking what the owner typed ---------------- */

/** Plain one-line text: no control characters, single spaces. (< and > are kept — every output escapes them.) */
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.slice(0, max).trim();
}

export function defaultHours() {
  const week = {};
  for (const d of DAYS) week[d] = { open: true, from: '11:00', to: '20:00' };
  return {
    version: 1, timezone: TZ, week, special: [],
    holidayLine: 'Closed Thanksgiving & Christmas Day',
    note: 'We stay open a little later in summer, so call to check',
  };
}

/**
 * Checks a full hours object. Returns { ok, errors: [{field, message}], value }.
 * `value` is the cleaned copy that gets saved. Special days before `today` are dropped
 * on purpose (they're over), so the list never fills up with old dates.
 */
export function validate(input, { today = todayISO() } = {}) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: [{ field: 'hours', message: 'The hours were missing or broken.' }], value: null };
  }
  const value = { version: 1, timezone: TZ, week: {}, special: [], holidayLine: '', note: '' };

  const week = input.week && typeof input.week === 'object' ? input.week : {};
  for (const d of DAYS) {
    const w = week[d];
    if (!w || typeof w !== 'object') { err(`week.${d}`, `${DAY_NAME[d]} is missing.`); continue; }
    const open = w.open === true;
    let { from, to } = w;
    if (open) {
      if (!isTime(from)) err(`week.${d}.from`, `Pick an opening time for ${DAY_NAME[d]}.`);
      if (!isTime(to)) err(`week.${d}.to`, `Pick a closing time for ${DAY_NAME[d]}.`);
      if (isTime(from) && isTime(to) && toMin(to) <= toMin(from)) {
        err(`week.${d}.to`, `${DAY_NAME[d]}: closing time has to be after opening time.`);
      }
    } else {
      // Closed days remember their old times so switching back on is one tap.
      if (!isTime(from)) from = '11:00';
      if (!isTime(to) || toMin(to) <= toMin(from)) to = toMin(from) < toMin('20:00') ? '20:00' : TIME_LAST;
    }
    value.week[d] = { open, from, to };
  }

  const special = Array.isArray(input.special) ? input.special : [];
  if (input.special !== undefined && !Array.isArray(input.special)) err('special', 'Special days were broken.');
  const seen = new Set();
  special.forEach((s, i) => {
    const f = `special.${i}`;
    if (!s || typeof s !== 'object') { err(f, 'One of the special days is broken.'); return; }
    if (!isISODate(s.date)) { err(`${f}.date`, 'Pick a date for each special day.'); return; }
    if (s.date < today) return; // already over — drop it
    if (daysBetween(today, s.date) > LIMITS.maxDaysAhead) { err(`${f}.date`, `${fmtDate(s.date, today)} is more than 2 years away.`); return; }
    if (seen.has(s.date)) { err(`${f}.date`, `${fmtDate(s.date, today)} is in the list twice.`); return; }
    seen.add(s.date);
    const label = cleanText(s.label, LIMITS.label);
    const closed = s.closed !== false;
    const row = { date: s.date, label, closed };
    if (!closed) {
      if (!isTime(s.from) || !isTime(s.to)) err(`${f}.from`, `${fmtDate(s.date, today)}: pick the opening and closing times.`);
      else if (toMin(s.to) <= toMin(s.from)) err(`${f}.to`, `${fmtDate(s.date, today)}: closing time has to be after opening time.`);
      row.from = s.from; row.to = s.to;
    }
    value.special.push(row);
  });
  if (value.special.length > LIMITS.special) err('special', `Keep it to ${LIMITS.special} special days or fewer.`);
  value.special.sort((a, b) => (a.date < b.date ? -1 : 1));

  if (input.holidayLine !== undefined && typeof input.holidayLine !== 'string') err('holidayLine', 'The holiday line was broken.');
  if (input.note !== undefined && typeof input.note !== 'string') err('note', 'The note was broken.');
  if (typeof input.holidayLine === 'string' && input.holidayLine.trim().length > LIMITS.holidayLine) err('holidayLine', `The holiday line can be up to ${LIMITS.holidayLine} letters.`);
  if (typeof input.note === 'string' && input.note.trim().length > LIMITS.note) err('note', `The note can be up to ${LIMITS.note} letters.`);
  value.holidayLine = cleanText(input.holidayLine, LIMITS.holidayLine);
  value.note = cleanText(input.note, LIMITS.note);

  if (typeof input.rev === 'string') value.rev = input.rev;
  if (typeof input.updatedAt === 'string') value.updatedAt = input.updatedAt;
  return { ok: errors.length === 0, errors, value };
}

/* ---------------- turning hours into words ---------------- */

function sameTimes(a, b) {
  return a.open === b.open && (!a.open || (a.from === b.from && a.to === b.to));
}

/** Runs of days in a row, e.g. ['mon','tue','wed'] → "Mon–Wed", ['fri','sat'] → "Fri & Sat". */
function runLabel(days) {
  if (days.length === 1) return DAY_SHORT[days[0]];
  if (days.length === 2) return `${DAY_SHORT[days[0]]} & ${DAY_SHORT[days[1]]}`;
  return `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}`;
}

/** A set of days → "Tue–Sun", "Mon, Wed–Sun", "Sat & Sun". */
export function daysText(list) {
  const runs = [];
  let cur = [];
  for (const d of DAYS) {
    if (list.includes(d)) cur.push(d);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.map(runLabel).join(', ');
}

/** Days in a row with the same hours, Monday to Sunday. */
export function groups(week) {
  const out = [];
  for (const d of DAYS) {
    const w = week[d];
    const last = out[out.length - 1];
    if (last && sameTimes(last, w)) last.days.push(d);
    else out.push({ days: [d], open: w.open, from: w.from, to: w.to });
  }
  return out;
}

function joinAnd(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

/**
 * Every wording of the hours the site uses.
 *  summary   "Every day, 11a–8p"           (footer + Visit page)
 *  stat      "11a–8p"                      (big number tiles)
 *  statLabel "Open every day"
 *  sentence  "We’re open 11a–8p daily."    (FAQ answer)
 *  hhOpen    "Open 11a–8p daily"           (Happy hour page)
 */
export function words(h) {
  const week = h.week;
  const open = DAYS.filter((d) => week[d].open);
  const closed = DAYS.filter((d) => !week[d].open);
  if (!open.length) {
    return { summary: 'Closed for now. Please call ahead.', stat: 'Closed', statLabel: 'Call ahead for hours',
             sentence: 'We’re closed for now, so please call ahead.', hhOpen: 'Closed for now. Please call ahead' };
  }
  const first = week[open[0]];
  const same = open.every((d) => week[d].from === first.from && week[d].to === first.to);
  const r = fmtRange(first.from, first.to);
  const od = daysText(open);
  const cd = daysText(closed);
  if (same && open.length === 7) {
    return { summary: `Every day, ${r}`, stat: r, statLabel: 'Open every day',
             sentence: `We’re open ${r} daily.`, hhOpen: `Open ${r} daily` };
  }
  if (same) {
    return { summary: `${od}, ${r} · Closed ${cd}`, stat: r, statLabel: `Open ${od}`,
             sentence: `We’re open ${od}, ${r}, and closed ${cd}.`, hhOpen: `Open ${od}, ${r}` };
  }
  const segs = groups(week).map((g) => (g.open ? `${runLabel(g.days)} ${fmtRange(g.from, g.to)}` : `${runLabel(g.days)} closed`));
  const openSegs = groups(week).filter((g) => g.open).map((g) => `${runLabel(g.days)} ${fmtRange(g.from, g.to)}`);
  const earliest = open.map((d) => week[d].from).sort()[0];
  const latest = open.map((d) => week[d].to).sort().slice(-1)[0];
  return {
    summary: segs.join(' · '),
    stat: fmtRange(earliest, latest),
    statLabel: open.length === 7 ? 'Open every day · hours vary' : `Open ${od} · hours vary`,
    sentence: `We’re open ${joinAnd(openSegs)}${closed.length ? `, and closed ${cd}` : ''}.`,
    hhOpen: `Hours: ${segs.join(' · ')}`,
  };
}

/* ---------------- what's true on a given day / right now ---------------- */

/** The hours for one date: special day first, then the regular week. */
export function hoursOn(h, iso) {
  const s = (h.special || []).find((x) => x.date === iso);
  if (s) return s.closed ? { open: false, special: true, label: s.label } : { open: true, from: s.from, to: s.to, special: true, label: s.label };
  const w = h.week[dayOf(iso)];
  return w.open ? { open: true, from: w.from, to: w.to, special: false } : { open: false, special: false };
}

/** Special days from today on, soonest first. */
export function upcoming(h, today) {
  return (h.special || []).filter((s) => s.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function specialText(s, today) {
  const what = s.closed ? 'Closed' : fmtRange(s.from, s.to);
  return `${fmtDate(s.date, today)} — ${what}${s.label ? ` (${s.label})` : ''}`;
}

/** "Open now · until 8p", "Closed now · opens tomorrow at 11a", "Closed today for Thanksgiving · opens Fri at 11a". */
export function status(h, now = new Date()) {
  const p = nowParts(now, h.timezone || TZ);
  const t = hoursOn(h, p.date);
  if (t.open && p.minutes >= toMin(t.from) && p.minutes < toMin(t.to)) {
    return { open: true, text: `Open now · until ${fmtTime(t.to)}` };
  }
  if (t.open && p.minutes < toMin(t.from)) {
    return { open: false, text: `Closed now · opens today at ${fmtTime(t.from)}` };
  }
  const prefix = !t.open && t.special ? (t.label ? `Closed today for ${t.label}` : 'Closed today') : 'Closed now';
  for (let i = 1; i <= 14; i++) {
    const d = addDays(p.date, i);
    const x = hoursOn(h, d);
    if (!x.open) continue;
    const when = i === 1 ? 'tomorrow' : i < 7 ? DAY_NAME[dayOf(d)] : fmtDate(d, p.date);
    return { open: false, text: `${prefix} · opens ${when} at ${fmtTime(x.from)}` };
  }
  return { open: false, text: `${prefix} · please call for hours` };
}

/* ---------------- Google / AI code (schema.org) ---------------- */

const SCHEMA_DAY = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function schemaWeek(h) {
  const byTime = new Map();
  for (const d of DAYS) {
    const w = h.week[d];
    if (!w.open) continue;
    const k = `${w.from}-${w.to}`;
    if (!byTime.has(k)) byTime.set(k, { '@type': 'OpeningHoursSpecification', dayOfWeek: [], opens: w.from, closes: w.to });
    byTime.get(k).dayOfWeek.push(SCHEMA_DAY[d]);
  }
  return [...byTime.values()];
}

/** Special days, in Google's format. A closed day is opens 00:00 / closes 00:00. */
export function schemaSpecial(h, today) {
  return upcoming(h, today).map((s) => {
    const o = { '@type': 'OpeningHoursSpecification' };
    if (s.label) o.name = s.label;
    o.validFrom = s.date;
    o.validThrough = s.date;
    o.opens = s.closed ? '00:00' : s.from;
    o.closes = s.closed ? '00:00' : s.to;
    return o;
  });
}

/* ---------------- writing hours into pages ---------------- */

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const endWithStop = (s) => (/[.!?]$/.test(s) ? s : s + '.');

/**
 * The text that goes between each <!--h:key--> … <!--/h--> marker.
 * html = for the .html pages (escaped), md = for the .md copies (plain).
 */
export function blocks(h, today) {
  const w = words(h);
  const hol = h.holidayLine || '';
  const note = h.note || '';
  const up = upcoming(h, today);
  const plain = {
    summary: w.summary, stat: w.stat, statLabel: w.statLabel, sentence: w.sentence, hhOpen: w.hhOpen,
    holiday: hol,
    noteSep: note ? ` · ${note}` : '',
    faqHoliday: hol ? endWithStop(/^closed /i.test(hol) ? `We are closed on ${hol.slice(7)}` : hol) : '',
    holidayFull: hol ? `${endWithStop(hol)} Other holiday hours can vary, so call ahead.` : 'Holiday hours can vary, so call ahead.',
    specialMd: up.length ? `Coming up: ${up.map((s) => specialText(s, today)).join('; ')}` : '',
  };
  const html = {};
  for (const [k, v] of Object.entries(plain)) html[k] = esc(v);
  html.holidayP = hol ? `<p style="margin-top:8px">${esc(hol)}</p>` : '';
  html.specialRow = up.length
    ? `<div data-hours-special><dt>Coming up</dt><dd><ul class="hours-special">${up
        .map((s) => `<li data-date="${s.date}">${esc(specialText(s, today))}</li>`).join('')}</ul></dd></div>`
    : '';
  const md = { ...plain, holidayP: '', specialRow: '' };
  return { html, md };
}

const MARK = /<!--h:([A-Za-z]+)-->[\s\S]*?<!--\/h-->/g;

export function fillMarkers(text, values) {
  return text.replace(MARK, (m, key) => {
    if (!(key in values)) throw new Error(`Unknown hours marker "${key}"`);
    return `<!--h:${key}-->${values[key]}<!--/h-->`;
  });
}

/** FAQPage answers, read from the FAQ page itself (same rules as _build/build.py faq_from_page). */
export function faqFromHtml(html) {
  const strip = (t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim();
  const out = [];
  const re = /<button class="qa-btn"[^>]*>([\s\S]*?)<\/button><\/h[23]>\s*<div class="qa-a"[^>]*>([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html))) {
    const paras = [...m[2].matchAll(/<p>([\s\S]*?)<\/p>/g)].map((x) => strip(x[1]))
      .filter((p) => !p.startsWith('See ') && !p.startsWith('Directions,'));
    out.push({ '@type': 'Question', name: strip(m[1]),
               acceptedAnswer: { '@type': 'Answer', text: paras.join(' ').split(' See happy hour').join('') } });
  }
  return out;
}

function walk(node, fn) {
  if (Array.isArray(node)) { node.forEach((n) => walk(n, fn)); return; }
  if (node && typeof node === 'object') {
    fn(node);
    if (Array.isArray(node['@graph'])) walk(node['@graph'], fn);
  }
}

export function ldJson(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

/** Rewrites the hidden schema blocks: Restaurant hours + special days, and the FAQ answers. */
export function updateJsonLd(html, h, today) {
  const week = schemaWeek(h);
  const special = schemaSpecial(h, today);
  return html.replace(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/g, (m, a, body, z) => {
    const data = JSON.parse(body);
    let changed = false;
    walk(data, (n) => {
      if (n['@type'] === 'Restaurant') {
        n.openingHoursSpecification = week;
        if (special.length) n.specialOpeningHoursSpecification = special;
        else delete n.specialOpeningHoursSpecification;
        changed = true;
      }
      if (n['@type'] === 'FAQPage') {
        n.mainEntity = faqFromHtml(html);
        changed = true;
      }
    });
    return changed ? a + ldJson(data) + z : m;
  });
}

export function applyToHtml(html, h, today) {
  const { html: v } = blocks(h, today);
  return updateJsonLd(fillMarkers(html, v), h, today);
}

export function applyToMd(md, h, today) {
  return fillMarkers(md, blocks(h, today).md);
}
