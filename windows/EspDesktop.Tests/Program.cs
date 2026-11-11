using System.Buffers.Binary;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using EspDesktop.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using static EspDesktop.Core.Protocol;

static void Check(bool condition, string label)
{
    if (!condition) throw new InvalidOperationException("Failed: " + label);
}

using (var stream = typeof(Protocol).Assembly.GetManifestResourceStream("ProtocolFixtures.json")!)
using (var fixtures = JsonDocument.Parse(stream))
{
    foreach (var test in fixtures.RootElement.EnumerateArray())
        Check(Valid(test.GetProperty("message"), Text(test, "direction"), Text(test, "state")) ==
              test.GetProperty("valid").GetBoolean(), Text(test, "name"));
    Console.WriteLine($"Passed {fixtures.RootElement.GetArrayLength()} shared protocol fixtures.");
}

Check(DisplayEndpoint.Parse("192.168.1.2").Socket.AbsoluteUri == "wss://192.168.1.2:8443/companion/v4", "default display port");
Check(DisplayEndpoint.Parse("https://panel.local:9443/path").Settings.AbsoluteUri ==
      "https://panel.local/?tab=connectors&connector=mac_companion", "display web settings");
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
Check(SafeActions.Shortcut("shortcut.control+shift+escape") is null, "block task manager");
Check(SafeActions.Shortcut("shortcut.command+keycomma") is not null, "match panel punctuation IDs");
Check(SafeActions.Shortcut("shortcut.command+calc.exe") is null, "no command paths as shortcuts");
Check(Bound("🙂🙂a", 7) == "🙂", "truncate at UTF-8 boundary");
using (var duplicate = JsonDocument.Parse("""{"type":"catalogue.request","type":"hello","protocol":4}"""))
    Check(!Valid(duplicate.RootElement, "panel_to_mac", "connected"), "reject ambiguous envelopes");

Check(Discovery.ParsePackets([0, 0, 0x84, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0xc0, 12], [0]).Length == 0, "reject malformed DNS compression");
var discovered = Discovery.ParsePackets(DiscoveryResponse());
Check(discovered is [{ Address: "192.168.1.20:8443", Name: "Desk display" }], "discover by PTR, SRV, TXT and A");
Console.WriteLine("Passed local address, action policy and discovery tests.");

using var key = RSA.Create(2048);
var request = new CertificateRequest("CN=EspDesktop Test", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
var san = new SubjectAlternativeNameBuilder();
san.AddIpAddress(IPAddress.Loopback);
request.CertificateExtensions.Add(san.Build());
request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, false));
using var ephemeral = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
// Windows Schannel requires a private key backed by the Windows key store.
using var certificate = OperatingSystem.IsWindows()
    ? X509CertificateLoader.LoadPkcs12(ephemeral.Export(X509ContentType.Pkcs12), null, X509KeyStorageFlags.UserKeySet)
    : new X509Certificate2(ephemeral);
using var lifetime = new CancellationTokenSource(TimeSpan.FromSeconds(25));
var builder = WebApplication.CreateSlimBuilder();
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole();
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.ConfigureKestrel(k => k.Listen(IPAddress.Loopback, 0, o => o.UseHttps(certificate)));
await using var server = builder.Build();
server.UseWebSockets();
var secret = RandomNumberGenerator.GetBytes(32);
var checks = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
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
        Check(seq == 8, "repair stale authentication sequence");
        await Send(socket, "auth.accepted", ("capabilityVersion", 7));
        await FindMessage(socket, "catalogue.page", m => m.GetProperty("items")[0].GetProperty("id").GetString() == "windows.test");

        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", "windows.test"), ("requestId", "1"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "1" && Text(m, "status") == "activated");
        Interlocked.Increment(ref authorizedRequests);
        desktop.Locked = true;
        await Send(socket, "action.invoke", ("kind", "action"), ("actionId", "windows.test"), ("requestId", "2"));
        await FindMessage(socket, "action.result", m => Text(m, "requestId") == "2" && Text(m, "status") == "not_allowed");
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
    catch (Exception e) { checks.TrySetException(e); }
});
await server.StartAsync(lifetime.Token);
var address = server.Urls.Single();
var pairing = await DisplaySession.PairAsync(address, "ABCD-EFGH", lifetime.Token);
Check(pairing.Fingerprint == Hash(certificate.RawData) && pairing.Key.SequenceEqual(secret), "pin TLS and save the credential");

var status = "";
var saved = pairing;
var session = new DisplaySession(desktop, p => saved = p, s => status = s, (_, _) => Task.FromResult<string?>(null));
await session.RunAsync(pairing with { Fingerprint = new('0', 64) }, lifetime.Token);
Check(status.Contains("identity changed", StringComparison.Ordinal) && authenticated == 0, "changed certificate stops before authentication");

using var sessionLifetime = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
var run = session.RunAsync(pairing, sessionLifetime.Token);
await checks.Task.WaitAsync(lifetime.Token);
await sessionLifetime.CancelAsync();
await run;
Check(saved.Sequence == 8 && rejectedSequence == 1 && desktop.Actions == 1 && authorizedRequests == 1,
    "authenticated dispatch and lock enforcement");
Console.WriteLine("Passed real TLS WebSocket pairing, certificate pinning, counter repair, catalogue, locked action and icon transfer tests.");

async Task Send(WebSocket socket, string kind, params (string, object?)[] fields) =>
    await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(Message(kind, fields)), WebSocketMessageType.Text, true, lifetime.Token);
async Task<JsonElement> Receive(WebSocket socket)
{
    var buffer = new byte[16384];
    var r = await socket.ReceiveAsync(buffer.AsMemory(), lifetime.Token);
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

sealed class FakeDesktop : IDesktop
{
    public int CatalogueRevision => 0;
    public bool ShortcutsEnabled => false;
    public bool Locked { get; set; }
    public int Actions { get; private set; }
    public (bool Locked, bool? DisplayAwake) SessionState => (Locked, true);
    public IReadOnlyList<CatalogueItem> Catalogue() => [new("windows.test", "Test app")];
    public IEnumerable<string> Definitions() => [];
    public string[] Focused(IReadOnlyDictionary<string, Uri> urls) => [];
    public byte[] AppIcon(string appId, int side) => new byte[side * side * 3];
    public Task<string> Invoke(JsonElement message, CancellationToken token) { Actions++; return Task.FromResult("activated"); }
    public bool SetValue(string id, int value) => false;
    public IEnumerable<(string Id, int? Value)> Values() => [];
    public Dictionary<string, object?> Metrics(uint generation) => Message("system_metrics", ("generation", generation), ("available", false));
}
