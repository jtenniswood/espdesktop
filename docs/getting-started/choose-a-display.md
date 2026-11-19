---
title: Choose an EspDesktop Display
description: Compare the 4-inch and 7-inch EspDesktop touchscreens before buying, then open the matching buying and installation guide.
---

# Choose your display

Choose the screen size you want before you buy. Each model has its own firmware and installation guide.

<div class="display-choices">

<article class="display-choice">

<img src="/images/espdesktop-desk-480.avif" alt="Square 4-inch touchscreen beside a keyboard" width="480" height="397">

## 4-inch square display

**Guition 4848S040 · ESP32-S3**

A compact screen for quick controls beside your keyboard. The 480 × 480 display has a 3×3 Home grid with nine card slots.

Use the public firmware and browser installer.

<a class="docs-primary-action" href="/screens/4848s040">Choose 4-inch</a>

</article>

<article class="display-choice">

<img src="/images/jc1060p470-hero.jpg" alt="Wide 7-inch Guition JC1060P470 touchscreen" width="1024" height="798">

## 7-inch landscape display

**Guition JC1060P470 V3 · ESP32-P4**

A wider screen with room for more controls. The 1024 × 600 display has a 3×5 Home grid with 15 card slots.

EspDesktop firmware for this model is currently a test build. Check the V3 hardware revision before ordering.

<a class="docs-primary-action" href="/screens/jc1060p470-v3">Choose 7-inch</a>

</article>

</div>

<style scoped>
.display-choices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 20px;
  margin: 24px 0;
}

.display-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}

.display-choice img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
}

.display-choice h2 {
  margin: 18px 0 0;
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
