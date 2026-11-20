using System.ComponentModel;
using System.IO;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using EspDesktop.Core;
using Microsoft.Win32;

namespace EspDesktop;

internal sealed class SettingsWindow : Window
{
    private readonly bool smoke;
    private readonly LocalStore store = new();
    private readonly WindowsDesktop desktop;
    private readonly Func<CancellationToken, Task<DiscoveredDisplay[]>> discover;
    private readonly CancellationTokenSource lifetime = new();
    private readonly DispatcherTimer discoveryTimer = new() { Interval = TimeSpan.FromSeconds(8) };
    private readonly DispatcherTimer updatesTimer = new() { Interval = TimeSpan.FromDays(1) };
    private readonly StackPanel body = new() { Margin = new Thickness(24, 0, 24, 24) };
    private readonly ScrollViewer scroll;
    private readonly TextBlock notice = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12) };
    private readonly TextBlock connectionText = new() { TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed };
    private readonly TextBox address = new() { MinWidth = 270 };
    private readonly TextBox code = new() { MaxLength = 16, CharacterCasing = CharacterCasing.Upper };
    private readonly StackPanel nearbyDisplays = new();
    private readonly Button findDisplays;
    private readonly ListBox navigation = new() { BorderThickness = new Thickness(0), Background = Brushes.Transparent };
    private readonly string[] pages = ["Display", "Apps", "Folders", "Updates", "Help"];
    private DiscoveredDisplay[] discovered = [];
    private HwndSource? hwndSource;
    private nint powerNotifications;
    private Pairing? pairing;
    private CancellationTokenSource? connectionCancellation;
    private Task? connectionTask;
    private bool busy, scanning, discoveryChecked, appScanning, quitting, updateBusy, installerVerified;
    private WindowsRelease? release;
    private string? updatePath;
    private string updateStatus = "Check for new versions of EspDesktop.";
    public bool HasPairing => pairing is not null;
    public event Action<string>? ConnectionStatusChanged;

    public SettingsWindow(bool smoke, Func<CancellationToken, Task<DiscoveredDisplay[]>>? discover = null)
    {
        this.smoke = smoke;
        this.discover = discover ?? Discovery.Find;
        desktop = new(store.Settings);
        findDisplays = Button("Find nearby displays", async () => await Scan(interactive: true));
        if (!smoke)
        {
            pairing = store.LoadPairing();
            address.Text = pairing?.Address ?? "";
            if (store.PairingUnavailable) Status("Windows couldn’t open the saved pairing. Forget it and pair again.");
        }
        Title = "EspDesktop";
        Icon = BitmapFrame.Create(App.IconUri);
        Width = 860;
        Height = 690;
        MinWidth = 670;
        MinHeight = 450;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Closing += (_, e) => { if (!quitting) { e.Cancel = true; Hide(); } };
        SourceInitialized += (_, _) => AttachNotifications();
        Closed += (_, _) => DetachNotifications();
        scroll = new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        var root = new Grid();
        root.RowDefinitions.Add(new() { Height = GridLength.Auto });
        root.RowDefinitions.Add(new());
        root.ColumnDefinitions.Add(new() { Width = new GridLength(180) });
        root.ColumnDefinitions.Add(new());
        var masthead = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(20, 16, 20, 18) };
        masthead.Children.Add(new Image { Source = Icon, Width = 28, Height = 28, Margin = new Thickness(0, 0, 12, 0) });
        masthead.Children.Add(new TextBlock { Text = "EspDesktop", FontSize = 20, FontWeight = FontWeights.SemiBold, VerticalAlignment = VerticalAlignment.Center });
        root.Children.Add(masthead);
        Grid.SetColumnSpan(masthead, 2);
        Grid.SetRow(navigation, 1);
        navigation.Margin = new Thickness(12, 0, 0, 8);
        AutomationProperties.SetName(navigation, "Settings pages");
        string[] glyphs = ["\uE7F4", "\uE71D", "\uE8B7", "\uE895", "\uE897"];
        for (var i = 0; i < pages.Length; i++)
        {
            var item = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(4, 6, 0, 6) };
            item.Children.Add(new TextBlock { Text = glyphs[i], FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets"),
                Width = 27, VerticalAlignment = VerticalAlignment.Center });
            item.Children.Add(new TextBlock { Text = pages[i] });
            var listItem = new ListBoxItem { Content = item };
            AutomationProperties.SetName(listItem, pages[i]);
            navigation.Items.Add(listItem);
        }
        navigation.SelectionChanged += (_, _) => { notice.Text = ""; scroll.ScrollToTop(); Render(); };
        root.Children.Add(navigation);
        Grid.SetRow(scroll, 1);
        Grid.SetColumn(scroll, 1);
        root.Children.Add(scroll);
        Content = root;
        navigation.SelectedIndex = 0;
        AutomationProperties.SetName(address, "Display address");
        AutomationProperties.SetName(code, "Pairing code");
        AutomationProperties.SetLiveSetting(connectionText, AutomationLiveSetting.Polite);
        AutomationProperties.SetLiveSetting(notice, AutomationLiveSetting.Polite);
        code.KeyDown += async (_, e) => { if (e.Key == Key.Enter) { e.Handled = true; await Pair(); } };
        IsVisibleChanged += (_, _) => UpdateDiscovery();
        discoveryTimer.Tick += async (_, _) => await Scan();
        updatesTimer.Tick += async (_, _) => await CheckUpdates(false);
    }

    public async Task Initialize()
    {
        _ = new WindowInteropHelper(this).EnsureHandle();
        await desktop.Refresh();
        if (quitting) return;
        if (smoke)
        {
            // Open every native page on the Windows runner to catch startup and
            // resource errors, and exercise COM / native interop on that host.
            var sample = new byte[] { 1, 2, 3, 4 };
            if (!UserProtection.Transform(UserProtection.Transform(sample, false), true).SequenceEqual(sample))
                throw new InvalidOperationException("Windows credential storage failed.");
            _ = Audio.Read().ToArray();
            _ = desktop.Metrics(1);
            _ = desktop.AppIcon(WindowsDesktop.ExplorerId, 144);
            foreach (var index in Enumerable.Range(0, pages.Length)) navigation.SelectedIndex = index;
            navigation.SelectedIndex = 0;
            return;
        }
        if (pairing != null) StartConnection();
        updatesTimer.Start();
        _ = CheckUpdates(false);
        Render();
    }

    public void CapturePreview()
    {
        if (!smoke || Environment.GetEnvironmentVariable("ESPDESKTOP_SETTINGS_PREVIEW") is not { Length: > 0 } path) return;
        var content = (FrameworkElement)Content;
        var dpi = VisualTreeHelper.GetDpi(content);
        var bitmap = new RenderTargetBitmap((int)Math.Ceiling(content.ActualWidth * dpi.DpiScaleX),
            (int)Math.Ceiling(content.ActualHeight * dpi.DpiScaleY), dpi.PixelsPerInchX, dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        // The window's DWM backdrop sits outside the WPF content visual.
        // Use its theme's matching solid color in the exported preview.
        var composite = new DrawingVisual();
        var area = new Rect(0, 0, content.ActualWidth, content.ActualHeight);
        using (var draw = composite.RenderOpen())
        {
            draw.DrawRectangle(TryFindResource("ApplicationBackgroundBrush") as Brush ?? SystemColors.WindowBrush, null, area);
            draw.DrawRectangle(new VisualBrush(content), null, area);
        }
        bitmap.Render(composite);
        var png = new PngBitmapEncoder();
        png.Frames.Add(BitmapFrame.Create(bitmap));
        using var output = File.Create(path);
        png.Save(output);
    }

    public void ShowSettings()
    {
        if (quitting) return;
        Show();
        if (WindowState == WindowState.Minimized) WindowState = WindowState.Normal;
        Activate();
    }

    public void OpenPanel() => OpenPanel(pairingPage: false);

    private void OpenPanel(bool pairingPage)
    {
        DisplayEndpoint endpoint;
        try { endpoint = DisplayEndpoint.Parse(pairing?.Address ?? address.Text); }
        catch (ArgumentException e)
        {
            ShowSettings();
            navigation.SelectedIndex = 0;
            Report(e.Message);
            return;
        }
        Report("");
        try
        {
            if (WindowsDesktop.OpenShell((pairingPage ? endpoint.PairingPage : endpoint.Settings).AbsoluteUri)) return;
        }
        catch (Exception e) when (WindowsDesktop.IsShellFailure(e)) { }
        ShowSettings();
        Report("Windows couldn’t open the display in your browser.");
    }

    public async Task ToggleConnection()
    {
        if (busy || quitting) return;
        if (pairing == null) { ShowSettings(); navigation.SelectedIndex = 0; return; }
        if (connectionCancellation != null) await StopConnection();
        else StartConnection();
        Render();
    }

    private void StartConnection()
    {
        if (pairing == null || connectionCancellation != null) return;
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        connectionCancellation = cancellation;
        connectionTask = RunConnection(pairing, cancellation);
    }

    private async Task RunConnection(Pairing saved, CancellationTokenSource cancellation)
    {
        await Task.Yield(); // publish the task before its completion can clear state
        try
        {
            await new DisplaySession(desktop, p =>
            {
                store.SavePairing(p);
                var changed = pairing?.Address != p.Address || pairing?.DisplayName != p.DisplayName;
                pairing = p;
                if (changed && !quitting && navigation.SelectedIndex == 0) Render();
            }, Status, async (fingerprint, token) =>
            {
                try { return (await Discovery.Find(token)).FirstOrDefault(d => d.Fingerprint == fingerprint); }
                catch (NetworkInformationException) { return null; }
            }).RunAsync(saved, cancellation.Token);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException or InvalidOperationException)
        { Status("EspDesktop couldn’t keep the connection. Check the saved pairing and try again."); }
        finally
        {
            if (connectionCancellation == cancellation)
            {
                connectionCancellation = null;
                connectionTask = null;
                cancellation.Dispose();
            }
            if (!quitting && navigation.SelectedIndex == 0) Render();
        }
    }

    private async Task StopConnection()
    {
        if (connectionCancellation == null) return;
        connectionCancellation.Cancel();
        if (connectionTask != null) await connectionTask;
        if (!quitting) Status("Disconnected");
    }

    private async Task Pair()
    {
        if (busy || quitting || pairing != null) return;
        var entered = address.Text.Trim();
        var enteredCode = code.Text.Trim();
        busy = true;
        Status("Pairing…");
        Render();
        try
        {
            var next = await DisplaySession.PairAsync(entered, enteredCode, lifetime.Token);
            store.SavePairing(next);
            pairing = next;
            code.Clear();
            StartConnection();
        }
        catch (Exception e) when (e is ArgumentException or SessionException) { Status(e.Message); }
        catch (Exception e) when (e is OperationCanceledException or WebSocketException or HttpRequestException)
        { Status("Couldn’t reach the display. Check the address and that both devices are on the same network."); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException)
        { Status("Windows couldn’t save the pairing. Reset pairing on the display and try again."); }
        finally { busy = false; if (!quitting) Render(); }
    }

    private async Task Forget()
    {
        if (busy || MessageBox.Show(this,
            "This removes the saved pairing from this PC. To pair again, reset the pairing in the display’s web settings.",
            "Forget this display?", MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK) return;
        busy = true;
        try
        {
            await StopConnection();
            store.ForgetPairing();
            if (pairing != null) address.Text = pairing.Address;
            pairing = null;
            code.Clear();
            Status("Display forgotten.");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Report("Windows couldn’t remove the saved pairing."); }
        finally { busy = false; if (!quitting) Render(); }
    }

    private void UpdateDiscovery()
    {
        if (smoke || quitting || !IsVisible || navigation.SelectedIndex != 0 || pairing != null || store.PairingUnavailable)
        {
            discoveryTimer.Stop();
            return;
        }
        if (discoveryTimer.IsEnabled) return;
        discoveryTimer.Start();
        _ = Scan(interactive: !discoveryChecked);
    }

    private async Task Scan(bool interactive = false)
    {
        if (!discoveryTimer.IsEnabled || busy) return;
        if (interactive) findDisplays.Content = "Finding displays…";
        if (scanning) return;
        scanning = true;
        try { ShowDiscoveredDisplays(await discover(lifetime.Token)); }
        catch (NetworkInformationException) { ShowDiscoveredDisplays([]); }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        finally
        {
            scanning = false;
            findDisplays.Content = "Find nearby displays";
        }
    }

    private void ShowDiscoveredDisplays(DiscoveredDisplay[] found)
    {
        if (quitting || (discoveryChecked && discovered.SequenceEqual(found))) return;
        discovered = found;
        discoveryChecked = true;
        nearbyDisplays.Children.Clear();
        if (found.Length == 0)
            nearbyDisplays.Children.Add(Paragraph("No nearby displays found. You can enter an address below."));
        foreach (var display in found)
            Row(nearbyDisplays, Button($"Use {display.Name} ({display.Address})", () =>
            {
                address.Text = display.Address;
                address.Focus();
            }));
    }

    private void Status(string value)
    {
        connectionText.Text = value;
        connectionText.Visibility = value.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        ConnectionStatusChanged?.Invoke(value);
    }

    private void Report(string text) => notice.Text = text;

    private async Task CheckUpdates(bool manual)
    {
        if (quitting || updateBusy || (!manual && !store.Settings.CheckForUpdates)) return;
        updateBusy = true;
        if (manual) updateStatus = "Checking for updates…";
        if (navigation.SelectedIndex == 3) Render();
        try
        {
            installerVerified = await Task.Run(() => Updates.CanInstall, lifetime.Token);
            var latest = await Updates.Check(lifetime.Token);
            if (latest?.Installer != release?.Installer) updatePath = null;
            release = latest;
            updateStatus = release is { } available ? $"EspDesktop {available.Version} is available." :
                "No newer Windows release was found.";
            if (release != null && installerVerified && store.Settings.InstallUpdates && updatePath == null)
            {
                updatePath = await Updates.Download(release, lifetime.Token);
                updateStatus = $"EspDesktop {release.Version} will install when you quit.";
            }
        }
        catch (Exception e) when (e is IOException or HttpRequestException or UnauthorizedAccessException or
            CryptographicException or OperationCanceledException or System.Text.Json.JsonException)
        { updateStatus = "Couldn’t check or download the update. Try again later."; }
        finally { updateBusy = false; if (!quitting && navigation.SelectedIndex == 3) Render(); }
    }

    private async Task InstallUpdate()
    {
        if (release == null || updateBusy || !installerVerified) return;
        updateBusy = true;
        updateStatus = "Downloading and checking the update…";
        Render();
        try
        {
            updatePath ??= await Updates.Download(release, lifetime.Token);
            Updates.Install(updatePath, quiet: false);
            updatePath = null;
            Quit();
        }
        catch (Exception e) when (e is IOException or HttpRequestException or UnauthorizedAccessException or
            CryptographicException or OperationCanceledException or Win32Exception)
        { updateStatus = "Couldn’t verify or start the installer. Try downloading it from the release page."; }
        finally { updateBusy = false; if (!quitting) Render(); }
    }

    public async void Quit()
    {
        if (quitting) return;
        quitting = true;
        discoveryTimer.Stop();
        updatesTimer.Stop();
        await lifetime.CancelAsync();
        await StopConnection();
        if (store.Settings.CheckForUpdates && store.Settings.InstallUpdates && updatePath is { } installer)
        {
            try { Updates.Install(installer, quiet: true); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException or Win32Exception) { }
        }
        Close();
        Application.Current.Shutdown();
        lifetime.Dispose();
    }

    private void Render()
    {
        if (quitting) return;
        if (connectionText.Parent is Panel previous) previous.Children.Remove(connectionText);
        body.Children.Clear();
        var index = Math.Max(0, navigation.SelectedIndex);
        body.Children.Add(new TextBlock { Text = pages[index], FontSize = 30, FontWeight = FontWeights.SemiBold,
            Margin = new Thickness(0, 0, 0, 14) });
        body.Children.Add(notice);
        switch (index)
        {
            case 0: DisplayPage(); break;
            case 1: AppsPage(); break;
            case 2: FoldersPage(); break;
            case 3: UpdatesPage(); break;
            default: HelpPage(); break;
        }
        UpdateDiscovery();
    }

    private void DisplayPage()
    {
        if (pairing is { } saved)
        {
            var card = Card(saved.DisplayName ?? "Paired display", DisplayEndpoint.Parse(saved.Address).Socket.Authority);
            card.Children.Add(connectionText);
            Row(card, Button("Open display editor", OpenPanel),
                Button(connectionCancellation == null ? "Connect" : "Disconnect", async () => await ToggleConnection()),
                Button("Forget display", async () => await Forget()));
        }
        else if (store.PairingUnavailable)
        {
            var card = Card("Saved pairing");
            card.Children.Add(connectionText);
            Row(card, Button("Forget display", async () => await Forget()));
        }
        else
        {
            var card = Card("Pair your display", "Use the same local network for your PC and EspDesktop display.");
            card.Children.Add(connectionText);
            if (nearbyDisplays.Parent is Panel previous) previous.Children.Remove(nearbyDisplays);
            card.Children.Add(nearbyDisplays);
            if (findDisplays.Parent is Panel previousRow) previousRow.Children.Remove(findDisplays);
            findDisplays.IsEnabled = !busy;
            Field(card, "Display address", address, findDisplays);
            Row(card, Button("Open pairing page", () => OpenPanel(pairingPage: true), !busy));
            card.Children.Add(Paragraph("Get the code from the pairing page or press and hold the display’s Wi-Fi icon."));
            var pair = Button("Pair display", async () => await Pair(), !busy);
            if (TryFindResource("AccentButtonStyle") is Style accent) pair.Style = accent;
            Field(card, "Pairing code", code, pair);
        }
        var permissions = Card("Windows integration");
        var shortcuts = Toggle("Allow keyboard shortcuts and screen lock", store.Settings.Shortcuts, value =>
        {
            store.Settings.Shortcuts = value;
            desktop.Changed();
            Save();
        });
        permissions.Children.Add(shortcuts);
        permissions.Children.Add(Paragraph("Shortcuts go to the approved app in front. Windows blocks input into apps running as administrator."));
        permissions.Children.Add(Toggle("Start EspDesktop when I sign in", LocalStore.StartsAtLogin, enabled =>
        {
            try { LocalStore.StartsAtLogin = enabled; }
            catch (Exception e) when (e is UnauthorizedAccessException or IOException) { Report("Windows couldn’t change the startup setting."); }
        }));
    }

    private void AppsPage()
    {
        var card = Card("Apps available to the display", "EspDesktop finds apps listed in your Start menu.");
        card.Children.Add(Toggle("Allow all available apps", store.Settings.AllApps, enabled =>
        {
            store.Settings.AllApps = enabled;
            if (!enabled) store.Settings.AllowedApps.Clear();
            desktop.Changed();
            Save();
            Render();
        }));
        Row(card, Button(appScanning ? "Refreshing…" : "Refresh apps", async () =>
        {
            appScanning = true; Render();
            try { await desktop.Refresh(); }
            finally { appScanning = false; if (navigation.SelectedIndex == 1) Render(); }
        }, !appScanning));
        if (store.Settings.AllApps) return;
        var filter = new TextBox { Margin = new Thickness(0, 0, 0, 8) };
        Field(card, "Search apps", filter);
        var results = new StackPanel();
        card.Children.Add(results);
        void ListApps()
        {
            results.Children.Clear();
            foreach (var app in desktop.Apps.Where(a => a.Name.Contains(filter.Text, StringComparison.CurrentCultureIgnoreCase)))
                results.Children.Add(Toggle(app.Name, desktop.Allowed(app), allowed =>
                {
                    if (allowed) store.Settings.AllowedApps.Add(app.Id); else store.Settings.AllowedApps.Remove(app.Id);
                    desktop.Changed();
                    Save();
                }));
            if (results.Children.Count == 0) results.Children.Add(Paragraph("No matching apps."));
        }
        filter.TextChanged += (_, _) => ListApps();
        ListApps();
    }

    private void FoldersPage()
    {
        var card = Card("Approved folders", "The display sees folder names. Paths stay on this PC.");
        Row(card, Button("Add folder", () => PickFolder(null)));
        if (store.Settings.Folders.Count == 0) card.Children.Add(Paragraph("No folders added yet."));
        foreach (var folder in store.Settings.Folders)
        {
            card.Children.Add(new Separator());
            card.Children.Add(new TextBlock { Text = folder.Label, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            card.Children.Add(Paragraph(Directory.Exists(folder.Path) ? folder.Path : $"{folder.Path} · Folder not found"));
            Row(card, Button("Choose again", () => PickFolder(folder)), Button("Remove", () =>
            {
                if (MessageBox.Show(this, $"Remove {folder.Label} from the display? Your files stay where they are.",
                    "Remove approved folder?", MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK) return;
                store.Settings.Folders.Remove(folder);
                desktop.Changed(); Save(); Render();
            }));
        }
    }

    private void PickFolder(ApprovedFolder? folder)
    {
        var picker = new OpenFolderDialog { Title = folder == null ? "Choose a folder for your display" : $"Choose a new location for {folder.Label}" };
        if (folder != null && Directory.Exists(folder.Path)) picker.InitialDirectory = folder.Path;
        if (picker.ShowDialog(this) != true) return;
        var path = Path.TrimEndingDirectorySeparator(picker.FolderName);
        if (store.Settings.Folders.Any(f => f.Id != folder?.Id && string.Equals(f.Path, path, StringComparison.OrdinalIgnoreCase)))
        { Report("That folder is already approved."); return; }
        if (folder == null)
        {
            if (store.Settings.Folders.Count >= 64) { Report("Remove an approved folder before adding another."); return; }
            store.Settings.Folders.Add(new("folder." + Guid.NewGuid().ToString().ToLowerInvariant(), path));
        }
        else store.Settings.Folders[store.Settings.Folders.IndexOf(folder)] = folder.Relocate(path);
        desktop.Changed(); Save(); Render();
    }

    private void UpdatesPage()
    {
        var card = Card($"EspDesktop {Updates.Current.ToString(3)}", updateStatus);
        Row(card, Button("Check for updates", async () => await CheckUpdates(true), !updateBusy),
            Button("Release downloads", () => Link(release?.Page ?? Updates.Releases)));
        if (release != null && installerVerified) Row(card, Button("Install update", async () => await InstallUpdate(), !updateBusy));
        card.Children.Add(Toggle("Automatically check for updates", store.Settings.CheckForUpdates, value =>
        { store.Settings.CheckForUpdates = value; Save(); Render(); }));
        var install = Toggle("Install verified updates when I quit", store.Settings.InstallUpdates, value =>
        {
            store.Settings.InstallUpdates = value;
            Save();
            if (value) _ = CheckUpdates(false);
        });
        install.IsEnabled = installerVerified && store.Settings.CheckForUpdates;
        card.Children.Add(install);
        if (!installerVerified) card.Children.Add(Paragraph("Automatic installation is available in signed Windows releases."));
    }

    private void HelpPage()
    {
        var card = Card("Set up your display", "Open Display, find your panel or enter its local address, and open its pairing page. Add your controls in the display’s browser editor after pairing.");
        Row(card, Button("Go to display settings", () => navigation.SelectedIndex = 0), Button("Open display editor", OpenPanel));
        var support = Card("Help and feedback");
        Row(support, Button("EspDesktop documentation", () => Link(new("https://jtenniswood.github.io/espdesktop/"))),
            Button("Report an issue", () => Link(new("https://github.com/jtenniswood/espdesktop/issues"))),
            Button("Support EspDesktop", () => Link(new("https://buymeacoffee.com/jtenniswood"))));
    }

    private void Save()
    {
        try { store.Save(); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Report("Windows couldn’t save these settings."); }
    }

    private void Link(Uri url)
    {
        try { _ = WindowsDesktop.OpenShell(url.AbsoluteUri); }
        catch (Exception e) when (WindowsDesktop.IsShellFailure(e)) { Report("Windows couldn’t open this link."); }
    }

    private StackPanel Card(string title, string? description = null)
    {
        var content = new StackPanel { Margin = new Thickness(16, 12, 16, 10) };
        content.Children.Add(new TextBlock { Text = title, FontSize = 16, FontWeight = FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 6) });
        if (description != null) content.Children.Add(Paragraph(description));
        var border = new Border { CornerRadius = new CornerRadius(8), BorderThickness = new Thickness(1),
            Margin = new Thickness(0, 0, 0, 12), Child = content };
        border.SetResourceReference(Border.BorderBrushProperty,
            TryFindResource("CardStrokeColorDefaultBrush") is Brush ? "CardStrokeColorDefaultBrush" : SystemColors.ControlDarkBrushKey);
        if (TryFindResource("CardBackgroundFillColorDefaultBrush") is Brush)
            border.SetResourceReference(Border.BackgroundProperty, "CardBackgroundFillColorDefaultBrush");
        body.Children.Add(border);
        return content;
    }

    private static TextBlock Paragraph(string text) => new() { Text = text, TextWrapping = TextWrapping.Wrap,
        Margin = new Thickness(0, 1, 0, 7) };

    private static void Field(Panel parent, string label, Control input, Button? action = null)
    {
        if (input.Parent is Panel existing) existing.Children.Remove(input);
        parent.Children.Add(new Label { Content = label, Target = input, Padding = new Thickness(0, 6, 0, 3) });
        input.HorizontalAlignment = HorizontalAlignment.Left;
        input.MinWidth = Math.Max(200, input.MinWidth);
        if (action == null) parent.Children.Add(input);
        else
        {
            var row = new WrapPanel { Margin = new Thickness(0, 0, 0, 6) };
            input.Margin = new Thickness(0, 0, 8, 0);
            input.MinHeight = action.MinHeight;
            action.Margin = new Thickness(0);
            row.Children.Add(input);
            row.Children.Add(action);
            parent.Children.Add(row);
        }
    }

    private static Button Button(string name, Action action, bool enabled = true)
    {
        var button = new Button { Content = name, IsEnabled = enabled, Margin = new Thickness(0, 0, 8, 6),
            Padding = new Thickness(12, 5, 12, 5), MinHeight = 33 };
        button.Click += (_, _) => action();
        return button;
    }

    private static CheckBox Toggle(string name, bool value, Action<bool> apply)
    {
        var check = new CheckBox { Content = name, IsChecked = value, Margin = new Thickness(0, 2, 0, 8), MinHeight = 24 };
        check.Checked += (_, _) => apply(true);
        check.Unchecked += (_, _) => apply(false);
        return check;
    }

    private static void Row(Panel parent, params UIElement[] elements)
    {
        var row = new WrapPanel { Margin = new Thickness(0, 6, 0, 0) };
        foreach (var item in elements) row.Children.Add(item);
        parent.Children.Add(row);
    }

    private static readonly Guid SessionDisplayStatus = new("2B84C20E-AD23-4DDF-93DB-05FFBD7EFCA5");
    private void AttachNotifications()
    {
        hwndSource = HwndSource.FromHwnd(new WindowInteropHelper(this).Handle);
        if (hwndSource == null) return;
        hwndSource.AddHook(Notifications);
        _ = WTSRegisterSessionNotification(hwndSource.Handle, 0);
        powerNotifications = RegisterPowerSettingNotification(hwndSource.Handle, in SessionDisplayStatus, 0);
    }

    private void DetachNotifications()
    {
        if (powerNotifications != 0) _ = UnregisterPowerSettingNotification(powerNotifications);
        if (hwndSource is { IsDisposed: false })
        {
            _ = WTSUnRegisterSessionNotification(hwndSource.Handle);
            hwndSource.RemoveHook(Notifications);
        }
    }

    private nint Notifications(nint hwnd, int message, nint wParam, nint lParam, ref bool handled)
    {
        if (message == 0x02B1)
        {
            if (wParam == 7) desktop.SessionChanged(true);
            if (wParam == 8) desktop.SessionChanged(false);
        }
        else if (message == 0x0218 && wParam == 0x8013 && lParam != 0 &&
                 Marshal.PtrToStructure<Guid>(lParam) == SessionDisplayStatus && Marshal.ReadInt32(lParam, 16) >= 4)
            desktop.DisplayChanged(Marshal.ReadInt32(lParam, 20) != 0);
        else if (message == 0x001E) TimeZoneInfo.ClearCachedData();
        return 0;
    }

    [DllImport("wtsapi32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSRegisterSessionNotification(nint window, uint flags);
    [DllImport("wtsapi32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSUnRegisterSessionNotification(nint window);
    [DllImport("user32.dll")] private static extern nint RegisterPowerSettingNotification(nint window, in Guid guid, uint flags);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterPowerSettingNotification(nint handle);
}
