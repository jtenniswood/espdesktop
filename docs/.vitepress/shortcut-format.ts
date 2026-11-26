import type { AppShortcutApplication, AppShortcutDefinition } from '../../src/webserver/generated/app_shortcuts'

export interface WindowsShortcutApplication {
  label: string
  executables: string[]
  targets?: string[]
  sources: string[]
  note?: string
  shortcuts: (AppShortcutDefinition & { note?: string })[]
}

export function shortcutCatalogue(definitions: AppShortcutApplication[]) {
  return definitions
    .toSorted((first, second) => first.label.localeCompare(second.label) || first.appId.localeCompare(second.appId))
    .map(app => ({
      ...app,
      shortcuts: [
        ...(app.extendedShortcuts ?? []),
        ...app.shortcuts,
        ...(app.safariShortcuts ?? []),
        ...(app.additionalShortcuts ?? []),
        ...(app.claudeShortcuts ?? []),
        ...(app.moreShortcuts ?? []),
      ],
    }))
}

const keyLabels: Record<string, string> = {
  command: 'Command', control: 'Control', option: 'Option',
  pageup: 'Page Up', pagedown: 'Page Down', forwarddelete: 'Forward Delete',
  shift: 'Shift', function: 'Fn', keycomma: ',', keyperiod: '.', keyslash: '/',
  keysemicolon: ';', keyquote: "'", keybackslash: '\\', keyminus: '-', keyequal: '=',
  keybracketleft: '[', keybracketright: ']', keybackquote: '`',
}

const windowsKeyLabels: Record<string, string> = {
  control: 'Ctrl', option: 'Alt', delete: 'Backspace', forwarddelete: 'Delete', keypaddecimal: 'Keypad .',
}

export function displayKeys(shortcut: string, platform = 'macos') {
  if (shortcut === 'escape-twice') return 'Escape twice'
  if (shortcut === 'claude-escape') return 'Escape (Claude)'
  return shortcut.replace(/^scoped\./, '').split('~').map(stroke => stroke.split('+')
    .map(key => (platform === 'windows' ? windowsKeyLabels[key] : undefined) ?? keyLabels[key] ?? (key.startsWith('keypad')
      ? 'Keypad ' + key.slice(6) : key[0].toUpperCase() + key.slice(1)))
    .join(' + ')).join(' then ')
}
