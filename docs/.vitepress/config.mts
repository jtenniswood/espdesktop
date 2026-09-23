import { defineConfig } from 'vitepress'
import { faqSchema, hostname, jsonLd, writeRedirects } from './discovery'

const defaultImage = {
  url: `${hostname}images/4848s040-hero.jpg`,
  width: '1024',
  height: '999',
  type: 'image/jpeg',
}

const pageImages: Record<string, typeof defaultImage> = {
  'screens/4848s040.md': {
    url: `${hostname}images/4848s040-hero.jpg`,
    width: '1024',
    height: '999',
    type: 'image/jpeg',
  },
  'screens/jc1060p470.md': {
    url: `${hostname}images/jc1060p470-hero.jpg`,
    width: '1024',
    height: '798',
    type: 'image/jpeg',
  },
  'screens/jc4880p443.md': {
    url: `${hostname}images/jc4880p443-hero.jpg`,
    width: '800',
    height: '1024',
    type: 'image/jpeg',
  },
  'features/setup.md': {
    url: `${hostname}images/screen-setup.png`,
    width: '625',
    height: '1024',
    type: 'image/png',
  },
  'features/subpages.md': {
    url: `${hostname}images/screen-subpage.png`,
    width: '1024',
    height: '606',
    type: 'image/png',
  },
  'features/relays.md': {
    url: `${hostname}images/relay-controls.svg`,
    width: '646',
    height: '786',
    type: 'image/svg+xml',
  },
  'card-types/buttons.md': {
    url: `${hostname}images/card-button.png`,
    width: '370',
    height: '336',
    type: 'image/png',
  },
  'card-types/sensors.md': {
    url: `${hostname}images/card-sensor.png`,
    width: '368',
    height: '340',
    type: 'image/png',
  },
  'card-types/switches.md': {
    url: `${hostname}images/card-toggle.png`,
    width: '366',
    height: '340',
    type: 'image/png',
  },
  'getting-started/home-assistant-actions.md': {
    url: `${hostname}images/ha-actions-step-1.png`,
    width: '684',
    height: '508',
    type: 'image/png',
  },
}

const screenProducts: Record<string, Record<string, string>> = {
  'screens/4848s040.md': {
    name: 'Guition 4848S040',
    model: '4848S040',
    size: '4 inches',
    resolution: '480 x 480',
    processor: 'ESP32-S3',
  },
  'screens/jc1060p470.md': {
    name: 'Guition JC1060P470',
    model: 'JC1060P470',
    size: '7 inches',
    resolution: '1024 x 600',
    processor: 'ESP32-P4',
  },
  'screens/jc1060p470-v1.md': {
    name: 'Guition JC1060P470 V1',
    model: 'JC1060P470 V1',
    size: '7 inches',
    resolution: '1024 x 600',
    processor: 'ESP32-P4',
  },
  'screens/jc1060p470-v2.md': {
    name: 'Guition JC1060P470 V2',
    brand: 'Guition',
    model: 'JC1060P470 V2',
    size: '7 inches',
    resolution: '1024 x 600',
    processor: 'ESP32-P4',
  },
  'screens/jc4880p443.md': {
    name: 'Guition JC4880P443',
    model: 'JC4880P443',
    size: '4.3 inches',
    resolution: '480 x 800',
    processor: 'ESP32-P4',
  },
  'screens/jc8012p4a1.md': {
    name: 'Guition JC8012P4A1',
    brand: 'Guition',
    model: 'JC8012P4A1',
    size: '10.1 inches',
    resolution: '1280 x 800',
    processor: 'ESP32-P4',
  },
  'screens/jc8012p4a1-v1.md': {
    name: 'Guition JC8012P4A1 V1',
    model: 'JC8012P4A1 V1',
    size: '10.1 inches',
    resolution: '1280 x 800',
    processor: 'ESP32-P4',
  },
  'screens/jc8012p4a1-v2.md': {
    name: 'Guition JC8012P4A1 V2',
    brand: 'Guition',
    model: 'JC8012P4A1 V2',
    size: '10.1 inches',
    resolution: '1280 x 800',
    processor: 'ESP32-P4',
  },
  'screens/jc8012p4a1-v3.md': {
    name: 'Guition JC8012P4A1 V3',
    model: 'JC8012P4A1 V3',
    size: '10.1 inches',
    resolution: '1280 x 800',
    processor: 'ESP32-P4',
  },
  'screens/p4-86.md': {
    name: 'ESP32-P4 86',
    brand: 'Waveshare',
    model: 'ESP32-P4-86-Panel-ETH-2RO',
    size: '4 inches',
    resolution: '720 x 720',
    processor: 'ESP32-P4',
  },
}

export default defineConfig({
  title: 'EspDesktop',
  description:
    'Pair a small ESP32 touchscreen with your Mac to launch apps, run shortcuts, arrange windows, control media and volume, and show Mac status.',
  base: '/espdesktop/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  // Publish only the Mac Companion setup and control guides. The broader
  // Home Assistant panel documentation lives in the EspControl docs.
  srcExclude: [
    'generated/**',
    'guides/**',
    'immich/**',
    'card-types/{actions,alarms,buttons,calendar,cameras,climate,covers,doors-windows,fans,garage-doors,gates,index,internal-relays,lawn-mower,lights,local-actions,local-sensors,locks,media,option-select,presence,screen-lock,sensors,sliders,switches,timers,timezones,vacuum,weather,weather-forecast,webhooks,wifi-share}.md',
    'features/{appearance,backlight,backup,battery,clock,clock-bar,firmware-updates,idle,language,relays,rotation,screen-schedule,screensaver,speaker-groups,temperature,voice-control}.md',
    'getting-started/{c6-recovery,home-assistant-actions,manual-esphome-setup,migrate-esphome-media-player}.md',
    'screens/{index,jc1060p470,jc1060p470-v1,jc1060p470-v2,jc4880p443,jc8012p4a1,jc8012p4a1-v1,jc8012p4a1-v2,jc8012p4a1-v3,p4-86}.md',
    'reference/{3d-printable-stands,card-capabilities,collect-usb-logs,contributing,icons,language-support,partnerships}.md',
  ],
  markdown: { config: faqSchema },
  buildEnd: ({ outDir }) => writeRedirects(outDir),

  sitemap: {
    hostname,
    transformItems: (items) => items.filter((item) => item.url !== '404' && item.url !== '/404'),
  },

  head: [
    ...(process.env.GOOGLE_SITE_VERIFICATION
      ? [['meta', { name: 'google-site-verification', content: process.env.GOOGLE_SITE_VERIFICATION }] as [string, Record<string, string>]]
      : []),
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/espdesktop/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:site_name', content: 'EspDesktop' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'style',
      {},
      '.sp-support-btn{position:fixed;right:28px;bottom:28px;z-index:150;display:inline-block;line-height:0}.sp-support-btn img{height:60px;display:block;border-radius:999px}',
    ],
    [
      'script',
      {},
      `document.addEventListener('DOMContentLoaded',function(){if(document.querySelector('.sp-support-btn'))return;var link=document.createElement('a');link.className='sp-support-btn';link.href='https://www.buymeacoffee.com/jtenniswood';link.target='_blank';link.rel='noopener';link.innerHTML='<img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" style="border-radius:999px;">';document.body.appendChild(link);});`,
    ],
    [
      'script',
      { type: 'application/ld+json' },
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${hostname}#website`,
            url: hostname,
            name: 'EspDesktop',
            description:
              'A local touchscreen controller for Mac apps, shortcuts, windows, media, volume, folders, websites, and system statistics.',
            inLanguage: 'en-US',
          },
          {
            '@type': 'SoftwareApplication',
            '@id': `${hostname}#software`,
            name: 'EspDesktop',
            applicationCategory: 'UtilitiesApplication',
            operatingSystem: 'ESP32 and macOS',
            description:
              'Display firmware and a native Mac app that turn a 4-inch ESP32 touchscreen into a local Mac control surface.',
            url: hostname,
            author: {
              '@type': 'Person',
              name: 'jtenniswood',
              url: 'https://github.com/jtenniswood',
            },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        ],
      }),
    ],
  ],

  transformPageData(pageData) {
    const canonicalUrl = `${hostname}${pageData.relativePath}`
      .replace(/index\.md$/, '')
      .replace(/\.md$/, '')

    const rawTitle = pageData.frontmatter.title ?? pageData.title
    const title =
      typeof rawTitle === 'string' ? rawTitle : rawTitle != null ? String(rawTitle) : ''
    const description = String(pageData.frontmatter.description ?? '')
    const image = pageImages[pageData.relativePath] ?? defaultImage

    pageData.frontmatter.head ??= []
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonicalUrl }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonicalUrl }],
      ['meta', { property: 'og:image', content: image.url }],
      ['meta', { property: 'og:image:width', content: image.width }],
      ['meta', { property: 'og:image:height', content: image.height }],
      ['meta', { property: 'og:image:type', content: image.type }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: image.url }],
    )

    if (pageData.relativePath === '404.md') {
      pageData.frontmatter.head.push(['meta', { name: 'robots', content: 'noindex' }])
    }

    if (
      pageData.relativePath !== 'index.md' &&
      pageData.relativePath !== '404.md' &&
      title &&
      description
    ) {
      const articleSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        name: title,
        description,
        url: canonicalUrl,
        isPartOf: { '@id': `${hostname}#website` },
        author: { '@type': 'Person', name: 'jtenniswood', url: 'https://github.com/jtenniswood' },
      }
      if (pageData.lastUpdated) {
        articleSchema.dateModified = new Date(pageData.lastUpdated).toISOString()
      }
      if (pageData.relativePath === 'reference/faq.md') {
        articleSchema['@type'] = 'FAQPage'
        articleSchema.mainEntity = pageData.frontmatter.faqAnswers
        delete pageData.frontmatter.faqAnswers
      }
      const screenProduct = screenProducts[pageData.relativePath]
      if (screenProduct) {
        articleSchema.about = {
          '@type': 'Product',
          name: screenProduct.name,
          brand: { '@type': 'Brand', name: screenProduct.brand ?? 'Guition' },
          model: screenProduct.model,
          category: 'ESP32 touchscreen panel',
          url: canonicalUrl,
          additionalProperty: [
            { '@type': 'PropertyValue', name: 'Screen size', value: screenProduct.size },
            { '@type': 'PropertyValue', name: 'Resolution', value: screenProduct.resolution },
            { '@type': 'PropertyValue', name: 'Processor', value: screenProduct.processor },
          ],
        }
      }
      pageData.frontmatter.head.push([
        'script',
        { type: 'application/ld+json' },
        jsonLd(articleSchema),
      ])
    }
  },

  themeConfig: {
    nav: [
      { text: 'Setup', link: '/getting-started/install' },
      { text: 'Issues', link: 'https://github.com/jtenniswood/espdesktop/issues' },
      { text: 'GitHub', link: 'https://github.com/jtenniswood/espdesktop' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Supported Display', link: '/screens/4848s040' },
          { text: 'Install', link: '/getting-started/install' },
          { text: 'Mac App', link: '/getting-started/mac-app' },
          { text: 'Configure', link: '/features/setup' },
          { text: 'Troubleshooting', link: '/getting-started/troubleshooting' },
        ],
      },
      {
        text: 'Mac Control',
        items: [
          { text: 'Overview', link: '/card-types/companion' },
          { text: 'Apps & Websites', link: '/mac-controls/apps' },
          { text: 'Finder Folders', link: '/mac-controls/folders' },
          { text: 'Keyboard Shortcuts', link: '/mac-controls/shortcuts' },
          { text: 'Window Controls', link: '/mac-controls/windows' },
          { text: 'Volume', link: '/mac-controls/volume' },
          { text: 'Statistics', link: '/mac-controls/statistics' },
          { text: 'Permissions & Security', link: '/mac-controls/security' },
        ],
      },
      {
        text: 'Configuring',
        items: [
          { text: 'Setup', link: '/features/setup' },
          { text: 'Subpages', link: '/features/subpages' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'FAQ', link: '/reference/faq' },
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
