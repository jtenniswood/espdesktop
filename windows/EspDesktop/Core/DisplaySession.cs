using System.Buffers.Binary;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Security;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text.Json;
using static EspDesktop.Core.Protocol;

namespace EspDesktop.Core;

internal sealed record Pairing(string Address, string Fingerprint, byte[] Key, uint Sequence = 0, string? DisplayName = null);
internal sealed record CatalogueItem(string Id, string Label);

internal interface IDesktop
{
    int CatalogueRevision { get; }
    bool ShortcutsEnabled { get; }
    IReadOnlyList<CatalogueItem> Catalogue();
    IEnumerable<string> Definitions();
    string[] Focused(IReadOnlyDictionary<string, Uri> urls);
    (bool Locked, bool? DisplayAwake) SessionState { get; }
    byte[]? AppIcon(string appId, int side);
    Task<string> Invoke(JsonElement message, CancellationToken token);
    bool SetValue(string id, int value);
    IEnumerable<(string Id, int? Value)> Values();
    Dictionary<string, object?> Metrics(uint generation);
}

internal sealed class DisplaySession(IDesktop desktop, Action<Pairing> save, Action<string> status,
    Func<string, CancellationToken, Task<DiscoveredDisplay?>> findDisplay)
{
    public static async Task<Pairing> PairAsync(string address, string code, CancellationToken token)
    {
        if (code.Length is < 1 or > 16 || !code.All(c => char.IsAsciiLetterOrDigit(c) || c == '-'))
            throw new ArgumentException("Enter the pairing code shown on the display.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(12));
        string? fingerprint = null;
        using var client = new Link(null, f => fingerprint = f);
        await client.Connect(DisplayEndpoint.Parse(address).Socket, deadline.Token);
        await client.Send(Message("pair.request", ("code", code)), "pairing", deadline.Token);
        var reply = await client.Reply("pairing", deadline.Token);
        if (Text(reply, "type") != "pair.accepted" || fingerprint is null)
            throw new SessionException(Error(reply, "Pairing was refused. Check the code and pairing window."));
        return new Pairing(address, fingerprint, Convert.FromHexString(Text(reply, "credential")));
    }

    public async Task RunAsync(Pairing pairing, CancellationToken token)
    {
        var failures = 0;
        var repairs = 0;
        var attemptedAddress = pairing.Address;
        var unverifiedAddresses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        DiscoveredDisplay? recoveryCandidate = null;
        var searchedForName = false;
        while (!token.IsCancellationRequested)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
                timeout.CancelAfter(TimeSpan.FromSeconds(12));
                status(failures == 0 ? "Connecting…" : "Reconnecting…");
                var pinMismatch = false;
                using var client = new Link(pairing.Fingerprint, f => pinMismatch = f != pairing.Fingerprint);
                try { await client.Connect(DisplayEndpoint.Parse(attemptedAddress).Socket, timeout.Token); }
                catch (WebSocketException) when (pinMismatch)
                {
                    if (attemptedAddress != pairing.Address)
                    {
                        // Reject a discovered address that cannot prove the pinned identity.
                        unverifiedAddresses.Add(attemptedAddress);
                        recoveryCandidate = null;
                        attemptedAddress = pairing.Address;
                    }
                    else
                    {
                        // The old address may have been reassigned after the display moved.
                        attemptedAddress = await FindRecoveryAddress() ??
                            throw new SessionException("The display identity changed. If it was reset, forget it and pair again.");
                    }
                    continue;
                }
                if (pairing.Sequence == uint.MaxValue) throw new SessionException("Forget the display and pair it again.");
                pairing = pairing with { Sequence = pairing.Sequence + 1 };
                SavePairing(pairing);
                var nonce = Guid.NewGuid().ToString();
                await client.Send(Message("auth.request", ("sequence", pairing.Sequence), ("nonce", nonce),
                    ("signature", Sign(pairing.Key, pairing.Sequence, nonce))), "authenticating", timeout.Token);
                var reply = await client.Reply("authenticating", timeout.Token);
                if (Text(reply, "type") != "auth.accepted")
                {
                    if (Text(reply, "code") == "authentication_sequence" && reply.TryGetProperty("lastSequence", out _) && repairs++ == 0)
                    {
                        pairing = pairing with { Sequence = UInt(reply, "lastSequence") };
                        SavePairing(pairing);
                        continue;
                    }
                    throw new SessionException(Error(reply, "The display refused the saved pairing. Pair again after resetting it."));
                }
                repairs = 0;
                failures = 0;
                unverifiedAddresses.Clear();
                var endpoint = DisplayEndpoint.Parse(attemptedAddress).Socket;
                var discovery = recoveryCandidate;
                if (discovery is null && pairing.DisplayName is null && !searchedForName)
                {
                    searchedForName = true;
                    discovery = await FindPairedDisplay();
                }
                var displayName = discovery is not null && DisplayEndpoint.Parse(discovery.Address).Socket == endpoint
                    ? Discovery.FriendlyName(discovery.Name) ?? pairing.DisplayName : pairing.DisplayName;
                if (pairing.Address != attemptedAddress || pairing.DisplayName != displayName)
                {
                    pairing = pairing with { Address = attemptedAddress, DisplayName = displayName };
                    SavePairing(pairing);
                }
                recoveryCandidate = null;
                status($"Connected to {displayName ?? endpoint.Host}");
                await new Connected(client, desktop, UInt(reply, "capabilityVersion"), token).Run();
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { return; }
            catch (SessionException e) { status(e.Message); return; }
            catch (Exception e) when (e is WebSocketException or HttpRequestException or IOException or OperationCanceledException)
            {
                if (token.IsCancellationRequested) return;
                status("Display unavailable. Reconnecting automatically…");
                var delay = TimeSpan.FromSeconds(Math.Min(30, 1 << Math.Min(++failures, 5)));
                try
                {
                    attemptedAddress = await FindRecoveryAddress() ?? pairing.Address;
                    await Task.Delay(delay, token);
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested) { return; }
            }
        }

        async Task<string?> FindRecoveryAddress()
        {
            var discovered = await FindPairedDisplay();
            recoveryCandidate = discovered is not null && !unverifiedAddresses.Contains(discovered.Address) ? discovered : null;
            return recoveryCandidate is not null && !recoveryCandidate.Address.Equals(pairing.Address, StringComparison.OrdinalIgnoreCase)
                ? recoveryCandidate.Address : null;
        }

        async Task<DiscoveredDisplay?> FindPairedDisplay()
        {
            var display = await findDisplay(pairing.Fingerprint, token);
            if (display is null || !display.Fingerprint.Equals(pairing.Fingerprint, StringComparison.OrdinalIgnoreCase)) return null;
            try { _ = DisplayEndpoint.Parse(display.Address); }
            catch (ArgumentException) { return null; }
            return display;
        }

        void SavePairing(Pairing next)
        {
            try { save(next); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException)
            {
                throw new SessionException("EspDesktop couldn’t save the pairing. Check access to your Windows user profile and reconnect.");
            }
        }
    }

    private static string Error(JsonElement reply, string fallback) => Text(reply, "code") switch
    {
        "pairing_expired" or "pairing_closed" or "invalid_message" => "Open the display’s pairing page for a fresh code.",
        "invalid_code" or "pairing_invalid_code" or "pairing_failed" => "That code was not accepted. Check the code and pairing window.",
        "pairing_throttled" => "Wait a few seconds and try the code again.",
        "already_paired" => "This display is already paired. Reset pairing in its web settings first.",
        _ => fallback
    };

    private sealed class Connected(Link link, IDesktop desktop, uint capabilityVersion, CancellationToken token)
    {
        private uint catalogueGeneration, definitionGeneration, metricGeneration, iconGeneration;
        private int revision = -1;
        private string zone = "";
        private string[]? focused;
        private (bool Locked, bool? DisplayAwake)? sessionState;
        private Transfer? iconTransfer;
        private readonly Queue<(string Id, string Hash)> iconRequests = new();
        private readonly Dictionary<string, Uri> focusTargets = new(StringComparer.Ordinal);
        private readonly Dictionary<string, int?> values = new(StringComparer.Ordinal);
        private readonly Stopwatch slowTick = Stopwatch.StartNew();

        public async Task Run()
        {
            // There is exactly one pending receive and all sends and action dispatches
            // happen on this loop, including the publications initiated by a timer.
            using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(token);
            var read = link.Read("connected", lifetime.Token);
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(500));
            var tick = timer.WaitForNextTickAsync(lifetime.Token).AsTask();
            try
            {
                await Publish(fastOnly: false);
                while (!token.IsCancellationRequested)
                {
                    await Task.WhenAny(tick, read);
                    if (read.IsCompleted)
                    {
                        await Handle(await read);
                        read = link.Read("connected", lifetime.Token);
                    }
                    if (tick.IsCompleted)
                    {
                        await tick;
                        var slow = slowTick.Elapsed >= TimeSpan.FromSeconds(2);
                        await Publish(fastOnly: !slow);
                        if (slow) slowTick.Restart();
                        tick = timer.WaitForNextTickAsync(lifetime.Token).AsTask();
                    }
                }
            }
            finally
            {
                await lifetime.CancelAsync();
                try { await read; }
                catch (Exception e) when (e is OperationCanceledException or WebSocketException or IOException or SessionException) { }
            }
        }

        private Task Send(string type, params (string Name, object? Value)[] fields) =>
            link.Send(Message(type, fields), "connected", token);

        private async Task Catalogue()
        {
            revision = desktop.CatalogueRevision;
            var capabilities = new List<string> { "app_icons", "app_icons_alpha", "app_icons_240", "url_card_focus" };
            capabilities.Add(desktop.ShortcutsEnabled ? "keyboard_shortcuts" : "keyboard_shortcuts_unavailable");
            await Send("capabilities", ("values", capabilities));
            var entries = desktop.Catalogue().Select(i => new { id = i.Id, label = Bound(i.Label, 96) }).ToArray();
            var pages = entries.Chunk(48).ToArray();
            if (pages.Length == 0) pages = [[]];
            var generation = Next(ref catalogueGeneration);
            for (var i = 0; i < pages.Length; i++)
                await Send("catalogue.page", ("generation", generation), ("page", i),
                    ("complete", i == pages.Length - 1), ("items", pages[i]));
            if (capabilityVersion >= 5)
            {
                // Leave room for escaping the nested JSON in the outer frame.
                var definitions = desktop.Definitions().Where(d => System.Text.Encoding.UTF8.GetByteCount(d) <= 7000).ToArray();
                generation = Next(ref definitionGeneration);
                for (var i = 0; i < Math.Max(1, definitions.Length); i++)
                    await Send("catalogue.definitions.page", ("generation", generation), ("page", i),
                        ("complete", i >= definitions.Length - 1), ("items", definitions.Length == 0
                            ? [] : new[] { new { kind = "application", json = definitions[i] } }));
            }
        }

        private async Task Publish(bool fastOnly)
        {
            if (revision != desktop.CatalogueRevision) await Catalogue();
            var currentState = desktop.SessionState;
            if (capabilityVersion >= 7 && currentState != sessionState)
            {
                var message = Message("session.lock", ("locked", currentState.Locked));
                if (currentState.DisplayAwake.HasValue) message.Add("displayAwake", currentState.DisplayAwake.Value);
                await link.Send(message, "connected", token);
                sessionState = currentState;
            }
            var current = currentState.Locked ? [] : desktop.Focused(focusTargets);
            if (focused is null || !current.SequenceEqual(focused))
            {
                focused = current;
                await Send("focus.changed", ("actionId", current.FirstOrDefault() ?? ""), ("actionIds", current));
            }
            foreach (var (id, value) in desktop.Values())
                if (!values.TryGetValue(id, out var previous) || value != previous)
                {
                    values[id] = value;
                    await (value is int v
                        ? Send("value.state", ("controlId", id), ("available", true), ("value", v))
                        : Send("value.state", ("controlId", id), ("available", false)));
                }
            if (fastOnly) return;
            var newZone = TimeZoneInfo.TryConvertWindowsIdToIanaId(TimeZoneInfo.Local.Id, out var iana) ? iana : TimeZoneInfo.Local.Id;
            if (zone != newZone)
            {
                zone = newZone;
                await Send("timezone.changed", ("identifier", zone));
            }
            if (capabilityVersion >= 2)
                await link.Send(desktop.Metrics(Next(ref metricGeneration)), "connected", token);
            if (iconTransfer is { } active && active.Timeout.Elapsed > TimeSpan.FromSeconds(12))
            {
                await Send("app_icon.abort", ("appId", active.Id), ("generation", active.Generation));
                iconTransfer = null;
                await NextIcon();
            }
        }

        private async Task Handle(JsonElement m)
        {
            token.ThrowIfCancellationRequested();
            switch (Text(m, "type"))
            {
                case "catalogue.request": await Catalogue(); break;
                case "action.invoke":
                    await Send("action.result", ("requestId", Text(m, "requestId")),
                        ("status", desktop.SessionState.Locked ? "not_allowed" : await desktop.Invoke(m, token)));
                    break;
                case "value.set":
                    var id = Text(m, "controlId");
                    var changed = !desktop.SessionState.Locked && desktop.SetValue(id, (int)UInt(m, "value"));
                    if (changed) values.Remove(id);
                    await Send("action.result", ("requestId", Text(m, "requestId")), ("status", changed ? "performed" : "not_allowed"));
                    break;
                case "focus.targets":
                    focusTargets.Clear();
                    foreach (var item in m.GetProperty("items").EnumerateArray())
                    {
                        var target = Text(item, "id");
                        if (target.Length == 24 && target.StartsWith("urlcard.", StringComparison.Ordinal) &&
                            target.AsSpan(8).ToArray().All(Uri.IsHexDigit) && SafeActions.WebUrl(Text(item, "url"), false) is { } url)
                            focusTargets.TryAdd(target, url);
                    }
                    break;
                case "app_icon.request":
                    var app = Text(m, "appId");
                    if (iconRequests.Count < 64 && iconTransfer?.Id != app && !iconRequests.Any(r => r.Id == app))
                        iconRequests.Enqueue((app, Text(m, "sha256")));
                    await NextIcon();
                    break;
                case "app_icon.ack":
                    if (iconTransfer is { } icon && icon.Matches(m))
                    {
                        if (await Chunk(icon, "ICON"u8.ToArray(), Limit("appIconChunkBytes")))
                        {
                            await Send("app_icon.end", ("appId", icon.Id), ("generation", icon.Generation));
                            iconTransfer = null;
                            await NextIcon();
                        }
                    }
                    break;
                case "app_icon.abort":
                    if (iconTransfer is { } cancelled && cancelled.Generation == UInt(m, "generation") && cancelled.Id == Text(m, "appId"))
                    { iconTransfer = null; await NextIcon(); }
                    break;
            }
        }

        private async Task NextIcon()
        {
            while (iconTransfer is null && iconRequests.TryDequeue(out var request))
            {
                var pixels = capabilityVersion < 4 ? null : desktop.AppIcon(request.Id,
                    Limit(capabilityVersion >= 5 ? "appIconSide" : "appIconLegacySide"));
                if (pixels is null) { await Send("app_icon.unavailable", ("appId", request.Id)); continue; }
                var hash = Hash(pixels);
                if (hash == request.Hash) { await Send("app_icon.unchanged", ("appId", request.Id), ("sha256", hash)); continue; }
                var generation = Next(ref iconGeneration);
                iconTransfer = new(request.Id, generation, pixels);
                await Send("app_icon.begin", ("appId", request.Id), ("generation", generation), ("byteLength", pixels.Length),
                    ("sha256", hash), ("format", "rgb565a8"));
            }
        }

        private async Task<bool> Chunk(Transfer transfer, byte[] tag, int maximum)
        {
            if (transfer.Offset == transfer.Bytes.Length) return true;
            var count = Math.Min(maximum, transfer.Bytes.Length - transfer.Offset);
            var frame = new byte[12 + count];
            tag.CopyTo(frame, 0);
            BinaryPrimitives.WriteUInt32BigEndian(frame.AsSpan(4), transfer.Generation);
            BinaryPrimitives.WriteUInt32BigEndian(frame.AsSpan(8), (uint)transfer.Offset);
            transfer.Bytes.AsSpan(transfer.Offset, count).CopyTo(frame.AsSpan(12));
            await link.SendBinary(frame, token);
            transfer.Offset += count;
            transfer.Timeout.Restart();
            return false;
        }
        private static uint Next(ref uint n) => n = n == uint.MaxValue ? 1 : n + 1;
        private sealed record Transfer(string Id, uint Generation, byte[] Bytes)
        {
            public int Offset { get; set; }
            public Stopwatch Timeout { get; } = Stopwatch.StartNew();
            public bool Matches(JsonElement m) => UInt(m, "generation") == Generation && UInt(m, "nextOffset") == Offset;
        }
    }

    private sealed class Link : IDisposable
    {
        private readonly ClientWebSocket socket = new();
        private readonly HttpMessageInvoker http;

        public Link(string? pin, Action<string> observed)
        {
            var handler = new SocketsHttpHandler
            {
                UseProxy = false, AllowAutoRedirect = false, UseCookies = false,
                ConnectCallback = DisplayEndpoint.ConnectLocal,
                SslOptions = new SslClientAuthenticationOptions
                {
                    RemoteCertificateValidationCallback = (_, certificate, _, _) =>
                    {
                        if (certificate is null) return false;
                        var actual = Hash(certificate.GetRawCertData());
                        observed(actual);
                        return pin is null || CryptographicOperations.FixedTimeEquals(
                            Convert.FromHexString(pin), Convert.FromHexString(actual));
                    }
                }
            };
            http = new HttpMessageInvoker(handler);
            socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
            socket.Options.KeepAliveTimeout = TimeSpan.FromSeconds(15);
        }

        public Task Connect(Uri endpoint, CancellationToken token) => socket.ConnectAsync(endpoint, http, token);
        public async Task Send(Dictionary<string, object?> m, string state, CancellationToken token) =>
            await socket.SendAsync(Serialize(m, state).AsMemory(), WebSocketMessageType.Text, true, token);
        public async Task SendBinary(byte[] bytes, CancellationToken token) =>
            await socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Binary, true, token);

        public async Task<JsonElement> Reply(string state, CancellationToken token)
        {
            for (var i = 0; i < 4; i++)
            {
                var reply = await Read(state, token);
                if (Text(reply, "type") != "hello") return reply;
            }
            throw new SessionException("The display sent an invalid handshake.");
        }

        public async Task<JsonElement> Read(string state, CancellationToken token)
        {
            var buffer = new byte[Limit("maximumTextFrameBytes")];
            var used = 0;
            while (used < buffer.Length)
            {
                var part = await socket.ReceiveAsync(buffer.AsMemory(used), token);
                if (part.MessageType == WebSocketMessageType.Close) throw new IOException("The display disconnected.");
                if (part.MessageType != WebSocketMessageType.Text) break;
                used += part.Count;
                if (!part.EndOfMessage) continue;
                try
                {
                    using var doc = JsonDocument.Parse(buffer.AsMemory(0, used), new JsonDocumentOptions { MaxDepth = 16 });
                    if (Valid(doc.RootElement, "panel_to_mac", state)) return doc.RootElement.Clone();
                }
                catch (Exception e) when (e is JsonException or InvalidOperationException) { }
                break;
            }
            throw new SessionException("The display sent an unsupported message. Check that its firmware is compatible.");
        }
        public void Dispose() { socket.Dispose(); http.Dispose(); }
    }
}

internal sealed class SessionException(string message) : Exception(message);
