using System.Buffers.Binary;
using System.IO;
using System.Net;
using System.Net.Http;
using static EspDesktop.Core.Protocol;

namespace EspDesktop.Core;

internal sealed class UsbEditorClient(Func<byte[], CancellationToken, Task> send, bool wifiAddressSupported)
{
    private const int Chunk = 4096;
    public const int ResponseLimit = 8 * 1024 * 1024;
    private readonly SemaphoreSlim requestGate = new(1);
    private readonly SemaphoreSlim commandGate = new(1);
    private readonly object sync = new();
    private uint sequence;
    private Pending? pending;
    private bool disconnected;

    private sealed record Pending(uint Id, TaskCompletionSource<byte[]> Response);

    public bool Connected
    {
        get { lock (sync) return !disconnected; }
    }

    public void Disconnect()
    {
        lock (sync)
        {
            disconnected = true;
            pending?.Response.TrySetException(new IOException("The USB display disconnected."));
        }
    }

    public bool Receive(ReadOnlySpan<byte> bytes)
    {
        if (!bytes.StartsWith("UED1"u8)) return false;
        if (bytes.Length is < 9 or > 9 + Chunk) return true;
        var id = BinaryPrimitives.ReadUInt32BigEndian(bytes[5..]);
        lock (sync)
        {
            if (pending is { } request && request.Id == id)
            {
                var result = new byte[bytes.Length - 8];
                result[0] = bytes[4];
                bytes[9..].CopyTo(result.AsSpan(1));
                request.Response.TrySetResult(result);
            }
        }
        return true;
    }

    private async Task<byte[]> Command(byte command, ReadOnlyMemory<byte> body, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(7));
        await commandGate.WaitAsync(deadline.Token);
        try
        {
            Pending request;
            lock (sync)
            {
                if (disconnected) throw new IOException("The USB display disconnected.");
                request = new(++sequence, new(TaskCreationOptions.RunContinuationsAsynchronously));
                pending = request;
            }
            var frame = new byte[9 + body.Length];
            "UED1"u8.CopyTo(frame);
            frame[4] = command;
            BinaryPrimitives.WriteUInt32BigEndian(frame.AsSpan(5), request.Id);
            body.CopyTo(frame.AsMemory(9));
            await send(frame, deadline.Token);
            return await request.Response.Task.WaitAsync(deadline.Token);
        }
        catch (OperationCanceledException e) when (!token.IsCancellationRequested)
        {
            throw new IOException("The USB display did not respond.", e);
        }
        finally
        {
            lock (sync) pending = null;
            commandGate.Release();
        }
    }

    public async Task<UsbHttpResponse> Request(UsbHttpRequest request, CancellationToken token)
    {
        await requestGate.WaitAsync(token);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(100));
        try
        {
            if ((await Command(1, default, deadline.Token))[0] != 0) throw InvalidResponse();
            using var handler = new SocketsHttpHandler
            {
                UseProxy = false, UseCookies = false, AllowAutoRedirect = false,
                AutomaticDecompression = DecompressionMethods.GZip, MaxResponseHeadersLength = 16,
                ConnectCallback = (_, _) => ValueTask.FromResult<Stream>(new HttpStream(this))
            };
            using var http = new HttpClient(handler, disposeHandler: false);
            using var outgoing = new HttpRequestMessage(new HttpMethod(request.Method), "http://127.0.0.1" + request.Path)
            { Version = HttpVersion.Version10, VersionPolicy = HttpVersionPolicy.RequestVersionExact };
            outgoing.Headers.ConnectionClose = true;
            if (request.Method != "GET") outgoing.Content = new ByteArrayContent(request.Body);
            foreach (var (name, value) in request.Headers)
            {
                if (name == "content-type") outgoing.Content?.Headers.TryAddWithoutValidation(name, value);
                else outgoing.Headers.TryAddWithoutValidation(name, value);
            }
            using var response = await http.SendAsync(outgoing, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (response.Content.Headers.ContentLength is > ResponseLimit) throw InvalidResponse();
            using var body = new MemoryStream();
            await using var source = await response.Content.ReadAsStreamAsync(deadline.Token);
            var buffer = new byte[8192];
            int count;
            while ((count = await source.ReadAsync(buffer, deadline.Token)) != 0)
            {
                if (body.Length + count > ResponseLimit) throw InvalidResponse();
                body.Write(buffer, 0, count);
            }
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var (name, values) in response.Headers.Concat(response.Content.Headers))
            {
                if (UsbHttpRequest.ResponseHeaders.Contains(name)) headers[name] = string.Join(", ", values);
            }
            return new((int)response.StatusCode, headers, body.ToArray());
        }
        catch (OperationCanceledException e) when (!token.IsCancellationRequested)
        {
            throw new IOException("The USB editor request timed out.", e);
        }
        finally
        {
            if (Connected)
            {
                using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try { _ = await Command(4, default, cleanup.Token); }
                catch (Exception e) when (e is IOException or OperationCanceledException or System.Net.WebSockets.WebSocketException) { }
            }
            requestGate.Release();
        }
    }

    public async Task<bool?> Wifi(bool? enable, CancellationToken token)
    {
        await requestGate.WaitAsync(token);
        try
        {
            if (enable is { } enabled)
            {
                var started = await Command(7, new byte[] { enabled ? (byte)1 : (byte)0 }, token);
                if (started[0] != 1) return null;
            }
            while (true)
            {
                var result = await Command(enable == null ? (byte)5 : (byte)7, default, token);
                if (enable != null && result[0] == 1) { await Task.Delay(150, token); continue; }
                return result is [0, <= 1] ? result[1] == 1 : null;
            }
        }
        finally { requestGate.Release(); }
    }

    public async Task<string?> NetworkAddress(CancellationToken token)
    {
        if (!wifiAddressSupported) return null;
        await requestGate.WaitAsync(token);
        try
        {
            var result = await Command(8, default, token);
            if (result is not [0, _, _, _, _]) return null;
            var address = new IPAddress(result.AsSpan(1));
            return !IPAddress.IsLoopback(address) && DisplayEndpoint.IsLocalAddress(address) ? address.ToString() : null;
        }
        finally { requestGate.Release(); }
    }

    private static IOException InvalidResponse() => new("The display returned an invalid USB editor response.");

    private sealed class HttpStream(UsbEditorClient client) : DuplexStream
    {
        private byte[] remaining = [];
        private int offset;

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        {
            if (buffer.IsEmpty) return 0;
            while (offset >= remaining.Length)
            {
                var result = await client.Command(3, default, token);
                if (result[0] == 2) return 0;
                if (result[0] == 1) { await Task.Delay(15, token); continue; }
                if (result[0] != 0 || result.Length == 1) throw InvalidResponse();
                remaining = result;
                offset = 1;
            }
            var count = Math.Min(buffer.Length, remaining.Length - offset);
            remaining.AsMemory(offset, count).CopyTo(buffer);
            offset += count;
            return count;
        }

        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default)
        {
            while (!buffer.IsEmpty)
            {
                var size = Math.Min(Chunk, buffer.Length);
                var result = await client.Command(2, buffer[..size], token);
                if (result[0] == 1) { await Task.Delay(15, token); continue; }
                if (result[0] != 0 || result.Length != 3) throw InvalidResponse();
                var used = BinaryPrimitives.ReadUInt16BigEndian(result.AsSpan(1));
                if (used == 0 || used > size) throw InvalidResponse();
                buffer = buffer[used..];
            }
        }
    }
}

internal sealed record UsbHttpResponse(int Status, IReadOnlyDictionary<string, string> Headers, byte[] Body);

internal sealed record UsbHttpRequest(string Method, string Path, IReadOnlyDictionary<string, string> Headers, byte[] Body)
{
    public const int RequestLimit = 512 * 1024;
    private static readonly HashSet<string> RequestHeaders = new(StringComparer.OrdinalIgnoreCase)
    { "content-type", "if-match", "x-panel-config-version", "x-espdesktop-epoch", "authorization" };
    public static readonly HashSet<string> ResponseHeaders = new(StringComparer.OrdinalIgnoreCase)
    { "content-type", "content-encoding", "etag", "x-panel-config-version", "x-espdesktop-epoch", "www-authenticate", "retry-after" };
    private static readonly HashSet<string> PostRoutes = new(StringComparer.Ordinal)
    {
        "/companion/page-preview", "/companion/focus-targets", "/api/v1/identity", "/api/v1/home-assistant",
        "/button/Apply%20Configuration/press", "/button/apply_configuration/press"
    };

    public static UsbHttpRequest? Create(string method, string path, IEnumerable<KeyValuePair<string, string>> headers, byte[] body)
    {
        if (path.Length is < 1 or > 4096 || path[0] != '/' || path.StartsWith("//", StringComparison.Ordinal) ||
            path.Any(c => c is < '!' or > '~' or '#' or '\\') || body.Length > RequestLimit) return null;
        var route = path.Split('?', 2)[0];
        if (route.Contains("%2f", StringComparison.OrdinalIgnoreCase) || route.Contains("%5c", StringComparison.OrdinalIgnoreCase) ||
            Uri.UnescapeDataString(route).Split('/').Any(segment => segment is "." or "..")) return null;

        var permitted = method switch
        {
            "GET" => body.Length == 0 && route != "/events" &&
                (route != "/companion/pairing" || path == route) && !route.StartsWith("/update", StringComparison.Ordinal),
            "PUT" => path == "/api/v1/config",
            "POST" => AllowedPost(route, path, body),
            _ => false
        };
        if (!permitted) return null;
        var filtered = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, value) in headers)
        {
            var panelAction = path == "/api/v1/home-assistant" && name.Equals("x-espdesktop-request", StringComparison.OrdinalIgnoreCase) &&
                value is "enable-esphome" or "disable-esphome" or "resync-buttons";
            if ((panelAction || RequestHeaders.Contains(name)) &&
                value.Length <= (name.Equals("authorization", StringComparison.OrdinalIgnoreCase) ? 1024 : 256) &&
                value.All(c => c is >= ' ' and <= '~')) filtered[name.ToLowerInvariant()] = value;
        }
        return new(method, path, filtered, body);
    }

    private static bool AllowedPost(string route, string path, byte[] body)
    {
        if (PostRoutes.Contains(route)) return path == route;
        if (route is "/light/Display%20Backlight/turn_on" or "/light/display_backlight/turn_on") return true;
        var parts = route.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 3 && parts[0] is "text" or "number" or "select" or "switch" &&
            parts[2] is "set" or "turn_on" or "turn_off") return true;
        if (path != "/api/v1/screensaver-pin") return false;
        try
        {
            using var json = System.Text.Json.JsonDocument.Parse(body);
            var root = json.RootElement;
            return root.ValueKind == System.Text.Json.JsonValueKind.Object &&
                root.TryGetProperty("enabled", out var enabled) && enabled.ValueKind == System.Text.Json.JsonValueKind.False &&
                root.TryGetProperty("pin", out var pin) && pin.ValueKind == System.Text.Json.JsonValueKind.String && pin.GetString() == "";
        }
        catch (System.Text.Json.JsonException) { return false; }
    }
}
