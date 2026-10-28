#!/usr/bin/env python3
"""3 Sons Bar-B-Q — catering concept site builder.

Edit the files in _build/ (this script and _build/pages/*.html), then run:
    python3 _build/build.py
It writes every page (*.html) and its .md copy at the site root, then runs
scripts/apply-hours.js to fill in the hours from /hours.json.
Never hand-edit those files — the next build overwrites them.
Never hand-edit /hours.json either — the owner's editor at /edit-hours owns it.

Built by AI Syndicate — https://aisyndicate.com
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "_build" / "pages"

# The domain actually serving the pages. Link-preview images must live here.
SITE = "https://3sons-catering-mockup.vercel.app"
VER = "20261027b"  # bump to bust caches on CSS/JS changes

LOGO = "https://cdn.prod.website-files.com/63ef93a7cfa2363d85e102e3/63efa35fa120a6052b8ee844_3sons-logo-white-type.svg"
TEL = "+18502786082"
TEL_TXT = "(850) 278-6082"
EMAIL = "brisket@3sonsbarbq.com"
MAPS_DIR = "https://www.google.com/maps/dir/?api=1&amp;destination=3+Sons+Bar-B-Q%2C+6931+W+County+Hwy+30A%2C+Santa+Rosa+Beach%2C+FL+32459"
HONEYCART = "https://3sonsbar-b-q.gethoneycart.com/"
# Chris's Must Have Menus design, the same one his current site embeds (read 26 Oct 2026). Swap for the official embed code when CJ gets it.
MHM = "https://ohbz.com/design/7f1d45e8-f7d0-4456-a755-2c0f512efbd5"
GIFT = "https://3sonsbarbq.cardfoundry.com/"
CAREERS = "https://jobs.gusto.com/boards/three-sons-bbq-30a-4420b12b-75fb-4669-8c23-14211de2de90"

# Owner photos from the 3 Sons Bar-B-Q Google Business Profile ("By owner"), read 26 Oct 2026.
# Hotlinked for the preview only. Swap for files Chris sends before launch.
IMG = {
    "BAR1": "https://lh3.googleusercontent.com/gps-cs-s/ANWiy9RHpgfWZO4an_NAP1G7V-MV1CqnOy6KKntn_32-j5sXNyfzFASHZVxSQ9s7tMFSpXGdVHEWbNpL602T8zoK59OVq1z2wbjKphVgHD-Nw7-mtBOTaqhHAB3kPRQrJP-T1FtujCM",
    "BAR2": "https://lh3.googleusercontent.com/gps-cs-s/ANWiy9QLMXmhXzcOjFxsaDBj5j655PPK9a2hqKYZl3VEV0-HOhfWapDWWIRcMypyAJmOD5q8jEDoqd4-oQeSQzs9wYFZrO0ysdjSHB_GOtXI-nuch1tKAkpoissfXrQfNS8ljeE59LVYow",
    "DECK": "https://lh3.googleusercontent.com/gps-cs-s/ANWiy9Tq0-USHhij2zqblXgQzd9CAOqZ0DPw15IPpcBOkGOy-yQzzhomc7CQ9NgtZAnWO_rju0Gwp_AYPFgEa-gtedi5O4YKsQF36Z8JJmdZLNeh0yRJt7YXhTc7jGLtXbPqOdB1K17T",
    "LOT":  "https://lh3.googleusercontent.com/gps-cs-s/ANWiy9QlLhE2v5Z7Yg5actHX91zeTt2gPqFrscIpqHF0mg502b7p5h9bgJRPrx7xfFnA7Olyv6hfhMMUc5AQBnFoQV7j98Dx82XnTNXuwuvRenAJ1sapmVvkVFVaK8W0GrneVENsboM5Qg",
    "DUSK": "https://lh3.googleusercontent.com/gps-cs-s/ANWiy9Q08pOxWx4WRY8-szAzPXSug2XRfw6FebWIGBpzo12QQXWYcjV53bRaSUYpx_Ki4PVwvRfxHGfT4tl8hRj1L8KtmtaHpYJ5Xtsil3TJ0NQ3sSSSuNzY52fXdQN5WTKUGqeLNz9RoA",
    "SIGN": "https://lh3.googleusercontent.com/gps-cs-s/ANWiy9TVlh0vJdUTqYYTSmk2bnaAkYGrxE8Q3h-L3O2aEqr1m_RgvHLm3kvo-uCYOGd0txLCEaEwARqvf6zOlfur6-U8UVhawcNps2mh_6xkY0KMDhgb_YYw9fl6gkZHxOGCPMwX2jo",
}

RESTAURANT_ID = "https://3sonsbarbq.com/#restaurant"
AMENITIES = [  # Google Business Profile "About" tab, read 26 Oct 2026
    "Free parking lot", "Wheelchair-accessible entrance",
    "Wheelchair-accessible parking lot", "Wheelchair-accessible restroom",
    "Wheelchair-accessible seating", "Outdoor seating", "Full-service bar", "Kids' menu",
]

RESTAURANT = {
    "@type": "Restaurant", "@id": RESTAURANT_ID, "name": "3 Sons Bar-B-Q",
    "url": "https://www.3sonsbarbq.com/", "telephone": "+1-850-278-6082", "email": EMAIL,
    "servesCuisine": ["Barbecue", "Gulf Coast barbecue"], "priceRange": "$10–20",
    "foundingDate": "2013", "acceptsReservations": False,
    "image": "https://cdn.prod.website-files.com/63ef93a7cfa2363d85e102e3/64e62e63608f42e274dd1ce8_3Sons-catering-1.webp",
    "logo": LOGO,
    "address": {"@type": "PostalAddress", "streetAddress": "6931 W County Hwy 30A",
                "addressLocality": "Santa Rosa Beach", "addressRegion": "FL",
                "postalCode": "32459", "addressCountry": "US"},
    "geo": {"@type": "GeoCoordinates", "latitude": 30.3631206, "longitude": -86.265578},
    "hasMap": "https://maps.google.com/?cid=15350797986386224004",
    # Placeholder only: scripts/apply-hours.js fills the real hours from /hours.json on every build.
    "openingHoursSpecification": [{"@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "opens": "11:00", "closes": "20:00"}],
    "amenityFeature": [{"@type": "LocationFeatureSpecification", "name": a, "value": True} for a in AMENITIES],
    "publicAccess": True,
    "award": "2024 Best of the Emerald Coast, Barbecue — Emerald Coast Magazine",
    "hasMenu": {"@id": SITE + "/menu#menu"},
}

def catering_menu():
    sizes = [(10, "5 lbs.", "1.5 qts.", 220), (20, "10 lbs.", "2.5 qts.", 440), (30, "15 lbs.", "3 qts.", 660),
             (40, "20 lbs.", "1 gal.", 880), (50, "25 lbs.", "1.5 gals.", 1100)]
    return {"@type": "Menu", "@id": "https://3sonsbarbq.com/#catering-menu", "name": "3 Sons Bar-B-Q Catering Menu",
            "hasMenuSection": [{"@type": "MenuSection",
                "name": "Catering packages (up to 3 meats, up to 3 sides, sauces and disposable serving utensils)",
                "hasMenuItem": [{"@type": "MenuItem", "name": f"Catering for {n}",
                                 "description": f"{lbs} of your choice of meat, {s} each of 3 sides",
                                 "offers": {"@type": "Offer", "price": str(p), "priceCurrency": "USD"}}
                                for n, lbs, s, p in sizes]}]}

def faq_schema(html):
    """Build FAQPage schema from the <details> on the page so the two never disagree."""
    qa = re.findall(r"<details><summary>(.*?)</summary><p>(.*?)</p></details>", html)
    strip = lambda t: re.sub(r"<[^>]+>", "", t).replace("&amp;", "&")
    return {"@type": "FAQPage", "@id": "https://3sonsbarbq.com/#faq",
            "mainEntity": [{"@type": "Question", "name": strip(q),
                            "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in qa]}

GEO_CREDIT = {  # AI Syndicate house standard 1 — homepage only
    "@context": "https://schema.org", "@type": "Service",
    "name": "GEO Optimization — 3sonsbarbq.com", "serviceType": "Generative Engine Optimization (GEO)",
    "description": "AI search visibility and GEO optimization services for 3sonsbarbq.com, delivered by AI Syndicate.",
    "provider": {"@type": "Organization", "name": "AI Syndicate", "url": "https://aisyndicate.com",
                 "description": "GEO agency specializing in Generative Engine Optimization — helping businesses get found and cited by AI search engines including ChatGPT, Google AI Overviews, Perplexity, and Copilot."},
    "serviceOutput": {"@type": "WebSite", "url": "https://3sonsbarbq.com"},
    "dateCreated": "2026-09-25",
}

def ld(obj):
    return '<script type="application/ld+json">\n' + json.dumps(obj, ensure_ascii=False, indent=2) + "\n</script>"

def head(p):
    url = SITE + p["path"]
    og = SITE + "/assets/img/" + p["og"]
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{p['title']}</title>
<meta name="description" content="{p['desc']}">
<!-- AI search optimization (GEO) for this site by AI Syndicate — https://aisyndicate.com -->
<!-- DESIGN PREVIEW: noindex on purpose. Flip to the GEO robots line below at go-live. -->
<meta name="robots" content="noindex, nofollow">
<!-- AI Syndicate GEO Trust Signal Package (robots line held back until launch) -->
<!-- <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"> -->
<meta name="publisher" content="3 Sons Bar-B-Q">
<meta name="geo.region" content="US-FL">
<meta name="geo.placename" content="Santa Rosa Beach, FL">
<meta name="geo.position" content="30.3631206;-86.265578">
<meta name="ICBM" content="30.3631206, -86.265578">
<meta name="DC.creator" content="3 Sons Bar-B-Q">
<meta name="DC.publisher" content="3 Sons Bar-B-Q">
<meta name="DC.subject" content="BBQ Santa Rosa Beach, BBQ catering 30A, barbecue restaurant 30A, happy hour Santa Rosa Beach, smoked brisket 30A">
<meta name="DC.language" content="en-US">
<link rel="canonical" href="{url}">
<link rel="alternate" type="text/markdown" href="{p['md']}">
<meta name="theme-color" content="#AA182C">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="3 Sons Bar-B-Q">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{p['og_title']}">
<meta property="og:description" content="{p['og_desc']}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{p['og_alt']}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{p['og_title']}">
<meta name="twitter:description" content="{p['og_desc']}">
<meta name="twitter:image" content="{og}">
<meta name="twitter:image:alt" content="{p['og_alt']}">
<link rel="preload" href="/assets/fonts/alfa-slab-one-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/bitter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v={VER}">
{p['schema']}
</head>"""

# Order from CJ's round-2 brief (26 Oct 2026): Catering · Menu · Visit · Happy Hour · FAQ
NAV = [("/catering", "Catering", "catering"), ("/menu", "Menu", "menu"), ("/visit", "Visit", "visit"),
       ("/happy-hour", "Happy Hour", "happy-hour"), ("/faq", "FAQ", "faq")]

# ---- Announcement bar (the first thing a future CMS should edit). Set to None to hide it.
# Source: 3sonsbarbq.com homepage button "Thanksgiving Pre-Orders & Online Catering Orders" (read 26 Oct 2026).
ANNOUNCEMENT = {"text": "Thanksgiving pre-orders are open.", "link_text": "Pre-order online",
                "href": HONEYCART, "external": True}

def announcement():
    a = ANNOUNCEMENT
    if not a:
        return ""
    ext = ' target="_blank" rel="noopener"' if a.get("external") else ""
    lab = f' aria-label="{a["link_text"]} (opens in a new tab)"' if a.get("external") else ""
    return (f'<aside class="announce" id="announce" aria-label="Announcement" data-key="{a["text"]}"><div class="wrap">'
            f'<p>{a["text"]} <a href="{a["href"]}"{ext}{lab}>{a["link_text"]} <span aria-hidden="true">→</span></a></p>'
            f'<button type="button" class="announce__x" aria-label="Dismiss announcement">×</button></div></aside>\n')

def header(current):
    links = []
    for href, label, page in NAV:
        cur = ' aria-current="page"' if page == current else ""
        links.append(f'      <a href="{href}"{cur}>{label}</a>')
    return f"""<body class="no-js">
<a class="skip" href="#main">Skip to content</a>
<aside class="concept" aria-label="Preview note">Design preview for 3 Sons Bar-B-Q · Photos are 3 Sons’ own (Google profile and current site) · Striped boxes are waiting on photos</aside>
{announcement()}
<header class="hdr">
  <div class="wrap">
    <a class="logo" href="/" aria-label="3 Sons Bar-B-Q, home"{' aria-current="page"' if current == "home" else ""}><img src="{LOGO}" alt="" width="140" height="56"></a>
    <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav id="nav" class="nav" aria-label="Main">
{chr(10).join(links)}
      <a class="btn" href="{HONEYCART}" target="_blank" rel="noopener" aria-label="Order catering online (opens in a new tab)">Order Catering</a>
    </nav>
  </div>
  <div class="progress" aria-hidden="true"><span></span></div>
</header>
"""

# The Mile Marker 1 footer Chris picked (from concept B), in the dark theme.
def footer(cta):
    return f"""
<footer class="dest mm-foot" id="find-us" aria-labelledby="dest-h">
  <div class="dest__bg" aria-hidden="true"></div>
  <div class="dest__road" aria-hidden="true"></div>
  <div class="wrap dest__top">
    <p class="eyebrow">Beach. Meat. Repeat.</p>
    <div class="dest__head">
      <span class="dest__sign" aria-hidden="true"><span>30A<b>1</b></span></span>
      <h2 class="dest__word" id="dest-h">See you at <span class="em">Mile Marker 1.</span></h2>
    </div>
    <div class="dest__grid">
      <div>
        <h3>Come find us</h3>
        <address>6931 W County Hwy 30A<br>Santa Rosa Beach, FL 32459</address>
        <p style="margin-top:8px">One mile off US-98 on the west end of 30A. The West End is the Best End.</p>
        <p style="margin-top:8px">Free parking lot · 99 seats · Wheelchair accessible</p>
        <div class="btns"><a class="btn btn--red" href="{MAPS_DIR}" target="_blank" rel="noopener" aria-label="Get directions (opens Google Maps in a new tab)">Get directions</a></div>
      </div>
      <div>
        <h3>Hours</h3>
        <p style="color:var(--ink);font-size:1.125rem"><!--h:summary--><!--/h--></p>
        <p class="hours-now" data-hours-status hidden></p>
        <p><a href="/happy-hour" style="color:inherit">Après 2p–5p daily</a></p>
        <p>Full bar with bourbon and tequila</p>
        <!--h:holidayP--><!--/h-->
      </div>
      <div>
        <h3>Order</h3>
        <a class="big-tel" href="tel:{TEL}">{TEL_TXT}</a>
        <ul>
          <li><a href="{HONEYCART}" target="_blank" rel="noopener" aria-label="Order catering online (opens in a new tab)">Order catering online</a></li>
          <li><a href="mailto:{EMAIL}">{EMAIL}</a></li>
          <li>Restaurant delivery (not catering): 30A Grub to Go &amp; DoorDash</li>
        </ul>
      </div>
      <div>
        <h3>More</h3>
        <ul>
          <li><a href="/menu">Menu</a></li>
          <li><a href="/catering">Catering</a></li>
          <li><a href="/happy-hour">Happy hour</a></li>
          <li><a href="/visit">Visit &amp; parking</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="{GIFT}" target="_blank" rel="noopener" aria-label="Gift cards (opens in a new tab)">Gift cards</a></li>
          <li><a href="{CAREERS}" target="_blank" rel="noopener" aria-label="Careers (opens in a new tab)">Careers</a></li>
          <li><a href="/terms">Terms &amp; Conditions</a></li>
          <li><a href="/accessibility">Accessibility</a></li>
        </ul>
      </div>
    </div>
  </div>
  <div class="wrap dest__bar">
    <span>© 2026 3 Sons Bar-B-Q · Est. 2013 · ★ 4.6 on Google · 2024 Best of the Emerald Coast, Barbecue</span>
    <p class="ai-syndicate-credit">GEO Optimization by <a href="https://aisyndicate.com" target="_blank" rel="noopener" aria-label="AI Syndicate (opens in a new tab)">AI Syndicate</a></p>
    <a href="#main">Back to top ↑</a>
  </div>
</footer>

<div class="callbar" aria-label="Quick actions">
  <a class="btn btn--ghost" href="tel:{TEL}">Call</a>
  {cta}
</div>
<script src="/assets/site.js?v={VER}" defer></script>
<script type="module" src="/assets/hours-live.js?v={VER}"></script>
</body>
</html>
"""

# ---- The "one mile off 98" map. Not to scale. Drawn so the short trip from US-98 stands out
# from the long, slow drive down the rest of 30A.
MAP = """<div class="map rv" id="map">
        <svg viewBox="0 0 1200 360" role="img" aria-labelledby="map-t map-d">
          <title id="map-t">Map: 3 Sons Bar-B-Q is one mile off US-98</title>
          <desc id="map-d">A simple map, not to scale. US-98 runs east and west across the top. County Highway 30A splits off US-98 at its west end and runs along the beach to the east. 3 Sons Bar-B-Q is one mile down 30A from US-98, at Mile Marker 1. The rest of 30A continues east past Dune Allen, Blue Mountain Beach, Grayton Beach and Rosemary Beach to Inlet Beach, where it meets US-98 again.</desc>
          <path class="hwy" d="M20 70 L1180 70"/>
          <path class="slow" d="M420 205 C470 236 520 250 600 256 L1060 270 C1110 272 1140 240 1150 70"/>
          <path class="fast-bed" d="M300 70 C320 130 360 175 420 205"/>
          <path class="draw" id="drawPath" d="M20 70 L300 70 C320 130 360 175 420 205"/>
          <text class="lbl" x="150" y="52" text-anchor="middle">US-98 · from Destin</text>
          <text class="lbl" x="1040" y="52" text-anchor="middle">US-98 · to Panama City Beach</text>
          <g class="town" style="transition-delay:1.6s"><circle cx="300" cy="70" r="9" class="jct"/><text class="small" x="300" y="104" text-anchor="end" dx="-14">30A SPLITS OFF 98</text></g>
          <text class="mile" x="352" y="168" text-anchor="end">1 mile</text>
          <g class="town" style="transition-delay:2.2s"><circle cx="560" cy="250" r="5"/><text x="560" y="286" text-anchor="middle">Dune Allen</text></g>
          <g class="town" style="transition-delay:2.4s"><circle cx="690" cy="259" r="5"/><text x="690" y="295" text-anchor="middle">Blue Mountain</text></g>
          <g class="town" style="transition-delay:2.6s"><circle cx="820" cy="263" r="5"/><text x="820" y="299" text-anchor="middle">Grayton</text></g>
          <g class="town" style="transition-delay:2.8s"><circle cx="950" cy="267" r="5"/><text x="950" y="303" text-anchor="middle">Rosemary</text></g>
          <g class="town" style="transition-delay:3s"><circle cx="1100" cy="262" r="5"/><text x="1100" y="298" text-anchor="middle">Inlet Beach</text></g>
          <text class="slow-lbl" x="800" y="236" text-anchor="middle">THE REST OF 30A · SUMMER TRAFFIC</text>
          <text class="gulf" x="760" y="345" text-anchor="middle">GULF OF MEXICO</text>
          <g transform="translate(420 205)"><g class="pin">
            <circle r="17" fill="#AA182C" stroke="#F5ECDD" stroke-width="4"/>
            <line x1="0" y1="17" x2="0" y2="60" stroke="#F5ECDD" stroke-width="2"/>
            <rect x="-300" y="60" width="314" height="62" rx="3" fill="#AA182C"/>
            <text class="pin-label" x="-284" y="96">3 SONS BAR-B-Q</text>
            <text class="pin-sub" x="-284" y="113">MILE MARKER 1 · 6931 W CO HWY 30A</text>
          </g></g>
        </svg>
        <ol class="map-list">
          <li>US-98 <small>From Destin, Panama City Beach or anywhere along 98</small></li>
          <li>Turn onto the west end of 30A</li>
          <li class="here">3 Sons Bar-B-Q <small>One mile in, at Mile Marker 1</small></li>
          <li class="far">The rest of 30A <small>Dune Allen, Blue Mountain, Grayton, Rosemary, Inlet Beach — you don’t need any of it</small></li>
        </ol>
        <p class="map-note">Simple map, not to scale.</p>
      </div>"""

def fill(html):
    html = html.replace("{{MAP}}", MAP)
    for k, v in IMG.items():
        html = html.replace("{{IMG_" + k + "}}", v)
    html = html.replace("{{MAPS_DIR}}", MAPS_DIR).replace("{{TEL}}", TEL).replace("{{TEL_TXT}}", TEL_TXT) \
               .replace("{{EMAIL}}", EMAIL).replace("{{GIFT}}", GIFT).replace("{{HONEYCART}}", HONEYCART).replace("{{MHM}}", MHM)
    assert "{{" not in html, re.findall(r"\{\{[^}]+\}\}", html)
    return html

def webpage(path, name, extra=None):
    g = {"@context": "https://schema.org", "@graph": [
        RESTAURANT,
        {"@type": "WebPage", "@id": SITE + path + "#webpage", "url": SITE + path, "name": name,
         "isPartOf": {"@type": "WebSite", "name": "3 Sons Bar-B-Q", "url": SITE + "/"},
         "about": {"@id": RESTAURANT_ID}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": SITE + path}]},
    ] + (extra or [])}
    return ld(g)

def faq_from_page(html):
    """FAQPage schema read from the FAQ page itself, so the two can never disagree."""
    strip = lambda t: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t)).replace("&amp;", "&").strip()
    qa = []
    for q, body in re.findall(r'<button class="qa-btn"[^>]*>(.*?)</button></h[23]>\s*<div class="qa-a"[^>]*>(.*?)</div>', html, re.S):
        paras = [strip(p) for p in re.findall(r"<p>(.*?)</p>", body, re.S)]
        paras = [p for p in paras if not p.startswith(("See ", "Directions,"))]
        qa.append((strip(q), " ".join(paras).replace(" See happy hour", "")))
    return {"@type": "FAQPage", "@id": SITE + "/faq#faq",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in qa]}

def menu_schema(html):
    """Menu schema built from the menu page markup."""
    strip = lambda t: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", t)).replace("&amp;", "&").strip()
    sections = []
    # classics: one item per card x meat
    cards = re.findall(r'<article class="mcard[^"]*">\s*<h3>(.*?)</h3><p class="d">(.*?)</p>\s*<ul class="prices">(.*?)</ul>', html, re.S)
    items = []
    for title, desc, ul in cards:
        for name, price in re.findall(r"<span>(.*?)</span><b>\$(\d+(?:\.\d+)?)</b>", ul):
            items.append({"@type": "MenuItem", "name": f"{strip(title)} — {strip(name)}", "description": strip(desc),
                          "offers": {"@type": "Offer", "price": price, "priceCurrency": "USD"}})
    sections.append({"@type": "MenuSection", "name": "BBQ classics", "hasMenuItem": items})
    items = []
    for h3, body in re.findall(r'<article class="spec[^"]*">(?:<span class="badge">.*?</span>)?<h3>(.*?)</h3>(.*?)</article>', html, re.S):
        name = strip(re.sub(r"<b>.*?</b>|<abbr.*?</abbr>", "", h3))
        price = re.search(r"<b>\$(\d+)", h3).group(1)
        gf = "Gluten-free" in h3
        it = {"@type": "MenuItem", "name": name, "description": strip(re.findall(r"<p>(.*?)</p>", body, re.S)[0]),
              "offers": {"@type": "Offer", "price": price, "priceCurrency": "USD"}}
        if gf:
            it["suitableForDiet"] = "https://schema.org/GlutenFreeDiet"
        items.append(it)
    sections.append({"@type": "MenuSection", "name": "Specialties", "hasMenuItem": items})
    return {"@type": "Menu", "@id": SITE + "/menu#menu", "name": "3 Sons Bar-B-Q Menu", "inLanguage": "en-US",
            "hasMenuSection": sections}

CALL_PLAN = '<a class="btn btn--red" href="/catering#planner-sec">Plan catering</a>'
CALL_DIR = f'<a class="btn btn--red" href="{MAPS_DIR}" target="_blank" rel="noopener" aria-label="Get directions (opens Google Maps in a new tab)">Directions</a>'

def to_markdown(title, url, main_html):
    """Plain markdown copy of a page for AI crawlers (house standard 5). Needs bs4."""
    from bs4 import BeautifulSoup
    # Hours markers survive into the .md as <!--h:key--> … <!--/h--> so scripts/apply-hours.js can fill them.
    main_html = re.sub(r"<!--h:specialRow-->.*?<!--/h-->", "<p>\u27e6h:specialMd\u27e7\u27e6/h\u27e7</p>", main_html, flags=re.S)
    main_html = re.sub(r"<!--h:(\w+)-->.*?<!--/h-->", lambda m: "\u27e6h:" + m.group(1) + "\u27e7\u27e6/h\u27e7", main_html, flags=re.S)
    soup = BeautifulSoup(main_html, "html.parser")
    for t in soup.select("svg, script, style, .credit, .photo-credit, nav.toc, nav.menu-jump, .map-note"):
        t.decompose()
    out = [f"# {title}", "", f"Source: {url}", ""]
    seen = set()
    def text(el):
        return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).replace(" .", ".").replace(" ,", ",").strip()
    for el in soup.find_all(["h1", "h2", "h3", "p", "li", "tr", "address", "dt", "dd", "blockquote", "figcaption"]):
        if el.find_parent(["li", "blockquote", "table"]) and el.name != "tr":
            continue
        t = text(el)
        if not t or (t in seen and el.name not in ("li", "tr")):
            continue
        seen.add(t)
        if el.name == "h1": out += ["", f"# {t}", ""]
        elif el.name == "h2": out += ["", f"## {t}", ""]
        elif el.name == "h3": out += ["", f"### {t}", ""]
        elif el.name in ("li", "tr"): out.append(f"- {t}")
        else: out += [t, ""]
    out += ["", "3 Sons Bar-B-Q · 6931 W County Hwy 30A, Santa Rosa Beach, FL 32459 · (850) 278-6082 · brisket@3sonsbarbq.com", ""]
    md = re.sub(r"\n{3,}", "\n\n", "\n".join(out))
    return re.sub("\u27e6h:(\\w+)\u27e7", r"<!--h:\1-->", md).replace("\u27e6/h\u27e7", "<!--/h-->")

def build():
    src = {n: fill((PAGES / f"{n}.html").read_text()) for n in ["home", "menu", "catering", "happy-hour", "visit", "faq", "terms", "accessibility"]}
    menu_restaurant = dict(RESTAURANT, hasMenu={"@id": SITE + "/menu#menu"})
    pages = [
        dict(file="index.html", path="/", current="home", md="index.md", og="og-home.jpg",
             title="3 Sons Bar-B-Q | BBQ, Catering &amp; Happy Hour in Santa Rosa Beach on 30A",
             desc="Gulf Coast ’Q smoked daily at Mile Marker 1 on 30A, one mile off US-98. Brisket, the Slab Wrap, Texas Twinkies, a full-service bar, 99 seats, free parking and catering from $220.",
             og_title="3 Sons Bar-B-Q — Gulf Coast ’Q on 30A",
             og_desc="Smoked daily since 2013, one mile off US-98. Free parking, full bar, après 2p–5p daily, catering from $220.",
             og_alt="3 Sons Bar-B-Q logo over pulled pork and brisket, with the words Gulf Coast ’Q on 30A",
             schema=ld({"@context": "https://schema.org", "@graph": [menu_restaurant]}) + "\n" + ld(GEO_CREDIT),
             main=src["home"], cta=CALL_PLAN),
        dict(file="menu.html", path="/menu", current="menu", md="menu.md", og="og-home.jpg",
             title="Menu | 3 Sons Bar-B-Q · Brisket, Slab Wrap &amp; Texas Twinkies in Santa Rosa Beach",
             desc="The full 3 Sons Bar-B-Q menu with prices: plates, sandwiches, the Slab Wrap, Texas Twinkies, Trailer Tacos, meat by the pound, sides, kids’ meals and desserts.",
             og_title="The 3 Sons Bar-B-Q menu",
             og_desc="Brisket is king. Plates, the Slab Wrap, Texas Twinkies, meat by the pound and more, smoked daily on 30A.",
             og_alt="3 Sons Bar-B-Q logo over pulled pork and brisket, with the words Gulf Coast ’Q on 30A",
             schema=webpage("/menu", "Menu", [menu_schema(src["menu"])]),
             main=src["menu"], cta=CALL_PLAN),
        dict(file="catering.html", path="/catering", current="catering", md="catering.md", og="og-home.jpg",
             title="BBQ Catering in Santa Rosa Beach &amp; 30A | 3 Sons Bar-B-Q",
             desc="BBQ catering for offices, birthdays, anniversaries and rental houses on 30A. Packages for 10 to 50 people from $220, or build a custom order. Plan it and see the day to order by.",
             og_title="BBQ catering from 3 Sons Bar-B-Q",
             og_desc="Packages for 10 to 50 people from $220, or a custom order. Pick up at Mile Marker 1 on 30A.",
             og_alt="3 Sons Bar-B-Q logo over pulled pork and brisket, with the words Gulf Coast ’Q on 30A",
             schema=webpage("/catering", "Catering", [catering_menu()]), main=src["catering"], cta=CALL_PLAN.replace("/catering#planner-sec", "#planner-sec")),
        dict(file="happy-hour.html", path="/happy-hour", current="happy-hour", md="happy-hour.md", og="og-happy-hour.jpg",
             title="Happy Hour at 3 Sons Bar-B-Q | Après 2p–5p Daily · Santa Rosa Beach, 30A",
             desc="Après 2p–5p every day at the 3 Sons Bar-B-Q full-service bar. Bourbon, tequila, cocktails, beer and wine, TVs over the bar, free parking, at Mile Marker 1 on 30A.",
             og_title="Happy Hour at 3 Sons Bar-B-Q — Après 2p–5p daily",
             og_desc="Full-service bar, bourbon and tequila, TVs over the bar. Mile Marker 1 on 30A, Santa Rosa Beach.",
             og_alt="The lit 3 Sons Bar-B-Q sign at dusk with the words Après 2p–5p daily",
             schema=webpage("/happy-hour", "Happy hour"), main=src["happy-hour"], cta=CALL_DIR),
        dict(file="visit.html", path="/visit", current="visit", md="visit.md", og="og-visit.jpg",
             title="Visit 3 Sons Bar-B-Q | Parking, Directions &amp; Accessibility · Mile Marker 1 on 30A",
             desc="3 Sons Bar-B-Q is one mile off US-98 at Mile Marker 1 on 30A. Free parking lot, 99 seats, wheelchair-accessible entrance and ramp, no reservations needed.",
             og_title="Visit 3 Sons Bar-B-Q — one mile off US-98",
             og_desc="Free parking lot, 99 seats, wheelchair accessible. Mile Marker 1 on 30A, Santa Rosa Beach.",
             og_alt="The 3 Sons Bar-B-Q building and parking lot with the words One mile off 98",
             schema=webpage("/visit", "Visit"), main=src["visit"], cta=CALL_DIR),
        dict(file="faq.html", path="/faq", current="faq", md="faq.md", og="og-home.jpg",
             title="FAQ | 3 Sons Bar-B-Q · Catering, Parking, Reservations &amp; More",
             desc="Answers about 3 Sons Bar-B-Q: catering, location, barbecue style, vegetarian and gluten-free options, reservations, takeout, delivery, holiday hours, kids’ menu, parking and accessibility.",
             og_title="3 Sons Bar-B-Q — questions, answered",
             og_desc="Catering, parking, reservations, takeout, delivery, holiday hours and more.",
             og_alt="3 Sons Bar-B-Q logo over pulled pork and brisket, with the words Gulf Coast ’Q on 30A",
             schema=webpage("/faq", "FAQ", [faq_from_page(src["faq"])]), main=src["faq"], cta=CALL_PLAN),
        dict(file="terms.html", path="/terms", current="terms", md="terms.md", og="og-terms.jpg",
             title="Terms &amp; Conditions, Gift Cards and Accessibility | 3 Sons Bar-B-Q",
             desc="3 Sons Bar-B-Q terms and conditions: privacy, security, delivery and gift card return policies.",
             og_title="Terms & Conditions — 3 Sons Bar-B-Q",
             og_desc="Privacy, security, delivery and gift card return policies at 3 Sons Bar-B-Q.",
             og_alt="3 Sons Bar-B-Q logo with the words Terms and Conditions",
             schema=webpage("/terms", "Terms & Conditions"), main=src["terms"], cta=CALL_PLAN),
        dict(file="accessibility.html", path="/accessibility", current="accessibility", md="accessibility.md", og="og-accessibility.jpg",
             title="Accessibility | 3 Sons Bar-B-Q",
             desc="3 Sons Bar-B-Q accessibility: a ramp, a wheelchair-accessible entrance, parking, restroom and seating, and a website built to WCAG 2.1 AA. Call (850) 278-6082 for help.",
             og_title="Accessibility at 3 Sons Bar-B-Q",
             og_desc="Ramp, wheelchair-accessible entrance, parking, restroom and seating. Need help with the website? Call us.",
             og_alt="3 Sons Bar-B-Q logo with the word Accessibility",
             schema=webpage("/accessibility", "Accessibility"), main=src["accessibility"], cta=CALL_DIR),
    ]
    for p in pages:
        out = head(p) + "\n" + header(p["current"]) + "\n" + p["main"].rstrip() + "\n" + footer(p["cta"])
        (ROOT / p["file"]).write_text(out)
        md = to_markdown(re.sub(r"&amp;", "&", p["title"]), SITE + p["path"], p["main"])
        (ROOT / p["md"]).write_text(md)
        print("wrote", p["file"], len(out), "+", p["md"], len(md))

    manifest = {"name": "3 Sons Bar-B-Q", "short_name": "3 Sons", "start_url": "/", "display": "browser",
                "background_color": "#14100D", "theme_color": "#AA182C",
                "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"},
                          {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png"},
                          {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    (ROOT / "site.webmanifest").write_text(json.dumps(manifest, indent=2) + "\n")

if __name__ == "__main__":
    build()
    # Fill the hours from /hours.json into the pages, the hidden schema and the .md copies.
    import subprocess
    subprocess.run(["node", "scripts/apply-hours.js", "--in-place"], check=True, cwd=ROOT)
