import { readdirSync, readFileSync } from 'node:fs'
import type { AppShortcutApplication } from '../../../src/webserver/generated/app_shortcuts'
import iconCatalog from '../../../product/v2/icons.json'
import guides from '../../.vitepress/shortcut-guides.json'
import { displayKeys, shortcutCatalogue, type WindowsShortcutApplication } from '../../.vitepress/shortcut-format'

type Guide = {
  appId: string
  standalone?: boolean
  workflow?: string
  shortcuts?: string[]
  tip?: string
}

const copy = Object.entries(guides as Record<string, Guide>)
const sourceDir = new URL('../../../product/v2/app_shortcuts/', import.meta.url)
const definitions = readdirSync(sourceDir)
  .filter(name => name.endsWith('.json') && name !== 'manifest.json')
  .map(name => JSON.parse(readFileSync(new URL(name, sourceDir), 'utf8')) as AppShortcutApplication)
const apps = new Map(shortcutCatalogue(definitions).map(app => [app.appId, app]))
const windowsDir = new URL('platforms/windows/', sourceDir)
const windowsApps = new Map(readdirSync(windowsDir).filter(name => name.endsWith('.json')).map(name =>
  [name.slice(0, -5), JSON.parse(readFileSync(new URL(name, windowsDir), 'utf8')) as WindowsShortcutApplication]))
const icons = new Map(iconCatalog.icons.map(icon => [icon.name, icon.codepoint]))
const listFormatter = new Intl.ListFormat('en-GB', { type: 'conjunction' })
const windowsSetup = '[Set up application shortcut buttons on Windows](/windows#add-controls).\n'

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
    const macPaths = copy.filter(([, guide]) => !guide.standalone).map(([slug, guide]) => {
      const app = apps.get(guide.appId)!
      if (!guide.workflow || !guide.tip || !guide.shortcuts?.length) {
        throw new Error(`Missing workflow, starter shortcuts, or tip for ${app.label}`)
      }

      const presets = app.shortcuts
      const picks = guide.shortcuts.map(label => {
        const preset = presets.find(candidate => candidate.label === label)
        if (!preset) throw new Error(`Unknown shortcut for ${app.label}: ${label}`)
        return preset
      })

      const appName = markdownText(app.label)
      const title = `${app.label} keyboard shortcuts`
      const windowsApp = windowsApps.get(slug)
      const description = windowsApp
        ? `Look up ${app.label} keyboard shortcuts for macOS and Windows and choose presets for your EspDesktop touchscreen.`
        : `Use ${app.label} keyboard shortcuts on an EspDesktop touchscreen beside your Mac. Try ${listFormatter.format(picks.map(preset => preset.label))}.`
      const starterKeys = listFormatter.format(picks.map(preset =>
        `**${markdownText(preset.label)}** (**${markdownText(displayKeys(preset.shortcut))}**)`))
      // The first slot is Back, as it is on the display's app subpages.
      const shortcutsById = new Map(presets.map(preset => [preset.id, preset]))
      const defaults = (app.defaultShortcutIds ?? []).flatMap(id => {
        const preset = shortcutsById.get(id)
        return preset ? [preset] : []
      })
      const returnLabel = 'Back to layout'
      const labels = new Set([returnLabel.toLowerCase()])
      const candidates = [...defaults, ...presets]
      const compactLabels = candidates.filter(preset => preset.label.length <= 26)
      const sample = [...picks, ...compactLabels, ...candidates].filter(preset => {
        const label = preset.label.toLowerCase()
        if (labels.has(label)) return false
        labels.add(label)
        return true
      })
      const buttons = [{ label: returnLabel, icon: 'Chevron Left' }, ...sample.slice(0, 8)]
      const layout = buttons.map(({ label, icon }) => {
        const codepoint = icons.get(icon) ?? iconCatalog.fallback.codepoint
        return `<div class="shortcut-guide-card"><span class="shortcut-guide-glyph" data-glyph="&#x${codepoint};" aria-hidden="true"></span><span class="shortcut-guide-card-label">${escapeHtml(label)}</span></div>`
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

<FaqAccordion>

::: details Which ${app.label} keyboard shortcuts should I try first?
Start with ${starterKeys}. Tapping a button sends its key combination to ${appName} on your Mac.
:::

::: details How do I add ${app.label} shortcuts to EspDesktop?
Add an **Applications** card for ${appName} and choose the shortcuts you want under **App Subpage**. For one button, use a **Key Shortcut** card and pick ${appName} in the **Application** tab. See [how to add shortcut cards](/mac-controls/shortcuts#create-a-shortcut-card).
:::

::: details Can I choose which ${app.label} shortcuts appear on the display?
Yes. You can choose and reorder cards in the app subpage. You can also [add a custom keyboard shortcut](/mac-controls/shortcuts#create-a-shortcut-card) for a key combination you use in ${appName}.
:::

::: details Why is a ${app.label} shortcut not responding?
Try the keys for your platform with ${appName} open and the right window or item selected. On a Mac, check [EspDesktop’s Accessibility permission](/mac-controls/shortcuts#allow-accessibility-access).${windowsApp?.executables.length || windowsApp?.targets?.length ? ' On Windows, check that keyboard shortcuts are enabled and that the app is approved in the companion.' : ''}
:::

</FaqAccordion>

${windowsApp?.executables.length || windowsApp?.targets?.length
    ? windowsSetup : ''}
[Browse all application shortcuts](/reference/shortcut-presets).
`,
      }
    })
    const windowsPaths = [...windowsApps].filter(([slug]) => !Object.hasOwn(guides, slug)).map(([slug, app]) => ({
      params: {
        app: slug,
        title: `${app.label} keyboard shortcuts for Windows`,
        description: `Look up Windows keyboard shortcuts for ${app.label} for your EspDesktop touchscreen.`,
      },
      content: `
# ${markdownText(app.label)} keyboard shortcuts for Windows

<ShortcutPresetReference windows-id="${escapeHtml(slug)}" />

## ${markdownText(app.label)} shortcuts FAQ

<FaqAccordion>

::: details Which shortcuts should I try first?
Start with ${listFormatter.format(app.shortcuts.slice(0, 3).map(preset =>
    `**${markdownText(preset.label)}** (**${markdownText(displayKeys(preset.shortcut, 'windows'))}**)`))}. Try these keys with the app in front.
:::

${app.executables.length || app.targets?.length ? `::: details How do I add a shortcut to EspDesktop for Windows?
Approve the app and enable keyboard shortcuts in the Windows companion. In the display editor, add a **Keyboard Shortcut** card, choose **Application**, then select the app and shortcut. ${windowsSetup.trim()}
:::
` : ''}
</FaqAccordion>

[Browse all application shortcuts](/reference/shortcut-presets).
`,
    }))
    return [...macPaths, ...windowsPaths]
  },
}
