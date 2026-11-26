---
title: Choose an EspDesktop Display
description: Compare the 4-inch, 7-inch, and 10.1-inch EspDesktop touchscreens before buying, then open the matching buying and installation guide.
pageClass: display-chooser-page
aside: false
---

# Choose your display

Choose the screen size you want before you buy. Each model has its own firmware and installation guide.

<div class="display-choices">

<article class="display-choice">

<picture>
  <source type="image/avif" srcset="/images/espdesktop-desk-480.avif 480w, /images/espdesktop-desk-960.avif 960w" sizes="(min-width: 960px) 510px, (min-width: 560px) 48vw, 95vw">
  <img src="/images/espdesktop-desk.jpg" alt="Square 4-inch touchscreen beside a keyboard" width="1320" height="1093">
</picture>

<div class="display-choice-copy">

## 4-inch square display

**Guition 4848S040 · ESP32-S3**

A compact screen for quick controls beside your keyboard. The 480 × 480 display has a 3×3 Home grid with nine card slots.

Use the public firmware and browser installer.

<a class="docs-primary-action" href="/screens/4848s040">Choose 4-inch</a>

</div>

</article>

<article class="display-choice">

<img src="/images/jc1060p470-hero.jpg" alt="Wide 7-inch Guition JC1060P470 touchscreen" width="1024" height="798">

<div class="display-choice-copy">

## 7-inch landscape display

**Guition JC1060P470 V3 · ESP32-P4**

A wider screen with room for more controls. The 1024 × 600 display has a 3×5 Home grid with 15 card slots.

EspDesktop firmware for this model is currently a test build. Check the V3 hardware revision before ordering.

<a class="docs-primary-action" href="/screens/jc1060p470-v3">Choose 7-inch</a>

</div>

</article>

<article class="display-choice">

<div class="display-choice-copy">

## 10.1-inch landscape display

**Guition JC8012P4A1 V3 · ESP32-P4**

The 1280 × 800 display has 24 Home slots in landscape and 18 in portrait.

EspDesktop Companion support uses test firmware. Confirm the ESP32-P4 chip revision with the seller before ordering.

<a class="docs-primary-action" href="/screens/jc8012p4a1-v3">Choose 10.1-inch</a>

</div>

</article>

</div>

<style scoped>
:global(.display-chooser-page .VPDoc > .container > .content) {
  width: 100%;
  max-width: 1040px;
}

.display-choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 20px;
  margin: 24px 0;
}

.display-choice {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}

.display-choice picture {
  display: block;
}

.display-choice img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 5 / 4;
  object-fit: contain;
  background: var(--vp-c-bg-soft);
}

.display-choice-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  padding: 20px;
}

.display-choice h2 {
  margin: 0;
  padding: 0;
  border: 0;
  font-size: 1.25rem;
}

.display-choice p {
  margin: 8px 0;
}

.display-choice .docs-primary-action {
  margin-top: auto;
}
</style>
