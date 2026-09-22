---
title: EspDesktop Media Cover Art
description:
  How to show media cover art from a paired Mac or Home Assistant while music or video is playing on EspDesktop.
---

# Media Cover Art

Media Cover Art can turn the panel into a Now Playing display while media plays on a paired Mac or a selected Home Assistant media player.

You will find these controls in **Settings > Sleep & Schedule > Cover Art Screen Saver** on the panel web page.

## Common Settings

- **Show Cover Art** enables the cover-art display.
- **Source** appears on the 4-inch 4848S040. Choose **Mac Companion** for the Mac's current Now Playing session or **Home Assistant** for a media-player entity. Other panel profiles use Home Assistant.
- **Show After** chooses how long cover art waits before appearing, from 3 seconds to 5 minutes. This delay restarts after each touch so you have time to use other controls before the artwork returns.
- **Show Track Details For** controls how long track information appears over the artwork on 4-inch square displays.
- **Keep Screen Awake During Playback** is on by default. It prevents the display from sleeping while media plays, but does not bypass the **Show After** delay.

Turn on **Show Cover Art** to reveal the settings, then choose the **Media Player Entity** to watch, such as `media_player.living_room`.

### Screensaver Settings

- **Keep Screen Awake During Playback** — on by default. While Show Cover Art is enabled, this prevents normal screensaver sleep during playback and lets artwork appear after **Show After**. It has no effect while Show Cover Art is off.
- **Show After** — choose 3, 5, 10, or 30 seconds, 1 minute, or 5 minutes. The default is 10 seconds. This also controls when cover art returns after you dismiss it; every touch restarts the countdown.
- **Show Track Details For** — available on the 4-inch square displays. Choose **Never**, 3, 5, 10, 15, 20, 30, or 60 seconds, or **Always**. The default is 5 seconds.

With **Keep Screen Awake During Playback** off, Timer or Sensor screensaver mode can still show eligible artwork when the normal screensaver activates. With Screensaver mode **Disabled**, cover art uses **Show After**. A time-based [Night Schedule](/features/screen-schedule) takes priority over cover art while its night period is active.

### External sources

- **Show external sources** — allows cover art for the player's `TV`, `Line-in`, or `HDMI` input. Off by default.
- **External Source Media Entity** — shown when Show external sources is on. Optionally choose the player connected to that input. When it has current media, its playback state, artwork, track details, progress, and filtering attributes drive the cover-art screen.

If you turn off Show external sources, the saved external player remains configured. A usable external player can still supply artwork; if it becomes unavailable, the external-input hide rule applies again.

### Advanced Options

Turn on **Advanced Filtering** to reveal **Only Show When**. Enter matching media player attributes, such as `app_id=com.apple.TVMusic` or `app_id=com.apple.TVMusic; media_content_type=music`. Turning Advanced Filtering off clears the saved conditions.

Cover art is separate from the normal [Screensaver](/features/screensaver) mode. Use Screensaver when you want the panel to dim, show a clock, or turn off after inactivity.

## Use Mac Now Playing

On the 4-inch 4848S040, first [install and pair the EspDesktop Mac app](/getting-started/mac-app). Then turn on **Show Cover Art** and set **Source** to **Mac Companion**.

The display can show the title, artist, album, progress, source application, playback state, and artwork reported by macOS. You do not need a Home Assistant media-player entity when this source is selected.

Apple Music, Spotify, and browser playback can work when the application publishes a usable macOS Now Playing session. Some applications or web players do not publish all details, so missing artwork, duration, or track information may simply be unavailable from that source.

Use [Companion Media cards](/card-types/companion#cover-art) if you also want Play / Pause, Previous, and Next controls on the normal card screen.

## Use a Home Assistant Media Player

Choose **Home Assistant** as the source, then configure:

- **Media Player Entity** — the player to watch, such as `media_player.living_room`.
- **External Source Media Entity** — an optional second player connected through a soundbar or speaker's `TV`, `Line-in`, or `HDMI` input. When that input is active, the second player's state, artwork, details, progress, and filtering attributes drive the screen.
- **Advanced Options** — additional playback, source, and filtering controls.
- **Hide for external source inputs** — hides cover art when the selected source is `TV`, `Line-in`, or `HDMI`. A usable External Source Media Entity takes priority.
- **Advanced Filtering → Only Show When** — limits cover art to matching media-player attributes, such as `app_id=com.apple.TVMusic` or `app_id=com.apple.TVMusic; media_content_type=music`.

Playback time and the progress bar appear only when Home Assistant supplies a usable duration. Live radio streams continue to show available artwork and track details without an empty progress line. When cover art is shown for `TV` or `Line-in`, the artist line shows **Source** because these inputs normally do not provide artist data.

For artwork downloads, open **Settings > System > Home Assistant Settings**. **Connection > Automatic** discovers the Home Assistant HTTP endpoint; **Manual** lets you choose **Home Assistant Protocol** (`http` or `https`) and **Home Assistant Port**. The card shows the current artwork endpoint. See [Home Assistant Settings](/features/setup#home-assistant-settings) for discovery and fallback behavior.

## Track Details Work but Artwork Is Missing

Playback metadata uses the native ESPHome connection; image downloads use HTTP or HTTPS. One can work while the other fails.

1. Confirm the selected player has artwork in Home Assistant.
2. Open **Settings > System > Home Assistant Settings** and check the displayed artwork endpoint.
3. If automatic discovery chooses an unreachable endpoint, use **Manual** with the reachable protocol and port. A reverse proxy may need **Artwork Base URL**.
4. Retry playback. Confirm both the small Cover Art card and its expanded view load an image.

Artwork availability depends on the source. If only Spotify, radio, Plex, or another source fails, capture [USB logs](/reference/collect-usb-logs) and include the source and firmware version in a report, with private URLs and credentials removed.
