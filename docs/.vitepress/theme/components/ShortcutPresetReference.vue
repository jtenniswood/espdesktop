<script setup lang="ts">
import { COMPANION_SHORTCUT_APPS } from '../../../../src/webserver/generated/app_shortcuts'

const keyLabels: Record<string, string> = {
  command: 'Command', control: 'Control', option: 'Option',
  shift: 'Shift', function: 'Fn', keycomma: ',', keyperiod: '.', keyslash: '/',
  keysemicolon: ';', keyquote: "'", keybackslash: '\\', keyminus: '-', keyequal: '=',
  keybracketleft: '[', keybracketright: ']', keybackquote: '`',
}

function displayKeys(shortcut: string) {
  if (shortcut === 'escape-twice') return 'Escape twice'
  if (shortcut === 'claude-escape') return 'Escape (Claude)'
  return shortcut.split('+')
    .map(key => keyLabels[key] ?? key[0].toUpperCase() + key.slice(1))
    .join(' + ')
}

function anchor(appId: string) {
  return appId.toLowerCase().replaceAll('.', '-')
}
</script>

<template>
  <details v-for="app in COMPANION_SHORTCUT_APPS" :id="anchor(app.appId)" :key="app.appId">
    <summary>
      <span class="preset-name">{{ app.label }}</span>
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
  </details>
</template>

<style scoped>
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

details > table {
  display: table;
  width: calc(100% - 32px);
  margin: 12px auto 0;
  border: 1px solid var(--vp-c-divider);
  table-layout: fixed;
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
