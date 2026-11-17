using EspDesktop.Windows;
using System.Text.Json;

static void Check(bool value, string message)
{
    if (!value)
        throw new InvalidOperationException(message);
}

using var profileStream = typeof(CompanionClient).Assembly.GetManifestResourceStream("EspDesktop.Windows.iracing.json")!;
using var profile = JsonDocument.Parse(profileStream);
var shortcuts = profile.RootElement.GetProperty("shortcuts").EnumerateArray().ToArray();
ushort[] expected = [0x70, 0x71, 0x72, 0x73, 0x76, 0x77];
Check(shortcuts.Length == expected.Length, "The starter page should contain six shortcuts.");
for (var index = 0; index < expected.Length; index++)
{
    var action = "shortcut." + shortcuts[index].GetProperty("shortcut").GetString();
    Check(SimulatorInput.TryGetKeys(action, out var keys) && keys.SequenceEqual(new[] { expected[index] }),
        $"The preset {action} should send the corresponding function key.");
}

Check(SimulatorInput.TryGetKeys("shortcut.scoped.control+shift+keypad2", out var custom) &&
      custom.SequenceEqual(new ushort[] { 0x10, 0x11, 0x62 }), "A remapped binding should preserve modifiers and keypad keys.");
foreach (var invalid in new[] { "shortcut.f3", "shortcut.scoped.f3~f4", "shortcut.scoped.option+f4",
                               "shortcut.scoped.command+f4", "shortcut.scoped.shift+shift+f4" })
    Check(!SimulatorInput.TryGetKeys(invalid, out _), $"Unexpectedly accepted {invalid}.");

Check(CompanionClient.GetEndpoint("192.168.1.20").AbsoluteUri == "wss://192.168.1.20:8443/companion/v4",
    "A local address should use the standard secure Companion endpoint.");
Check(CompanionClient.GetEndpoint("panel.local:9443").Port == 9443, "A custom local port should be preserved.");
foreach (var invalid in new[] { "example.org", "8.8.8.8", "panel.local@10.0.0.5", "10.0.0.5/path" })
{
    try
    {
        CompanionClient.GetEndpoint(invalid);
        throw new InvalidOperationException($"Unexpectedly accepted {invalid}.");
    }
    catch (PairingException) { }
}

Console.WriteLine("iRacing profile, shortcuts and local endpoints passed.");
