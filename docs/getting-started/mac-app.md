---
title: Download EspDesktop for Mac
description: Download EspDesktop for macOS 13 or newer, pair a Guition 4848S040 display on your local network and add your first app tiles.
---

<section class="mac-app-hero">

<div>

# EspDesktop <span class="mac-app-platform">for Mac</span> {#install-and-pair-the-espdesktop-mac-app}

Connect your display to your Mac to launch apps, open folders and run shortcuts with a tap.

<p class="mac-app-requirements">macOS 13 or later · Apple silicon</p>

<div class="mac-app-tabs" role="tablist" aria-label="Installation method" @keydown="navigateInstallTabs">
  <button
    v-for="(label, method) in installMethods"
    :id="`mac-install-tab-${method}`"
    :key="method"
    type="button"
    role="tab"
    :aria-selected="activeMethod === method"
    :aria-controls="`mac-install-panel-${method}`"
    :tabindex="activeMethod === method ? 0 : -1"
    @click="activeMethod = method"
  >{{ label }}</button>
</div>

<div v-show="activeMethod === 'download'" id="mac-install-panel-download" role="tabpanel" aria-labelledby="mac-install-tab-download">

<p class="mac-app-action">
  <a :href="$frontmatter.macDownloadUrl">{{ $frontmatter.macReleaseVersion ? 'Download for Mac' : 'View Mac downloads' }}</a>{{ ' ' }}
  <span v-if="$frontmatter.macReleaseVersion">v{{ $frontmatter.macReleaseVersion }} · DMG</span>
</p>

Open the DMG and drag **EspDesktop** into **Applications**.

</div>

<div v-show="activeMethod === 'homebrew'" id="mac-install-panel-homebrew" class="mac-app-homebrew" role="tabpanel" aria-labelledby="mac-install-tab-homebrew">

With [Homebrew](https://brew.sh/) installed, run this command in Terminal.

```sh
brew install --cask jtenniswood/tap/espdesktop
```

</div>

</div>

<figure class="mac-app-preview">
  <a href="/images/mac-app-display.jpg">
    <img src="/images/mac-app-display.jpg" alt="EspDesktop Mac app showing a connected display and the Customize button" width="1000" height="1376">
  </a>
</figure>

</section>

## 1. Install the Mac app {#install-a-release}

[Install EspDesktop on your display](/getting-started/install) if you haven’t already. After installing the Mac app, open **EspDesktop** from **Applications**. Its icon appears in the menu bar.

Use the Mac app and display firmware from the same release. For older firmware, [download the matching DMG from GitHub Releases](https://github.com/jtenniswood/espdesktop/releases).

## 2. Pair your display {#pair-the-display}

Connect your Mac and [4-inch Guition ESP32-S3 4848S040](/screens/4848s040) to the same local network.

1. Select your display in the Mac app. Allow local network access if macOS asks.
2. Choose **Continue** to open the display’s **System → Mac Companion** page in your browser.
3. Copy the pairing code into the Mac app and choose **Connect**. When connected, the Mac Companion panel in your browser collapses and a monitor icon appears beside WiFi on the display.

**Display missing?** Choose **Enter address manually** and enter its IP address or `.local` name.

On **Access and startup**, choose **Open Settings** to grant Accessibility access if you want keyboard shortcuts or Mac Lock. Turn on **Launch at login** if you want EspDesktop to open when you sign in. Choose **Finish**.

### Check the Display tab

Open **Display** in the Mac app to confirm it says **Connected**. Select **Customize** to open the display’s web editor.

## 3. Try your first card {#check-the-connection}

On an empty display, the web page guides you through app setup.

1. Pick up to eight apps for the home screen. Setup leaves one slot free.
2. Choose whether to add shortcut pages for apps with built-in shortcuts. If you add pages, choose whether they open automatically when you switch apps on your Mac.
3. Choose **Done** or **Save setup**. Your cards appear on the display automatically.
4. Tap a card to open its app or bring it to the front on your Mac.

Choose **Skip setup** to build a custom layout in the editor. To run the wizard again, open **Screen → Appearance → App Subpages → Setup Again**. Saving replaces the home-screen cards and their shortcut pages. Close the wizard with **×** to keep your current layout.

## Check for Mac app updates

The Mac app keeps your display pairing when it updates and reconnects to the saved display when it reopens.

With automatic checks enabled, EspDesktop checks when you launch the app and daily while it’s running. When a compatible update is available, the update window lets you install it or decide later. To check manually, choose **EspDesktop → Check for Updates…** or use the same command from the EspDesktop icon in the menu bar.

Open EspDesktop from **Applications**, then turn on **Notify Me About Updates** in **Mac Settings → Updates** and allow macOS notifications. Click an update notification to open the updater. If you prefer eligible updates to install on quit, turn on **Automatically Install Updates**.

If an update requires newer display firmware, install the app and firmware from the same EspDesktop release. Follow the [display update instructions](/features/setup#update-the-display-firmware).

[Explore Mac controls](/#what-you-can-control) · [Permissions and security](/mac-controls/security) · [Troubleshoot pairing and controls](/getting-started/troubleshooting)

<script setup lang="ts">
import { ref } from 'vue'

const installMethods = { download: 'Download', homebrew: 'Homebrew' } as const
const activeMethod = ref<keyof typeof installMethods>('download')

function navigateInstallTabs(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
      activeMethod.value = activeMethod.value === 'download' ? 'homebrew' : 'download'
      break
    case 'Home':
      activeMethod.value = 'download'
      break
    case 'End':
      activeMethod.value = 'homebrew'
      break
    default:
      return
  }
  event.preventDefault()
  document.getElementById(`mac-install-tab-${activeMethod.value}`)?.focus()
}
</script>

<style scoped>
.mac-app-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 28px;
}

.mac-app-hero h1 {
  max-width: 12ch;
}

.mac-app-platform {
  white-space: nowrap;
}

.mac-app-hero h1 + p {
  max-width: 36ch;
  color: var(--vp-c-text-2);
  font-size: 18px;
  line-height: 1.55;
}

.mac-app-tabs {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.mac-app-tabs button {
  min-height: 44px;
  margin-bottom: -1px;
  padding: 0 8px;
  border-bottom: 2px solid transparent;
  color: var(--vp-c-text-2);
  font-weight: 600;
}

.mac-app-tabs button:hover,
.mac-app-tabs button[aria-selected='true'] {
  color: var(--vp-c-brand-1);
}

.mac-app-tabs button[aria-selected='true'] {
  border-bottom-color: currentColor;
}

.mac-app-hero .mac-app-action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.mac-app-action a {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 0 24px;
  border-radius: 999px;
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  font-weight: 600;
  text-decoration: none;
}

.mac-app-action a:hover {
  background: var(--vp-button-brand-hover-bg);
  color: var(--vp-button-brand-hover-text);
}

.mac-app-hero .mac-app-requirements,
.mac-app-action span {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}

.mac-app-homebrew .language-sh {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  margin-inline: 0;
  border-radius: 8px;
}

.mac-app-homebrew .language-sh > button.copy {
  position: static;
  flex: none;
  margin-right: 8px;
  opacity: 1;
}

.mac-app-homebrew .language-sh > .lang {
  display: none;
}

.mac-app-homebrew .language-sh pre {
  flex: 1;
  min-width: 0;
  padding: 14px 0;
}

.mac-app-homebrew .language-sh code {
  width: auto;
  padding-inline: 14px 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.mac-app-preview {
  width: 100%;
  max-width: 360px;
  margin: 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: radial-gradient(ellipse at top, var(--vp-c-brand-soft), transparent 85%), var(--vp-c-bg-soft);
}

.mac-app-preview img {
  width: 100%;
  aspect-ratio: 7 / 6;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  object-fit: cover;
  object-position: top;
}

@media (min-width: 960px) {
  .mac-app-hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr);
  }
}
</style>
