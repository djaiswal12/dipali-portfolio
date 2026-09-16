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

**Every route opens at the top.** `_syncUrl` scrolls to 0 on every navigation.
`goProgression` and `goAllWork` used to skip it via a `_skipScrollOnce` flag so
they could scroll to their own anchor; both are now plain `setState` calls and
the flag is gone. Landing mid-page was reported as a bug, so don't add anchor
scrolling to a handler that just opens a page.

**`goEnvCase` is the one sanctioned exception**, and it was requested. A client
tile on the Environmental landing names a specific case, so it lands on that
case's `[data-case]` header rather than the top of a page holding four of them.
It scrolls from the `setState` callback — which runs *after* `componentDidUpdate`
has already reset to top — and re-issues each frame until the offset settles,
because lazy images above the target keep moving it. Any future "link to a
specific section" needs that same ordering. `goPhase` is unaffected: it scrolls
within the page the visitor is already on.

**Category slugs can be retired without breaking links.** `CATEGORY_ALIASES`
maps an old slug to its replacement in `stateFromPath`, and `DEFAULT_CATEGORY`
is where an unknown slug lands. `staedtler` → `staedtler-brand` is there because
that URL was shared before the page was split.

---

## Decisions made, and why

**Absolute asset paths over `<base href="/">`.** One line would have fixed it,
but `<base>` silently rewrites every relative URL on the page including anchors.
Too easy to trip over later.

**Serverless + Resend over a client-side form service.** Keeps the API key
server-side and allows real validation, honeypot, and rate limiting. The form
fails *safe*: any error, including a missing `RESEND_API_KEY`, surfaces the
direct email address rather than a dead button.

**Resume PDF lives under Experience.** `files/Dipali-Patel-Resume.pdf`, linked
from the bottom of the Experience section on `/about`. The experience timeline
(the `EXPERIENCE` array) is still the primary telling; the PDF supplements it
rather than replacing it. `/resume` and `/cv` still redirect to `/about`, which
is where the download now sits. Supersedes the earlier "no resume PDF" call.

**Employment history is not invented.** Only the Staedtler role is filled in —
it's the one role documented elsewhere on the site. The bio says "almost five
years", so earlier roles are missing and should be added *from real information*.
Never guess these.

**Empty image slots are now hidden, not shown.** Reverses the earlier call. The
site goes out to viewers before the remaining photography exists, so a slot with
no file behind it is dropped rather than rendered as an empty drop placeholder.
`hasImg(id)` is the gate; arrays filter on it and sections wrap in `sc-if`. Add
the file and its id to `SAVED_IMAGES` and the slot comes back on its own — see
"Hiding and restoring unshot sections".

**Nav items are real `<button>`s.** They were clickable `<div>`s, unreachable by
keyboard. The inline style resets exist to keep the rendering identical.

**Metadata origin is hardcoded.** Social unfurlers don't run JavaScript, so
`og:`/canonical/JSON-LD must be static. `https://dipali-design.digital` appears
in `index.html`, `sitemap.xml`, `robots.txt`, `README.md`.

---

## Hiding and restoring unshot sections

Nothing renders an empty slot any more. Two mechanisms do the hiding, and both
undo themselves once the assets arrive:

**`hasImg(id)`** — true when the id is in `SAVED_IMAGES`. Arrays filter on it
(`norisPr`, `norisMerch`, `norisLaunch`, print-tile frames, `sfCases` and their
details), and the About portrait wraps in `sc-if`. **Drop the file in `images/`,
add the id to `SAVED_IMAGES`, and the slot reappears** — no template edit.

**`SHOW_PASSION`** — `false`. The Passion branch (landing, DIDI, Colourism,
CREATE #2) has no photography at all, so the whole category is filtered out of
`VISIBLE_CATEGORIES`, which drives the nav dropdown, the home grid and the
prev/next ring. `stateFromPath` also refuses `/work/passion`, so it is
unreachable rather than merely unlinked. Flip to `true` once the assets land.

Currently outstanding: only the Passion set. Its landing-page images
(`passion-hero`, `passion-tile-*`, `didi-hero`, `didi-product-hero`,
`colourism-hero`) are converted and sitting in `images/` but deliberately left
out of `SAVED_IMAGES` — the deep DIDI / Colourism / CREATE #2 pages are still
unshot and their slots are not individually gated, so flipping `SHOW_PASSION`
before those land would expose empty slots. Declare the ids and flip the flag
together.

Everything else is filled. All four Storefront case studies render, and the
Noris print tiles have every view.

**Placeholder creator handles are gone.** `norisLaunch` entries now carry a
plain `label` caption instead of the builder's `@handle` placeholder, and
`norisCreators` handles render unlinked — the handles are real but the post
permalinks are not. Restore the links when the real permalinks exist.

**Grids never orphan their last row, and two helpers keep it that way.**

`evenCols(n, prefer)` picks the first column count that divides `n` exactly,
falling back to `n` itself (one row) when none does. `.worktiles` reads it
through `--cols` / `--cols-tablet`, so the home grid re-lays itself as
categories come and go: five visible categories only divide by five, hence a
single row; bringing Passion back makes six and it drops to a roomier 3 x 2.
The Environmental client tiles reuse `.worktiles` without setting the variables
and get the 4/2/1 defaults.

`spanLast(items, cols)` widens the final card to cover the shortfall, used by
the two capability lists. `.hairgrid` draws its rules with a background showing
through a 1px gap, so a part-filled last row shows as grey voids rather than
empty space — the wider card fills it for any count.

**The STAEDTLER role is two categories, split along the job title.** One page
could not carry both halves, and the second was buried under the first.
`staedtler-brand` ("Brand & Packaging", Design Lead) holds the surfaces,
production craft and featured work; `staedtler-social` ("Social & Team",
Marketing Specialist) holds the channels, growth and the HSN team. Both share
the page-header markup, which reads `currentCategory` — so the copy lives in
`WORK_CATEGORIES`, not the template. `capabilities` split into
`brandCapabilities` and `socialCapabilities` with it.

Both pages currently share `stae-hero`, and `home-tile-staedtler-social.webp` is
a crop of the Instagram profile screenshot. Both are stand-ins; a photograph of
the social or team work would be better.

**No full-bleed imagery.** `.pagehero` puts every wide image on the same measure
as the copy (`min(1240px, 100% - gutters)`). Running them edge to edge upscaled
~1920px sources past their native width on large displays, which is what made
the headers look soft.

**EMCO's case study borrows the process strip's frames.** The six
`env-process-*` images are all one job — the House of Rohl Studio hoarding — so
the strip says so explicitly and `SF_CASES` gives EMCO a `detailIds` override
pointing at `env-process-03/04/05` rather than a duplicate `sf-emco-*` set. Any
case may use `detailIds`; without it the ids follow from the key. EMCO has no
before/after pair, which `hasBeforeAfter` handles on its own.

**The four clients are the Environmental landing's tiles.** They replaced a
single "Storefront & Interior Graphics" tile, and the Storefront subpage's
"Sector range" strip was removed because it then showed the same four tiles
twice in a row.

**`image-slot` suppresses touch gestures only on fine pointers.** An
unconditional `touch-action:none` on `.frame img` swallowed page scrolling on
touch devices — a swipe starting on any image did nothing. It is now behind
`@media (pointer: fine)`, plus `:host([data-panning])` for an in-progress pan.

**Prop-gated sections.** `showDigital` and `showVehicleGraphics` both default to
`false`, hiding the Digital & e-commerce phase and Vehicle Graphics.

**Dead template branch.** `isGenericCategory` can never be true — its condition
excludes all five `WORK_CATEGORIES` slugs — so the block it guards never
renders. The `staedtler-ig-*` / `staedtler-fb-*` slots inside it are therefore
not a live gap, despite looking like one.

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
