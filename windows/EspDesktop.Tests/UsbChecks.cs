using System.Buffers.Binary;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using EspDesktop.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using static EspDesktop.Core.Protocol;

internal static class UsbChecks
{
    public static async Task Run(X509Certificate2 certificate)
    {
        Check(UsbPort.PortName("usb:com14") == "COM14" && UsbPort.PortName("usb:COM014") == null &&
            UsbPort.PortName(@"usb:COM1\other") == null, "only accept canonical COM endpoints");
        Check(UsbHttpRequest.Create("POST", "/companion/pairing", [], []) == null &&
            UsbHttpRequest.Create("PUT", "/api/v1/config?extra=yes", [], []) == null &&
            UsbHttpRequest.Create("GET", "/%2e%2e/update", [], []) == null,
            "USB editor limits routes and methods");

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(25));
        var token = timeout.Token;
        var key = RandomNumberGenerator.GetBytes(32);
        var profile = new MockPanel(key, token);
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, 0, listener => listener.UseHttps(certificate)));
        await using var server = builder.Build();
        server.UseWebSockets();
        server.Map(SocketPath, profile.Handle);
        await server.StartAsync(token);

        var endpoint = new Uri(server.Urls.Single());
        async ValueTask<Stream> OpenUsb(string port, CancellationToken cancellation)
        {
            Check(port == "COM14", "open the selected COM port");
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            try
            {
                var serial = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
                await serial.ConnectAsync(listener.LocalEndpoint, cancellation);
                var panel = await listener.AcceptSocketAsync(cancellation);
                _ = Relay(new NetworkStream(panel, ownsSocket: true), endpoint, token);
                var link = new UsbTransport(new NetworkStream(serial, ownsSocket: true), native: false);
                try { await link.OpenAsync(cancellation); return link; }
                catch { link.Dispose(); throw; }
            }
            finally { listener.Stop(); }
        }

        var network = "127.0.0.1:" + endpoint.Port;
        var pairing = await DisplaySession.PairAsync("usb:COM14", "1234", token, openUsb: OpenUsb);
        Check(pairing.Address == "usb:COM14" && pairing.Key.SequenceEqual(key), "pair over framed USB and retain credentials");
        var desktop = new FakeDesktop();
        UsbEditorClient? current = null;
        var currentPairing = pairing;
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        DisplaySession Session() => new(desktop, next => currentPairing = next, _ => { }, (_, _) => Task.FromResult<DiscoveredDisplay?>(null),
            OpenUsb, client =>
            {
                Volatile.Write(ref current, client);
                if (client != null) ready.TrySetResult();
            });

        using (var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token))
        {
            var run = Session().RunAsync(pairing, lifetime.Token);
            await ready.Task.WaitAsync(token);
            await profile.ControlsSeen.Task.WaitAsync(token);

            await using var host = await UsbEditorHost.Start(() => Volatile.Read(ref current), token);
            var cookies = new CookieContainer();
            using var http = new HttpClient(new HttpClientHandler { CookieContainer = cookies, UseProxy = false });
            var root = new Uri(host.EditorUrl, "/");
            var config = new Uri(root, "/api/v1/config");
            using (var denied = await http.GetAsync(config, token))
                Check(denied.StatusCode == HttpStatusCode.Forbidden, "editor requests need the browser session cookie");
            using (var page = await http.GetAsync(host.EditorUrl, token))
                Check(page.IsSuccessStatusCode && (await page.Content.ReadAsStringAsync(token)).Contains("window.EventSource = undefined") &&
                    page.Headers.TryGetValues("Content-Security-Policy", out _), "open the offline editor shell");
            using (var foreign = new HttpRequestMessage(HttpMethod.Get, config))
            {
                foreign.Headers.Add("Origin", "http://127.0.0.1:7");
                using var refused = await http.SendAsync(foreign, token);
                Check(refused.StatusCode == HttpStatusCode.Forbidden, "reject another website or loopback origin");
            }
            using (var script = await http.GetAsync(new Uri(root, "/0.js"), token))
                Check(script.IsSuccessStatusCode && await script.Content.ReadAsStringAsync(token) == "window.loaded=true;",
                    "load the offline editor bundle from the paired panel");
            using (var signIn = await http.GetAsync(config, token))
                Check(signIn.StatusCode == HttpStatusCode.Unauthorized && signIn.Headers.WwwAuthenticate.Any(value => value.Scheme == "Basic"),
                    "relay panel web sign-in to the browser");
            http.DefaultRequestHeaders.Authorization = new("Basic", "dGVzdDpwdw==");
            using (var existing = await http.GetAsync(config, token))
                Check(existing.Headers.ETag?.Tag == "\"1\"" &&
                    existing.Headers.GetValues("x-panel-config-durable-version").Single() == "1" &&
                    (await existing.Content.ReadAsByteArrayAsync(token)).SequenceEqual(new byte[] { 4, 5 }),
                    "preserve the panel’s stored format for exact-byte USB backups");

            using (var request = new HttpRequestMessage(HttpMethod.Get, config))
            {
                request.Headers.Add("x-panel-config-version", "1");
                using var backup = await http.SendAsync(request, token);
                Check(backup.Headers.GetValues("x-panel-config-version").Single() == "1" &&
                    (await backup.Content.ReadAsByteArrayAsync(token)).SequenceEqual(new byte[] { 1, 4, 5 }),
                    "read the unchanged stored bytes rather than the converted editor response");
            }

            var edited = new byte[] { 22, 0xc0, 0xdb, 33 };
            using (var write = new HttpRequestMessage(HttpMethod.Put, config) { Content = new ByteArrayContent(edited) })
            {
                write.Headers.IfMatch.Add(new("\"1\""));
                write.Headers.TryAddWithoutValidation("x-panel-config-version", "2");
                using var saved = await http.SendAsync(write, token);
                Check(saved.IsSuccessStatusCode && saved.Headers.ETag?.Tag == "\"2\"" && profile.Layout.SequenceEqual(edited) &&
                    profile.WriteCount == 1, "reconnect and confirm an interrupted layout save without resending it");
            }

            profile.ReplaceNextSave = true;
            using (var write = new HttpRequestMessage(HttpMethod.Put, config) { Content = new ByteArrayContent(new byte[] { 91 }) })
            {
                write.Headers.IfMatch.Add(new("\"2\""));
                write.Headers.TryAddWithoutValidation("x-panel-config-version", "2");
                using var conflict = await http.SendAsync(write, token);
                Check(conflict.StatusCode == HttpStatusCode.PreconditionFailed && profile.Layout.SequenceEqual(new byte[] { 99 }) &&
                    profile.WriteCount == 2, "preserve a newer layout and prevent an automatic retry after an interrupted save");
            }

            var wire = await WaitForUsbSession();
            Check(await wire.Wifi(null, token) == true && await wire.Wifi(false, token) == false &&
                await wire.Wifi(true, token) == true && await wire.NetworkAddress(token) == "192.168.6.100",
                "control Wi-Fi and discover the network address from USB");
            await lifetime.CancelAsync();
            await run;
        }

        var networkReady = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using (var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token))
        {
            var run = new DisplaySession(desktop, next =>
            {
                currentPairing = next;
                if (next.Address == network) networkReady.TrySetResult();
            }, _ => { }, (_, _) => Task.FromResult<DiscoveredDisplay?>(null), OpenUsb)
                .RunAsync(currentPairing, lifetime.Token, network);
            await networkReady.Task.WaitAsync(token);
            Check(currentPairing.Fingerprint == pairing.Fingerprint &&
                currentPairing.Key.SequenceEqual(pairing.Key) && currentPairing.LastNetworkAddress == network,
                "switch the authenticated USB pairing to IP without pairing again");
            await lifetime.CancelAsync();
            await run;
        }

        var status = "";
        await new DisplaySession(desktop, _ => throw new InvalidOperationException("Wrong USB panel reached authentication."),
            message => status = message, (_, _) => Task.FromResult<DiscoveredDisplay?>(null), OpenUsb)
            .RunAsync(currentPairing with { Fingerprint = new string('0', 64) }, token, "usb:COM14");
        Check(status.Contains("different display"), "refuse an unrelated display on the chosen USB port");
        Console.WriteLine("Passed USB framing, TLS pairing, offline editing, interrupted saves, Wi-Fi switching, and identity tests.");

        async Task<UsbEditorClient> WaitForUsbSession()
        {
            while (Volatile.Read(ref current) is not { Connected: true }) await Task.Delay(20, token);
            return Volatile.Read(ref current)!;
        }
    }

    private static async Task Relay(Stream serial, Uri endpoint, CancellationToken token)
    {
        using var layer = new UsbTransport(serial, native: false);
        try
        {
            var opening = new byte[3];
            await serial.ReadExactlyAsync(opening, token);
            Check(opening.SequenceEqual(UsbTransport.Encode(1, [])), "USB host opens a framed session");
            await serial.WriteAsync(UsbTransport.Encode(1, []), token);
            using var client = new TcpClient { NoDelay = true };
            await client.ConnectAsync(IPAddress.Loopback, endpoint.Port, token);
            await using var tcp = client.GetStream();
            using var pumps = CancellationTokenSource.CreateLinkedTokenSource(token);
            var incoming = layer.CopyToAsync(tcp, pumps.Token);
            var outgoing = tcp.CopyToAsync(layer, pumps.Token);
            await Task.WhenAny(incoming, outgoing);
            await pumps.CancelAsync();
            await Task.WhenAll(incoming, outgoing);
        }
        catch (Exception exception) when (exception is IOException or OperationCanceledException or SocketException) { }
    }

    private sealed class MockPanel(byte[] key, CancellationToken token)
    {
        public TaskCompletionSource ControlsSeen { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public byte[] Layout { get; private set; } = [4, 5];
        public int WriteCount { get; private set; }
        public volatile bool ReplaceNextSave;
        private bool wifi = true;

        public async Task Handle(HttpContext context)
        {
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            using var request = new MemoryStream();
            byte[] response = [];
            var offset = 0;
            try
            {
                await Send(socket, Message("hello"));
                while (!token.IsCancellationRequested)
                {
                    var buffer = new byte[32_768];
                    var length = 0;
                    ValueWebSocketReceiveResult part;
                    do
                    {
                        part = await socket.ReceiveAsync(buffer.AsMemory(length), token);
                        length += part.Count;
                    } while (!part.EndOfMessage && length < buffer.Length);
                    if (part.MessageType == WebSocketMessageType.Close) return;
                    if (part.MessageType == WebSocketMessageType.Text)
                    {
                        using var json = JsonDocument.Parse(buffer.AsMemory(0, length));
                        var message = json.RootElement;
                        switch (Text(message, "type"))
                        {
                            case "pair.request":
                                Check(Text(message, "code") == "1234", "send the displayed code over USB");
                                await Send(socket, Message("pair.accepted", ("credential", Convert.ToHexStringLower(key))));
                                return;
                            case "auth.request":
                                var sequence = UInt(message, "sequence");
                                Check(Text(message, "signature") == Sign(key, sequence, Text(message, "nonce")), "authenticate over USB");
                                await Send(socket, Message("auth.accepted", ("capabilityVersion", 24), ("usbEditor", true), ("usbWifiAddress", true)));
                                break;
                            case "capabilities":
                                ControlsSeen.TrySetResult();
                                break;
                        }
                        continue;
                    }

                    Check(buffer.AsSpan(0, 4).SequenceEqual("UED1"u8), "USB editor command header");
                    byte result = 0;
                    byte[] payload = [];
                    switch (buffer[4])
                    {
                        case 1:
                            request.SetLength(0);
                            response = [];
                            offset = 0;
                            break;
                        case 2:
                            var count = Math.Min(length - 9, 97);
                            request.Write(buffer, 9, count);
                            payload = new byte[2];
                            BinaryPrimitives.WriteUInt16BigEndian(payload, (ushort)count);
                            break;
                        case 3:
                            if (response.Length == 0)
                            {
                                var wire = request.ToArray();
                                var boundary = wire.AsSpan().IndexOf("\r\n\r\n"u8);
                                Check(boundary >= 0, "send a complete HTTP request over USB");
                                var fields = Encoding.ASCII.GetString(wire, 0, boundary);
                                if (fields.StartsWith("PUT /api/v1/config ", StringComparison.Ordinal))
                                {
                                    Check(fields.Contains($"If-Match: \"{1 + WriteCount}\"", StringComparison.OrdinalIgnoreCase),
                                        "preserve layout save preconditions");
                                    Layout = ReplaceNextSave ? [99] : wire[(boundary + 4)..];
                                    ReplaceNextSave = false;
                                    WriteCount++;
                                    socket.Abort();
                                    return;
                                }
                                response = Response(fields);
                            }
                            if (offset == response.Length) result = 2;
                            else
                            {
                                var end = Math.Min(offset + 31, response.Length);
                                payload = response[offset..end];
                                offset = end;
                            }
                            break;
                        case 4: break;
                        case 5: payload = [wifi ? (byte)1 : (byte)0]; break;
                        case 7:
                            if (length == 10) { wifi = buffer[9] == 1; result = 1; }
                            else payload = [wifi ? (byte)1 : (byte)0];
                            break;
                        case 8: payload = [192, 168, 6, 100]; break;
                        default: throw new InvalidOperationException("Unknown USB test command.");
                    }
                    var reply = new byte[9 + payload.Length];
                    buffer.AsSpan(0, 9).CopyTo(reply);
                    reply[4] = result;
                    payload.CopyTo(reply, 9);
                    await socket.SendAsync(reply.AsMemory(), WebSocketMessageType.Binary, true, token);
                }
            }
            catch (Exception exception) when (exception is WebSocketException or OperationCanceledException) { }
        }

        private byte[] Response(string fields)
        {
            if (fields.StartsWith("GET /0.js ", StringComparison.Ordinal))
            {
                using var compressed = new MemoryStream();
                using (var gzip = new GZipStream(compressed, CompressionLevel.Fastest, leaveOpen: true))
                    gzip.Write("window.loaded=true;"u8);
                return Http("200 OK", "Content-Type: text/javascript\r\nContent-Encoding: gzip", compressed.ToArray());
            }
            Check(!fields.Contains("If-Match:", StringComparison.OrdinalIgnoreCase),
                "read layout for recovery without the old write precondition");
            if (!fields.Contains("Authorization: Basic dGVzdDpwdw==", StringComparison.OrdinalIgnoreCase))
                return Http("401 Unauthorized", "WWW-Authenticate: Basic realm=\"EspDesktop\"", []);
            const string durable = "x-panel-config-durable-version: 1";
            if (fields.Contains("x-panel-config-version: 1", StringComparison.OrdinalIgnoreCase))
                return Http("200 OK", $"x-panel-config-version: 1\r\n{durable}", [1, 4, 5]);
            return Http("200 OK", $"ETag: \"{1 + WriteCount}\"\r\nx-panel-config-version: 2\r\n{durable}", Layout);
        }

        private static byte[] Http(string status, string headers, byte[] body) =>
            Encoding.ASCII.GetBytes($"HTTP/1.0 {status}\r\n{headers}\r\nContent-Length: {body.Length}\r\n\r\n").Concat(body).ToArray();

        private Task Send(WebSocket socket, Dictionary<string, object?> value) =>
            socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(value), WebSocketMessageType.Text, true, token);
    }

    private static void Check(bool condition, string context)
    {
        if (!condition) throw new InvalidOperationException("USB test failed: " + context);
    }
}
