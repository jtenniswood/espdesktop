# EspDesktop Linux companion

A Linux/KDE companion for the 4-inch Guition 4848S040 EspDesktop display. It
speaks the same Companion protocol v4 as the macOS app, so the display treats it
as its paired desktop.

Tested on KDE Plasma 6 with Wayland using PyQt6 and Python 3.14.

## What works

- Pairing with the display's four-character code and a pinned TLS certificate
- Applications discovered from freedesktop `.desktop` files, with an approval list
- Launching approved applications
- Switching to an already-open application window through KWin scripting, with
  an option to always launch a new copy instead
- Opening approved folders and `http(s)` websites
- Locking the KDE session from the display's Lock card
- Application icons sent in the display's `rgb565a8` format
- Automatic reconnect and session-lock tracking
- Home Assistant actions as display cards: scripts, scenes, lights, switches,
  fans, covers, buttons, automations, media players and vacuums
- Enabling the display's native ESPHome button API so Home Assistant can press
  the display's own cards

## Not in this first version

- Keyboard shortcut cards. KDE Wayland has no built-in synthetic key input; this
  needs an optional `ydotool`/`kdotool` path and a foreground-app check.
- Active-application highlighting and automatic app subpages. KWin exposes
  window information but not a supported active-window D-Bus property.
- Full Home Assistant dashboards. EspDesktop firmware retires HA entity cards;
  use EspControl firmware for a native HA dashboard.
- OBS Studio and Apple Shortcuts. Apple Shortcuts do not exist on Linux.

## Requirements

- KDE Plasma 6 (Plasma 5 may work; it is not tested)
- PyQt6 with QtNetwork (`python3-pyqt6` on Ubuntu/Debian)
- KWin scripting, built into KDE Plasma 6, for switching to an existing window
- `loginctl` for session lock state and locking
- `timedatectl` for the timezone sent to the display

QtWebSockets is not required; the companion includes a small RFC 6455 client.

## Run from a checkout

```sh
python3 linux/run.py
```

The first window lets you:

1. Enter the display's address, for example `192.168.0.50` or
   `espdesktop-panel.local`.
2. Select **Get code from display**. This opens the display's Companion pairing
   window and fills in the code. You can also use **Open pairing page** and read
   the code from the touchscreen.
3. Select **Pair**.
4. Tick the applications the display may launch. Folders are added separately.
   **Switch to an open app instead of launching a new copy** is enabled by
   default; disable it if every app card should start another instance. The
   switch uses KWin scripting to focus the matching existing window, and falls
   back to launching the app when no window is found.

The tray icon keeps the companion running when the settings window is closed.
Enable **Start EspDesktop Companion when I sign in** to add a KDE autostart
entry. The entry points at the checkout that enabled it, so move or reinstall
the checkout before relying on it.

Running `python3 linux/run.py` again shows the existing settings window instead
of starting a second process. After updating the checkout, restart the running
build with:

```sh
python3 linux/run.py --background --replace
```

The new process asks the old one to quit and waits for its single-instance lock
before connecting to the display.

## Build release artifacts

Build a Debian package and a portable executable under `dist/linux`:

```sh
python3 -I linux/Packaging/build_linux_release.py --version 1.6.0
```

The `.deb` is architecture-independent and installs a launcher, desktop entry,
icon and the Python package. It depends on the distribution's `python3-pyqt6`;
install it with:

```sh
sudo apt install ./dist/linux/espdesktop-companion_1.6.0_all.deb
espdesktop-companion
```

The standalone `EspDesktop-Companion-<version>-linux-x86_64` executable bundles
Python and PyQt6 so it can run without the system packages. It is built in a
pinned Debian bookworm container and therefore needs Docker on the build
machine. Pass `--skip-deb` or `--skip-standalone` to build only one artifact.
Both artifacts can be attached to a release.


## Home Assistant

### Run HA actions from the display

1. In Home Assistant, open **Profile → Security → Long-lived access tokens** and
   create a token for the companion.
2. In the companion's **Home Assistant actions** section, enter the HA address
   (for example `http://192.168.0.10:8123`) and the token, then choose
   **Save and load entities**. The token is stored in the companion config with
   mode `0600`.
3. Tick the scripts, scenes, lights, switches and other actions the display may
   run. They appear in the display editor as `HA · <name>` cards.

The display sends an action ID; the companion calls the matching HA service
locally. Card labels are created from the entity name when the card is added, so
they do not update with live entity state. This uses the display's normal
Applications card, not a Home Assistant dashboard card.

### Press display cards from Home Assistant

This firmware uses Home Assistant's native ESPHome button entities:

1. Choose **Set up Home Assistant** in the companion. It enables the display's
   ESPHome API; the display restarts and the companion reconnects. You can do the
   same from the display editor under **System → Connectors → Home Assistant**.
2. In Home Assistant, open **Settings → Devices & services → Add integration**
   and choose **ESPHome**. Pick the discovered display or enter its address.
3. The display's saved cards appear as button entities on the ESPHome device
   page. Use **Button: Press** in an automation, or add the button to a
   dashboard. Cards with information only have no button.

The repository's older `custom_components/espdesktop` integration targets
firmware that exposes the legacy `/home-assistant/v1` pairing API. Current
native-button firmware exposes ESPHome entities instead, so use the built-in
ESPHome integration.

## Test

Unit tests cover the protocol fixture, endpoint handling, desktop-file parsing,
configuration and pairing storage:

```sh
PYTHONPATH=linux python3 -m unittest discover -s linux/tests -v
```

The live test pairs with a real display, authenticates, sends the catalogue and
can launch an approved application:

```sh
python3 linux/tests/live_test.py --address 192.168.0.50 --launch-app Dolphin
python3 linux/tests/live_test.py --address 192.168.0.50 --use-saved
```

The live test stores the pairing in `~/.config/espdesktop-companion/config.json`
with mode `0600`. Only run it on a trusted local network.

The KWin activation probe switches to an open application and verifies the
KWin callback:

```sh
PYTHONPATH=linux python3 linux/tests/test_kwin_activation.py --target org.kde.dolphin --target dolphin
```

## Security model

- Pairing uses the display's web-authorized pairing window and a temporary code.
- The TLS certificate fingerprint is trusted on first pairing and pinned for
  later connections.
- The saved credential is an HMAC key; it is stored only in the user's config
  file with mode `0600`.
- Only approved applications and folders are sent to the display.
- Display addresses must resolve to a private, loopback or link-local address.
- Website cards accept only `http://` and `https://` URLs without credentials or
  control characters.

## Layout

```text
linux/
  run.py                         Checkout launcher
  espdesktop_companion/
    app.py                       QApplication, single-instance lock, flags
    client.py                    Pairing, authentication, session, icons
    protocol.py                  Protocol 4 contract and validation
    websocket.py                 Minimal TLS WebSocket client
    catalogue.py                 .desktop discovery and launching
    actions.py                   URL, folder, app and lock actions
    kwin.py                      KWin scripting window activation
    icons.py                     rgb565a8 icon rendering
    config.py                    Pairing and approval storage
    session.py                   KDE lock and timezone helpers
    ui.py                        Settings window and tray icon
  tests/
    test_protocol.py             Contract fixture and endpoint tests
    test_catalogue.py            Desktop-file and catalogue tests
    test_config.py               Pairing and storage tests
    test_actions.py              Switch-to-open vs launch behavior
    test_ha.py                   Mock Home Assistant tests
    test_kwin_activation.py      Live KWin activation probe
    live_test.py                 Real-display end-to-end test
```
