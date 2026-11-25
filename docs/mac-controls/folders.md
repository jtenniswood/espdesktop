---
title: Open File Folders from Your Touchscreen
description: Add an approved folder to EspDesktop and open it from a touchscreen tile. Group project folders together on a folder subpage.
---

# Open file folders

Folder cards open approved folders in Finder on macOS or File Explorer on Windows. Folder paths stay on your computer. The display receives only a friendly name and an anonymous identifier.

## Approve a folder

Open **Folders** in EspDesktop and select a folder to approve. On macOS, choose **Add Folder…**. On Windows, choose **Add folder**.

<a href="/images/mac-app-folders.png"><picture><source type="image/avif" srcset="/images/mac-connector/mac_app4-480.avif 480w, /images/mac-connector/mac_app4-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/mac-app-folders.png" alt="Folders tab in EspDesktop for macOS showing approved folders and the Add Folder button" width="1224" height="1488" loading="lazy"></picture></a>

## Add a folder card

1. In the display’s web editor, select an empty tile and choose **Open a folder** under **File Folder** on macOS or **File Explorer** on Windows.
2. Select the folder you approved and choose **Save**.

<a href="/images/web-editor-choose-card.webp"><picture><source type="image/avif" srcset="/images/web-editor-choose-card-480.avif 480w, /images/web-editor-choose-card-960.avif 960w" sizes="(min-width: 768px) 688px, 90vw"><img src="/images/web-editor-choose-card.webp" alt="Choose Card dialog in the display’s web editor showing the Folder and Applications options" width="1269" height="1022" loading="lazy"></picture></a>

In the card’s **Advanced** section, set **Open folder in** to **A new window** or **The same window**.

If a folder moves or is renamed, use **Choose Again…** in EspDesktop on macOS. On Windows, remove the old approval with the trash icon, add the folder at its new location, and select it again in the card settings. Removing a folder from EspDesktop makes its associated cards unavailable.

## Folder subpage

To group your approved folders on one page, select an empty tile in the display’s web editor.

- **macOS** — choose **File Folder → Open folder subpage**. If you limit which apps the display can launch, enable **Finder** under **Apps** in EspDesktop first.
- **Windows** — choose **File Explorer → Open File Explorer**.

The application is already selected. Choose **Save** to add the card and its subpage. While your computer is connected, the subpage automatically shows the folders you approved in EspDesktop, filling the available spaces on the touchscreen and in the web editor preview.

Use **Pin folders** to keep selected tiles in place and drag them into order. Pinned tiles stay visible when your computer disconnects.

Under **App Subpage**, use **Folder shortcuts open in** to set the default window behaviour. A folder tile can use that default or override it under **Advanced → Open folder in**.

A folder card lights up when its folder is active in Finder or File Explorer. On macOS, EspDesktop may ask for permission to control Finder for highlighting.

<a href="/images/mac-companion-finder-access.png"><picture><source type="image/avif" srcset="/images/mac-companion-finder-access-480.avif 480w, /images/mac-companion-finder-access-772.avif 772w" sizes="(min-width: 768px) 386px, 90vw"><img src="/images/mac-companion-finder-access.png" alt="macOS asking whether EspDesktop can control Finder" width="386" height="504" loading="lazy"></picture></a>

For app launch behavior and other generated app pages, see [Launch apps](/mac-controls/apps).
