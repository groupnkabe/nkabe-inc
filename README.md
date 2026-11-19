# Nkabe — official website

A responsive, lightweight static website for Nkabe, the public-facing brand of Nkabe Inc. It introduces the company, its approach to building practical technology ventures, and nKABE OS as its flagship venture. The site has no build step or runtime dependencies.

## Deployment

The site is hosted with GitHub Pages and uses the custom domain `https://nkabe.us` (configured in `CNAME`). The GitHub Actions workflow at `.github/workflows/pages.yml` publishes the static site files when changes are pushed to `main`, or when manually started from the Actions tab. Repository Pages should use **GitHub Actions** as its publishing source.

Changes on a feature branch are not automatically published by the current workflow; merge reviewed changes into `main` to deploy them. The canonical URL and social-sharing URLs use `https://nkabe.us/`.

## Contact form

The contact form posts directly to Web3Forms at `https://api.web3forms.com/submit`. Its public access key is configured in `site-config.js` as `contactFormAccessKey`; the destination inbox is managed by Web3Forms and is not included in this repository. The frontend retains required-field validation and announces success or failure to visitors.

## Files

- `index.html` — semantic page content, canonical URL, SEO and social metadata
- `styles.css` — corporate visual system and responsive layouts
- `script.js` — accessible mobile navigation and Web3Forms submission
- `site-config.js` — public website and contact form configuration
- `assets/nkabe-inc-mark.webp` — official Nkabe corporate logo, used for the brand and social preview
- `assets/nkabe-os-mark.webp` — official nKABE OS product logo, used only in its venture presentation
- `assets/nkabe-inc-mark.png` — PNG corporate logo asset
- `assets/favicon.ico`, `assets/favicon-32.png`, `assets/favicon-16.png`, `assets/apple-touch-icon.png` — site icons
- `CNAME` — GitHub Pages custom-domain configuration (`nkabe.us`)
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow
- `_headers` — repository header configuration file

## Content notes

Nkabe is the public-facing technology brand; Nkabe Inc. is the legal entity. nKABE OS is presented as the flagship venture and described as in development. Its listed capability areas are framed as development work, not as claims of completed operational functionality. The site does not claim customers, revenue, partnerships, deployments or market leadership.
