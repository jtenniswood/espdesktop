using System.Buffers.Binary;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;

namespace EspDesktop.Core;

internal sealed record DiscoveredDisplay(string Address, string Name, string Fingerprint);

internal static class Discovery
{
    private const string Service = "_espdesktop._tcp.local";
    private static readonly IPEndPoint Multicast = new(IPAddress.Parse("224.0.0.251"), 5353);

    public static async Task<DiscoveredDisplay[]> Find(CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(2));
        var interfaces = NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.SupportsMulticast &&
                        n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .SelectMany(n => n.GetIPProperties().UnicastAddresses)
            .Select(n => n.Address).Where(a => a.AddressFamily == AddressFamily.InterNetwork).Distinct().Take(12);
        var replies = await Task.WhenAll(interfaces.Select(address => Scan(address, timeout.Token)));
        token.ThrowIfCancellationRequested();
        return replies.SelectMany(r => r).DistinctBy(r => r.Fingerprint).OrderBy(r => r.Name).ToArray();
    }

    private static async Task<DiscoveredDisplay[]> Scan(IPAddress address, CancellationToken token)
    {
        var all = new List<Record>();
        try
        {
            using var client = new UdpClient(new IPEndPoint(address, 0));
            client.Ttl = 1;
            client.Client.SetSocketOption(SocketOptionLevel.IP, SocketOptionName.MulticastInterface, address.GetAddressBytes());
            // An ephemeral source port requests legacy unicast replies. No inbound
            // firewall rule or shared bind to the system mDNS port is needed.
            var ids = new Dictionary<ushort, string>();
            await Ask(Service, 12);
            while (all.Count < 512)
            {
                var reply = await client.ReceiveAsync(token);
                if (reply.RemoteEndPoint.Port != 5353 || !DisplayEndpoint.IsLocalAddress(reply.RemoteEndPoint.Address) ||
                    reply.Buffer.Length < 12 || !ids.ContainsKey(Read16(reply.Buffer, 0))) continue;
                var records = Read(reply.Buffer);
                foreach (var record in records)
                    if (!all.Contains(record)) all.Add(record);
                foreach (var instance in all.Where(r => r.Kind == 12 && r.Name == Service).Select(r => r.Target)
                    .OfType<string>().Distinct().Take(24).ToArray())
                {
                    if (!instance.EndsWith("." + Service, StringComparison.Ordinal)) continue;
                    if (!ids.Values.Contains("33:" + instance) && !all.Any(r => r.Name == instance && r.Kind == 33))
                        await Ask(instance, 33);
                    if (!ids.Values.Contains("16:" + instance) && !all.Any(r => r.Name == instance && r.Kind == 16))
                        await Ask(instance, 16);
                }
            }

            async Task Ask(string name, ushort type)
            {
                var id = (ushort)(ids.Count + 1);
                ids.Add(id, type + ":" + name);
                await client.SendAsync(Query(name, id, type), Multicast, token);
            }
        }
        catch (Exception e) when (e is SocketException or OperationCanceledException or IOException) { }
        return Join(all);
    }

    internal static DiscoveredDisplay[] ParsePackets(params byte[][] packets) => Join(packets.SelectMany(Read).ToArray());

    internal static string? FriendlyName(string? value)
    {
        if (value is null) return null;
        var clean = string.Concat(value.Where(c => !char.IsControl(c) &&
            c is not (>= '\u202a' and <= '\u202e' or >= '\u2066' and <= '\u2069'))).Trim();
        return clean.Length == 0 ? null : Protocol.Bound(clean, 96);
    }

    private static DiscoveredDisplay[] Join(IReadOnlyList<Record> records)
    {
        var results = new List<DiscoveredDisplay>();
        foreach (var entry in records.Where(r => r.Kind == 12 && r.Name == Service))
        {
            var srv = records.FirstOrDefault(r => r.Kind == 33 && r.Name == entry.Target);
            var txt = records.FirstOrDefault(r => r.Kind == 16 && r.Name == entry.Target)?.Text;
            if (srv?.Target is not { } host || srv.Port == 0 || !host.EndsWith(".local", StringComparison.Ordinal) ||
                !host.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.') ||
                txt is null || txt.GetValueOrDefault("v") != "1" || txt.GetValueOrDefault("id") is not { Length: 64 } id ||
                !id.All(Uri.IsHexDigit)) continue;
            var ip = records.FirstOrDefault(r => r.Kind == 1 && r.Name == host)?.Target;
            var address = $"{ip ?? host}:{srv.Port}";
            results.Add(new(address, FriendlyName(txt.GetValueOrDefault("name")) ?? host, id.ToLowerInvariant()));
        }
        return results.DistinctBy(d => d.Fingerprint).ToArray();
    }

    private static byte[] Query(string name, ushort id, ushort type)
    {
        using var m = new MemoryStream();
        m.Write([(byte)(id >> 8), (byte)id, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
        foreach (var label in name.Split('.'))
        {
            var bytes = Encoding.UTF8.GetBytes(label);
            if (bytes.Length is < 1 or > 63) throw new IOException("Invalid service name.");
            m.WriteByte((byte)bytes.Length);
            m.Write(bytes);
        }
        m.Write([0, (byte)(type >> 8), (byte)type, 0, 1]);
        return m.ToArray();
    }

    private sealed record Record(string Name, int Kind, string? Target = null, int Port = 0, Dictionary<string, string>? Text = null);

    private static Record[] Read(byte[] data)
    {
        try
        {
            if (data.Length is < 12 or > 9000 || (data[2] & 0x82) != 0x80 || (data[3] & 15) != 0) return [];
            var offset = 12;
            var questions = Read16(data, 4);
            var count = Read16(data, 6) + Read16(data, 8) + Read16(data, 10);
            if (questions > 32 || count > 256) return [];
            for (var i = 0; i < questions; i++) { _ = ReadName(data, ref offset); offset += 4; }
            var records = new List<Record>();
            for (var i = 0; i < count; i++)
            {
                var name = ReadName(data, ref offset);
                var kind = Read16(data, offset);
                var cls = Read16(data, offset + 2) & 0x7fff;
                var size = Read16(data, offset + 8);
                var start = offset + 10;
                offset = start + size;
                if (offset > data.Length) return [];
                if (cls != 1) continue;
                if (kind == 12 || (kind == 33 && size >= 7))
                {
                    var read = start + (kind == 33 ? 6 : 0);
                    var target = ReadName(data, ref read);
                    if (read <= offset) records.Add(new(name, kind, target, kind == 33 ? Read16(data, start + 4) : 0));
                }
                else if (kind == 1 && size == 4)
                {
                    var ip = new IPAddress(data.AsSpan(start, 4));
                    if (DisplayEndpoint.IsLocalAddress(ip) && !IPAddress.IsLoopback(ip)) records.Add(new(name, kind, ip.ToString()));
                }
                else if (kind == 16)
                {
                    var txt = new Dictionary<string, string>(StringComparer.Ordinal);
                    for (var next = start; next < offset;)
                    {
                        var length = data[next++];
                        if (next + length > offset) return [];
                        var text = Encoding.UTF8.GetString(data, next, length);
                        var equals = text.IndexOf('=');
                        if (equals > 0) txt.TryAdd(text[..equals], text[(equals + 1)..]);
                        next += length;
                    }
                    records.Add(new(name, kind, Text: txt));
                }
            }
            return [.. records];
        }
        catch (Exception e) when (e is ArgumentOutOfRangeException or IndexOutOfRangeException or IOException) { return []; }
    }

    private static ushort Read16(byte[] data, int offset) => BinaryPrimitives.ReadUInt16BigEndian(data.AsSpan(offset, 2));

    private static string ReadName(byte[] data, ref int offset)
    {
        var labels = new List<string>();
        var read = offset;
        var jumped = false;
        var length = 0;
        for (var i = 0; i < 128; i++)
        {
            var size = data[read++];
            if (size == 0)
            {
                if (!jumped) offset = read;
                return string.Join('.', labels).ToLowerInvariant();
            }
            if ((size & 0xc0) == 0xc0)
            {
                var target = ((size & 0x3f) << 8) | data[read++];
                if (target >= read - 2) break;
                if (!jumped) offset = read;
                jumped = true;
                read = target;
            }
            else
            {
                length += size + 1;
                if (size > 63 || length > 255) break;
                labels.Add(Encoding.UTF8.GetString(data, read, size));
                read += size;
            }
        }
        throw new IOException("Malformed DNS name.");
    }
}
