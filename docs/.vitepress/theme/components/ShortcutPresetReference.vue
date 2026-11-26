<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, onMounted, ref } from 'vue'
import type { AppShortcutApplication } from '../../../../src/webserver/generated/app_shortcuts'
import { shortcutCatalogue, type WindowsShortcutApplication } from '../../shortcut-format'
import { data as guides } from '../../shortcut-index.data'
import ShortcutPresetTable from './ShortcutPresetTable.vue'

const macFiles = import.meta.glob<AppShortcutApplication>(
  ['../../../../product/v2/app_shortcuts/*.json', '!../../../../product/v2/app_shortcuts/manifest.json'],
  { import: 'default' },
)
const windowsFiles = import.meta.glob<WindowsShortcutApplication>(
  '../../../../product/v2/app_shortcuts/platforms/windows/*.json', { import: 'default' },
)
const props = defineProps<{ appId?: string; windowsId?: string }>()
const search = ref('')
// Keep both catalogues in the static HTML and Markdown export.
const platform = ref<'all' | 'macos' | 'windows'>('all')
const platformOptions = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'Mac' },
] as const

onMounted(() => {
  if ((props.appId || props.windowsId) && location.hash === '#windows-shortcuts') {
    platform.value = 'windows'
    return
  }
  if ((props.appId || props.windowsId) && location.hash === '#macos-shortcuts') {
    platform.value = 'macos'
    return
  }
  const browser = navigator as Navigator & { userAgentData?: { platform?: string } }
  const system = [browser.userAgentData?.platform, browser.platform]
    .find(hint => hint && /^(win|mac)/i.test(hint))
  if (system) {
    platform.value = /^win/i.test(system) ? 'windows' : 'macos'
  } else {
    platform.value = /\bWindows NT\b/i.test(browser.userAgent) ? 'windows' : 'macos'
  }
})
const guide = computed(() => guides.find(entry => entry.macAppId === props.appId && !!props.appId ||
  entry.slug === props.windowsId))
const macTable = computed(() => {
  const file = guide.value?.macFile
  if (!file) return undefined
  const load = macFiles[`../../../../product/v2/app_shortcuts/${file}`]
  return defineAsyncComponent(async () => {
    const [app] = shortcutCatalogue([await load()])
    return defineComponent(() => () => h(ShortcutPresetTable, { app, platform: 'macos' }))
  })
})
const windowsTable = computed(() => {
  const entry = guide.value
  if (!entry?.windowsLabel) return undefined
  const load = windowsFiles[`../../../../product/v2/app_shortcuts/platforms/windows/${entry.slug}.json`]
  return defineAsyncComponent(async () => {
    const app = await load()
    return defineComponent(() => () => h(ShortcutPresetTable, { app, platform: 'windows' }))
  })
})

const matchingApps = computed(() => {
  const query = search.value.trim().toLowerCase()
  return guides.flatMap(entry => {
    const label = platform.value === 'windows' ? entry.windowsLabel :
      platform.value === 'macos' ? entry.macLabel : entry.macLabel ?? entry.windowsLabel
    if (!label) return []
    if (label.toLowerCase().includes(query) ||
        (platform.value === 'all' && entry.windowsLabel?.toLowerCase().includes(query))) {
      const id = (entry.macAppId ?? entry.slug).toLowerCase().replaceAll('.', '-')
      const section = platform.value !== 'all' && entry.macLabel && entry.windowsLabel
        ? `#${platform.value}-shortcuts` : ''
      return [{ slug: entry.slug, id, label, section }]
    }
    return []
  }).sort((a, b) => a.label.localeCompare(b.label))
})
</script>

<template>
  <template v-if="!appId && !windowsId">
    <div class="preset-search" role="search" aria-label="Application shortcuts">
      <input v-model="search" type="search" placeholder="Search apps" aria-label="Search apps" />
      <div class="platform-toggle" role="group" aria-label="Platform">
        <button
          v-for="option in platformOptions"
          :key="option.value"
          type="button"
          :aria-pressed="platform === option.value"
          @click="platform = option.value"
        >{{ option.label }}</button>
      </div>
      <p role="status">{{ matchingApps.length ? '' : 'No matching apps.' }}</p>
    </div>
    <ul class="preset-list" aria-label="Application shortcut guides">
      <li v-for="entry in matchingApps" :id="entry.id" :key="entry.slug">
        <a :href="`/reference/shortcut-presets/${entry.slug}${entry.section}`">
          <span>{{ entry.label }}</span>
          <span class="preset-chevron" aria-hidden="true"></span>
        </a>
      </li>
    </ul>
  </template>
  <template v-else-if="macTable && windowsTable">
    <details id="windows-shortcuts" :open="platform === 'windows'">
      <summary>Windows shortcuts</summary>
      <component :is="windowsTable" />
    </details>
    <details id="macos-shortcuts" :open="platform !== 'windows'">
      <summary>macOS shortcuts</summary>
      <component :is="macTable" />
    </details>
  </template>
  <component v-else-if="windowsTable" :is="windowsTable" />
  <component v-else-if="macTable" :is="macTable" />
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

.platform-toggle {
  display: inline-flex;
  gap: 2px;
  margin-top: 12px;
  padding: 3px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-soft);
}

.platform-toggle button {
  min-height: 44px;
  min-width: 80px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--vp-c-text-2);
}

.platform-toggle button:hover {
  color: var(--vp-c-text-1);
}

.platform-toggle button[aria-pressed='true'] {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.platform-toggle button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
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
