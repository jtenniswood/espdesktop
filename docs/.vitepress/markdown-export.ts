import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createDocument } from '@mixmark-io/domino'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { createMarkdownRenderer } from 'vitepress'
import { canonicalUrlFor } from './discovery'

function visibleText(node: Element) {
  return (node.textContent || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim()
}

function removeImageCaptions(html: ParentNode) {
  // Markdown image syntax already carries the alt text.
  for (const caption of Array.from(html.querySelectorAll('.doc-image-caption'))) {
    caption.parentNode.removeChild(caption)
  }
}

function checkExportContent(html: Element, exportedHtml: string, page: string) {
  const exported = createDocument(exportedHtml)
  removeImageCaptions(exported)
  for (const [selector, label] of [['ol > li', 'numbered instructions'], ['tr > th, tr > td', 'table cells']]) {
    const before = Array.from(html.querySelectorAll(selector), visibleText)
    const after = Array.from(exported.querySelectorAll(selector), visibleText)
    if (before.length !== after.length || before.some((text, index) => text !== after[index])) {
      throw new Error(`Markdown export changed ${label} in ${page}`)
    }
  }
  const faqQuestions = Array.from(html.querySelectorAll('details[data-faq-question] > summary'), visibleText)
  const headings = new Set(Array.from(exported.querySelectorAll('h3'), visibleText))
  if (faqQuestions.some(question => !headings.has(question))) {
    throw new Error(`Markdown export omitted an FAQ question in ${page}`)
  }
  const paragraphs = new Set(Array.from(exported.querySelectorAll('p'), visibleText))
  for (const paragraph of Array.from(html.querySelectorAll('p'))) {
    const block = paragraph.closest('.custom-block, table, ol, ul')
    if (block && !block.hasAttribute('data-faq-question')) continue
    const text = visibleText(paragraph)
    if (text && !paragraphs.has(text)) {
      throw new Error(`Markdown export omitted an article paragraph in ${page}: ${text.slice(0, 100)}`)
    }
  }
  const blockText = (node: Element) => Array.from(node.children, visibleText).join(' ')
  const quotes = Array.from(exported.querySelectorAll('blockquote'), blockText)
  for (const callout of Array.from(html.querySelectorAll('.custom-block.warning, .custom-block.danger'))) {
    const severity = callout.classList.contains('danger') ? 'Danger' : 'Warning'
    if (!quotes.includes(`${severity}: ${blockText(callout)}`)) {
      throw new Error(`Markdown export omitted a ${severity.toLowerCase()} in ${page}`)
    }
  }
}

export async function writeMarkdownPages(outDir: string, pages: string[]) {
  const renderer = await createMarkdownRenderer('docs')
  const converter = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  }).use(gfm)
  converter.addRule('faqQuestion', {
    filter: (node) => node.nodeName === 'SUMMARY' && node.parentElement.hasAttribute('data-faq-question'),
    replacement: (content) => `\n\n### ${content.trim()}\n\n`,
  })
  converter.addRule('shortcutPlatform', {
    filter: (node) => node.nodeName === 'SUMMARY' &&
      ['windows-shortcuts', 'macos-shortcuts'].includes(node.parentElement.id),
    replacement: (content) => `

### ${content.trim()}

`,
  })
  converter.addRule('safetyCallout', {
    filter: (node) => node.classList.contains('custom-block') &&
      (node.classList.contains('warning') || node.classList.contains('danger')),
    replacement: (content, node) => {
      const severity = node.classList.contains('danger') ? 'Danger' : 'Warning'
      const quote = `**${severity}:** ${content.trim()}`.replace(/^/gm, '> ')
      return `\n\n${quote}\n\n`
    },
  })

  await Promise.all(pages.filter(page => page !== '404.md').map(async (page) => {
    const htmlFile = join(outDir, page.replace(/\.md$/, '.html'))
    const document = createDocument(await readFile(htmlFile, 'utf8'))
    const content = document.querySelector('.vp-doc')
    if (!content) throw new Error(`Missing documentation content in ${htmlFile}`)

    // Export the rendered article rather than source includes or the site shell.
    for (const node of Array.from(content.querySelectorAll('.header-anchor, button, script, style'))) {
      node.parentNode.removeChild(node)
    }
    removeImageCaptions(content)
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

    const nextPage = document.querySelector('.VPDocFooter a.pager-link.next[href]')
    const nextTitle = nextPage?.querySelector('.title')?.textContent.trim()
    if (nextPage && nextTitle) {
      const paragraph = document.createElement('p')
      const link = document.createElement('a')
      link.href = nextPage.getAttribute('href')
      link.textContent = `Next · ${nextTitle}`
      paragraph.appendChild(link)
      content.appendChild(paragraph)
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
    checkExportContent(content, renderer.render(text, { path: htmlFile }), page)
    await writeFile(join(outDir, page), `# ${title}\n\n[Original EspDesktop guide](${canonical})\n\n${text}\n`)
  }))
}
