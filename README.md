# NKABE — corporate website (temporary deployment package)

A responsive, static website for NKABE with **nKABE OS** as the flagship product. No build step, server, database, tracking pixel, or analytics dependency is required.

## Before public launch

1. **Confirm legal name.** The public-facing brand currently says `NKABE`, not `NKABE, Inc.`. Because the Delaware entity's formation status has not been confirmed in this work session, do not represent the corporation as formed unless that is accurate. After formation, update copy only as approved by counsel.
2. **Set a monitored contact email.** Edit `site-config.js` and set `publicContactEmail` to an inbox that is created and monitored. The contact CTA intentionally does not invent an email address.
3. **Review all product claims.** Copy distinguishes the current prototype/hardware-validation phase from planned pilots and future platform services. Keep that distinction.
4. **Domain.** No custom domain is configured because `nkabe.com` acquisition remains unresolved. Use the host's temporary URL until a domain is under company control.

## Option A — Cloudflare Pages via Git integration (recommended for ongoing updates)

1. Create a GitHub repository and push this folder to its `main` branch.
2. In Cloudflare, open **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
3. Select the repository. Framework preset: **None**. Build command: `exit 0`. Build output directory: `.` (repository root).
4. Deploy. Cloudflare will issue a `*.pages.dev` address and can redeploy each time `main` is updated.

Avoid starting with Cloudflare's *Direct Upload* if you want a Git-connected project later: Cloudflare says a Direct Upload project cannot later be switched to Git integration; a separate project would be needed.

## Option B — GitHub Pages

The `.github/workflows/pages.yml` workflow publishes the repository root on pushes to `main`.

1. Push the folder to a repository on GitHub.
2. In repository **Settings → Pages**, set the source to **GitHub Actions**.
3. Confirm the Pages workflow runs successfully. GitHub will show the published URL in the workflow/Pages settings.

For a company website, prefer a clean project/repository name, e.g. `nkabe-website`. The resulting project URL will include the repository name. Do not add `CNAME` until using a domain that NKABE controls.

## Files

- `index.html` — page content and metadata
- `styles.css` — responsive visual system and layout
- `script.js` — mobile navigation and contact configuration
- `site-config.js` — public contact email and display settings
- `assets/nkabe-os-mark.webp` — supplied nKABE OS mark, optimized for the web
- `assets/nkabe-inc-mark.webp` — NKABE Inc. logo mark (transparent), shown beside the "NKABE Inc" text wordmark in the header and footer
- `assets/nkabe-inc-mark.png` — NKABE Inc. logo mark (transparent PNG fallback)
- `assets/favicon.ico`, `assets/favicon-32.png`, `assets/favicon-16.png`, `assets/apple-touch-icon.png` — favicons generated from the transparent NKABE Inc. logo mark
- `_headers` — security headers for Cloudflare Pages
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

## Scope

The site is a corporate-facing one-page introduction. It intentionally does not claim paying customers, revenue, broad production deployment, or finished cloud/remote-management services. Update the roadmap as evidence changes.
