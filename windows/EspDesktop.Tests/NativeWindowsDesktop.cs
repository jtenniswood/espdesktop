#if WINDOWS
using System.Diagnostics;
using System.Windows.Threading;
using EspDesktop;
using ComObject = EspDesktop.Com;

internal sealed record NativeWindowsDesktop(WindowsDesktop Desktop, string DriveLabel, string UnapprovedAppId,
    WindowsFolderActions? FolderActions) : IDisposable
{
    public static async Task<NativeWindowsDesktop> Prepare(bool exerciseFolderActions)
    {
        var root = Path.GetPathRoot(Environment.SystemDirectory)
            ?? throw new InvalidOperationException("Windows did not report a system drive.");
        var settings = new LocalSettings
        {
            AllApps = false,
            AllowedApps = [WindowsDesktop.ExplorerId],
            Folders =
            [
                new("folder.windows-test", Path.Combine(root, "EspDesktop private fixture", "Project files")),
                new("folder.windows-drive", root)
            ]
        };
        var desktop = new WindowsDesktop(settings);
        await desktop.Refresh();
        var otherApp = desktop.Apps.FirstOrDefault(app => app.Id != WindowsDesktop.ExplorerId)
            ?? throw new InvalidOperationException("The Windows Shell did not supply any Start menu apps.");
        var folders = exerciseFolderActions ? WindowsFolderActions.Create() : null;
        if (folders is not null)
        {
            settings.Folders.Add(new("folder.windows-first", folders.First));
            settings.Folders.Add(new("folder.windows-second", folders.Second));
            settings.Folders.Add(new("folder.windows-third", folders.Third));
        }
        return new(desktop, $"Drive {char.ToUpperInvariant(root[0])}", otherApp.Id, folders);
    }

    public void Dispose() => FolderActions?.Dispose();

    public static Task RunOnDesktop(Func<Task> run) => Sta.Run(() =>
    {
        var dispatcher = Dispatcher.CurrentDispatcher;
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(dispatcher));
        var session = run();
        _ = session.ContinueWith(_ => dispatcher.BeginInvokeShutdown(DispatcherPriority.Normal), TaskScheduler.Default);
        Dispatcher.Run();
        session.GetAwaiter().GetResult();
        return true;
    });
}

internal sealed class WindowsFolderActions : IDisposable
{
    private readonly string root;
    public string First => Path.Combine(root, "First project, notes");
    public string Second => Path.Combine(root, "Second project");
    public string Third => Path.Combine(root, "Third project, résumé");
    public string Denied => Path.Combine(root, "Private project");

    private WindowsFolderActions(string root) => this.root = root;

    public static WindowsFolderActions Create()
    {
        if (Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted")
            throw new InvalidOperationException("Run desktop action checks on a disposable GitHub-hosted Windows runner.");
        var fixture = new WindowsFolderActions(Directory.CreateTempSubdirectory("EspDesktop folder test ").FullName);
        foreach (var path in new[] { fixture.First, fixture.Second, fixture.Third, fixture.Denied })
            Directory.CreateDirectory(path);
        return fixture;
    }

    public Task<long> WaitForWindow(string path, CancellationToken token) => Sta.Run(() =>
    {
        var started = Stopwatch.GetTimestamp();
        do
        {
            token.ThrowIfCancellationRequested();
            var window = FindWindow(path);
            if (window != 0) return window;
            Thread.Sleep(100);
        } while (Stopwatch.GetElapsedTime(started) < TimeSpan.FromSeconds(8));
        throw new InvalidOperationException($"File Explorer never opened {Path.GetFileName(path)}.");
    });

    public Task<bool> IsOpen(string path) => Sta.Run(() => FindWindow(path) != 0);

    private static long FindWindow(string path)
    {
        long found = 0;
        VisitWindows((_, window, folder) =>
        {
            if (!string.Equals(path, folder, StringComparison.OrdinalIgnoreCase)) return false;
            found = window;
            return true;
        });
        return found;
    }

    public void Dispose()
    {
        Sta.Run(() =>
        {
            VisitWindows((browser, _, folder) =>
            {
                if (string.Equals(Path.GetDirectoryName(folder), root, StringComparison.OrdinalIgnoreCase))
                    ((dynamic)browser).Quit();
                return false;
            });
            return true;
        }).GetAwaiter().GetResult();
        Directory.Delete(root, recursive: true);
    }

    // Inspect the Explorer windows registered with the Windows Shell. The
    // action result by itself does not prove the requested folder opened.
    private static void VisitWindows(Func<object, long, string, bool> visitor)
    {
        object? shell = null;
        object? windows = null;
        try
        {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!);
            windows = ((dynamic)shell!).Windows();
            int count = ((dynamic)windows!).Count;
            for (var i = count - 1; i >= 0; i--)
            {
                object? item = null;
                try
                {
                    item = ((dynamic)windows!).Item(i);
                    if (item is null) continue;
                    dynamic browser = item;
                    if (Uri.TryCreate((string)browser.LocationURL, UriKind.Absolute, out var location) &&
                        location.IsFile && visitor(item, Convert.ToInt64(browser.HWND),
                            Path.TrimEndingDirectorySeparator(location.LocalPath))) return;
                }
                catch (Exception e) when (WindowsDesktop.IsShellFailure(e)) { }
                finally { ComObject.Release(item); }
            }
        }
        finally { ComObject.Release(windows); ComObject.Release(shell); }
    }
}
#endif
