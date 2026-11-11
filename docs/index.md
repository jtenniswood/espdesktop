---
title: EspDesktop — ESP32 Touchscreen Controller for Mac
titleTemplate: :title
description: Turn a 4-inch Guition 4848S040 ESP32 touchscreen into a Mac control panel for launching apps, opening websites and Finder folders, and running keyboard shortcuts.
layout: home
---

<section class="homepage-hero">

<div>

# A touchscreen controller *for your Mac*

Open apps, visit websites and run shortcuts from this [4-inch touchscreen](/screens/4848s040) for less than **$26/£20**. Pair it over your local network with the [Mac app](/getting-started/mac-app), **free for non-commercial use**.

<div class="homepage-action">

[Get started](/getting-started/install)

</div>

</div>

<figure class="homepage-panel">
  <img src="/images/espdesktop-desk.jpg" alt="EspDesktop touchscreen showing Mac app tiles beside a keyboard" width="1320" height="1093">
</figure>

</section>

<section class="homepage-features">

## What you can control

<div class="homepage-grid">

<article>

<svg class="homepage-feature-icon" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="3" y="3" width="7" height="7" rx="1.5" />
  <rect x="14" y="3" width="7" height="7" rx="1.5" />
  <rect x="3" y="14" width="7" height="7" rx="1.5" />
  <rect x="14" y="14" width="7" height="7" rx="1.5" />
</svg>

### Launch Mac apps

Open an app or bring it to the front with a tap. Give Slack, Mail or Figma a tile of its own.

[Apps](/mac-controls/apps)

</article>

<article>

<svg class="homepage-feature-icon" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="9" />
  <ellipse cx="12" cy="12" rx="4" ry="9" />
  <path d="M3 12h18" />
</svg>

### Open websites

Give your calendar or project dashboard a tile that opens it in your default browser.

[Websites](/mac-controls/websites)

</article>

<article>

<svg class="homepage-feature-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
</svg>

### Jump to a Finder folder

Give Downloads, client files or your current project a tile of its own.

[Finder folders](/mac-controls/folders)

</article>

<article>

<svg class="homepage-feature-icon" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="2" y="5" width="20" height="14" rx="2" />
  <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 15h8" />
</svg>

### Keep shortcuts in view

Turn key combinations into labelled buttons. Shortcut pages can follow the app you’re using, such as Safari or Figma.

[Keyboard shortcuts](/mac-controls/shortcuts)

</article>

<article>

<svg class="homepage-feature-icon" viewBox="0 0 24 24" aria-hidden="true">
  <rect x="5" y="10" width="14" height="11" rx="2" />
  <path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2" />
</svg>

### Lock your Mac

Tap the Lock Machine tile when you step away from your desk.

[Set up Mac Lock](/mac-controls/security)

</article>

<article>

<svg class="homepage-feature-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M5 3v9m0 4v5M12 3v4m0 4v10M19 3v12m0 4v2" />
  <rect x="2" y="12" width="6" height="4" rx="1" />
  <rect x="9" y="7" width="6" height="4" rx="1" />
  <rect x="16" y="15" width="6" height="4" rx="1" />
</svg>

### Make the layout your own

Resize tiles, choose their icons and colours, and group related controls into subpages.

[Customise the display](/features/setup)

</article>

</div>

</section>

<section class="homepage-editor">

<div>

## EspDesktop in action {#a-look-at-the-web-editor}

Try the nine-app launcher here. Tap Slack to open its shortcut page, then tap the app icon to go back home.

<div class="homepage-editor-actions">

<a href="./editor/index.html" target="_self">Open full-size demo</a> <a href="./editor-demo/index.html" target="_self">Open editor demo</a> [Get Started](/screens/4848s040#where-to-buy)

</div>

</div>

<iframe
  class="homepage-demo"
  src="./editor/index.html"
  title="Interactive EspDesktop touchscreen demo"
  loading="lazy"
></iframe>

</section>

<style scoped>
.homepage-hero h1,
.homepage-features h2,
.homepage-grid h3,
.homepage-editor h2 {
  font-family: var(--espdesktop-headline-font);
  font-weight: 400;
  letter-spacing: normal;
}

.homepage-hero,
.homepage-editor {
  display: grid;
  align-items: center;
  gap: 32px;
}

.homepage-hero {
  padding: clamp(36px, 6vw, 84px) 0 clamp(44px, 7vw, 88px);
}

.homepage-hero h1 {
  max-width: 12ch;
  font-size: clamp(54px, 7.4vw, 112px);
  line-height: 0.92;
}

.homepage-hero h1 em {
  display: block;
  color: var(--vp-c-brand-1);
}

.homepage-hero h1 + p {
  max-width: 48ch;
  margin-top: 24px;
  color: var(--vp-c-text-1);
  font-size: clamp(17px, 1.7vw, 20px);
  line-height: 1.5;
}

.homepage-action a,
.homepage-grid article > p:last-child > a,
.homepage-editor-actions a {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
}

.homepage-action a {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}

.homepage-action a:hover {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

.homepage-action a:focus-visible,
.homepage-grid article > p:last-child > a:focus-visible,
.homepage-editor-actions a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

.homepage-panel {
  width: min(100%, 440px);
  justify-self: center;
}

.homepage-panel img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 14px;
}

.homepage-features h2,
.homepage-editor h2 {
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1;
}

.homepage-features h2 {
  margin: 0 0 24px;
  padding-top: 24px;
}

.homepage-grid {
  display: grid;
  gap: 1px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-divider);
}

.homepage-grid article {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: clamp(20px, 3vw, 36px);
  background: var(--vp-c-bg-soft);
}

.homepage-feature-icon {
  display: block;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 9px;
  border-radius: 10px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.homepage-grid h3,
.homepage-grid p {
  margin: 0;
}

.homepage-grid h3 {
  font-size: clamp(30px, 3.1vw, 42px);
  line-height: 1.03;
  text-wrap: balance;
}

.homepage-grid p {
  max-width: 38ch;
  color: var(--vp-c-text-2);
}

.homepage-grid p:last-child {
  margin-top: auto;
  padding-top: 6px;
  font-size: 14px;
}

.homepage-grid article > p:last-child > a,
.homepage-editor-actions a {
  background: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
}

.homepage-grid article > p:last-child > a:hover,
.homepage-editor-actions a:hover {
  background: var(--vp-button-alt-hover-bg);
  color: var(--vp-button-alt-hover-text);
}

.homepage-editor {
  margin-top: clamp(48px, 8vw, 96px);
}

.homepage-editor-actions p {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 14px;
}

.homepage-editor h2 {
  margin: 0;
  padding: 0;
  border: 0;
}

.homepage-demo {
  display: block;
  width: min(100%, 452px);
  height: auto;
  aspect-ratio: 1;
  justify-self: center;
  border: 0;
  color-scheme: only light;
}

@media (min-width: 620px) {
  .homepage-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .homepage-hero,
  .homepage-editor {
    gap: clamp(32px, 6vw, 80px);
  }

  .homepage-hero {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  }

  .homepage-editor {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .homepage-demo {
    width: 100%;
  }
}

@media (min-width: 960px) {
  .homepage-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
