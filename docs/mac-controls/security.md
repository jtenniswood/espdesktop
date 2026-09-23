---
title: Mac Companion Permissions and Security
description: Understand the approvals and macOS permissions used by EspDesktop Mac Companion controls.
---

# Mac Companion Permissions and Security

The display can only use the apps, folders, and actions made available through the Mac app.

| Feature | Approval or permission |
|---|---|
| Launching an app | Approve it on the Mac app's **Apps** page |
| Opening a folder | Add it on the Mac app's **Folders** page |
| Keyboard shortcuts and window controls | Enable EspDesktop in **System Settings → Privacy & Security → Accessibility** |
| Mac statistics | Shared while connected when the display firmware supports them |

## Pairing and Data

- One Mac can be paired to one display at a time.
- Pairing uses a temporary code that expires after 15 minutes. EspDesktop stores the credential in macOS Keychain and checks the display certificate on later connections.
- Folder paths stay on the Mac. The display receives a friendly folder name and an anonymous identifier.
- The connector accepts only its defined controls. It does not run shell commands or accept incoming network connections on the Mac.

To replace a display, choose **Forget Display** in the Mac app and reset pairing under **Connectors → Mac Companion** on the old display. Then pair using the new display's code.
