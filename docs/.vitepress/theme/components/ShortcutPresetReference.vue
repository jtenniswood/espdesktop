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
    <summary>{{ app.label }} ({{ app.shortcuts.length }} shortcuts)</summary>
    <table>
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
  margin-block: 12px;
  scroll-margin-top: calc(var(--vp-nav-height) + 16px);
}

summary {
  cursor: pointer;
  font-weight: 600;
}
</style>
