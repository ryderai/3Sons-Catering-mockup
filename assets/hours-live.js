/* 3 Sons Bar-B-Q — live hours on the website. Built by AI Syndicate.
 * Shows "Open now · until 8p" in the footer and keeps the Visit page's "Coming up" list current.
 * The hours text itself is already in the page (written at build time), so the site still
 * reads right if this file never runs. */
import { status, upcoming, specialText, todayISO } from './hours-core.js';

const statusEls = document.querySelectorAll('[data-hours-status]');
const specialRow = document.querySelector('[data-hours-special]');

function show(h) {
  const s = status(h);
  statusEls.forEach((el) => {
    el.textContent = s.text;
    el.dataset.open = s.open ? 'yes' : 'no';
    el.hidden = false;
  });
  if (specialRow) {
    const today = todayISO();
    const list = upcoming(h, today);
    const ul = specialRow.querySelector('ul');
    if (!list.length) { specialRow.hidden = true; return; }
    ul.replaceChildren(...list.map((x) => {
      const li = document.createElement('li');
      li.dataset.date = x.date;
      li.textContent = specialText(x, today);
      return li;
    }));
  }
}

if (statusEls.length || specialRow) {
  fetch('/hours.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => { if (h && h.week) show(h); })
    .catch(() => { /* leave the built-in hours as they are */ });
}
