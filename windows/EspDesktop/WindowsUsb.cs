using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using EspDesktop.Core;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

namespace EspDesktop;

internal static class WindowsUsb
{
    private static readonly Guid PortsClass = new("4d36e978-e325-11ce-bfc1-08002be10318");

    public static UsbPort[] Find()
    {
        var ports = new List<UsbPort>();
        var devices = GetClassDevices(in PortsClass, null, 0, 2); // DIGCF_PRESENT
        if (devices == -1) return [];
        try
        {
            for (uint index = 0; ; index++)
            {
                var device = new DeviceInfo { Size = (uint)Marshal.SizeOf<DeviceInfo>() };
                if (!EnumDeviceInfo(devices, index, ref device)) break;
                var id = new StringBuilder(256);
                if (!GetDeviceInstanceId(devices, ref device, id, id.Capacity, out _)) continue;
                var identity = id.ToString().ToUpperInvariant();
                var native = identity.StartsWith(@"USB\VID_303A&PID_1001", StringComparison.Ordinal);
                if (!native && !IsUsbSerialBridge(identity)) continue;
                using var key = OpenDeviceRegistryKey(devices, ref device, 1, 0, 1, 0x20019);
                if (key.IsInvalid) continue;
                using var registry = RegistryKey.FromHandle(key);
                if (registry.GetValue("PortName") is string name && UsbPort.PortName("usb:" + name) is { } port)
                    ports.Add(new(port, native));
            }
        }
        finally { _ = DestroyDeviceInfoList(devices); }
        return ports.DistinctBy(port => port.Name).OrderBy(port => int.Parse(port.Name.AsSpan(3),
            System.Globalization.CultureInfo.InvariantCulture)).ToArray();
    }

    private static bool IsUsbSerialBridge(string id) =>
        id.StartsWith(@"USB\VID_1A86&", StringComparison.Ordinal) ||
        id.StartsWith(@"USB\VID_10C4&", StringComparison.Ordinal) ||
        id.StartsWith(@"USB\VID_0403&", StringComparison.Ordinal) ||
        id.StartsWith(@"FTDIBUS\VID_0403+", StringComparison.Ordinal) ||
        id.StartsWith(@"USB\VID_067B&", StringComparison.Ordinal);

    public static async ValueTask<Stream> Connect(string name, CancellationToken token)
    {
        var port = await Task.Run(() => Find().FirstOrDefault(port => port.Name == name)
            ?? throw new IOException("Connect the display’s USB cable or choose its current COM port."), token);
        var serial = await Task.Run(() => SerialStream.Open(port), token);
        var stream = new UsbTransport(serial, port.Native);
        try { await stream.OpenAsync(token); return stream; }
        catch { stream.Dispose(); throw; }
    }

    private sealed class SerialStream(FileStream stream) : DuplexStream
    {
        public static SerialStream Open(UsbPort port)
        {
            var handle = CreateFile(@"\\.\" + port.Name, 0xc0000000, 0, 0, 3, 0x40000000, 0);
            try
            {
                if (handle.IsInvalid) throw SerialError();
                // Binary, 8N1, no flow control. Leave DTR and RTS disabled because
                // those lines are wired to reset and boot mode on common displays.
                var configuration = new SerialConfiguration
                {
                    Size = (uint)Marshal.SizeOf<SerialConfiguration>(),
                    Baud = port.Native ? 115200u : 460800u, Flags = 1, DataBits = 8, Xon = 0x11, Xoff = 0x13
                };
                var timeouts = new SerialTimeouts { ReadInterval = uint.MaxValue, ReadMultiplier = uint.MaxValue,
                    ReadConstant = 100, WriteConstant = 750 };
                if (!SetCommState(handle, ref configuration) || !SetCommTimeouts(handle, ref timeouts) ||
                    !PurgeComm(handle, 0x000c)) throw SerialError();
                return new(new FileStream(handle, FileAccess.ReadWrite, bufferSize: 1, isAsync: true));
            }
            catch { handle.Dispose(); throw; }
        }

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        {
            if (buffer.IsEmpty) return 0;
            while (true)
            {
                token.ThrowIfCancellationRequested();
                var count = await stream.ReadAsync(buffer, token).ConfigureAwait(false);
                if (count != 0) return count;
            }
        }

        public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken token = default) =>
            stream.WriteAsync(buffer, token);

        protected override void Dispose(bool disposing)
        {
            if (disposing) stream.Dispose();
            base.Dispose(disposing);
        }

        private static IOException SerialError() => new("Check the USB cable and close any app using the COM port.",
            new Win32Exception(Marshal.GetLastWin32Error()));
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DeviceInfo { public uint Size; public Guid Class; public uint Instance; public nint Reserved; }

    [StructLayout(LayoutKind.Sequential)]
    private struct SerialConfiguration
    {
        public uint Size, Baud, Flags;
        public ushort Reserved, XonLimit, XoffLimit;
        public byte DataBits, Parity, StopBits, Xon, Xoff, Error, Eof, Event;
        public ushort Reserved1;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SerialTimeouts { public uint ReadInterval, ReadMultiplier, ReadConstant, WriteMultiplier, WriteConstant; }

    [DllImport("setupapi.dll", EntryPoint = "SetupDiGetClassDevsW", CharSet = CharSet.Unicode)]
    private static extern nint GetClassDevices(in Guid classId, string? enumerator, nint window, uint flags);
    [DllImport("setupapi.dll", EntryPoint = "SetupDiEnumDeviceInfo")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumDeviceInfo(nint devices, uint index, ref DeviceInfo device);
    [DllImport("setupapi.dll", EntryPoint = "SetupDiGetDeviceInstanceIdW", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetDeviceInstanceId(nint devices, ref DeviceInfo device, StringBuilder value, int count, out int needed);
    [DllImport("setupapi.dll", EntryPoint = "SetupDiOpenDevRegKey")]
    private static extern SafeRegistryHandle OpenDeviceRegistryKey(nint devices, ref DeviceInfo device,
        uint scope, uint hardwareProfile, uint keyType, uint access);
    [DllImport("setupapi.dll", EntryPoint = "SetupDiDestroyDeviceInfoList")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyDeviceInfoList(nint devices);
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, nint security, uint mode, uint flags, nint template);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetCommState(SafeFileHandle handle, ref SerialConfiguration configuration);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetCommTimeouts(SafeFileHandle handle, ref SerialTimeouts timeouts);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PurgeComm(SafeFileHandle handle, uint flags);
}
