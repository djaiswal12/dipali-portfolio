# CLAUDE.md — working notes for this repo

Context and decisions for anyone (human or agent) picking this up. Read this
before editing. `README.md` covers setup and deployment; this file covers *why
things are the way they are*.

---

## What this is

Dipali Patel's brand design portfolio. A **static export from a visual site
builder** — no framework, no dependencies, no build step. Deployed on Vercel
(Hobby) at `https://dipali-design.digital`.

| File | Role |
|---|---|
| `index.html` | Everything: markup, CSS, and component logic in the `text/x-dc` script at the bottom (~2,700 lines) |
| `support.js` | Builder runtime — template binding, `sc-if` / `sc-for`, event wiring. **Do not edit casually.** |
| `image-slot.js` | `<image-slot>` custom element (shadow DOM) |
| `video-slot.js` | `<video-slot>` custom element |
| `api/contact.js` | Vercel serverless function, contact form |
| `vercel.json` | SPA rewrite, redirects, cache + security headers |

### Template syntax (builder-specific, not any known framework)

- `{{ expr }}` — value interpolation, resolved from `renderVals()`
- `<sc-if value="{{ cond }}">` — conditional
- `<sc-for list="{{ arr }}" as="item">` — iteration
- `onClick="{{ handler }}"` — React-style event names (`onSubmit`, `onInput`,
  `onChange` etc. all work; see the map around line 318 of `support.js`)
- Component is a class extending `DCLogic` with `state` / `setState` /
  `componentDidMount` / `componentDidUpdate` / `componentWillUnmount`

---

## Hard-won gotchas

These have each caused a real bug. Read them.

### 1. Asset paths must be root-absolute

Use `/images/x.webp`, never `images/x.webp`.

Routing gives pages real depth. A relative path on `/work/staedtler` resolves to
`/work/images/x.webp` and 404s. This broke every non-home page once already.
Watch for paths built inline in the script (`'/images/stae-hsn-' + i`), not just
`src=` attributes.

### 2. No boolean-attribute handling

`disabled="{{ isBusy }}"` renders **literally** as `disabled="false"`, which HTML
treats as disabled. There is no attribute value meaning "not disabled".

Use `aria-disabled` plus `pointer-events` and guard in the handler instead. See
the contact submit button.

### 3. No conditional syntax inside attributes

`sc-if` wraps elements; it can't switch an attribute value. Compute the value in
`renderVals()` and interpolate the whole thing — see `contactMsgDisplay`,
`contactBtnCursor`.

### 4. `*/` inside a `/* */` comment

Writing `go*/select*` in a block comment terminates it early and breaks the whole
script. Cost an hour. Same trap in XML comments with `--` (see `og-image.svg`).

### 5. Images only render if declared

`imgSrc(id)` returns `''` unless `id` is in the `SAVED_IMAGES` set **and** the
file exists. Adding a file is two steps: drop it in `images/`, then add the id to
`SAVED_IMAGES`. Undeclared ids render an empty drop placeholder, not an error.

### 6. `image-slot` alt text

The shadow-root `<img>` ships with a hardcoded `alt=""`. `image-slot.js` mirrors
the host's `alt` through, falling back to the `placeholder` attribute. Pass
`loading="eager"` on above-the-fold slots; everything else lazy-loads.

---

## Routing

Added on top of the builder export, which shipped every screen at `/`.

State (`view` / `cat` / `subcat`) maps to URLs via `pathFromState` /
`stateFromPath`. **`componentDidUpdate` is the single sync point** — that's why
all ~30 navigation handlers got history without being individually rewritten.
Don't add `pushState` calls to handlers; just set state.

```
/                                    home
/about  /contact
/work/<category>
/work/<category>/<subcategory>
```

**Depends on the SPA rewrite in `vercel.json`.** Without it, loading `/about`
directly 404s — no such file exists on disk.

**Adding a subcategory:** its slug must be in `ROUTE_SUBCATS` or the router
rejects the URL and drops the visitor on the category landing. `didi` is listed
explicitly there because it's a real subview with no `PASSION_PROJECTS` entry —
exactly the bug this guards against.

`_skipScrollOnce` opts a handler out of the router's scroll-to-top, for handlers
that scroll to their own anchor (`goProgression`, `goAllWork`).

---

## Decisions made, and why

**Absolute asset paths over `<base href="/">`.** One line would have fixed it,
but `<base>` silently rewrites every relative URL on the page including anchors.
Too easy to trip over later.

**Serverless + Resend over a client-side form service.** Keeps the API key
server-side and allows real validation, honeypot, and rate limiting. The form
fails *safe*: any error, including a missing `RESEND_API_KEY`, surfaces the
direct email address rather than a dead button.

**No resume PDF.** Deliberate. The experience timeline on `/about` (the
`EXPERIENCE` array) replaces it. `/resume` and `/cv` redirect to `/about`.

**Employment history is not invented.** Only the Staedtler role is filled in —
it's the one role documented elsewhere on the site. The bio says "almost five
years", so earlier roles are missing and should be added *from real information*.
Never guess these.

**Empty image slots are left visible.** 26 slots across the digital-campaign and
social sections have no image. Owner's call to leave them for now — see
"Known gaps".

**Nav items are real `<button>`s.** They were clickable `<div>`s, unreachable by
keyboard. The inline style resets exist to keep the rendering identical.

**Metadata origin is hardcoded.** Social unfurlers don't run JavaScript, so
`og:`/canonical/JSON-LD must be static. `https://dipali-design.digital` appears
in `index.html`, `sitemap.xml`, `robots.txt`, `README.md`.

---

## Known gaps (deliberate, not bugs)

**26 empty image slots.** Rendered but no file exists:

| Section | Slots | Filled |
|---|---|---|
| `noris-launch-*` | 2 | 1 |
| `noris-pr-*` | 3 | 1 |
| `noris-merch-*` | 4 | 2 |
| `noris-digital-*` | 2 | 0 |
| `noris-amazon-product-*` | 2 | 0 |
| `ig-*` | 6 | 0 |
| `staedtler-ig-*` | 6 | 0 |
| `staedtler-fb-*` | 6 | 0 |

Fix by adding the file **and** the id to `SAVED_IMAGES`. To hide unfilled slots
instead, filter each array on truthy `src` — but note three sections would then
collapse to a bare heading.

**Placeholder creator handles.** Both `norisLaunch` entries have
`handle: '@handle'` linking to bare `instagram.com`, with the builder's own note
to swap them in.

**Prop-gated sections.** `showDigital` and `showVehicleGraphics` both default to
`false`, hiding the Digital & e-commerce phase and Vehicle Graphics.

---

## Before you commit

```sh
# component script parses (the text/x-dc block is not checked by any linter)
python3 -c "
import io,re; s=io.open('index.html',encoding='utf-8').read()
m=re.search(r'<script type=\"text/x-dc\"[^>]*>(.*?)</script>', s, re.S)
io.open('/tmp/dc.js','w',encoding='utf-8').write(m.group(1))"
node --check /tmp/dc.js
node --check api/contact.js && node --check image-slot.js

# no relative asset paths crept back in (must print 0)
python3 -c "
import io,re; s=io.open('index.html',encoding='utf-8').read()
print(len(re.findall(r'[\"']( ?)(images|videos)/', s)))"

# tag balance
python3 -c "
import io,re; s=io.open('index.html',encoding='utf-8').read()
for t in ['main','header','nav','footer','form','h1','button','section','sc-if','sc-for']:
    o=len(re.findall(r'<%s[\s>]'%t,s)); c=len(re.findall(r'</%s>'%t,s))
    print(t,o,c,'OK' if o==c else 'MISMATCH')"
```

Local server: `python3 -m http.server 8000`. Note it has no SPA rewrite, so deep
links 404 on direct load (in-app navigation is fine) and `/api/contact` doesn't
exist. Use `vercel dev` if you need either.

Images: recompress with `cwebp -q 82 -alpha_q 100 -m 6 in.webp -o out.webp`. 26
files were previously PNGs wearing a `.webp` extension — 39MB of the original
45MB folder. Check `file images/*.webp` before trusting an extension.
