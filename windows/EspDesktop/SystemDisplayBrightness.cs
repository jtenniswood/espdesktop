using System.Diagnostics;
using System.Management;
using System.Runtime.InteropServices;

namespace EspDesktop;

internal sealed class SystemDisplayBrightness
{
    private long? sampledAt;
    private int? lastValue;

    public int? Read()
    {
        if (sampledAt is long last && Stopwatch.GetElapsedTime(last) < TimeSpan.FromSeconds(1))
            return lastValue;

        lastValue = WithMonitor((current, _) => current);
        sampledAt = Stopwatch.GetTimestamp();
        return lastValue;
    }

    public bool Set(int value, Func<bool> canWrite) =>
        Update(_ => value, canWrite);

    public bool Adjust(int step, Func<bool> canWrite) =>
        Update(current => current + step, canWrite);

    private bool Update(Func<int, int> target, Func<bool> canWrite)
    {
        sampledAt = null;
        return WithMonitor((current, write) =>
        {
            var value = Math.Clamp(target(current), 0, 100);
            return canWrite() && write(value, canWrite) ? value : null;
        }).HasValue;
    }

    private static int? WithMonitor(Func<int, Func<int, Func<bool>, bool>, int?> use)
    {
        var builtInFound = false;
        try
        {
            using var search = new ManagementObjectSearcher(@"root\wmi",
                "SELECT * FROM WmiMonitorBrightness WHERE Active = TRUE");
            using var monitors = search.Get();
            foreach (ManagementObject monitor in monitors)
            {
                using (monitor)
                {
                    if (monitor["InstanceName"] is not string instance ||
                        monitor["CurrentBrightness"] is not byte current ||
                        monitor["Level"] is not byte[] levels || levels.Length == 0) continue;
                    builtInFound = true;
                    return use(current, (target, allowed) => SetBuiltIn(instance, levels, target, allowed));
                }
            }
        }
        catch (Exception e) when (e is ManagementException or COMException or UnauthorizedAccessException)
        {
            if (builtInFound) return null;
        }

        return WithPrimaryMonitor(use);
    }

    internal static byte SupportedLevel(byte[] levels, int target) =>
        levels.MinBy(level => Math.Abs(level - Math.Clamp(target, 0, 100)));

    private static bool SetBuiltIn(string instance, byte[] levels, int target, Func<bool> canWrite)
    {
        using var search = new ManagementObjectSearcher(@"root\wmi",
            "SELECT * FROM WmiMonitorBrightnessMethods WHERE Active = TRUE");
        using var methods = search.Get();
        foreach (ManagementObject method in methods)
        {
            using (method)
            {
                if (!string.Equals(method["InstanceName"] as string, instance, StringComparison.OrdinalIgnoreCase))
                    continue;

                using var input = method.GetMethodParameters("WmiSetBrightness");
                input["Timeout"] = 0u;
                input["Brightness"] = SupportedLevel(levels, target);
                if (!canWrite()) return false;
                using var result = method.InvokeMethod("WmiSetBrightness", input, null);
                return result?["ReturnValue"] is 0u;
            }
        }
        return false;
    }

    private static int? WithPrimaryMonitor(Func<int, Func<int, Func<bool>, bool>, int?> use)
    {
        const uint monitorDefaultToPrimary = 1;
        const uint brightnessCapability = 2;
        var primary = MonitorFromPoint(default, monitorDefaultToPrimary);
        if (primary == 0 || !GetNumberOfPhysicalMonitorsFromHMONITOR(primary, out var count) || count != 1)
            return null;

        // A logical display that maps to multiple physical monitors has no unique target.
        var monitors = new PhysicalMonitor[1];
        if (!GetPhysicalMonitorsFromHMONITOR(primary, 1, monitors)) return null;
        try
        {
            var handle = monitors[0].Handle;
            if (!GetMonitorBrightness(handle, out var min, out var current, out var max) ||
                max <= min || current < min || current > max) return null;

            var percent = (int)Math.Round(100d * (current - min) / (max - min));
            return use(percent, (target, allowed) =>
                GetMonitorCapabilities(handle, out var capabilities, out _) &&
                (capabilities & brightnessCapability) != 0 && allowed() &&
                SetMonitorBrightness(handle, min + (uint)Math.Round((max - min) * (target / 100d))));
        }
        finally { _ = DestroyPhysicalMonitors(1, monitors); }
    }

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct Point(int X, int Y);

    [StructLayout(LayoutKind.Sequential)]
    private unsafe struct PhysicalMonitor
    {
        public nint Handle;
        private fixed char description[128];
    }

    [DllImport("User32.dll")]
    private static extern nint MonitorFromPoint(Point point, uint flags);

    [DllImport("Dxva2.dll")]
    private static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(nint monitor, out uint count);

    [DllImport("Dxva2.dll")]
    private static extern bool GetPhysicalMonitorsFromHMONITOR(nint monitor, uint count, [Out] PhysicalMonitor[] physicalMonitors);

    [DllImport("Dxva2.dll")]
    private static extern bool GetMonitorCapabilities(nint monitor, out uint capabilities, out uint colorTemperatures);

    [DllImport("Dxva2.dll")]
    private static extern bool GetMonitorBrightness(nint monitor, out uint minimum, out uint current, out uint maximum);

    [DllImport("Dxva2.dll")]
    private static extern bool SetMonitorBrightness(nint monitor, uint brightness);

    [DllImport("Dxva2.dll")]
    private static extern bool DestroyPhysicalMonitors(uint count, PhysicalMonitor[] physicalMonitors);
}
