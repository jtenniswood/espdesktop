<script setup lang="ts">
import { ref } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps<{
  label: string
  slides: ReadonlyArray<{
    image: string
    alt: string
    title: string
    caption: string
  }>
}>()

const index = ref(0)

function move(offset: number) {
  const count = props.slides.length
  index.value = (index.value + offset + count) % count
}
</script>

<template>
  <div class="screenshot-gallery" role="group" :aria-label="label">
    <div class="gallery-controls" role="group" :aria-label="label + ' controls'">
      <button type="button" @click="move(-1)">
        <span aria-hidden="true">←</span> Previous
      </button>
      <button type="button" @click="move(1)">
        Next <span aria-hidden="true">→</span>
      </button>
    </div>

    <div aria-live="polite">
      <figure
        v-for="(slide, slideIndex) in slides"
        v-show="index === slideIndex"
        :key="slide.image"
        class="screenshot-slide"
      >
        <a class="screenshot-link" :href="withBase(slide.image)">
          <img :src="withBase(slide.image)" :alt="slide.alt" loading="lazy" decoding="async">
        </a>

        <figcaption>
          <p class="slide-position">{{ slideIndex + 1 }} / {{ slides.length }}</p>
          <strong class="slide-title">{{ slide.title }}</strong>
          <p class="slide-caption">{{ slide.caption }}</p>
        </figcaption>
      </figure>
    </div>
  </div>
</template>

<style scoped>
.screenshot-gallery {
  margin: 24px 0;
  padding: clamp(16px, 4vw, 28px);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
}

.screenshot-slide {
  display: grid;
  gap: 16px;
  max-width: 540px;
  margin: 0 auto;
}

.screenshot-slide .slide-position {
  margin: 0;
  line-height: 1.5;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.slide-title {
  display: block;
  margin-top: 6px;
  font-size: 20px;
  line-height: 1.35;
}

.screenshot-slide .slide-caption {
  margin: 8px 0 0;
}

.gallery-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.gallery-controls button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 600;
}

.gallery-controls button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.gallery-controls button:focus-visible,
.screenshot-link:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.screenshot-link {
  display: block;
  aspect-ratio: 4 / 5;
  border-radius: 8px;
}

.screenshot-link img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

@media (scripting: none) {
  .gallery-controls {
    display: none;
  }

  .screenshot-slide {
    display: grid !important;
  }

  .screenshot-slide + .screenshot-slide {
    margin-top: 24px;
  }
}
</style>
