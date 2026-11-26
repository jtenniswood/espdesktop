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
        UsbEditorTunnel tunnel = null!;
        tunnel = new UsbEditorTunnel((packet, _) =>
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
                case 4: closed++; payload = []; break;
                default: throw new InvalidOperationException("Unexpected USB editor command.");
            }
            var frame = packet.AsSpan(0, 9).ToArray().Concat(payload).ToArray();
            frame[4] = result;
            tunnel.Receive(frame);
            return Task.CompletedTask;
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
        Console.WriteLine("Passed USB web editor request filtering, round-trip HTTP framing, and response decoding.");
    }

    private static void Require(bool value, string message)
    {
        if (!value) throw new InvalidOperationException("Failed: " + message);
    }
}
