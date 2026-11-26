#!/usr/bin/env node
/* 3 Sons Bar-B-Q — build step.
 *
 * Reads /hours.json and writes the hours into every page, the hidden Google/AI code (JSON-LD),
 * the .md copies and llms.txt / llms-full.txt.
 *
 *   node scripts/apply-hours.js            → Vercel's build: copies the site into public/ with the hours filled in
 *   node scripts/apply-hours.js --in-place → fills the files in the repo itself (run by _build/build.py)
 *
 * If hours.json is broken, this stops with an error. Vercel then keeps the last good version live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, todayISO, applyToHtml, applyToMd } from '../assets/hours-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inPlace = process.argv.includes('--in-place');
const OUT = inPlace ? ROOT : path.join(ROOT, 'public');

// ONLY these get published. Anything else in the repo (notes, push steps, tools, server code) stays private.
// Adding a new public file at the root (llms.txt, sitemap.xml…)? Add its name here.
const ALLOW_NAMES = new Set(['assets', 'hours.json', 'robots.txt', 'site.webmanifest', 'favicon.ico',
  'llms.txt', 'llms-full.txt', 'agents.md', 'sitemap.xml', 'BingSiteAuth.xml']);
const publish = (name, all) =>
  ALLOW_NAMES.has(name) ||
  /^(favicon-\d+|apple-touch-icon|icon-[\w-]+)\.png$/.test(name) ||
  (/^[a-z0-9-]+\.html$/.test(name)) ||
  (/^[a-z0-9-]+\.md$/.test(name) && all.includes(name.replace(/\.md$/, '.html'))); // a page's .md copy

const today = todayISO();
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'hours.json'), 'utf8'));
const { ok, errors, value } = validate(raw, { today });
if (!ok) {
  console.error('hours.json has problems — stopping so the live site keeps its last good version:');
  for (const e of errors) console.error(' -', e.field, e.message);
  process.exit(1);
}

if (!inPlace) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT);
  const all = fs.readdirSync(ROOT);
  const skipped = [];
  for (const name of all) {
    if (!publish(name, all)) { skipped.push(name); continue; }
    fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true });
  }
  console.log('not published (private):', skipped.join(', '));
}

let filled = 0;
const outNames = fs.readdirSync(OUT);
for (const name of outNames) {
  const file = path.join(OUT, name);
  if (!/\.(html|md|txt)$/.test(name) || !fs.statSync(file).isFile()) continue;
  if (inPlace && !publish(name, outNames)) continue; // e.g. README.md documents the markers; it is not a page
  const before = fs.readFileSync(file, 'utf8');
  if (!before.includes('<!--h:')) continue;
  const after = name.endsWith('.html') ? applyToHtml(before, value, today) : applyToMd(before, value, today);
  if (after !== before) fs.writeFileSync(file, after);
  filled++;
}

// On Vercel: stop the deploy if a page or the CSS points at an image that is not in the repo
// (e.g. _build/fetch-images.sh was not run). Vercel then keeps the last good version live.
if (!inPlace && process.env.VERCEL) {
  const missing = new Set();
  for (const name of fs.readdirSync(OUT).filter((n) => /\.html$/.test(n)).concat(['assets/site.css'])) {
    const text = fs.readFileSync(path.join(OUT, name), 'utf8');
    for (const m of text.matchAll(/\/(assets\/img\/[^"')?\s]+)/g)) if (!fs.existsSync(path.join(OUT, m[1]))) missing.add(m[1]);
  }
  if (missing.size) { console.error('Missing images — run _build/fetch-images.sh and push again:\n - ' + [...missing].join('\n - ')); process.exit(1); }
}

console.log(`hours applied to ${filled} files (${inPlace ? 'in place' : 'public/'}) · today ${today} · rev ${raw.rev || 'none'}`);
