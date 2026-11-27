import { build } from 'esbuild'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'
import { canonicalUrlFor, faqSchema, hostname, jsonLd, llmsIndexUrl, writeRedirects } from './discovery'
import { imageCaptions } from './image-captions'
import { writeMarkdownPages } from './markdown-export'
import { unpublishedMarkdown, writeGuideIndex } from './public-guides'
import productFacts from './product-facts.json'
import releaseDevices from '../../product/release_devices.json'

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

const defaultImage = shareImage('espdesktop-home-share.jpg', 1200, 630,
  'EspDesktop: A touchscreen controller for Mac and Windows. The touchscreen shows colourful app tiles on a desk.')
const pageImages: Record<string, typeof defaultImage> = {
  'screens/4848s040.md': shareImage('espdesktop-desk.jpg', 1320, 1093,
    'EspDesktop touchscreen with buttons for Mac apps next to a keyboard'),
  'screens/4848s040-stand.md': shareImage('4848s040-stand-printed.jpg', 1000, 1000,
    'The 3D-printed Guition 4848S040 stand with its mounting clips visible'),
  'settings/screen.md': shareImage('web-editor-screen-settings.png', 1694, 2160,
    'EspDesktop Screen tab showing appearance, display, and sleep settings'),
  'settings/system.md': shareImage('web-editor-system-settings.png', 1694, 2266,
    'EspDesktop System tab showing device preferences and maintenance options'),
  'settings/mac-app.md': shareImage('mac-connector/mac_app1.png', 1224, 1488,
    'EspDesktop Mac app showing a connected display and the Customize button'),
  'settings/backup.md': shareImage('web-editor-backup.png', 1292, 771,
    'EspDesktop Backup settings showing Export and Import'),
  'features/home.md': shareImage('web-editor-home.png', 1694, 2266,
    'EspDesktop Home layout with Mac app cards in the web editor'),
  'features/subpages.md': shareImage('web-editor-figma-subpage.png', 1562, 2134,
    'Figma app subpage with the Figma icon as the Back tile and a grid of keyboard shortcuts'),
  'mac-controls/apps.md': shareImage('web-editor-figma-subpage.png', 1562, 2134,
    'Figma app subpage with keyboard shortcuts in the EspDesktop web editor'),
  'mac-controls/websites.md': shareImage('web-editor-website.jpg', 560, 530,
    'Website card form with an example web address in the EspDesktop web editor'),
  'mac-controls/apple-shortcuts.md': shareImage('apple-shortcuts/list.jpg', 1080, 1080,
    'EspDesktop touchscreen showing the Shortcut List page with a Back tile and seven shortcuts'),
}

const author = { '@type': 'Person', name: 'jtenniswood', url: 'https://github.com/jtenniswood' }
const websiteId = `${hostname}#website`
const softwareId = `${hostname}#software`
const obsStudioParent = { name: 'OBS Studio controls', path: 'obs-studio.md' }
const guideParents = {
  'obs-studio/studio-controls.md': obsStudioParent,
  'obs-studio/scene-control-and-mixing.md': obsStudioParent,
  'obs-studio/audio-controls.md': obsStudioParent,
  'screens/4848s040-stand.md': { name: '4848S040 setup guide', path: 'screens/4848s040.md' },
  'features/first-run.md': { name: '4848S040 setup guide', path: 'screens/4848s040.md' },
  'features/adding-a-card.md': { name: 'Screen grid', path: 'features/home.md' },
  'features/subpages.md': { name: 'Customise the layout', path: 'features/home.md' },
  'mac-controls/apps.md': { name: 'Customise the layout', path: 'features/home.md' },
  'card-types/sound.md': { name: 'Customise the layout', path: 'features/home.md' },
  'mac-controls/websites.md': { name: 'Customise the layout', path: 'features/home.md' },
  'mac-controls/folders.md': { name: 'Customise the layout', path: 'features/home.md' },
  'mac-controls/shortcuts.md': { name: 'Customise the layout', path: 'features/home.md' },
  'mac-controls/apple-shortcuts.md': { name: 'Customise the layout', path: 'features/home.md' },
  'mac-controls/improve-shortcuts.md': { name: 'Keyboard shortcuts', path: 'mac-controls/shortcuts.md' },
  'reference/companion-compatibility.md': { name: 'Setup and compatibility FAQ', path: 'reference/faq.md' },
} as Record<string, { name: string; path: string }>

const guideMetadata = new Map<string, { title: string; description: string }>()

const customiseLinks = [
  { text: 'First setup', link: '/features/first-run' },
  { text: 'Screen grid', link: '/features/home' },
  { text: 'Subpages', link: '/features/subpages' },
  { text: 'Adding a card', link: '/features/adding-a-card' },
]
const cardLinks = [
  { text: 'Apple Shortcuts', link: '/mac-controls/apple-shortcuts' },
  { text: 'Apps', link: '/mac-controls/apps' },
  { text: 'File folders', link: '/mac-controls/folders' },
  { text: 'Keyboard shortcuts', link: '/mac-controls/shortcuts' },
  { text: 'Sound', link: '/card-types/sound' },
  { text: 'Supported Apps', link: '/reference/shortcut-presets' },
  { text: 'Websites', link: '/mac-controls/websites' },
]
const obsStudioLink = { text: 'OBS Studio', link: '/obs-studio' }
const obsStudioSidebar = {
  ...obsStudioLink,
  collapsed: false,
  items: [
    { text: 'Studio controls', link: '/obs-studio/studio-controls' },
    { text: 'Scene control and mixing', link: '/obs-studio/scene-control-and-mixing' },
    { text: 'Audio controls', link: '/obs-studio/audio-controls' },
  ],
}
const screenSettingsLink = { text: 'Screen settings', link: '/settings/screen' }
const systemSettingsLink = { text: 'System settings', link: '/settings/system' }

export default defineConfig({
  title: 'EspDesktop',
  description:
    'Pair a small ESP32 touchscreen with your Mac or Windows PC to launch apps, open folders and websites, and run keyboard shortcuts.',
  lang: 'en-US',
  appearance: 'force-dark',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: unpublishedMarkdown,
  markdown: {
    config(md) {
      faqSchema(md)
      imageCaptions(md)
    },
    image: { lazyLoading: true },
  },
  async buildEnd({ outDir, pages }) {
    const hiddenProfiles = new Set(releaseDevices.artifactOnlyDevices)
    if (!pages.includes('screens/jc1060p470-v3.md')) {
      hiddenProfiles.add('guition-esp32-p4-jc1060p470-v3')
    }
    const path = resolve(outDir, 'device-profiles.json')
    const profiles = JSON.parse(await readFile(path, 'utf8'))
    profiles.devices = profiles.devices.filter(
      (device: { slug: string }) => !hiddenProfiles.has(device.slug),
    )
    await writeFile(path, JSON.stringify(profiles, null, 2) + '\n')
    const demoRenderer = resolve(freshWebOutputDir({ testHooks: false }), 'app.js')
    await Promise.all([
      writeRedirects(outDir),
      writeMarkdownPages(outDir, pages),
      writeGuideIndex(outDir, pages, guideMetadata),
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
    transformItems(items) {
      const macReleaseTag = process.env.ESPDESKTOP_MAC_RELEASE_TAG
      const releaseDate = Date.parse(process.env.ESPDESKTOP_MAC_RELEASE_DATE ?? '')
      if (macReleaseTag && Number.isFinite(releaseDate)) {
        const releasePages = ['download', 'macos']
        if (process.env.ESPDESKTOP_MATCHED_RELEASE_TAG === macReleaseTag) {
          releasePages.push('reference/companion-compatibility')
        }
        for (const item of items) {
          if (!releasePages.includes(item.url)) continue
          const sourceDate = new Date(item.lastmod ?? 0).getTime()
          item.lastmod = new Date(Math.max(sourceDate || 0, releaseDate)).toISOString()
        }
      }
      return items.filter(item => item.url !== '404' && item.url !== '/404')
    },
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

    if (relativePath === 'reference/companion-compatibility.md') {
      const matchedTag = process.env.ESPDESKTOP_MATCHED_RELEASE_TAG
      if (matchedTag) {
        if (!/^v?\d+\.\d+\.\d+$/.test(matchedTag)) {
          throw new Error(`Invalid matching release tag: ${matchedTag}`)
        }
        frontmatter.matchedReleaseTag = matchedTag
        frontmatter.matchedReleaseUrl = `https://github.com/jtenniswood/espdesktop/releases/tag/${matchedTag}`
      }
    }

    // These pages have no page-level sidebar link to determine their next step.
    if (relativePath === 'reference/companion-compatibility.md') {
      frontmatter.next = { text: 'Install the display', link: '/screens/4848s040#install' }
    }

    const shortcutGuide = relativePath.startsWith('reference/shortcut-presets/')
    if (shortcutGuide && pageData.params) {
      frontmatter.title = pageData.title = pageData.params.title
      frontmatter.description = pageData.description = pageData.params.description
    }

    const canonicalUrl = canonicalUrlFor(relativePath)
    const title = String(frontmatter.title ?? pageData.title)
    const description = String(frontmatter.description ?? '')
    guideMetadata.set(relativePath, { title, description })
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
    const faqAnswers = frontmatter.faqAnswers
    delete frontmatter.faqAnswers
    if (isHome) {
      if (faqAnswers?.length) {
        graph.push({ '@type': 'FAQPage', '@id': canonicalUrl, url: canonicalUrl, mainEntity: faqAnswers })
      }
      graph.push(
        {
          '@type': 'WebSite',
          '@id': websiteId,
          url: canonicalUrl,
          name: 'EspDesktop',
          description,
          inLanguage: 'en-US',
          about: { '@id': softwareId },
        },
        {
          '@type': 'SoftwareApplication',
          '@id': softwareId,
          name: 'EspDesktop',
          url: canonicalUrl,
          applicationCategory: 'UtilitiesApplication',
          operatingSystem: `macOS ${productFacts.minimumMacOS} or newer (Apple silicon), Windows (x64 or Arm64)`,
          sameAs: 'https://github.com/jtenniswood/espdesktop',
          installUrl: `${hostname}download`,
          releaseNotes: 'https://github.com/jtenniswood/espdesktop/releases',
          description,
          author,
          softwareHelp: {
            '@type': 'WebPage',
            url: `${hostname}screens/4848s040`,
          },
          screenshot: `${hostname}images/mac-app-display.jpg`,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
      )
    } else {
      const breadcrumbs = `${canonicalUrl}#breadcrumbs`
      const parent = shortcutGuide
        ? { name: 'Application shortcuts', path: 'reference/shortcut-presets.md' }
        : guideParents[relativePath]
      const trail = [
        { name: 'EspDesktop', item: hostname },
        ...(parent ? [{ name: parent.name, item: canonicalUrlFor(parent.path) }] : []),
        { name: title, item: canonicalUrl },
      ]
      frontmatter.breadcrumbTrail = trail
      const page: Record<string, unknown> = {
        '@type': 'WebPage',
        '@id': canonicalUrl,
        name: title,
        description,
        url: canonicalUrl,
        isPartOf: { '@id': websiteId },
        breadcrumb: { '@id': breadcrumbs },
      }
      if (faqAnswers?.length) {
        page['@type'] = 'FAQPage'
        page.mainEntity = faqAnswers
      }
      if (isArticle) {
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
        page.mainEntity ??= { '@id': `${canonicalUrl}#guide` }
      }
      graph.push(page, {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbs,
        itemListElement: trail.map((crumb, index) => ({
          '@type': 'ListItem', position: index + 1, ...crumb,
        })),
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
      {
        text: 'Getting started',
        items: [
          { text: 'Buy', link: '/screens/4848s040#where-to-buy' },
          { text: 'Install', link: '/screens/4848s040#install' },
          { text: 'Download', link: '/download' },
        ],
      },
      {
        text: 'Customise',
        items: [...customiseLinks, ...cardLinks, obsStudioLink, screenSettingsLink, systemSettingsLink],
      },
      { text: 'Docs', link: '/screens/4848s040#supported-display-4-inch-guition-4848s040' },
    ],

    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'Display setup', link: '/screens/4848s040' },
          { text: 'macOS setup', link: '/macos' },
          { text: 'Windows setup', link: '/windows' },
          { text: 'Printable stand', link: '/screens/4848s040-stand' },
        ],
      },
      {
        text: 'Customise',
        items: customiseLinks,
      },
      {
        text: 'Cards',
        items: cardLinks,
      },
      obsStudioSidebar,
      {
        text: 'Settings',
        items: [
          screenSettingsLink,
          systemSettingsLink,
          { text: 'Mac app settings', link: '/settings/mac-app' },
          { text: 'Display connections (USB & IP)', link: '/settings/display-connections' },
          { text: 'Backup & restore', link: '/settings/backup' },
          { text: 'Permissions & security', link: '/mac-controls/security' },
        ],
      },
      {
        text: 'Support',
        items: [
          { text: 'Troubleshooting', link: '/getting-started/troubleshooting' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'FAQ', link: '/reference/faq' },
          { text: 'Compatibility', link: '/reference/companion-compatibility' },
          { text: 'Support', link: '/reference/support' },
          { text: 'Privacy', link: '/reference/privacy' },
        ],
      },
      {
        text: 'Contribute',
        items: [
          { text: 'App keyboard shortcuts', link: '/mac-controls/improve-shortcuts' },
          { text: 'Request an icon', link: '/reference/request-icons' },
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
