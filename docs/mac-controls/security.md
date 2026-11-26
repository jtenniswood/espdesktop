---
title: Companion Permissions and Security
description: Understand the approvals and permissions used by EspDesktop on macOS and Windows.
---

# Companion permissions and security

EspDesktop checks requests from the paired touchscreen before acting on your computer. Approve the apps and folders you want to use and enable keyboard shortcuts for your platform.

Folder paths stay on your computer. The display uses a friendly name and an anonymous identifier for each folder. Firmware and app update checks can contact the project's public hosting, separately from local pairing and control.

| Feature | Approval or permission |
|---|---|
| Launching an app | Approve it on EspDesktop’s **Apps** page |
| [App Volume](/card-types/sound#app-volume) | Enable the app on EspDesktop’s **Apps** page. On Mac, allow **System Audio Recording** when prompted. |
| Opening a folder | Add it on EspDesktop’s **Folders** page |
| Running an Apple Shortcut | **All available shortcuts** is on by default. Turn it off in the Mac app’s **Shortcuts** settings to choose which workflows paired displays can run. Workflows run only while the Mac is unlocked. |
| Keyboard shortcuts and Lock Machine on macOS | Enable EspDesktop in **System Settings → Privacy & Security → Accessibility** |
| Keyboard shortcuts and Lock Machine on Windows | In EspDesktop, open **Display → Windows integration** and turn on **Allow keyboard shortcuts and screen lock** |

The [touchscreen follows your computer’s lock state](/settings/system#protect-the-touchscreen) while the app is running and paired.

## macOS permission prompts

<figure>
  <a href="/images/mac-companion-shortcut-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-shortcut-access-480.avif 480w, /images/mac-companion-shortcut-access-960.avif 960w" sizes="(min-width: 768px) 612px, 90vw"><img src="/images/mac-companion-shortcut-access.png" alt="EspDesktop’s Enable Keyboard Shortcuts step with the macOS permission prompt and Open System Settings button" width="612" height="744" loading="lazy"></picture></a>
  <figcaption>macOS can show this prompt when you choose Enable Keyboard Shortcuts in EspDesktop.</figcaption>
</figure>

<figure>
  <a href="/images/mac-companion-finder-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-finder-access-480.avif 480w, /images/mac-companion-finder-access-772.avif 772w" sizes="(min-width: 768px) 386px, 90vw"><img src="/images/mac-companion-finder-access.png" alt="macOS asking whether EspDesktop can control Finder" width="386" height="504" loading="lazy"></picture></a>
  <figcaption>Folder highlighting may ask for permission to control Finder.</figcaption>
</figure>

For App Volume, EspDesktop adjusts the audio on your Mac. Your paired display receives the volume percentage. The audio stays on the Mac.

## Pairing and data

If macOS asks for **Local Network** access, choose **Allow** so EspDesktop can find your display.

<a href="/images/mac-companion-local-network.png"><picture><source type="image/avif" srcset="/images/mac-companion-local-network-480.avif 480w, /images/mac-companion-local-network-772.avif 772w" sizes="(min-width: 768px) 386px, 90vw"><img src="/images/mac-companion-local-network.png" alt="macOS asking whether EspDesktop can find devices on the local network" width="386" height="390" loading="lazy"></picture></a>

- One computer can connect to several paired displays. Each display has its own pairing credential and can access the apps and folders you’ve approved in EspDesktop.
- The pairing code stays valid until pairing succeeds. The display generates a new code for the next pairing. EspDesktop stores the credential on your computer and checks the display certificate on later connections.
- The connector accepts only its defined controls. It does not run shell commands or accept incoming network connections on your computer.

To remove a display, choose **Forget** in **Settings → Displays** on macOS or **Forget display** in **Display** on Windows. A connected display with current firmware shows a new pairing code. If the display was offline or runs older firmware, reset pairing on the touchscreen or under **Connectors → Companion** in the display’s web settings.

See the [EspDesktop privacy policy](/reference/privacy) for how the app, display and docs handle information.
