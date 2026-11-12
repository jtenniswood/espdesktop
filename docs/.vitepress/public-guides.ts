import { globSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hostname, redirects } from './discovery'
import guideGroups from './public-guides.json'
import productFacts from './product-facts.json'

const docs = resolve(import.meta.dirname, '..')
const guides = Object.values(guideGroups).flat()
const publicPaths = new Set([...guides, '404.md'])
const retiredPaths = new Set(Object.keys(redirects).map(path => path + '.md'))

if (publicPaths.size !== guides.length + 1) {
  throw new Error('Duplicate public guide or 404 page listed in public-guides.json')
}
for (const path of guides) {
  if (retiredPaths.has(path)) throw new Error(`Public guide is also a redirect: ${path}`)
}

export const unpublishedMarkdown = globSync('**/*.md', {
  cwd: docs,
  exclude: ['public/**', '.vitepress/**'],
}).filter(path => !publicPaths.has(path))

type Guide = { title: string; description: string }

export async function writeGuideIndex(outDir: string, pages: string[], metadata: Map<string, Guide>) {
  const published = new Set(pages.filter(path => path !== '404.md'))
  if (published.size !== guides.length || guides.some(path => !published.has(path))) {
    throw new Error('Built pages do not match docs/.vitepress/public-guides.json')
  }

  const lines = [
    '# EspDesktop',
    '',
    `> EspDesktop pairs a ${productFacts.displayLabel} touchscreen with a macOS menu-bar app. Use it to launch apps, open Finder folders and websites, run shortcuts and lock the Mac.`,
    '',
    `The Mac app requires ${productFacts.macProcessor} and macOS ${productFacts.minimumMacOS} or newer. The display needs ${productFacts.displayWiFiBand} Wi-Fi on the same local network as the Mac. Use firmware and the Mac app from the ${productFacts.matchedRelease}.`,
    '',
    'Each Markdown guide links to its original web page. Open the original installation page to run the interactive installer.',
  ]

  for (const [group, paths] of Object.entries(guideGroups)) {
    lines.push('', `## ${group}`, '')
    for (const path of paths) {
      const guide = metadata.get(path)
      if (!guide?.title || !guide.description) throw new Error(`Missing title or description: ${path}`)
      const label = guide.title.replaceAll('[', '&#91;').replaceAll(']', '&#93;')
      const description = guide.description.replace(/\s+/g, ' ').trim()
      lines.push(`- [${label}](${new URL(path, hostname).href}): ${description}`)
    }
  }
  lines.push(
    '- [EspDesktop releases](https://github.com/jtenniswood/espdesktop/releases): Find matching Mac app and firmware releases.',
    '- [EspControl for Home Assistant](https://jtenniswood.github.io/espcontrol/): Set up a touchscreen for Home Assistant.',
    '',
  )
  await writeFile(resolve(outDir, 'llms.txt'), lines.join('\n'))
}
