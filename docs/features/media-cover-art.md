---
title: EspDesktop Media Cover Art
description:
  How to show media cover art from a paired Mac or Home Assistant while music or video is playing on EspDesktop.
---

# Media Cover Art

Media Cover Art can turn the panel into a Now Playing display while media plays on a paired Mac or a selected Home Assistant media player.

Open **Settings → Sleep & Schedule → Media Cover Art** on the panel web page.

## Common Settings

- **Show Cover Art** enables the cover-art display.
- **Source** appears on the 4-inch 4848S040. Choose **Mac Companion** for the Mac's current Now Playing session or **Home Assistant** for a media-player entity. Other panel profiles use Home Assistant.
- **Show After** chooses how long cover art waits before appearing, from 3 seconds to 5 minutes. This delay restarts after each touch so you have time to use other controls before the artwork returns.
- **Show Track Details For** controls how long track information appears over the artwork on 4-inch square displays.
- **Keep Screen Awake During Playback** is on by default. It prevents the display from sleeping while media plays, but does not bypass the **Show After** delay.

Cover art is separate from the normal [Screensaver](/features/screensaver) mode. Use Screensaver when you want the panel to dim, show a clock, or turn off after inactivity.

## Use Mac Now Playing

On the 4-inch 4848S040, first [install and pair the EspDesktop Mac app](/getting-started/mac-app). Then turn on **Show Cover Art** and set **Source** to **Mac Companion**.

The display can show the title, artist, album, progress, source application, playback state, and artwork reported by macOS. You do not need a Home Assistant media-player entity when this source is selected.

Apple Music, Spotify, and browser playback can work when the application publishes a usable macOS Now Playing session. Some applications or web players do not publish all details, so missing artwork, duration, or track information may simply be unavailable from that source.

Use [Companion Media cards](/card-types/companion#media-controls-and-cover-art) if you also want Play / Pause, Previous, and Next controls on the normal card screen.

## Use a Home Assistant Media Player

Choose **Home Assistant** as the source, then configure:

- **Media Player Entity** — the player to watch, such as `media_player.living_room`.
- **External Source Media Entity** — an optional second player connected through a soundbar or speaker's `TV`, `Line-in`, or `HDMI` input. When that input is active, the second player's state, artwork, details, progress, and filtering attributes drive the screen.
- **Advanced Options** — additional playback, source, and filtering controls.
- **Hide for external source inputs** — hides cover art when the selected source is `TV`, `Line-in`, or `HDMI`. A usable External Source Media Entity takes priority.
- **Advanced Filtering → Only Show When** — limits cover art to matching media-player attributes, such as `app_id=com.apple.TVMusic` or `app_id=com.apple.TVMusic; media_content_type=music`.

Playback time and the progress bar appear only when Home Assistant supplies a usable duration. Live radio streams continue to show available artwork and track details without an empty progress line. When cover art is shown for `TV` or `Line-in`, the artist line shows **Source** because these inputs normally do not provide artist data.

By default, the panel builds artwork links from the Home Assistant API connection address. If Home Assistant is behind a reverse proxy, open **Settings → System → Home Assistant Settings** and set **Artwork Base URL (optional)** to the full address the panel can reach, such as `https://home.example.com`. It can include a custom port or path prefix. Leave it blank to keep automatic detection; in that mode, **Home Assistant Protocol** and **Home Assistant Port** control the generated link.
