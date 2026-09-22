---
title: EspDesktop FAQ
description: Answers about Mac Companion controls, Home Assistant, supported displays, setup, cameras, updates and troubleshooting.
outline: [2, 3]
---

# Frequently Asked Questions

## Setup and everyday use

### What Is EspDesktop, and Do I Need to Write Code?

EspDesktop turns a supported ESP32 touchscreen into a dedicated Home Assistant controller. Normal setup uses the [browser installer](/getting-started/install) and panel web editor; no YAML or UI coding is required.

### Can I Use This Without Home Assistant?

Yes. On the **4-inch 4848S040**, the Mac Companion connector can complete setup and provide Mac controls without Home Assistant. Pair the EspDesktop Mac app to launch approved apps, open folders and websites, run shortcuts, arrange windows, control media and volume, and show Mac statistics.

Home Assistant is still required for smart-home entities such as lights, heating, sensors, and Home Assistant media players. You can connect it alongside Mac Companion to mix both types of cards on the 4848S040.

The other supported panel profiles currently do not offer Companion cards and continue to use Home Assistant for their main controls and information.

### Which Panels Are Supported?

Supported families are Guition 4848S040, JC4880P443, JC1060P470, JC8012P4A1, and P4 86 Panel ETH-2RO. Exact revisions matter. Use [Choose a screen](/screens/) to compare them and find the matching installer.

### Should I Choose the S3 or a P4 Screen?

Choose S3 for a compact, lower-cost panel; choose P4 for more image slots or a larger screen. P4 86 also supports voice. Compare [capacity, networking, and hardware revisions](/screens/).

### Can I Display My Existing Home Assistant Dashboard Cards?

No. EspDesktop has its own touch interface and cards using Home Assistant entities. Lovelace and custom dashboard cards cannot be imported. See [Configure your panel](/features/setup).

### Can It Control Spotify, Sonos, Apple TV, Plex, or Music Assistant?

Yes, through compatible Home Assistant `media_player` entities. Playback, artwork, volume, and seeking depend on the integration. Add it to Home Assistant first, then configure a [Media card](/card-types/media).

### Does the S3 Now Support Cameras, and Is It Live Video?

S3 and P4 panels support Camera cards showing still snapshots from Home Assistant `camera` or `image` entities. They do not stream live video. Tap to enlarge the latest image. See [Cameras](/card-types/cameras).

### Why Do Track Details Work but the Album Image Is Missing?

Metadata and image downloads use different connections. Check that Home Assistant supplies artwork and the panel can reach its HTTP/HTTPS endpoint. Follow the [missing-artwork checks](/features/media-cover-art#track-details-work-but-artwork-is-missing).

### Are There Stands or Wall Mounts, Including a 7-inch Mount?

Yes; [Printable Stands and Mounts](/reference/3d-printable-stands) lists published files, including a 7-inch desk stand. Match the exact rear board and cable clearance. Prototypes mentioned in older discussions may not be published.

### How Do I Open the New Controls or Change Their Tab Order?

Choose **All Controls** for [Lights](/card-types/lights), [Covers](/card-types/covers), [Fans](/card-types/fans), or [Media](/card-types/media). Climate controls open on tap. Use **Visible Tabs** where offered. Missing options may require newer firmware and a browser reload.

### Can I Group Speakers on the S3, and Can I Mix Sonos with WiiM?

Grouping works on S3 and P4 with compatible Home Assistant players. EspDesktop cannot make incompatible players join. Test grouping in Home Assistant, then follow [Speaker Groups](/features/speaker-groups) for discovery and actions permission.

### Can I Make a Dedicated Album-art Screen or Migrate from the Older Media Controller?

Yes. Use a large Cover Art card or the automatic [Media Cover Art](/features/media-cover-art) screen. The [migration guide](/getting-started/migrate-esphome-media-player) covers layouts, playback controls, and idle behaviour.

### How Do I Get the Speaker and Playback Tabs Shown in the Posts?

Use **Media > All Controls**, or tap a **Cover Art** card. Tabs appear according to the selected player's capabilities; speaker controls also need [speaker discovery setup](/features/speaker-groups). A **Speaker Group** card opens that screen directly.

### Can a Card Start a Playlist, Album, or Radio Station?

Choose **Media > Track, Album or Playlist** and supply a content ID accepted by the player integration. For complex playback, run a Home Assistant script with an Action card. See [Media](/card-types/media).

### Which Displays Support Voice or Play Audio Themselves?

The **4-inch P4 86 Panel** supports [Home Assistant Assist voice control](/features/voice-control) and local audio with its microphones, speaker, and audio-capable firmware. Other panels' Media cards control external players.

### Why Does a Camera Change from Loading to Unavailable?

Check the image exists in Home Assistant, the panel can reach its HTTP/HTTPS endpoint, and the shared image limit is not exceeded. See [Camera troubleshooting](/card-types/cameras#troubleshooting) and [connection settings](/features/setup#home-assistant-settings).

### Can I Show a Doorbell Snapshot When Someone Rings?

Use a Camera card and a Home Assistant automation with [Screen: Wake](/features/screensaver#wake-from-home-assistant). P4 panels also have a [visible-camera refresh action](/card-types/cameras#refreshing-cards-from-home-assistant). The card does not automatically open when the doorbell rings.

### How Many Camera and Cover Art Cards Can I Use?

P4 panels have **six** shared image slots; S3 has **two**. Camera and Cover Art cards share that limit across all pages. Moving a card into a folder does not free a slot. See [limits](/card-types/cameras#practical-limits).

### Can I Use Immich or Turn It into a Photo Frame?

Yes, through a Home Assistant `image` entity. The separate Immich Companion manages photos; the panel displays snapshots. See [Immich setup and integration status](/card-types/cameras#show-photos-from-immich), including its requirements and update path.

### How Do I Update the Firmware?

Standard firmware offers **Auto Update** and **Check for Update** under Firmware settings. Custom, Ethernet-only, and V3 installation paths have exceptions. Follow [Firmware Updates](/features/firmware-updates) for the correct method and release status.

### Will Automatic Updates Keep My Custom ESPHome YAML?

No. Built-in updates install released binaries and do not rebuild custom YAML. Disable **Auto Update** and continue through ESPHome for custom builds. See [release and custom-firmware guidance](/features/firmware-updates#stable-releases-development-builds-and-custom-firmware).

### Why Did Home Assistant Say Transport Encryption Was Disabled After an Update?

Mixed custom and stock firmware can change encryption behaviour. Keep the device-stored key package documented in [manual setup](/getting-started/manual-esphome-setup). Do not dismiss an unexpected warning; check [encryption troubleshooting](/getting-started/troubleshooting#home-assistant-says-connection-requires-encryption).

### Can I Rename a Panel Without Compiling Firmware?

Yes. Use **Settings > System > Device Name > Save & Restart**. Entity IDs stay unchanged, but hostname-based ESPHome action names change. Update affected automations. See [Naming Your Panel](/features/setup#naming-your-panel).

### Can I Back Up My Setup?

Yes. Use **Export** and **Import** under Backup to save cards and settings or copy a setup to another panel. Layouts adapt to different screen sizes. See [Backup and restore](/features/backup) for exclusions.

### Can I Copy Just a Few Cards to Another Panel?

Use **Copy Code** and **Paste Code** in [Setup](/features/setup) for cards and attached subpages. Use [Backup](/features/backup) for a whole configuration. Each panel keeps its own web page and identity.

### Can I Restart from Home Assistant and Update Without Reconnecting USB?

Yes. Home Assistant exposes a [Restart button](/features/setup#restart-from-home-assistant); online panels can usually update wirelessly. USB remains necessary for initial flashing, recovery, or networking-type changes. See [manual installation](/getting-started/manual-esphome-setup).

### How Do I Reset the Device?

Back up first, then use **Settings > System > Factory Reset**. Partial reset keeps WiFi and the Home Assistant key; Complete reset clears them. Both retain firmware. Follow [Reset the display](/features/backup#reset-the-display).

### Can I Stay on Releases While Managing the Panel in ESPHome?

Yes, by building from matching tagged sources and dependencies. Rebuilding the current source is different from installing a published binary. See [release versus custom firmware](/features/firmware-updates#stable-releases-development-builds-and-custom-firmware).

### Why Do Cards Show State but Tapping Does Nothing?

Enable **Allow the device to perform Home Assistant actions** in the panel's ESPHome integration options. Then test a command that works directly in Home Assistant. Follow [Enable Actions](/getting-started/home-assistant-actions).

### The Web Page Looks Broken or Unstyled

Check that your browser can reach the hosted web resources, then force-refresh or try a private window. If needed, use the embedded-editor fallback in [Troubleshooting](/getting-started/troubleshooting#web-configuration-changes-won-t-save).

### My Device Won't Connect to WiFi

Use 2.4 GHz WiFi, verify the password, and wait up to 90 seconds for the setup hotspot if reconnecting fails. Ethernet-only builds have no hotspot. Follow [WiFi troubleshooting](/getting-started/troubleshooting#wifi-does-not-connect).

### How Do I Find My Device's IP Address?

Tap the connectivity icon in the clock bar, check the unconfigured display, or look in your router's device list or Home Assistant ESPHome device page. Then open that address in a browser.

### The Display Is Stuck on the Loading Screen

Allow startup time, then power-cycle and check WiFi setup if it remains stuck. Use the [loading-screen checks](/getting-started/troubleshooting#the-display-is-stuck-on-the-loading-screen), including USB logs if you need to report it.

### What Should I Do about Stripes, Haze, or a Halo around the Screen?

Check firmware revision, supply, and cable first. If the fault persists, document the hardware and symptoms; a panel defect may need seller support. Follow the [display checks](/getting-started/troubleshooting#stripes-haze-or-a-halo-on-the-screen).

### Where Should I Report a Bug or Request a Feature?

Use [GitHub issues](https://github.com/jtenniswood/espdesktop/issues) with model, revision, firmware, reproduction steps, and relevant logs or photos. Remove credentials and private details. See [Contributing](/reference/contributing) and [USB logs](/reference/collect-usb-logs).

### How Is My Data Handled?

Smart-home control normally runs locally. Updates, web assets, network time, artwork, webhooks, and integrations can contact external services. EspDesktop has no central smart-home data collection service. See [Privacy](/reference/privacy) for details.

### What Card Types Are Available?

The [card catalogue](/card-types/) covers lights, switches, climate, fans, covers, locks, alarms, media, cameras, sensors, weather, actions, and more. Choose a simple one-tap card or a supported **All Controls** view when you want several controls behind one card.

### How Many Cards Can I Have?

Standard home grids have **9 slots** on 4-inch panels, **6** on 4.3-inch, **15** on 7-inch, and **20** on 10.1-inch. Larger cards occupy multiple slots. [Subpages](/features/subpages) add pages; [image limits](/card-types/cameras#practical-limits) apply separately.

### What Is a Subpage?

A Subpage card opens another page of controls, like a folder for a room or device group. Each subpage reserves one slot for Back. See [Subpages](/features/subpages).

### Can the Screen Sleep, Wake on Touch, or Wake When Someone Arrives?

Yes. [Screensaver settings](/features/screensaver) support timer- or Home Assistant presence-based behaviour, touch wake, and **Screen: Wake**. Built-in camera face detection is not a supported presence source.

### Can It Control Mini-split Fan Speed, Swing, and Heating/Cooling Targets?

Yes, when the Home Assistant climate entity exposes those capabilities. Range thermostats show separate heating and cooling targets. See [Climate](/card-types/climate) and compare missing controls with the entity's Home Assistant attributes.

### Why Does My Weather Card Only Show Cloudy Instead of a Temperature?

**Current Conditions** shows the state. Select **Temperatures Today** or **Temperatures Tomorrow** for forecast highs/lows and enable actions permission. Use a Sensor card for measured temperature. See [Weather](/card-types/weather).

### Can I Choose a Different Background Colour for Every Card?

The current interface uses a shared **Primary** colour for active cards and fixed colours for inactive and information cards. It does not offer arbitrary per-card background colours. Change the accent in [Appearance](/features/appearance).

### Can I Send Blinds to 25, 50, or 75 Percent?

Yes. **Cover > All Controls > Presets** offers 0, 25, 50, 75, and 100 percent when the entity supports position control. A **Set Position** card provides a direct shortcut. Home Assistant uses 0 for closed and 100 for open; the card's fill represents how much is closed. See [Covers](/card-types/covers).

### Is There a Full Fan Control View?

Yes. **Fans > All Controls** combines supported power, speed, preset, oscillation, and direction controls. You can also attach a separate light entity for an on/off Light tab. See [Fans](/card-types/fans).

### Can I Select WLED Presets?

Yes, when the WLED integration exposes them as a `select` entity. Add an **Action** card, choose **Option Select**, and select the preset entity, such as `select.wled_preset`. Use a Light card for the capabilities exposed by its `light` entity. See [Option Select](/card-types/option-select).

### Can One Sensor Card Show Temperature and Humidity Together?

A Sensor card has one source entity. Use separate cards or a combined text sensor from Home Assistant. A dedicated multi-sensor tile is not a current mode. See [Sensors](/card-types/sensors).

### Why Do Light Controls Use Colour Presets Instead of a Colour Wheel?

The light popup uses touch-friendly colour choices. Its available tabs depend on the light's capabilities in Home Assistant, and **Visible Tabs** can put the controls you use most first. See [Lights](/card-types/lights).

### Can the Clock Show Seconds?

There is no seconds option for the normal clock bar or Date & Time card. The clock bar updates by the minute. See [Time Settings](/features/clock) for timezone and 12/24-hour options.

### What If the Icon I Need Isn't Listed?

The panel includes hundreds of icons from the Material Design Icons set. If the one you need isn't there, [open an issue on GitHub](https://github.com/jtenniswood/espdesktop/issues) with the icon name (from [pictogrammers.com/library/mdi](https://pictogrammers.com/library/mdi/)) and what you'd use it for. We'll look into adding it.

### Which 10-inch Revision or 4-inch P4 Variant Should I Buy?

Check [revision identification](/screens/#identify-the-hardware-revision-before-installing). JC8012P4A1 V3 silicon takes precedence over case dates. P4 86 support targets **ETH-2RO**; other boards are not automatically compatible.

### Can I Use a Cheap Yellow Display or Another ESP32 Screen?

Only [listed models](/screens/) have ready-to-install firmware. A matching processor, screen size, or resolution does not make another board compatible.

### Will It Fit a Standard Wall Box or Replace a Light Switch?

Check the panel's dimensions and mounting holes against your actual wall box; regional boxes such as Italian 503, North American single-gang, and 86-type boxes are not interchangeable. Some supported variants have [relays](/features/relays), but the screen still needs the correct power supply and room for its rear hardware. Use the manufacturer's wiring instructions and a qualified installer for mains wiring; a neutral may be required depending on the supply.

### Can I Power a Panel over PoE?

An Ethernet port alone does not establish PoE support. Check the exact panel and rear-board specifications. A PoE splitter can supply a panel through its supported power input only when its output voltage, current, connector, and polarity match that panel. See the relevant screen guide before choosing power hardware; do not copy another model's wiring from a comment.

### Can the Panel Also Be a Bluetooth Proxy?

Bluetooth proxy is not included in standard panel setup or documented Ethernet-only builds. Use a separate proxy. Ethernet firmware turns off the WiFi/Bluetooth co-processor; see [networking options](/screens/#networking-and-power).

### Can It Run on a Battery and Show the Charge Level?

Power and measurement are separate hardware features. [Battery Status](/features/battery) is optional on compatible JC8012P4A1 battery hardware, estimates charge, and does not detect charging. S3 experiments do not establish supported charge reporting.

### Can I Use a 10-inch Display in Portrait Mode?

Use **Settings > Display > Rotation**. Available orientations depend on panel and firmware. Check the preview and usable card space after rotating. See [Rotation](/features/rotation).

### Does It Have a Room Temperature Sensor?

Do not assume an ambient sensor is built in. Select a Home Assistant temperature entity or a supported [Local Sensor](/card-types/local-sensors). Sensors near the processor or backlight can read warmer than the room.

### Does the Panel Work with Other Smart Home Platforms?

EspDesktop connects directly to its Mac app for Mac controls and to Home Assistant for smart-home controls. It does not support Google Home, Apple HomeKit, or SmartThings directly. If those platforms are integrated into Home Assistant, the panel can control devices exposed through Home Assistant.

### Where Is the Source Code, and How Can I Help?

The source is on [GitHub](https://github.com/jtenniswood/espdesktop). See [Contributing](/reference/contributing) for feedback and contributions and the repository licence before reusing it. The documentation's support button offers a way to support development.

### What Can I Control on My Mac?

The 4848S040 can launch approved applications, create ready-made Safari, Slack, or Codex shortcut pages, replay custom keyboard shortcuts, open approved Finder folders, open safe web links, control and arrange the active window, adjust output or input volume, show Now Playing artwork, and display processor, memory, storage, network, or battery statistics.

See [Mac Cards and Capabilities](/card-types/companion) for the complete list and required permissions.

### Why Is a Mac Card Disabled?

Check the monitor icon beside WiFi on the display. If it is missing, open EspDesktop on the Mac and check the **Display** page. If the Mac is connected:

- approve the selected application in **Applications**;
- add or renew the folder in **Folders**;
- allow Accessibility for shortcut and window cards;
- check the paired Mac is connected for automatic statistics sharing; or
- check that the current audio or media application supplies the needed macOS control.

The Mac app and display firmware should come from the same release or matching feature branch.

### What Is EspDesktop?

EspDesktop pairs a supported ESP32 touchscreen with a native Mac app for approved applications, folders, shortcuts, windows, volume and statistics. The 4-inch 4848S040 supports Mac Companion; Home Assistant controls are also available across the supported displays. Use the [Mac setup guide](/getting-started/mac-app) or [browser installer](/getting-started/install) to get started.
