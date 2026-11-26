using System.Buffers.Binary;
using System.IO;

namespace EspDesktop.Core;

// The firmware makes one HTTP socket available within the authenticated USB session.
internal sealed class UsbEditorTunnel(Func<byte[], CancellationToken, Task> send, CancellationToken session)
{
    private const int HeaderSize = 9, ChunkSize = 4096;
    private const byte Open = 1, WriteChunk = 2, ReadChunk = 3, Close = 4;
    private const byte Ok = 0, Wait = 1, End = 2;
    private readonly object sync = new();
    private readonly SemaphoreSlim commands = new(1);
    private uint id;
    private TaskCompletionSource<byte[]>? pending;

    public CancellationToken Session => session;

    public void Receive(ReadOnlySpan<byte> message)
    {
        if (message.Length is < HeaderSize or > HeaderSize + ChunkSize || !message[..4].SequenceEqual("UED1"u8))
            return;
        lock (sync)
        {
            if (pending is null || BinaryPrimitives.ReadUInt32BigEndian(message[5..]) != id) return;
            var result = new byte[1 + message.Length - HeaderSize];
            result[0] = message[4];
            message[HeaderSize..].CopyTo(result.AsSpan(1));
            pending.TrySetResult(result);
        }
    }

    private async Task<byte[]> Command(byte command, ReadOnlyMemory<byte> body, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token, session);
        deadline.CancelAfter(TimeSpan.FromSeconds(8));
        await commands.WaitAsync(deadline.Token).ConfigureAwait(false);
        var reply = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        var frame = new byte[HeaderSize + body.Length];
        "UED1"u8.CopyTo(frame);
        frame[4] = command;
        lock (sync)
        {
            BinaryPrimitives.WriteUInt32BigEndian(frame.AsSpan(5), ++id);
            pending = reply;
        }
        body.CopyTo(frame.AsMemory(HeaderSize));
        try
        {
            deadline.Token.ThrowIfCancellationRequested();
            // An editor cancellation may stop waiting for the reply. Finish
            // sending the frame so it does not abort the Companion WebSocket.
            await send(frame, session).ConfigureAwait(false);
            return await reply.Task.WaitAsync(deadline.Token).ConfigureAwait(false);
        }
        finally
        {
            lock (sync) pending = null;
            commands.Release();
        }
    }

    public async ValueTask<Stream> OpenAsync(CancellationToken token)
    {
        var result = await Command(Open, default, token).ConfigureAwait(false);
        if (result is not [Ok]) throw new IOException("The display could not open its USB editor.");
        return new HttpStream(this);
    }

    public async Task CloseAsync()
    {
        if (session.IsCancellationRequested) return;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
        try { await Command(Close, default, timeout.Token).ConfigureAwait(false); }
        catch (Exception e) when (e is IOException or OperationCanceledException or System.Net.WebSockets.WebSocketException) { }
    }

    private sealed class HttpStream(UsbEditorTunnel tunnel) : Stream
    {
        private ReadOnlyMemory<byte> unread;
        private bool ended;

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        {
            if (buffer.IsEmpty || ended) return 0;
            while (unread.IsEmpty)
            {
                byte[] result;
                try { result = await tunnel.Command(ReadChunk, default, token).ConfigureAwait(false); }
                catch (OperationCanceledException) when (!token.IsCancellationRequested && !tunnel.Session.IsCancellationRequested)
                { throw new IOException("The USB editor stopped receiving data from the display."); }
                if (result is [End]) { ended = true; return 0; }
                if (result is [Wait])
                {
                    await Task.Delay(15, token).ConfigureAwait(false);
                    continue;
                }
                if (result.Length < 2 || result[0] != Ok) throw new IOException("Invalid USB editor read.");
                unread = result.AsMemory(1);
            }
            var count = Math.Min(buffer.Length, unread.Length);
            unread[..count].CopyTo(buffer);
            unread = unread[count..];
            return count;
        }

        public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default)
        {
            while (!buffer.IsEmpty)
            {
                var count = Math.Min(ChunkSize, buffer.Length);
                var result = await tunnel.Command(WriteChunk, buffer[..count], token).ConfigureAwait(false);
                if (result is [Wait])
                {
                    await Task.Delay(15, token).ConfigureAwait(false);
                    continue;
                }
                if (result.Length != 3 || result[0] != Ok) throw new IOException("Invalid USB editor write.");
                var written = BinaryPrimitives.ReadUInt16BigEndian(result.AsSpan(1));
                if (written == 0 || written > count) throw new IOException("Invalid USB editor write size.");
                buffer = buffer[written..];
            }
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken token) =>
            ReadAsync(buffer.AsMemory(offset, count), token).AsTask();
        public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken token) =>
            WriteAsync(buffer.AsMemory(offset, count), token).AsTask();
        public override bool CanRead => true;
        public override bool CanWrite => true;
        public override bool CanSeek => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
    }
}
