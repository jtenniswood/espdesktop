#if WINDOWS
using System.Diagnostics;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Threading;
using EspDesktop;
using EspDesktop.Core;
using ComObject = EspDesktop.Com;

internal sealed record NativeWindowsDesktop(WindowsDesktop Desktop, string DriveLabel, string UnapprovedAppId,
    WindowsFolderActions? FolderActions, WindowsAppActions? AppActions, StartApp? Browser) : IDisposable
{
    internal const int CataloguePaddingFolders = 260;

    public static async Task<NativeWindowsDesktop> Prepare(bool exerciseDesktopActions)
    {
        var root = Path.GetPathRoot(Environment.SystemDirectory)
            ?? throw new InvalidOperationException("Windows did not report a system drive.");
        var settings = new LocalSettings
        {
            AllApps = false,
            AllowedApps = [WindowsDesktop.ExplorerId],
            Shortcuts = exerciseDesktopActions,
            Folders =
            [
                new("folder.windows-test", Path.Combine(root, "EspDesktop private fixture", "Project files")),
                new("folder.windows-drive", root)
            ]
        };
        var desktop = new WindowsDesktop(settings);
        WindowsAppActions? app = null;
        WindowsFolderActions? folders = null;
        StartApp? browser = null;
        try
        {
            if (exerciseDesktopActions)
            {
                if (Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted")
                    throw new InvalidOperationException("Run desktop action checks on a disposable GitHub-hosted Windows runner.");
                await VerifyDiscoveryRefresh();
                folders = WindowsFolderActions.Create();
                settings.Folders.Add(new("folder.windows-first", folders.First));
                settings.Folders.Add(new("folder.windows-second", folders.Second));
                settings.Folders.Add(new ApprovedFolder("folder.windows-third", folders.FormerLocation).Relocate(folders.Third));
                // Fill the panel's picker before the real Explorer entry. These
                // catalogue-only folders are never opened or created on disk.
                for (var i = 0; i < CataloguePaddingFolders; i++)
                    settings.Folders.Add(new($"folder.windows-padding-{i}", Path.Combine(root, "EspDesktop private fixture", $"Folder {i}")));
                app = await WindowsAppActions.Create(desktop);
                settings.AllowedApps.Add(app.Entry.Id);
                browser = desktop.Apps.FirstOrDefault(candidate =>
                    WindowsPresets.For(candidate.Executable, candidate.Target)?.Shortcuts.Any(preset => preset.Label == "New Tab") == true)
                    ?? throw new InvalidOperationException("The Windows Shell did not list a browser with shortcut presets.");
                settings.AllowedApps.Add(browser.Id);
            }
            else await desktop.Refresh();

            var otherApp = desktop.Apps.FirstOrDefault(candidate => !desktop.Allowed(candidate))
                ?? throw new InvalidOperationException("The Windows Shell did not supply any unapproved Start menu apps.");
            return new(desktop, $"Drive {char.ToUpperInvariant(root[0])}", otherApp.Id, folders, app, browser);
        }
        catch
        {
            app?.Dispose();
            folders?.Dispose();
            throw;
        }
    }

    public void Dispose()
    {
        AppActions?.Dispose();
        FolderActions?.Dispose();
    }

    internal static Task VerifyDiscoveryRefresh() => RunOnDesktop(async () =>
    {
        _ = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        var nextScan = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var lateDisplay = new DiscoveredDisplay("192.168.1.20:8443", "Late test display", new string('a', 64));
        var scans = 0;
        var store = new LocalStore(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()));
        var window = new SettingsWindow(smoke: false, discover: _ =>
        {
            scans++;
            if (scans == 2) nextScan.SetResult();
            return Task.FromResult<DiscoveredDisplay[]>(scans >= 2 ? [lateDisplay] : []);
        }, store: store);
        try
        {
            window.Show();
            Button Action(string label) => Descendants(window).OfType<Button>().Single(button => Equals(button.Content, label));
            TextBox Field(string label) => Descendants(window).OfType<TextBox>().Single(field => AutomationProperties.GetName(field) == label);
            void Click(string label) => Action(label).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            bool HasInput() => Descendants(window).OfType<TextBox>().Any();
            if (scans != 1 || HasInput() || Action("Next").IsEnabled)
                throw new InvalidOperationException("Setup must discover displays before showing any input fields.");
            await nextScan.Task.WaitAsync(TimeSpan.FromSeconds(16));
            var list = Descendants(window).OfType<ListBox>().Single(control => AutomationProperties.GetName(control) == "Nearby displays");
            list.SelectedItem = list.Items.Cast<ListBoxItem>().Single(item => Equals(item.Tag, lateDisplay));
            if (!Action("Next").IsEnabled) throw new InvalidOperationException("Selecting a display must enable Next.");
            Click("Next");
            var code = Field("Pairing code");
            if (Action("Pair display").IsEnabled) throw new InvalidOperationException("Pairing must require a code.");
            code.Text = "123456";
            if (!Action("Pair display").IsEnabled) throw new InvalidOperationException("Entering a code must enable pairing.");
            Click("Back");
            if (HasInput() || !Equals(((ListBoxItem)list.SelectedItem).Tag, lateDisplay))
                throw new InvalidOperationException("Going back must retain the selected display.");
            Click("Enter address manually");
            var address = Field("Display address");
            address.Text = "192.168.1.21";
            Click("Next");
            if (Field("Pairing code").Text.Length != 0) throw new InvalidOperationException("Changing displays must clear the code.");
            Click("Back");
            if (Field("Display address").Text != "192.168.1.21")
                throw new InvalidOperationException("Going back must retain the manual address.");
            Click("Find nearby displays");
            var beforeReopen = scans;
            window.Hide();
            window.Show();
            if (scans != beforeReopen + 1 || HasInput())
                throw new InvalidOperationException("Reopening setup did not refresh the list of nearby displays.");
            Console.WriteLine("Passed progressive Windows setup, automatic discovery refresh, and Back navigation for both address paths.");
        }
        finally { window.Quit(); }
    });

    private static IEnumerable<DependencyObject> Descendants(DependencyObject parent)
    {
        foreach (var child in LogicalTreeHelper.GetChildren(parent).OfType<DependencyObject>())
        {
            yield return child;
            foreach (var descendant in Descendants(child)) yield return descendant;
        }
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

internal sealed class WindowsFolderActions : IDisposable
{
    private readonly string root;
    public string First => Path.Combine(root, "First project, notes");
    public string Second => Path.Combine(root, "Second project");
    public string Third => Path.Combine(root, "Third project, résumé");
    public string FormerLocation => Path.Combine(root, "Original project, résumé");
    public string Denied => Path.Combine(root, "Private project");

    private WindowsFolderActions(string root) => this.root = root;

    public static WindowsFolderActions Create()
    {
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
        var opened = new List<string>();
        VisitWindows((_, _, folder) =>
        {
            if (string.Equals(Path.GetDirectoryName(folder), root, StringComparison.OrdinalIgnoreCase))
                opened.Add(Path.GetFileName(folder));
            return false;
        });
        throw new InvalidOperationException(
            $"File Explorer never opened {Path.GetFileName(path)}. Open fixture folders: {string.Join(", ", opened)}.");
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
                    var path = WindowsDesktop.ExplorerFolderPath(item);
                    if (path is not null && visitor(item, Convert.ToInt64(((dynamic)item).HWND),
                        Path.TrimEndingDirectorySeparator(path))) return;
                }
                catch (Exception e) when (WindowsDesktop.IsShellFailure(e)) { }
                finally { ComObject.Release(item); }
            }
        }
        finally { ComObject.Release(windows); ComObject.Release(shell); }
    }
}
#endif
