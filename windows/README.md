# EspDesktop for iRacing

The Windows test app pairs a Guition 4848S040 running the matching EspDesktop firmware with the PC running iRacing. The app stays in the Windows notification area when its window is closed.

## Set up the panel

1. Install the matching firmware and connect the display and racing PC to the same local network.
2. Download **EspDesktop-iRacing-Windows-x64** from the **Windows EspDesktop** workflow on the test PR. Extract the archive and open **EspDesktop.Windows.exe**.
3. Open the display’s browser editor. Under **System → Mac Companion**, get the temporary pairing code. If the display is already paired to another computer, reset that pairing first.
4. Enter the display’s private IPv4 address or `.local` hostname and the temporary code in the Windows app. Select **Pair display**.
5. Add a **Companion** card in **Application** mode and select **iRacing**. Enable **Add app subpage** and save. Open the subpage from the touchscreen for the six default controls.

To change a binding, first set it in iRacing. Then edit the corresponding EspDesktop shortcut and choose **Custom**. To restore its original key, choose **Application** again. You can also rename or move cards in the editor.

## Test the shortcuts

With iRacing Test Drive in front, tap **Relative** and check that the Relative panel appears. Repeat for Lap Timing, Standings, Fuel, Pit Adjustments and In-Car Adjustments. Try a custom binding with the wheel connected. When another window is in front, the shortcut stays unavailable.

If the app cannot connect, check the display’s address and Wi-Fi. To move the panel back to another computer, forget the pairing in the Windows app and reset pairing on the display.

## Developer checks

Run `dotnet run --project windows/EspDesktop.Tests` to check the starter profile and key mappings. Use `dotnet build windows/EspDesktop` for the app. Key delivery and display pairing require a physical Windows rig and touchscreen.
