---
title: Mac Cards and Capabilities
description: Launch approved Mac apps, open folders and websites, run shortcuts, arrange windows, control media and volume, and show Mac statistics from EspDesktop.
---

# Mac Cards and Capabilities

Mac controls use the **Mac Companion** connector between the EspDesktop display and the EspDesktop menu-bar app. They currently work on the **4-inch Guition ESP32-S3 4848S040** with one paired Mac.

Home Assistant is not required for these controls. You can connect Home Assistant as well if you want Mac and smart-home cards on the same display.

::: tip Before adding cards
First [install and pair the EspDesktop Mac app](/getting-started/mac-app). The monitor icon beside WiFi in the display's clock bar shows that the Mac is connected.
:::

## Choose a Mac Control

Open the display's web page, select an empty home-screen or subpage slot, choose **Companion**, then choose a **Type**.

| Companion type | What it does | Extra setup |
|---|---|---|
| **Launch app** | Brings an approved Mac application to the front | Approve the app in the Mac app's **Applications** page |
| **Keyboard shortcut** | Replays a shortcut such as Command-A in the active app | Allow Accessibility access |
| **Open URL** | Opens an `http://` or `https://` address in an approved app | Choose an approved browser or other app |
| **Open folder** | Opens an approved Finder folder | Add the folder in the Mac app's **Folders** page |
| **Media control** | Plays, pauses, or skips the current macOS Now Playing session | The media app must publish a usable Now Playing session |
| **Stats** | Shows live Mac processor, memory, storage, network, or battery information | Turn on **Share Mac system statistics** |
| **Window control** | Controls or arranges the active Mac window | Allow Accessibility access; tiling needs macOS 15+ |

Action cards are disabled when the Mac is offline or the selected application, folder, command, or URL is unavailable. Statistic cards show `--` until a reading is available.

## Launch Apps and Open Websites

For **Launch app**, select an application from the approved list supplied by the Mac app. Finder is not listed as an application because folders have their own control.

For **Open URL**, enter an `http://` or `https://` address and choose the approved application that should open it, such as Safari or Chrome. Addresses containing an embedded username or password are rejected, and other URL types such as `file://` are not accepted.

When an app card is active on the Mac, the card uses the display's active colour. This also lets an app card safely switch the display to its matching app subpage only after the Mac confirms that the application came to the front.

## Ready-Made App Subpages

Launch cards for **Safari**, **Slack**, and **Codex** can create a ready-made subpage of useful controls.

1. Add a **Companion → Launch app** card and select one of the supported apps.
2. Open **App subpage** below Card Settings.
3. Turn on **Add app subpage**.
4. Choose the shortcuts you want and drag them into order.
5. Optionally turn on **Auto switch to subpage**.

| App | Included shortcuts |
|---|---|
| **Safari** | Back, Forward, Reload, New Tab, Close Tab |
| **Slack** | Compose, Search, Direct Messages, Unread, All Unread |
| **Codex** | Command, Approve, Browser, Sidebar, Side panel, and Terminal controls |

The generated page is a normal editable subpage. You can rename or reorder its shortcut cards and add other card types. Turning the app subpage off keeps those edits so they return if you enable it again.

With **Auto switch to subpage** enabled, tapping the app card asks the Mac to activate the application first. The display opens the subpage only after the Mac confirms success, so its shortcuts are not accidentally sent to a different app.

## Custom Keyboard Shortcuts

Choose **Keyboard shortcut**, select the shortcut field, then press the combination you want to capture. Shortcuts must include Command, Control, or Option with a supported letter, number, function, navigation, or punctuation key. Modifier-only shortcuts and unsupported system keys are rejected.

Shortcuts are sent to whichever Mac application is active when you tap the card. macOS Accessibility permission is required because EspDesktop needs to replay the keyboard input.

## Window Controls

Window cards act on the active Mac window. Choose **Companion → Window control**, then select an action.

| Group | Actions | macOS version |
|---|---|---|
| **Window** | Close, Minimise, Hide App, Full Screen | macOS 13+ |
| **Move & Resize** | Fill Desktop, Centre, Left, Right, Top, Bottom, Return to Previous Size | macOS 15+ |
| **Arrange Windows** | Left & Right, Right & Left, Top & Bottom, Bottom & Top, and four side-with-quarters layouts | macOS 15+ |

The Mac app must have Accessibility permission. Some applications or windows do not support every macOS window command; in that case the window stays where it is.

## Media Controls and Cover Art

Choose **Media control** for **Play / Pause**, **Previous**, or **Next**. These buttons control the application currently registered with macOS Now Playing.

Play / Pause shows the state confirmed by the Mac:

- **Playing** — the card lights in the display's active colour.
- **Paused** — the card returns to its normal colour.
- **Stopped** — no active track was reported, but Play / Pause remains available because the Mac may still accept the command.
- **Unavailable** — the Mac cannot provide the required media command.

Apple Music, Spotify, and browser playback can work when the application publishes a usable session to macOS. Support depends on the application's macOS media integration.

To turn the whole display into a Now Playing view, open **Settings → Sleep & Schedule → Media Cover Art**, turn on **Show Cover Art**, and choose **Mac Companion** as the source. EspDesktop can then show the title, artist, album, progress, playback state, source application, and artwork supplied by the Mac. No Home Assistant media-player entity is needed for this source.

See [Media Cover Art](/features/media-cover-art) for its display and timing options.

## Mac Volume Sliders

Mac volume uses the normal [Slider card](/card-types/sliders), not a Companion card.

1. Add a **Slider** card.
2. Set **Control** to **Mac output volume** for the selected speakers or **Mac input volume** for the selected microphone.
3. Choose the label and icons you want.

The slider follows volume changes made on the Mac. It is disabled when the Companion is disconnected or the selected audio device does not provide software volume control.

## Mac Statistics

Turn on **Share Mac system statistics** in the Mac app's **Permissions** page, then add **Companion → Stats** cards.

| Statistic | What is shown |
|---|---|
| **Processor** | Current total processor use as a percentage |
| **Memory** | Used or free memory as a percentage |
| **Storage** | Used or free storage as a percentage |
| **Network** | Current combined network throughput in MB/s |
| **Battery** | Battery charge percentage; unavailable on Macs without a battery |
| **IP address** | Laptop icon and the IPv4 address of the selected Mac network device |

For **IP address**, choose a **Network device**, such as Wi-Fi or Ethernet. Each card keeps its own selection. The card shows `--` if that device has no IPv4 address or the Mac is disconnected. Update both the display firmware and Mac app to use this option.

Statistics show a metric icon above the live reading. Numeric labels include used, free or remaining as appropriate, with configurable units and decimal precision. Numeric cards include a **Show capacity label** toggle, enabled by default, to control whether the used, free or remaining word appears after the value. Statistics are shared only when enabled in the Mac app.

You can also choose **Subpage → Companion Stat** to put one of these readings on a home-screen tile that opens a page of related Mac controls.

## Permissions and Availability

| Feature | Approval or permission |
|---|---|
| Launching an app | The app must be selected in EspDesktop's **Applications** page |
| Opening a folder | The folder must be added in EspDesktop's **Folders** page |
| Keyboard and window controls | EspDesktop must be enabled in **System Settings → Privacy & Security → Accessibility** |
| Mac statistics | **Share Mac system statistics** must be on in EspDesktop's **Permissions** page |
| Media and artwork | The playing application must publish a usable macOS Now Playing session |
| Output or input volume | The selected audio device must expose software volume control |

## Security and Current Limits

- One Mac can be paired to one display at a time.
- Pairing uses a temporary code that expires after 15 minutes. The Mac stores the credential in Keychain and pins the display certificate after the first pairing.
- Applications and folders must be approved on the Mac. Folder paths remain on the Mac; the display receives a friendly name and anonymous identifier.
- The connector accepts only its defined actions. It does not run shell commands or accept incoming network connections on the Mac.
- Now Playing information is read through macOS's private `MediaRemote` framework because Apple's public API only lets an app publish its own session. If a macOS update removes the required interface, media and artwork become unavailable while the other Mac controls continue to work.
- Companion cards are currently offered only on the 4848S040 profile. Other supported panels continue to provide their Home Assistant cards normally.

If pairing needs to be replaced, reset it from **Connectors → Mac Companion** on the display, choose **Forget Display** in the Mac app, and pair again. You can also tap the display’s network icon and choose **Pairing**. The popup shows the pairing code and the display’s IP address.

For version details, see [Companion Compatibility](/generated/companion-compatibility).
