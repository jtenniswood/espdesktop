<script setup lang="ts">
import { useData } from 'vitepress'

const { frontmatter } = useData()

function localPath(url: string) {
  return new URL(url).pathname
}
</script>

<template>
  <nav v-if="frontmatter.breadcrumbTrail" class="guide-breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li v-for="(crumb, index) in frontmatter.breadcrumbTrail" :key="crumb.item">
        <span v-if="index === frontmatter.breadcrumbTrail.length - 1" aria-current="page">{{ crumb.name }}</span>
        <a v-else :href="localPath(crumb.item)">{{ crumb.name }}</a>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.guide-breadcrumbs ol {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 16px;
  list-style: none;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.guide-breadcrumbs li + li::before {
  content: '›';
  margin-inline-end: 10px;
}

.guide-breadcrumbs a {
  color: var(--vp-c-brand-1);
}
</style>
