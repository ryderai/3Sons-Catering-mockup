# 3Sons-Catering-mockup — 3 Sons Bar-B-Q website (design preview)

The catering concept Chris picked on the 26 Oct 2026 review call: 8 pages plus the owner's hours editor.

Pages: `/` home · `/menu` · `/catering` · `/happy-hour` · `/visit` · `/faq` · `/terms` · `/accessibility` · `/edit-hours` (owner only, password)

## ⚠️ Before every push: `git pull --rebase` first
The owner's hours editor saves by making a commit on `main` (it changes `hours.json`).
So GitHub may be ahead of your Mac. Always pull first. **Never `git push --force`** — it would erase the owner's hours.
**Never hand-edit or copy over `hours.json`.** The editor owns it.

## How to change the pages
1. Edit `_build/build.py` (shared head, menu bar, footer, map, announcement bar, photo links, schema) or `_build/pages/<page>.html` (each page's content).
2. Run `python3 _build/build.py` (needs Python 3, `bs4` and Node — run it in the cloud workspace if the Mac's Python is too old).
   It writes every page + its `.md` copy, then runs `scripts/apply-hours.js --in-place` to fill in the hours.
3. Never hand-edit the `.html` or `.md` files at the root (except `edit-hours.html`, which is hand-written). The next build overwrites them.

`assets/site.css` and `assets/site.js` are edited directly. Bump `VER` in build.py after changing them.

## The hours editor (/edit-hours) — how it works
- **Where hours live:** `hours.json` (regular week, special days, holiday line, extra note).
- **Owner saves** at `/edit-hours` → `api/hours.js` checks it → commits `hours.json` to GitHub `main` → Vercel redeploys (~1 minute).
- **Vercel's build** (`vercel.json` → `node scripts/apply-hours.js`) copies the site into `public/` and writes the hours into:
  every footer, the home "Open" tile, Visit (top tile, hours list, "Coming up" special days), Happy Hour, two FAQ answers,
  the hidden Restaurant schema (`openingHoursSpecification` + `specialOpeningHoursSpecification`) and the FAQ schema, and the `.md` copies.
  Hours sit between `<!--h:key-->` … `<!--/h-->` markers. Keys are listed in `blocks()` in `assets/hours-core.js`.
- **Only the website is published.** `scripts/apply-hours.js` has an allowlist (`ALLOW_NAMES`). A new public root file (llms.txt etc.) must be added there.
- **On the live site,** `assets/hours-live.js` shows "Open now · until 8p" in every footer (Central time) and hides special days once they pass.
- **If `hours.json` is ever broken,** the build stops and Vercel keeps the last good version live.
- **One file of rules** for the browser, the editor, the server and the build: `assets/hours-core.js`.
- **Undo:** the editor's "Recent changes" box, or `git revert` the commit "Hours updated from the website editor".

### Settings it needs (Vercel → Settings → Environment Variables, **Production only**)
| Name | What |
|---|---|
| `EDITOR_PASSWORD` | The owner's password, 16+ characters. Stored in Bitwarden as "3 Sons — Hours editor". Changing it signs everyone out. |
| `EDITOR_SECRET` | 32+ random characters. Signs the login cookie. |
| `GITHUB_TOKEN` | Fine-grained token on `ryderai`, this repo only, Contents: Read and write. Expires — calendar the date. |

Optional: `GITHUB_REPO` (default `ryderai/3Sons-Catering-mockup`), `GITHUB_BRANCH` (default `main`).
Preview deployments refuse to edit (they return "not switched on") on purpose.

### Tests
- `node --test _build/tests/` — rules, build step and API against a fake GitHub (39 tests).
- `AXE_PATH=…/axe.min.js node _build/tests/e2e.mjs` — real browser: sign in, change, save, "redeploy", check every page (224 checks).

## Switches in build.py
- `ANNOUNCEMENT` — the orange bar at the top. Set to `None` to hide.
- `SITE` — the domain serving the pages. Link-preview images and canonical links use it. Change it at launch.
- `IMG` — owner photos from the Google Business Profile, hotlinked for the preview. Swap for Chris's files before launch.

## Not for search (on purpose)
`noindex` meta tag on every page, `X-Robots-Tag` header in `vercel.json`, `robots.txt` blocks all. At launch keep `/edit-hours` and `/api/` blocked in robots.txt (the editor page keeps its own noindex tag).

## Before launch
- Swap hotlinked photos for files from Chris. Flip noindex. Change `SITE`. Add `llms.txt`, `llms-full.txt`, `agents.md` (they're already on the publish allowlist).
- Hook up the menu to MustHave Menus (blocked until menu access exists).
- Happy hour times (Après 2p–5p) are NOT in the editor yet. They're written into the pages and a link-preview image.
- Honey Cart stays a click-through link until the design is final.

Built by AI Syndicate — https://aisyndicate.com
