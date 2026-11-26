using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using EspDesktop.Core;

namespace EspDesktop.Tests;

internal static class UsbEditorChecks
{
    public static async Task Run()
    {
        var body = "editor response over USB"u8.ToArray();
        using var compressed = new MemoryStream();
        using (var gzip = new GZipStream(compressed, CompressionLevel.Fastest, leaveOpen: true)) gzip.Write(body);
        var compressedBody = compressed.ToArray();
        var http = Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n" +
            "Content-Encoding: gzip\r\nTransfer-Encoding: chunked\r\nETag: \"4\"\r\n" +
            "X-Panel-Config-Durable-Version: 2\r\nConnection: close\r\n\r\n" +
            $"{compressedBody.Length:x}\r\n").Concat(compressedBody).Concat("\r\n0\r\n\r\n"u8.ToArray()).ToArray();

        using var writes = new MemoryStream();
        var offset = 0;
        var waited = false;
        var closed = 0;
        TaskCompletionSource? releaseClose = null;
        UsbEditorTunnel tunnel = null!;
        tunnel = new UsbEditorTunnel(async (packet, _) =>
        {
            Require(packet.AsSpan(0, 4).SequenceEqual("UED1"u8), "USB editor packet signature");
            byte[] payload;
            byte result = 0;
            switch (packet[4])
            {
                case 1: offset = 0; payload = []; break;
                case 2:
                    var written = Math.Min(29, packet.Length - 9);
                    writes.Write(packet, 9, written);
                    payload = new byte[2];
                    BinaryPrimitives.WriteUInt16BigEndian(payload, (ushort)written);
                    break;
                case 3 when !waited:
                    waited = true;
                    result = 1;
                    payload = [];
                    break;
                case 3 when offset < http.Length:
                    var size = Math.Min(21, http.Length - offset);
                    payload = http.AsSpan(offset, size).ToArray();
                    offset += size;
                    break;
                case 3: result = 2; payload = []; break;
                case 4:
                    closed++;
                    if (releaseClose is { } release)
                    {
                        releaseClose = null;
                        await release.Task;
                    }
                    payload = [];
                    break;
                default: throw new InvalidOperationException("Unexpected USB editor command.");
            }
            var frame = packet.AsSpan(0, 9).ToArray().Concat(payload).ToArray();
            frame[4] = result;
            tunnel.Receive(frame);
        }, CancellationToken.None);

        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var editor = new UsbDisplayEditor(tunnel);
        var ok = await editor.Request("PUT", "/api/v1/config", new Dictionary<string, string>
        {
            ["If-Match"] = "\"3\"",
            ["X-EspDesktop-Epoch"] = "21",
            ["X-Panel-Config-Version"] = "2",
            ["Content-Type"] = "application/vnd.espdesktop.panel-config",
            ["Authorization"] = "should not go to the display"
        }, "{\"cards\":[]}"u8.ToArray(), null, timeout.Token);
        Require(ok.Status == 200 && ok.Body.SequenceEqual(body) && ok.Headers["ETag"] == "\"4\"" &&
            ok.Headers["X-Panel-Config-Durable-Version"] == "2",
            "parse a fragmented chunked and gzipped HTTP response over USB");
        var request = Encoding.UTF8.GetString(writes.ToArray());
        Require(request.StartsWith("PUT /api/v1/config HTTP/1.0\r\n", StringComparison.Ordinal) &&
            request.Contains("If-Match: \"3\"\r\n", StringComparison.OrdinalIgnoreCase) &&
            request.Contains("X-EspDesktop-Epoch: 21\r\n", StringComparison.OrdinalIgnoreCase) &&
            request.Contains("Content-Type: application/vnd.espdesktop.panel-config\r\n", StringComparison.OrdinalIgnoreCase) &&
            !request.Contains("Authorization:", StringComparison.OrdinalIgnoreCase) && request.EndsWith("{\"cards\":[]}"),
            "preserve write preconditions and body and drop untrusted headers");
        Require(closed == 1, "close the firmware socket after the request");
        Require((await editor.Request("POST", "/api/v1/reset", new Dictionary<string, string>(), [], null, timeout.Token)).Status == 403 &&
            !UsbDisplayEditor.IsAllowed("POST", "/api/v1/%2e%2e/api/v1/reset", []) &&
            !UsbDisplayEditor.IsAllowed("GET", "//192.168.1.2", []) &&
            !UsbDisplayEditor.IsAllowed("GET", "/events", []), "block unsafe or unbounded USB editor routes");

        writes.SetLength(0);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        releaseClose = release;
        var closing = editor.Request("GET", "/espdesktop/version", new Dictionary<string, string>(), [], null, timeout.Token);
        var background = editor.Request("GET", "/connectors/status", new Dictionary<string, string>(), [], null, timeout.Token);
        var layout = editor.Request("GET", "/api/v1/config", new Dictionary<string, string>(), [], null, timeout.Token);
        release.TrySetResult();
        await Task.WhenAll(closing, background, layout).WaitAsync(timeout.Token);
        var queuedRequests = Encoding.UTF8.GetString(writes.ToArray());
        var layoutIndex = queuedRequests.IndexOf("GET /api/v1/config", StringComparison.Ordinal);
        Require(layoutIndex >= 0 && layoutIndex < queuedRequests.IndexOf("GET /connectors/status", StringComparison.Ordinal),
            "serve the layout before background requests that have not opened a socket");
        await RecoverLayoutSave(timeout.Token);
        Console.WriteLine("Passed USB editor request filtering, HTTP framing, layout priority, and interrupted save recovery.");
    }

    private static async Task RecoverLayoutSave(CancellationToken token)
    {
        var submitted = "new layout"u8.ToArray();
        var previous = "old layout"u8.ToArray();
        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["If-Match"] = "\"v2-3\"",
            ["X-Panel-Config-Version"] = "2",
            ["Authorization"] = "Digest placeholder"
        };
        await Check("confirm an already committed save", 200, "\"v2-4\"", submitted, 204, ["GET"]);
        await Check("retry only when the original precondition still holds", 200, "\"v2-3\"", previous, 204, ["GET", "PUT"]);
        await Check("preserve a concurrent change", 200, "\"v2-4\"", previous, 412, ["GET"]);
        await Check("keep a recovery authentication challenge from restarting the write", 401, "\"v2-3\"", previous, 412, ["GET"]);
        await Check("stop if a concurrent write invalidates the retry", 200, "\"v2-3\"", previous, 412, ["GET", "PUT"], putStatus: 409);
        await Check("keep the draft when authentication expires during retry", 200, "\"v2-3\"", previous, 412, ["GET", "PUT"], putStatus: 401);
        await Check("confirm a retry with a second lost response", 200, "\"v2-3\"", previous, 204, ["GET", "PUT", "GET"], loseRetry: true);

        async Task Check(string name, int readStatus, string etag, byte[] stored, int expected,
            string[] expectedMethods, int putStatus = 204, bool loseRetry = false)
        {
            var methods = new List<string>();
            var status = await UsbDisplayEditor.RecoverLayoutSave(headers, submitted, Send, token);
            Require(status.Status == expected && methods.SequenceEqual(expectedMethods), name);
            if (expected == 204) Require(status.Headers.ContainsKey("ETag"), "return the confirmed layout generation");

            Task<UsbEditorResponse> Send(string method, IReadOnlyDictionary<string, string> requestHeaders,
                byte[] body, CancellationToken cancellation)
            {
                cancellation.ThrowIfCancellationRequested();
                methods.Add(method);
                if (method == "GET")
                {
                    Require(body.Length == 0 && requestHeaders.Count == 1 &&
                        requestHeaders.GetValueOrDefault("X-Panel-Config-Version") == "2",
                        "build a separate read without the PUT authorization or precondition");
                    return Task.FromResult(new UsbEditorResponse(readStatus,
                        new() { ["ETag"] = etag, ["X-Panel-Config-Version"] = "2" }, stored));
                }

                Require(requestHeaders["If-Match"] == headers["If-Match"] && body.SequenceEqual(submitted),
                    "retry with the original precondition and layout");
                if (loseRetry)
                {
                    stored = submitted;
                    etag = "\"v2-4\"";
                    throw new IOException("Connection dropped after the retry was saved.");
                }
                return Task.FromResult(new UsbEditorResponse(putStatus, new() { ["ETag"] = "\"v2-4\"" }, []));
            }
        }
    }

    private static void Require(bool value, string message)
    {
        if (!value) throw new InvalidOperationException("Failed: " + message);
    }
}
