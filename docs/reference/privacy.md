---
title: Privacy Policy
description:
  How EspDesktop handles information in the documentation website, firmware, and web configuration interface.
---

# Privacy Policy

**Effective date: November 8, 2026**

EspDesktop is a source-available, non-commercial touchscreen control panel
project maintained by [jtenniswood](https://github.com/jtenniswood). This
policy explains what
information may be involved when you use the EspDesktop documentation website,
firmware, or built-in web configuration interface.

## The short version

EspDesktop does not operate an account system, advertising service, analytics
platform, or central service that collects your smart-home data. The firmware is
designed to communicate with a paired Mac on your local network and with
network services you choose to configure. Your device configuration is stored on your
device or in your own backups.

## The documentation website

The documentation site is hosted by GitHub Pages. When you visit it, GitHub
may process technical information such as your IP address, browser and device
information, the pages requested, and timestamps in order to deliver and
secure the site. GitHub controls that processing under its own policies; see
the [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement).

The site does not intentionally use cookies, advertising trackers, or a
first-party analytics service. Its search is generated and run in your
browser.

The support button image is served by this documentation site. Following the
button takes you to Buy Me a Coffee, which has its own privacy policy.

The install page loads the bundled USB installer from GitHub Pages when the
browser supports Web Serial and checks a public firmware manifest. These
requests may disclose normal request metadata, such as your IP address,
browser and device information, and request time.

The site also contains links to GitHub, ESPHome, and other
third-party websites. Those sites have their own terms and privacy practices.

## The EspDesktop firmware and device

The firmware exchanges Mac controls, system statistics, app information, and
Mac lock state with the Mac you pair. While the Mac is locked, the app also
reports whether its displays are awake. Saved configurations and backups may
retain identifiers and other fields from older cards so you can identify and
replace them.

## Firmware and asset downloads

Firmware with EspDesktop's update checker enabled periodically requests public
version metadata and, when an update is installed, firmware files from the
EspDesktop GitHub Pages site. These requests contain normal
network request information, such as the device's IP address and request time,
as observed by the hosting provider. They are not intended to include your
saved card data or pairing credentials.

ESPHome OTA or other update methods may contact the services you select.

Standard released firmware also loads the JavaScript for its built-in web
configuration interface from EspDesktop's GitHub Pages site. The request URL
includes the device model slug and firmware version, so the hosting provider
may receive those values along with normal browser or device connection
metadata when the interface is opened. This asset request is separate from
the firmware update checker.

Networked standard builds automatically synchronize time with the public NTP
pool at `0.pool.ntp.org`, `1.pool.ntp.org`, and `2.pool.ntp.org`. DNS and NTP
requests may disclose normal connection metadata to the pool operators. This
traffic occurs even when no optional cards or services are configured and the
EspDesktop update checker is disabled.

## Optional EspDesktop macOS app

EspDesktop connects to the display you pair on your local network. It stores
connection preferences and approved-folder bookmarks locally on the Mac, and
stores the pairing credential in macOS Keychain. Folder paths remain on the Mac;
the display receives names and opaque identifiers for approved applications and
folders. EspDesktop can also share the focused application for its cards. System statistics are shared automatically with your paired display while connected; they contain overall resource usage
and network throughput, not network contents.

Opening the display’s Companion setup page starts pairing on an unpaired
display and shows a temporary code. This uses the display’s configured web
authentication; without a web password, anyone who can reach that page can
start pairing. The Mac stores the paired credential in Keychain and pins the
display certificate. **Forget Display** removes those saved pairing values.

Folder access is granted through the native folder picker. Finder automation
can identify an approved folder in the frontmost Finder window; optional
Accessibility access enables requested keyboard shortcuts. Remove
approved folders in EspDesktop or revoke permissions in macOS System Settings.
Removing the application may leave preferences or Keychain items behind, so
forget the display before uninstalling when you want to remove its pairing.
EspDesktop does not send these local card data to an analytics service.

## Information you provide to the project

If you open a GitHub issue, pull request, or discussion, GitHub processes your
GitHub account information and the content you submit. Issue descriptions,
logs, screenshots, and configuration snippets may be public. Remove passwords,
tokens, Wi-Fi credentials, private URLs, and other sensitive information before
posting. Do not use a public issue to send a privacy request or other
confidential information.

## Retention and sharing

The project maintainer does not operate a database of EspDesktop users and
does not sell or rent personal information. Information submitted through
GitHub is retained and handled according to GitHub's policies and the
project's public repository settings. Information handled by Buy Me a Coffee,
GitHub Pages, or another service you choose is governed by
that service's policy and retention practices.

## Your choices and privacy requests

You can choose whether to use automatic firmware updates, visit external links, or submit
information to GitHub. To remove local device settings, use a full flash erase or another
verified factory-reset procedure that clears the device's storage. A normal
reset or firmware re-flash may preserve saved configuration, including entity
IDs and credentials saved by older firmware. This does not remove copies you
have made elsewhere.

For a question about this policy or a request concerning information directly
controlled by the project maintainer, contact [jtenniswood through GitHub](https://github.com/jtenniswood).
Please do not include private information in a public issue. Requests about
GitHub or another third-party service should be directed to
that service.

## Changes to this policy

This policy may be updated when EspDesktop's data practices or the services it
uses change. The effective date at the top of this page indicates when the
current version was published.
