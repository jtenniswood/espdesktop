using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using EspDesktop.Core;
using static EspDesktop.Core.Protocol;

namespace EspDesktop;

internal sealed class SystemMetrics
{
    private (ulong Total, ulong Idle)? previousCpu;
    private (string Id, long Bytes, long Time)? previousNetwork;

    public Dictionary<string, object?> Read(uint generation)
    {
        var fallback = Message("system_metrics", ("generation", generation), ("available", false));
        if (!GetSystemTimes(out var idle, out var kernel, out var user)) return fallback;
        var total = kernel + user;
        var cpu = previousCpu is { } previous && total > previous.Total && idle >= previous.Idle
            ? Percent((double)(total - previous.Total) - (idle - previous.Idle), total - previous.Total) : 0;
        previousCpu = (total, idle);
        var memory = new Memory { Length = (uint)Marshal.SizeOf<Memory>() };
        if (!GlobalMemoryStatusEx(ref memory) || memory.Total == 0) return fallback;

        var drives = new List<(string Id, string Label, double UsagePercent, bool System)>();
        foreach (var drive in DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed))
        {
            try
            {
                var system = drive.RootDirectory.FullName.Equals(Path.GetPathRoot(Environment.SystemDirectory), StringComparison.OrdinalIgnoreCase);
                var size = drive.TotalSize;
                if (size <= 0) continue;
                var letter = drive.Name[..1].ToUpperInvariant();
                var label = string.IsNullOrWhiteSpace(drive.VolumeLabel) ? $"{letter}:" : $"{drive.VolumeLabel} ({letter}:)";
                drives.Add((system ? "startup" : "drive-" + letter.ToLowerInvariant(), Bound(label, 96),
                    Percent(size - drive.TotalFreeSpace, size), system));
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
        }
        var boot = drives.FirstOrDefault(d => d.System);
        if (boot.Id is null) return fallback;
        var result = Message("system_metrics", ("generation", generation), ("cpuUsagePercent", cpu),
            ("memoryUsagePercent", Percent(memory.Total - Math.Min(memory.Total, memory.Available), memory.Total)),
            ("storageUsagePercent", boot.UsagePercent),
            ("storageDevices", drives.OrderByDescending(d => d.System).Take(16).Select(d =>
                new { id = d.Id, label = d.Label, usagePercent = d.UsagePercent }).ToArray()));
        if (GetSystemPowerStatus(out var power) && (power.Flags & 128) == 0 && power.Percent <= 100)
            result["batteryPercent"] = power.Percent;

        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType is not
                    (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel))
                .Select(n => (Nic: n, Ip: n.GetIPProperties())).ToArray();
            var primary = interfaces.FirstOrDefault(n => n.Ip.GatewayAddresses.Any(g =>
                !g.Address.Equals(IPAddress.Any) && !g.Address.Equals(IPAddress.IPv6Any))).Nic;
            if (primary != null)
            {
                var stats = primary.GetIPStatistics();
                var bytes = stats.BytesSent + stats.BytesReceived;
                var now = Stopwatch.GetTimestamp();
                if (previousNetwork is { } p && p.Id == primary.Id && bytes >= p.Bytes && now > p.Time)
                    result["networkThroughputKBps"] = Math.Clamp((bytes - p.Bytes) / Stopwatch.GetElapsedTime(p.Time, now).TotalSeconds / 1024, 0, 1e9);
                previousNetwork = (primary.Id, bytes, now);
            }
            result["networkInterfaces"] = interfaces.OrderByDescending(n => n.Nic == primary)
                .Select(n => new
                {
                    id = "net-" + Hash(n.Nic.Id)[..24],
                    label = Bound(n.Nic.Name, 128),
                    address = n.Ip.UnicastAddresses.Select(a => a.Address)
                        .OrderBy(a => a.AddressFamily == AddressFamily.InterNetwork ? 0 : a.IsIPv6LinkLocal ? 2 : 1)
                        .FirstOrDefault()?.ToString().Split('%')[0] ?? ""
                })
                .Where(n => n.label.Length > 0 && n.address.Length <= 45).Take(32).ToArray();
        }
        catch (NetworkInformationException) { previousNetwork = null; }
        return result;
    }

    private static double Percent(double used, double total) => Math.Clamp(100 * used / total, 0, 100);

    [StructLayout(LayoutKind.Sequential)]
    private struct Memory
    {
        public uint Length, Load;
        public ulong Total, Available, TotalPageFile, AvailablePageFile, TotalVirtual, AvailableVirtual, AvailableExtended;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Power { public byte Ac, Flags, Percent, Saver; public uint Life, FullLife; }

    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref Memory memory);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemTimes(out ulong idle, out ulong kernel, out ulong user);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetSystemPowerStatus(out Power power);
}

internal static class InputSession
{
    public static bool IsDefaultInputDesktop()
    {
        var desktop = OpenInputDesktop(0, false, 1);
        if (desktop == 0) return false;
        try
        {
            var name = new StringBuilder(128);
            return GetUserObjectInformationW(desktop, 2, name, name.Capacity * 2, out _) &&
                string.Equals(name.ToString(), "Default", StringComparison.OrdinalIgnoreCase);
        }
        finally { _ = CloseDesktop(desktop); }
    }

    public static bool Replay(nint window, ushort[] keys)
    {
        if (GetForegroundWindow() != window || !IsDefaultInputDesktop() || GetForegroundWindow() != window) return false;
        // Don't combine injected shortcuts with modifiers the user is physically holding.
        if (new[] { 0x10, 0x11, 0x12, 0x5b, 0x5c }.Any(k => (GetAsyncKeyState(k) & 0x8000) != 0)) return false;
        var events = keys.Select(k => Key(k, false)).Concat(keys.Reverse().Select(k => Key(k, true))).ToArray();
        var size = Marshal.SizeOf<Input>();
        var written = SendInput((uint)events.Length, events, size);
        if (written == events.Length) return true;
        if (written > 0)
        {
            var remaining = keys.Take((int)Math.Min(written, keys.Length)).Reverse().Select(k => Key(k, true)).ToArray();
            _ = SendInput((uint)remaining.Length, remaining, size);
        }
        return false;
    }

    private static Input Key(ushort key, bool up) => new()
    {
        Type = 1, Union = new() { Keyboard = new()
        {
            Key = key,
            Flags = (up ? 2u : 0) | (key is >= 0x21 and <= 0x28 or 0x2d or 0x2e ? 1u : 0)
        } }
    };

    [StructLayout(LayoutKind.Sequential)]
    private struct Input { public uint Type; public InputUnion Union; }
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput Keyboard;
        [FieldOffset(0)] public MouseInput Mouse;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput { public ushort Key, Scan; public uint Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public nuint Extra; }

    [DllImport("user32.dll")] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] public static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(nint window, out uint pid);
    [DllImport("user32.dll")] private static extern nint OpenInputDesktop(uint flags, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint access);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseDesktop(nint desktop);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetUserObjectInformationW(nint obj, int index, StringBuilder value, int length, out int needed);
}

internal static class Audio
{
    private const string Prefix = "media.";
    public static IEnumerable<(string, int?)> Read()
    {
        foreach (var name in new[] { "output", "input" })
        {
            var state = WithEndpoint(name == "input", endpoint =>
            {
                int? volume = endpoint.GetMasterVolumeLevelScalar(out var scalar) >= 0
                    ? Math.Clamp((int)Math.Round(scalar * 100), 0, 100) : null;
                int? mute = ReadMute(endpoint) is { } muted ? muted ? 100 : 0 : null;
                return (Volume: volume, Mute: mute);
            }, default);
            yield return (Prefix + name + "_volume", state.Volume);
            yield return (Prefix + name + "_mute", state.Mute);
        }
    }

    public static bool Set(string id, int value)
    {
        if (value is < 0 or > 100) return false;
        return WithEndpoint(id.StartsWith("media.input_", StringComparison.Ordinal), endpoint => id switch
        {
            "media.input_volume" or "media.output_volume" => SetLevel(value,
                level => endpoint.SetMasterVolumeLevelScalar(level, 0) >= 0,
                () => ReadMute(endpoint), muted => endpoint.SetMute(muted, 0) >= 0),
            "media.input_mute" or "media.output_mute" when value is 0 or 100 => endpoint.SetMute(value == 100, 0) >= 0,
            _ => false
        }, false);
    }

    internal static bool SetLevel(int value, Func<float, bool> writeLevel, Func<bool?> readMute, Func<bool, bool> writeMute)
    {
        if (!writeLevel(value / 100f)) return false;
        return value == 0 || readMute() != true || writeMute(false);
    }

    private static bool? ReadMute(IAudioEndpointVolume endpoint) => endpoint.GetMute(out var muted) >= 0 ? muted : null;

    private static T WithEndpoint<T>(bool input, Func<IAudioEndpointVolume, T> action, T fallback)
    {
        object? enumerator = null, raw = null;
        IMMDevice? device = null;
        try
        {
            enumerator = Activator.CreateInstance(Type.GetTypeFromCLSID(new("BCDE0395-E52F-467C-8E3D-C4579291692E"))!);
            Check(((IMMDeviceEnumerator)enumerator!).GetDefaultAudioEndpoint(input ? 1 : 0, 1, out device));
            var guid = typeof(IAudioEndpointVolume).GUID;
            Check(device.Activate(in guid, 23, 0, out raw));
            return action((IAudioEndpointVolume)raw);
        }
        catch (COMException) { return fallback; }
        finally { Com.Release(raw); Com.Release(device); Com.Release(enumerator); }
    }
    private static void Check(int hr) { if (hr < 0) Marshal.ThrowExceptionForHR(hr); }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int flow, uint state, out nint collection);
        [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
    }
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(in Guid iid, uint context, nint parameters, [MarshalAs(UnmanagedType.IUnknown)] out object value);
    }
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(nint callback);
        [PreserveSig] int UnregisterControlChangeNotify(nint callback);
        [PreserveSig] int GetChannelCount(out uint count);
        [PreserveSig] int SetMasterVolumeLevel(float db, nint context);
        [PreserveSig] int SetMasterVolumeLevelScalar(float value, nint context);
        [PreserveSig] int GetMasterVolumeLevel(out float db);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float value);
        [PreserveSig] int SetChannelVolumeLevel(uint channel, float db, nint context);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float value, nint context);
        [PreserveSig] int GetChannelVolumeLevel(uint channel, out float db);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float value);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, nint context);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    }
}

internal static class Com
{
    public static void Release(object? o) { if (o is not null && Marshal.IsComObject(o)) Marshal.ReleaseComObject(o); }
}
