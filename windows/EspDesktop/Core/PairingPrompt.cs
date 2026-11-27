using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;

namespace EspDesktop.Core;

internal enum PairingPrompt
{
    Unavailable,
    Code,
    Reset
}

internal static class DisplayPairingPrompt
{
    public static async Task<PairingPrompt> Request(Uri settings, CancellationToken token)
    {
        var url = new Uri(settings, "/companion/pairing?show_on_display=1");
        using var client = new HttpClient(new SocketsHttpHandler
        {
            UseProxy = false,
            AllowAutoRedirect = false,
            UseCookies = false,
            ConnectCallback = DisplayEndpoint.ConnectLocal
        }) { Timeout = TimeSpan.FromSeconds(5), MaxResponseContentBufferSize = 8192 };
        client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
        try
        {
            using var response = await client.GetAsync(url, token);
            if (response.StatusCode != HttpStatusCode.OK) return PairingPrompt.Unavailable;
            using var json = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync(token));
            var status = json.RootElement;
            if (status.ValueKind != JsonValueKind.Object ||
                !status.TryGetProperty("available", out var available) || available.ValueKind != JsonValueKind.True)
                return PairingPrompt.Unavailable;
            if (status.TryGetProperty("paired", out var paired) && paired.ValueKind == JsonValueKind.True)
                return PairingPrompt.Reset;
            return status.TryGetProperty("active", out var active) && active.ValueKind == JsonValueKind.True
                ? PairingPrompt.Code : PairingPrompt.Unavailable;
        }
        catch (Exception e) when (e is HttpRequestException or IOException or JsonException ||
                                  e is OperationCanceledException && !token.IsCancellationRequested)
        { return PairingPrompt.Unavailable; }
    }
}
