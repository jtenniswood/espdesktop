---
title: Mac Companion Permissions and Security
description: Understand the approvals and macOS permissions used by EspDesktop Mac Companion controls.
---

# Mac Companion permissions and security

The display can only use the apps, folders, and actions made available through the Mac app.

| Feature | Approval or permission |
|---|---|
| Launching an app | Approve it on the Mac app's **Apps** page |
| Opening a folder | Add it on the Mac app's **Folders** page |
| Keyboard shortcuts and Mac Lock | Enable EspDesktop in **System Settings → Privacy & Security → Accessibility** |

The [touchscreen follows your Mac’s lock state](/settings/system#protect-the-touchscreen) while the app is running and paired.

## Pairing and data

- One Mac can connect to several paired displays at the same time. Each display has its own pairing credential and can access the apps and folders you’ve approved in the Mac app.
- Pairing uses a temporary code that expires after 15 minutes. EspDesktop stores the credential in macOS Keychain and checks the display certificate on later connections.
- Folder paths stay on the Mac. The display receives a friendly folder name and an anonymous identifier.
- The connector accepts only its defined controls. It does not run shell commands or accept incoming network connections on the Mac.

To remove a display, choose **Forget** beside it in **Mac Settings → Displays**. To pair that display again, reset pairing under **System → Mac Companion** on the display and use its new code.

See the [EspDesktop privacy policy](/reference/privacy) for how the app, display and docs handle information.
