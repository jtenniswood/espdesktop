# EspDesktop for Windows

Control a Windows 11 PC from the Guition 4848S040 EspDesktop display. The app uses standard Windows controls, follows your Windows theme, and stays in the notification area when you close Settings.

## Install a preview

1. Open the **Windows EspDesktop** run on the Windows companion pull request.
2. Download the **espdesktop-windows-x64-installer** artifact for an Intel or AMD PC, or **espdesktop-windows-arm64-installer** for a Windows on Arm PC. If unsure, check **Settings → System → About → System type** on the PC.
3. Unzip the artifact and run its setup file. The preview is unsigned and Windows may ask you to confirm that you trust the file. Install only the artifact from this repository’s Actions run.
4. Open **EspDesktop** from Start. You can remove it later from **Settings → Apps → Installed apps**.

Setup installs for the current user and includes the .NET runtime. It does not need administrator access. Settings and pairing are retained across reinstalls.

## Pair and control Windows

Keep the PC and display on the same local network. In **Display**, select a nearby display or choose **Enter address manually**, then choose **Next**. Choose **Open pairing page** or press and hold the display’s Wi-Fi icon to get a code. Enter the code and choose **Pair display**. If the display is paired to a different computer, reset its Companion pairing first.

Choose **Add display** to connect another display to the same PC. Each display can connect to one computer at a time. Use the individual display cards to connect, disconnect, forget, or open the editor for that display. Windows app and folder approvals are shared across all your paired displays.

In the display editor, open **Connectors → Mac Companion** to check pairing with your Windows PC. You can add these controls:

- Add **Applications** cards for approved Start menu apps, with icons and active app highlighting. Shortcut presets are included for common browsers, VS Code, Cursor, Office, Notepad, Slack, Discord, Spotify, and GitHub Desktop where the app can identify them. You can create a custom shortcut for any approved app.
- Choose when an app’s shortcut subpage opens under **Screen → Appearance → App Subpages**. Shortcut pages require the matching app to be in the foreground. If Windows keeps another app in front, use the flashing taskbar button to switch to the requested app.
- Add **Folder** cards for folders you approve in Windows. File Explorer uses the firmware’s existing Finder slot, so its app subpage can also show approved folders. If a folder moves, use **Choose again** in Folders to point existing cards at its new location and keep the folder name. Folder paths stay on the PC.
- Add **Website** cards. Links use your default browser; new windows and active site highlighting work with supported browsers. Highlighting depends on the browser exposing its address bar to Windows accessibility. Some browser versions, languages, and installed web apps may not expose it.
- Add **Keyboard Shortcut** or **Lock Machine** cards. Enable **Allow keyboard shortcuts and screen lock** in the Windows app first. The editor’s Command and Control choices both map to Windows Ctrl. Option maps to Alt. Shortcuts go to an approved app in front and Windows protects apps running as administrator.
- Add statistics, speaker and microphone volume, or mute controls. Setting a volume above zero unmutes that device. The display receives basic system readings while paired. Actions are blocked while Windows is locked.

Use **Start EspDesktop when I sign in** to keep the display connected after login. To stop the app, choose **Quit EspDesktop** from its notification area icon.

The Display page shows the paired display’s name when available and its current address. If the display gets a new address on your local network, EspDesktop can rediscover it and resume the saved pairing. A new address is saved only after the display proves its identity and accepts the pairing. If you reset or replace the display, forget it in EspDesktop and pair again.

If **Display** says it needs a newer version of EspDesktop for Windows, get the latest Windows installer from [GitHub Releases](https://github.com/jtenniswood/espdesktop/releases). EspDesktop keeps your pairing for the updated app.

## Build and check

Use the .NET 10 SDK and Inno Setup 6.3 or newer on Windows. From the repository root:

```powershell
dotnet run -c Release --project windows/EspDesktop.Tests
dotnet run -c Release --project windows/EspDesktop
./windows/EspDesktop/Packaging/Build-Installer.ps1 -Architecture x64
```

The workflow builds installers for x64 and Arm64 and installs, opens, and uninstalls each build on Windows. The test project checks the same protocol fixtures as firmware and macOS, and pairs with a simulated display over TLS. Use a Windows 11 PC and a physical 4848S040 for discovery, actual pairing, app and folder focus, browser behavior, shortcuts, volume, lock and reconnect testing.

The preview checks for newer stable Windows releases for your PC’s architecture and display protocol and opens their download page. Firmware-only releases do not affect the Windows update check. In-app installation requires an Authenticode-signed Windows build and a trusted installer signed with the same publisher key.

### Generate a signed Windows installer

On the Windows build PC, install SignTool from the Windows SDK and make the publisher’s Windows code-signing certificate and private key available in **Current User → Personal**. Find the certificate’s thumbprint:

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object Subject, Thumbprint, NotAfter
```

Save the chosen thumbprint once for your Windows account, then open a new PowerShell window:

```powershell
[Environment]::SetEnvironmentVariable('ESPDESKTOP_WINDOWS_SIGNING_THUMBPRINT', '<thumbprint>', 'User')
```

The existing installer command now uses that publisher automatically. Add `-RequireSigning` for release builds so a missing certificate stops the build. You can also pass `-SigningThumbprint` to select a certificate for a single build.

```powershell
./windows/EspDesktop/Packaging/Build-Installer.ps1 -Architecture x64 -Version 0.1.0 -RequireSigning
./windows/EspDesktop/Packaging/Build-Installer.ps1 -Architecture arm64 -Version 0.1.0 -RequireSigning
```

The build signs and timestamps the app, setup executable and uninstaller. Use the matching stable version when preparing release assets.
