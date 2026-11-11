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
if (args is ["--installer-profile", var profileMode])
{
    VerifyInstallerProfile(profileMode);
    return;
}
VerifyLocalStore();
VerifyAudioLevelPolicy();
VerifyWindowsPresets();
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

Check(DisplayEndpoint.Parse("192.168.1.2").Socket.AbsoluteUri == "wss://192.168.1.2:8443/companion/v4", "default display port");
var panelEndpoint = DisplayEndpoint.Parse("https://panel.local:9443/path?tab=device#fragment");
Check(panelEndpoint.Settings.AbsoluteUri == "https://panel.local/", "open the display editor");
Check(panelEndpoint.PairingPage.AbsoluteUri ==
      "https://panel.local/?tab=connectors&connector=mac_companion", "open the display pairing page");
Check(DisplayEndpoint.Parse("[fd00::1]:9000").PairingPage.AbsoluteUri ==
      "http://[fd00::1]/?tab=connectors&connector=mac_companion", "open the IPv6 display pairing page");
Check(DisplayEndpoint.Parse("[fd00::1]:9000").Socket.Port == 9000, "IPv6 display port");
foreach (var invalid in new[] { "example.com", "172.32.0.1", "8.8.8.8", "http://a@panel.local", "file://panel.local", "0.0.0.0" })
{
    try { _ = DisplayEndpoint.Parse(invalid); throw new InvalidOperationException("Unexpected display endpoint: " + invalid); }
    catch (ArgumentException) { }
}
Check(SafeActions.WebUrl("https%3A%2F%2Fexample.org")?.Host == "example.org", "valid URL");
foreach (var bad in new[] { "file:///C:/Windows", "https://a:b@example.org", "ms-settings:windowsupdate", "https:%5c%5cexample.com", "https://example.org/%0a" })
    Check(SafeActions.WebUrl(bad) is null, "refuse unsafe URL");
Check(SafeActions.Shortcut("shortcut.command+shift+t")?.SequenceEqual(new ushort[] { 0x11, 0x10, 0x54 }) == true, "map Command to Ctrl");
Check(SafeActions.Shortcut("shortcut.option+f4") is null, "block system window close");
Check(SafeActions.Shortcut("shortcut.control+escape") is null, "block Start menu");
Check(SafeActions.Shortcut("shortcut.command+escape") is null, "block Start menu through the Command alias");
Check(SafeActions.Shortcut("shortcut.control+shift+escape") is null, "block task manager");
Check(SafeActions.Shortcut("shortcut.command+keycomma") is not null, "match panel punctuation IDs");
Check(SafeActions.Shortcut("shortcut.command+calc.exe") is null, "no command paths as shortcuts");
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
#if WINDOWS
    if (exerciseDesktopActions) k.Listen(IPAddress.Loopback, 0);
#endif
});
await using var server = builder.Build();
server.UseWebSockets();
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
            if (seq == 10) reconnected.TrySetResult();
            await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "test disconnect", lifetime.Token);
            return;
        }
        Check(seq == 8, "repair stale authentication sequence");
        await Send(socket, "auth.accepted", ("capabilityVersion", 7));
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
        await FindMessage(socket, "catalogue.page", m => m.GetProperty("items")[0].GetProperty("id").GetString() == "windows.test");
        await FindMessage(socket, "value.state", m => Text(m, "controlId") == FakeDesktop.Speaker && UInt(m, "value") == 50);

        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", "windows.test"), ("requestId", "1"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "1" && Text(m, "status") == "activated");
        Interlocked.Increment(ref authorizedRequests);
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
Check(desktop.Actions == 1 && authorizedRequests == 1, "authenticated dispatch and lock enforcement");
Console.WriteLine("Passed real TLS WebSocket pairing, certificate pinning, counter repair, catalogue, audio dispatch, lock enforcement and icon transfer tests.");
await VerifyAddressRecovery();
await VerifyPairingSaveFailure();

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
            Check(store.LoadPairing() is null && !store.PairingUnavailable, "prepare the installer check in an empty profile");
            store.Settings.AllApps = false;
            store.Settings.AllowedApps.Add(appId);
            store.Settings.Folders.Add(folder);
            store.Settings.Shortcuts = true;
            store.Settings.CheckForUpdates = false;
            store.Save();
            store.SavePairing(expected);
            break;
        case "verify":
            var actual = store.LoadPairing();
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
        store.ForgetPairing();
        Check(store.LoadPairing() is null && !store.PairingUnavailable, "an empty profile has no pairing to recover");
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
        var loaded = reopened.LoadPairing();
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
        Check(new LocalStore(profile).LoadPairing() is { Sequence: 5, DisplayName: "Office display" },
            "a replaced pairing preserves the latest counter and display name");

        reopened.SavePairing(pairing with { Address = null! });
        Check(reopened.LoadPairing() is null && reopened.PairingUnavailable, "an incomplete pairing can be recovered through Forget");
        reopened.ForgetPairing();
        var forgotten = new LocalStore(profile);
        Check(forgotten.LoadPairing() is null && !forgotten.PairingUnavailable && forgotten.Settings.AllowedApps.Contains("windows.test"),
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

static void VerifyWindowsPresets()
{
    foreach (var (executable, target, firstKey) in new (string?, string, string)[]
    {
        (@"C:\Apps\SLACK.EXE", "Slack", "control+n"),
        (@"C:\Apps\Discord.exe", "Discord", "control+k"),
        (@"C:\Apps\Spotify.exe", "Spotify", "control+k"),
        (@"C:\Apps\GitHubDesktop.exe", "GitHubDesktop", "control+t"),
        (null, "Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!App", "control+t"),
        (null, "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App", "control+n")
    })
    {
        var presets = WindowsPresets.For(executable, target);
        Check(presets.Length > 0 && presets[0].Keys == firstKey, $"preset IDs and shortcut bindings for {target}");
        Check(presets.All(preset => SafeActions.Shortcut("shortcut." + preset.Keys) is not null),
            $"Windows can replay each shortcut for {target}");
    }
    Check(WindowsPresets.For(null, "MSEdge._pin_example").Length == 0,
        "a pinned website does not inherit Edge browser presets");
    Console.WriteLine("Passed Windows application shortcut preset checks.");
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
    Check(entries.Count == folderCount + appCount && entries.ContainsKey(WindowsDesktop.ExplorerId) &&
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

    var definitions = await FindMessage(socket, "catalogue.definitions.page", m => m.GetProperty("complete").GetBoolean());
    var items = definitions.GetProperty("items");
    Check(items.GetArrayLength() == (fixture.Browser is null ? 0 : 1), "publish presets only for approved apps when shortcuts are enabled");
    if (fixture.Browser is { } browser)
    {
        Check(entries.ContainsKey(browser.Id), "the preset's app appears in the approved catalogue");
        var definition = items[0];
        Check(Text(definition, "kind") == "application", "publish browser presets as an application definition");
        using var document = JsonDocument.Parse(Text(definition, "json"));
        var app = document.RootElement;
        var newTab = app.GetProperty("shortcuts")[0];
        Check(Text(app, "appId") == browser.Id && !app.GetProperty("catalog").GetBoolean() &&
            Text(newTab, "id") == "0" && Text(newTab, "shortcut") == "control+t" && Text(newTab, "icon") == "New Tab",
            "the display receives the approved browser's New Tab preset with its saved ID and icon");
        Console.WriteLine($"Passed Windows shortcut preset publication over TLS ({browser.Name}).");
    }

    var controls = new Dictionary<string, int?>(StringComparer.Ordinal);
    for (var i = 0; i < 4; i++)
    {
        var volume = await FindMessage(socket, "value.state", _ => true);
        Check(Valid(volume, "mac_to_panel", "connected"), "native audio availability and values");
        controls.Add(Text(volume, "controlId"), volume.GetProperty("available").GetBoolean() ? (int)UInt(volume, "value") : null);
    }
    Check(controls.Keys.ToHashSet().SetEquals(["media.output_volume", "media.input_volume", "media.output_mute", "media.input_mute"]),
        "advertise Windows speaker and microphone controls");
    await FindMessage(socket, "system_metrics", m => Valid(m, "mac_to_panel", "connected") &&
        m.TryGetProperty("memoryUsagePercent", out _) &&
        m.GetProperty("storageDevices").EnumerateArray().Any(d => Text(d, "id") == "startup"));

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
    var launch = await Invoke("app-launch", app.Entry.Id, "activated", "opened");
    await app.CheckForeground(lifetime.Token);
    Check(launch == "activated", $"recognize the focused Windows app after launch (reported {launch})");
    await FindMessage(socket, "focus.changed", m => Text(m, "actionId") == app.Entry.Id);
    await Invoke("shortcut-denied", "shortcut.option+tab", "not_allowed");
    await Invoke("shortcut-delivered", WindowsAppActions.Shortcut, "performed");
    await app.WaitForShortcut(lifetime.Token);
    Console.WriteLine("Passed authenticated Windows Start menu app launch, focus reporting, and keyboard shortcut delivery.");

    async Task<string> Invoke(string request, string id, params string[] statuses)
    {
        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", id), ("requestId", request));
        var result = await FindMessage(socket, "action.result", m => Text(m, "requestId") == request);
        var actual = Text(result, "status");
        Check(statuses.Contains(actual), $"{request} reported {actual}, expected {string.Join(" or ", statuses)}");
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
    public int CatalogueRevision => 0;
    public bool ShortcutsEnabled => false;
    public bool Locked { get; set; }
    public int Actions { get; private set; }
    public int SpeakerLevel { get; private set; } = 50;
    public (bool Locked, bool? DisplayAwake) SessionState => (Locked, true);
    public IReadOnlyList<CatalogueItem> Catalogue() => [new("windows.test", "Test app")];
    public IEnumerable<string> Definitions() => [];
    public string[] Focused(IReadOnlyDictionary<string, Uri> urls) => [];
    public byte[] AppIcon(string appId, int side) => new byte[side * side * 3];
    public Task<string> Invoke(JsonElement message, CancellationToken token) { Actions++; return Task.FromResult("activated"); }
    public bool SetValue(string id, int value)
    {
        if (id != Speaker) return false;
        SpeakerLevel = value;
        return true;
    }
    public IEnumerable<(string Id, int? Value)> Values() => [(Speaker, SpeakerLevel)];
    public Dictionary<string, object?> Metrics(uint generation) => Message("system_metrics", ("generation", generation), ("available", false));
}
