using System.IO;

namespace EspDesktop.Tests;

internal sealed class UsbTestWire(byte[] input) : Stream
{
    private int offset;
    public MemoryStream Written { get; } = new();
    public override int Read(byte[] buffer, int index, int count)
    {
        var length = Math.Min(Math.Min(count, 2), input.Length - offset);
        input.AsSpan(offset, length).CopyTo(buffer.AsSpan(index));
        offset += length;
        return length;
    }
    public override void Write(byte[] buffer, int index, int count) => Written.Write(buffer, index, count);
    public override bool CanRead => true;
    public override bool CanWrite => true;
    public override bool CanSeek => false;
    public override void Flush() { }
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
    public override void SetLength(long value) => throw new NotSupportedException();
}
