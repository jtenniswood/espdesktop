# Documentation Search and Answer Visibility

The public site uses VitePress under
`https://jtenniswood.github.io/espdesktop/`. This guide covers maintainer work;
search-provider administration does not belong in installation instructions.

## Build and Review

Run `npm run docs:build`, then `npm run docs:preview`. The build checks that
every sitemap page is reachable from the homepage and has a unique title and
description, one main heading, a canonical URL and a matching share preview.
It verifies images, breadcrumbs, internal links and anchors, retired-page
redirects, and FAQ data matching the visible answers. The Pages deployment
uses Git history to date each sitemap entry.

## Review the Homepage

- Show the first screen briefly to someone unfamiliar with EspDesktop. Ask what
  it does, what hardware it uses, and where they would go to start setup.
- Read the feature list aloud. Each item should name a real control and explain
  when someone would use it. Check that illustrations and screenshots are
  labelled and show the stated feature.
- Compare the light and dark layouts on a phone and a desktop. Check the order
  of the headline, setup link, and product examples. Use the keyboard to follow
  **Get started**.

Run `npm run docs:check-installer` against the built site to check the homepage
at 320, 390, 768 and 1440 pixels. The browser checks cover horizontal overflow,
whether the setup link fits on the first screen, image loading, and keyboard
navigation into the installer.

## Page Publishing

Generated fragments under `docs/generated/` are include-only. Publish useful
reference material through a described, linked guide. Runtime coverage belongs in
`dev-docs/generated/card-runtime-coverage.md`. Do not hand-edit generated tables.

Retired URLs in `docs/.vitepress/discovery.ts` get immediate HTML redirects with
a canonical destination, `noindex`, and a visible fallback link. GitHub Pages
does not provide configurable HTTP 301 redirects. These pages are intentionally
absent from the sitemap. Keep redirect destinations and existing FAQ question
anchors working when reorganising content.

## Content Maintenance

Give each page a distinct, descriptive `title` and `description`. Use the
EspDesktop brand spelling consistently. VitePress appends the site name to
guide titles.
Begin guides with the answer or outcome, prerequisites, steps, an observable
success check, and relevant limits. Keep advanced build details below the main
setup path or link to the manual guide.

The default share card depicts the EspDesktop Mac controls. The display,
setup, and control guides use a photo or screenshot from the corresponding
workflow. Keep the image descriptions and dimensions in
`docs/.vitepress/config.mts` aligned with the bundled files.

FAQ JSON-LD is derived from the rendered Markdown's level-three questions and
answers. Edit the visible FAQ; do not add a second hand-maintained answer list.
Keep detailed procedures in their topic guide and link to them from short FAQ
answers. Cite a release or dated verification when describing beta status or
availability; a successful docs build is not physical device testing.

[FAQ rich results were retired in May 2026](https://developers.google.com/search/updates).
The schema here keeps the machine-readable content consistent with the page.

## Plain-text Editions

The [plain-text docs index](https://jtenniswood.github.io/espdesktop/llms.txt)
follows the [llms.txt proposal](https://llmstxt.org/). It groups the public
guides by task. When adding or retiring a public guide, update
`docs/public/llms.txt` alongside the site navigation.

VitePress exports Markdown from the rendered public articles at build time.
The HTML pages link to their Markdown equivalents and to the index through
`alternate` and `describedby` links. The Markdown copies link back to the
original guides and stay outside the sitemap. Run `npm run docs:build` to
generate and validate the files, then use `npm run docs:preview` to read them.

Google's [AI search features](https://developers.google.com/search/docs/appearance/ai-features)
use normal search eligibility. The plain-text index helps clients that use it
find documentation. Crawler access is governed separately at the host root.

## Host-root Robots Policy

`/espdesktop/robots.txt` cannot control crawlers. The applicable location is
`https://jtenniswood.github.io/robots.txt`, which returned HTTP 404 during the
September 22, 2026 audit. A missing robots file does not block crawling. The
project-path file has been removed rather than implying it works.

The ready-to-publish [robots.txt](hosting/robots.txt) permits crawling and
announces the docs sitemap. It belongs in the **root** of a GitHub user Pages
site, normally the separate `jtenniswood/jtenniswood.github.io` repository.
That repository was not present in the accessible account during this work.
Publishing it requires creating/configuring that separate host-root site;
deploying EspDesktop's project site cannot write the host root.
The owner chose to keep the prepared file and instructions; no separate
repository or account-level Pages site was created as part of this change.

After host-root publication, verify:

```bash
curl --fail https://jtenniswood.github.io/robots.txt
curl --fail https://jtenniswood.github.io/espdesktop/sitemap.xml
```

The first response must be HTTP 200 with the template's sitemap URL. A generic
allow rule permits search crawling without conflating search access with
provider-specific AI training controls. See Google's
[robots location rules](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec).

## Search Console Ownership and Sitemap Submission

These steps require the owner's Google account; GitHub repository access does
not grant Search Console access.

1. Add or select the **URL-prefix** property
   `https://jtenniswood.github.io/espdesktop/` in
   [Google Search Console](https://search.google.com/search-console).
   Do not try to verify ownership of the shared `github.io` domain.
2. If unverified, choose HTML-tag verification. Copy only the supplied `content`
   value into the EspDesktop repository's Actions variable
   `GOOGLE_SITE_VERIFICATION`. The Pages build places it in the HTML head. This
   public verification value is not an account password or API token.
3. After the Pages deployment, view the homepage source, confirm the exact
   `google-site-verification` value, and complete verification in Search Console.
   Keep the tag deployed after verification.
4. In **Sitemaps**, submit
   `https://jtenniswood.github.io/espdesktop/sitemap.xml`. Confirm its processed
   status in the account. This works independently of host-root robots setup.
5. Inspect the homepage, `/screens/4848s040`, `/getting-started/install`, and
   `/getting-started/mac-app`. Check crawl eligibility and Google's selected canonical.
   Request indexing for the changed landing pages where appropriate.

See Google's [verification tag guidance](https://developers.google.com/search/docs/crawling-indexing/special-tags)
and [sitemap submission guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
For Bing, use the owner's Webmaster Tools account to verify the same site and
submit the same sitemap; it is a separate account task.

## Baseline and Follow-up

[The original route inventory](hosting/seo-baseline-2026-09-22.json) records
previously generated URLs. Capture the current live sitemap and metadata before
and after deployment without changing that inventory:

```bash
python3 scripts/check_docs_site.py \
  --base-url https://jtenniswood.github.io/espdesktop/ \
  --output /tmp/espdesktop-seo-after.json
```

Before deployment, export the last 28 complete days from Search Console's Web
performance report, including query and page tables, clicks, impressions, CTR,
and average position. Record date range, country/device filters, and deployment
date. Export page-indexing status separately. These account exports were not
available during the technical audit; do not substitute a `site:` search or
crawl count for them.

Compare the same reports over a subsequent 28-day period after recrawling.
Separate branded queries from hardware-model and task queries such as
Guition 4848S040 firmware, Mac touchscreen controller, and Mac app shortcuts.
Check whether useful landing pages gain visibility and fragment URLs disappear.
Do not claim causation from small or seasonal changes.

For answer-engine checks, record provider, date, exact prompt, cited URLs, and
factual accuracy for a fixed sample of supported hardware, macOS versions,
pairing, and installation requirements. Results vary and
are observations, not guaranteed rankings. Google includes AI-feature traffic
within its Web search reporting rather than providing an isolated AEO score.
