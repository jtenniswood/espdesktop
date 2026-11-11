import { build } from 'esbuild'
import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'
import { canonicalUrlFor, faqSchema, hostname, jsonLd, llmsIndexUrl, writeRedirects } from './discovery'
import { writeMarkdownPages } from './markdown-export'

const { freshWebOutputDir } = createRequire(import.meta.url)(resolve(import.meta.dirname, '../../scripts/web_source.js'))

function shareImage(file: string, width: number, height: number, alt: string) {
  return {
    url: `${hostname}images/${file}`,
    width: String(width),
    height: String(height),
    type: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
    alt,
  }
}

const defaultImage = shareImage('espdesktop-share.png', 1200, 630,
  'EspDesktop touchscreen controller for Mac with example app, website, folder and shortcut tiles')
const pageImages: Record<string, typeof defaultImage> = {
  'screens/4848s040.md': shareImage('4848s040-slack.jpg', 1202, 1100,
    'Guition 4848S040 touchscreen showing Slack shortcuts beside a keyboard'),
  'screens/4848s040-stand.md': shareImage('4848s040-stand-printed.jpg', 1000, 1000,
    'The 3D-printed Guition 4848S040 stand with its mounting clips visible'),
  'getting-started/install.md': shareImage('4848s040-hero.jpg', 1024, 999,
    'The 4-inch Guition 4848S040 touchscreen next to a keyboard'),
  'getting-started/mac-app.md': shareImage('mac-app-display.jpg', 1000, 1376,
    'EspDesktop Mac app showing a connected display and the Customize button'),
  'features/setup.md': shareImage('web-editor-screen-settings.jpg', 1080, 621,
    'EspDesktop web editor showing the Screen tab and app subpage settings'),
  'features/subpages.md': shareImage('web-editor-subpage.jpg', 620, 612,
    'A subpage with browser shortcuts in the EspDesktop web editor'),
  'mac-controls/apps.md': shareImage('web-editor-application-card.png', 1694, 2266,
    'Applications card form with Figma selected in the EspDesktop web editor'),
  'mac-controls/websites.md': shareImage('web-editor-website.jpg', 560, 530,
    'Website card form with an example web address in the EspDesktop web editor'),
}

const author = { '@type': 'Person', name: 'jtenniswood', url: 'https://github.com/jtenniswood' }
const websiteId = `${hostname}#website`

export default defineConfig({
  title: 'EspDesktop',
  description:
    'Pair a small ESP32 touchscreen with your Mac to launch apps, open folders and websites, and run shortcuts.',
  lang: 'en-US',
  appearance: 'force-dark',
  cleanUrls: true,
  lastUpdated: true,
  // Publish only the Mac Companion setup and control guides. The broader
  // Home Assistant panel documentation lives in the EspControl docs.
  srcExclude: [
    'generated/**',
    'guides/**',
    'immich/**',
    'card-types/{actions,alarms,buttons,cameras,climate,covers,doors-windows,fans,garage-doors,gates,index,lawn-mower,lights,local-actions,locks,media,option-select,presence,sliders,switches,timers,vacuum,weather,weather-forecast}.md',
    'features/{appearance,backlight,backup,battery,clock,clock-bar,firmware-updates,language,relays,rotation,screen-schedule,screensaver,speaker-groups,temperature,voice-control}.md',
    'getting-started/{c6-recovery,home-assistant-actions,manual-esphome-setup,migrate-esphome-media-player}.md',
    'screens/{index,jc1060p470,jc1060p470-v1,jc1060p470-v2,jc4880p443,jc4880p443-v3,jc8012p4a1,jc8012p4a1-v1,jc8012p4a1-v2,jc8012p4a1-v3,p4-86}.md',
    'reference/{3d-printable-stands,card-capabilities,collect-usb-logs,contributing,icons,language-support,partnerships}.md',
  ],
  markdown: { config: faqSchema, image: { lazyLoading: true } },
  async buildEnd({ outDir, pages }) {
    const demoRenderer = resolve(freshWebOutputDir({ testHooks: false }), 'app.js')
    await Promise.all([
      writeRedirects(outDir),
      writeMarkdownPages(outDir, pages),
      copyFile(demoRenderer, resolve(outDir, 'editor/renderer.js')),
      build({
        entryPoints: [resolve(import.meta.dirname, 'editor-demo.ts')],
        outfile: resolve(outDir, 'editor/demo.js'),
        bundle: true,
        minify: true,
        target: 'es2020',
      }),
    ])
  },

  transformHead({ page }) {
    if (page === '404.md') return []
    return [
      ['link', { rel: 'describedby', href: llmsIndexUrl }],
      ['link', { rel: 'alternate', type: 'text/markdown', href: new URL(page, hostname).href }],
    ]
  },

  sitemap: {
    hostname,
    transformItems: (items) => items.filter((item) => item.url !== '404' && item.url !== '/404'),
  },

  head: [
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? [['meta', { name: 'google-site-verification', content: process.env.GOOGLE_SITE_VERIFICATION }] as [string, Record<string, string>]]
      : []),
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:site_name', content: 'EspDesktop' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ],

  transformPageData(pageData) {
    const { relativePath, frontmatter } = pageData
    frontmatter.head ??= []
    if (relativePath === '404.md') {
      frontmatter.head.push(['meta', { name: 'robots', content: 'noindex' }])
      return
    }

    if (relativePath === 'getting-started/mac-app.md') {
      const releases = 'https://github.com/jtenniswood/espdesktop/releases'
      const tag = process.env.ESPDESKTOP_MAC_RELEASE_TAG
      if (tag && !/^v?\d+\.\d+\.\d+$/.test(tag)) {
        throw new Error(`Invalid Mac release tag: ${tag}`)
      }
      const version = tag?.replace(/^v/, '')
      frontmatter.macReleaseVersion = version
      frontmatter.macDownloadUrl = version ? `${releases}/download/${tag}/EspDesktop-${version}.dmg` : releases
    }

    const canonicalUrl = canonicalUrlFor(relativePath)
    const title = String(frontmatter.title ?? pageData.title)
    const description = String(frontmatter.description ?? '')
    const image = pageImages[relativePath] ?? defaultImage
    const isHome = relativePath === 'index.md'
    const isArticle = !['index.md', 'reference/privacy.md', 'reference/faq.md', 'reference/support.md'].includes(relativePath)

    frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { name: 'robots', content: 'max-image-preview:large' }],
      ['meta', { property: 'og:type', content: isArticle ? 'article' : 'website' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:image', content: image.url }],
      ['meta', { property: 'og:image:width', content: image.width }],
      ['meta', { property: 'og:image:height', content: image.height }],
      ['meta', { property: 'og:image:type', content: image.type }],
      ['meta', { property: 'og:image:alt', content: image.alt }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: image.url }],
      ['meta', { name: 'twitter:image:alt', content: image.alt }],
    )

    const graph: Record<string, unknown>[] = []
    if (isHome) {
      graph.push(
        {
          '@type': 'WebSite',
          '@id': websiteId,
          url: canonicalUrl,
          name: 'EspDesktop',
          description,
          inLanguage: 'en-US',
        },
        {
          '@type': 'SoftwareApplication',
          '@id': `${hostname}#software`,
          name: 'EspDesktop',
          url: canonicalUrl,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: 'macOS 13 or newer',
          description,
          author,
          softwareHelp: `${hostname}getting-started/mac-app`,
          screenshot: `${hostname}images/mac-app-display.jpg`,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
      )
    } else {
      const breadcrumbs = `${canonicalUrl}#breadcrumbs`
      const page: Record<string, unknown> = {
        '@type': 'WebPage',
        '@id': canonicalUrl,
        name: title,
        description,
        url: canonicalUrl,
        isPartOf: { '@id': websiteId },
        breadcrumb: { '@id': breadcrumbs },
      }
      if (relativePath === 'reference/faq.md') {
        page['@type'] = 'FAQPage'
        page.mainEntity = frontmatter.faqAnswers
        delete frontmatter.faqAnswers
      } else if (isArticle) {
        // The page and its article are separate nodes. Breadcrumbs belong to the page.
        graph.push({
          '@type': 'TechArticle',
          '@id': `${canonicalUrl}#guide`,
          headline: title,
          description,
          mainEntityOfPage: { '@id': canonicalUrl },
          author,
          image: image.url,
          ...(pageData.lastUpdated ? { dateModified: new Date(pageData.lastUpdated).toISOString() } : {}),
        })
        page.mainEntity = { '@id': `${canonicalUrl}#guide` }
      }
      graph.push(page, {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbs,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'EspDesktop', item: hostname },
          { '@type': 'ListItem', position: 2, name: title, item: canonicalUrl },
        ],
      })
    }
    frontmatter.head.push([
      'script',
      { type: 'application/ld+json' },
      jsonLd({ '@context': 'https://schema.org', '@graph': graph }),
    ])
  },

  themeConfig: {
    nav: [
      { text: 'Buy', link: '/screens/4848s040#where-to-buy' },
      { text: 'Install', link: '/getting-started/install' },
      { text: 'Download', link: '/getting-started/mac-app' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Where to Buy', link: '/screens/4848s040#where-to-buy' },
          { text: '3D-Printable Stand', link: '/screens/4848s040-stand' },
          { text: 'Getting Setup', link: '/getting-started/install' },
        ],
      },
      {
        text: 'Companion App',
        items: [
          { text: 'Install & Pair', link: '/getting-started/mac-app' },
          { text: 'Permissions & Security', link: '/mac-controls/security' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Configure the Display', link: '/features/setup' },
          { text: 'Subpages', link: '/features/subpages' },
          { text: 'Apps', link: '/mac-controls/apps' },
          { text: 'Websites', link: '/mac-controls/websites' },
          { text: 'Finder Folders', link: '/mac-controls/folders' },
          { text: 'Keyboard Shortcuts', link: '/mac-controls/shortcuts' },
        ],
      },
      {
        text: 'Support',
        items: [
          { text: 'Troubleshooting', link: '/getting-started/troubleshooting' },
          { text: 'FAQ', link: '/reference/faq' },
          { text: 'Support the Project', link: '/reference/support' },
          { text: 'Privacy Policy', link: '/reference/privacy' },
        ],
      },
      {
        text: 'Contribute',
        items: [
          { text: 'App Shortcuts', link: '/mac-controls/improve-shortcuts' },
          { text: 'Request an Icon', link: '/reference/request-icons' },
        ],
      },
    ],

    editLink: {
      pattern: 'https://github.com/jtenniswood/espdesktop/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/jtenniswood/espdesktop' }],

    search: {
      provider: 'local',
    },
  },
})
