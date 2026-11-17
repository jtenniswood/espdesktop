using EspDesktop.Windows;
using System.Text.Json;
using System.IO.MemoryMappedFiles;
using System.Text;

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

const int header = 112, fieldSize = 144, row = 2048, rowSize = 64;
using var fixture = MemoryMappedFile.CreateNew(null, 4096);
using var view = fixture.CreateViewAccessor();
var fields = new (string Name, int Type, int Offset)[]
{
    ("IsOnTrack", 1, 0), ("IsReplayPlaying", 1, 1), ("FuelLevel", 4, 4), ("Lap", 2, 8),
    ("LapDeltaToSessionBestLap", 4, 12), ("LapDeltaToSessionBestLap_OK", 1, 16),
    ("SessionNum", 2, 20), ("OnPitRoad", 1, 24), ("SessionFlags", 3, 28),
};

view.Write(0, 2);
view.Write(4, 1);
view.Write(24, fields.Length);
view.Write(28, header);
view.Write(32, 2);
view.Write(36, rowSize);
view.Write(48, 5);
view.Write(52, row);
view.Write(64, 4);
view.Write(68, row + rowSize);
for (var index = 0; index < fields.Length; index++)
{
    var entry = header + index * fieldSize;
    var field = fields[index];
    view.Write(entry, field.Type);
    view.Write(entry + 4, field.Offset);
    view.Write(entry + 8, 1);
    var name = Encoding.ASCII.GetBytes(field.Name);
    view.WriteArray(entry + 16, name, 0, name.Length);
}
view.Write(row, (byte)1);
view.Write(row + 4, 23.4F);
view.Write(row + 8, 4);
view.Write(row + 12, -0.42F);
view.Write(row + 16, (byte)1);
view.Write(row + 20, 2);
view.Write(row + 24, (byte)1);
view.Write(row + 28, 0x08);

var reader = new IracingTelemetryReader(view);
Check(reader.TryRead(out var first) && first is { FuelLitres: 23.4F, Lap: 4, OnPitRoad: true, Flag: "yellow", DeltaSeconds: null },
    "The newest buffer should supply live readings, and the first frame should withhold delta.");
Check(!reader.TryRead(out _), "An unchanged tick should not count as a new sample.");
view.Write(48, 6);
view.Write(row + 4, 0F);
view.Write(row + 28, 0x01);
Check(reader.TryRead(out var next) && next is { FuelLitres: 0F, DeltaSeconds: -0.42F, Flag: "checkered" },
    "The next frame should accept zero fuel and a valid signed delta.");
view.Write(48, 7);
view.Write(row + 20, 3);
Check(reader.TryRead(out var changed) && changed is { DeltaSeconds: null }, "A new session should reset the delta.");
view.Write(48, 8);
view.Write(row + 1, (byte)1);
Check(reader.TryRead(out var replay) && replay is null, "Replay should clear live readings.");
view.Write(48, 9);
view.Write(52, 4090);
Check(!reader.TryRead(out _), "A buffer outside shared memory must be rejected.");
view.Write(4, 0);
Check(!reader.Connected, "The reader should recognise a stopped session.");
Console.WriteLine("Synthetic iRacing shared-memory telemetry passed.");
