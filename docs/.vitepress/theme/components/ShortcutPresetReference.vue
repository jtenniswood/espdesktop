<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AppShortcutApplication } from '../../../../src/webserver/generated/app_shortcuts'
import { shortcutCatalogue, type WindowsShortcutApplication } from '../../shortcut-format'
import shortcutsGuides from '../../shortcut-guides.json'
import ShortcutPresetTable from './ShortcutPresetTable.vue'

const definitions = import.meta.glob<AppShortcutApplication>(
  ['../../../../product/v2/app_shortcuts/*.json', '!../../../../product/v2/app_shortcuts/manifest.json'],
  { eager: true, import: 'default' },
)
const apps = shortcutCatalogue(Object.values(definitions))
const windowsFiles = import.meta.glob<WindowsShortcutApplication>(
  '../../../../product/v2/app_shortcuts/platforms/windows/*.json', { eager: true, import: 'default' },
)
const windowsApps = new Map(Object.entries(windowsFiles).map(([path, app]) =>
  [path.split('/').at(-1)!.replace(/\.json$/, ''), app]))
const guideSlugs = new Map(Object.entries(shortcutsGuides).map(([slug, guide]) => [guide.appId, slug]))
const referenceEntries = [
  ...apps.map(app => ({ slug: guideSlugs.get(app.appId)!, appId: app.appId, label: app.label, mac: true })),
  ...[...windowsApps].filter(([slug]) => !Object.hasOwn(shortcutsGuides, slug))
    .map(([slug, app]) => ({ slug, appId: slug, label: app.label, mac: false })),
]

const props = defineProps<{ appId?: string; windowsId?: string }>()
const search = ref('')
const platform = ref('all')
const macApp = computed(() => apps.find(app => app.appId === props.appId))
const windowsApp = computed(() => windowsApps.get(props.windowsId ?? guideSlugs.get(props.appId ?? '') ?? ''))

const matchingApps = computed(() => {
  const query = search.value.trim().toLowerCase()
  return referenceEntries.flatMap(app => {
    const windows = windowsApps.get(app.slug)
    if (platform.value === 'windows' && !windows || platform.value === 'macos' && !app.mac) return []
    const label = platform.value === 'windows' ? windows!.label : app.label
    if (label.toLowerCase().includes(query) ||
        (platform.value === 'all' && windows?.label.toLowerCase().includes(query))) return [{ ...app, label }]
    return []
  }).sort((a, b) => a.label.localeCompare(b.label))
})

function anchor(appId: string) {
  return appId.toLowerCase().replaceAll('.', '-')
}
</script>

<template>
  <template v-if="!appId && !windowsId">
    <div class="preset-search" role="search" aria-label="Application shortcuts">
      <input v-model="search" type="search" placeholder="Search apps" aria-label="Search apps" />
      <label class="platform-select">
        Platform
        <select v-model="platform">
          <option value="all">All platforms</option>
          <option value="macos">macOS</option>
          <option value="windows">Windows</option>
        </select>
      </label>
      <p role="status">{{ matchingApps.length ? '' : 'No matching apps.' }}</p>
    </div>
    <ul class="preset-list" aria-label="Application shortcut guides">
      <li v-for="entry in matchingApps" :id="anchor(entry.appId)" :key="entry.appId">
        <a :href="`/reference/shortcut-presets/${entry.slug}`">
          <span>{{ entry.label }}</span>
          <span class="preset-chevron" aria-hidden="true"></span>
        </a>
      </li>
    </ul>
  </template>
  <template v-else-if="macApp && windowsApp">
    <details id="windows-shortcuts">
      <summary>Windows shortcuts</summary>
      <ShortcutPresetTable :app="windowsApp" platform="windows" />
    </details>
    <details id="macos-shortcuts" open>
      <summary>macOS shortcuts</summary>
      <ShortcutPresetTable :app="macApp" platform="macos" />
    </details>
  </template>
  <ShortcutPresetTable v-else-if="windowsApp" :app="windowsApp" platform="windows" />
  <ShortcutPresetTable v-else-if="macApp" :app="macApp" platform="macos" />
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

.platform-select {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.platform-select select {
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
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

details {
  margin: 12px 0;
}

summary {
  display: list-item;
  cursor: pointer;
  padding-block: 8px;
  font-weight: 600;
}
</style>
