using System.IO;

namespace EspDesktop.Core;

internal sealed record UsbPort(string Name, bool Native)
{
    public string Endpoint => "usb:" + Name;

    public static string? PortName(string value)
    {
        if (!value.StartsWith("usb:COM", StringComparison.OrdinalIgnoreCase) ||
            !int.TryParse(value.AsSpan(7), System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out var port) || port is < 1 or > 65535)
            return null;
        var name = $"COM{port}";
        return value.AsSpan(4).Equals(name, StringComparison.OrdinalIgnoreCase) ? name : null;
    }

    public static void ValidateAddress(string value)
    {
        if (PortName(value) == null) _ = DisplayEndpoint.Parse(value);
    }
}

internal abstract class DuplexStream : Stream
{
    public override bool CanRead => true;
    public override bool CanWrite => true;
    public override bool CanSeek => false;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
    public override void Flush() { }
    public override int Read(byte[] buffer, int offset, int count) =>
        ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    public override void Write(byte[] buffer, int offset, int count) =>
        WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken token) =>
        ReadAsync(buffer.AsMemory(offset, count), token).AsTask();
    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken token) =>
        WriteAsync(buffer.AsMemory(offset, count), token).AsTask();
    public abstract override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default);
    public abstract override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default);
}

// The firmware's USB bridge carries the original TLS stream in SLIP frames.
internal sealed class UsbTransport(Stream serial, bool native) : DuplexStream
{
    private const byte End = 0xc0, Escape = 0xdb, Open = 1, Data = 2, CloseFrame = 3;
    private const int PayloadLimit = 1024;
    private readonly byte[] incoming = new byte[PayloadLimit];
    private readonly byte[] frame = new byte[PayloadLimit + 1];
    private int offset, available, frameLength, payloadOffset;
    private bool framing, escaped;
    private int disposed;

    public async Task OpenAsync(CancellationToken token)
    {
        await serial.WriteAsync(Encode(Open, []), token);
        while (await ReadFrame(token) is { } kind)
        {
            if (kind == Open && frameLength == 1) return;
        }
        throw new IOException("The USB port did not respond as an EspDesktop display.");
    }

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
    {
        if (buffer.IsEmpty) return 0;
        while (payloadOffset == 0 || payloadOffset >= frameLength)
        {
            if (await ReadFrame(token) is not { } kind || kind == CloseFrame) return 0;
            if (kind == Data && frameLength > 1) payloadOffset = 1;
        }
        var length = Math.Min(buffer.Length, frameLength - payloadOffset);
        frame.AsMemory(payloadOffset, length).CopyTo(buffer);
        payloadOffset += length;
        return length;
    }

    private async ValueTask<byte?> ReadFrame(CancellationToken token)
    {
        if (framing && frameLength > 0 && !escaped) frameLength = 0;
        payloadOffset = 0;
        while (true)
        {
            if (offset == available)
            {
                available = await serial.ReadAsync(incoming.AsMemory(), token);
                if (available == 0) return null;
                offset = 0;
            }
            var value = incoming[offset++];
            if (value == End)
            {
                var complete = framing && !escaped && frameLength > 0;
                framing = true;
                escaped = false;
                if (complete) return frame[0];
                frameLength = 0;
                continue;
            }
            if (!framing) continue;
            if (escaped)
            {
                escaped = false;
                if (value == 0xdc) value = End;
                else if (value == 0xdd) value = Escape;
                else { framing = false; continue; }
            }
            else if (value == Escape) { escaped = true; continue; }

            if (frameLength == frame.Length) framing = false;
            else frame[frameLength++] = value;
        }
    }

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default)
    {
        for (var i = 0; i < buffer.Length; i += PayloadLimit)
        {
            var encoded = Encode(Data, buffer.Span.Slice(i, Math.Min(buffer.Length - i, PayloadLimit)));
            await serial.WriteAsync(encoded.AsMemory(), token);
            // The native controller can outrun the panel's receive buffer.
            if (native) await Task.Delay(TimeSpan.FromSeconds(encoded.Length / 32_000.0), token);
        }
    }

    internal static byte[] Encode(byte kind, ReadOnlySpan<byte> payload)
    {
        var bytes = new byte[3 + payload.Length * 2];
        var i = 0;
        bytes[i++] = End;
        bytes[i++] = kind;
        foreach (var value in payload)
        {
            if (value is End or Escape)
            {
                bytes[i++] = Escape;
                bytes[i++] = value == End ? (byte)0xdc : (byte)0xdd;
            }
            else bytes[i++] = value;
        }
        bytes[i++] = End;
        return bytes[..i];
    }

    protected override void Dispose(bool disposing)
    {
        if (!disposing || Interlocked.Exchange(ref disposed, 1) != 0) return;
        using var deadline = new CancellationTokenSource(TimeSpan.FromMilliseconds(250));
        try { serial.WriteAsync(Encode(CloseFrame, []).AsMemory(), deadline.Token).AsTask().GetAwaiter().GetResult(); }
        catch (Exception e) when (e is IOException or ObjectDisposedException or OperationCanceledException) { }
        finally { serial.Dispose(); }
        base.Dispose(disposing);
    }
}
