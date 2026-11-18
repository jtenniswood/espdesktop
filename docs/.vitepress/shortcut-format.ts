const keyLabels: Record<string, string> = {
  command: 'Command', control: 'Control', option: 'Option',
  shift: 'Shift', function: 'Fn', keycomma: ',', keyperiod: '.', keyslash: '/',
  keysemicolon: ';', keyquote: "'", keybackslash: '\\', keyminus: '-', keyequal: '=',
  keybracketleft: '[', keybracketright: ']', keybackquote: '`',
}

export function displayKeys(shortcut: string) {
  if (shortcut === 'escape-twice') return 'Escape twice'
  if (shortcut === 'claude-escape') return 'Escape (Claude)'
  return shortcut.replace(/^scoped\./, '').split('~').map(stroke => stroke.split('+')
    .map(key => keyLabels[key] ?? (key.startsWith('keypad')
      ? 'Keypad ' + key.slice(6) : key[0].toUpperCase() + key.slice(1)))
    .join(' + ')).join(' then ')
}
