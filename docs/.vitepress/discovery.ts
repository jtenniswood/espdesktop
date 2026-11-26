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
const immichGuide = `${espcontrol}immich/`
const displaySetup = `${hostname}screens/4848s040`
const macControls = `${hostname}#what-you-can-control`

// GitHub Pages cannot configure HTTP redirects. These HTML fallbacks preserve
// published links while keeping retired pages out of search and the sitemap.
export const redirects: Record<string, string> = {
  'card-types/climate': `${espcontrol}card-types/climate`,
  'getting-started/mac-app': `${displaySetup}#download`,
  'getting-started/install': `${displaySetup}#install`,
  'getting-started/c6-recovery': `${espcontrol}getting-started/troubleshooting#a-p4-panel-has-unreliable-wifi`,
  'immich/installation': `${immichGuide}#installation`,
  'screens/p4-86': `${espcontrol}screens/p4-86`,
  'screens/jc8012p4a1-v2': `${espcontrol}screens/jc8012p4a1-v2`,
  'screens/jc8012p4a1-v1': `${espcontrol}screens/jc8012p4a1-v1`,
  'screens/jc8012p4a1': `${espcontrol}screens/jc8012p4a1`,
  'screens/jc4880p443': `${espcontrol}screens/jc4880p443`,
  'screens/jc1060p470-v2': `${espcontrol}screens/jc1060p470-v2`,
  'screens/jc1060p470-v1': `${espcontrol}screens/jc1060p470-v1`,
  'screens/jc1060p470': `${espcontrol}screens/jc1060p470`,
  'features/setup': `${hostname}features/home`,
  'generated/companion-compatibility': `${hostname}reference/companion-compatibility`,
  'reference/request-device-support': `${hostname}screens/4848s040`,
  'screens/index': `${hostname}getting-started/choose-a-display`,
  'card-types/companion': macControls,
  'card-types/weather-forecast': espcontrol,
  'card-types/index': espcontrol,
  'features/settings': `${hostname}settings/system`,
  'features/backup': `${hostname}settings/backup`,
  'features/media-cover-art': `${hostname}settings/screen`,
  'mac-controls/statistics': `${hostname}reference/mac-controls-by-release#mac-statistics-and-volume`,
  'mac-controls/volume': `${hostname}reference/mac-controls-by-release#mac-statistics-and-volume`,
  'guides/index': espcontrol,
  'immich/index': `${espcontrol}immich/`,
  'generated/cards/capabilities': macControls,
  'generated/cards/runtime-coverage':
    'https://github.com/jtenniswood/espdesktop/blob/main/dev-docs/generated/card-runtime-coverage.md',
  'generated/screens/4848s040-grid': `${hostname}screens/4848s040`,
  'generated/screens/4848s040-install': `${displaySetup}#install`,
  'generated/screens/jc1060p470-grid': `${espcontrol}screens/jc1060p470`,
  'generated/screens/jc1060p470-install': `${espcontrol}screens/jc1060p470`,
  'generated/screens/jc1060p470-v3-grid': `${hostname}screens/jc1060p470-v3`,
  'generated/screens/jc1060p470-v2-grid': `${espcontrol}screens/jc1060p470-v2`,
  'generated/screens/jc1060p470-v3-install': `${hostname}screens/jc1060p470-v3#install`,
  'generated/screens/jc1060p470-v2-install': `${espcontrol}screens/jc1060p470-v2`,
  'generated/screens/jc4880p443-grid': `${espcontrol}screens/jc4880p443`,
  'generated/screens/jc4880p443-install': `${espcontrol}screens/jc4880p443`,
  'generated/screens/jc4880p443-v3-grid': `${espcontrol}screens/jc4880p443-v3`,
  'generated/screens/jc4880p443-v3-install': `${espcontrol}screens/jc4880p443-v3`,
  'screens/jc4880p443-v3': `${espcontrol}screens/jc4880p443-v3`,
  'generated/screens/jc8012p4a1-grid': `${espcontrol}screens/jc8012p4a1`,
  'generated/screens/jc8012p4a1-install': `${espcontrol}screens/jc8012p4a1`,
  'generated/screens/jc8012p4a1-v2-grid': `${espcontrol}screens/jc8012p4a1-v2`,
  'generated/screens/jc8012p4a1-v2-install': `${espcontrol}screens/jc8012p4a1-v2`,
  'generated/screens/jc8012p4a1-v3-grid': `${hostname}screens/jc8012p4a1-v3`,
  'generated/screens/jc8012p4a1-v3-install': `${hostname}screens/jc8012p4a1-v3#install`,
  'generated/screens/p4-86-grid': `${espcontrol}screens/p4-86`,
  'generated/screens/p4-86-install': `${espcontrol}screens/p4-86`,
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
  '#mac-app-settings': '/settings/mac-app',
  '#check-for-mac-app-updates': '/settings/mac-app#check-for-mac-app-updates',
}

const formerCardSections = {
  ...formerSettingsSections,
  '#add-a-mac-control': '/features/home#add-a-card',
  '#arrange-and-personalise-cards': '/features/home#organise-cards',
  '#quick-card-colours': '/features/home#change-how-a-card-looks',
  '#device-and-system-settings': '/settings/screen',
}

const formerImmichSections = Object.fromEntries([
  'installation-status',
  'hacs-installation',
  'manual-installation',
  'immich-connection-and-permissions',
  'image-quality',
  'troubleshooting',
].map(section => [`#${section}`, `${immichGuide}#${section}`]))

const formerMacAppSections = Object.fromEntries([
  'install-a-release',
  'pair-the-display',
  'check-the-connection',
  'check-for-mac-app-updates',
].map(section => [`#${section}`, `${displaySetup}#${section}`]))

export async function writeRedirects(outDir: string) {
  for (const [path, destination] of Object.entries(redirects)) {
    const file = join(outDir, `${path}.html`)
    await mkdir(join(file, '..'), { recursive: true })
    const formerSections = path === 'features/setup' ? formerCardSections
      : path === 'features/settings' ? formerSettingsSections
      : path === 'getting-started/install'
        ? { '#connect-the-display-to-wifi': `${displaySetup}#connect-the-display-to-wifi` }
      : path === 'getting-started/mac-app' ? formerMacAppSections
      : path === 'immich/installation' ? formerImmichSections
      : undefined
    const fragmentRedirect = formerSections
      ? `<script>
const target = ${jsonLd(formerSections)}[location.hash]
if (target) location.replace(target)
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
    if (state.inlineMode) return
    const referenceFaq = state.env.relativePath === 'reference/faq.md'
    const entries = []
    const tokens = state.tokens
    let inAccordion = false

    function inlineText(token: (typeof tokens)[number]) {
      return (token.children ?? []).map(child => {
        if (child.type.endsWith('break')) return ' '
        return ['text', 'code_inline', 'image'].includes(child.type) ? child.content : ''
      }).join('').replace(/\u200b/g, '').trim()
    }

    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]
      if (token.type === 'html_block') {
        const tag = token.content.trim()
        if (tag === '<FaqAccordion>') inAccordion = true
        if (tag === '</FaqAccordion>') inAccordion = false
      }

      let question
      let answerStart
      let answerEnd
      if (inAccordion && token.type === 'container_details_open' && token.level === 0) {
        const title = token.info.trim().slice('details'.length).trim()
        question = inlineText(md.parseInline(title, { references: state.env.references })[0])
        token.attrSet('data-faq-question', '')
        answerStart = index + 1
        answerEnd = answerStart
        while (answerEnd < tokens.length && !(
          tokens[answerEnd].type === 'container_details_close' && tokens[answerEnd].level === token.level
        )) answerEnd++
      } else if (referenceFaq && token.type === 'heading_open' && token.tag === 'h3') {
        question = inlineText(tokens[index + 1])
        answerStart = index + 3
        answerEnd = answerStart
        while (answerEnd < tokens.length && !(
          tokens[answerEnd].type === 'heading_open' && Number(tokens[answerEnd].tag.slice(1)) <= 3
        )) answerEnd++
      } else {
        continue
      }

      const text = tokens.slice(answerStart, answerEnd)
        .filter(token => token.type === 'inline')
        .map(inlineText).join(' ').trim()
      if (!question || !text) throw new Error('Each FAQ item needs a question and an answer')
      entries.push({
        '@type': 'Question', name: question,
        acceptedAnswer: { '@type': 'Answer', text },
      })
    }
    if (entries.length) state.env.frontmatter.faqAnswers = entries
  })
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
