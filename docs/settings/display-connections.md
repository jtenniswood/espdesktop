---
title: Connect EspDesktop over USB or IP
description: Connect a display to the EspDesktop Mac app over USB or your local network, enter its IP address manually, and switch connections without pairing again.
---

# Display connections (USB & IP)

Use your local network for Mac controls with the standard EspDesktop release. With compatible development builds of both the Mac app and display firmware, you can also run Mac controls and edit the layout over a USB data cable with Wi-Fi off. USB control testing covers the 4-inch Guition 4848S040 and the 7-inch Guition JC1060P470 V3.

## Connect over your local network

1. Connect your display and Mac to the same local network. The 4848S040 joins 2.4 GHz Wi-Fi. [Wi-Fi setup and recovery](/getting-started/troubleshooting#wifi-setup-and-reset-recovery).
2. Choose **Add device** from the EspDesktop menu bar icon or **Add Display** in **Settings → Displays**. Select your display when it appears. If it’s missing, choose **Enter address manually** and enter its IP address or `.local` name.
3. Choose **Continue**, enter the four-letter code shown on the touchscreen, then choose **Connect**.

To find the display’s IP address, tap the network status icon on the touchscreen and look for **IP address**. If a paired display’s address changes, open its **Network** menu in **Settings → Displays**, choose **Update Address**, enter the current address, and choose **Connect**.

<a href="/images/mac-connector/usb-connection.png">
  <picture>
    <source type="image/avif" srcset="/images/mac-connector/usb-connection-480.avif 480w, /images/mac-connector/usb-connection-960.avif 960w" sizes="(min-width: 768px) 480px, min(480px, 90vw)">
    <img src="/images/mac-connector/usb-connection.png" alt="EspDesktop Mac app Displays settings with the Network menu open, showing Use USB and Update Address" width="480" height="649" loading="lazy" decoding="async">
  </picture>
</a>

## Connect over USB

Use a USB data cable to connect the display directly to your Mac. For the first firmware installation, follow the [USB installer guide](/screens/4848s040#install). The steps below are for using Mac controls after installing USB-capable firmware.

- **Pair a new display.** In the Mac app, choose **Add device**, select **Connect by USB** for the display’s port, and choose **Continue**. On the touchscreen, tap **Pair** on the Setup screen or **Unpaired** in Settings to show the four-letter code. Enter it in the Mac app and choose **Connect**.
- **Switch a paired display to USB.** In **Settings → Displays**, open the display’s **Network** menu and choose **Use USB**. EspDesktop looks for the display and keeps its existing pairing. If you need to select another port once in USB mode, open **USB → Change port**.
- **Open the layout editor.** Choose **Device** in **Settings → Displays**. If the display reports a Wi-Fi address, the editor opens in your browser. Otherwise it opens inside the Mac app over USB. To open it over USB while the display is on Wi-Fi, right-click **Device** and choose **Open USB Editor**.

## Switch a paired display back to the network

Keep the USB cable connected and choose **USB → Use Network** in **Settings → Displays**. EspDesktop tries to turn on the display’s Wi-Fi if needed and looks for the paired display on your network. If it asks for a network address, enter the display’s current IP address or `.local` name and choose **Connect**.

Once the network connection is active, **Device** opens the display’s editor in your browser. You can switch each display independently and use USB and network displays at the same time.

If a display is missing or the pairing code fails, see [troubleshooting](/getting-started/troubleshooting#the-display-does-not-appear-in-espdesktop).
