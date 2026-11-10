---
title: EspDesktop — ESP32 Touchscreen Controller for Mac
titleTemplate: :title
description: Turn a 4-inch Guition 4848S040 ESP32 touchscreen into a Mac control panel for launching apps, opening Finder folders and running keyboard shortcuts.
layout: home
hero:
  name: EspDesktop
  text: A touchscreen controller for your Mac
  tagline: Put the apps, folders and shortcuts you use every day on a dedicated 4-inch display beside your keyboard.
  image:
    src: /images/espdesktop-mac-controls.svg
    alt: Illustration of an EspDesktop panel with app, folder, shortcut and Mac status tiles
  actions:
    - theme: brand
      text: Get started
      link: /#get-started
    - theme: alt
      text: See what it can do
      link: /#what-you-can-control
---

## What You Can Control

EspDesktop pairs the [4-inch Guition 4848S040](/screens/4848s040) with a [macOS menu-bar app](/getting-started/mac-app) on your local network. Set up the touchscreen in your browser and place it beside your keyboard.

<div class="homepage-features">

<article>

### Open apps and websites

Bring an app to the front or open a site in your default browser. Give your calendar, team chat or project dashboard a tile of its own.

[Apps](/mac-controls/apps) · [Websites](/mac-controls/websites)

</article>

<article>

### Jump straight to a Finder folder

Open an approved folder with a tap. Keep Downloads, client files or your current project within reach.

[Finder folders](/mac-controls/folders)

</article>

<article>

### Keep shortcuts in view

Turn keyboard combinations into labelled buttons, or start with presets for apps like Safari, Slack and Figma. Shortcut pages can follow the app you’re using.

[Keyboard shortcuts](/mac-controls/shortcuts)

</article>

<article>

### Lock your Mac

Add a Lock Machine tile to lock your Mac with a tap when you step away.

[Mac Lock permissions](/mac-controls/security)

</article>

<article>

### See how your Mac is doing

Check processor load, memory, storage, network activity or battery at a glance while you work.

[Mac statistics](/features/subpages#mac-statistics)

</article>

<article>

### Make the layout your own

Drag and resize tiles in the browser, choose their labels, icons and colours, and group related controls into pages for work, browsing or creative projects.

[Customise the display](/features/setup)

</article>

</div>

<div class="homepage-editor">

<div>

## A Look at the Web Editor

The browser preview shows how your cards will look on the touchscreen. This example groups browser shortcuts on a subpage, with a Back tile to return to the previous page.

[See the editor and settings](/features/setup) · [Create a subpage](/features/subpages#create-a-subpage) · [See the Mac app](/getting-started/mac-app#check-the-display-tab)

</div>

![Web editor preview of a subpage with Back, Address Bar, New Tab, Find and Close Tab tiles](/images/web-editor-subpage.jpg)

</div>

## Where to Buy

EspDesktop runs on the [4-inch Guition 4848S040 touchscreen](/screens/4848s040). You’ll also need a Mac running macOS 13 or newer and a shared local network with 2.4 GHz WiFi for the display.

- [Buy the Guition 4848S040 on AliExpress](https://s.click.aliexpress.com/e/_c2uYL5dd)
- [Get the 3D-printable stand on MakerWorld](https://makerworld.com/en/models/2581572-guition-esp32s3-4848s040-case-stand#profileId-2847301)

## Get Started

1. [Install the display firmware](/getting-started/install) using a USB-C data cable and Chrome or Edge, then connect the touchscreen to WiFi.
2. [Install and pair the EspDesktop menu-bar app](/getting-started/mac-app) using the code shown in the display’s settings.
3. Use the setup wizard to pick your first apps, or [build your own layout](/features/setup#add-a-mac-control) in the display’s browser editor.

You choose which apps and folders the display can open. Keyboard shortcuts and Mac Lock use macOS Accessibility access. [How pairing and permissions work](/mac-controls/security)

## Support This Project

If you find EspDesktop useful, consider buying me a coffee to support ongoing development.

<a class="homepage-support" href="https://www.buymeacoffee.com/jtenniswood">
  <img :src="supportButton" alt="Buy me a coffee" width="545" height="153" />
</a>

<script setup>
import supportButton from '../common/assets/images/buy-me-a-coffee-button.png'
</script>

<style scoped>
.homepage-features {
  display: grid;
  gap: 16px;
  margin-top: 24px;
}

@media (min-width: 640px) {
  .homepage-features {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 960px) {
  .homepage-features {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.homepage-features article {
  display: flex;
  flex-direction: column;
  padding: 24px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.homepage-features h3 {
  margin: 0;
  font-size: 18px;
}

.homepage-features p {
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
}

.homepage-features article > p + p {
  margin-top: auto;
  padding-top: 12px;
}

.homepage-editor {
  display: grid;
  align-items: center;
  gap: 24px;
  margin-top: 32px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}

@media (min-width: 768px) {
  .homepage-editor {
    grid-template-columns: minmax(0, 1fr) minmax(0, 300px);
  }
}

.homepage-editor h2 {
  margin: 0;
  padding: 0;
  border: 0;
}

.homepage-editor p:last-child {
  margin-bottom: 0;
}

.homepage-editor > p {
  margin: 0;
}

.homepage-editor img {
  width: 100%;
  max-width: 300px;
  border-radius: 8px;
}

.homepage-support {
  display: inline-block;
  max-width: 100%;
}

.homepage-support img {
  border-radius: 999px;
}
</style>
