---
title: Mac Companion Permissions and Security
description: Understand the approvals and macOS permissions used by EspDesktop Mac Companion controls.
---

# Mac Companion permissions and security

The EspDesktop touchscreen sends its requests over your local network to the paired Mac app. The app checks the request and acts on the Mac. It opens only apps and folders you approve, and sends keyboard shortcuts only after you enable Accessibility for EspDesktop.

Folder paths stay on the Mac. The display uses a friendly name and an anonymous identifier for each folder. Firmware and app update checks can contact the project's public hosting, separately from local pairing and control.

| Feature | Approval or permission |
|---|---|
| Launching an app | Approve it on the Mac app's **Apps** page |
| Opening a folder | Add it on the Mac app's **Folders** page |
| Keyboard shortcuts and Mac Lock | Enable EspDesktop in **System Settings → Privacy & Security → Accessibility** |

The [touchscreen follows your Mac’s lock state](/settings/system#protect-the-touchscreen) while the app is running and paired.

## macOS permission prompts

<figure>
  <a href="/images/mac-companion-shortcut-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-shortcut-access-480.avif 480w, /images/mac-companion-shortcut-access-960.avif 960w" sizes="(min-width: 768px) 612px, 90vw"><img src="/images/mac-companion-shortcut-access.png" alt="EspDesktop’s Enable Shortcuts step with the macOS permission prompt and Open System Settings button" width="612" height="744" loading="lazy"></picture></a>
  <figcaption>macOS can show this prompt when you choose Enable Shortcuts in EspDesktop.</figcaption>
</figure>

<figure>
  <a href="/images/mac-companion-finder-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-finder-access-480.avif 480w, /images/mac-companion-finder-access-772.avif 772w" sizes="(min-width: 768px) 386px, 90vw"><img src="/images/mac-companion-finder-access.png" alt="macOS asking whether EspDesktop can control Finder" width="386" height="504" loading="lazy"></picture></a>
  <figcaption>Folder highlighting may ask for permission to control Finder.</figcaption>
</figure>

## Pairing and data

If macOS asks for **Local Network** access, choose **Allow** so EspDesktop can find your display.

<a href="/images/mac-companion-local-network.png"><picture><source type="image/avif" srcset="/images/mac-companion-local-network-480.avif 480w, /images/mac-companion-local-network-772.avif 772w" sizes="(min-width: 768px) 386px, 90vw"><img src="/images/mac-companion-local-network.png" alt="macOS asking whether EspDesktop can find devices on the local network" width="386" height="390" loading="lazy"></picture></a>

- One Mac can connect to several paired displays at the same time. Each display has its own pairing credential and can access the apps and folders you’ve approved in the Mac app.
- Pairing uses a temporary code that expires after 15 minutes. EspDesktop stores the credential in macOS Keychain and checks the display certificate on later connections.
- Folder paths stay on the Mac. The display receives a friendly folder name and an anonymous identifier.
- The connector accepts only its defined controls. It does not run shell commands or accept incoming network connections on the Mac.

To remove a display, choose **Forget** beside it in **Settings → Displays**. To pair that display again, reset pairing under **System → Mac Companion** on the display and use its new code.

See the [EspDesktop privacy policy](/reference/privacy) for how the app, display and docs handle information.
