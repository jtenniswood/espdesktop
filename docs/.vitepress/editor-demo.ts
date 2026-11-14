import {
  createCompanionShortcutSubpage,
  setCompanionShortcutTabs,
} from '../../src/webserver/application/companion_shortcut_folder'
import type { CardConfig } from '../../src/webserver/contracts/types'
import { COMPANION_APP_ICON_SIDE } from '../../src/webserver/generated/companion_capabilities'
import { COMPANION_FOLDER_PREFIX, companionCardHasAppIcon } from '../../src/webserver/model/companion_card_codec'
import { appShortcutPageOwner } from '../../src/webserver/model/companion_shortcut_page'
import { encodeConfigField, trimConfigFields } from '../../src/webserver/model/config_primitives'
import { decodePanelPageSnapshot, encodePanelPageDocument } from '../../src/webserver/model/panel_config_conversion'
import { serializeCompactSubpageConfig } from '../../src/webserver/model/subpage'

const deviceProfile = 'guition-esp32-s3-4848s040'
const maxConfigBytes = 512 * 1024
const configType = 'application/vnd.espdesktop.panel-config'
const editorSessionKey = 'espdesktop-editor-demo-v2'
const displayBacklightId = 'light/Display Backlight'
const editable = document.documentElement.hasAttribute('data-espdesktop-editor-demo')
const finderAppId = 'com.apple.finder'
const slackAppId = 'com.tinyspeck.slackmacgap'
const chatgptAppId = 'com.openai.codex'
// Public demo IDs for the captured web apps are independent of any Mac installation.
const sampleApps = [
  { id: finderAppId, label: 'Finder', icon: 'finder' },
  { id: 'com.apple.Safari', label: 'Safari', icon: 'safari' },
  { id: 'demo.web.calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'demo.web.mail', label: 'Mail', icon: 'mail' },
  { id: slackAppId, label: 'Slack', icon: 'slack' },
  { id: 'com.apple.Notes', label: 'Notes', icon: 'notes' },
  { id: 'demo.web.athena', label: 'Athena', icon: 'athena' },
  { id: chatgptAppId, label: 'ChatGPT', icon: 'chatgpt' },
  { id: 'com.anthropic.claudefordesktop', label: 'Claude', icon: 'claude' },
]
// Preset IDs and order from the original touchscreen demo.
const sampleShortcutTabs: Record<string, readonly string[]> = {
  [finderAppId]: [],
  'com.apple.Safari': ['2', '6', '7', '9', '8'],
  [slackAppId]: ['0', '1', '2', '3', '4', '5', '6', '7'],
  'com.apple.Notes': ['0', '1', '2', '3', '4'],
  [chatgptAppId]: ['0', '2', '3', '4', '5', '6'],
  'com.anthropic.claudefordesktop': ['0', '1', '2', '3'],
}
const chatgptShortcutAppearance = [
  { label: 'Command' },
  { label: 'Browser', icon: 'Web' },
  { icon: 'Dock Right' },
  { label: 'Bottom Terminal', icon: 'Dock Bottom' },
  { label: 'Side Terminal', icon: 'Dock Right' },
  { label: 'Side Terminal', icon: 'Dock Right' },
]
const idleDelayMs = 5000
const pressDurationMs = 180
const embedded = !editable && window.parent !== window
const finderFolderLabels = ['Camera Uploads', 'Desktop', 'Downloads', 'Git']
const demoFolders = [...finderFolderLabels, 'Documents', 'Projects'].map(label => ({
  id: COMPANION_FOLDER_PREFIX + label.toLowerCase().replace(/ /g, '-'),
  label,
}))

document.documentElement.toggleAttribute('data-espdesktop-embedded', embedded)

type Entity = {
  id: string
  value: string | number | boolean
  state: string
  brightness?: number
}

type Snapshot = {
  layout: string
  entities: Entity[]
  appIcons?: Record<string, { pixels: string; palette: string | null }>
}

declare global {
  interface Window {
    espDesktopDemoSnapshot?: Snapshot
  }
}

function entity(id: string, value: Entity['value'], details?: Partial<Entity>): Entity {
  const state = typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : String(value)
  return { ...details, id, value, state }
}

type SamplePageCard = Pick<CardConfig, 'entity' | 'label' | 'icon'> & { options?: string }

function samplePageCards(appId: string, tabs: readonly string[]): SamplePageCard[] {
  if (appId === finderAppId) {
    return demoFolders.filter(({ label }) => finderFolderLabels.includes(label))
      .map(({ id, label }) => ({ entity: id, label, icon: 'Folder Outline' }))
  }
  const buttons = createCompanionShortcutSubpage(appId, tabs).buttons.filter(card => card.type !== "token_usage")
  if (appId !== chatgptAppId) return buttons

  // Keep the captured labels and the Approve shortcut, which was retired from the catalog.
  const cards: SamplePageCard[] = buttons.map((card, index) => ({ ...card, ...chatgptShortcutAppearance[index] }))
  cards.splice(1, 0, {
    entity: 'shortcut.command+enter',
    label: 'Approve',
    icon: 'Check',
    options: 'app_shortcut_preset=custom',
  })
  return cards
}

const sampleButtons: Record<number, string> = {}
const sampleSubpages: Record<number, string> = {}
for (const [index, { id, label }] of sampleApps.entries()) {
  const slot = index + 1
  const tabs = sampleShortcutTabs[id]
  let options = 'app_hide_label'
  if (tabs) {
    options = setCompanionShortcutTabs({ entity: id, options: 'app_hide_label,app_shortcuts' }, tabs)
    const cards = samplePageCards(id, tabs)
    sampleSubpages[slot] = serializeCompactSubpageConfig(
      ['B', ...cards.map((_, index) => String(index + 1))],
      cards.map(({ entity, label, icon, options }) => trimConfigFields([
        'CP', encodeConfigField(entity), encodeConfigField(label), encodeConfigField(icon),
        '', '', '', '', encodeConfigField(options),
      ])),
    )
  }
  sampleButtons[slot] = `${id};${label};Auto;Auto;;;companion;;${options}`
}

const sample = {
  layout: encodePanelPageDocument({
    deviceProfile,
    buttons: sampleButtons,
    subpages: sampleSubpages,
    settings: { button_order: Object.keys(sampleButtons).join(',') },
  }),
  entities: [
    entity('switch/Screen: Clock Bar', false),
    entity('switch/Screen: Clock Bar Time', true),
    entity('switch/Screen: Subpage Chevron', false),
    entity('select/Screen: Default Icon Size', 'Large'),
    entity(displayBacklightId, true, { brightness: 75 }),
  ],
}

function readSnapshot(snapshot: Snapshot | undefined) {
  if (!snapshot || !Array.isArray(snapshot.entities)) return null
  try {
    const layout = Uint8Array.from(atob(snapshot.layout), char => char.charCodeAt(0))
    if (layout.length > maxConfigBytes || decodePanelPageSnapshot(layout).document.deviceProfile !== deviceProfile)
      return null
    return { layout, entities: snapshot.entities, appIcons: snapshot.appIcons }
  } catch {
    return null
  }
}

const snapshot = readSnapshot(window.espDesktopDemoSnapshot)
let saved: ReturnType<typeof readSnapshot> = null
if (editable) {
  try {
    saved = readSnapshot(JSON.parse(sessionStorage.getItem(editorSessionKey) || 'null'))
  } catch {
    // The editor can still work in memory when browser storage is unavailable.
  }
}

const startingSeed = snapshot ?? sample
const startingConfig = decodePanelPageSnapshot(startingSeed.layout)
const seed = saved ?? startingSeed
let bytes = new Uint8Array(seed.layout)
const initialConfig = saved ? decodePanelPageSnapshot(bytes) : startingConfig
let config = initialConfig.document
let generation = 1
const entities = new Map(seed.entities.map(item => [item.id, item]))
const appIcons = snapshot?.appIcons

function snapshotAppIcon(appId: string, background = '') {
  return appIcons?.[JSON.stringify([appId, background])] ?? appIcons?.[JSON.stringify([appId, ''])]
}

// The real preview expects packed RGB565 pixels followed by a separate alpha plane.
const sampleIconRequests = new Map<string, Promise<Uint8Array<ArrayBuffer> | null>>()
function sampleAppIcon(appId: string) {
  const app = sampleApps.find(({ id }) => id === appId)
  if (!app) return null
  let request = sampleIconRequests.get(appId)
  if (!request) {
    const image = new Image()
    image.src = new URL(`../editor/icons/${app.icon}.png`, location.href).href
    request = image.decode().then(() => {
      const side = COMPANION_APP_ICON_SIDE
      const count = side * side
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = side
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(image, 0, 0, side, side)
      const rgba = context.getImageData(0, 0, side, side).data
      const pixels = new Uint8Array(count * 3)
      const packed = new DataView(pixels.buffer)
      for (let i = 0; i < count; i++) {
        const offset = i * 4
        const red = (rgba[offset] ?? 0) >> 3
        const green = (rgba[offset + 1] ?? 0) >> 2
        const blue = (rgba[offset + 2] ?? 0) >> 3
        packed.setUint16(i * 2, (red << 11) | (green << 5) | blue, true)
        pixels[count * 2 + i] = rgba[offset + 3] ?? 0
      }
      return pixels
    }).catch(() => null)
    sampleIconRequests.set(appId, request)
  }
  return request
}

// Keep the picker tied to the starting layout even after its cards are edited or deleted.
const demoApps = new Map<string, { id: string; label: string }>()
if (editable) {
  for (const { config: card } of startingConfig.layout.rootCards) {
    if (!companionCardHasAppIcon(card) || (appIcons && !snapshotAppIcon(card.entity))) continue
    demoApps.set(card.entity, { id: card.entity, label: card.label || card.entity })
  }
}

function saveSession() {
  try {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const saved: Snapshot = { layout: btoa(binary), entities: [...entities.values()] }
    sessionStorage.setItem(editorSessionKey, JSON.stringify(saved))
  } catch {
    // Keep the current edits in memory if they cannot be saved in this tab.
  }
}

function configHeaders() {
  return { ETag: `"v2-${generation}"`, 'X-Panel-Config-Version': '2', 'Content-Type': configType }
}

const empty = (status: number) => new Response(null, { status })

// Both demos own the transport. The editable demo saves only to this tab.
window.fetch = async (input, init) => {
  const request = input instanceof Request ? input : null
  const url = new URL(request?.url ?? String(input), window.location.href)
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
  if (url.origin !== window.location.origin || (!editable && method !== 'GET')) return empty(404)

  if (method === 'GET') {
    switch (url.pathname) {
      case '/api/v1/capabilities':
        return Response.json({
          api: { version: 1 },
          configuration: {
            read: true, write: true, document_versions: [2],
            durable_document_version: 2, max_navigation_depth: 2,
            writable_navigation_depth: 2, max_v2_document_bytes: maxConfigBytes,
            max_record_body_bytes: 4096, preserves_inactive_records: true,
            companion_auto_open_app_subpages: true, display_theme_preferences: true,
            screen_schedule_preferences: true,
          },
        })
      case '/api/v1/config':
        return new Response(bytes, { headers: configHeaders() })
      case '/connectors/status':
        return Response.json({ onboarding_complete: true, mac_companion: {
          available: true, configured: true, paired: true, connected: false,
        } })
      case '/espdesktop/version.json':
        return Response.json({ device_slug: deviceProfile, version: 'demo' })
      case '/companion/actions':
        return editable ? Response.json([...demoApps.values(), ...demoFolders]) : empty(404)
      case '/companion/app-icon': {
        const appId = url.searchParams.get('appId')
        if (!appId) return empty(404)
        const icon = snapshotAppIcon(appId, url.searchParams.get('background') ?? '')
        const pixels = snapshot
          ? icon && Uint8Array.from(atob(icon.pixels), char => char.charCodeAt(0))
          : await sampleAppIcon(appId)
        if (!pixels) return empty(404)
        const headers = new Headers({ 'X-EspDesktop-Companion-Online': 'true' })
        if (icon?.palette) headers.set('X-EspDesktop-App-Icon-Palette', icon.palette)
        return new Response(pixels, { headers })
      }
    }
  }

  if (method === 'PUT' && url.pathname === '/api/v1/config') {
    const next = new Uint8Array(await (init?.body === undefined && request
      ? request.arrayBuffer() : new Response(init?.body).arrayBuffer()))
    if (new Headers(init?.headers ?? request?.headers).get('If-Match') !== configHeaders().ETag) return empty(409)
    if (next.length > maxConfigBytes) return empty(413)
    try {
      const decoded = decodePanelPageSnapshot(next).document
      if (decoded.deviceProfile !== deviceProfile) return empty(422)
      bytes = next
      config = decoded
    } catch {
      return empty(422)
    }
    generation++
    saveSession()
    return new Response(null, { status: 204, headers: configHeaders() })
  }

  const [domain, name, action, extra] = url.pathname.slice(1).split('/').map(decodeURIComponent)
  if (!domain || !name || extra) return empty(404)
  const id = `${domain}/${name}`
  const current = entities.get(id)
  if (method === 'GET' && !action) {
    // The editor uses a legacy read to finish loading its screen settings.
    if (id === 'text/Button Order') return Response.json(entity(id, config.settings.button_order ?? ''))
    return current ? Response.json(current) : empty(404)
  }

  if (method === 'POST' && id === displayBacklightId && action === 'turn_on') {
    const value = url.searchParams.get('brightness')
    const brightness = Number(value)
    if (!value?.trim() || !Number.isInteger(brightness) || brightness < 0 || brightness > 255) return empty(400)
    entities.set(id, entity(id, true, { brightness }))
    saveSession()
    return empty(204)
  }

  if (method === 'POST' && (current || name.startsWith('Screen')) && ['number', 'select', 'switch', 'text'].includes(domain)) {
    const value = url.searchParams.get('value') ?? url.searchParams.get('option')
    if (action === 'set' && value !== null) {
      entities.set(id, entity(id, domain === 'number' ? Number(value) : value, current))
    } else if (domain === 'switch' && (action === 'turn_on' || action === 'turn_off')) {
      entities.set(id, entity(id, action === 'turn_on', current))
    } else {
      return empty(404)
    }
    saveSession()
    return empty(204)
  }
  return empty(404)
}

// Use the snapshot's HTTP reads and always start on the home screen.
Object.defineProperty(window, 'EventSource', { value: undefined })
const url = new URL(location.href)
if (url.searchParams.size) {
  url.search = ''
  history.replaceState(null, '', url)
}

function startAppFocus(grid: HTMLElement) {
  let activeAppId: string | undefined
  const appButton = 'button[data-demo-app-id]'

  function paintActiveApp() {
    for (const tile of grid.querySelectorAll<HTMLButtonElement>(appButton)) {
      tile.classList.toggle('demo-app-on', tile.dataset.demoAppId === activeAppId)
    }
  }

  // Record the app before navigation replaces the grid. Autoplay uses the same click path.
  grid.addEventListener('click', event => {
    const tile = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(appButton) : null
    if (!tile || grid.getAttribute('aria-disabled') !== 'false') return
    activeAppId = tile.dataset.demoAppId
    paintActiveApp()
  }, { capture: true })
  new MutationObserver(paintActiveApp).observe(grid, { childList: true })
}

function startIdlePreview(grid: HTMLElement, slackSelector: string) {
  let timer: number | undefined
  let pressed: HTMLButtonElement | null = null
  let openedByDemo = false
  let visible = !embedded

  const backButton = () => grid.querySelector<HTMLButtonElement>('button.sp-back-btn')
  const slackButton = () => backButton() ? null : grid.querySelector<HTMLButtonElement>(slackSelector)

  function schedule(action: () => void, delay: number) {
    window.clearTimeout(timer)
    timer = document.hidden || !visible ? undefined : window.setTimeout(action, delay)
  }

  function releasePress() {
    pressed?.classList.remove('demo-pressed')
    pressed = null
  }

  function waitForIdle() {
    schedule(() => {
      const target = openedByDemo ? backButton() : slackButton()
      if (!target) return
      if (grid.getAttribute('aria-disabled') !== 'false') {
        waitForIdle()
        return
      }
      pressed = target
      target.classList.add('demo-pressed')
      schedule(() => {
        releasePress()
        if (target.isConnected) {
          target.click()
          openedByDemo = !!backButton()
        }
        waitForIdle()
      }, pressDurationMs)
    }, idleDelayMs)
  }

  function handleActivity(event: Event) {
    if (!event.isTrusted) return
    // A user who takes over on the subpage keeps control of that page.
    openedByDemo = false
    releasePress()
    waitForIdle()
  }

  for (const name of ['pointerdown', 'keydown', 'click', 'wheel']) {
    document.addEventListener(name, handleActivity, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', () => {
    releasePress()
    waitForIdle()
  })
  if (embedded) {
    new IntersectionObserver(([entry]) => {
      visible = (entry?.intersectionRatio ?? 0) >= 0.5
      releasePress()
      waitForIdle()
    }, { threshold: 0.5 }).observe(grid)
  } else {
    waitForIdle()
  }
}

if (editable) {
  if (snapshot) document.querySelector('#demo-title')!.textContent = 'Editor demo · Your display'
  document.querySelector('#reset-demo')!.addEventListener('click', () => {
    if (!confirm('Reset the demo to its starting layout?')) return
    try { sessionStorage.removeItem(editorSessionKey) } catch { /* Storage is unavailable. */ }
    location.reload()
  })
} else {
  const slack = initialConfig.layout.rootCards.find(card => appShortcutPageOwner(card.config) === slackAppId)
  const ready = new MutationObserver(() => {
    const grid = document.querySelector<HTMLElement>('.sp-main[aria-disabled="false"]')
    if (!grid?.querySelector('button.sp-btn')) return
    ready.disconnect()
    startAppFocus(grid)
    if (slack) startIdlePreview(grid, `button[data-slot="${slack.slot}"]`)
  })
  ready.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-disabled'] })
}
