import { COMPANION_SHORTCUT_APPS } from '../../../src/webserver/generated/app_shortcuts'
import { bundledExpandedShortcuts } from '../../../src/webserver/application/companion_shortcut_data'
import iconCatalog from '../../../product/v2/icons.json'
import guides from '../../.vitepress/shortcut-guides.json'
import { displayKeys } from '../../.vitepress/shortcut-format'

type Guide = {
  appId: string
  standalone?: boolean
  workflow?: string
  shortcuts?: string[]
  tip?: string
}

const copy = Object.entries(guides as Record<string, Guide>)
const apps = new Map(COMPANION_SHORTCUT_APPS.map(app => [app.appId, app]))
const icons = new Map(iconCatalog.icons.map(icon => [icon.name, icon.codepoint]))
const listFormatter = new Intl.ListFormat('en-GB', { type: 'conjunction' })

function validateCoverage() {
  const covered = new Set(copy.map(([, guide]) => guide.appId))
  const missing = [...apps.keys()].filter(appId => !covered.has(appId))
  const unknown = [...covered].filter(appId => !apps.has(appId))
  if (missing.length || unknown.length || covered.size !== copy.length) {
    throw new Error(`Shortcut guide coverage mismatch. Missing: ${missing.join(', ')}. Unknown: ${unknown.join(', ')}. Each app needs one guide.`)
  }
}

function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function markdownText(text: string) {
  return escapeHtml(text).replace(/[\[\]`*_]/g, '\\$&')
}

export default {
  paths() {
    validateCoverage()
    return copy.filter(([, guide]) => !guide.standalone).map(([slug, guide]) => {
      const app = apps.get(guide.appId)!
      if (!guide.workflow || !guide.tip || !guide.shortcuts?.length) {
        throw new Error(`Missing workflow, starter shortcuts, or tip for ${app.label}`)
      }

      const presets = [...app.shortcuts, ...bundledExpandedShortcuts(app.appId)]
      const picks = guide.shortcuts.map(label => {
        const preset = presets.find(candidate => candidate.label === label)
        if (!preset) throw new Error(`Unknown shortcut for ${app.label}: ${label}`)
        return preset
      })

      const appName = markdownText(app.label)
      const title = `${app.label} keyboard shortcuts`
      const description = `Use ${app.label} keyboard shortcuts on an EspDesktop touchscreen beside your Mac. Try ${listFormatter.format(picks.map(preset => preset.label))}.`
      const starterKeys = listFormatter.format(picks.map(preset =>
        `**${markdownText(preset.label)}** (**${markdownText(displayKeys(preset.shortcut))}**)`))
      const layout = picks.map(preset => {
        const codepoint = icons.get(preset.icon) ?? iconCatalog.fallback.codepoint
        return `<div class="shortcut-guide-card"><span class="shortcut-guide-glyph" data-glyph="&#x${codepoint};" aria-hidden="true"></span><span>${escapeHtml(preset.label)}</span></div>`
      }).join('\n  ')

      return {
        params: { app: slug, title, description },
        content: `
# ${appName} keyboard shortcuts

<picture>
  <source type="image/avif" srcset="/images/espdesktop-desk-480.avif 480w, /images/espdesktop-desk-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw">
  <img src="/images/espdesktop-desk.jpg" alt="EspDesktop touchscreen on a desk stand beside a Mac keyboard" width="1320" height="1093">
</picture>

EspDesktop puts ${appName} keyboard shortcuts on labelled buttons on a touchscreen beside your Mac. Keep those commands within reach while ${markdownText(guide.workflow)}.

## What can I do with it?

${markdownText(guide.tip)}

<figure class="shortcut-guide-example">
  <div class="shortcut-guide-grid">
    ${layout}
  </div>
  <figcaption>Example touchscreen buttons for ${escapeHtml(app.label)}</figcaption>
</figure>

## ${appName} shortcut reference

<ShortcutPresetReference app-id="${escapeHtml(app.appId)}" />

## ${appName} shortcuts FAQ

<div class="shortcut-faq">

::: details Which ${app.label} keyboard shortcuts should I try first?
Start with ${starterKeys}. Tapping a button sends its key combination to ${appName} on your Mac.
:::

::: details How do I add ${app.label} shortcuts to EspDesktop?
Add an **Applications** card for ${appName}, turn on **Add app subpage**, and choose the shortcuts you want. For one button, use a **Key Shortcut** card and pick ${appName} in the **Application** tab. See [how to add shortcut cards](/mac-controls/shortcuts#create-a-shortcut-card).
:::

::: details Can I choose which ${app.label} shortcuts appear on the display?
Yes. You can choose and reorder cards in the app subpage. You can also [add a custom keyboard shortcut](/mac-controls/shortcuts#create-a-shortcut-card) for a key combination you use in ${appName}.
:::

::: details Why is a ${app.label} shortcut not responding?
Try the keys shown in the table on your Mac first, with ${appName} open and the right window or item selected. If the keys work on your Mac, check [EspDesktop’s Accessibility permission](/mac-controls/shortcuts#allow-accessibility-access).
:::

</div>

[Browse all application shortcuts](/reference/shortcut-presets).
`,
      }
    })
  },
}
