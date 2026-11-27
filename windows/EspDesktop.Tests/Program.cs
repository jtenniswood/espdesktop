using EspDesktop.Tests;
using System.Buffers.Binary;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using EspDesktop;
using EspDesktop.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using static EspDesktop.Core.Protocol;
#if WINDOWS
using System.Diagnostics;
using System.Windows.Automation;
#endif

static void Check(bool condition, string label)
{
    if (!condition) throw new InvalidOperationException("Failed: " + label);
}

if (args is ["--verify-windows-signatures", var app, var installer, var uninstaller,
    var unsigned, var otherPublisher, var modified])
{
    Check(OperatingSystem.IsWindows(), "signature checks require Windows");
    Check(Authenticode.MatchesPublisher(app, installer), "accept the app publisher's installer");
    Check(Authenticode.MatchesPublisher(app, uninstaller), "verify the installed uninstaller");
    Check(Authenticode.PublisherKey(otherPublisher) is not null, "other publisher is independently trusted");
    Check(!Authenticode.MatchesPublisher(app, otherPublisher), "reject a different trusted publisher");
    Check(!Authenticode.MatchesPublisher(app, unsigned), "reject an unsigned installer");
    Check(!Authenticode.MatchesPublisher(app, modified), "reject a changed installer");
    Console.WriteLine("Passed Windows installer publisher and signature checks.");
    return;
}

#if WINDOWS
if (args is ["--verify-windows-signed-upgrade", var installedApp, var upgrade, var expectedVersion])
{
    Check(Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") == "github-hosted",
        "run signed upgrades on a disposable GitHub-hosted Windows runner");
    var assembly = Path.ChangeExtension(installedApp, ".dll");
    var previous = System.Reflection.AssemblyName.GetAssemblyName(assembly).Version;
    var expected = System.Version.Parse(expectedVersion);
    Check(previous is not null && previous < expected, "test a newer Windows release");
    using var updater = Updates.StartInstaller(upgrade, installedApp, quiet: true);
    if (!updater.WaitForExit(90000))
    {
        updater.Kill();
        throw new TimeoutException("The signed update did not finish.");
    }
    Check(updater.ExitCode == 0, $"signed upgrade exit code {updater.ExitCode}");
    Check(System.Reflection.AssemblyName.GetAssemblyName(assembly).Version == expected,
        "upgrade the existing install directory to the new version");
    Check(Authenticode.MatchesPublisher(installedApp, upgrade), "the upgraded app is signed by the same publisher");
    VerifyInstallerProfile("verify");
    Console.WriteLine("Passed a signed in-app Windows upgrade with the existing install directory, pairing, and approvals preserved.");
    return;
}
if (await WindowsAppActions.TryRunTarget(args)) return;
if (args is ["--verify-windows-setup"])
{
    await NativeWindowsDesktop.VerifyDiscoveryRefresh();
    return;
}
if (args is ["--installer-profile", var profileMode])
{
    VerifyInstallerProfile(profileMode);
    return;
}
VerifyLocalStore();
VerifyAudioLevelPolicy();
var exerciseDesktopActions = args is ["--verify-native-windows", "--exercise-desktop-actions"];
var verifyWindowsLock = args is ["--verify-windows-lock"];
if (verifyWindowsLock && Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted")
    throw new InvalidOperationException("Run the workstation lock check on a disposable GitHub-hosted Windows runner.");
using var native = args is ["--verify-native-windows"] || exerciseDesktopActions
    ? await NativeWindowsDesktop.Prepare(exerciseDesktopActions)
    : null;
var windowsBackend = verifyWindowsLock
    ? new WindowsDesktop(new LocalSettings
    {
        Shortcuts = true,
        Folders = [new("folder.lock-test", Path.GetTempPath())]
    })
    : native?.Desktop;
#else
const bool exerciseDesktopActions = false;
#endif

using (var stream = typeof(FakeDesktop).Assembly.GetManifestResourceStream("ProtocolFixtures.json")!)
using (var fixtures = JsonDocument.Parse(stream))
{
    foreach (var test in fixtures.RootElement.EnumerateArray())
        Check(Valid(test.GetProperty("message"), Text(test, "direction"), Text(test, "state")) ==
              test.GetProperty("valid").GetBoolean(), Text(test, "name"));
    Console.WriteLine($"Passed {fixtures.RootElement.GetArrayLength()} shared protocol fixtures.");
}

CoughChecks.Run(Check);

Check(DisplayEndpoint.Parse("192.168.1.2").Socket.AbsoluteUri == "wss://192.168.1.2:8443/companion/v4", "default display port");
var panelEndpoint = DisplayEndpoint.Parse("https://panel.local:9443/path?tab=device#fragment");
Check(panelEndpoint.Settings?.AbsoluteUri == "https://panel.local/", "open the display editor");
Check(panelEndpoint.PairingPage?.AbsoluteUri ==
      "https://panel.local/?tab=connectors&connector=mac_companion", "open the display pairing page");
Check(DisplayEndpoint.Parse("[fd00::1]:9000").PairingPage?.AbsoluteUri ==
      "http://[fd00::1]/?tab=connectors&connector=mac_companion", "open the IPv6 display pairing page");
Check(DisplayEndpoint.Parse("[fd00::1]:9000").Socket.Port == 9000, "IPv6 display port");
foreach (var invalid in new[] { "example.com", "172.32.0.1", "8.8.8.8", "http://a@panel.local", "file://panel.local", "0.0.0.0", "usb:COM0", "usb:COM5/path", "usb:COM5:9600" })
{
    try { _ = DisplayEndpoint.Parse(invalid); throw new InvalidOperationException("Unexpected display endpoint: " + invalid); }
    catch (ArgumentException) { }
}
var usbEndpoint = DisplayEndpoint.Parse("usb:com12");
Check(usbEndpoint is { UsbPort: "COM12", Label: "USB (COM12)", Settings: null, PairingPage: null },
    "use a Windows serial port for USB and keep the editor URL unavailable");
await VerifyUsbFrames();
await UsbEditorChecks.Run();

Check(SafeActions.WebUrl("https%3A%2F%2Fexample.org")?.Host == "example.org", "valid URL");
foreach (var bad in new[] { "file:///C:/Windows", "https://a:b@example.org", "ms-settings:windowsupdate", "https:%5c%5cexample.com", "https://example.org/%0a" })
    Check(SafeActions.WebUrl(bad) is null, "refuse unsafe URL");
Check(SafeActions.Shortcut("shortcut.command+shift+t")?.SequenceEqual(new ushort[] { 0x11, 0x10, 0x54 }) == true, "map Command to Ctrl");
Check(SafeActions.Shortcut("shortcut.scoped.control+t")?.SequenceEqual(new ushort[] { 0x11, 0x54 }) == true,
    "parse the display's app-scoped shortcut");
Check(SafeActions.ShortcutStrokes("shortcut.scoped.control+k~control+s") is { Length: 2 },
    "accept app-scoped sequences");
Check(SafeActions.ShortcutStrokes("shortcut.control+k~control+s") is null &&
      SafeActions.ShortcutStrokes("shortcut.scoped.control+k~option+tab") is null &&
      SafeActions.ShortcutStrokes("shortcut.scoped.a~b~c~d") is null,
    "reject unscoped sequences, system strokes and overlong sequences");
Check(SafeActions.Shortcut("shortcut.scoped.option+tab") is null, "block scoped system window switching");
Check(SafeActions.Shortcut("shortcut.option+f4") is null, "block system window close");
Check(SafeActions.Shortcut("shortcut.control+escape") is null, "block Start menu");
Check(SafeActions.Shortcut("shortcut.command+escape") is null, "block Start menu through the Command alias");
Check(SafeActions.Shortcut("shortcut.control+shift+escape") is null, "block task manager");
Check(SafeActions.Shortcut("shortcut.command+keycomma") is not null, "match panel punctuation IDs");
Check(SafeActions.Shortcut("shortcut.command+calc.exe") is null, "no command paths as shortcuts");

foreach (var (executable, target, firstKey) in new (string?, string, string)[]
{
    (@"C:\Apps\SLACK.EXE", "Slack", "control+n"),
    (@"C:\Apps\Discord.exe", "Discord", "control+k"),
    (@"C:\Apps\Spotify.exe", "Spotify", "control+k"),
    (@"C:\Apps\GitHubDesktop.exe", "GitHubDesktop", "control+t"),
    (@"C:\Apps\GIMP 3\bin\gimp-3.exe", "GIMP 3", "control+o"),
    (@"C:\Apps\ChatGPT.exe", "ChatGPT", "control+n"),
    (null, "OpenAI.Codex_2p2nqsd0c76g0!App", "control+n"),
    (null, "Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!App", "control+t"),
    (null, "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App", "control+n")
})
{
    var presets = WindowsPresets.For(executable, target)?.Shortcuts ?? [];
    Check(presets.Length > 0 && presets[0].Id == "0" && presets[0].Shortcut == firstKey, $"preset IDs and shortcut bindings for {target}");
    Check(presets.All(preset => SafeActions.ShortcutStrokes("shortcut." + preset.DisplayShortcut) is not null),
        $"Windows can replay each shortcut for {target}");
}
Check(WindowsPresets.For(null, "MSEdge._pin_example") is null,
    "a pinned website does not inherit Edge browser presets");
Check(WindowsPresets.For(@"C:\Apps\codex.exe", "Codex CLI") is null,
    "the Codex command-line executable does not inherit ChatGPT Desktop presets");
Console.WriteLine("Passed Windows application shortcut preset checks.");
Check(WindowsPresets.For(@"C:\Apps\Code.exe", "Visual Studio Code")?.Shortcuts.Any(preset =>
          preset.DisplayShortcut == "scoped.control+k~control+s") == true,
    "the VS Code two-stroke shortcut can travel through the editor");
Check(WindowsPresets.For(@"C:\Apps\vlc.exe", "VLC")?.Shortcuts.Any(preset =>
          preset.DisplayShortcut == "scoped.space") == true,
    "single-key shortcuts travel in app-scoped form");
var racingTemplate = WindowsPresets.For(@"D:\Games\iRacing\UI\iRacingUI.exe", "iRacing")!;
var racingPresets = racingTemplate.Shortcuts;
Check(racingTemplate.DefaultShortcutIds?.SequenceEqual(["0", "1", "2", "3", "4", "5"]) == true &&
    racingPresets.Take(6).Select(preset => preset.DisplayShortcut)
        .SequenceEqual(["scoped.f1", "scoped.f2", "scoped.f3", "scoped.f4", "scoped.f7", "scoped.f8"]),
    "iRacing keeps its six app-scoped starter presets");
Check(racingPresets.Length == 131 && racingPresets.All(preset =>
        SafeActions.ShortcutStrokes("shortcut." + preset.DisplayShortcut) is not null),
    "Windows can replay every iRacing driving, replay and camera editor preset");
Check(racingPresets.GroupBy(preset => preset.Group).Select(group => (group.Key, group.Count()))
        .SequenceEqual(new (string?, int)[] { ("General / In-Car", 43), ("Replay Controls", 28), ("Camera Editor", 60) }),
    "every iRacing preset belongs to one of the three picker groups");
Check(racingPresets.Any(preset => preset.DisplayShortcut == "scoped.control+keypad6") &&
      racingPresets.Any(preset => preset.DisplayShortcut == "scoped.control+shift+insert") &&
      SafeActions.Shortcut("shortcut.scoped.keypaddecimal")?.SequenceEqual(new ushort[] { 0x6e }) == true,
    "replay numpad and camera editor keys use app-scoped Windows key codes");
var racingInstall = WindowsPresets.IRacingInstallDirectory(@"D:\Games\iRacing\UI\iRacingUI.exe")!;
Check(racingInstall == WindowsPresets.IRacingInstallDirectory(@"D:\Games\iRacing\iRacingLauncher64.exe") &&
      WindowsPresets.IsIRacingSimulator(racingInstall, @"d:\games\iracing\iRacingSim64DX11.exe") &&
      WindowsPresets.IsIRacingSimulator(racingInstall, @"D:\Games\iRacing\iRacingSim64DX12.exe") &&
      !WindowsPresets.IsIRacingSimulator(racingInstall, @"D:\Games\iRacing\UI\iRacingUI.exe") &&
      !WindowsPresets.IsIRacingSimulator(racingInstall, @"C:\Other\iRacingSim64DX11.exe"),
    "recognize only simulator windows belonging to the approved iRacing installation");
Check(SafeActions.Shortcut("shortcut.scoped.shift+keypad2")?.SequenceEqual(new ushort[] { 0x10, 0x62 }) == true &&
      SafeActions.Shortcut("shortcut.shift+keypad2") is null, "number-pad bindings must be app-scoped");
Check(Bound("🙂🙂a", 7) == "🙂", "truncate at UTF-8 boundary");
using (var duplicate = JsonDocument.Parse("""{"type":"catalogue.request","type":"hello","protocol":4}"""))
    Check(!Valid(duplicate.RootElement, "panel_to_mac", "connected"), "reject ambiguous envelopes");

Check(Discovery.ParsePackets([0, 0, 0x84, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0xc0, 12], [0]).Length == 0, "reject malformed DNS compression");
var discovered = Discovery.ParsePackets(DiscoveryResponse());
Check(discovered is [{ Address: "192.168.1.20:8443", Name: "Desk display" }], "discover by PTR, SRV, TXT and A");
Check(Discovery.FriendlyName("\0 Desk\u202e display\n ") == "Desk display", "clean a display name before showing it");
Console.WriteLine("Passed local address, action policy and discovery tests.");

await VerifyWindowsReleaseSelection();

using var certificate = TestCertificate();
using var lifetime = new CancellationTokenSource(TimeSpan.FromSeconds(exerciseDesktopActions ? 100 : 25));
var builder = WebApplication.CreateSlimBuilder();
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole();
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.ConfigureKestrel(k =>
{
    k.Listen(IPAddress.Loopback, 0, o => o.UseHttps(certificate));
    k.Listen(IPAddress.Loopback, 0);
});
await using var server = builder.Build();
server.UseWebSockets();
var pairingPromptState = "paired";
server.MapGet("/companion/pairing", IResult (HttpContext context) =>
{
    Check(context.Request.Query["show_on_display"] == "1", "request the pairing prompt on the touchscreen");
    return pairingPromptState switch
    {
        "paired" => Results.Json(new { available = true, active = false, paired = true }),
        "unpaired" => Results.Json(new { available = true, active = true, paired = false }),
        _ => Results.NotFound()
    };
});
#if WINDOWS
var browserPages = new[] { "first", "second", "third" }.Select(name => new BrowserTestPage(name)).ToArray();
if (exerciseDesktopActions)
    foreach (var page in browserPages)
        server.MapGet(page.Path, page.Visit);
#endif
var secret = RandomNumberGenerator.GetBytes(32);
var checks = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var reconnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
var authorizedRequests = 0;
var authenticated = 0;
var rejectedSequence = 0;
using var pairingResetReady = new SemaphoreSlim(0);
var desktop = new FakeDesktop();
server.Map(SocketPath, async context =>
{
    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    try
    {
        await Send(socket, "hello");
        var first = await Receive(socket);
        if (Text(first, "type") == "pair.request")
        {
            Check(Text(first, "code") == "ABCD-EFGH", "pairing code");
            await Send(socket, "pair.accepted", ("credential", Convert.ToHexStringLower(secret)));
            return;
        }
        Check(Valid(first, "mac_to_panel", "authenticating"), "valid authentication");
        var seq = UInt(first, "sequence");
        Check(Text(first, "signature") == Sign(secret, seq, Text(first, "nonce")), "auth HMAC");
        Interlocked.Increment(ref authenticated);
        if (seq == 1)
        {
            Interlocked.Increment(ref rejectedSequence);
            await Send(socket, "error", ("code", "authentication_sequence"), ("lastSequence", 7));
            return;
        }
        if (seq is 9 or 10)
        {
            await Send(socket, "auth.accepted", ("capabilityVersion", 7));
            await FindMessage(socket, "catalogue.page", m => m.GetProperty("items")[0].GetProperty("id").GetString() == "windows.test");
            await Send(socket, "value.set", ("controlId", CoughId), ("value", 100), ("requestId", "legacy-cough"));
            await FindMessage(socket, "action.result", m => Text(m, "requestId") == "legacy-cough" && Text(m, "status") == "not_allowed");
            if (seq == 10) reconnected.TrySetResult();
            await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "test disconnect", lifetime.Token);
            return;
        }
        if (seq == 11)
        {
            await Send(socket, "error", ("code", "mac_update_required"));
            return;
        }
        if (seq is >= 12 and <= 14)
        {
            await Send(socket, "auth.accepted", ("capabilityVersion", seq == 14 ? 7 : 8));
            await FindMessage(socket, "system_metrics", _ => true);
            pairingResetReady.Release();
            if (seq != 14)
            {
                await FindMessage(socket, "pair.reset", m => Valid(m, "mac_to_panel", "connected"));
                await Send(socket, "error", ("code", seq == 12 ? "pairing_reset" : "pairing_reset_failed"));
            }
            // Keep the connection open for the client to process the reply. It
            // can still have catalogue or metrics frames queued after the reset.
            var buffer = new byte[16384];
            while ((await socket.ReceiveAsync(buffer.AsMemory(), context.RequestAborted)).MessageType != WebSocketMessageType.Close) { }
            return;
        }
        Check(seq == 8, "repair stale authentication sequence");
        await Send(socket, "auth.accepted", ("capabilityVersion", 24));
#if WINDOWS
        if (windowsBackend is not null)
        {
            if (native is not null) await VerifyNativeDesktop(socket, native);
            else await VerifyWindowsLock(socket);
            checks.TrySetResult();
            await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "done", lifetime.Token);
            return;
        }
#endif
        var capabilities = await FindMessage(socket, "capabilities", _ => true);
        var supported = capabilities.GetProperty("values").EnumerateArray().Select(value => value.GetString()).ToArray();
        Check(supported.Contains("obs_output_controls") && supported.Contains("obs_brb"),
            "advertise Windows OBS output and Break capabilities");
        var catalogue = await FindMessage(socket, "catalogue.page", m => m.GetProperty("items")[0].GetProperty("id").GetString() == "windows.test");
        Check(catalogue.GetProperty("items").EnumerateArray().Any(item => Text(item, "id") == FakeDesktop.ObsFader),
            "publish OBS controls alongside existing apps on connect");
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.Speaker && UInt(m, "value") == 50);
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.Mic &&
            !m.GetProperty("available").GetBoolean() && !m.TryGetProperty("noInputDevice", out _));
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == CoughId && !m.GetProperty("available").GetBoolean());
        string[] audioTargets = [FakeDesktop.AppVolume, FakeDesktop.InputLevel];
        foreach (var target in audioTargets)
            await FindMessage(socket, "value.state", m => Text(m, "controlId") == target && UInt(m, "value") == 50);
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.ObsFader && UInt(m, "value") == 50);
        desktop.MicState = new(FakeDesktop.Mic, null, NoInputDevice: true);
        await FindMessage(socket, "value.state", m => Valid(m, "mac_to_panel", "connected") &&
            Text(m, "controlId") == FakeDesktop.Mic && !m.GetProperty("available").GetBoolean() &&
            m.GetProperty("noInputDevice").GetBoolean());
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == CoughId &&
            !m.GetProperty("available").GetBoolean() && m.GetProperty("noInputDevice").GetBoolean());
        desktop.MicState = new(FakeDesktop.Mic, 0);
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.Mic &&
            m.GetProperty("available").GetBoolean() && UInt(m, "value") == 0 &&
            !m.TryGetProperty("noInputDevice", out _));
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == CoughId && UInt(m, "value") == 0);
        foreach (var target in audioTargets)
        {
            var request = target == FakeDesktop.AppVolume ? "app-level" : "input-level";
            await Send(socket, "value.set", ("controlId", target), ("value", 35), ("requestId", request));
            await FindMessage(socket, "action.result", m => Text(m, "requestId") == request && Text(m, "status") == "performed");
            await FindMessage(socket, "value.state", m => Text(m, "controlId") == target && UInt(m, "value") == 35);
        }
        await Send(socket, "value.set", ("controlId", FakeDesktop.ObsFader), ("value", 65), ("requestId", "obs-fader"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "obs-fader" && Text(m, "status") == "performed");
        var obsCatalogue = await FindMessage(socket, "catalogue.page", m => Text(m, "scope") == "obs");
        Check(obsCatalogue.GetProperty("items").EnumerateArray().All(item => Text(item, "id").StartsWith("obs.")),
            "refresh OBS independently of the app catalogue");
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.ObsFader && UInt(m, "value") == 65);

        foreach (var (value, expected) in new[] { (50, "not_allowed"), (100, "performed"), (50, "performed"), (0, "performed") })
        {
            await Send(socket, "value.set", ("controlId", CoughId), ("value", value), ("requestId", "cough"));
            await FindMessage(socket, "action.result", m => Text(m, "requestId") == "cough" && Text(m, "status") == expected);
            if (value is 0 or 100)
                await FindMessage(socket, "value.state", m => Text(m, "controlId") == CoughId && UInt(m, "value") == value);
        }
        desktop.AppPlaying = false;
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.AppVolume &&
            !m.GetProperty("available").GetBoolean());
        desktop.AppPlaying = true;
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.AppVolume && UInt(m, "value") == 35);

        await Send(socket, "shortcut.catalogue.request", ("requestId", 10), ("appId", "index"), ("page", 0));
        var shortcutIndex = await FindMessage(socket, "shortcut.catalogue.page", m => UInt(m, "requestId") == 10);
        Check(Valid(shortcutIndex, "mac_to_panel", "connected") && Text(shortcutIndex, "json").Contains("windows", StringComparison.Ordinal),
            "the shortcut page reports the platform even when there are no approved apps");

        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", "windows.test"), ("requestId", "1"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "1" && Text(m, "status") == "activated");
        Interlocked.Increment(ref authorizedRequests);
        await Send(socket, "value.set", ("controlId", "app.volume.com.example.Player"), ("value", 35), ("requestId", "app-volume"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "app-volume" && Text(m, "status") == "not_allowed");
        await Send(socket, "value.set", ("controlId", FakeDesktop.Speaker), ("value", 65), ("requestId", "volume"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "volume" && Text(m, "status") == "performed");
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.Speaker && UInt(m, "value") == 65);
        desktop.Locked = true;
        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", "windows.test"), ("requestId", "2"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "2" && Text(m, "status") == "not_allowed");
        await Send(socket, "value.set", ("controlId", FakeDesktop.Speaker), ("value", 20), ("requestId", "locked-volume"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "locked-volume" && Text(m, "status") == "not_allowed");
        Check(desktop.SpeakerLevel == 65, "locked audio command left the level unchanged");
        desktop.Locked = false;

        await Send(socket, "app_icon.request", ("appId", "windows.test"));
        var icon = await FindMessage(socket, "app_icon.begin", _ => true);
        var generation = UInt(icon, "generation");
        await Send(socket, "app_icon.ack", ("generation", generation), ("nextOffset", 0));
        var frame = new byte[5000];
        WebSocketReceiveResult read;
        do
        {
            read = await socket.ReceiveAsync(new ArraySegment<byte>(frame), lifetime.Token);
            Check(read.EndOfMessage, "complete frame");
        } while (read.MessageType == WebSocketMessageType.Text);
        Check(read.Count == 4108 && frame.AsSpan(0, 4).SequenceEqual("ICON"u8) &&
            BinaryPrimitives.ReadUInt32BigEndian(frame.AsSpan(4)) == generation &&
            BinaryPrimitives.ReadUInt32BigEndian(frame.AsSpan(8)) == 0, "icon transfer frame");
        await Send(socket, "value.set", ("controlId", CoughId), ("value", 100), ("requestId", "disconnect-cough"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "disconnect-cough" && Text(m, "status") == "performed");
        Check(desktop.CoughActive, "disconnect starts with a cough hold");
        checks.TrySetResult();
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "done", lifetime.Token);
    }
    catch (Exception e) { if (!checks.TrySetException(e)) reconnected.TrySetException(e); }
});
await server.StartAsync(lifetime.Token);
var address = server.Urls.Single(url => url.StartsWith("https://", StringComparison.Ordinal));
var pairing = await DisplaySession.PairAsync(address, "ABCD-EFGH", lifetime.Token);
Check(pairing.Fingerprint == Hash(certificate.RawData) && pairing.Key.SequenceEqual(secret), "pin TLS and save the credential");

var status = "";
var saved = pairing;
IDesktop backend = desktop;
#if WINDOWS
if (windowsBackend is not null) backend = windowsBackend;
#endif
var session = new DisplaySession(backend, p => saved = p, s => status = s, (_, _) =>
    Task.FromResult<DiscoveredDisplay?>(new(new Uri(address).Authority, "Desk display", pairing.Fingerprint)));
await session.RunAsync(pairing with { Fingerprint = new('0', 64) }, lifetime.Token);
Check(status.Contains("identity changed", StringComparison.Ordinal) && authenticated == 0, "changed certificate stops before authentication");

using var sessionLifetime = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
Task StartSession() => session.RunAsync(pairing, sessionLifetime.Token);
#if WINDOWS
var run = windowsBackend is null ? StartSession() : NativeWindowsDesktop.RunOnDesktop(StartSession);
#else
var run = StartSession();
#endif
try { await checks.Task.WaitAsync(lifetime.Token); }
finally
{
    await sessionLifetime.CancelAsync();
    await run;
}
Check(saved.Sequence == 8 && rejectedSequence == 1, "authenticated counter recovery");
Check(saved.DisplayName == "Desk display", "save the name for the authenticated display at the connected address");
#if WINDOWS
if (verifyWindowsLock) return;
if (native is not null)
{
    Console.WriteLine("Passed Windows desktop catalogue, approved folder privacy, system metrics, audio and Explorer icon over TLS.");
    return;
}
#endif
Check(!desktop.CoughActive, "ending the connection releases its cough hold");
Check(desktop.Actions == 1 && authorizedRequests == 1, "authenticated dispatch and lock enforcement");
Console.WriteLine("Passed real TLS WebSocket pairing, certificate pinning, counter repair, catalogue, audio dispatch, lock enforcement and icon transfer tests.");
await VerifyUpdateRequired();
await VerifyAddressRecovery();
await VerifyPairingSaveFailure();
await VerifyPairingPrompts();
await VerifyMultipleDisplayConnections();
await ObsChecks.Run();

async Task VerifyPairingPrompts()
{
    var web = new Uri(server.Urls.Single(url => url.StartsWith("http://", StringComparison.Ordinal)));
    Check(await DisplayPairingPrompt.Request(web, lifetime.Token) == PairingPrompt.Reset,
        "a paired display prompts for touchscreen reset confirmation");
    pairingPromptState = "unpaired";
    Check(await DisplayPairingPrompt.Request(web, lifetime.Token) == PairingPrompt.Code,
        "an unpaired display prompts for its code");
    pairingPromptState = "unavailable";
    Check(await DisplayPairingPrompt.Request(web, lifetime.Token) == PairingPrompt.Unavailable,
        "an unavailable pairing endpoint falls back to manual setup");

    for (var sequence = 11u; sequence <= 13; sequence++)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        var status = "";
        var connection = new DisplaySession(desktop, _ => { }, message => status = message,
            (_, _) => Task.FromResult<DiscoveredDisplay?>(null));
        Check(!await connection.ShowPairingBeforeDisconnecting(), "cannot reset a disconnected display");
        var run = connection.RunAsync(saved with { Sequence = sequence }, stop.Token);
        try
        {
            await pairingResetReady.WaitAsync(lifetime.Token);
            Check(await connection.ShowPairingBeforeDisconnecting() == (sequence == 11),
                $"reset reply for authentication sequence {sequence + 1} matches the simulated firmware response ({status})");
            if (sequence == 11) await run.WaitAsync(lifetime.Token);
        }
        finally
        {
            await stop.CancelAsync();
            await run;
        }
    }
    Console.WriteLine("Passed touchscreen pairing prompts and authenticated reset on forget.");
}

async Task VerifyMultipleDisplayConnections()
{
    using var firstCertificate = TestCertificate();
    using var secondCertificate = TestCertificate();
    var firstKey = RandomNumberGenerator.GetBytes(32);
    var secondKey = RandomNumberGenerator.GetBytes(32);
    var firstReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var secondReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var requestAgain = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var stillConnected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    await using var first = Simulate(firstCertificate, firstKey, firstReady, null);
    await using var second = Simulate(secondCertificate, secondKey, secondReady, async socket =>
    {
        await requestAgain.Task.WaitAsync(lifetime.Token);
        await Send(socket, "catalogue.request");
        await ReadCatalogue(socket);
        stillConnected.SetResult();
    });
    await first.StartAsync(lifetime.Token);
    await second.StartAsync(lifetime.Token);
    using var firstStop = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
    using var secondStop = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
    var sharedDesktop = new FakeDesktop();
    var firstTask = Connect(first, firstCertificate, firstKey, firstStop.Token);
    var secondTask = Connect(second, secondCertificate, secondKey, secondStop.Token);
    try
    {
        await Task.WhenAll(firstReady.Task, secondReady.Task).WaitAsync(lifetime.Token);
        await firstStop.CancelAsync();
        await firstTask;
        requestAgain.SetResult();
        await stillConnected.Task.WaitAsync(lifetime.Token);
        Console.WriteLine("Passed independent authenticated connections from one Windows client to two simulated displays.");
    }
    finally
    {
        await firstStop.CancelAsync();
        await secondStop.CancelAsync();
        await Task.WhenAll(firstTask, secondTask);
    }

    Task Connect(WebApplication panel, X509Certificate2 certificate, byte[] key, CancellationToken token)
    {
        var pairing = new Pairing(new Uri(panel.Urls.Single()).Authority, Hash(certificate.RawData), key);
        return new DisplaySession(sharedDesktop, _ => { }, _ => { }, (_, _) => Task.FromResult<DiscoveredDisplay?>(null))
            .RunAsync(pairing, token);
    }

    WebApplication Simulate(X509Certificate2 certificate, byte[] key, TaskCompletionSource ready, Func<WebSocket, Task>? afterReady)
    {
        var host = WebApplication.CreateSlimBuilder();
        host.Logging.ClearProviders();
        host.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0, o => o.UseHttps(certificate)));
        var panel = host.Build();
        panel.UseWebSockets();
        panel.Map(SocketPath, async context =>
        {
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            await Send(socket, "hello");
            var auth = await Receive(socket);
            Check(UInt(auth, "sequence") == 1 && Text(auth, "signature") == Sign(key, 1, Text(auth, "nonce")),
                "each display authenticates with its own pairing");
            await Send(socket, "auth.accepted", ("capabilityVersion", 7));
            await ReadCatalogue(socket);
            ready.SetResult();
            if (afterReady != null) await afterReady(socket);
            else
            {
                try { await Task.Delay(Timeout.InfiniteTimeSpan, context.RequestAborted); }
                catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
            }
        });
        return panel;
    }

    Task<JsonElement> ReadCatalogue(WebSocket socket) => FindMessage(socket, "catalogue.page",
        message => Text(message.GetProperty("items")[0], "id") == "windows.test");
}

async Task VerifyUpdateRequired()
{
    var original = saved with { Sequence = 10 };
    var retained = original;
    var notice = "";
    await new DisplaySession(desktop, next => retained = next, message => notice = message,
        (_, _) => throw new InvalidOperationException("An authenticated update notice should stop reconnecting."))
        .RunAsync(original, lifetime.Token);
    Check(notice == "This display needs a newer version of EspDesktop for Windows. Download the latest Windows installer from GitHub Releases.",
        "report that the display requires a Windows app update");
    Check(retained.Address == original.Address && retained.Fingerprint == original.Fingerprint &&
          retained.Key.SequenceEqual(original.Key) && retained.Sequence == original.Sequence + 1,
        "keep the pairing after the authenticated update notice");
    Console.WriteLine("Passed the Windows update-required notice and pairing preservation over pinned TLS.");
}

static async Task VerifyWindowsReleaseSelection()
{
    const string api = "https://api.github.com/repos/jtenniswood/espdesktop/releases";
    const string downloads = "https://github.com/jtenniswood/espdesktop/releases/download";
    var digest = new string('a', 64);
    var pages = new Dictionary<string, string?>
    {
        [$"{api}?per_page=10&page=1"] = JsonSerializer.Serialize(new[]
        {
            Release("4.0.0", []),
            Release("3.9.0", ["x64", "arm64"], prerelease: true),
            Release("3.8.0", ["x64", "arm64"], draft: true),
            Release("3.7.0", ["x64", "arm64"], validDigest: false),
            Release("3.6.0", ["x64", "arm64"]),
            Release("3.5.0", ["x64", "arm64"]),
            Release("3.0.0", ["x64"]),
            Release("1.0.3", []),
            Release("1.0.2", []),
            Release("1.0.1", [])
        }),
        [$"{api}?per_page=10&page=2"] = JsonSerializer.Serialize(new[]
        {
            Release("3.1.0", ["arm64"]),
            Release("3.2.0", ["x64"])
        }),
        [$"{downloads}/v3.6.0/companion-compatibility.json"] = """{"protocolVersion":999}""",
        [$"{downloads}/v3.5.0/companion-compatibility.json"] = null,
        [$"{downloads}/v3.2.0/companion-compatibility.json"] = """{"protocolVersion":4}""",
        [$"{downloads}/v3.1.0/companion-compatibility.json"] = """{"protocolVersion":4}"""
    };
    using var client = new HttpClient(new ReleaseResponses(pages));
    foreach (var (arch, version) in new[] { ("x64", "3.2.0"), ("arm64", "3.1.0") })
    {
        var update = await Updates.Check(client, new(1, 0, 0, 0), arch, CancellationToken.None);
        Check(update?.Version.ToString() == version && update.Sha256 == digest &&
              update.Installer.AbsoluteUri == $"{downloads}/v{version}/EspDesktop-Windows-{version}-{arch}-Setup.exe",
            $"find the newest compatible {arch} release across pages");
        Check(await Updates.Check(client, new(4, 0, 0, 0), arch, CancellationToken.None) is null,
            $"never offer a downgrade for {arch}");
    }
    Console.WriteLine("Passed Windows release selection across firmware-only releases, architectures, and companion protocols.");

    object Release(string version, string[] architectures, bool prerelease = false, bool draft = false, bool validDigest = true)
    {
        string[] assets = architectures.Length == 0 ? ["firmware.zip"] : architectures
            .Select(arch => $"EspDesktop-Windows-{version}-{arch}-Setup.exe").Prepend("companion-compatibility.json").ToArray();
        return new { tag_name = $"v{version}", prerelease, draft, assets = assets.Select(name => new
        {
            name, browser_download_url = $"{downloads}/v{version}/{name}", digest = validDigest ? "sha256:" + digest : ""
        }).ToArray() };
    }
}

static async Task VerifyUsbFrames()
{
    using var wire = new UsbTestWire([
        0xff, 0xc0, 2, 0xdb, 0xaa, 0xc0, 3, 0xc0, 1, 0xc0,
        0xc0, 2, 0xdb, 0xdc, 0xdb, 0xdd, 0x42, 0xc0, 3, 0xc0
    ]);
    using var usb = UsbDisplayStream.Start(wire, CancellationToken.None);
    var buffer = new byte[2];
    Check(await usb.ReadAsync(buffer) == 2 && buffer.SequenceEqual(new byte[] { 0xc0, 0xdb }),
        "USB decoder handles fragmented and escaped input, including after a malformed frame");
    Check(await usb.ReadAsync(buffer) == 1 && buffer[0] == 0x42 && await usb.ReadAsync(buffer) == 0,
        "USB stream keeps unread bytes and handles the firmware close frame");

    var payload = new byte[1025];
    payload[0] = 0xc0;
    payload[^1] = 0xdb;
    await usb.WriteAsync(payload);
    usb.Dispose();
    var expected = new byte[] { 0xc0, 1, 0xc0, 0xc0, 2, 0xdb, 0xdc }
        .Concat(new byte[1023]).Concat(new byte[] { 0xc0, 0xc0, 2, 0xdb, 0xdd, 0xc0, 0xc0, 3, 0xc0 });
    Check(wire.Written.ToArray().SequenceEqual(expected), "USB writes follow firmware framing and split payloads at 1024 bytes");
    Console.WriteLine("Passed USB transport framing and endpoint checks.");
}

async Task VerifyAddressRecovery()
{
    using var wrongCertificate = TestCertificate();
    var tlsAttempts = 0;
    var wrongRequests = 0;
    var oldHost = WebApplication.CreateSlimBuilder();
    oldHost.Logging.ClearProviders();
    oldHost.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0, listen => listen.UseHttps(options =>
    {
        options.ServerCertificateSelector = (_, _) =>
        {
            Interlocked.Increment(ref tlsAttempts);
            return wrongCertificate;
        };
    })));
    await using var oldServer = oldHost.Build();
    oldServer.Map(SocketPath, context =>
    {
        Interlocked.Increment(ref wrongRequests);
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return Task.CompletedTask;
    });
    await oldServer.StartAsync(lifetime.Token);
    var oldAddress = oldServer.Urls.Single();
    var saves = new List<Pairing>();
    var lookups = 0;
    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
    var connection = new DisplaySession(desktop, saves.Add, _ => { }, (pin, _) =>
    {
        Check(pin == saved.Fingerprint, "discovery looks for the saved display identity");
        // Recover the relocated display first. After a disconnect, a stale
        // advertisement points back to the unrelated server at the old address.
        return Task.FromResult<DiscoveredDisplay?>(++lookups == 1
            ? new(address, "Office display", pin) : new(oldAddress, "Unrelated display", pin));
    });
    var recovery = connection.RunAsync(saved with { Address = oldAddress }, deadline.Token);
    try
    {
        var finished = await Task.WhenAny(reconnected.Task, recovery).WaitAsync(lifetime.Token);
        await finished;
        Check(reconnected.Task.IsCompletedSuccessfully, "the paired display reconnects after moving and disconnecting");
    }
    finally
    {
        await deadline.CancelAsync();
        await recovery;
    }
    Check(tlsAttempts >= 2 && wrongRequests == 0, "both attempts rejected the unrelated server before any HTTP or pairing data");
    Check(saves.Select(item => (item.Address, item.Sequence)).SequenceEqual([(oldAddress, 9u), (address, 9u), (address, 10u)]) &&
        saves.All(item => item.Fingerprint == saved.Fingerprint && item.Key.SequenceEqual(saved.Key)),
        "only the authenticated address replaces the saved address, with the pairing credential and sequence preserved");
    Check(saves.Select(item => item.DisplayName).SequenceEqual(["Desk display", "Office display", "Office display"]),
        "keep the relocated display's name and reject the name from a mismatched endpoint");
    var rejectedStatus = "";
    var refused = new DisplaySession(desktop, _ => throw new InvalidOperationException("Do not save a rejected address."),
        s => rejectedStatus = s, (_, _) => throw new InvalidOperationException("Do not replace the address explicitly selected by the user."));
    await refused.RunAsync(saved, lifetime.Token, oldAddress);
    Check(rejectedStatus.Contains("different display", StringComparison.Ordinal) && wrongRequests == 0,
        "a connection change must prove the display's identity before sending pairing data or replacing the address");

    Console.WriteLine("Passed display address recovery, mismatched discovery rejection, and reconnect over real TLS WebSockets.");
}

async Task VerifyPairingSaveFailure()
{
    var lastStatus = "";
    var authenticationCount = authenticated;
    var failingSave = new DisplaySession(desktop, _ => throw new IOException("Test write failure"), s => lastStatus = s,
        (_, _) => throw new InvalidOperationException("A local save failure must not start network discovery."));
    await failingSave.RunAsync(saved, lifetime.Token);
    Check(lastStatus.Contains("couldn’t save the pairing", StringComparison.Ordinal) && authenticated == authenticationCount,
        "a local save failure reports the storage problem and stops before authentication");
    Console.WriteLine("Passed pairing storage failure reporting over real TLS.");
}

static X509Certificate2 TestCertificate()
{
    using var key = RSA.Create(2048);
    var request = new CertificateRequest("CN=EspDesktop Test", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
    var san = new SubjectAlternativeNameBuilder();
    san.AddIpAddress(IPAddress.Loopback);
    request.CertificateExtensions.Add(san.Build());
    request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
    request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, false));
    var ephemeral = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
    if (!OperatingSystem.IsWindows()) return ephemeral;
    // Windows Schannel requires a private key backed by the Windows key store.
    using (ephemeral)
        return X509CertificateLoader.LoadPkcs12(ephemeral.Export(X509ContentType.Pkcs12), null, X509KeyStorageFlags.UserKeySet);
}

async Task Send(WebSocket socket, string kind, params (string, object?)[] fields) =>
    await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(Message(kind, fields)), WebSocketMessageType.Text, true, lifetime.Token);
async Task<JsonElement> Receive(WebSocket socket, CancellationToken? token = null)
{
    var buffer = new byte[16384];
    var r = await socket.ReceiveAsync(buffer.AsMemory(), token ?? lifetime.Token);
    Check(r.MessageType == WebSocketMessageType.Text && r.EndOfMessage, "text envelope");
    using var document = JsonDocument.Parse(buffer.AsMemory(0, r.Count));
    return document.RootElement.Clone();
}
async Task<JsonElement> FindMessage(WebSocket socket, string kind, Func<JsonElement, bool> valid)
{
    while (true)
    {
        var m = await Receive(socket);
        if (Text(m, "type") != kind) continue;
        Check(valid(m), kind);
        return m;
    }
}

#if WINDOWS
static void VerifyInstallerProfile(string mode)
{
    Check(Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") == "github-hosted", "use a disposable Windows runner profile");
    var store = new LocalStore();
    const string appId = "windows.installer-test";
    var folder = new ApprovedFolder("folder.windows-installer", Path.Combine(Path.GetTempPath(), "EspDesktop installer test"));
    var expected = new Pairing("127.0.0.1:42433", Hash("installer test display"),
        SHA256.HashData("installer fixture credential"u8), 12, "Installer test display");
    switch (mode)
    {
        case "prepare":
            Check(store.LoadPairings().Length == 0 && !store.PairingUnavailable, "prepare the installer check in an empty profile");
            store.Settings.AllApps = false;
            store.Settings.AllowedApps.Add(appId);
            store.Settings.Folders.Add(folder);
            store.Settings.Shortcuts = true;
            store.Settings.CheckForUpdates = false;
            store.Save();
            store.SavePairing(expected);
            break;
        case "verify":
            var actual = store.LoadPairings().SingleOrDefault();
            Check(actual is not null && actual.Address == expected.Address && actual.Fingerprint == expected.Fingerprint &&
                actual.Key.SequenceEqual(expected.Key) && actual.Sequence == expected.Sequence && actual.DisplayName == expected.DisplayName,
                "the installer preserved the protected display pairing");
            Check(!store.Settings.AllApps && store.Settings.Shortcuts && store.Settings.AllowedApps.SetEquals([appId]) &&
                store.Settings.Folders.SequenceEqual([folder]), "the installer preserved app and folder approvals");
            Console.WriteLine("Verified the saved display pairing and approvals after an installer operation.");
            break;
        default: throw new ArgumentException("Unknown installer profile mode.", nameof(mode));
    }
}

static void VerifyLocalStore()
{
    var scratch = Directory.CreateTempSubdirectory("EspDesktop profile test ");
    var profile = Path.Combine(scratch.FullName, "profile");
    try
    {
        var store = new LocalStore(profile);
        Check(store.Settings.AllApps && !store.Settings.Shortcuts, "first run uses the default approvals");
        var notifiedVersion = new Version(2, 0, 0);
        store.Settings.CheckForUpdates = false;
        Check(!store.Settings.MarkUpdateNotified(notifiedVersion), "disabled automatic checks suppress update notifications");
        store.Settings.CheckForUpdates = true;
        Check(store.Settings.MarkUpdateNotified(notifiedVersion), "the first update is eligible for notification");
        store.ForgetPairing();
        Check(store.LoadPairings().Length == 0 && !store.PairingUnavailable, "an empty profile has no pairing to recover");
        var folder = new ApprovedFolder("folder.windows-profile", Path.Combine(profile, "Project, résumé"));
        store.Settings.AllApps = false;
        store.Settings.AllowedApps.Add("windows.test");
        store.Settings.Folders.Add(folder);
        store.Settings.Shortcuts = true;
        store.Save();

        var pairing = new Pairing("192.168.6.100:8443", Hash("fixture display"), RandomNumberGenerator.GetBytes(32), 4);
        store.SavePairing(pairing);
        var protectedData = File.ReadAllBytes(Path.Combine(profile, "pairing.dat"));
        Check(protectedData.AsSpan().IndexOf(Encoding.UTF8.GetBytes(pairing.Address)) < 0 &&
              protectedData.AsSpan().IndexOf(Encoding.UTF8.GetBytes(Convert.ToBase64String(pairing.Key))) < 0,
            "the pairing file keeps the address and credential encrypted");

        var reopened = new LocalStore(profile);
        Check(!reopened.Settings.MarkUpdateNotified(notifiedVersion) &&
              !reopened.Settings.MarkUpdateNotified(new(1, 9, 0)) &&
              reopened.Settings.MarkUpdateNotified(new(2, 0, 1)),
            "after restarting, only a more recent update is eligible for notification");
        var loaded = reopened.LoadPairings().SingleOrDefault();
        Check(loaded is { Sequence: 4 } && loaded.Address == pairing.Address &&
              loaded.Fingerprint == pairing.Fingerprint && loaded.Key.SequenceEqual(pairing.Key) && loaded.DisplayName is null,
            "the same Windows user can reopen the protected pairing");
        Check(!reopened.Settings.AllApps && reopened.Settings.Shortcuts &&
              reopened.Settings.AllowedApps.SetEquals(["windows.test"]) && reopened.Settings.Folders.SequenceEqual([folder]),
            "app and folder approvals survive reopening settings");
        var relocated = folder.Relocate(Path.Combine(profile, "Moved project"));
        reopened.Settings.Folders[0] = relocated;
        reopened.Save();
        var savedFolder = new LocalStore(profile).Settings.Folders.Single();
        Check(savedFolder.Id == folder.Id && savedFolder.Label == folder.Label && savedFolder.Path == relocated.Path,
            "a relocated folder keeps its saved card identity and name");
        reopened.SavePairing(pairing with { Sequence = 5, DisplayName = "Office display" });
        Check(new LocalStore(profile).LoadPairings().SingleOrDefault() is { Sequence: 5, DisplayName: "Office display" },
            "a replaced pairing preserves the latest counter and display name");

        var second = new Pairing("usb:COM12", Hash("second fixture display"), RandomNumberGenerator.GetBytes(32), 9);
        reopened.SavePairing(second);
        reopened.SavePairing(pairing with { Sequence = 6, DisplayName = "Office display" });
        var both = new LocalStore(profile).LoadPairings();
        Check(both.Length == 2 && both[0].Sequence == 6 && both[1].Fingerprint == second.Fingerprint &&
              both[1].Address == "usb:COM12" && both[1].Sequence == 9 && both[1].Key.SequenceEqual(second.Key),
            "adding and updating a display preserves the other protected pairing");
        reopened.ForgetPairing(second.Fingerprint);
        Check(new LocalStore(profile).LoadPairings().Single() is { Sequence: 6, DisplayName: "Office display" },
            "forgetting one display leaves the other saved");

        reopened.SavePairing(pairing with { Address = null! });
        Check(reopened.LoadPairings().Length == 0 && reopened.PairingUnavailable, "an incomplete pairing can be recovered through Forget");
        reopened.ForgetPairing();
        var forgotten = new LocalStore(profile);
        Check(forgotten.LoadPairings().Length == 0 && !forgotten.PairingUnavailable && forgotten.Settings.AllowedApps.Contains("windows.test"),
            "forgetting the pairing preserves the user's local approvals");

        foreach (var invalid in new[] { "null", """{"AllowedApps":null}""", """{"Folders":[null]}""" })
        {
            File.WriteAllText(Path.Combine(profile, "settings.json"), invalid);
            var fallback = new LocalStore(profile).Settings;
            Check(!fallback.AllApps && !fallback.Shortcuts && fallback.AllowedApps.Count == 0 && fallback.Folders.Count == 0,
                "damaged settings do not silently enable remote app or shortcut access");
        }
        Console.WriteLine("Passed Windows protected pairing, saved app and folder approvals, and damaged profile recovery checks.");
    }
    finally { scratch.Delete(recursive: true); }
}

static void VerifyAudioLevelPolicy()
{
    var volume = 0.5f;
    var muted = true;
    bool WriteLevel(float level) { volume = level; return true; }
    bool WriteMute(bool value) { muted = value; return true; }
    Check(Audio.SetLevel(0, WriteLevel, () => muted, WriteMute) && volume == 0 && muted,
        "setting volume to zero preserves mute");
    Check(!Audio.SetLevel(40, _ => false, () => muted, WriteMute) && muted,
        "a failed volume write preserves mute");
    Check(Audio.SetLevel(40, WriteLevel, () => muted, WriteMute) && volume == 0.4f && !muted,
        "setting a positive volume unmutes the endpoint");
    Check(Audio.SetLevel(60, WriteLevel, () => null, _ => false) && volume == 0.6f,
        "an endpoint can change volume even when mute is unavailable");
    Check(!Audio.SetLevel(50, WriteLevel, () => true, _ => false), "report an unmute failure to the display");
    Console.WriteLine("Passed Windows audio volume and mute policy checks.");
}

async Task VerifyWindowsLock(WebSocket socket)
{
    var initial = await FindMessage(socket, "session.lock", _ => true);
    Check(!initial.GetProperty("locked").GetBoolean(), "the Windows test session starts unlocked");

    await Invoke("shortcut.command+control+q", "lock-windows", "performed");
    await FindMessage(socket, "session.lock", message => message.GetProperty("locked").GetBoolean());
    await Invoke("folder.lock-test", "locked-folder", "not_allowed");
    await Invoke("shortcut.command+c", "locked-shortcut", "not_allowed");
    await Send(socket, "value.set", ("controlId", "media.output_volume"), ("value", 40), ("requestId", "locked-speaker"));
    await CheckResult("locked-speaker", "not_allowed");
    Console.WriteLine("Passed native Windows workstation lock, lock-state publication, and blocked commands over TLS.");

    async Task Invoke(string action, string request, string expected)
    {
        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", action), ("requestId", request));
        await CheckResult(request, expected);
    }

    async Task CheckResult(string request, string expected)
    {
        var result = await FindMessage(socket, "action.result", m => Text(m, "requestId") == request);
        Check(Text(result, "status") == expected, request);
    }
}

async Task VerifyNativeDesktop(WebSocket socket, NativeWindowsDesktop fixture)
{
    var entries = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
    uint catalogueGeneration = 0;
    int? explorerPosition = null;
    for (uint page = 0; ; page++)
    {
        var catalogue = await FindMessage(socket, "catalogue.page", m => Valid(m, "mac_to_panel", "connected") && UInt(m, "page") == page);
        if (page == 0) catalogueGeneration = UInt(catalogue, "generation");
        Check(UInt(catalogue, "generation") == catalogueGeneration, "all catalogue pages share a generation");
        foreach (var item in catalogue.GetProperty("items").EnumerateArray())
        {
            var id = Text(item, "id");
            if (id == WindowsDesktop.ExplorerId) explorerPosition = entries.Count;
            entries.Add(id, item);
        }
        if (catalogue.GetProperty("complete").GetBoolean()) break;
    }
    var folderCount = fixture.FolderActions is null ? 2 : 5 + NativeWindowsDesktop.CataloguePaddingFolders;
    var appCount = fixture.AppActions is null ? 1 : 3;
    var audioInputs = entries.Keys.Where(id => id.StartsWith(InputLevelPrefix, StringComparison.Ordinal)).ToArray();
    Check(audioInputs.Length <= 16, "limit the input device picker to the panel capacity");
    Check(entries.Count - audioInputs.Length == folderCount + appCount && entries.ContainsKey(WindowsDesktop.ExplorerId) &&
          !entries.ContainsKey(fixture.UnapprovedAppId), "publish only approved folders and apps");
    if (fixture.AppActions is { } approvedApp)
        Check(entries.TryGetValue(approvedApp.Entry.Id, out var app) && Text(app, "label") == approvedApp.Entry.Name,
            "publish the approved Windows Start menu app");
    Check(entries.TryGetValue("folder.windows-test", out var folder) && Text(folder, "label") == "Project files",
        "publish the approved folder name");
    Check(entries.TryGetValue("folder.windows-drive", out var drive) && Text(drive, "label") == fixture.DriveLabel,
        "publish a friendly drive label");
    if (fixture.FolderActions is { } relocatedFolders)
        Check(entries.TryGetValue("folder.windows-third", out var relocated) &&
              Text(relocated, "label") == Path.GetFileName(relocatedFolders.FormerLocation).Replace(',', ' ').Trim(),
            "publish the original name for the relocated folder under the same card ID");
    Check(entries.Values.All(item => item.EnumerateObject().Count() == 2), "keep private folder paths off the wire");

    var controls = new Dictionary<string, int?>(StringComparer.Ordinal);
    for (var i = 0; i < 5; i++)
    {
        var volume = await FindMessage(socket, "value.state", _ => true);
        Check(Valid(volume, "mac_to_panel", "connected"), "native audio availability and values");
        controls.Add(Text(volume, "controlId"), volume.GetProperty("available").GetBoolean() ? (int)UInt(volume, "value") : null);
    }
    Check(controls.Keys.ToHashSet().SetEquals(["media.output_volume", "media.input_volume", "media.output_mute", "media.input_mute", CoughId]),
        "advertise Windows speaker and microphone controls");
    Check(controls[CoughId] == controls["media.input_mute"], "Input Cough reflects the microphone mute state");
    if (audioInputs.Length > 0)
    {
        var publishedInputs = new HashSet<string>(StringComparer.Ordinal);
        while (publishedInputs.Count < audioInputs.Length)
        {
            var input = await FindMessage(socket, "value.state", m =>
                audioInputs.Contains(Text(m, "controlId")) && m.GetProperty("available").GetBoolean());
            Check(Valid(input, "mac_to_panel", "connected"), "publish selectable Windows inputs with their current level");
            publishedInputs.Add(Text(input, "controlId"));
        }
    }
    await FindMessage(socket, "system_metrics", m => Valid(m, "mac_to_panel", "connected") &&
        m.TryGetProperty("memoryUsagePercent", out _) &&
        m.GetProperty("storageDevices").EnumerateArray().Any(d => Text(d, "id") == "startup"));

    await Send(socket, "shortcut.catalogue.request", ("requestId", 1), ("appId", "index"), ("page", 0));
    var index = await FindMessage(socket, "shortcut.catalogue.page", m => UInt(m, "requestId") == 1);
    using var indexDocument = JsonDocument.Parse(Text(index, "json"));
    var items = indexDocument.RootElement.GetProperty("applications");
    Check(items.GetArrayLength() == (fixture.Browser is null ? 0 : 1), "list presets only for approved apps when shortcuts are enabled");
    if (fixture.Browser is { } browser)
    {
        Check(entries.ContainsKey(browser.Id) && Text(items[0], "appId") == browser.Id,
            "use the approved installation's app ID in the shortcut index");
        await Send(socket, "shortcut.catalogue.request", ("requestId", 2), ("appId", browser.Id), ("page", 0));
        var starter = await FindMessage(socket, "shortcut.catalogue.page", m => UInt(m, "requestId") == 2);
        using var document = JsonDocument.Parse(Text(starter, "json"));
        var app = document.RootElement;
        var presets = WindowsPresets.For(browser.Executable, browser.Target)!.Shortcuts;
        var starterIds = presets.Take(7).Select(preset => preset.Id).ToArray();
        Check(app.GetProperty("defaultShortcutIds").EnumerateArray().Select(id => id.GetString()).SequenceEqual(starterIds) &&
            app.GetProperty("shortcuts").EnumerateArray().Select(preset => Text(preset, "id")).SequenceEqual(starterIds),
            "the first seven Windows shortcuts are selected by default in catalogue order");
        var newTab = app.GetProperty("shortcuts")[0];
        Check(Text(app, "appId") == browser.Id && !app.GetProperty("catalog").GetBoolean() &&
            Text(newTab, "id") == "0" && Text(newTab, "shortcut") == "control+t" && Text(newTab, "icon") == "New Tab",
            "the display receives New Tab with its saved ID and icon");
        await Send(socket, "shortcut.catalogue.request", ("requestId", 3), ("appId", browser.Id), ("page", 1));
        var expanded = await FindMessage(socket, "shortcut.catalogue.page", m => UInt(m, "requestId") == 3);
        using var expandedDocument = JsonDocument.Parse(Text(expanded, "json"));
        Check(expandedDocument.RootElement.GetProperty("moreShortcuts").EnumerateArray().Select(preset => Text(preset, "id"))
                .SequenceEqual(presets.Skip(7).Take(24).Select(preset => preset.Id)) &&
            expandedDocument.RootElement.GetProperty("shortcuts").GetArrayLength() == 0,
            "the display receives additional presets on demand");
        Console.WriteLine($"Passed Windows shortcut preset publication over TLS ({browser.Name}).");
    }
    await Send(socket, "shortcut.catalogue.request", ("requestId", 4), ("appId", fixture.UnapprovedAppId), ("page", 0));
    var denied = await FindMessage(socket, "shortcut.catalogue.page", m => UInt(m, "requestId") == 4);
    Check(!denied.TryGetProperty("json", out _), "an unapproved app has no shortcut definition");

    await Send(socket, "app_icon.request", ("appId", fixture.UnapprovedAppId));
    await FindMessage(socket, "app_icon.unavailable", m => Text(m, "appId") == fixture.UnapprovedAppId);

    await Send(socket, "app_icon.request", ("appId", WindowsDesktop.ExplorerId));
    var icon = await FindMessage(socket, "app_icon.begin", m => Text(m, "appId") == WindowsDesktop.ExplorerId);
    var generation = UInt(icon, "generation");
    var side = Limit("appIconSide");
    var image = new byte[side * side * 3];
    Check(UInt(icon, "byteLength") == image.Length && Text(icon, "format") == "rgb565a8", "real Explorer icon dimensions");
    var frame = new byte[Limit("appIconChunkBytes") + 12];
    var offset = 0;
    while (offset < image.Length)
    {
        await Send(socket, "app_icon.ack", ("generation", generation), ("nextOffset", offset));
        WebSocketReceiveResult read;
        do
        {
            read = await socket.ReceiveAsync(new ArraySegment<byte>(frame), lifetime.Token);
            Check(read.EndOfMessage, "complete Windows icon frame");
        } while (read.MessageType == WebSocketMessageType.Text);
        Check(read.MessageType == WebSocketMessageType.Binary && read.Count > 12 &&
              frame.AsSpan(0, 4).SequenceEqual("ICON"u8) &&
              BinaryPrimitives.ReadUInt32BigEndian(frame.AsSpan(4)) == generation &&
              BinaryPrimitives.ReadUInt32BigEndian(frame.AsSpan(8)) == offset, "native icon frame header");
        frame.AsSpan(12, read.Count - 12).CopyTo(image.AsSpan(offset));
        offset += read.Count - 12;
    }
    await Send(socket, "app_icon.ack", ("generation", generation), ("nextOffset", offset));
    await FindMessage(socket, "app_icon.end", m => UInt(m, "generation") == generation);
    Check(Hash(image) == Text(icon, "sha256") && image.Skip(side * side * 2).Any(alpha => alpha > 0) &&
          image.Take(side * side * 2).Distinct().Count() > 1, "native icon digest and visible pixels");
    if (exerciseDesktopActions)
    {
        Check(explorerPosition >= 256, "File Explorer is still advertised and can serve its icon beyond the panel picker limit");
        Console.WriteLine($"Passed Windows catalogue paging and File Explorer icon delivery beyond the panel picker limit ({entries.Count} entries).");
    }

    if (fixture.FolderActions is { } folders)
        await VerifyFolderActions(socket, folders);
    if (fixture.AppActions is { } apps)
        await VerifyAppActions(socket, apps, fixture.UnapprovedAppId);
    if (exerciseDesktopActions)
    {
        await VerifyWebsiteActions(socket, server.Urls.Single(url => url.StartsWith("http://", StringComparison.Ordinal)));
        await VerifyAudioActions(socket, controls);
    }
}

async Task VerifyAudioActions(WebSocket socket, IReadOnlyDictionary<string, int?> controls)
{
    foreach (var direction in new[] { "output", "input" })
    {
        var volumeId = $"media.{direction}_volume";
        var muteId = $"media.{direction}_mute";
        var volume = controls[volumeId];
        var mute = controls[muteId];
        await Set(muteId, 50, "not_allowed");
        try
        {
            await Set(muteId, 100, mute.HasValue ? "performed" : "not_allowed");
            if (mute.HasValue) await WaitForState(muteId, 100);

            var target = volume is >= 45 ? 35 : 65;
            await Set(volumeId, target, volume.HasValue ? "performed" : "not_allowed");
            if (volume.HasValue)
            {
                await WaitForState(volumeId, target, tolerance: 5);
                if (mute.HasValue) await WaitForState(muteId, 0);
            }
            Console.WriteLine($"Passed Windows {direction} audio actions over TLS (volume available: {volume.HasValue}, mute available: {mute.HasValue}).");
        }
        finally
        {
            if (volume.HasValue) _ = Audio.Set(volumeId, volume.Value);
            if (mute.HasValue) _ = Audio.Set(muteId, mute.Value);
        }
    }

    async Task Set(string id, int value, string status)
    {
        var request = $"{id}-{value}";
        await Send(socket, "value.set", ("controlId", id), ("value", value), ("requestId", request));
        var result = await FindMessage(socket, "action.result", message => Text(message, "requestId") == request);
        Check(Text(result, "status") == status, $"{request} returned {Text(result, "status")}, expected {status}");
    }

    async Task WaitForState(string id, int expected, int tolerance = 0)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        deadline.CancelAfter(TimeSpan.FromSeconds(5));
        while (true)
        {
            var message = await Receive(socket, deadline.Token);
            if (Text(message, "type") != "value.state" || Text(message, "controlId") != id) continue;
            Check(message.GetProperty("available").GetBoolean() && Math.Abs((int)UInt(message, "value") - expected) <= tolerance,
                $"Windows reported the updated {id} value of {expected}");
            return;
        }
    }
}

async Task VerifyFolderActions(WebSocket socket, WindowsFolderActions folders)
{
    await OpenFolder("folder.windows-denied", "new_window", "not_allowed");
    await OpenFolder("folder.windows-test", "new_window", "not_found");

    await OpenFolder("folder.windows-first", "new_window", "opened");
    var firstWindow = await folders.WaitForWindow(folders.First, lifetime.Token);

    await OpenFolder("folder.windows-second", "same_window", "opened");
    var secondWindow = await folders.WaitForWindow(folders.Second, lifetime.Token);
    Check(secondWindow == firstWindow, "Same window navigates the existing File Explorer window");

    await OpenFolder("folder.windows-third", "new_window", "opened");
    var thirdWindow = await folders.WaitForWindow(folders.Third, lifetime.Token);
    Check(thirdWindow != secondWindow, "New window opens a separate File Explorer window");
    Check(!await folders.IsOpen(folders.Denied), "an unapproved folder stays closed");
    Check(!await folders.IsOpen(folders.FormerLocation), "a relocated card opens only the replacement folder");
    Console.WriteLine("Passed authenticated Windows folder actions, including missing folders and a relocated card, in real File Explorer windows.");

    async Task OpenFolder(string id, string behavior, string status)
    {
        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", id),
            ("folderOpenBehavior", behavior), ("requestId", id));
        var result = await FindMessage(socket, "action.result", m => Text(m, "requestId") == id);
        var actual = Text(result, "status");
        Check(actual == status, $"{behavior} for {id} reported {actual}, expected {status}");
    }
}

async Task VerifyAppActions(WebSocket socket, WindowsAppActions app, string deniedId)
{
    await Invoke("app-denied", deniedId, "not_allowed");
    await Invoke("app-launch", app.Entry.Id, "activated");
    await app.CheckForeground(lifetime.Token);
    await FindMessage(socket, "focus.changed", m => Text(m, "actionId") == app.Entry.Id);
    await Invoke("shortcut-denied", "shortcut.option+tab", "not_allowed");
    await Invoke("shortcut-delivered", WindowsAppActions.Shortcut, "performed");
    await app.WaitForShortcut(lifetime.Token);
    app.ClearShortcutReceipt();

    const string scoped = "shortcut.scoped.control+shift+f8";
    await Invoke("preset-no-target", scoped, "not_allowed");
    await Invoke("preset-unapproved-target", scoped, "not_allowed", appId: deniedId);
    await Invoke("preset-background-target", scoped, "not_found", appId: WindowsDesktop.ExplorerId);
    Check(!app.HasShortcutReceipt, "rejected presets leave the foreground test app untouched");
    await Invoke("preset-delivered", scoped, "performed", appId: app.Entry.Id);
    await app.WaitForShortcut(lifetime.Token);
    Console.WriteLine("Passed authenticated Windows app launch, focus reporting, and custom and app-scoped shortcuts.");

    async Task<string> Invoke(string request, string id, string status, string? appId = null)
    {
        var fields = new List<(string, object?)> { ("kind", "action"), ("actionId", id), ("requestId", request) };
        if (appId is not null) fields.Add(("appId", appId));
        await Send(socket, "action.invoke", fields.ToArray());
        var result = await FindMessage(socket, "action.result", m => Text(m, "requestId") == request);
        var actual = Text(result, "status");
        Check(actual == status, $"{request} reported {actual}, expected {status}");
        return actual;
    }
}

async Task VerifyWebsiteActions(WebSocket socket, string browserAddress)
{
    var pages = browserPages.Select((page, i) => (Page: page,
        Id: $"urlcard.{i + 1:x16}", Url: browserAddress + page.Path)).ToArray();
    await Send(socket, "focus.targets", ("items", pages.Select(page => new { id = page.Id, url = page.Url }).ToArray()));
    await OpenUrl("file:///C:/Windows", "new_tab", "website-denied", "not_allowed");

    var first = await OpenPage(0, "new_tab");
    var second = await OpenPage(1, "new_tab");
    Check(first == second, "opening a website in a new tab keeps the browser window");
    Check(InputSession.Replay(second, [0x11, 0x10, 0x09]), "switch to the previous browser tab with Ctrl+Shift+Tab");
    await WaitForHighlight(pages[0].Id, "switching back to the original browser tab");
    var third = await OpenPage(2, "new_window");
    Check(third != second, "opening a website in a new window creates a separate browser window");
    Console.WriteLine("Passed authenticated website actions, new browser tabs and windows, and active website highlighting.");

    async Task<nint> OpenPage(int i, string behavior)
    {
        var (page, id, url) = pages[i];
        await OpenUrl(url, behavior, id, "opened");
        try { await page.Loaded.Task.WaitAsync(TimeSpan.FromSeconds(15), lifetime.Token); }
        catch (TimeoutException) { throw new InvalidOperationException($"The default browser did not load {page.Path}."); }
        await WaitForHighlight(id, $"opening {page.Path}");
        var window = InputSession.GetForegroundWindow();
        Check(window != 0, "website focus has a foreground browser window");
        return window;
    }

    async Task WaitForHighlight(string id, string operation)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        deadline.CancelAfter(TimeSpan.FromSeconds(10));
        try
        {
            while (true)
            {
                var reply = await Receive(socket, deadline.Token);
                if (Text(reply, "type") == "focus.changed" && reply.GetProperty("actionIds").EnumerateArray()
                    .Any(entry => entry.GetString() == id)) break;
            }
        }
        catch (OperationCanceledException) when (deadline.IsCancellationRequested && !lifetime.IsCancellationRequested)
        {
            var foreground = await DescribeBrowserWindow(browserAddress);
            throw new InvalidOperationException($"The companion did not highlight the expected website after {operation}. {foreground}");
        }
    }

    async Task OpenUrl(string url, string behavior, string requestId, string expected)
    {
        await Send(socket, "action.invoke", ("kind", "url"), ("appId", "system.default_browser"),
            ("encodedUrl", Uri.EscapeDataString(url)), ("urlOpenBehavior", behavior), ("requestId", requestId));
        var result = await FindMessage(socket, "action.result", message => Text(message, "requestId") == requestId);
        var actual = Text(result, "status");
        Check(actual == expected, $"{behavior} for {requestId} reported {actual}, expected {expected}");
    }
}

static async Task<string> DescribeBrowserWindow(string testAddress)
{
    var window = InputSession.GetForegroundWindow();
    _ = InputSession.GetWindowThreadProcessId(window, out var pid);
    try
    {
        return await Task.Run(() =>
        {
            using var process = Process.GetProcessById((int)pid);
            var element = AutomationElement.FromHandle(window);
            var edits = element.FindAll(TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));
            var details = edits.Cast<AutomationElement>().Take(8).Select(edit =>
            {
                var value = edit.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern) ? ((ValuePattern)pattern).Current.Value : "";
                var reportsTestPage = value.Contains(new Uri(testAddress).Authority + "/espdesktop-browser-", StringComparison.Ordinal);
                return $"{edit.Current.AutomationId}/{edit.Current.Name} (focused={edit.Current.HasKeyboardFocus}, test URL={reportsTestPage})";
            });
            return $"Foreground: {process.ProcessName} / {process.MainWindowTitle} / {element.Current.ClassName} / {element.Current.Name}. " +
                $"Edit controls: {string.Join(", ", details)}.";
        }).WaitAsync(TimeSpan.FromSeconds(3));
    }
    catch (Exception e) when (WindowsDesktop.IsShellFailure(e) || e is TimeoutException or ElementNotAvailableException)
    {
        return $"Could not inspect the foreground window (PID {pid}): {e.GetType().Name}.";
    }
}
#endif

static byte[] DiscoveryResponse()
{
    using var packet = new MemoryStream();
    packet.Write([0, 1, 0x84, 0, 0, 0, 0, 4, 0, 0, 0, 0]);
    const string service = "_espdesktop._tcp.local", instance = "espdesktop._espdesktop._tcp.local", host = "panel.local";
    Add(service, 12, Name(instance));
    Add(instance, 33, [0, 0, 0, 0, 0x20, 0xfb, .. Name(host)]);
    Add(instance, 16, new[] { "v=1", "name=Desk display", "id=" + new string('a', 64) }
        .SelectMany(s => new[] { (byte)s.Length }.Concat(Encoding.UTF8.GetBytes(s))).ToArray());
    Add(host, 1, [192, 168, 1, 20]);
    return packet.ToArray();
    static byte[] Name(string name) => [.. name.Split('.').SelectMany(s => new[] { (byte)s.Length }.Concat(Encoding.UTF8.GetBytes(s))), 0];
    void Add(string name, byte type, byte[] data)
    {
        packet.Write(Name(name));
        packet.Write([0, type, 0, 1, 0, 0, 0, 30, 0, (byte)data.Length]);
        packet.Write(data);
    }
}

#if WINDOWS
sealed class BrowserTestPage(string name)
{
    public string Path { get; } = $"/espdesktop-browser-{name}";
    public TaskCompletionSource Loaded { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public IResult Visit()
    {
        Loaded.TrySetResult();
        return Results.Content($"<!doctype html><title>EspDesktop {name}</title><h1>EspDesktop {name}</h1>", "text/html");
    }
}
#endif

sealed class ReleaseResponses(IReadOnlyDictionary<string, string?> pages) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var content = pages[request.RequestUri!.AbsoluteUri];
        return Task.FromResult(content is null ? new HttpResponseMessage(HttpStatusCode.NotFound) :
            new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(content, Encoding.UTF8, "application/json") });
    }
}

sealed class FakeDesktop : IDesktop
{
    public const string Speaker = "media.output_volume";
    public const string Mic = "media.input_mute";
    public AudioValue MicState { get; set; } = new(Mic, null);
    public const string AppVolume = AppVolumePrefix + "windows.test";
    public const string InputLevel = InputLevelPrefix + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    public bool AppPlaying { get; set; } = true;
    private int appLevel = 50;
    private int inputLevel = 50;
    private object? coughSession;
    public bool CoughActive => coughSession is not null;
    public int CatalogueRevision => 0;
    public int ObsCatalogueRevision { get; private set; }
    public bool SupportsObs => true;
    public const string ObsFader = "obs.level.797af71d-30e0-425c-b1ea-4b35450bd2cd";
    private int obsLevel = 50;
    public bool ShortcutsEnabled => false;
    public bool Locked { get; set; }
    public int Actions { get; private set; }
    public int SpeakerLevel { get; private set; } = 50;
    public (bool Locked, bool? DisplayAwake) SessionState => (Locked, true);
    public IReadOnlyList<CatalogueItem> Catalogue() => [new("windows.test", "Test app")];
    public IEnumerable<CatalogueItem> ObsCatalogue(uint capability) => capability >= 14 ? [new(ObsFader, "Desk mic")] : [];
    public Task<bool> SetObsValue(string id, int value, object owner, CancellationToken token)
    {
        if (id != ObsFader) return Task.FromResult(false);
        obsLevel = value;
        ObsCatalogueRevision++;
        return Task.FromResult(true);
    }
    public IEnumerable<string> Definitions() => [];
    public (string?, bool) ShortcutPage(string appId, uint page) => appId == "index" && page == 0
        ? ("""{"shortcutPlatform":"windows","applications":[]}""", true)
        : (null, true);
    public string[] Focused(IReadOnlyDictionary<string, Uri> urls) => [];
    public byte[] AppIcon(string appId, int side) => new byte[side * side * 3];
    public Task<string> Invoke(JsonElement message, CancellationToken token) { Actions++; return Task.FromResult("activated"); }
    public bool SetValue(string id, int value)
    {
        switch (id)
        {
            case Speaker: SpeakerLevel = value; return true;
            case AppVolume when AppPlaying: appLevel = value; return true;
            case InputLevel: inputLevel = value; return true;
            default: return false;
        }
    }
    public bool SetCoughValue(int value, object session)
    {
        if (value == 0)
        {
            if (coughSession == session) coughSession = null;
            return true;
        }
        if (Locked || (value != 100 && (value != 50 || coughSession != session))) return false;
        coughSession = session;
        return true;
    }
    public IEnumerable<AudioValue> Values()
    {
        yield return new(Speaker, SpeakerLevel);
        yield return MicState;
        yield return coughSession is null ? MicState with { Id = CoughId } : new(CoughId, 100);
        if (AppPlaying) yield return new(AppVolume, appLevel);
        yield return new(InputLevel, inputLevel);
        yield return new(ObsFader, obsLevel);
    }
    public Dictionary<string, object?> Metrics(uint generation) => Message("system_metrics", ("generation", generation), ("available", false));
}
