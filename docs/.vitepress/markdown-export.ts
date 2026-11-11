import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDocument } from '@mixmark-io/domino'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { canonicalUrlFor } from './discovery'

export async function writeMarkdownPages(outDir: string, pages: string[]) {
  const converter = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  }).use(gfm)

  await Promise.all(pages.filter(page => page !== '404.md').map(async (page) => {
    const htmlFile = join(outDir, page.replace(/\.md$/, '.html'))
    const document = createDocument(await readFile(htmlFile, 'utf8'))
    const content = document.querySelector('.vp-doc')
    if (!content) throw new Error(`Missing documentation content in ${htmlFile}`)

    // Export the rendered article rather than source includes or the site shell.
    for (const node of Array.from(content.querySelectorAll('.header-anchor, button, script, style'))) {
      node.parentNode.removeChild(node)
    }
    const canonical = canonicalUrlFor(page)
    const installer = content.querySelector('.esp-install-wrapper')
    if (installer) {
      const paragraph = document.createElement('p')
      const link = document.createElement('a')
      link.href = `${canonical}#flash-the-firmware`
      link.textContent = 'Open the browser-based firmware installer'
      paragraph.appendChild(link)
      installer.parentNode.replaceChild(paragraph, installer)
    }

    for (const [selector, attribute] of [['a[href]', 'href'], ['img[src]', 'src']]) {
      for (const node of Array.from(content.querySelectorAll(selector))) {
        node.setAttribute(attribute, new URL(node.getAttribute(attribute), canonical).href)
      }
    }

    const heading = content.querySelector('h1')
    const title = heading?.textContent.trim() || 'EspDesktop'
    if (heading) heading.parentNode.removeChild(heading)
    const text = converter.turndown(content.innerHTML)
    await writeFile(join(outDir, page), `# ${title}\n\n[Original EspDesktop guide](${canonical})\n\n${text}\n`)
  }))
}
