using System.Runtime.InteropServices;
using EspDesktop.Core;
using static EspDesktop.Core.Protocol;

namespace EspDesktop;

internal static partial class Audio
{
    public static (CatalogueItem[] Inputs, Dictionary<string, int> Levels) ReadTargets(Func<uint, string?> identifyApp)
    {
        var inputs = new List<CatalogueItem>();
        var levels = new Dictionary<string, int>(StringComparer.Ordinal);
        ForEachDevice(1, device =>
        {
            var id = InputLevelId(device);
            var volume = WithVolume(device, ReadVolume, null);
            if (id is null || volume is null) return;
            levels[id] = volume.Value;
            inputs.Add(new(id, InputName(device)));
        });

        var sessions = new Dictionary<string, (bool Active, int Level)>(StringComparer.Ordinal);
        ForEachOutputSession(identifyApp, (id, active, session) =>
        {
            if (session.GetMasterVolume(out var scalar) < 0) return;
            var level = Percent(scalar);
            // A single app may have several streams or play through several endpoints.
            if (!sessions.TryGetValue(id, out var previous) ||
                (active != previous.Active ? active : level > previous.Level))
                sessions[id] = (active, level);
        });
        foreach (var (id, state) in sessions) levels[id] = state.Level;
        return (inputs.OrderBy(input => input.Label, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(input => input.Id, StringComparer.Ordinal).Take(16).ToArray(), levels);
    }

    public static bool SetTarget(string id, int value, Func<uint, string?> identifyApp)
    {
        if (value is < 0 or > 100) return false;
        var changed = false;
        if (id.StartsWith(InputLevelPrefix, StringComparison.Ordinal))
        {
            ForEachDevice(1, device =>
            {
                if (InputLevelId(device) == id) changed = WithVolume(device, endpoint => SetEndpointLevel(endpoint, value), false);
            });
        }
        else if (id.StartsWith(AppVolumePrefix, StringComparison.Ordinal))
        {
            ForEachOutputSession(identifyApp, (target, _, session) =>
            {
                if (target != id) return;
                changed |= SetLevel(value, level => session.SetMasterVolume(level, 0) >= 0,
                    () => session.GetMute(out var muted) >= 0 ? muted : null,
                    muted => session.SetMute(muted, 0) >= 0);
            });
        }
        return changed;
    }

    private static int Percent(float scalar) => Math.Clamp((int)Math.Round(scalar * 100), 0, 100);

    private static int? ReadVolume(IAudioEndpointVolume volume) =>
        volume.GetMasterVolumeLevelScalar(out var scalar) >= 0 ? Percent(scalar) : null;

    private static string? InputLevelId(IMMDevice device) =>
        device.GetId(out var id) >= 0 ? InputLevelPrefix + Hash(id) : null;

    private static string InputName(IMMDevice device)
    {
        IPropertyStore? store = null;
        try
        {
            return device.OpenPropertyStore(0, out store) >= 0 &&
                Com.ReadStringProperty(store, FriendlyName) is { Length: > 0 } name
                ? CatalogueLabel(name) : "Audio Input";
        }
        finally { Com.Release(store); }
    }

    private static T WithVolume<T>(IMMDevice device, Func<IAudioEndpointVolume, T> action, T fallback)
    {
        object? raw = null;
        try
        {
            var guid = typeof(IAudioEndpointVolume).GUID;
            return device.Activate(in guid, 23, 0, out raw) >= 0 ? action((IAudioEndpointVolume)raw) : fallback;
        }
        finally { Com.Release(raw); }
    }

    private static void ForEachDevice(int flow, Action<IMMDevice> action)
    {
        object? enumerator = null;
        IMMDeviceCollection? devices = null;
        try
        {
            enumerator = CreateEnumerator();
            if (((IMMDeviceEnumerator)enumerator).EnumAudioEndpoints(flow, 1, out devices) < 0 ||
                devices.GetCount(out var count) < 0) return;
            for (uint i = 0; i < count; i++)
            {
                IMMDevice? device = null;
                try { if (devices.Item(i, out device) >= 0) action(device); }
                catch (COMException) { }
                finally { Com.Release(device); }
            }
        }
        catch (COMException) { }
        finally { Com.Release(devices); Com.Release(enumerator); }
    }

    private static void ForEachOutputSession(Func<uint, string?> identifyApp, Action<string, bool, ISimpleAudioVolume> action)
    {
        var appIds = new Dictionary<uint, string?>();
        ForEachDevice(0, device =>
        {
            object? manager = null;
            IAudioSessionEnumerator? sessions = null;
            try
            {
                var guid = typeof(IAudioSessionManager2).GUID;
                if (device.Activate(in guid, 23, 0, out manager) < 0 ||
                    ((IAudioSessionManager2)manager).GetSessionEnumerator(out sessions) < 0 ||
                    sessions.GetCount(out var count) < 0) return;
                for (var i = 0; i < count; i++)
                {
                    object? raw = null;
                    try
                    {
                        if (sessions.GetSession(i, out raw) < 0 || raw is not IAudioSessionControl2 session ||
                            session.GetState(out var state) < 0 || state == 2 ||
                            session.IsSystemSoundsSession() != 1 ||
                            session.GetProcessId(out var pid) < 0 || pid == 0) continue;
                        if (!appIds.TryGetValue(pid, out var id))
                            appIds[pid] = id = identifyApp(pid);
                        if (id is not null && session is ISimpleAudioVolume volume)
                            action(AppVolumePrefix + id, state == 1, volume);
                    }
                    catch (COMException) { }
                    finally { Com.Release(raw); }
                }
            }
            finally { Com.Release(sessions); Com.Release(manager); }
        });
    }

    private static readonly PropertyKey FriendlyName = new(new("A45C254E-DF1C-4EFD-8020-67D146A850E0"), 14);

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(in Guid id, uint flags, out nint control);
        [PreserveSig] int GetSimpleAudioVolume(in Guid id, uint flags, out nint volume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }
    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
    }
    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioSessionControl2
    {
        // The session enumerator returns the base interface. Marshal that pointer as IUnknown
        // and query for this interface before using methods on the extended vtable.
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out nint name);
        [PreserveSig] int SetDisplayName(nint name, nint context);
        [PreserveSig] int GetIconPath(out nint path);
        [PreserveSig] int SetIconPath(nint path, nint context);
        [PreserveSig] int GetGroupingParam(out Guid group);
        [PreserveSig] int SetGroupingParam(in Guid group, nint context);
        [PreserveSig] int RegisterAudioSessionNotification(nint callback);
        [PreserveSig] int UnregisterAudioSessionNotification(nint callback);
        [PreserveSig] int GetSessionIdentifier(out nint id);
        [PreserveSig] int GetSessionInstanceIdentifier(out nint id);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
    }
    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, nint context);
        [PreserveSig] int GetMasterVolume(out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, nint context);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    }
}
