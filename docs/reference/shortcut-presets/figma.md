---
title: Figma keyboard shortcuts
description: Keep your favourite Figma shortcuts one tap away. Use EspDesktop to duplicate layers, frame selections, and create components from a touchscreen beside your Mac.
---

<script setup>
import ShortcutPresetReference from '../../.vitepress/theme/components/ShortcutPresetReference.vue'
</script>

# Figma keyboard shortcuts

<picture>
  <source type="image/avif" srcset="/images/espdesktop-desk-480.avif 480w, /images/espdesktop-desk-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw">
  <img src="/images/espdesktop-desk.jpg" alt="EspDesktop touchscreen on a desk stand beside a Mac keyboard" width="1320" height="1093">
</picture>

EspDesktop is a small touchscreen that pairs with your Mac and puts your favourite Figma keyboard shortcuts on labelled buttons. Select a layer in Figma and tap **Duplicate** on the display. EspDesktop sends **Command + D** to Figma, so you can make a copy with one tap. Build a page of the shortcuts you use most and keep them within reach beside your keyboard.

## What can I do with it?

Start with **Duplicate**, **Frame**, and **New Component**. Duplicate a starting layout, wrap selected layers in a frame, or turn a design into a reusable component. Add **Actions** if you often search Figma for commands. Put the controls you reach for most where they’re easiest to tap.

<div style="position: relative; overflow: hidden; aspect-ratio: 1">
  <picture>
    <source type="image/avif" srcset="/images/web-editor-figma-subpage-480.avif 480w, /images/web-editor-figma-subpage-960.avif 960w" sizes="(min-width: 768px) 733px, 96vw">
    <img src="/images/web-editor-figma-subpage.png" alt="EspDesktop layout preview showing Figma shortcut cards for Frame, Duplicate, and Copy PNG" width="1562" height="2134" style="position: absolute; width: 106.55%; max-width: none; height: auto; left: -3.27%; top: -18.28%" loading="lazy">
  </picture>
</div>

## Figma shortcut reference

<ShortcutPresetReference app-id="com.figma.Desktop" flat />

## Figma shortcuts FAQ

<div class="shortcut-faq">

::: details Can I use a touchscreen for Figma keyboard shortcuts on Mac?
Yes. EspDesktop turns Figma keyboard shortcuts into labelled touchscreen buttons. When you tap a button, the EspDesktop Mac app sends its key combination to Figma. For example, tapping **Duplicate** sends **Command + D** to duplicate the selected layer.
:::

::: details Which Figma keyboard shortcuts should I put on my touchscreen?
Start with **Actions** (**Command + K**) to find a command, **Duplicate** (**Command + D**) to copy a selected layer, and **Frame** (**Option + Command + G**) to wrap selected layers in a frame. Add **New Component** (**Option + Command + K**) if you often turn selections into reusable components.
:::

::: details Can I customise which Figma shortcuts appear on EspDesktop?
Yes. A Figma app subpage lets you choose which shortcut cards appear and reorder them. For a key combination you already use in Figma, you can also [add a custom Key Shortcut card](/mac-controls/shortcuts#create-a-shortcut-card).
:::

::: details Can EspDesktop show my Figma shortcuts automatically when I switch to Figma?
Yes. Once Figma has an app subpage, EspDesktop can open it when Figma becomes the active app on your Mac. This is the default behaviour, and you can change it in the [App Subpages settings](/mac-controls/apps).
:::

::: details Why are my Figma shortcut buttons not working on EspDesktop?
Check that EspDesktop has [macOS Accessibility permission](/mac-controls/shortcuts#allow-accessibility-access), then try the same shortcut on your Mac with a Figma design open. Commands such as **Duplicate** and **Frame** need a selection on the canvas.
:::

</div>

[Browse all application shortcuts](/reference/shortcut-presets).

<style scoped>
.shortcut-faq {
  margin: 16px 0 32px;
}

.shortcut-faq .custom-block.details {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.shortcut-faq .custom-block.details + .details {
  border-top: 1px solid var(--vp-c-divider);
}

.shortcut-faq .details > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  margin: 0;
  padding: 20px 4px 20px 0;
  list-style: none;
  color: var(--vp-c-text-1);
  font-size: 1rem;
  font-weight: 600;
}

.shortcut-faq .details > summary::-webkit-details-marker {
  display: none;
}

.shortcut-faq .details > summary::after {
  content: '';
  flex: 0 0 9px;
  height: 9px;
  margin: 0 3px 4px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  color: var(--vp-c-text-2);
  transform: rotate(45deg);
}

.shortcut-faq .details[open] > summary::after {
  margin: 4px 3px 0;
  transform: rotate(225deg);
}

.shortcut-faq .details > summary:hover {
  color: var(--vp-c-brand-1);
}

.shortcut-faq .details > summary:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.shortcut-faq .details > summary + p {
  margin: 0;
  padding: 0 28px 24px 0;
  color: var(--vp-c-text-2);
  font-size: 0.9375rem;
  line-height: 1.65;
}
</style>
