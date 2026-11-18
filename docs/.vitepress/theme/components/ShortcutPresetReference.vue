<script setup lang="ts">
import { computed, ref } from 'vue'
import { COMPANION_SHORTCUT_APPS } from '../../../../src/webserver/generated/app_shortcuts'
import { bundledExpandedShortcuts } from '../../../../src/webserver/application/companion_shortcut_data'
import { displayKeys } from '../../shortcut-format'
import shortcutsGuides from '../../shortcut-guides.json'

const props = defineProps<{ appId?: string }>()
const search = ref('')
const guideSlugs = new Map(Object.entries(shortcutsGuides).map(([slug, guide]) => [guide.appId, slug]))
const app = computed(() => COMPANION_SHORTCUT_APPS.find(app => app.appId === props.appId))
const shortcuts = computed(() => app.value
  ? [...app.value.shortcuts, ...bundledExpandedShortcuts(app.value.appId)]
  : [])

const matchingApps = computed(() => {
  const query = search.value.trim().toLowerCase()
  return COMPANION_SHORTCUT_APPS.filter(app => app.label.toLowerCase().includes(query))
})

function anchor(appId: string) {
  return appId.toLowerCase().replaceAll('.', '-')
}
</script>

<template>
  <template v-if="!appId">
    <div class="preset-search" role="search" aria-label="Application shortcuts">
      <input v-model="search" type="search" placeholder="Search apps" aria-label="Search apps" />
      <p role="status">{{ matchingApps.length ? '' : 'No matching apps.' }}</p>
    </div>
    <ul class="preset-list" aria-label="Application shortcut guides">
      <li v-for="entry in matchingApps" :id="anchor(entry.appId)" :key="entry.appId">
        <a :href="`/reference/shortcut-presets/${guideSlugs.get(entry.appId)}`">
          <span>{{ entry.label }}</span>
          <span class="preset-chevron" aria-hidden="true"></span>
        </a>
      </li>
    </ul>
  </template>
  <table v-else-if="app" :aria-label="`${app.label} shortcuts`">
    <thead>
      <tr><th scope="col">Action</th><th scope="col">Keys</th></tr>
    </thead>
    <tbody>
      <tr v-for="shortcut in shortcuts" :key="shortcut.id">
        <td>{{ shortcut.label }}</td><td>{{ displayKeys(shortcut.shortcut) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.preset-search {
  margin: 24px 0 12px;
}

.preset-search input {
  width: 100%;
  min-height: 44px;
  padding: 8px 12px;
  font-size: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.preset-search input:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.preset-search [role='status']:empty {
  margin: 0;
}

.preset-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.preset-list li {
  margin: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  scroll-margin-top: calc(var(--vp-nav-height) + 16px);
}

.preset-list a {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 48px;
  padding: 10px 12px;
  color: var(--vp-c-text-1);
  font-weight: 600;
  text-decoration: none;
}

.preset-list a:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.preset-list a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.preset-chevron {
  flex: 0 0 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
}

table {
  display: table;
  width: 100%;
  margin: 12px auto 0;
  border: 1px solid var(--vp-c-divider);
  table-layout: fixed;
}

th,
td {
  border: 0;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

th + th,
td + td {
  border-inline-start: 1px solid var(--vp-c-divider);
}

th {
  font-size: 13px;
}

th:first-child {
  width: 45%;
}

tbody tr:nth-child(even) {
  background: var(--vp-c-bg);
}
</style>
