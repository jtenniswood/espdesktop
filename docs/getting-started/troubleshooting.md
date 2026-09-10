---
title: Troubleshooting
description: "Help with USB installation, WiFi, Mac pairing and unavailable cards."
---

# Troubleshooting

## The Installer Cannot Find the Display

Use Chrome or Edge and a USB cable that supports data. Check that the serial port appears after connecting the display. Close other applications using that port.

## The Display Cannot Join WiFi

Use a 2.4 GHz network, check the password and move closer to the router. If the panel cannot connect to saved WiFi, allow up to 90 seconds for its setup hotspot. Join it and open `192.168.4.1` if the setup page does not appear.

For repeated WiFi failures on a P4 panel, see [C6 Recovery](/getting-started/c6-recovery).

## The Mac Cannot Find or Pair the Display

Keep both devices on the same trusted local network. Guest networks or separate network segments can block discovery. Try the display's IP address manually and allow local-network access if macOS asks.

Open the display's **Settings → Mac Companion** box for a fresh pairing code. Install matching Mac and firmware builds. If a certificate change prevents reconnection, forget the saved display and pair again.

## A Mac Card Does Nothing

Check that the Mac app reports a connection. Approve the selected app or folder, and allow Accessibility access for keyboard and window controls. Not every Mac window supports every arrangement command. Statistic cards show a placeholder until the Mac supplies a reading.

## The Web Interface Looks Wrong

Reload the page, clear its cached data and check that its firmware and web interface belong to the same build. During development, the current PR still has incomplete firmware validation; do not treat a successful web preview as device testing.

## Share Diagnostic Information

Collect [USB logs](/reference/collect-usb-logs), note the panel model and build, and describe the steps that reproduce the issue. Remove credentials and private information before sharing logs.
