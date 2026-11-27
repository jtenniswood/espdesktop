using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;

namespace EspDesktop.Core;

internal enum PairingPromptKind
{
    Unavailable,
    Code,
    Reset
}

internal readonly record struct PairingPrompt(PairingPromptKind Kind, int? CodeLength = null)
{
    internal const int ShortLength = 4;
    internal const int LegacyLength = 8;
    internal static PairingPrompt Unavailable => new(PairingPromptKind.Unavailable);
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
            int? length = status.TryGetProperty("code_length", out var size) && size.ValueKind == JsonValueKind.Number &&
                size.TryGetInt32(out var reported) && reported is PairingPrompt.ShortLength or PairingPrompt.LegacyLength
                ? reported : null;
            if (status.TryGetProperty("paired", out var paired) && paired.ValueKind == JsonValueKind.True)
                return new(PairingPromptKind.Reset, length);
            return status.TryGetProperty("active", out var active) && active.ValueKind == JsonValueKind.True
                ? new(PairingPromptKind.Code, length) : new(PairingPromptKind.Unavailable, length);
        }
        catch (Exception e) when (e is HttpRequestException or IOException or JsonException ||
                                  e is OperationCanceledException && !token.IsCancellationRequested)
        { return PairingPrompt.Unavailable; }
    }
}
