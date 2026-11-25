<script setup lang="ts">
import type { AppShortcutDefinition } from '../../../../src/webserver/generated/app_shortcuts'
import { displayKeys } from '../../shortcut-format'

defineProps<{
  app: {
    label: string
    note?: string
    sources?: readonly string[]
    shortcuts: readonly (AppShortcutDefinition & { note?: string })[]
  }
  platform: 'windows' | 'macos'
}>()
</script>

<template>
  <p v-if="app.note">{{ app.note }}</p>
  <table :aria-label="`${app.label} ${platform === 'windows' ? 'Windows' : 'macOS'} shortcuts`">
    <thead>
      <tr><th scope="col">Action</th><th scope="col">{{ platform === 'windows' ? 'Windows keys' : 'macOS keys' }}</th></tr>
    </thead>
    <tbody>
      <tr v-for="shortcut in app.shortcuts" :key="shortcut.id">
        <td>{{ shortcut.label }}<small v-if="shortcut.note">{{ shortcut.note }}</small></td>
        <td>{{ displayKeys(shortcut.shortcut, platform) }}</td>
      </tr>
    </tbody>
  </table>
  <p v-if="app.sources?.length" class="preset-sources">
    Vendor references
    <a v-for="(source, number) in app.sources" :key="source" :href="source"
      :aria-label="`${app.label} shortcut reference ${number + 1}`">{{ number + 1 }}</a>
  </p>
</template>

<style scoped>
td small {
  display: block;
  color: var(--vp-c-text-2);
}

.preset-sources a {
  margin-inline-start: 8px;
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
