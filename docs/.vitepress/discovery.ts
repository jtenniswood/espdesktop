import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { MarkdownRenderer } from 'vitepress'

export const hostname = 'https://espdesktop.com/'
export const llmsIndexUrl = new URL('llms.txt', hostname).href

export function canonicalUrlFor(relativePath: string) {
  const path = relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
  return new URL(path, hostname).href
}

const espcontrol = 'https://jtenniswood.github.io/espcontrol/'
const displaySetup = `${hostname}screens/4848s040`
const macControls = `${hostname}#what-you-can-control`

// GitHub Pages cannot configure HTTP redirects. These HTML fallbacks preserve
// published links while keeping retired pages out of search and the sitemap.
const setupRedirects: Record<string, string> = {
  'getting-started/install': `${displaySetup}#set-up-espdesktop`,
  'getting-started/mac-app': `${displaySetup}#install-and-pair-the-espdesktop-mac-app`,
}

export const redirects: Record<string, string> = {
  ...setupRedirects,
  'features/setup': `${hostname}features/home`,
  'generated/companion-compatibility': `${hostname}reference/companion-compatibility`,
  'reference/request-device-support': `${hostname}screens/4848s040`,
  'screens/index': `${hostname}screens/4848s040`,
  'card-types/companion': macControls,
  'card-types/weather-forecast': espcontrol,
  'card-types/index': espcontrol,
  'getting-started/home-assistant-actions': espcontrol,
  'features/settings': `${hostname}settings/system`,
  'features/backup': `${hostname}settings/backup`,
  'features/media-cover-art': `${hostname}settings/screen`,
  'mac-controls/statistics': macControls,
  'mac-controls/volume': macControls,
  'guides/index': espcontrol,
  'immich/index': espcontrol,
  'generated/cards/capabilities': macControls,
  'generated/cards/runtime-coverage':
    'https://github.com/jtenniswood/espdesktop/blob/main/dev-docs/generated/card-runtime-coverage.md',
  'generated/screens/4848s040-grid': `${hostname}screens/4848s040`,
  'generated/screens/4848s040-install': setupRedirects['getting-started/install'],
  'generated/screens/jc1060p470-grid': espcontrol,
  'generated/screens/jc1060p470-install': espcontrol,
  'generated/screens/jc1060p470-v2-grid': espcontrol,
  'generated/screens/jc1060p470-v2-install': espcontrol,
  'generated/screens/jc4880p443-grid': espcontrol,
  'generated/screens/jc4880p443-install': espcontrol,
  'generated/screens/jc4880p443-v3-grid': `${espcontrol}screens/jc4880p443-v3`,
  'generated/screens/jc4880p443-v3-install': `${espcontrol}screens/jc4880p443-v3`,
  'screens/jc4880p443-v3': `${espcontrol}screens/jc4880p443-v3`,
  'generated/screens/jc8012p4a1-grid': espcontrol,
  'generated/screens/jc8012p4a1-install': espcontrol,
  'generated/screens/jc8012p4a1-v2-grid': espcontrol,
  'generated/screens/jc8012p4a1-v2-install': espcontrol,
  'generated/screens/jc8012p4a1-v3-grid': espcontrol,
  'generated/screens/jc8012p4a1-v3-install': espcontrol,
  'generated/screens/p4-86-grid': espcontrol,
  'generated/screens/p4-86-install': espcontrol,
}

const formerSettingsSections = {
  '#screen-and-system-settings': '/settings/screen',
  '#appearance': '/settings/screen#appearance',
  '#display': '/settings/screen#display',
  '#sleep-schedule': '/settings/screen#sleep-schedule',
  '#back-up-your-layout': '/settings/backup',
  '#system-settings': '/settings/system#display-system-settings',
  '#mac-companion-and-preferences': '/settings/system#mac-companion-and-preferences',
  '#protect-the-touchscreen': '/settings/system#protect-the-touchscreen',
  '#naming-your-panel': '/settings/system#naming-your-panel',
  '#update-the-display-firmware': '/settings/system#update-the-display-firmware',
  '#reset-the-display': '/settings/system#reset-the-display',
  '#mac-app-settings': '/settings/system#mac-app-settings',
  '#check-for-mac-app-updates': '/settings/system#check-for-mac-app-updates',
}

const formerCardSections = {
  ...formerSettingsSections,
  '#add-a-mac-control': '/features/home#add-a-card',
  '#arrange-and-personalise-cards': '/features/home#organise-cards',
  '#quick-card-colours': '/features/home#change-how-a-card-looks',
  '#device-and-system-settings': '/settings/screen',
}

export async function writeRedirects(outDir: string) {
  for (const [path, destination] of Object.entries(redirects)) {
    const file = join(outDir, `${path}.html`)
    await mkdir(join(file, '..'), { recursive: true })
    const formerSections = path === 'features/setup' ? formerCardSections
      : path === 'features/settings' ? formerSettingsSections
      : undefined
    const fragmentRedirect = formerSections
      ? `<script>
const target = ${jsonLd(formerSections)}[location.hash]
if (target) location.replace(target)
</script>`
      : Object.hasOwn(setupRedirects, path)
        ? `<script>
if (location.hash) location.replace(${jsonLd(displaySetup)} + location.hash)
</script>`
        : ''
    await writeFile(file, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Page moved | EspDesktop</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${destination.split('#')[0]}">
${fragmentRedirect}
<meta http-equiv="refresh" content="0; url=${destination}">
</head><body><h1>Page moved</h1><p><a href="${destination}">Continue to the current guide</a>.</p></body></html>\n`)
  }
}

// Read the same parsed Markdown that produces the visible FAQ. No separately
// maintained answers, and no second parser with different link/format rules.
export function faqSchema(md: MarkdownRenderer) {
  md.core.ruler.push('espdesktop-faq', (state) => {
    if (state.env.relativePath !== 'reference/faq.md') return
    const entries = []
    const tokens = state.tokens
    for (let index = 0; index < tokens.length; index++) {
      if (tokens[index].type !== 'heading_open' || tokens[index].tag !== 'h3') continue
      const heading = tokens[index + 1]
      let end = index + 3
      while (end < tokens.length && !(
        tokens[end].type === 'heading_open' && Number(tokens[end].tag.slice(1)) <= 3
      )) end++
      const name = (heading.children ?? [])
        .filter((token) => token.type === 'text' || token.type === 'code_inline')
        .map((token) => token.content).join('').replace(/\u200b/g, '').trim()
      // Rendering these tokens twice would mutate VitePress link URLs twice.
      // Plain answer text uses the parsed inline tokens, including code spans.
      const text = tokens.slice(index + 3, end)
        .filter((token) => token.type === 'inline')
        .map((token) => (token.children ?? [])
          .filter((child) => ['text', 'code_inline', 'softbreak', 'hardbreak'].includes(child.type))
          .map((child) => child.type.endsWith('break') ? ' ' : child.content).join(''))
        .join(' ').trim()
      if (name && text) entries.push({
        '@type': 'Question', name,
        acceptedAnswer: { '@type': 'Answer', text },
      })
    }
    state.env.frontmatter.faqAnswers = entries
  })
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
