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

### 6. Cover crops are centred unless you say otherwise

`image-slot` fills its frame and splits the overflow evenly, which cuts *both*
ends off an image whose subject sits at one. Pass `align="top" | bottom | left |
right` to keep that edge instead. The Amazon brand page is the case that needed
it: a 771x858 portrait screenshot in a 4/3 browser viewport, where a centred
crop removed the page header the frame exists to show.

It seeds the pan at the extreme and lets `_clampView` pull it back once
`naturalWidth`/`Height` are known, so the axis that doesn't overflow is
unaffected. A crop the user has reframed and stored always wins.

### 7. `vercel.json` rejects keys it doesn't know

There is no comment syntax, and no spare key to smuggle one into. Adding
`"_comment"` to a headers rule fails the deploy outright with an invalid-config
error — the whole site stops building, and the PR's only signal is a red
"Vercel Preview Comments" check pointing at a dashboard URL. A headers entry
takes `source`, `headers`, `has` and `missing`; nothing else. Explanations for
a rule go here, not in the JSON.

Unnamed capture groups in `source` *are* fine — `/images/(.*)` and
`/(.*)\.(js|css|…)` have shipped for weeks. Don't rewrite those chasing a
build failure.

### 8. `image-slot` alt text

The shadow-root `<img>` ships with a hardcoded `alt=""`. `image-slot.js` mirrors
the host's `alt` through, falling back to the `placeholder` attribute. Pass
`loading="eager"` on above-the-fold slots; everything else lazy-loads.

---

## Mobile and touch

Most viewers arrive on a phone. The builder laid the page out for a cursor, so
four classes of thing broke, and each has a mechanism that fixes it everywhere
rather than one element at a time.

**Hit areas.** Interactive text on this site is 12-17px tall — fine to click,
impossible to thumb. `.taptarget` keeps the element's own size and hangs an
invisible `::after` under it (40px, or 34px inside a `.tapstack`), so nothing
moves and the target grows. **Every `.taptarget` must be an inline-block or a
flex item**: on a block-level element the invisible bar spans the whole column
and swallows taps meant for the whitespace beside it, which is why the `← All
Work` links carry `display:inline-block`. The header gets the same treatment
through contextual selectors instead of six more class attributes; its dropdown
items opt out (`.navdrop::after { content: none }`) because they are already
42px tall and sit directly under the Work button.

**Vertical stacks widen before they grow targets.** Three contact rows 25px
apart cannot each have a 40px target without overlapping. `.tapstack` goes to
`gap: 20px` on `(pointer: coarse)` and its targets to 34px. Same idea for
`.dotrow`, whose 7px frame-picker dots get a 30x34 target and a 26px gap on
touch — 7px dots at a 7px gap leave a 14px pitch, and no useful target fits in
that.

**Grids with a hard column count.** `repeat(3, 1fr)` is a 113px column on a
390px phone. `.tilegrid3` drops to two columns at 760px and one at 520px. The
creator row is why this is a bug and not just cramped: `@ms.craft_kindergarten`
is a single unbreakable token wider than its column, so it pushed the whole
page sideways and gave every page a horizontal scrollbar. Square feed grids
keep three columns — they read as a feed and need no caption room.

**Hover must be gated.** `:hover` latches after a tap on a touch screen, so
`.tilescale:hover` lives inside `@media (hover: hover)`; without it a tapped
tile stays zoomed until you tap something else.

**Form fields are 16px, deliberately.** iOS Safari zooms the viewport in on a
focused field under 16px and never zooms back out. Don't set 15px here to save
a pixel.

**The growth chart's callout.** It is anchored from its right edge with
`white-space: nowrap`, so on a narrow plot it ran off the left of the screen.
Under 560px `.chartnote` wraps inside a 96px box and `.chartnote-long` — the
sentence, which the copy above the chart already says — is hidden.

**Verify with a real touch context.** Headless Chromium has no H.264, so every
`video-slot` reports as an empty drop placeholder in a test run; that is the
harness, not the site. `image-slot` uses shadow DOM, so probe
`slot.shadowRoot.querySelector('.empty')`, not `slot.querySelector('img')`.
And scroll the page in steps before measuring or screenshotting, or lazy images
are still loading when you look.

**The scripts must not be hard-cached.** `support.js`, `image-slot.js` and
`video-slot.js` are hand-maintained files at fixed URLs, so the week-long
`max-age` that covers the rest of the static assets meant a fix in any of them
stayed invisible to returning visitors for a week — which is exactly what
happened with the `image-slot` touch-scroll fix. They now revalidate
(`max-age=0, must-revalidate`); images keep the year-long immutable cache
because their names change when their contents do.

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

Currently outstanding: only the Passion set, and only two of its three
projects. **CREATE #2 is fully shot** — all eleven of its slots are declared and
filled (see "CREATE #2 was rebuilt from its build document" below), and
`/work/passion/create-2` renders with nothing empty at either phone or desktop
width. DIDI still has 31 empty slots and Decolonizing Colourism 9, and the
Passion landing's own four tiles are converted but undeclared, so
`SHOW_PASSION` stays `false` and the whole branch — CREATE #2 included — stays
dark. Those slots are not individually gated on `hasImg`, so flipping the flag
before DIDI and Colourism land would expose all forty. Declare the remaining
ids and flip the flag together.

To check the branch without shipping it, set `SHOW_PASSION = true` locally,
render, and set it back — the router refuses `/work/passion` otherwise, so
there is no other way in.

Everything else is filled. All four Storefront case studies render, and the
Noris print tiles have every view.

**Dipali's personal Instagram is off the site, deliberately.** Removed at her
request from the contact stacks on `/`, `/about` and `/contact`, and from the
JSON-LD `sameAs`. Don't reinstate it. STAEDTLER's channels are work accounts and
stay — the two are easy to confuse when editing the contact blocks.

**The HSN hero is a video.** `videos/stae-hsn-hero.mp4` is declared in
`SAVED_VIDEOS`, which flips the `hsnHeroVideoReady` / `hsnHeroImageOnly` pair
that was already in the template — the image is the fallback, not the default.
That is the pattern for any future video: drop the file in `videos/`, declare
the id, and the swap happens on its own.

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

**CREATE #2 was rebuilt from its build document.** The copy that shipped was
placeholder and wrong — it described a wall-mounted mirror "made from reclaimed
materials". The real piece is a **hand mirror**: hardboard cut to a drafted
silhouette, black cotton pulled to rust with a bleach discharge dye, shisha
mirror-work couched in red floss with gold beading on the front, and BEAUTY HAS
NO SKIN TONE embroidered in yellow on the back. Every word of the current copy
is read off the 21 scanned pages Dipali kept, and the eleven images are crops
from them. `finalRatio` is `4/3` rather than the `16/9` the other projects use
because the embroidered line runs diagonally across most of its frame and a
16/9 band cuts TONE off the bottom.

**The source scans are in git history, not in `images/`.**
`images/Patel_Dipali_Phys.pdf.zip` was 87 MB of scanned pages sitting in a
publicly-served directory under a one-year immutable cache — her physical
portfolio, downloadable by anyone who guessed the path, and two thirds of the
repository's weight. It is deleted from the tree; `git show <commit>^:images/Patel_Dipali_Phys.pdf.zip`
still recovers it. **It is still in the history**, so the clone is still large;
purging it needs a filter + force-push that nobody has asked for yet.

**Passion step strips size their columns like the home grid.** The process and
"the work" strips used `repeat(auto-fit, minmax(185px, 1fr))`, which picks the
column count from the available width alone — so CREATE #2's six process steps
laid out 5 + 1 and orphaned the last tile. `.stepgrid` now reads `--cols` /
`--cols-tablet` / `--cols-phone` from `evenCols` at each breakpoint, the same
mechanism `.worktiles` uses, so a strip of any length fills every row. Six
steps go 6 / 3 / 2; three finals go 3 / 3 / 1.

**The STAEDTLER packaging images are low-resolution, and that is issue #28.**
Seventeen of the 28 images on `/work/retail-packaging/staedtler-packaging` are
displayed larger than their source: the gallery frames are 562 CSS px (1124
device px at 2x) and the files behind them run 435-836 px, so they are soft on
any retina screen. `staedtler-pkg-gal-3-frame-0` is the worst at 435x544 in a
562x562 frame. This is not a crop or a code problem — the files came in small
from the builder export and no larger version exists anywhere in the repo, so
it needs re-exported sources at roughly 1200 px on the long edge. The
alternative, if new files never arrive, is to lay the gallery out 3-up so the
frames drop to ~365 px and most of the existing sources are then adequate.

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
