# EspDesktop for Windows

Control a Windows 11 PC from the Guition 4848S040 EspDesktop display. The app uses standard Windows controls, follows your Windows theme, and stays in the notification area when you close Settings.

## Install a preview

1. Open the **Windows EspDesktop** run on the Windows companion pull request.
2. Download the **espdesktop-windows-x64-installer** artifact for an Intel or AMD PC, or **espdesktop-windows-arm64-installer** for a Windows on Arm PC. If unsure, check **Settings → System → About → System type** on the PC.
3. Unzip the artifact and run its setup file. The preview is unsigned and Windows may ask you to confirm that you trust the file. Install only the artifact from this repository’s Actions run.
4. Open **EspDesktop** from Start. You can remove it later from **Settings → Apps → Installed apps**.

Setup installs for the current user and includes the .NET runtime. It does not need administrator access. Settings and pairing are retained across reinstalls.

## Pair and control Windows

Keep the PC and display on the same local network. In **Display**, select a nearby display or enter its address. Choose **Open pairing page**, read the code, and enter it in the Windows app. You can also press and hold the Wi-Fi icon on the display for a code. If the display is paired to a different computer, reset its Companion pairing first. The display pairs with one computer at a time.

Existing S3 firmware calls the connector **Mac Companion**. Use that connector for Windows too. In the display’s web editor you can:

- Add **Applications** cards for approved Start menu apps, with icons and active app highlighting. Shortcut presets are included for common browsers, VS Code, Cursor, Office, Notepad, Slack, Discord, Spotify, and GitHub Desktop where the app can identify them. You can create a custom shortcut for any approved app.
- If Windows keeps another app in front, use the flashing taskbar button to switch to the requested app. Shortcut pages require the matching app to be in the foreground.
- Add **Folder** cards for folders you approve in Windows. File Explorer uses the firmware’s existing Finder slot, so its app subpage can also show approved folders. Folder paths stay on the PC.
- Add **Website** cards. Links use your default browser; new windows and active site highlighting work with supported browsers. Highlighting depends on the browser exposing its address bar to Windows accessibility. Some browser versions, languages, and installed web apps may not expose it.
- Add **Key Shortcut** or **Mac Lock** cards. Enable **Allow keyboard shortcuts and screen lock** in the Windows app first. The editor’s Command and Control choices both map to Windows Ctrl; Option maps to Alt. Shortcuts go to an approved app in front and Windows protects apps running as administrator. The existing Mac Lock card locks Windows.
- Add statistics, speaker and microphone volume, or mute controls. Setting a volume above zero unmutes that device. The display receives basic system readings while paired. Actions are blocked while Windows is locked.

Use **Start EspDesktop when I sign in** to keep the display connected after login. To stop the app, choose **Quit EspDesktop** from its notification area icon.

The Display page shows the paired display’s name when available and its current address. If the display gets a new address on your local network, EspDesktop can rediscover it and resume the saved pairing. A new address is saved only after the display proves its identity and accepts the pairing. If you reset or replace the display, forget it in EspDesktop and pair again.

## Build and check

Use the .NET 10 SDK and Inno Setup 6.3 or newer on Windows. From the repository root:

```powershell
dotnet run -c Release --project windows/EspDesktop.Tests
dotnet run -c Release --project windows/EspDesktop
./windows/EspDesktop/Packaging/Build-Installer.ps1 -Architecture x64
```

The workflow builds installers for x64 and Arm64 and installs, opens, and uninstalls each build on Windows. The test project checks the same protocol fixtures as firmware and macOS, and pairs with a simulated display over TLS. Use a Windows 11 PC and a physical 4848S040 for discovery, actual pairing, app and folder focus, browser behavior, shortcuts, volume, lock and reconnect testing.

The preview checks for Windows releases and opens their download page. In-app installation requires an Authenticode-signed Windows build and a trusted installer signed with the same publisher key. To prepare signed release assets from the release checkout, pass the matching stable version, architecture, and code signing certificate thumbprint to the packaging script on a Windows signing machine. Upload both setup executables to the matching stable release after device testing. This branch does not publish a release.
