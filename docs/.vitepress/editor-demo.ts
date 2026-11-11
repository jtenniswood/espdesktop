import { decodePanelPageSnapshot, encodePanelPageDocument } from '../../src/webserver/model/panel_config_conversion'

const deviceProfile = 'guition-esp32-s3-4848s040'
const sessionKey = 'espdesktop-editor-demo-v1'
const configType = 'application/vnd.espdesktop.panel-config'
const maxConfigBytes = 524288

type Entity = {
  id: string
  value: string | number | boolean
  state: string
  brightness?: number
}

type Snapshot = {
  layout: string
  entities: Entity[]
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

const sample = {
  layout: encodePanelPageDocument({
    deviceProfile,
    buttons: {
      1: 'com.apple.Safari;Safari;Web;Auto;;;companion',
      2: 'com.apple.iCal;Calendar;Calendar;Auto;;;companion',
      3: 'com.apple.Notes;Notes;Note Text;Auto;;;companion',
      4: 'shortcut.command+space;Spotlight;Magnify;Auto;;;companion',
      5: 'stat.memory;Memory;Memory;Auto;;;companion',
      6: ';Browser;Tab;Auto;;;subpage',
    },
    subpages: {
      6: '~B,1,2,3|CP,shortcut.command+l,Address Bar,Magnify|CP,shortcut.command+t,New Tab,Tab Plus|CP,shortcut.command+f,Find,Text Search',
    },
    settings: { button_order: '1,2,3,4,5,6' },
  }),
  entities: [
    entity('switch/Screen: Clock Bar', true),
    entity('switch/Screen: Clock Bar Time', true),
    entity('switch/Screen: Subpage Chevron', true),
    entity('light/Display Backlight', true, { brightness: 75 }),
  ],
}

function readSnapshot(snapshot: Snapshot | undefined) {
  if (!snapshot || !Array.isArray(snapshot.entities)) return null
  try {
    const layout = Uint8Array.from(atob(snapshot.layout), char => char.charCodeAt(0))
    if (layout.length > maxConfigBytes || decodePanelPageSnapshot(layout).document.deviceProfile !== deviceProfile)
      return null
    return { layout, entities: snapshot.entities }
  } catch {
    return null
  }
}

const initial = readSnapshot(window.espDesktopDemoSnapshot)
let saved: ReturnType<typeof readSnapshot> = null
try {
  saved = readSnapshot(JSON.parse(sessionStorage.getItem(sessionKey) || 'null'))
} catch {
  // Storage can be unavailable in embedded browsers.
}
const seed = saved ?? initial ?? sample
let layout = new Uint8Array(seed.layout)
let config = decodePanelPageSnapshot(layout).document
let generation = 1
const entities = new Map(seed.entities.map(item => [item.id, item]))

function saveSession() {
  try {
    let binary = ''
    for (const byte of layout) binary += String.fromCharCode(byte)
    const snapshot: Snapshot = { layout: btoa(binary), entities: [...entities.values()] }
    sessionStorage.setItem(sessionKey, JSON.stringify(snapshot))
  } catch {
    // Keep the current edits in memory when storage is unavailable.
  }
}

function headers() {
  return { ETag: `"v2-${generation}"`, 'X-Panel-Config-Version': '2', 'Content-Type': configType }
}

const empty = (status: number) => new Response(null, { status })

// This document owns the transport. Every device request stays inside the
// simulation, including requests from editor features that call fetch directly.
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input, window.location.href)
  if (url.origin !== window.location.origin) return empty(404)
  const method = (init?.method ?? 'GET').toUpperCase()

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
        return new Response(layout, { headers: headers() })
      case '/connectors/status':
        return Response.json({ onboarding_complete: true, mac_companion: {
          available: true, configured: true, paired: true, connected: false,
        } })
      case '/espdesktop/version.json':
        return Response.json({ device_slug: deviceProfile, version: 'demo' })
    }
  }

  if (method === 'PUT' && url.pathname === '/api/v1/config') {
    const next = new Uint8Array(await new Response(init?.body).arrayBuffer())
    if (new Headers(init?.headers).get('If-Match') !== headers().ETag) return empty(409)
    if (next.length > maxConfigBytes) return empty(413)
    try {
      const decoded = decodePanelPageSnapshot(next).document
      if (decoded.deviceProfile !== deviceProfile) return empty(422)
      layout = next
      config = decoded
    } catch {
      return empty(422)
    }
    generation++
    saveSession()
    return new Response(null, { status: 204, headers: headers() })
  }

  const [domain, name, action, extra] = url.pathname.slice(1).split('/').map(decodeURIComponent)
  if (!name || extra) return empty(404)
  const id = `${domain}/${name}`
  if (method === 'GET' && !action) {
    // The editor uses one legacy read to finish loading its settings even
    // when the layout itself comes from the native document.
    if (id === 'text/Button Order') return Response.json(entity(id, config.settings.button_order ?? ''))
    const current = entities.get(id)
    return current ? Response.json(current) : empty(404)
  }

  const current = entities.get(id)
  if (method === 'POST' && (current || name.startsWith('Screen')) && ['number', 'select', 'switch', 'text'].includes(domain ?? '')) {
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

// SSE is an opt-in troubleshooting path on the physical panel. The demo
// supplies its initial settings through the editor's normal HTTP loader.
Object.defineProperty(window, 'EventSource', { value: undefined })
const url = new URL(location.href)
if (url.searchParams.has('events')) {
  url.searchParams.delete('events')
  history.replaceState(null, '', url)
}

if (initial) document.querySelector('#demo-title')!.textContent = 'Editor demo · Your display'
document.querySelector('#reset-demo')!.addEventListener('click', () => {
  if (!confirm('Reset the demo to its starting layout?')) return
  try { sessionStorage.removeItem(sessionKey) } catch { /* Storage is unavailable. */ }
  location.reload()
})
