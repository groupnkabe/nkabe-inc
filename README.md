# Nkabe — official website

A responsive, lightweight, multi-page static website for Nkabe, the public-facing brand of Nkabe Inc. It introduces the company, its approach to building practical technology ventures, nKABE OS as its flagship venture, and a dedicated pilot-interest pathway. The site has no build step or runtime dependencies.

## Site architecture

- `index.html` — company-first homepage
- `about.html` — company identity, beliefs and ambition
- `approach.html` — how Nkabe identifies, develops and validates opportunities
- `products.html` — products and ventures, led by nKABE OS
- `contact.html` — general business and partnership enquiries
- `pilot.html` — dedicated pilot-interest information and form

All pages share the corporate navigation, footer, responsive styles, brand assets and lightweight JavaScript.

## Deployment and preview safety

The site is hosted with GitHub Pages and uses the custom domain `https://nkabe.us` (configured in `CNAME`). The workflow at `.github/workflows/pages.yml` publishes all root-level HTML pages and required static assets when changes are pushed to `main`, or when manually started from the Actions tab.

Feature-branch pushes do not trigger deployment. Do not manually run the Pages workflow from a feature branch: a manual run deploys the selected branch to the repository's production Pages environment and custom domain. Review and merge approved changes into `main` to publish.

The current work is being developed on `phase-1.1/corporate-multipage`, based on the preserved `phase-1/multipage-corporate-site` branch. Neither the source branch nor `main` should be modified as part of this work.

## Contact and pilot forms

Both forms post directly to Web3Forms at `https://api.web3forms.com/submit`. The public access key is configured in `site-config.js` as `contactFormAccessKey`; the destination inbox is managed by Web3Forms and is not included in this repository. The shared form handler uses each form's `data-form-subject` value to distinguish general enquiries from pilot interest. Required-field validation and accessible status messages are retained.

## SEO and assets

Each page has a distinct title, description, canonical URL and social-sharing metadata. `sitemap.xml` lists the public pages and `robots.txt` references it. Existing logos, favicon files, Apple touch icon and `CNAME` are preserved.

## Content notes

Nkabe is the public-facing technology brand; Nkabe Inc. is the legal entity. nKABE OS is presented as the flagship venture and described as in development. Its capability areas are framed as development work, not claims of completed operational functionality. The site does not claim customers, revenue, partnerships, deployments or market leadership.

The repository's `_headers` file is retained as project configuration, but GitHub Pages does not apply Netlify-style `_headers` rules automatically.
