using System.IO;
using System.IO.Ports;

namespace EspDesktop.Core;

// The display's serial bridge carries the original TLS stream. The WebSocket
// client still handles encryption, certificate pinning and Companion pairing.
internal sealed class UsbDisplayStream(Stream serial) : Stream
{
    private const int MaxPayload = 1024;
    private const byte End = 0xc0, Escape = 0xdb;
    private const byte Open = 1, Data = 2, CloseFrame = 3;
    private readonly byte[] input = new byte[4096], frame = new byte[MaxPayload + 1];
    private readonly object writeLock = new();
    private int inputOffset, inputCount, frameLength, payloadOffset, payloadCount;
    private bool framed, escaped, ready;
    private volatile bool disposed;

    public static async ValueTask<Stream> Connect(string portName, CancellationToken token)
    {
        // The Guition's USB-to-UART bridge uses 460800. Native USB carries the
        // bytes directly and does not use the configured UART bit rate.
        var port = new SerialPort(portName, 460800)
        {
            // Buffer serial bursts while downloading the display’s editor bundle.
            ReadTimeout = 30, WriteTimeout = 1000, ReadBufferSize = 65536,
            Handshake = Handshake.None, DtrEnable = false, RtsEnable = false
        };
        Stream? connected = null;
        try
        {
            connected = await Task.Run(() =>
            {
                port.Open();
                port.DiscardInBuffer();
                return Start(port.BaseStream, token);
            }, token).ConfigureAwait(false);
            return connected;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or InvalidOperationException or TimeoutException)
        {
            throw new IOException($"Couldn’t connect to the display on {portName}.", e);
        }
        catch (ArgumentException e)
        {
            throw new IOException($"Windows couldn’t configure {portName} for the display.", e);
        }
        finally
        {
            // Once opened, the stream owns the underlying serial handle.
            if (connected is null)
            {
                try { port.Dispose(); }
                catch (IOException) { }
            }
        }
    }

    internal static UsbDisplayStream Start(Stream serial, CancellationToken token)
    {
        var stream = new UsbDisplayStream(serial);
        try
        {
            token.ThrowIfCancellationRequested();
            stream.SendFrame(Open, []);
            while (stream.ReadFrame(token) != Open || stream.frameLength != 1) { }
            stream.ready = true;
            return stream;
        }
        catch
        {
            stream.Dispose();
            throw;
        }
    }

    private byte ReadFrame(CancellationToken token)
    {
        frameLength = 0;
        while (true)
        {
            token.ThrowIfCancellationRequested();
            ObjectDisposedException.ThrowIf(disposed, this);
            if (inputOffset == inputCount)
            {
                try { inputCount = serial.Read(input, 0, input.Length); }
                catch (TimeoutException) { continue; }
                if (inputCount == 0) throw new IOException("The USB display disconnected.");
                inputOffset = 0;
            }

            while (inputOffset < inputCount)
            {
                var value = input[inputOffset++];
                if (value == End)
                {
                    var complete = framed && !escaped && frameLength > 0;
                    framed = true;
                    escaped = false;
                    if (complete)
                    {
                        payloadOffset = 1;
                        payloadCount = frameLength - 1;
                        return frame[0];
                    }
                    frameLength = 0;
                    continue;
                }

                if (!framed) continue;
                if (escaped)
                {
                    escaped = false;
                    if (value is not (0xdc or 0xdd))
                    {
                        framed = false;
                        continue;
                    }
                    value = value == 0xdc ? End : Escape;
                }
                else if (value == Escape)
                {
                    escaped = true;
                    continue;
                }

                if (frameLength < frame.Length) frame[frameLength++] = value;
                else framed = false;
            }
        }
    }

    private int ReadPayload(Memory<byte> buffer, CancellationToken token)
    {
        if (buffer.Length == 0) return 0;
        while (payloadCount == 0)
        {
            var kind = ReadFrame(token);
            if (kind == CloseFrame && payloadCount == 0) return 0;
            if (kind != Data) payloadCount = 0;
        }

        var count = Math.Min(buffer.Length, payloadCount);
        frame.AsMemory(payloadOffset, count).CopyTo(buffer);
        payloadOffset += count;
        payloadCount -= count;
        return count;
    }

    private int WriteFrame(ReadOnlySpan<byte> payload)
    {
        lock (writeLock)
        {
            ObjectDisposedException.ThrowIf(disposed, this);
            return SendFrame(Data, payload);
        }
    }

    private int SendFrame(byte kind, ReadOnlySpan<byte> payload)
    {
        Span<byte> encoded = stackalloc byte[2 * MaxPayload + 3];
        var length = 0;
        encoded[length++] = End;
        encoded[length++] = kind;
        foreach (var value in payload)
        {
            if (value is End or Escape)
            {
                encoded[length++] = Escape;
                encoded[length++] = value == End ? (byte)0xdc : (byte)0xdd;
            }
            else encoded[length++] = value;
        }
        encoded[length++] = End;
        try { serial.Write(encoded[..length]); }
        catch (TimeoutException e) { throw new IOException("The USB display stopped receiving data.", e); }
        return length;
    }

    // Windows serial reads use a short synchronous timeout so a pending read
    // can observe cancellation even when the driver has no incoming data.
    public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default) =>
        new(Task.Run(() => ReadPayload(buffer, token), token));

    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default)
    {
        while (!buffer.IsEmpty)
        {
            var chunk = buffer[..Math.Min(buffer.Length, MaxPayload)];
            var size = await Task.Run(() => WriteFrame(chunk.Span), token).ConfigureAwait(false);
            buffer = buffer[chunk.Length..];
            // Keep native USB bursts within the rate the panel can drain.
            await Task.Delay(TimeSpan.FromSeconds(size / 32000.0), token).ConfigureAwait(false);
        }
    }

    public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken token) =>
        ReadAsync(buffer.AsMemory(offset, count), token).AsTask();
    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken token) =>
        WriteAsync(buffer.AsMemory(offset, count), token).AsTask();
    public override int Read(byte[] buffer, int offset, int count) =>
        ReadPayload(buffer.AsMemory(offset, count), CancellationToken.None);
    public override void Write(byte[] buffer, int offset, int count) =>
        WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            lock (writeLock)
            {
                if (!disposed)
                {
                    disposed = true;
                    try { if (ready) SendFrame(CloseFrame, []); }
                    catch (IOException) { }
                    try { serial.Dispose(); }
                    catch (IOException) { }
                }
            }
        }
        base.Dispose(disposing);
    }

    public override bool CanRead => !disposed;
    public override bool CanWrite => !disposed;
    public override bool CanSeek => false;
    public override void Flush() { }
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
}
