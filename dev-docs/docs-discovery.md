# Documentation Search and Answer Visibility

The public site uses VitePress under
`https://espdesktop.com/`. This guide covers maintainer work;
search-provider administration does not belong in installation instructions.

## Build and Review

Run `npm run docs:build`, then `npm run docs:preview`. The build checks that
every sitemap page is reachable from the homepage and has a unique title and
description, one main heading, a canonical URL and a matching share preview.
It verifies images, breadcrumbs, internal links and anchors, retired-page
redirects, and FAQ data matching the visible answers. The Pages deployment
uses Git history to date each sitemap entry.

## Verify the Setup Docs for Each Stable Release

Before publishing a candidate, open its docs preview. From the Guition
4848S040 setup guide, follow the firmware installation and Mac pairing steps.
Open the Companion compatibility reference from the site's navigation. If
setup changed, compare the instructions with the candidate's interface,
including button names, prerequisites, and what success looks like. Check
changed recovery steps using the same build.

On a Guition 4848S040 test display, follow the USB installer, connect to Wi-Fi,
pair the matching Mac app, and launch one app from a tile. Record the date,
release tag, display model, macOS version, browser, and which steps passed in
the candidate test notes. Record any skipped or failed steps there as well.
Keep that result separate from the CI build and browser checks.

After Pages deploys, open the [download step in the setup guide](https://espdesktop.com/screens/4848s040#download)
and follow the Mac download link. Confirm that the download, firmware installer
manifest and compatibility reference identify the same stable release. Check the published
installer's availability and inspect the deployment results before sharing
the release links.

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

### Prepare HTTP redirects

For a Cloudflare rollout, build the intended release of the docs and export
its exact-path rules.

```bash
python3 scripts/export_docs_redirects.py --dist ./docs/.vitepress/dist --output /tmp/espdesktop-redirects.csv
```

The export includes clean-URL aliases and retired pages with a single
destination. Pages that map old section links in the browser keep their HTML
fallback. The deployment check compares those HTML responses with the built
files to catch lost section mappings. Search and tracking query strings are
preserved for destinations on espdesktop.com. The export leaves firmware, app updates, demos and Markdown
endpoints outside the redirect list.

Review the file against the deployed sitemap before importing it as a
[Cloudflare Bulk Redirect list](https://developers.cloudflare.com/rules/url-forwarding/bulk-redirects/reference/csv-file-format/).
The host needs to be proxied for Cloudflare to apply the rules. Verify
strict HTTPS to the origin before enabling the rule. Confirm a clean guide
loads, a known alias returns a single 301, and a retired hardware URL reaches
the correct EspControl guide. Check the firmware installer, editor and Mac
update feed after routing changes. Disabling the rule restores GitHub Pages'
HTML fallbacks.

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

The [plain-text docs index](https://espdesktop.com/llms.txt)
follows the [llms.txt proposal](https://llmstxt.org/). It groups the public
guides by task. Add or retire guides in `docs/.vitepress/public-guides.json`
and update the navigation or redirects as needed. The build uses this inventory
to select the public articles and generates `llms.txt` from their titles and
descriptions. The 404 page, redirects, demos and generated includes are outside
the guide inventory.

VitePress exports Markdown from the rendered public articles at build time.
The HTML pages link to their Markdown equivalents and to the index through
`alternate` and `describedby` links. The Markdown copies link back to the
original guides and stay outside the sitemap. Run `npm run docs:build` to
generate and validate the files, then use `npm run docs:preview` to read them.

Google's [AI search features](https://developers.google.com/search/docs/appearance/ai-features)
use normal search eligibility. The plain-text index helps clients that use it
find documentation. Crawler access is governed separately at the host root.

## Host-root Robots Policy

The [published robots.txt](../docs/public/robots.txt) allows crawling and
announces the sitemap at the custom domain root. It explicitly allows
`OAI-SearchBot` and `Claude-SearchBot` for search discovery. Training crawlers
such as `GPTBot` and `ClaudeBot` fall under the default public crawl policy.
Review training permissions independently when changing that policy.
See the [OpenAI crawler roles](https://developers.openai.com/api/docs/bots)
and [Claude crawler roles](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler).

After deployment, check both files:

```bash
curl --fail https://espdesktop.com/robots.txt
curl --fail https://espdesktop.com/sitemap.xml
```

## Search Console Ownership and Sitemap Submission

These steps require the owner's Google account; GitHub repository access does
not grant Search Console access.

1. Add or select the **URL-prefix** property
   `https://espdesktop.com/` in
   [Google Search Console](https://search.google.com/search-console).
2. If unverified, choose HTML-tag verification. Copy only the supplied `content`
   value into the EspDesktop repository's Actions variable
   `GOOGLE_SITE_VERIFICATION`. The Pages build places it in the HTML head. This
   public verification value is not an account password or API token.
3. After the Pages deployment, view the homepage source, confirm the exact
   `google-site-verification` value, and complete verification in Search Console.
   Keep the tag deployed after verification.
4. In **Sitemaps**, submit
   `https://espdesktop.com/sitemap.xml`. Confirm its processed
   status in the account.
5. Inspect the homepage, the 4848S040 guide, the firmware install guide and the
   official download page. Check crawl eligibility and Google's selected
   canonical. Request indexing for changed landing pages where appropriate.
6. Check **Settings → Search generative AI** for the verified property and
   confirm inclusion if the site should appear in AI Overviews and AI Mode.
   See [Google's setting reference](https://support.google.com/webmasters/answer/16908024).

See Google's [verification tag guidance](https://developers.google.com/search/docs/crawling-indexing/special-tags)
and [sitemap submission guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
For Bing, use the owner's Webmaster Tools account to verify the same site and
submit the same sitemap; it is a separate account task.

## Baseline and Follow-up

[The original route inventory](hosting/seo-baseline-2026-09-22.json) records
previously generated URLs. The [12 November live crawl](hosting/seo-live-2026-11-12.json)
records the sitemap and metadata before the setup guide changes. Capture a new
snapshot after deployment:

```bash
python3 scripts/check_docs_site.py \
  --base-url https://espdesktop.com/ \
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


### Google and Bing AI visibility

- In Google Search Console, export impressions by page from the
  [Generative AI performance report for Search](https://support.google.com/webmasters/answer/16984139).
  Those impressions are also included in the overall Web search report.
- In [Bing Webmaster Tools AI Performance](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/),
  export cited URLs, citation counts and any available grounding queries.
- Use the same date windows and filters where possible. Record unavailable
  reports as unavailable. Keep account exports in a private location.

### Check the answers people receive

The [12 November AI answer baseline](hosting/ai-answer-baseline-2026-11-12.md) records the observed pre-deployment answers and citations.

Run the same prompts in fresh conversations with web search enabled in ChatGPT
Search, Google AI Mode, Microsoft Copilot and Claude. Record the date, surface,
prompt, factual errors, each cited URL and the final destination after redirects.
Use the release and guide live on the test date as the reference. A citation to a
stale page counts as a citation problem even when the answer is correct.

| Prompt | Facts to verify |
| --- | --- |
| Can I use EspDesktop with a 2019 Intel Mac? | Apple silicon requirement and minimum supported macOS |
| Which Guition display do I buy for EspDesktop? | 4-inch Guition ESP32-S3 4848S040 |
| How do I install EspDesktop firmware in Safari? | Desktop Chrome or Edge for the browser installer and a USB-C data cable |
| What Wi-Fi does the 4848S040 need for EspDesktop? | 2.4 GHz for the display and a shared local network with the Mac |
| Which EspDesktop Mac app should I use with my existing firmware? | Match the app and firmware release |
| Does EspDesktop need Home Assistant? | Direct local pairing for Mac controls and EspControl for Home Assistant |
| Why can't the EspDesktop Mac app find my display? | Shared local network, Local Network permission and manual address fallback |
| Why do app tiles work but keyboard shortcuts do nothing? | macOS Accessibility permission for shortcuts |
| What can I use to put Mac app shortcuts on a DIY 4-inch touchscreen? | Whether EspDesktop surfaces and its actual compatibility if mentioned |
| How can I use a Guition 4848S040 to control Home Assistant? | EspControl as the relevant project and the correct hardware guide |

Track accurate answers, correct citations and citations to retired pages
separately. Re-run after major guide changes once search engines have had a
chance to recrawl.

### Check the setup journey

Run a mobile lab check on the homepage, 4848S040 guide and first-setup guide
before and after changes to screenshots or the demo. Record the test profile,
LCP, CLS and bytes transferred. Use field LCP, INP and CLS when available.
[Core Web Vitals guidance](https://developers.google.com/search/docs/appearance/core-web-vitals)

On 12 November 2026, the [mobile PageSpeed Insights report for espdesktop.com](https://pagespeed.web.dev/analysis/https-espdesktop-com/ce3fwikvf4?form_factor=mobile)
showed **No Data** for real-user performance. Keep the mobile lab measurements
as a separate baseline and check for field data again after deployment.

Give a first-time tester a Mac and a 4848S040. Record whether they can choose
the right download, pair the display and open their first Mac app from a tile.
Record the guide and step for each point where they need help. If aggregate
site analytics are available, track clicks from the setup guide to the
installer and official download separately from the hands-on outcome.

On 12 November 2026, GitHub reported three downloads of
`EspDesktop-1.2.6.dmg` on the [v1.2.6 release](https://github.com/jtenniswood/espdesktop/releases/tag/v1.2.6).
Record the release tag and capture date when comparing this count. GitHub
combines downloads from all sources. The counter cannot tell us which
downloads came from the docs or whether anyone paired a display.
