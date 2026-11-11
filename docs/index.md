---
title: EspDesktop — ESP32 Touchscreen Controller for Mac
titleTemplate: :title
description: Turn a 4-inch Guition 4848S040 ESP32 touchscreen into a Mac control panel for launching apps, opening Finder folders and running keyboard shortcuts.
layout: home
---

<section class="homepage-hero">

<div>

# A touchscreen controller for your Mac

Open apps, run keyboard shortcuts and check Mac stats from a 4‑inch touchscreen beside your keyboard.

EspDesktop pairs the [Guition 4848S040](/screens/4848s040) with a [macOS menu-bar app](/getting-started/mac-app) on your local network.

<div class="homepage-action">

[Get started](/getting-started/install)

</div>

</div>

<figure class="homepage-panel">

![Illustrated 4-inch touchscreen with Safari, Projects, Slack, shortcut and Mac status tiles](/images/espdesktop-mac-controls.svg)

<figcaption>Example touchscreen layout</figcaption>

</figure>

</section>

## What You Can Control

<div class="homepage-controls">

<article>

### Apps and websites

[Launch a Mac app](/mac-controls/apps) or [open a website](/mac-controls/websites) in your default browser.

</article>

<article>

### Finder folders

[Open a folder you’ve approved](/mac-controls/folders), such as Downloads or the project you’re working on.

</article>

<article>

### Keyboard shortcuts

[Add a keyboard shortcut](/mac-controls/shortcuts) or start with a preset. Shortcut pages can follow the app you’re using, such as Safari or Figma.

</article>

<article>

### Mac Lock

Lock your Mac with a tap when you step away. [Set up Mac Lock](/mac-controls/security).

</article>

<article>

### Mac statistics

See processor load, memory, storage, network activity or battery on a [subpage tile](/features/subpages#mac-statistics).

</article>

</div>

<section class="homepage-editor">

<div>

## Arrange tiles in your browser {#a-look-at-the-web-editor}

Drag and resize tiles, change their labels and colours, and group related controls into subpages. The preview shows how they’ll look on your display.

[Explore the web editor](/features/setup) · [Create a subpage](/features/subpages#create-a-subpage)

</div>

<figure>

![EspDesktop web editor showing a subpage with Back, Address Bar, New Tab, Find and Close Tab tiles](/images/web-editor-subpage.jpg)

<figcaption>A browser shortcuts subpage in the editor</figcaption>

</figure>

</section>

<style scoped>
.homepage-hero,
.homepage-editor {
  display: grid;
  align-items: center;
  gap: 32px;
}

.homepage-hero {
  padding-top: clamp(40px, 7vw, 88px);
}

.homepage-hero h1 {
  max-width: 18ch;
  font-size: clamp(32px, 4vw, 56px);
  line-height: 1.08;
  text-wrap: balance;
}

.homepage-hero p {
  max-width: 52ch;
}

.homepage-action a {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 6px;
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
  width: min(100%, 360px);
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

.homepage-controls article {
  display: grid;
  gap: 6px;
  padding: 16px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.homepage-controls h3,
.homepage-controls p {
  margin: 0;
}

.homepage-controls h3 {
  font-size: 17px;
}

.homepage-controls p {
  max-width: 68ch;
  color: var(--vp-c-text-2);
}

.homepage-editor {
  margin-top: 48px;
}

.homepage-editor h2 {
  margin: 0;
  padding: 0;
  border: 0;
}

.homepage-editor figure {
  width: min(100%, 340px);
  justify-self: center;
}

.homepage-editor img {
  width: 100%;
  aspect-ratio: 620 / 612;
  border-radius: 6px;
}

@media (min-width: 768px) {
  .homepage-hero,
  .homepage-editor {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: clamp(32px, 6vw, 80px);
  }

  .homepage-controls article {
    grid-template-columns: minmax(0, 190px) minmax(0, 1fr);
    gap: 32px;
  }
}
</style>
