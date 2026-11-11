#if WINDOWS
using System.Windows.Threading;
using EspDesktop;

internal sealed record NativeWindowsDesktop(WindowsDesktop Desktop, string DriveLabel, string UnapprovedAppId)
{
    public static async Task<NativeWindowsDesktop> Prepare()
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
        return new(desktop, $"Drive {char.ToUpperInvariant(root[0])}", otherApp.Id);
    }

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
#endif
