---
title: EspDesktop — ESP32 Touchscreen Controller for Mac
titleTemplate: :title
description: Turn a 4-inch Guition 4848S040 ESP32 touchscreen into a Mac control panel for launching apps, opening websites and Finder folders, and running keyboard shortcuts.
layout: home
---

<section class="homepage-hero">

<div>

# A touchscreen controller *for your Mac*

Open apps, visit websites and run shortcuts from a [4-inch Guition 4848S040 touchscreen](/screens/4848s040) for **under £20 (about US$27)**. Pair it over your local network with the [EspDesktop Mac app](/getting-started/mac-app), **free for non-commercial use**. [Source code](https://github.com/jtenniswood/espdesktop/tree/main/macos/EspDesktop) · [License](https://github.com/jtenniswood/espdesktop/blob/main/LICENSE)

<div class="homepage-action">

[Get started](/getting-started/install)

</div>

</div>

<figure class="homepage-panel">

![Illustrated 4-inch touchscreen with tiles for apps, websites, folders and shortcuts](/images/espdesktop-mac-controls.svg)

<figcaption>Example touchscreen layout</figcaption>

</figure>

</section>

<section class="homepage-features">

## What you can control

<div class="homepage-grid">

<article>

### Launch Mac apps

Open an app or bring it to the front with a tap. Give Slack, Mail or Figma a tile of its own.

[Apps](/mac-controls/apps)

</article>

<article>

### Open websites

Give your calendar or project dashboard a tile that opens it in your default browser.

[Websites](/mac-controls/websites)

</article>

<article>

### Jump to a Finder folder

Give Downloads, client files or your current project a tile of its own.

[Finder folders](/mac-controls/folders)

</article>

<article>

### Keep shortcuts in view

Turn key combinations into labelled buttons. Shortcut pages can follow the app you’re using, such as Safari or Figma.

[Keyboard shortcuts](/mac-controls/shortcuts)

</article>

<article>

### Lock your Mac

Tap the Lock Machine tile when you step away from your desk.

[Set up Mac Lock](/mac-controls/security)

</article>

<article>

### Make the layout your own

Resize tiles, choose their icons and colours, and group related controls into subpages.

[Customise the display](/features/setup)

</article>

</div>

</section>

<section class="homepage-editor">

<div>

## Arrange tiles in your browser {#a-look-at-the-web-editor}

The preview shows how your layout will look on the display. In this example, browser shortcuts share a subpage, with a Back tile to return to the previous page.

[Explore the web editor](/features/setup) · [Create a subpage](/features/subpages#create-a-subpage)

</div>

<figure>

![EspDesktop web editor showing a subpage with Back, Address Bar, New Tab, Find and Close Tab tiles](/images/web-editor-subpage.jpg)

<figcaption>A browser shortcuts subpage in the editor</figcaption>

</figure>

</section>

<style scoped>
@font-face {
  font-family: 'Instrument Serif';
  src: url('./.vitepress/theme/fonts/instrument-serif-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Instrument Serif';
  src: url('./.vitepress/theme/fonts/instrument-serif-italic.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}

.homepage-hero h1,
.homepage-features h2,
.homepage-grid h3,
.homepage-editor h2 {
  font-family: 'Instrument Serif', Georgia, serif;
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

.homepage-action a {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-weight: 600;
  text-decoration: none;
}

.homepage-action a:hover {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

.homepage-action a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}

.homepage-panel {
  width: min(100%, 440px);
  justify-self: center;
}

.homepage-panel img {
  width: 100%;
  aspect-ratio: 1;
}

.homepage-panel p,
.homepage-editor figure p {
  margin: 0;
}

figcaption {
  margin-top: 8px;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.homepage-panel figcaption {
  text-align: center;
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

.homepage-editor {
  margin-top: clamp(48px, 8vw, 96px);
}

.homepage-editor h2 {
  margin: 0;
  padding: 0;
  border: 0;
}

.homepage-editor figure {
  width: min(100%, 420px);
  justify-self: center;
}

.homepage-editor img {
  width: 100%;
  aspect-ratio: 620 / 612;
  border-radius: 6px;
}

@media (min-width: 620px) {
  .homepage-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 768px) {
  .homepage-hero,
  .homepage-editor {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: clamp(32px, 6vw, 80px);
  }
}

@media (min-width: 960px) {
  .homepage-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
