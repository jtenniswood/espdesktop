using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace EspDesktop.Windows;

internal sealed record Pairing(Uri Endpoint, string Fingerprint, byte[] Credential, uint Sequence = 0);

internal sealed class PairingException(string message) : Exception(message);

internal sealed class CompanionClient(Action<string> status, Action<Pairing> save, Action<string> telemetryStatus)
{
    private const int Protocol = 4;
    private const int TelemetryCapability = 10;
    private const string AppId = "com.iracing.simulator";
    private const string AppLabel = "iRacing";
    private const int MaximumMessageBytes = 16384;
    private static readonly TimeSpan HandshakeTimeout = TimeSpan.FromSeconds(8);
    private static readonly string Profile = LoadProfile();

    public static Uri GetEndpoint(string address)
    {
        if (!Uri.TryCreate($"wss://{address.Trim()}", UriKind.Absolute, out var uri) ||
            uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0)
            throw new PairingException("Enter the display’s local address, such as 192.168.1.20 or espdesktop.local.");

        var localName = uri.HostNameType == UriHostNameType.Dns &&
            uri.IdnHost.EndsWith(".local", StringComparison.OrdinalIgnoreCase);
        if (!localName && !(IPAddress.TryParse(uri.Host, out var ip) && IsLocal(ip)))
            throw new PairingException("Use a private IPv4 address or a .local hostname.");

        return new UriBuilder(uri) { Port = uri.IsDefaultPort ? 8443 : uri.Port, Path = "/companion/v4" }.Uri;
    }

    private static bool IsLocal(IPAddress ip) => ip.GetAddressBytes() is
        [10, _, _, _] or [172, >= 16 and <= 31, _, _] or [192, 168, _, _] or [169, 254, _, _];

    public async Task<Pairing> PairAsync(Uri endpoint, string code, CancellationToken cancellation)
    {
        if (code.Length is < 4 or > 16 || code.Any(character => !char.IsAsciiLetterOrDigit(character)))
            throw new PairingException("Enter the temporary code shown on the display.");

        string? fingerprint = null;
        using var socket = OpenSocket(null, value => fingerprint = value);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(HandshakeTimeout);
        status("Pairing with display…");
        await ConnectAsync(socket, endpoint, timeout.Token);
        await SendAsync(socket, new { type = "pair.request", protocol = Protocol, code }, timeout.Token);
        var reply = await ReceiveAsync(socket, timeout.Token);
        RequireType(reply, "pair.accepted");

        var credential = Convert.FromHexString(ReadString(reply, "credential"));
        if (credential.Length != 32 || fingerprint is null)
            throw new PairingException("The display returned invalid pairing information.");
        var pairing = new Pairing(endpoint, fingerprint, credential);
        save(pairing);
        return pairing;
    }

    public async Task RunAsync(Pairing pairing, CancellationToken cancellation)
    {
        var delay = 1;
        while (!cancellation.IsCancellationRequested)
        {
            try
            {
                using var socket = OpenSocket(pairing.Fingerprint);
                uint capability;
                using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation))
                {
                    timeout.CancelAfter(HandshakeTimeout);
                    await ConnectAsync(socket, pairing.Endpoint, timeout.Token);
                    pairing = pairing with { Sequence = checked(pairing.Sequence + 1) };
                    save(pairing);
                    var nonce = Guid.NewGuid().ToString();
                    var signed = FormattableString.Invariant($"auth.request|{pairing.Sequence}|{nonce}");
                    var signature = Convert.ToHexStringLower(HMACSHA256.HashData(pairing.Credential, Encoding.UTF8.GetBytes(signed)));
                    await SendAsync(socket, new
                    {
                        type = "auth.request", protocol = Protocol, sequence = pairing.Sequence, nonce, signature
                    }, timeout.Token);
                    var reply = await ReceiveAsync(socket, timeout.Token);
                    if (ReadString(reply, "type") == "error" &&
                        ReadString(reply, "code") == "authentication_sequence" &&
                        reply.TryGetProperty("lastSequence", out var last) &&
                        last.TryGetUInt32(out var sequence) && sequence >= pairing.Sequence && sequence < uint.MaxValue)
                    {
                        pairing = pairing with { Sequence = sequence };
                        save(pairing);
                        continue;
                    }
                    RequireType(reply, "auth.accepted");
                    if (!reply.TryGetProperty("capabilityVersion", out var version) ||
                        version.ValueKind != JsonValueKind.Number || !version.TryGetUInt32(out capability) || capability < 9)
                        throw new PairingException("Update the display firmware to use the iRacing shortcut page.");
                }

                delay = 1;
                await ConnectedAsync(socket, capability >= TelemetryCapability, cancellation);
            }
            catch (Exception error) when (error is WebSocketException or IOException or OperationCanceledException)
            {
                if (cancellation.IsCancellationRequested)
                    return;
                status("Display disconnected. Reconnecting…");
                telemetryStatus("Telemetry: waiting for display");
            }
            await Task.Delay(TimeSpan.FromSeconds(delay), cancellation);
            delay = Math.Min(delay * 2, 15);
        }
    }

    private async Task ConnectedAsync(ClientWebSocket socket, bool supportsTelemetry, CancellationToken cancellation)
    {
        using var stop = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        using var sendGate = new SemaphoreSlim(1);
        var requests = new Dictionary<string, string>(StringComparer.Ordinal);
        var requestOrder = new Queue<string>();
        uint generation = 0;
        string[] capabilities = supportsTelemetry
            ? ["keyboard_shortcuts", "iracing_telemetry"] : ["keyboard_shortcuts"];

        async Task Send(object payload)
        {
            await sendGate.WaitAsync(stop.Token);
            try { await SendAsync(socket, payload, stop.Token); }
            finally { sendGate.Release(); }
        }

        async Task PublishCatalogue()
        {
            generation++;
            await Send(new { type = "capabilities", protocol = Protocol, values = capabilities });
            await Send(new
            {
                type = "catalogue.page", protocol = Protocol, generation, page = 0, complete = true,
                items = new[] { new { id = AppId, label = AppLabel } }
            });
            await Send(new
            {
                type = "catalogue.definitions.page", protocol = Protocol, generation, page = 0, complete = true,
                items = new[] { new { kind = "application", json = Profile } }
            });
        }

        async Task ReadActions()
        {
            while (true)
            {
                var message = await ReceiveAsync(socket, stop.Token);
                switch (ReadString(message, "type"))
                {
                    case "catalogue.request":
                        await PublishCatalogue();
                        break;
                    case "action.invoke":
                        var requestId = ReadString(message, "requestId");
                        if (requestId.Length is 0 or > 64)
                            throw new IOException("Invalid action request.");
                        if (!requests.TryGetValue(requestId, out var result))
                        {
                            result = ReadString(message, "kind") == "action" && ReadString(message, "appId") == AppId
                                ? SimulatorInput.SendShortcut(ReadString(message, "actionId"))
                                : "not_allowed";
                            requests.Add(requestId, result);
                            requestOrder.Enqueue(requestId);
                            if (requestOrder.Count > 128)
                                requests.Remove(requestOrder.Dequeue());
                            status(result switch
                            {
                                "performed" => "Shortcut sent",
                                "failed" => "Windows could not send the shortcut",
                                _ => "Shortcut unavailable. Check the binding and bring iRacing to the front."
                            });
                        }
                        await Send(new { type = "action.result", protocol = Protocol, requestId, status = result });
                        break;
                }
            }
        }

        async Task PublishFocus()
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(250));
            bool? previous = null;
            do
            {
                var foreground = SimulatorInput.SimulatorIsForeground();
                if (previous == foreground)
                    continue;

                previous = foreground;
                await Send(new
                {
                    type = "focus.changed", protocol = Protocol,
                    actionId = foreground ? AppId : "",
                    actionIds = foreground ? new[] { AppId } : []
                });
                status(foreground ? "Connected • iRacing is active" : "Connected • Bring iRacing to the front");
            }
            while (await timer.WaitForNextTickAsync(stop.Token));
        }

        async Task PublishTelemetry()
        {
            if (!supportsTelemetry || !OperatingSystem.IsWindows())
            {
                telemetryStatus("Telemetry: update the display firmware");
                await Task.Delay(Timeout.InfiniteTimeSpan, stop.Token);
                return;
            }

            async Task<bool> TrySendTelemetry(IracingTelemetryMessage message, CancellationToken cancellation)
            {
                // Let shortcut and focus messages take the next send slot. A
                // fresh sample will be available on the next telemetry poll.
                if (!await sendGate.WaitAsync(0, cancellation))
                    return false;
                try
                {
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                    timeout.CancelAfter(TimeSpan.FromMilliseconds(500));
                    await SendAsync(socket, message, timeout.Token);
                    return true;
                }
                finally { sendGate.Release(); }
            }

            using var source = new IracingTelemetry();
            var publisher = new IracingTelemetryPublisher(source.Sample, TrySendTelemetry,
                live => telemetryStatus(live ? "Telemetry: live" : "Telemetry: waiting for an iRacing session"), Protocol);
            await publisher.RunAsync(stop.Token);
        }

        await PublishCatalogue();
        var receive = ReadActions();
        var focus = PublishFocus();
        var telemetry = PublishTelemetry();
        try
        {
            await await Task.WhenAny(receive, focus, telemetry);
        }
        finally
        {
            await stop.CancelAsync();
            try { await Task.WhenAll(receive, focus, telemetry); }
            catch (Exception error) when (error is OperationCanceledException or WebSocketException or IOException) { }
        }
    }

    private static ClientWebSocket OpenSocket(string? pin, Action<string>? remember = null)
    {
        var socket = new ClientWebSocket();
        socket.Options.Proxy = null;
        socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(8);
        socket.Options.KeepAliveTimeout = TimeSpan.FromSeconds(8);
        socket.Options.RemoteCertificateValidationCallback = (_, certificate, _, _) =>
        {
            if (certificate is null)
                return false;
            var fingerprint = Convert.ToHexStringLower(SHA256.HashData(certificate.GetRawCertData()));
            if (pin is not null)
                return string.Equals(pin, fingerprint, StringComparison.Ordinal);
            remember?.Invoke(fingerprint);
            return remember is not null;
        };
        return socket;
    }

    private static async Task ConnectAsync(ClientWebSocket socket, Uri endpoint, CancellationToken cancellation)
    {
        // Use the same resolved private address for the entire handshake.
        var addresses = await Dns.GetHostAddressesAsync(endpoint.IdnHost, cancellation);
        var local = addresses.FirstOrDefault(IsLocal) ??
            throw new PairingException("The display address did not resolve to a private IPv4 address.");
        var target = new UriBuilder(endpoint) { Host = local.ToString() }.Uri;
        await socket.ConnectAsync(target, cancellation);
        RequireType(await ReceiveAsync(socket, cancellation), "hello");
    }

    private static Task SendAsync(ClientWebSocket socket, object payload, CancellationToken cancellation) =>
        socket.SendAsync(new ArraySegment<byte>(JsonSerializer.SerializeToUtf8Bytes(payload)),
            WebSocketMessageType.Text, true, cancellation);

    private static async Task<JsonElement> ReceiveAsync(ClientWebSocket socket, CancellationToken cancellation)
    {
        var bytes = new byte[MaximumMessageBytes];
        var length = 0;
        while (length < bytes.Length)
        {
            var frame = await socket.ReceiveAsync(bytes.AsMemory(length), cancellation);
            if (frame.MessageType != WebSocketMessageType.Text)
                throw new IOException("Display connection ended or sent an unsupported message.");
            length += frame.Count;
            if (frame.EndOfMessage)
            {
                try
                {
                    using var document = JsonDocument.Parse(bytes.AsMemory(0, length));
                    var root = document.RootElement;
                    if (root.ValueKind != JsonValueKind.Object ||
                        !root.TryGetProperty("protocol", out var version) ||
                        version.ValueKind != JsonValueKind.Number || !version.TryGetInt32(out var protocol) || protocol != Protocol)
                        throw new PairingException("Update the display to compatible EspDesktop firmware.");
                    return root.Clone();
                }
                catch (JsonException error)
                {
                    throw new IOException("Invalid response from the display.", error);
                }
            }
        }
        throw new IOException("Display response exceeded the Companion message limit.");
    }

    private static string ReadString(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";

    private static void RequireType(JsonElement message, string expected)
    {
        if (ReadString(message, "type") == expected)
            return;
        throw new PairingException(ReadString(message, "code") switch
        {
            "pairing_failed" or "pairing_throttled" => "Pairing failed. Check the current code and try again.",
            "pairing_reset" or "authentication_failed" => "This pairing is no longer recognised. Pair the display again.",
            _ => "Unexpected response from the display. Check that the firmware matches this app."
        });
    }

    private static string LoadProfile()
    {
        using var stream = typeof(CompanionClient).Assembly.GetManifestResourceStream("EspDesktop.Windows.iracing.json") ??
            throw new InvalidOperationException("The iRacing shortcut profile is missing.");
        using var document = JsonDocument.Parse(stream);
        return JsonSerializer.Serialize(document.RootElement);
    }
}
