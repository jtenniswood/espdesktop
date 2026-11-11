import { decodePanelPageSnapshot, encodePanelPageDocument } from '../../src/webserver/model/panel_config_conversion'

const deviceProfile = 'guition-esp32-s3-4848s040'
const maxConfigBytes = 512 * 1024
const configType = 'application/vnd.espdesktop.panel-config'

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
    return { layout, entities: snapshot.entities, appIcons: snapshot.appIcons }
  } catch {
    return null
  }
}

const snapshot = readSnapshot(window.espDesktopDemoSnapshot)
const seed = snapshot ?? sample
const config = decodePanelPageSnapshot(seed.layout).document
const entities = new Map(seed.entities.map(item => [item.id, item]))
const appIcons = snapshot?.appIcons

const notFound = () => new Response(null, { status: 404 })

// The demo serves an immutable snapshot through the editor's normal read
// paths. All other requests end here, including every device write.
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input, window.location.href)
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  if (url.origin !== window.location.origin || method.toUpperCase() !== 'GET') return notFound()

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
      return new Response(seed.layout.slice(), {
        headers: { ETag: '"v2-1"', 'X-Panel-Config-Version': '2', 'Content-Type': configType },
      })
    case '/connectors/status':
      return Response.json({ onboarding_complete: true, mac_companion: {
        available: true, configured: true, paired: true, connected: false,
      } })
    case '/espdesktop/version.json':
      return Response.json({ device_slug: deviceProfile, version: 'demo' })
    case '/companion/app-icon': {
      const appId = url.searchParams.get('appId')
      const background = url.searchParams.get('background') ?? ''
      const icon = appIcons?.[JSON.stringify([appId, background])] ?? appIcons?.[JSON.stringify([appId, ''])]
      if (!icon) return notFound()
      const pixels = Uint8Array.from(atob(icon.pixels), char => char.charCodeAt(0))
      const headers = new Headers({ 'X-EspDesktop-Companion-Online': 'true' })
      if (icon.palette) headers.set('X-EspDesktop-App-Icon-Palette', icon.palette)
      return new Response(pixels, { headers })
    }
  }

  const id = decodeURIComponent(url.pathname.slice(1))
  // The editor uses a legacy read to finish loading its screen settings.
  if (id === 'text/Button Order') return Response.json(entity(id, config.settings.button_order ?? ''))
  const current = entities.get(id)
  return current ? Response.json(current) : notFound()
}

// Use the snapshot's HTTP reads and always start on the home screen.
Object.defineProperty(window, 'EventSource', { value: undefined })
const url = new URL(location.href)
if (url.searchParams.size) {
  url.search = ''
  history.replaceState(null, '', url)
}
