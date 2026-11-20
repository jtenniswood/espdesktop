import { createDocument } from '@mixmark-io/domino'
import type { MarkdownRenderer } from 'vitepress'

const photoTag = /<img\b/i

function captionImages(html: string, imageOnly = false) {
  const document = createDocument(html)
  const { body } = document
  if (imageOnly && (body.children.length !== 1 || body.textContent?.trim() ||
      !body.firstElementChild?.matches('img, picture, a'))) return

  let changed = false
  for (const image of Array.from(body.querySelectorAll('img'))) {
    const alt = image.getAttribute('alt')?.trim()
    if (!alt || image.matches('[aria-hidden="true"], [role="none"], [role="presentation"]')) continue

    let figure = image.closest('figure')
    if (!figure) {
      const media = image.closest('a') ?? image.closest('picture') ?? image
      figure = document.createElement('figure')
      figure.className = 'doc-image'
      media.parentNode.insertBefore(figure, media)
      figure.appendChild(media)
    }

    const caption = figure.querySelector('figcaption')
    if (caption?.textContent?.trim() === alt) continue
    const description = document.createElement(caption ? 'div' : 'figcaption')
    description.className = 'doc-image-caption'
    description.setAttribute('aria-hidden', 'true')
    description.setAttribute('v-pre', '')
    description.textContent = alt
    if (caption) {
      caption.insertBefore(document.createTextNode('\n'), caption.firstChild)
      caption.insertBefore(description, caption.firstChild)
    } else {
      figure.appendChild(description)
    }
    changed = true
  }

  if (changed) return `${body.innerHTML.trimEnd()}\n`
}

export function imageCaptions(md: MarkdownRenderer) {
  md.core.ruler.push('espdesktop-image-captions', (state) => {
    if (state.inlineMode) return
    for (const [index, token] of state.tokens.entries()) {
      if (token.type === 'html_block' && photoTag.test(token.content)) {
        token.content = captionImages(token.content) ?? token.content
        continue
      }
      if (token.type !== 'inline' || state.tokens[index - 1]?.type !== 'paragraph_open' ||
          state.tokens[index + 1]?.type !== 'paragraph_close' ||
          !token.children?.some(child => child.type === 'image' ||
            (child.type === 'html_inline' && photoTag.test(child.content)))) continue

      const html = md.renderer.renderInline(token.children, md.options, state.env)
      const captioned = captionImages(html, true)
      if (!captioned) continue
      // A figure is a block element, so it takes the place of the image paragraph.
      state.tokens[index - 1].hidden = true
      state.tokens[index + 1].hidden = true
      token.type = 'html_block'
      token.content = captioned
    }
  })
}
