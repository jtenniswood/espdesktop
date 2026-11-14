<template>
  <div class="icon-gallery">
    <input
      v-model="search"
      type="text"
      class="icon-search"
      placeholder="Search icons…"
    />
    <p class="icon-count">{{ totalFiltered }} icon{{ totalFiltered === 1 ? '' : 's' }}</p>
    <div v-for="group in filteredGroups" :key="group.name" class="icon-group">
      <h3 class="icon-group-title">{{ group.name }}</h3>
      <div class="icon-grid">
        <button
          v-for="icon in group.icons"
          :key="icon.name"
          class="icon-card"
          :class="{ copied: copiedName === icon.name }"
          @click="copy(icon.name)"
        >
          <span class="icon-preview mdi" :class="'mdi-' + icon.mdi" />
          <span class="icon-name">{{ copiedName === icon.name ? 'Copied!' : icon.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { iconOptions, iconSlug } from '../../../../src/webserver/application/ui_primitives'

const GROUP_ORDER = [
  'Applications & Desktop',
  'Keyboard & Shortcuts',
  'Window Management',
  'Files & Folders',
  'Browser & Navigation',
  'Audio & Meetings',
  'Creative & Development',
  'System & Hardware',
  'General',
]

const ICON_GROUPS = {
  'Book Alphabet': 'Applications & Desktop',
  'Bookmark Multiple': 'Browser & Navigation',
  'Bookmark Plus': 'Browser & Navigation',
  'Card Text': 'Applications & Desktop',
  'Font Size Decrease': 'Creative & Development',
  'Font Size Increase': 'Creative & Development',
  'Page Next': 'Browser & Navigation',
  'Page Previous': 'Browser & Navigation',
  'File Search': 'Files & Folders',
  'File Tree': 'Creative & Development',
  'Message Alert': 'Applications & Desktop',
  'Robot': 'Creative & Development',
  'Web Plus': 'Browser & Navigation',
  'Compare Selection': 'Creative & Development',
  'Filmstrip Stack': 'Creative & Development',
  'Group Selection': 'Creative & Development',
  'Movie Plus': 'Creative & Development',
  'Timeline Plus': 'Creative & Development',
  'Account Question': 'General',
  'Bold': 'Creative & Development',
  'Book': 'Creative & Development',
  'Bullet List': 'Creative & Development',
  'Calendar Multiple': 'Applications & Desktop',
  'Calendar Plus': 'Applications & Desktop',
  'Calendar Search': 'Applications & Desktop',
  'Calendar Today': 'Applications & Desktop',
  'Calendar Week': 'Applications & Desktop',
  'Car': 'Applications & Desktop',
  'Chat Plus': 'Applications & Desktop',
  'Clipping Mask': 'Creative & Development',
  'Comment Plus': 'Creative & Development',
  'Component': 'Creative & Development',
  'Deselect': 'Keyboard & Shortcuts',
  'Email Plus': 'Applications & Desktop',
  'Email Sync': 'Applications & Desktop',
  'Emoji': 'Applications & Desktop',
  'Export': 'Files & Folders',
  'File Compare': 'Creative & Development',
  'File Report': 'Files & Folders',
  'Filter Plus': 'General',
  'Flag Plus': 'Creative & Development',
  'Folder Plus': 'Files & Folders',
  'Folder Search': 'Files & Folders',
  'Form Fill': 'Applications & Desktop',
  'Format Size': 'Creative & Development',
  'Heading': 'Creative & Development',
  'Image Search': 'Creative & Development',
  'Import': 'Files & Folders',
  'Inbox': 'Applications & Desktop',
  'Indent': 'Creative & Development',
  'Italic': 'Creative & Development',
  'Magnet': 'Creative & Development',
  'Map': 'Applications & Desktop',
  'Merge': 'Creative & Development',
  'Message Unread': 'Applications & Desktop',
  'New Window': 'Window Management',
  'Note Plus': 'Applications & Desktop',
  'Note Search': 'Applications & Desktop',
  'Panorama': 'Creative & Development',
  'Paperclip': 'Files & Folders',
  'Photo Album': 'Creative & Development',
  'Pin': 'General',
  'Pin Off': 'General',
  'Playlist Edit': 'Audio & Meetings',
  'Playlist Music': 'Audio & Meetings',
  'Playlist Plus': 'Audio & Meetings',
  'Podcast': 'Audio & Meetings',
  'Reply': 'Applications & Desktop',
  'Rotate Left': 'Creative & Development',
  'Satellite': 'Applications & Desktop',
  'Save As': 'Files & Folders',
  'Send': 'Applications & Desktop',
  'Slideshow': 'Creative & Development',
  'Source Commit': 'Creative & Development',
  'Source Compare': 'Creative & Development',
  'Source Pull Request': 'Creative & Development',
  'Speed Down': 'Audio & Meetings',
  'Speed Up': 'Audio & Meetings',
  'Star': 'General',
  'Tab Restore': 'Browser & Navigation',
  'Table Plus': 'Creative & Development',
  'Tag Plus': 'General',
  'Template': 'Files & Folders',
  'Theme': 'Applications & Desktop',
  'Train': 'Applications & Desktop',
  'Underline': 'Creative & Development',
  'Zoom In': 'General',
  'Zoom Out': 'General',
  'Arrow Down': 'Keyboard & Shortcuts',
  'Arrow Up': 'Keyboard & Shortcuts',
  'Chevron Left': 'Browser & Navigation',
  'Chevron Right': 'Browser & Navigation',
  'Chevron Up': 'Browser & Navigation',
  'Chevron Down': 'Browser & Navigation',
  'Palette': 'Creative & Development',
  'Bell': 'Audio & Meetings',
  'View Headline': 'Window Management',
  'Stop': 'Audio & Meetings',
  'Swap Horizontal': 'Window Management',
  'Gauge': 'System & Hardware',
  'Auto': 'General',
  'Shortcut Command': 'Keyboard & Shortcuts',
  'Account': 'General',
  'Application': 'System & Hardware',
  'Battery': 'System & Hardware',
  'Battery Alert': 'System & Hardware',
  'Battery Charging': 'System & Hardware',
  'Battery High': 'System & Hardware',
  'Battery Low': 'System & Hardware',
  'Battery Medium': 'System & Hardware',
  'Bluetooth': 'System & Hardware',
  'Cast': 'Audio & Meetings',
  'Check': 'General',
  'Clock': 'General',
  'Circle Outline': 'General',
  'Delete': 'General',
  'Delete Empty': 'General',
  'Delete Outline': 'General',
  'Delete Variant': 'General',
  'Dots Horizontal': 'General',
  'Fan': 'System & Hardware',
  'Flash': 'Keyboard & Shortcuts',
  'Folder Music Outline': 'Audio & Meetings',
  'Folder Outline': 'Files & Folders',
  'Folder Play': 'Audio & Meetings',
  'Folder Account Outline': 'Files & Folders',
  'Folder Home Outline': 'Files & Folders',
  'Folder Key Outline': 'Files & Folders',
  'Folder Open Outline': 'Files & Folders',
  'Gamepad': 'Audio & Meetings',
  'Gesture Tap': 'Keyboard & Shortcuts',
  'Harddisk': 'System & Hardware',
  'Headphones': 'Audio & Meetings',
  'Home': 'General',
  'Key': 'System & Hardware',
  'LAN': 'System & Hardware',
  'Lightning Bolt': 'Keyboard & Shortcuts',
  'Lock': 'System & Hardware',
  'Lock Open': 'System & Hardware',
  'Lock Open Outline': 'System & Hardware',
  'Lock Outline': 'System & Hardware',
  'Menu': 'General',
  'Message Video': 'Audio & Meetings',
  'Microphone': 'Audio & Meetings',
  'Microphone Off': 'Audio & Meetings',
  'Microsoft Xbox': 'Audio & Meetings',
  'Minus': 'General',
  'Monitor': 'System & Hardware',
  'Movie Roll': 'Audio & Meetings',
  'Music': 'Audio & Meetings',
  'Music Box Multiple': 'Audio & Meetings',
  'Music Note': 'Audio & Meetings',
  'Music Note Quarter': 'Audio & Meetings',
  'Nintendo Switch': 'Audio & Meetings',
  'Plus': 'General',
  'Pause': 'Audio & Meetings',
  'Play': 'Audio & Meetings',
  'Play Pause': 'Audio & Meetings',
  'PlayStation': 'Audio & Meetings',
  'Power': 'System & Hardware',
  'Power Plug': 'System & Hardware',
  'Progress Clock': 'General',
  'Printer': 'System & Hardware',
  'Printer 3D': 'System & Hardware',
  'Projector': 'Audio & Meetings',
  'Projector Off': 'Audio & Meetings',
  'Recycle': 'General',
  'Remote Back': 'Audio & Meetings',
  'Remote Desktop': 'Audio & Meetings',
  'Remote Down': 'Audio & Meetings',
  'Remote Left': 'Audio & Meetings',
  'Remote OK': 'Audio & Meetings',
  'Remote Right': 'Audio & Meetings',
  'Remote Up': 'Audio & Meetings',
  'Router': 'System & Hardware',
  'Router Network': 'System & Hardware',
  'Skip Next': 'Audio & Meetings',
  'Skip Previous': 'Audio & Meetings',
  'Speaker': 'Audio & Meetings',
  'Speaker Multiple': 'Audio & Meetings',
  'Speaker Wireless': 'Audio & Meetings',
  'Speaker Off': 'Audio & Meetings',
  'Speaker Pause': 'Audio & Meetings',
  'Speaker Play': 'Audio & Meetings',
  'Search': 'General',
  'Sun': 'System & Hardware',
  'Thermometer': 'System & Hardware',
  'Timer': 'General',
  'Trash Can': 'General',
  'Trash Can Outline': 'General',
  'Video': 'Audio & Meetings',
  'Video Outline': 'Audio & Meetings',
  'Volume High': 'Audio & Meetings',
  'Volume Off': 'Audio & Meetings',
  'Web': 'Browser & Navigation',
  'Wifi': 'System & Hardware',
  'Tab': 'System & Hardware',
  'Laptop': 'System & Hardware',
  'Window Close': 'Window Management',
  'Window Minimise': 'Window Management',
  'Eye Off': 'Window Management',
  'Full Screen': 'Window Management',
  'Fit to Screen': 'Window Management',
  'Target': 'Window Management',
  'Dock Left': 'Window Management',
  'Dock Right': 'Window Management',
  'Dock Top': 'Window Management',
  'Dock Bottom': 'Window Management',
  'Arrow Top Left': 'Window Management',
  'Arrow Top Right': 'Window Management',
  'Arrow Bottom Left': 'Window Management',
  'Arrow Bottom Right': 'Window Management',
  'Window Restore': 'Window Management',
  'Split Vertical': 'Window Management',
  'Arrow Left Right': 'Window Management',
  'Split Horizontal': 'Window Management',
  'Arrow Left Bold Box Outline': 'Window Management',
  'Arrow Right Bold Box Outline': 'Window Management',
  'Arrow Up Bold Box Outline': 'Window Management',
  'Arrow Down Bold Box Outline': 'Window Management',
  'View Grid': 'Window Management',
  'Arrow Expand': 'Window Management',
  'Arrow Collapse': 'Window Management',
  'Apple': 'Applications & Desktop',
  'Windows': 'Applications & Desktop',
  'Linux': 'Applications & Desktop',
  'Desktop': 'Applications & Desktop',
  'Applications': 'Applications & Desktop',
  'Application Settings': 'Applications & Desktop',
  'Application Launch': 'Applications & Desktop',
  'Application Exit': 'Applications & Desktop',
  'Dock': 'Applications & Desktop',
  'Desktop Dashboard': 'Applications & Desktop',
  'Task List': 'Applications & Desktop',
  'Calendar': 'Applications & Desktop',
  'Email': 'Applications & Desktop',
  'Chat': 'Applications & Desktop',
  'Notes': 'Applications & Desktop',
  'Calculator': 'Applications & Desktop',
  'Contacts': 'Applications & Desktop',
  'Help': 'Applications & Desktop',
  'Information': 'Applications & Desktop',
  'Keyboard': 'Keyboard & Shortcuts',
  'Keyboard Settings': 'Keyboard & Shortcuts',
  'Shortcut Control': 'Keyboard & Shortcuts',
  'Shortcut Option': 'Keyboard & Shortcuts',
  'Shortcut Shift': 'Keyboard & Shortcuts',
  'Shortcut Escape': 'Keyboard & Shortcuts',
  'Shortcut Return': 'Keyboard & Shortcuts',
  'Shortcut Tab': 'Keyboard & Shortcuts',
  'Shortcut Backspace': 'Keyboard & Shortcuts',
  'Shortcut Space': 'Keyboard & Shortcuts',
  'Undo': 'Keyboard & Shortcuts',
  'Redo': 'Keyboard & Shortcuts',
  'Copy': 'Keyboard & Shortcuts',
  'Cut': 'Keyboard & Shortcuts',
  'Paste': 'Keyboard & Shortcuts',
  'Select All': 'Keyboard & Shortcuts',
  'Find Replace': 'Keyboard & Shortcuts',
  'Arrow Left': 'Keyboard & Shortcuts',
  'Arrow Right': 'Keyboard & Shortcuts',
  'File': 'Files & Folders',
  'New File': 'Files & Folders',
  'Open File': 'Files & Folders',
  'Save': 'Files & Folders',
  'Save All': 'Files & Folders',
  'Rename': 'Files & Folders',
  'Upload': 'Files & Folders',
  'Download': 'Files & Folders',
  'Archive': 'Files & Folders',
  'Zip File': 'Files & Folders',
  'Cloud': 'Files & Folders',
  'Cloud Sync': 'Files & Folders',
  'Link': 'Files & Folders',
  'Link Off': 'Files & Folders',
  'Share': 'Files & Folders',
  'Bookmark': 'Files & Folders',
  'History': 'Files & Folders',
  'New Tab': 'Browser & Navigation',
  'Close Tab': 'Browser & Navigation',
  'Find Tab': 'Browser & Navigation',
  'Refresh': 'Browser & Navigation',
  'Back': 'Browser & Navigation',
  'Forward': 'Browser & Navigation',
  'Open External': 'Browser & Navigation',
  'Incognito': 'Browser & Navigation',
  'Home Page': 'Browser & Navigation',
  'Volume Low': 'Audio & Meetings',
  'Volume Medium': 'Audio & Meetings',
  'Volume Up': 'Audio & Meetings',
  'Volume Down': 'Audio & Meetings',
  'Mute': 'Audio & Meetings',
  'Headset': 'Audio & Meetings',
  'Audio Settings': 'Audio & Meetings',
  'Equalizer': 'Audio & Meetings',
  'Video Off': 'Audio & Meetings',
  'Video Call': 'Audio & Meetings',
  'Screen Share': 'Audio & Meetings',
  'Screen Record': 'Audio & Meetings',
  'Record': 'Audio & Meetings',
  'Meeting': 'Audio & Meetings',
  'Hand Raise': 'Audio & Meetings',
  'Do Not Disturb': 'Audio & Meetings',
  'Notifications': 'Audio & Meetings',
  'Terminal': 'Creative & Development',
  'Code': 'Creative & Development',
  'Code Tags': 'Creative & Development',
  'Source Branch': 'Creative & Development',
  'Git': 'Creative & Development',
  'Bug': 'Creative & Development',
  'Run': 'Creative & Development',
  'Build': 'Creative & Development',
  'Database': 'Creative & Development',
  'API': 'Creative & Development',
  'Screenshot': 'Creative & Development',
  'Crop': 'Creative & Development',
  'Draw': 'Creative & Development',
  'Brush': 'Creative & Development',
  'Color Picker': 'Creative & Development',
  'Layers': 'Creative & Development',
  'Image': 'Creative & Development',
  'Vector': 'Creative & Development',
  'Timeline': 'Creative & Development',
  'Video Edit': 'Creative & Development',
  'Animation': 'Creative & Development',
  'CPU': 'System & Hardware',
  'Memory': 'System & Hardware',
  'USB': 'System & Hardware',
  'USB Drive': 'System & Hardware',
  'Mouse': 'System & Hardware',
  'Restart': 'System & Hardware',
  'Sleep': 'System & Hardware',
  'Logout': 'System & Hardware',
  'Brightness Up': 'System & Hardware',
  'Brightness Down': 'System & Hardware',
  'Display Settings': 'System & Hardware',
  'Monitor Multiple': 'System & Hardware',
  'Network': 'System & Hardware',
  'Ethernet': 'System & Hardware',
  'VPN': 'System & Hardware',
  'Wifi Off': 'System & Hardware',
  'Bluetooth Off': 'System & Hardware',
  'Sync': 'System & Hardware',
  'Eject': 'System & Hardware',
  'Settings': 'System & Hardware',
  'Window Maximise': 'Window Management',
  'Full Screen Exit': 'Window Management',
  'Picture in Picture': 'Window Management',
  'Duplicate': 'Creative & Development',
  'Align Left': 'Creative & Development',
  'Align Right': 'Creative & Development',
  'Align Center': 'Creative & Development',
  'Justify': 'Creative & Development',
  'Strikethrough': 'Creative & Development',
  'Numbered List': 'Creative & Development',
  'Decrease Indent': 'Creative & Development',
  'Increase Indent': 'Creative & Development',
  'Paint Format': 'Creative & Development',
  'Subscript': 'Creative & Development',
  'Superscript': 'Creative & Development',
  'Subtitles': 'Audio & Meetings',
}

const icons = iconOptions.map(name => ({ name, mdi: iconSlug(name) }))
const search = ref('')
const copiedName = ref(null)
let copyTimer = null

function groupOf(icon) {
  return ICON_GROUPS[icon.name] || 'General'
}

const filteredGroups = computed(() => {
  const q = search.value.toLowerCase()
  const matched = q
    ? icons.filter(i => i.name.toLowerCase().includes(q))
    : icons

  const buckets = {}
  for (const icon of matched) {
    const g = groupOf(icon)
    if (!buckets[g]) buckets[g] = []
    buckets[g].push(icon)
  }

  return GROUP_ORDER
    .filter(g => buckets[g])
    .map(g => ({ name: g, icons: buckets[g] }))
})

const totalFiltered = computed(() =>
  filteredGroups.value.reduce((sum, g) => sum + g.icons.length, 0)
)

function copy(name) {
  navigator.clipboard.writeText(name)
  copiedName.value = name
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copiedName.value = null }, 1200)
}

onMounted(() => {
  if (document.querySelector('link[href*="materialdesignicons"]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css'
  document.head.appendChild(link)
})
</script>

<style scoped>
.icon-gallery {
  margin-top: 1rem;
}

.icon-search {
  width: 100%;
  padding: 10px 14px;
  font-size: 15px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}

.icon-search:focus {
  border-color: var(--vp-c-brand-1);
}

.icon-count {
  font-size: 13px;
  color: var(--vp-c-text-3);
  margin: 8px 0 4px;
}

.icon-group {
  margin-top: 1.25rem;
}

.icon-group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin: 0 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--vp-c-border);
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.icon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  cursor: pointer;
  transition: border-color 0.2s, transform 0.15s, background-color 0.2s;
  font-family: inherit;
  color: var(--vp-c-text-1);
}

.icon-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
}

.icon-card.copied {
  border-color: var(--vp-c-green-2);
  background: var(--vp-c-green-soft);
}

.icon-preview {
  font-size: 32px;
  line-height: 1;
  color: var(--vp-c-text-1);
}

.icon-name {
  font-size: 11px;
  text-align: center;
  line-height: 1.3;
  color: var(--vp-c-text-2);
  word-break: break-word;
}

.icon-card.copied .icon-name {
  color: var(--vp-c-green-2);
  font-weight: 600;
}
</style>
