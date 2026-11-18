<script setup lang="ts">
import { computed, ref } from 'vue'
import { COMPANION_SHORTCUT_APPS } from '../../../../src/webserver/generated/app_shortcuts'
import { bundledExpandedShortcuts } from '../../../../src/webserver/application/companion_shortcut_data'

const props = defineProps<{ appId?: string; flat?: boolean }>()
const search = ref('')
const guideSlugs: Record<string, string> = {
  'com.figma.Desktop': 'figma',
  'tv.twitch.web-app': 'twitch',
  'com.streamlabs.slobs': 'streamlabs-desktop',
}
const apps = computed(() => COMPANION_SHORTCUT_APPS
  .filter(app => !props.appId || app.appId === props.appId)
  .map(app => ({ ...app, shortcuts: [...app.shortcuts, ...bundledExpandedShortcuts(app.appId)] })))
const matchingApps = computed(() => {
  const query = search.value.trim().toLowerCase()
  return apps.value.filter(app => app.label.toLowerCase().includes(query))
})

const keyLabels: Record<string, string> = {
  command: 'Command', control: 'Control', option: 'Option',
  shift: 'Shift', function: 'Fn', keycomma: ',', keyperiod: '.', keyslash: '/',
  keysemicolon: ';', keyquote: "'", keybackslash: '\\', keyminus: '-', keyequal: '=',
  keybracketleft: '[', keybracketright: ']', keybackquote: '`',
}

function displayKeys(shortcut: string) {
  if (shortcut === 'escape-twice') return 'Escape twice'
  if (shortcut === 'claude-escape') return 'Escape (Claude)'
  return shortcut.replace(/^scoped\./, '').split('~').map(stroke => stroke.split('+')
    .map(key => keyLabels[key] ?? (key.startsWith('keypad')
      ? 'Keypad ' + key.slice(6) : key[0].toUpperCase() + key.slice(1)))
    .join(' + ')).join(' then ')
}

function anchor(appId: string) {
  return appId.toLowerCase().replaceAll('.', '-')
}
</script>

<template>
  <div v-if="!appId" class="preset-search" role="search" aria-label="Application shortcuts">
    <input v-model="search" type="search" placeholder="Search apps" aria-label="Search apps" />
    <p role="status">{{ matchingApps.length ? '' : 'No matching apps.' }}</p>
  </div>
  <component :is="flat ? 'div' : 'details'" v-for="app in apps" v-show="matchingApps.includes(app)"
    :id="anchor(app.appId)" :key="app.appId" :open="flat ? undefined : !!appId">
    <summary v-if="!flat">
      <span class="preset-name">{{ app.label }}</span>
      <a v-if="!appId && guideSlugs[app.appId]" class="preset-guide"
        :href="`/reference/shortcut-presets/${guideSlugs[app.appId]}`"
        :aria-label="`Setup guide for ${app.label}`">Setup guide</a>
      <span class="preset-count">{{ app.shortcuts.length }} {{ app.shortcuts.length === 1 ? 'shortcut' : 'shortcuts' }}</span>
      <span class="preset-chevron" aria-hidden="true"></span>
    </summary>
    <table :aria-label="`${app.label} shortcuts`">
      <thead>
        <tr><th scope="col">Action</th><th scope="col">Keys</th></tr>
      </thead>
      <tbody>
        <tr v-for="shortcut in app.shortcuts" :key="shortcut.id">
          <td>{{ shortcut.label }}</td><td>{{ displayKeys(shortcut.shortcut) }}</td>
        </tr>
      </tbody>
    </table>
  </component>
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

summary:has(.preset-guide) {
  grid-template-columns: minmax(0, 1fr) auto auto 16px;
}

.preset-guide {
  font-size: 13px;
  text-align: right;
}

details {
  border-bottom: 1px solid var(--vp-c-divider);
  scroll-margin-top: calc(var(--vp-nav-height) + 16px);
}

details[open] {
  padding-bottom: 16px;
}

details > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  margin: 0;
  padding: 10px 8px;
  cursor: pointer;
  list-style: none;
}

summary::-webkit-details-marker {
  display: none;
}

summary:hover,
details[open] > summary {
  background: var(--vp-c-bg-soft);
}

summary:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

.preset-name {
  font-weight: 600;
}

.preset-count {
  color: var(--vp-c-text-2);
  font-size: 13px;
  white-space: nowrap;
}

.preset-chevron {
  justify-self: center;
  width: 8px;
  height: 8px;
  border-right: 2px solid var(--vp-c-text-2);
  border-bottom: 2px solid var(--vp-c-text-2);
  transform: translateY(-2px) rotate(45deg);
}

details[open] .preset-chevron {
  transform: translateY(2px) rotate(225deg);
}

table {
  display: table;
  width: 100%;
  margin: 12px auto 0;
  border: 1px solid var(--vp-c-divider);
  table-layout: fixed;
}

details > table {
  width: calc(100% - 32px);
}

table th,
table td {
  border: 0;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

table th + th,
table td + td {
  border-inline-start: 1px solid var(--vp-c-divider);
}

table th {
  font-size: 13px;
}

table th:first-child {
  width: 45%;
}

table tbody tr:nth-child(even) {
  background: var(--vp-c-bg);
}
</style>
