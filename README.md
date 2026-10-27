# 3Sons-Catering-mockup — 3 Sons Bar-B-Q website (design preview)

The catering concept Chris picked on the 26 Oct 2026 review call, now a 7-page site. Plain HTML, no build step on Vercel.

Pages: `/` home · `/menu` · `/catering` · `/happy-hour` · `/visit` · `/faq` · `/terms`

## How to change it
1. Edit `_build/build.py` (shared head, menu bar, footer, map, announcement bar, photo links, schema) or `_build/pages/<page>.html` (each page's content).
2. Run `python3 _build/build.py` (needs Python 3 and `bs4` for the .md copies — run it in the cloud workspace if the Mac's Python is too old).
3. Never hand-edit the `.html` or `.md` files at the root. The next build overwrites them.

`assets/site.css` and `assets/site.js` are edited directly. Bump `VER` in build.py after changing them.

## Switches in build.py
- `ANNOUNCEMENT` — the orange bar at the top. Set to `None` to hide.
- `SITE` — the domain serving the pages. Link-preview images and canonical links use it. Change it at launch.
- `IMG` — owner photos from the Google Business Profile, hotlinked for the preview. Swap for Chris's files before launch.

## Not for search (on purpose)
`noindex` meta tag on every page, `X-Robots-Tag` header in `vercel.json`, `robots.txt` blocks all. `.vercelignore` keeps `_build/` and this README off the public site.

## Before launch
- Swap hotlinked photos for files from Chris. Flip noindex. Change `SITE`. Add `llms.txt`, `llms-full.txt`, `agents.md`.
- Hook up the menu to MustHave Menus (blocked until menu access exists) and pick the editing setup (CMS) for hours, prices and announcements.
- Honey Cart stays a click-through link until the design is final.

Built by AI Syndicate — https://aisyndicate.com
