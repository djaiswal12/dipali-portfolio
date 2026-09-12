# Dipali Patel — Portfolio

Brand design portfolio. Static site, no build step, deployed on Vercel.

**Live:** https://dipali-portfolio-psi.vercel.app

---

## ⚠️ Setup still required

Three things need doing before the site is fully functional. Nothing here is
optional — each one is a visible dead end for a visitor until it's done.

### 1. Add the resume PDF

Drop `Dipali-Patel-Resume.pdf` into the repo root. The "Download Resume" button
links to `/resume`, which `vercel.json` redirects to that filename. Until the
file exists, that button 404s.

### 2. Configure contact form email

The form posts to `/api/contact`, which sends through [Resend](https://resend.com).
In **Vercel → Project → Settings → Environment Variables**, add:

| Variable | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | **yes** | From https://resend.com/api-keys. Free tier: 100 emails/day. |
| `CONTACT_TO_EMAIL` | no | Defaults to `dipali11patel@gmail.com`. |
| `CONTACT_FROM_EMAIL` | no | Defaults to Resend's shared sender, which needs no DNS. Once a custom domain is verified in Resend, switch to e.g. `Portfolio <hello@yourdomain.com>` — shared senders land in spam more often. |

Redeploy after adding them; env vars are read at runtime but existing
deployments don't pick up new values.

Without the key the form still validates and still gives the visitor a clear
message pointing at the direct email address — it fails safe, not silently.

### 3. Turn on analytics

**Vercel → Project → Analytics** and **Speed Insights**, both free on Hobby. The
script tags are already in `index.html`; until the features are enabled they
404 harmlessly. Custom events already wired: `resume_download` and
`contact_form_submit`.

---

## When the custom domain goes live

The absolute URL is written in four files. Social unfurlers (Slack, LinkedIn,
iMessage) don't run JavaScript, so these have to be static — they can't be
computed at runtime. Find and replace this exact string:

```
https://dipali-portfolio-psi.vercel.app
```

in:

- `index.html` — canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD
- `sitemap.xml` — every `<loc>`
- `robots.txt` — the `Sitemap:` line
- `README.md` — the link at the top

Then submit the sitemap in [Google Search Console](https://search.google.com/search-console).

---

## Architecture

Static export from a visual site builder. No framework, no dependencies, no
build.

| File | Role |
|---|---|
| `index.html` | Markup, styles, and the component logic (in the `text/x-dc` script block at the bottom) |
| `support.js` | Page runtime — template binding, `sc-if` / `sc-for`, event wiring |
| `image-slot.js` | `<image-slot>` custom element |
| `video-slot.js` | `<video-slot>` custom element |
| `api/contact.js` | Vercel serverless function for the contact form |
| `vercel.json` | SPA rewrite, redirects, cache and security headers |

### Routing

Screens are state (`view` / `cat` / `subcat`), mapped to URLs by
`pathFromState` / `stateFromPath` in `index.html`. `componentDidUpdate` is the
single sync point, so every navigation handler gets history for free.

URLs: `/`, `/about`, `/contact`, `/work/<category>`, `/work/<category>/<subcategory>`.

**This depends on the SPA rewrite in `vercel.json`.** Without it, loading
`/about` directly returns 404 — there's no such file on disk.

### Images

`images/` holds 115 WebP files (~8MB). 26 of them were previously PNGs with a
`.webp` extension, which is why the folder used to be 45MB; they're real WebP
now at the same pixel dimensions.

`<image-slot>` lazy-loads by default. Pass `loading="eager"` on anything above
the fold — currently the home tiles, the about portrait, and the Staedtler hero.
Alt text comes from an explicit `alt` attribute, falling back to `placeholder`.

### Regenerating the share image

Edit `og-image.svg`, then:

```sh
qlmanage -t -s 1200 -o /tmp og-image.svg
sips -c 630 1200 /tmp/og-image.svg.png --out /tmp/og-crop.png
sips -s format jpeg -s formatOptions 90 /tmp/og-crop.png --out og-image.jpg
```

The SVG is authored on a 1200×1200 canvas with the card inset at `y=285`
because macOS Quick Look renders into a square and would otherwise scale a
1200×630 document up and crop the sides off. The centre crop undoes that.

---

## Local development

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

Two caveats: a plain static server has no SPA rewrite, so deep links like
`/about` 404 (navigating in-app works fine — only a direct load or refresh
fails), and `/api/contact` doesn't exist, so the form takes its error path. For
either, use `vercel dev` instead.
