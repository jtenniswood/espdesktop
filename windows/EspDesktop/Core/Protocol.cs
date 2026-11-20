using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace EspDesktop.Core;

internal static class Protocol
{
    private static readonly JsonElement Contract = ReadContract();
    private static readonly Dictionary<string, JsonElement> Messages = Contract.GetProperty("messages")
        .EnumerateArray().ToDictionary(m => m.GetProperty("id").GetString()!);
    private static readonly JsonSerializerOptions JsonOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    public static int Version => Contract.GetProperty("version").GetInt32();
    public static string SocketPath => Contract.GetProperty("path").GetString()!;
    public static int Limit(string key) => Contract.GetProperty(key).GetInt32();
    private static JsonElement ReadContract()
    {
        using var stream = typeof(Protocol).Assembly.GetManifestResourceStream("CompanionContract.json")!;
        using var doc = JsonDocument.Parse(stream);
        return doc.RootElement.GetProperty("protocol").Clone();
    }

    public static Dictionary<string, object?> Message(string type, params (string Name, object? Value)[] fields)
    {
        var result = new Dictionary<string, object?> { ["protocol"] = Version, ["type"] = type };
        foreach (var (name, value) in fields) result.Add(name, value);
        return result;
    }

    public static byte[] Serialize(Dictionary<string, object?> message, string state)
    {
        var data = JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions);
        using var doc = JsonDocument.Parse(data);
        if (data.Length > Limit("maximumTextFrameBytes") || !Valid(doc.RootElement, "mac_to_panel", state))
            throw new InvalidOperationException("An outgoing message did not match the display protocol.");
        return data;
    }

    public static bool Valid(JsonElement value, string direction, string state)
    {
        if (value.ValueKind != JsonValueKind.Object || !Unique(value) ||
            !value.TryGetProperty("protocol", out var version) ||
            version.ValueKind != JsonValueKind.Number || !version.TryGetDouble(out var n) || n != Version ||
            !value.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String ||
            !Messages.TryGetValue(type.GetString()!, out var rule) ||
            rule.GetProperty("direction").GetString() is not { } allowed ||
            (allowed != direction && allowed != "bidirectional") ||
            !rule.GetProperty("states").EnumerateArray().Any(s => s.GetString() == state) ||
            !Fields(value, rule.GetProperty("fields"))) return false;

        if (rule.TryGetProperty("requiresWhen", out var conditions))
            foreach (var condition in conditions.EnumerateArray())
            {
                var present = value.TryGetProperty(condition.GetProperty("field").GetString()!, out var actual);
                var positive = condition.TryGetProperty("equals", out var expected);
                if (!positive) expected = condition.GetProperty("unlessEquals");
                if ((present && JsonElement.DeepEquals(actual, expected)) == positive &&
                    condition.GetProperty("required").EnumerateArray().Any(field => !value.TryGetProperty(field.GetString()!, out _)))
                    return false;
            }
        return true;
    }

    private static bool Unique(JsonElement value) =>
        value.EnumerateObject().Select(p => p.Name).Distinct(StringComparer.Ordinal).Count() == value.EnumerateObject().Count();

    private static bool Fields(JsonElement value, JsonElement fields)
    {
        foreach (var field in fields.EnumerateObject())
        {
            if (!value.TryGetProperty(field.Name, out var item))
            {
                if (field.Value.TryGetProperty("optional", out var optional) && optional.GetBoolean()) continue;
                return false;
            }
            if (!Field(item, field.Value)) return false;
        }
        return true;
    }

    private static bool Field(JsonElement value, JsonElement rule)
    {
        switch (rule.GetProperty("type").GetString())
        {
            case "string":
                if (value.ValueKind != JsonValueKind.String) return false;
                string s;
                try { s = value.GetString()!; }
                catch (InvalidOperationException) { return false; }
                if (s.IndexOf((char)0) >= 0) return false;
                var length = Encoding.UTF8.GetByteCount(s);
                if (length < rule.GetProperty("minLength").GetInt32() ||
                    length > rule.GetProperty("maxLength").GetInt32()) return false;
                if (rule.TryGetProperty("enum", out var choices) && !choices.EnumerateArray().Any(c => c.GetString() == s))
                    return false;
                if (!rule.TryGetProperty("pattern", out var pattern)) return true;
                return pattern.GetString() switch
                {
                    "hex64" => s.Length == 64 && s.All(Uri.IsHexDigit),
                    { } expression => Regex.IsMatch(s, expression, RegexOptions.CultureInvariant | RegexOptions.NonBacktracking),
                    _ => false
                };
            case "boolean":
                return value.ValueKind is JsonValueKind.True or JsonValueKind.False;
            case "number":
            case "integer":
                return value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var n) &&
                    n >= rule.GetProperty("minimum").GetDouble() && n <= rule.GetProperty("maximum").GetDouble() &&
                    (rule.GetProperty("type").GetString() != "integer" || Math.Truncate(n) == n);
            case "object":
                return value.ValueKind == JsonValueKind.Object && Unique(value) && Fields(value, rule.GetProperty("fields"));
            case "array":
                return value.ValueKind == JsonValueKind.Array && value.GetArrayLength() <= rule.GetProperty("maxItems").GetInt32() &&
                    value.EnumerateArray().All(item => Field(item, rule.GetProperty("items")));
            default:
                return false;
        }
    }

    public static string Text(JsonElement value, string key) => value.TryGetProperty(key, out var entry) ? entry.GetString() ?? "" : "";
    public static uint UInt(JsonElement value, string key) => (uint)value.GetProperty(key).GetDouble();
    public static string Hash(ReadOnlySpan<byte> bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
    public static string Hash(string value) => Hash(Encoding.UTF8.GetBytes(value));
    public static string Sign(ReadOnlySpan<byte> key, uint sequence, string nonce) =>
        Convert.ToHexStringLower(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(FormattableString.Invariant($"auth.request|{sequence}|{nonce}"))));
    public static string Bound(string text, int bytes)
    {
        var result = new StringBuilder();
        foreach (var c in text.EnumerateRunes())
        {
            if (c.Utf8SequenceLength > bytes) break;
            result.Append(c.ToString());
            bytes -= c.Utf8SequenceLength;
        }
        return result.ToString();
    }
}

internal sealed record DisplayEndpoint(Uri Socket, Uri Settings)
{
    public Uri PairingPage => new UriBuilder(Settings) { Query = "tab=connectors&connector=mac_companion" }.Uri;

    public static DisplayEndpoint Parse(string value)
    {
        var raw = value.Trim();
        if (!Uri.TryCreate(raw.Contains("://", StringComparison.Ordinal) ? raw : "wss://" + raw,
                UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("http" or "https" or "ws" or "wss") || uri.UserInfo.Length != 0 ||
            uri.Port == 0 || !IsLocalHost(uri.DnsSafeHost))
            throw new ArgumentException("Enter a local display IP address or a .local name.");

        // Uri.Port returns the scheme default even when no port was supplied.
        var schemeSeparator = raw.IndexOf("://", StringComparison.Ordinal);
        var authority = raw[(schemeSeparator < 0 ? 0 : schemeSeparator + 3)..].Split('/', '?', '#')[0];
        var explicitPort = authority[(authority.LastIndexOf(']') + 1)..].Contains(':');
        var socket = new UriBuilder(uri) { Scheme = "wss", Port = explicitPort ? uri.Port : 8443,
            Path = Protocol.SocketPath, Query = "", Fragment = "" }.Uri;
        var settings = new UriBuilder(uri) { Scheme = uri.Scheme == "https" ? "https" : "http", Port = -1,
            Path = "/", Query = "", Fragment = "" }.Uri;
        return new(socket, settings);
    }

    private static bool IsLocalHost(string host)
    {
        if (IPAddress.TryParse(host, out var ip)) return IsLocalAddress(ip);
        host = host.TrimEnd('.');
        return host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".local", StringComparison.OrdinalIgnoreCase) ||
            host.EndsWith(".home.arpa", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsLocalAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var b = address.GetAddressBytes();
        if (IPAddress.IsLoopback(address)) return true;
        return b.Length == 4
            ? b[0] == 10 || (b[0] == 172 && b[1] is >= 16 and <= 31) ||
              (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254)
            : (b[0] & 0xfe) == 0xfc || address.IsIPv6LinkLocal;
    }

    // Dial the checked IP directly. A local-looking hostname cannot redirect pairing
    // traffic to a public address or through a system-configured proxy.
    public static async ValueTask<Stream> ConnectLocal(SocketsHttpConnectionContext context, CancellationToken token)
    {
        var host = context.DnsEndPoint.Host.Trim('[', ']');
        var addresses = IPAddress.TryParse(host, out var address) ? [address] :
            await Dns.GetHostAddressesAsync(host, token);
        foreach (var ip in addresses.Where(IsLocalAddress))
        {
            var socket = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                using var attempt = CancellationTokenSource.CreateLinkedTokenSource(token);
                attempt.CancelAfter(TimeSpan.FromSeconds(3));
                await socket.ConnectAsync(ip, context.DnsEndPoint.Port, attempt.Token);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (Exception e) when (e is SocketException or OperationCanceledException)
            {
                socket.Dispose();
                token.ThrowIfCancellationRequested();
            }
        }
        throw new IOException("The display did not respond at a local network address.");
    }
}
