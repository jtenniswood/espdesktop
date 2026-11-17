using System.IO.MemoryMappedFiles;
using System.Runtime.Versioning;
using System.Text;

namespace EspDesktop.Windows;

internal sealed record RaceSnapshot(float? FuelLitres, int? Lap, float? DeltaSeconds, bool? OnPitRoad, string? Flag);

[SupportedOSPlatform("windows")]
internal sealed class IracingTelemetry : IDisposable
{
    private MemoryMappedViewAccessor? view;
    private IracingTelemetryReader? reader;
    private long lastTick;
    private RaceSnapshot? latest;
    private bool observedTick;

    public RaceSnapshot? Sample()
    {
        try
        {
            if (view is null)
            {
                using var mapping = MemoryMappedFile.OpenExisting(@"Local\IRSDKMemMapFileName", MemoryMappedFileRights.Read);
                view = mapping.CreateViewAccessor(0, 0, MemoryMappedFileAccess.Read);
                reader = new IracingTelemetryReader(view);
                lastTick = Environment.TickCount64;
            }

            if (reader!.TryRead(out var snapshot))
            {
                lastTick = Environment.TickCount64;
                if (observedTick) latest = snapshot;
                observedTick = true;
                return latest;
            }

            if (!reader.Connected || Environment.TickCount64 - lastTick >= 2000)
                Dispose();
            return latest;
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            Dispose();
        }
        return null;
    }

    public void Dispose()
    {
        view?.Dispose();
        view = null;
        reader = null;
        latest = null;
        observedTick = false;
    }
}

internal sealed class IracingTelemetryReader(MemoryMappedViewAccessor view)
{
    // Layout of irsdk_header, irsdk_varBuf and irsdk_varHeader in irsdk_defines.h.
    private const int HeaderBytes = 112;
    private const int BufferTable = 48;
    private const int BufferEntryBytes = 16;
    private const int FieldEntryBytes = 144;
    private const int FieldNameBytes = 32;
    private const int Bool = 1, Int = 2, BitField = 3, Float = 4;
    private static readonly Dictionary<string, int> ExpectedFields = new(StringComparer.Ordinal)
    {
        ["IsOnTrack"] = Bool,
        ["IsReplayPlaying"] = Bool,
        ["FuelLevel"] = Float,
        ["Lap"] = Int,
        ["LapDeltaToSessionBestLap"] = Float,
        ["LapDeltaToSessionBestLap_OK"] = Bool,
        ["SessionNum"] = Int,
        ["OnPitRoad"] = Bool,
        ["SessionFlags"] = BitField,
    };

    private readonly Dictionary<string, int> offsets = new(StringComparer.Ordinal);
    private (int Count, int Offset, int RowSize)? fieldTable;
    private int? lastSampleTick;
    private int? lastSession;

    public bool Connected => view.Capacity >= HeaderBytes &&
        view.ReadInt32(0) == 2 && (view.ReadInt32(4) & 1) != 0;

    public bool TryRead(out RaceSnapshot? snapshot)
    {
        snapshot = null;
        if (!Connected)
            return false;

        var buffers = view.ReadInt32(32);
        var rowSize = view.ReadInt32(36);
        var count = view.ReadInt32(24);
        var tableOffset = view.ReadInt32(28);
        if (buffers is < 1 or > 4 || rowSize is < 1 or > 65536 || count is < 1 or > 4096 ||
            tableOffset < HeaderBytes || tableOffset + (long)count * FieldEntryBytes > view.Capacity)
            return false;

        if (fieldTable != (count, tableOffset, rowSize))
        {
            fieldTable = (count, tableOffset, rowSize);
            ReadFieldOffsets(count, tableOffset, rowSize);
        }

        var slot = BufferTable;
        var tick = view.ReadInt32(slot);
        for (var index = 1; index < buffers; index++)
        {
            var candidate = BufferTable + index * BufferEntryBytes;
            var candidateTick = view.ReadInt32(candidate);
            if (unchecked(candidateTick - tick) > 0)
                (slot, tick) = (candidate, candidateTick);
        }

        if (lastSampleTick == tick)
            return false;

        var row = (long)view.ReadInt32(slot + 4);
        if (row < HeaderBytes || row + rowSize > view.Capacity)
            return false;

        var session = ReadInt("SessionNum", row);
        var flags = ReadInt("SessionFlags", row);
        var driving = ReadBool("IsOnTrack", row) == true && ReadBool("IsReplayPlaying", row) != true;
        var fuel = ReadFloat("FuelLevel", row);
        var lap = ReadInt("Lap", row);
        var delta = ReadFloat("LapDeltaToSessionBestLap", row);
        var pit = ReadBool("OnPitRoad", row);
        var sample = driving ? new RaceSnapshot(
            fuel is >= 0 and <= 1000 ? fuel : null,
            lap is >= 1 and <= 10000 ? lap : null,
            session.HasValue && session == lastSession && lap is >= 1 && ReadBool("LapDeltaToSessionBestLap_OK", row) == true &&
                delta is >= -999 and <= 999 ? delta : null,
            pit,
            Flag(flags)
        ) : null;

        // The simulator can rotate into this buffer while the fields are being read.
        if (view.ReadInt32(slot) != tick || view.ReadInt32(slot + 4) != row || !Connected)
            return false;

        lastSampleTick = tick;
        lastSession = driving ? session : null;
        snapshot = sample;
        return true;
    }

    private void ReadFieldOffsets(int count, long table, int rowSize)
    {
        offsets.Clear();
        var nameBytes = new byte[FieldNameBytes];
        for (var index = 0; index < count; index++)
        {
            var entry = table + index * FieldEntryBytes;
            view.ReadArray(entry + 16, nameBytes, 0, nameBytes.Length);
            var end = Array.IndexOf(nameBytes, (byte)0);
            if (end < 1)
                continue;
            var name = Encoding.ASCII.GetString(nameBytes, 0, end);
            if (!ExpectedFields.TryGetValue(name, out var type) || view.ReadInt32(entry) != type ||
                view.ReadInt32(entry + 8) != 1)
                continue;
            var offset = view.ReadInt32(entry + 4);
            var size = type == Bool ? 1 : 4;
            if (offset >= 0 && offset <= rowSize - size)
                offsets.TryAdd(name, offset);
        }
    }

    private bool? ReadBool(string field, long row) =>
        offsets.TryGetValue(field, out var offset) ? view.ReadByte(row + offset) != 0 : null;

    private int? ReadInt(string field, long row) =>
        offsets.TryGetValue(field, out var offset) ? view.ReadInt32(row + offset) : null;

    private float? ReadFloat(string field, long row) =>
        offsets.TryGetValue(field, out var offset) ? view.ReadSingle(row + offset) : null;

    private static string? Flag(int? flags)
    {
        if (flags is not int value)
            return null;
        const int checkered = 0x0001;
        const int yellowOrCaution = 0x0008 | 0x0100 | 0x4000 | 0x8000;
        if ((value & checkered) != 0)
            return "checkered";
        return (value & yellowOrCaution) != 0 ? "yellow" : "none";
    }
}
