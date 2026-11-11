<script setup lang="ts">
import { computed, ref } from 'vue'
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
const slide = computed(() => props.slides[index.value])

function move(offset: number) {
  const count = props.slides.length
  index.value = (index.value + offset + count) % count
}
</script>

<template>
  <figure class="screenshot-gallery" :aria-label="label">
    <figcaption>
      <div class="gallery-controls" role="group" :aria-label="label + ' controls'">
        <button type="button" @click="move(-1)">
          <span aria-hidden="true">←</span> Previous
        </button>
        <button type="button" @click="move(1)">
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        <span class="slide-position">{{ index + 1 }} / {{ slides.length }}</span>
        <strong class="slide-title">{{ slide.title }}</strong>
        <p>{{ slide.caption }}</p>
      </div>
    </figcaption>

    <a class="screenshot-link" :href="withBase(slide.image)">
      <img :src="withBase(slide.image)" :alt="slide.alt" loading="lazy" decoding="async">
    </a>
  </figure>
</template>

<style scoped>
.screenshot-gallery {
  display: grid;
  align-items: start;
  gap: 16px;
  margin: 24px 0;
  padding: clamp(16px, 4vw, 28px);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
}

.slide-position {
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

.screenshot-gallery p {
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
  position: relative;
  justify-self: center;
  width: 100%;
  max-width: 360px;
  aspect-ratio: 4 / 5;
  border-radius: 8px;
}

.screenshot-link img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

@media (min-width: 640px) {
  .screenshot-gallery {
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
    gap: 24px;
  }

  .screenshot-gallery figcaption {
    padding-top: 32px;
  }
}
</style>
