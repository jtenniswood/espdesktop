import { defineConfig } from 'vitepress'

const hostname = 'https://jtenniswood.github.io/espdesktop/'
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
    model: 'JC1060P470 / new panel revision',
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
    model: 'JC8012P4A1 / new panel revision',
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
  'screens/p4-86.md': {
    name: 'ESP32-P4 86 Panel',
    brand: 'ESP32-P4',
    model: 'ESP32-P4-86-Panel-ETH-2RO',
    size: '4 inches',
    resolution: '720 x 720',
    processor: 'ESP32-P4',
  },
}

const faqItems = [
  {
    "question": "How Do I Find the Display's Address?",
    "answer": "Check the physical display or your router's connected-device list. Open the address in a browser to configure the panel."
  },
  {
    "question": "How Do I Pair My Mac?",
    "answer": "Open Settings on the display's web page. The Mac Companion box is first. Enter its temporary code in the Mac app. See Mac App."
  },
  {
    "question": "Which Cards Are Available?",
    "answer": "Companion, Date & Time, World Clock, Subpage, Screen Lock and Webhook. See Card Types."
  },
  {
    "question": "Which Display Supports Mac Controls?",
    "answer": "Mac Companion currently supports the 4-inch 4848S040. Hardware installation profiles also exist for the other listed panels; this does not imply Companion support on every profile."
  },
  {
    "question": "Why Is a Mac Card Unavailable?",
    "answer": "Check pairing, the local network, approved applications and folders, and Accessibility permission for keyboard or window controls. Use matching firmware and Mac app builds."
  },
  {
    "question": "Can I Back Up My Layout?",
    "answer": "Yes. Use Export in Settings \u2192 Backup. Keep backups private because they can contain webhook credentials. See Backup."
  },
  {
    "question": "How Do I Update or Reset the Panel?",
    "answer": "Use Firmware Updates for updates or the Install guide for USB installation. A normal restart does not erase the layout. A full flash erase removes stored device data."
  },
  {
    "question": "What If WiFi or Setup Fails?",
    "answer": "Use a 2.4 GHz network and a USB data cable. See Troubleshooting and Collect USB Logs."
  },
  {
    "question": "How Is My Data Handled?",
    "answer": "The Mac communicates with the display locally. Updates, website resources and configured webhooks may contact external services. See Privacy."
  }
]

export default defineConfig({
  title: 'EspDesktop',
  description:
    'Pair a small ESP32 touchscreen with your Mac to launch apps, run shortcuts, arrange windows, and show Mac status.',
  base: '/espdesktop/',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname,
    transformItems: (items) => items.filter((item) => item.url !== '404' && item.url !== '/404'),
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/espdesktop/favicon.svg' }],
    [
      'meta',
      {
        name: 'keywords',
        content:
          'EspDesktop, Mac controller, macOS Companion, ESP32-S3, 4848S040, touchscreen, keyboard shortcuts, window controls, Mac statistics',
      },
    ],
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
      JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebSite',
            '@id': `${hostname}#website`,
            url: hostname,
            name: 'EspDesktop',
            description:
              'A local touchscreen controller for Mac apps, shortcuts, windows, folders, websites and system statistics.',
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
      const isHowTo =
        pageData.relativePath === 'getting-started/install.md' ||
        pageData.relativePath === 'getting-started/manual-esphome-setup.md'
      const articleSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': isHowTo ? 'HowTo' : 'TechArticle',
        name: title,
        description,
        url: canonicalUrl,
        isPartOf: { '@id': `${hostname}#website` },
        author: { '@type': 'Person', name: 'jtenniswood', url: 'https://github.com/jtenniswood' },
      }
      if (isHowTo) {
        articleSchema.step = [
          { '@type': 'HowToStep', name: 'Choose the correct display firmware' },
          { '@type': 'HowToStep', name: 'Install a validated firmware build' },
          { '@type': 'HowToStep', name: 'Connect to WiFi' },
          { '@type': 'HowToStep', name: 'Open Settings to pair the Mac app' },
          { '@type': 'HowToStep', name: 'Configure cards on the Screen tab' },
        ]
      }
      if (pageData.relativePath === 'reference/faq.md') {
        articleSchema['@type'] = 'FAQPage'
        articleSchema.mainEntity = faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        }))
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
        JSON.stringify(articleSchema),
      ])
    }
  },

  themeConfig: {
    nav: [
      { text: 'Install', link: '/getting-started/install' },
      { text: 'Mac App', link: '/getting-started/mac-app' },
      { text: 'Mac Cards', link: '/card-types/companion' },
      { text: 'Issues', link: 'https://github.com/jtenniswood/espdesktop/issues' },
      { text: 'GitHub', link: 'https://github.com/jtenniswood/espdesktop' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Install', link: '/getting-started/install' },
          { text: 'Mac App', link: '/getting-started/mac-app' },
          { text: 'Troubleshooting', link: '/getting-started/troubleshooting' },
        ],
      },
      {
        text: 'Mac Control',
        items: [
          { text: 'Mac Cards & Capabilities', link: '/card-types/companion' },
          { text: 'App & Stat Subpages', link: '/features/subpages' },
        ],
      },
      {
        text: 'Supported Screens',
        items: [
          { text: '10.1-inch JC8012P4A1', link: '/screens/jc8012p4a1' },
          { text: '7-inch JC1060P470', link: '/screens/jc1060p470' },
          { text: '4.3-inch JC4880P443', link: '/screens/jc4880p443' },
          { text: '4-inch ESP32-P4 86 Panel', link: '/screens/p4-86' },
          { text: '4-inch 4848S040', link: '/screens/4848s040' },
          { text: 'Printable Stands', link: '/reference/3d-printable-stands' },
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
        text: 'Card Types',
        items: [
          { text: 'Overview', link: '/card-types/' },
          { text: 'Date & Time', link: '/card-types/calendar' },
          { text: 'Screen Lock', link: '/card-types/screen-lock' },
          { text: 'Subpage', link: '/features/subpages' },
          { text: 'Webhook', link: '/card-types/webhooks' },
          { text: 'World Clock', link: '/card-types/timezones' },
        ],
      },
      {
        text: 'Settings',
        items: [
          { text: '<span class="sidebar-static-header">Display</span>' },
          { text: 'Appearance', link: '/features/appearance' },
          { text: 'Backlight', link: '/features/backlight' },
          { text: 'Clock Bar', link: '/features/clock-bar' },
          { text: 'Rotation', link: '/features/rotation' },
          { text: '<span class="sidebar-static-header">Sleep & Schedule</span>' },
          { text: 'Idle', link: '/features/idle' },
          { text: 'Screensaver', link: '/features/screensaver' },
          { text: 'Night Schedule', link: '/features/screen-schedule' },
          { text: '<span class="sidebar-static-header">System</span>' },
          { text: 'Language', link: '/features/language' },
          { text: 'Time Settings', link: '/features/clock' },
          { text: 'Backup', link: '/features/backup' },
          { text: 'Firmware', link: '/features/firmware-updates' },
        ],
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Manual Setup', link: '/getting-started/manual-esphome-setup' },
          { text: 'Contributing', link: '/reference/contributing' },
          { text: 'Collect USB Logs', link: '/reference/collect-usb-logs' },
          { text: 'Wifi Issues', link: '/getting-started/c6-recovery' },
          { text: 'Icon Reference', link: '/reference/icons' },
          { text: 'Language Support', link: '/reference/language-support' },
          { text: 'Request Device Support', link: '/reference/contributing' },
          { text: 'Privacy Policy', link: '/reference/privacy' },
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
