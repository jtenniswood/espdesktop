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
        var prompt = new TaskCompletionSource<PairingPrompt>();
        var lateDisplay = new DiscoveredDisplay("127.0.0.1:1", "Late test display", new string('a', 64));
        var scans = 0;
        var store = new LocalStore(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString()));
        var window = new SettingsWindow(smoke: false, discover: _ =>
        {
            scans++;
            if (scans == 2) nextScan.SetResult();
            return Task.FromResult<DiscoveredDisplay[]>(scans >= 2 ? [lateDisplay] : []);
        }, store: store, pairDisplay: (address, code, _, savedFingerprints) =>
        {
            if (address != lateDisplay.Address || code != "ABCD" || savedFingerprints.Count != 0)
                throw new InvalidOperationException("The setup must submit the selected display and the complete pairing code.");
            return Task.FromResult(new Pairing(address, lateDisplay.Fingerprint, new byte[32], DisplayName: lateDisplay.Name));
        }, requestPairingPrompt: (uri, _) => uri.Host == "127.0.0.1"
            ? prompt.Task : Task.FromResult(PairingPrompt.Unavailable));
        try
        {
            window.Show();
            using var trayMenu = window.CreateTrayMenu();
            void OpenTrayMenu()
            {
                trayMenu.Show(System.Drawing.Point.Empty);
                if (!trayMenu.Visible) throw new InvalidOperationException("The tray menu must open on the first and subsequent clicks.");
                trayMenu.Close();
            }
            string?[] TrayActions() => trayMenu.Items.OfType<System.Windows.Forms.ToolStripMenuItem>()
                .Select(item => item.Text).ToArray();
            OpenTrayMenu();
            if (!TrayActions().SequenceEqual(["No displays paired", "Add device", "Settings", "Support", "Quit"]) ||
                trayMenu.Items[0].Enabled || trayMenu.Items[1] is not System.Windows.Forms.ToolStripSeparator)
                throw new InvalidOperationException("The unpaired tray menu must show pairing status above the app actions.");
            Button Action(string label) => Descendants(window).OfType<Button>().Single(button => Equals(button.Content, label));
            TextBox Field(string label) => Descendants(window).OfType<TextBox>().Single(field => AutomationProperties.GetName(field) == label);
            void Click(string label) => Action(label).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            PairingCodeBoxes CodeBoxes() => Descendants(window).OfType<PairingCodeBoxes>().Single();
            TextBox[] Letters() => CodeBoxes().Children.OfType<TextBox>().ToArray();
            void PasteCode(string text)
            {
                var data = new DataObject(DataFormats.UnicodeText, text);
                Letters()[0].RaiseEvent(new DataObjectPastingEventArgs(data, false, DataFormats.UnicodeText));
            }
            bool HasInput() => Descendants(window).OfType<TextBox>().Any();
            if (scans != 1 || HasInput() || Action("Continue").IsEnabled)
                throw new InvalidOperationException("Setup must discover displays before showing any input fields.");
            await nextScan.Task.WaitAsync(TimeSpan.FromSeconds(16));
            var list = Descendants(window).OfType<ListBox>().Single(control => AutomationProperties.GetName(control) == "Display connection options");
            var nearby = list.Items.Cast<ListBoxItem>().Single(item => Equals(item.Tag, lateDisplay));
            void Select(string label) => list.SelectedItem = list.Items.Cast<ListBoxItem>()
                .Single(item => AutomationProperties.GetName(item).StartsWith(label + ",", StringComparison.Ordinal));
            bool HasStep(int step) => Descendants(window).OfType<TextBlock>().Any(text => text.Text == $"Step {step} of 3");
            if (!HasStep(1)) throw new InvalidOperationException("Setup must start at step one.");
            list.SelectedItem = nearby;
            if (!Action("Continue").IsEnabled) throw new InvalidOperationException("Selecting a display must enable Continue.");
            Click("Continue");
            if (!HasStep(2)) throw new InvalidOperationException("Continuing must enter step two.");
            if (HasInput()) throw new InvalidOperationException("The pairing code field must wait for the display's prompt.");
            prompt.SetResult(new PairingPrompt(PairingPromptKind.Reset, PairingPrompt.ShortLength));
            await Dispatcher.Yield(DispatcherPriority.ApplicationIdle);
            if (!Descendants(window).OfType<TextBlock>().Any(text => text.Text.StartsWith("Confirm Reset pairing", StringComparison.Ordinal)))
                throw new InvalidOperationException("An already paired display must show touchscreen reset instructions.");
            window.UpdateLayout();
            var letters = Letters();
            if (letters.Length != 4 || letters.Any(box => box.ActualWidth != 42 || box.ActualHeight != 52) || Action("Connect").IsEnabled)
                throw new InvalidOperationException("A four-letter display must show four empty pairing boxes.");
            letters[0].Text = "A";
            if (Action("Connect").IsEnabled) throw new InvalidOperationException("A partial code must not enable pairing.");
            PasteCode(" abcd ");
            if (CodeBoxes().Code != "ABCD" || !Action("Connect").IsEnabled)
                throw new InvalidOperationException("Pasting a complete code must fill the boxes and enable pairing.");
            Click("Back");
            if (HasInput() || !Equals(((ListBoxItem)list.SelectedItem).Tag, lateDisplay))
                throw new InvalidOperationException("Going back must retain the selected display.");
            Select("Enter address manually");
            var address = Field("Display address");
            address.Text = "192.168.1.21";
            Click("Continue");
            if (Letters().Length != 4 || Letters().Any(box => box.Text.Length != 0))
                throw new InvalidOperationException("Changing displays must clear the code.");
            PasteCode("abcd–efgh");
            if (Letters().Length != 8 || CodeBoxes().Code != "ABCD-EFGH")
                throw new InvalidOperationException("A legacy code must paste into eight boxes when the length is unknown.");
            Click("Back");
            if (Field("Display address").Text != "192.168.1.21")
                throw new InvalidOperationException("Going back must retain the manual address.");
            Select("Connect by USB");
            if (HasInput() || Descendants(window).OfType<ComboBox>().SingleOrDefault(control =>
                AutomationProperties.GetName(control) == "Display USB port") is null || !Action("Refresh ports").IsEnabled)
                throw new InvalidOperationException("USB setup must offer a COM port picker and refresh.");
            Click("Refresh ports");
            Select("Enter address manually");
            if (Field("Display address").Text != "192.168.1.21")
                throw new InvalidOperationException("Switching setup methods must preserve the manually entered address.");
            list.SelectedItem = nearby;
            var beforeReopen = scans;
            window.Hide();
            window.Show();
            if (scans != beforeReopen + 1 || HasInput())
                throw new InvalidOperationException("Reopening setup did not refresh the list of nearby displays.");
            list.SelectedItem = list.Items.Cast<ListBoxItem>().Single(item => Equals(item.Tag, lateDisplay));
            Click("Continue");
            PasteCode("ABCD");
            Click("Connect");
            if (!HasStep(3) || !Action("Configure screen").IsEnabled || !window.HasPairing)
                throw new InvalidOperationException("Successful pairing must offer to configure the screen.");
            OpenTrayMenu();
            var displayMenu = (System.Windows.Forms.ToolStripMenuItem)trayMenu.Items[0];
            if (!TrayActions().SequenceEqual([lateDisplay.Name, "Add device", "Settings", "Support", "Quit"]) ||
                displayMenu.DropDownItems.Count != 4 || displayMenu.DropDownItems[0].Enabled ||
                displayMenu.DropDownItems[1] is not System.Windows.Forms.ToolStripSeparator ||
                displayMenu.DropDownItems[2].Text != "Disconnect" || displayMenu.DropDownItems[3].Text != "Customize Display")
                throw new InvalidOperationException("A paired display must have its own status and actions in the tray menu.");
            Click("Done");
            if (HasStep(3) || !Action("Open display editor").IsEnabled || store.LoadPairings().Count() != 1)
                throw new InvalidOperationException("Done must return to the saved display without changing its pairing.");
            var toggle = Descendants(window).OfType<System.Windows.Controls.Primitives.ToggleButton>()
                .Single(control => AutomationProperties.GetName(control) == $"Connection for {lateDisplay.Name}");
            if (toggle.IsChecked != true) throw new InvalidOperationException("A newly connected display must have its switch on.");
            toggle.IsChecked = false;
            using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)))
            {
                while (!toggle.IsEnabled) await Task.Delay(25, timeout.Token);
            }
            OpenTrayMenu();
            var connect = ((System.Windows.Forms.ToolStripMenuItem)trayMenu.Items[0]).DropDownItems[2];
            if (toggle.IsChecked != false || connect.Text != "Connect")
                throw new InvalidOperationException("Turning off the switch must disconnect the display and update the tray menu.");
            connect.PerformClick();
            if (toggle.IsChecked != true)
                throw new InvalidOperationException("Connecting from the tray menu must turn the saved-display switch on.");
            Click("Add display");
            var saved = list.Items.Cast<ListBoxItem>().Single(item => Equals(item.Tag, lateDisplay));
            if (saved.IsEnabled || !AutomationProperties.GetName(saved).Contains("Already paired", StringComparison.Ordinal))
                throw new InvalidOperationException("Paired displays must be identified and excluded from selection.");
            Click("Cancel");
            if (HasStep(1) || !window.HasPairing)
                throw new InvalidOperationException("Cancel must return to the saved display.");
            Console.WriteLine("Passed the three-step Windows setup, discovery refresh, USB selection, Back, Done, Cancel, and tray menu.");
        }
        finally
        {
            window.Quit();
            prompt.TrySetCanceled();
        }
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
