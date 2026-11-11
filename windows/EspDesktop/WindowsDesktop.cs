using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using EspDesktop.Core;
using Microsoft.CSharp.RuntimeBinder;
using static EspDesktop.Core.Protocol;

namespace EspDesktop;

internal sealed record StartApp(string Id, string Name, string Target, string? Executable);
internal sealed class WindowsDesktop(LocalStore store) : IDesktop
{
    // Older panels reserve this identifier for the file manager's live folders.
    public const string ExplorerId = "com.apple.finder";
    private static string ExplorerExe => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
    private static readonly string[] Browsers = ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "vivaldi.exe", "opera.exe"];
    private static readonly StartApp Explorer = new(ExplorerId, "File Explorer", "", ExplorerExe);
    private readonly SystemMetrics metrics = new();
    private StartApp[] apps = [Explorer];
    private string? cachedAddressBar;
    private nint cachedBrowserWindow;
    private Task<(nint Window, string? Address)>? browserRead;
    private long browserReadAt;
    private bool reportedLocked;
    private bool? displayAwake;
    public IReadOnlyList<StartApp> Apps => apps;
    public int CatalogueRevision { get; private set; }
    public bool ShortcutsEnabled => store.Settings.Shortcuts;
    public (bool Locked, bool? DisplayAwake) SessionState => (reportedLocked || !InputSession.IsDefaultInputDesktop(), displayAwake);

    public void SessionChanged(bool locked) => reportedLocked = locked;
    public void DisplayChanged(bool awake) => displayAwake = awake;
    public void Changed() => CatalogueRevision++;
    public bool Allowed(StartApp app) => store.Settings.AllApps || store.Settings.AllowedApps.Contains(app.Id);

    public async Task Refresh()
    {
        var scanned = await Sta.Run(ScanApps);
        if (scanned.Length > 1 || apps.Length == 1) apps = scanned;
        Changed();
    }

    public IReadOnlyList<CatalogueItem> Catalogue() =>
        store.Settings.Folders.Select(f => new CatalogueItem(f.Id, Clean(f.Label)))
        .Concat(apps.Where(Allowed).Select(a => new CatalogueItem(a.Id, Clean(a.Name)))).Take(256).ToArray();
    private static string Clean(string label) => Bound(new string(label.Select(c => char.IsControl(c) || c is ',' or '|' ? ' ' : c)
        .ToArray()).Trim(), 96) is { Length: > 0 } name ? name : "Unnamed";

    public IEnumerable<string> Definitions()
    {
        if (!ShortcutsEnabled) yield break;
        foreach (var app in apps.Where(Allowed))
        {
            var presets = WindowsPresets.For(Path.GetFileName(app.Executable ?? app.Target).ToLowerInvariant());
            if (presets.Length == 0) continue;
            yield return JsonSerializer.Serialize(new
            {
                version = 1, appId = app.Id, label = Bound(Clean(app.Name), 48), catalog = false,
                shortcuts = presets.Select((p, i) => new
                {
                    id = i.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    label = p.Label, shortcut = p.Keys, icon = p.Icon
                }).ToArray()
            });
        }
    }

    public async Task<string> Invoke(JsonElement message, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        try { return await Perform(message, token); }
        catch (Exception e) when (IsShellFailure(e)) { return "failed"; }
    }

    private async Task<string> Perform(JsonElement message, CancellationToken token)
    {
        if (SessionState.Locked) return "not_allowed";
        if (Text(message, "kind") == "url")
        {
            var url = SafeActions.WebUrl(Text(message, "encodedUrl"));
            if (url is null) return "not_allowed";
            return OpenWebsite(url, Text(message, "urlOpenBehavior") == "new_window") ? "opened" : "failed";
        }

        var id = Text(message, "actionId");
        if (id == "shortcut.command+control+q")
            return ShortcutsEnabled && LockWorkStation() ? "performed" : "not_allowed";
        if (id.StartsWith("shortcut.", StringComparison.Ordinal))
        {
            if (!ShortcutsEnabled || SafeActions.Shortcut(id) is not { } keys) return "not_allowed";
            var window = InputSession.GetForegroundWindow();
            var app = Identify(window);
            // The sender cannot select a process, change focus, or send keystrokes
            // to Explorer desktop surfaces, elevated apps, or this app's settings.
            if (app is null || !Allowed(app) || (app.Id == ExplorerId && !IsExplorerWindow(window))) return "not_allowed";
            return InputSession.Replay(window, keys) ? "performed" : "not_allowed";
        }

        if (id.StartsWith("folder.", StringComparison.Ordinal))
        {
            var folder = store.Settings.Folders.Find(f => f.Id == id);
            if (folder is null) return "not_allowed";
            if (!Directory.Exists(folder.Path)) return "not_found";
            var same = Text(message, "folderOpenBehavior") == "same_window";
            var existingWindow = same ? FindExplorerWindow() : 0;
            if (existingWindow != 0 && WithExplorerWindow(existingWindow, w =>
            {
                token.ThrowIfCancellationRequested();
                if (SessionState.Locked) return false;
                w.Navigate2(folder.Path);
                return true;
            }, false))
            {
                if (IsIconic(existingWindow)) _ = ShowWindowAsync(existingWindow, 9);
                _ = SetForegroundWindow(existingWindow);
                return "opened";
            }
            token.ThrowIfCancellationRequested();
            if (SessionState.Locked) return "not_allowed";
            return Start(ExplorerExe, "/n,", folder.Path) ? "opened" : "failed";
        }

        var selected = apps.FirstOrDefault(a => a.Id == id && Allowed(a));
        if (selected is null) return "not_allowed";
        return await ActivateApplication(selected, token);
    }

    private async Task<string> ActivateApplication(StartApp app, CancellationToken token)
    {
        if (IsActive(app)) return "activated";

        var window = FindApplicationWindow(app);
        token.ThrowIfCancellationRequested();
        if (SessionState.Locked) return "not_allowed";
        if (window != 0)
        {
            if (IsIconic(window)) _ = ShowWindowAsync(window, 9);
            _ = SetForegroundWindow(window);
        }
        else
        {
            var launched = app.Id == ExplorerId
                ? Start(ExplorerExe)
                : OpenShell("shell:AppsFolder\\" + app.Target);
            if (!launched) return "failed";
        }

        // The panel opens the app's shortcut page only after this result.
        // Wait for Windows to put the approved app in the foreground.
        var start = Stopwatch.GetTimestamp();
        do
        {
            token.ThrowIfCancellationRequested();
            if (SessionState.Locked || !Allowed(app)) return "not_allowed";
            if (IsActive(app)) return "activated";
            await Task.Delay(50, token);
        } while (Stopwatch.GetElapsedTime(start) < TimeSpan.FromSeconds(3));
        return window == 0 ? "opened" : "failed";
    }

    private bool IsActive(StartApp app)
    {
        var window = InputSession.GetForegroundWindow();
        return (app.Id != ExplorerId || IsExplorerWindow(window)) && Identify(window)?.Id == app.Id;
    }

    private nint FindApplicationWindow(StartApp app)
    {
        nint match = 0;
        EnumWindows((window, context) =>
        {
            if (!IsWindowVisible(window) || GetWindow(window, 4) != 0 ||
                (app.Id == ExplorerId && !IsExplorerWindow(window)) || Identify(window)?.Id != app.Id) return true;
            match = window;
            return false;
        }, 0);
        return match;
    }

    public string[] Focused(IReadOnlyDictionary<string, Uri> targets)
    {
        var window = InputSession.GetForegroundWindow();
        var app = Identify(window);
        var ids = new List<string>();
        if (app?.Id == ExplorerId && IsExplorerWindow(window))
        {
            var path = WithExplorerWindow<string?>(window, w =>
            {
                var url = (string)w.LocationURL;
                return Uri.TryCreate(url, UriKind.Absolute, out var file) && file.IsFile ? file.LocalPath : null;
            }, null);
            if (path != null)
            {
                var folder = store.Settings.Folders.Find(f => string.Equals(Path.TrimEndingDirectorySeparator(f.Path),
                    Path.TrimEndingDirectorySeparator(path), StringComparison.OrdinalIgnoreCase));
                if (folder != null) ids.Add(folder.Id);
            }
        }

        if (app != null && Allowed(app) && (app.Id != ExplorerId || IsExplorerWindow(window))) ids.Add(app.Id);
        if (app?.Executable is { } executable && Browsers.Contains(Path.GetFileName(executable), StringComparer.OrdinalIgnoreCase) &&
            targets.Count != 0)
        {
            if (cachedBrowserWindow != window)
            {
                cachedBrowserWindow = window;
                cachedAddressBar = null;
            }
            if (browserRead?.IsCompleted == true)
            {
                var result = browserRead.GetAwaiter().GetResult();
                if (result.Window == window) cachedAddressBar = result.Address;
                browserRead = null;
            }
            if (browserRead is null && Stopwatch.GetElapsedTime(browserReadAt) >= TimeSpan.FromSeconds(1))
            {
                browserReadAt = Stopwatch.GetTimestamp();
                browserRead = ReadBrowserAddress(window);
            }
            if (cachedAddressBar is { } address)
            {
                foreach (var (id, target) in targets)
                    if (SameWebAddress(address, target)) ids.Add(id);
            }
        }
        else { cachedBrowserWindow = 0; cachedAddressBar = null; }
        return ids.Distinct().Take(64).ToArray();
    }

    private static bool SameWebAddress(string address, Uri target)
    {
        // Chromium hides the scheme on many pages.
        if (!address.Contains("://", StringComparison.Ordinal)) address = target.Scheme + "://" + address;
        return SafeActions.WebUrl(address, false) is { } url &&
            url.Scheme == target.Scheme && url.IdnHost == target.IdnHost && url.Port == target.Port &&
            url.PathAndQuery == target.PathAndQuery && url.Fragment == target.Fragment;
    }

    private static Task<(nint Window, string? Address)> ReadBrowserAddress(nint window) => Task.Run<(nint Window, string? Address)>(() =>
    {
        try
        {
            var element = AutomationElement.FromHandle(window);
            var knownAddressBar = new AndCondition(new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit),
                new OrCondition(new PropertyCondition(AutomationElement.AutomationIdProperty, "addressEditBox"),
                    new PropertyCondition(AutomationElement.AutomationIdProperty, "urlbar-input"),
                    new PropertyCondition(AutomationElement.NameProperty, "Address and search bar"),
                    new PropertyCondition(AutomationElement.NameProperty, "Search or enter web address")));
            var edit = element.FindFirst(TreeScope.Descendants, knownAddressBar);
            if (edit?.TryGetCurrentPattern(ValuePattern.Pattern, out var value) == true &&
                !edit.Current.HasKeyboardFocus && InputSession.GetForegroundWindow() == window)
                return (window, ((ValuePattern)value).Current.Value);
        }
        // A browser can close or replace its address bar during a UI Automation read.
        catch (Exception e) when (e is ElementNotAvailableException or InvalidOperationException or COMException or ArgumentException) { }
        return (window, null);
    });

    public byte[]? AppIcon(string appId, int side)
    {
        var app = apps.FirstOrDefault(a => a.Id == appId && Allowed(a));
        if (app is null) return null;
        var iid = typeof(IShellItemImageFactory).GUID;
        IShellItemImageFactory? factory = null;
        nint bitmap = 0;
        try
        {
            var path = app.Id == ExplorerId ? ExplorerExe : "shell:AppsFolder\\" + app.Target;
            if (SHCreateItemFromParsingName(path, 0, in iid, out factory) < 0 || factory.GetImage(new SizeNative(side, side), 4, out bitmap) < 0)
                return null;
            var source = Imaging.CreateBitmapSourceFromHBitmap(bitmap, 0, Int32Rect.Empty, BitmapSizeOptions.FromWidthAndHeight(side, side));
            var converted = new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);
            var pixels = new byte[side * side * 4];
            converted.CopyPixels(pixels, side * 4, 0);
            var result = new byte[side * side * 3];
            for (int i = 0; i < side * side; i++)
            {
                var alpha = pixels[4 * i + 3];
                var color = alpha == 0 ? 0x2945 : (pixels[4 * i + 2] >> 3) << 11 | (pixels[4 * i + 1] >> 2) << 5 | pixels[4 * i] >> 3;
                result[2 * i] = (byte)color;
                result[2 * i + 1] = (byte)(color >> 8);
                result[side * side * 2 + i] = alpha;
            }
            return result;
        }
        catch (Exception e) when (IsShellFailure(e)) { return null; }
        finally { if (bitmap != 0) _ = DeleteObject(bitmap); Com.Release(factory); }
    }

    public bool SetValue(string id, int value) => !SessionState.Locked && Audio.Set(id, value);
    public IEnumerable<(string Id, int? Value)> Values() => Audio.Read();
    public Dictionary<string, object?> Metrics(uint generation) => metrics.Read(generation);

    private static StartApp[] ScanApps()
    {
        object? shell = null, folder = null, items = null;
        var list = new List<StartApp> { Explorer };
        try
        {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!);
            folder = ((dynamic)shell!).NameSpace("shell:AppsFolder");
            if (folder is null) return [Explorer];
            items = ((dynamic)folder).Items();
            var count = Math.Min((int)((dynamic)items!).Count, 4000);
            for (var i = 0; i < count; i++)
            {
                object? item = null;
                try
                {
                    item = ((dynamic)items!).Item(i);
                    if (item is null) continue;
                    dynamic row = item;
                    string name = row.Name, target = row.Path;
                    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(target) || target.Length > 1024 ||
                        target.Any(char.IsControl)) continue;
                    var exe = row.ExtendedProperty("System.Link.TargetParsingPath") as string;
                    if (exe == null && target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && Path.IsPathFullyQualified(target))
                        exe = target;
                    if (string.Equals(exe, ExplorerExe, StringComparison.OrdinalIgnoreCase) ||
                        target.Equals("Microsoft.Windows.Explorer", StringComparison.OrdinalIgnoreCase)) continue;
                    list.Add(new("windows." + Hash(target.ToUpperInvariant())[..32], name, target, exe));
                }
                catch (Exception e) when (IsShellFailure(e)) { }
                finally { Com.Release(item); }
            }
        }
        catch (Exception e) when (IsShellFailure(e)) { }
        finally { Com.Release(items); Com.Release(folder); Com.Release(shell); }
        return list.DistinctBy(a => a.Id).OrderBy(a => a.Name, StringComparer.CurrentCultureIgnoreCase).ToArray();
    }

    private StartApp? Identify(nint window)
    {
        var identity = ReadWindow(window);
        return apps.Where(a => Matches(a, identity)).OrderByDescending(a =>
            !string.IsNullOrEmpty(identity.Aumid) && a.Target.Equals(identity.Aumid, StringComparison.OrdinalIgnoreCase))
            .ThenByDescending(Allowed).FirstOrDefault();
    }

    private static bool Matches(StartApp app, (string? Aumid, string? Executable) identity) =>
        (!string.IsNullOrEmpty(identity.Aumid) && app.Target.Equals(identity.Aumid, StringComparison.OrdinalIgnoreCase)) ||
        (app.Executable is not null && identity.Executable is not null && app.Executable.Equals(identity.Executable, StringComparison.OrdinalIgnoreCase));

    private static (string? Aumid, string? Executable) ReadWindow(nint window)
    {
        _ = InputSession.GetWindowThreadProcessId(window, out var pid);
        if (pid == 0 || pid == Environment.ProcessId) return default;
        var process = OpenProcess(0x1000, false, pid);
        if (process == 0) return default;
        try
        {
            uint length = 32768;
            var image = new StringBuilder((int)length);
            var exe = QueryFullProcessImageNameW(process, 0, image, ref length) ? image.ToString() : null;
            length = 512;
            var name = new StringBuilder((int)length);
            return (GetApplicationUserModelId(process, ref length, name) == 0 ? name.ToString() : WindowAppId(window), exe);
        }
        finally { _ = CloseHandle(process); }
    }

    private static string? WindowAppId(nint window)
    {
        var iid = typeof(IWindowPropertyStore).GUID;
        IWindowPropertyStore? store = null;
        PropVariant value = default;
        try
        {
            if (SHGetPropertyStoreForWindow(window, in iid, out store) < 0) return null;
            var key = new PropertyKey(new("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 5);
            return store.GetValue(in key, out value) >= 0 && value.Type == 31
                ? Marshal.PtrToStringUni(value.Pointer) : null;
        }
        finally { _ = PropVariantClear(ref value); Com.Release(store); }
    }

    private static bool IsExplorerWindow(nint window)
    {
        var name = new StringBuilder(64);
        _ = GetClassNameW(window, name, name.Capacity);
        return name.ToString() is "CabinetWClass" or "ExploreWClass";
    }

    private static nint FindExplorerWindow()
    {
        var foreground = InputSession.GetForegroundWindow();
        if (IsExplorerWindow(foreground)) return foreground;

        // Choose the first visible Explorer window in desktop Z order, even
        // when a different app is in front.
        var window = GetTopWindow(0);
        for (var i = 0; window != 0 && i < 1024; i++, window = GetWindow(window, 2))
            if (IsWindowVisible(window) && IsExplorerWindow(window)) return window;
        return 0;
    }

    private static T WithExplorerWindow<T>(nint window, Func<dynamic, T> operation, T fallback)
    {
        if (!IsExplorerWindow(window)) return fallback;
        object? shell = null, windows = null;
        try
        {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!);
            windows = ((dynamic)shell!).Windows();
            int count = ((dynamic)windows!).Count;
            for (var i = 0; i < Math.Min(count, 128); i++)
            {
                object? item = null;
                try
                {
                    item = ((dynamic)windows!).Item(i);
                    if (item is not null && Convert.ToInt64(((dynamic)item).HWND) == (long)window)
                        return operation(item!);
                }
                finally { Com.Release(item); }
            }
        }
        catch (Exception e) when (IsShellFailure(e)) { }
        finally { Com.Release(windows); Com.Release(shell); }
        return fallback;
    }

    private static bool OpenWebsite(Uri url, bool newWindow)
    {
        if (!newWindow) return OpenShell(url.AbsoluteUri);
        var executable = new StringBuilder(32768);
        uint length = (uint)executable.Capacity;
        if (AssocQueryStringW(0x1000, 2, url.Scheme, null, executable, ref length) != 0) return false;
        var exe = executable.ToString();
        if (!Path.IsPathFullyQualified(exe) || !Browsers.Contains(Path.GetFileName(exe), StringComparer.OrdinalIgnoreCase)) return false;
        return Start(exe, Path.GetFileName(exe).Equals("firefox.exe", StringComparison.OrdinalIgnoreCase) ? "-new-window" : "--new-window",
            url.AbsoluteUri);
    }

    internal static bool OpenShell(string file)
    {
        // The shell can forward to an existing window without returning a process.
        using var process = Process.Start(new ProcessStartInfo(file) { UseShellExecute = true });
        return true;
    }
    private static bool Start(string file, params string[] args)
    {
        var launch = new ProcessStartInfo(file);
        foreach (var arg in args) launch.ArgumentList.Add(arg);
        return Process.Start(launch) is { } process && DisposeProcess(process);
    }
    private static bool DisposeProcess(Process process) { process.Dispose(); return true; }

    internal static bool IsShellFailure(Exception e) => e is COMException or RuntimeBinderException or InvalidOperationException or
        Win32Exception or IOException or UnauthorizedAccessException or ArgumentException;

    [StructLayout(LayoutKind.Sequential)]
    private readonly record struct SizeNative(int Width, int Height);
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private readonly record struct PropertyKey(Guid Format, uint Id);
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    private struct PropVariant
    {
        [FieldOffset(0)] public ushort Type;
        [FieldOffset(8)] public nint Pointer;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IWindowPropertyStore
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(in PropertyKey key, out PropVariant value);
    }
    [ComImport, Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        [PreserveSig] int GetImage(SizeNative size, int flags, out nint bitmap);
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)] private static extern int SHCreateItemFromParsingName(string path, nint context, in Guid iid, out IShellItemImageFactory item);
    [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(nint window, in Guid iid, out IWindowPropertyStore store);
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PropVariant value);
    [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DeleteObject(nint bitmap);
    [DllImport("kernel32.dll")] private static extern nint OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, uint pid);
    [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(nint handle);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern int GetApplicationUserModelId(nint process, ref uint size, StringBuilder id);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageNameW(nint process, uint flags, StringBuilder image, ref uint size);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool LockWorkStation();
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetForegroundWindow(nint window);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool ShowWindowAsync(nint window, int command);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsIconic(nint window);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint window, uint command);
    [DllImport("user32.dll")] private static extern nint GetTopWindow(nint window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassNameW(nint window, StringBuilder name, int max);
    private delegate bool WindowCallback(nint window, nint context);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool EnumWindows(WindowCallback callback, nint context);
    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)] private static extern int AssocQueryStringW(uint flags, uint type, string association, string? extra, StringBuilder value, ref uint length);
}

internal static class Sta
{
    public static Task<T> Run<T>(Func<T> work)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try { completion.SetResult(work()); }
            catch (Exception e) { completion.SetException(e); }
        }) { IsBackground = true };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return completion.Task;
    }
}
