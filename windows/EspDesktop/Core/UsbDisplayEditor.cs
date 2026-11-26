using System.IO;
using System.Net;
using System.Net.Http;

namespace EspDesktop.Core;

internal sealed record UsbEditorResponse(int Status, Dictionary<string, string> Headers, byte[] Body);

internal sealed class UsbDisplayEditor(UsbEditorTunnel tunnel)
{
    public const int MaxRequestBytes = 512 * 1024;
    private const int MaxResponseBytes = 8 * 1024 * 1024;
    private readonly SemaphoreSlim requestGate = new(1);
    private readonly SemaphoreSlim backgroundGate = new(1);
    private UsbEditorResponse? editorScript;
    private NetworkCredential? scriptCredentials;

    public async Task<UsbEditorResponse> Request(string method, string path, IReadOnlyDictionary<string, string> headers,
        byte[] body, NetworkCredential? credentials, CancellationToken token)
    {
        if (!IsAllowed(method, path, body)) return new(403, [], []);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token, tunnel.Session);
        deadline.CancelAfter(TimeSpan.FromSeconds(120));
        if (path is "/espdesktop/version.json" or "/api/v1/capabilities" or "/api/v1/config")
            return await RequestOnTunnel(method, path, headers, body, credentials, deadline.Token).ConfigureAwait(false);

        // Let layout discovery and configuration pass queued entity reads while
        // keeping the firmware's one-socket limit for requests already underway.
        await backgroundGate.WaitAsync(deadline.Token).ConfigureAwait(false);
        try { return await RequestOnTunnel(method, path, headers, body, credentials, deadline.Token).ConfigureAwait(false); }
        finally { backgroundGate.Release(); }
    }

    private async Task<UsbEditorResponse> RequestOnTunnel(string method, string path,
        IReadOnlyDictionary<string, string> headers, byte[] body, NetworkCredential? credentials, CancellationToken token)
    {
        var isEditorScript = method == "GET" && path == "/0.js";
        await requestGate.WaitAsync(token).ConfigureAwait(false);
        var opened = false;
        try
        {
            if (isEditorScript && editorScript is not null && ReferenceEquals(scriptCredentials, credentials))
                return editorScript;
            using var handler = new SocketsHttpHandler
            {
                ConnectCallback = (_, cancellation) =>
                {
                    opened = true;
                    return tunnel.OpenAsync(cancellation);
                },
                UseProxy = false, UseCookies = false, AllowAutoRedirect = false, Credentials = credentials,
                AutomaticDecompression = DecompressionMethods.GZip
            };
            using var client = new HttpClient(handler);
            using var request = new HttpRequestMessage(new HttpMethod(method), "http://127.0.0.1" + path)
            {
                Version = HttpVersion.Version10
            };
            request.Headers.ConnectionClose = true;
            if (method != "GET") request.Content = new ByteArrayContent(body);
            foreach (var (name, value) in headers)
            {
                if (value.Length > 256 || value.Any(c => c is < ' ' or > '~')) continue;
                switch (name.ToLowerInvariant())
                {
                    case "content-type": request.Content?.Headers.TryAddWithoutValidation(name, value); break;
                    case "if-match":
                    case "x-panel-config-version":
                    case "x-espdesktop-epoch":
                        request.Headers.TryAddWithoutValidation(name, value);
                        break;
                    case "x-espdesktop-request" when path == "/api/v1/home-assistant" &&
                        value is "enable-esphome" or "disable-esphome" or "resync-buttons":
                        request.Headers.TryAddWithoutValidation(name, value);
                        break;
                }
            }
            using var reply = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token)
                .ConfigureAwait(false);
            using var source = await reply.Content.ReadAsStreamAsync(token).ConfigureAwait(false);
            using var output = new MemoryStream();
            var buffer = new byte[8192];
            int read;
            while ((read = await source.ReadAsync(buffer, token).ConfigureAwait(false)) != 0)
            {
                if (output.Length + read > MaxResponseBytes) throw new IOException("The display’s response was too large.");
                output.Write(buffer, 0, read);
            }

            var responseHeaders = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var (name, values) in reply.Headers.Concat(reply.Content.Headers))
            {
                if (name.ToLowerInvariant() is not ("content-type" or "etag" or "x-panel-config-version" or
                    "x-panel-config-durable-version" or "x-panel-config-generation" or "x-panel-config-legacy-mirror" or
                    "x-espdesktop-companion-online" or "x-espdesktop-app-icon-palette" or
                    "x-espdesktop-app-icon-default" or "x-espdesktop-app-icon-active")) continue;
                var value = string.Join(", ", values);
                if (!value.Contains('\r') && !value.Contains('\n')) responseHeaders[name] = value;
            }
            var response = new UsbEditorResponse((int)reply.StatusCode, responseHeaders, output.ToArray());
            if (isEditorScript && response.Status == 200)
            {
                responseHeaders["Content-Type"] = "text/javascript";
                editorScript = response;
                scriptCredentials = credentials;
            }
            return response;
        }
        finally
        {
            try { if (opened) await tunnel.CloseAsync().ConfigureAwait(false); }
            finally { requestGate.Release(); }
        }
    }

    // Mirror the Mac USB editor's route policy. The display still checks web
    // credentials and validates every setting before applying a change.
    internal static bool IsAllowed(string method, string path, byte[] body)
    {
        if (path.Length is 0 or > 4096 || path[0] != '/' || path.StartsWith("//", StringComparison.Ordinal) ||
            path.Any(c => c is < '!' or > '~' or '#' or '\\') || body.Length > MaxRequestBytes)
            return false;
        var route = path.Split('?', 2)[0];
        // Reject path aliases so their interpretation cannot differ between
        // the allowlist, the HTTP client and the firmware router.
        if (!Uri.TryCreate("http://127.0.0.1" + path, UriKind.Absolute, out var target) ||
            target.AbsolutePath != route || route.Contains("%2f", StringComparison.OrdinalIgnoreCase) ||
            route.Contains("%5c", StringComparison.OrdinalIgnoreCase)) return false;
        if (method == "GET")
            return body.Length == 0 && route is not ("/events" or "/companion/usb-wifi") &&
                (route != "/companion/pairing" || path == route);
        if (method == "PUT") return path == "/api/v1/config";
        if (method != "POST") return false;
        if (path is "/companion/page-preview" or "/companion/focus-targets" or "/api/v1/identity" or
            "/api/v1/home-assistant" or "/button/Apply%20Configuration/press" or "/button/apply_configuration/press")
            return true;
        if (route is "/light/Display%20Backlight/turn_on" or "/light/display_backlight/turn_on") return true;
        if (path == "/api/v1/screensaver-pin")
        {
            try
            {
                using var json = System.Text.Json.JsonDocument.Parse(body);
                return json.RootElement.TryGetProperty("enabled", out var enabled) &&
                    enabled.ValueKind == System.Text.Json.JsonValueKind.False &&
                    json.RootElement.TryGetProperty("pin", out var pin) && pin.ValueEquals("");
            }
            catch (Exception e) when (e is System.Text.Json.JsonException or InvalidOperationException) { return false; }
        }
        return route.Split('/') is ["", "text" or "number" or "select" or "switch", { Length: > 0 }, "set" or "turn_on" or "turn_off"];
    }
}
