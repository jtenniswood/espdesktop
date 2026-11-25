import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import guides from './shortcut-guides.json'

interface ShortcutGuideEntry {
  slug: string
  macAppId?: string
  macLabel?: string
  macFile?: string
  windowsLabel?: string
}

export declare const data: readonly ShortcutGuideEntry[]

const directory = new URL('../../product/v2/app_shortcuts/', import.meta.url)
const windowsDirectory = new URL('platforms/windows/', directory)

export default {
  watch: [fileURLToPath(new URL('*.json', directory)), fileURLToPath(new URL('*.json', windowsDirectory))],
  load(): ShortcutGuideEntry[] {
    const slugs = new Map(Object.entries(guides).map(([slug, guide]) => [guide.appId, slug]))
    const entries = new Map<string, ShortcutGuideEntry>()
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.json') || file === 'manifest.json') continue
      const app = JSON.parse(readFileSync(new URL(file, directory), 'utf8')) as { appId: string; label: string }
      const slug = slugs.get(app.appId)
      if (slug) entries.set(slug, { slug, macAppId: app.appId, macLabel: app.label, macFile: file })
    }
    for (const file of readdirSync(windowsDirectory)) {
      if (!file.endsWith('.json')) continue
      const slug = file.slice(0, -5)
      const app = JSON.parse(readFileSync(new URL(file, windowsDirectory), 'utf8')) as { label: string }
      entries.set(slug, { slug, ...entries.get(slug), windowsLabel: app.label })
    }
    return [...entries.values()]
  },
}
