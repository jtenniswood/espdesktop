using System.ComponentModel;
using System.IO;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
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
    private readonly LocalStore store;
    private readonly WindowsDesktop desktop;
    private readonly ObsConnection obs = new();
    private readonly TextBox obsPort = new() { Text = "4455" };
    private readonly PasswordBox obsPassword = new();
    private readonly TextBlock obsStatus = Paragraph("");
    private CancellationTokenSource? obsCancellation;
    private Task? obsTask;
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
    private readonly ListBox nearbyDisplays = new() { MaxHeight = 240, Margin = new Thickness(0, 4, 0, 8) };
    private readonly TextBlock discoveryStatus = Paragraph("Looking for nearby displays…");
    private readonly Button findDisplays;
    private Button? setupAction;
    private bool manualAddress;
    private string? pairingAddress, pairingName;
    private readonly ListBox navigation = new() { BorderThickness = new Thickness(0), Background = Brushes.Transparent };
    private readonly string[] pages = ["Display", "Apps", "Folders", "Updates", "OBS Studio", "Help"];
    private DiscoveredDisplay[] discovered = [];
    private HwndSource? hwndSource;
    private nint powerNotifications;
    private readonly List<DisplayConnection> displays = [];
    private bool addingDisplay;
    private sealed class DisplayConnection(Pairing pairing)
    {
        public Pairing Pairing { get; set; } = pairing;
        public CancellationTokenSource? Cancellation { get; set; }
        public Task? Task { get; set; }
        public bool Forgetting { get; set; }
        public TextBlock Status { get; } = Paragraph("Disconnected");
        public Button? ConnectionButton { get; set; }
    }
    private bool busy, scanning, discoveryChecked, appScanning, quitting, updateBusy, installerVerified;
    private WindowsRelease? release;
    private string? updatePath;
    private string updateStatus = "Check for new versions of EspDesktop.";
    public bool HasPairing => displays.Count > 0;
    public event Action<string>? ConnectionStatusChanged;
    public event Action<string>? ShortcutFailed;

    public SettingsWindow(bool smoke, Func<CancellationToken, Task<DiscoveredDisplay[]>>? discover = null, LocalStore? store = null)
    {
        this.smoke = smoke;
        this.discover = discover ?? Discovery.Find;
        this.store = store ?? new LocalStore();
        desktop = new(this.store.Settings, obs);
        obs.CatalogueChanged += desktop.ObsChanged;
        obs.RestoreBreakSettings(this.store.Settings.ObsBreakChoices, this.store.Settings.ObsBreakNeedsReview);
        obs.SaveBreakRecovery = SaveBreakRecovery;
        obs.RaiseMultiview = desktop.RaiseObsMultiview;
        obs.BreakSettingsChanged += () =>
        {
            if (!quitting && navigation.SelectedIndex == 4) Render();
        };
        obs.StatusChanged += () => obsStatus.Text = obs.Status;
        obsStatus.Text = obs.Status;
        AutomationProperties.SetLiveSetting(obsStatus, AutomationLiveSetting.Polite);
        desktop.ShortcutFailed += message => _ = Dispatcher.InvokeAsync(() => ShortcutFailed?.Invoke(message));
        findDisplays = Button("Refresh", async () => await Scan(interactive: true));
        if (!smoke)
        {
            displays.AddRange(this.store.LoadPairings().Select(pairing => new DisplayConnection(pairing)));
            if (this.store.PairingUnavailable) Status("Windows couldn’t open the saved pairings. Clear them and pair again.");
        }
        addingDisplay = !HasPairing && !this.store.PairingUnavailable;
        Title = "EspDesktop";
        Icon = new IconBitmapDecoder(App.IconUri, BitmapCreateOptions.None, BitmapCacheOption.OnLoad)
            .Frames.MaxBy(frame => frame.PixelWidth);
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
        string[] glyphs = ["\uE7F4", "\uE71D", "\uE8B7", "\uE895", "\uE714", "\uE897"];
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
        AutomationProperties.SetName(nearbyDisplays, "Nearby displays");
        AutomationProperties.SetLiveSetting(discoveryStatus, AutomationLiveSetting.Polite);
        nearbyDisplays.SelectionChanged += (_, _) => UpdateSetupAction();
        address.TextChanged += (_, _) => UpdateSetupAction();
        code.TextChanged += (_, _) => UpdateSetupAction();
        AutomationProperties.SetLiveSetting(connectionText, AutomationLiveSetting.Polite);
        AutomationProperties.SetLiveSetting(notice, AutomationLiveSetting.Polite);
        code.KeyDown += async (_, e) => { if (e.Key == Key.Enter) { e.Handled = true; await Pair(); } };
        address.KeyDown += (_, e) => { if (e.Key == Key.Enter) { e.Handled = true; ChooseDisplay(); } };
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
        foreach (var display in displays) StartConnection(display);
        RestoreObsConnection();
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

    public void OpenPanel()
    {
        if (displays.Count == 1) OpenPanel(displays[0].Pairing.Address);
        else ShowDisplaySettings();
    }

    private void ShowDisplaySettings()
    {
        ShowSettings();
        navigation.SelectedIndex = 0;
    }

    private void OpenPanel(string target, bool pairingPage = false)
    {
        DisplayEndpoint endpoint;
        try { endpoint = DisplayEndpoint.Parse(target); }
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
        if (displays.Count == 1) await ToggleConnection(displays[0]);
        else ShowDisplaySettings();
    }

    private async Task ToggleConnection(DisplayConnection display)
    {
        if (quitting || display.Forgetting) return;
        if (display.Cancellation != null) await StopConnection(display);
        else StartConnection(display);
    }

    private void StartConnection(DisplayConnection display)
    {
        if (display.Cancellation != null) return;
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        display.Cancellation = cancellation;
        display.Task = RunConnection(display, cancellation);
        UpdateConnectionButton(display);
    }

    private async Task RunConnection(DisplayConnection display, CancellationTokenSource cancellation)
    {
        await Task.Yield(); // publish the task before its completion can clear state
        try
        {
            await new DisplaySession(desktop, p =>
            {
                store.SavePairing(p);
                var changed = display.Pairing.Address != p.Address || display.Pairing.DisplayName != p.DisplayName;
                display.Pairing = p;
                if (changed && !quitting && !addingDisplay && navigation.SelectedIndex == 0) Render();
            }, status =>
            {
                display.Status.Text = status;
                if (displays.Count == 1) ConnectionStatusChanged?.Invoke(status);
            }, async (fingerprint, token) =>
            {
                try { return (await Discovery.Find(token)).FirstOrDefault(d => d.Fingerprint == fingerprint); }
                catch (NetworkInformationException) { return null; }
            }).RunAsync(display.Pairing, cancellation.Token);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException or InvalidOperationException)
        { display.Status.Text = "Couldn’t keep the connection. Check the saved pairing and try again."; }
        finally
        {
            display.Cancellation = null;
            display.Task = null;
            cancellation.Dispose();
            UpdateConnectionButton(display);
        }
    }

    private static void UpdateConnectionButton(DisplayConnection display)
    {
        if (display.ConnectionButton is { } button)
            button.Content = display.Cancellation == null ? "Connect" : "Disconnect";
    }

    private async Task StopConnection(DisplayConnection display)
    {
        if (display.Task is not { } task) return;
        display.Cancellation?.Cancel();
        await task;
        display.Status.Text = "Disconnected";
        if (!quitting && displays.Count == 1) ConnectionStatusChanged?.Invoke("Disconnected");
    }

    private async Task Pair()
    {
        if (busy || quitting || !addingDisplay || pairingAddress is not { } entered) return;
        var enteredCode = code.Text.Trim();
        if (enteredCode.Length == 0) return;
        busy = true;
        Status("");
        Render();
        try
        {
            var next = await DisplaySession.PairAsync(entered, enteredCode, lifetime.Token,
                displays.Select(display => display.Pairing.Fingerprint).ToHashSet(StringComparer.OrdinalIgnoreCase));
            store.SavePairing(next);
            var display = new DisplayConnection(next);
            displays.Add(display);
            ResetSetup();
            addingDisplay = false;
            ConnectionStatusChanged?.Invoke(displays.Count > 1 ? "Multiple displays" : "Connecting…");
            StartConnection(display);
        }
        catch (Exception e) when (e is ArgumentException or SessionException) { Status(e.Message); }
        catch (Exception e) when (e is OperationCanceledException or WebSocketException or HttpRequestException)
        { Status("Couldn’t reach the display. Check the address and that both devices are on the same network."); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException)
        { Status("Windows couldn’t save the pairing. Reset pairing on the display and try again."); }
        finally
        {
            busy = false;
            if (!quitting)
            {
                Render();
                if (addingDisplay && navigation.SelectedIndex == 0) code.Focus();
            }
        }
    }

    private async Task Forget(DisplayConnection? display)
    {
        if (busy || quitting || display?.Forgetting == true) return;
        var title = display == null ? "Clear saved pairings?" : "Forget this display?";
        var message = display == null
            ? "This removes all saved display pairings from this PC."
            : "To pair again, reset the pairing in this display’s web settings.";
        if (MessageBox.Show(this, message, title, MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK ||
            quitting || display?.Forgetting == true) return;
        if (display != null) display.Forgetting = true;
        try
        {
            if (display != null)
            {
                await StopConnection(display);
                store.ForgetPairing(display.Pairing.Fingerprint);
                displays.Remove(display);
            }
            else
            {
                await Task.WhenAll(displays.Select(StopConnection));
                store.ForgetPairing();
                displays.Clear();
            }
            if (!HasPairing)
            {
                ResetSetup();
                addingDisplay = true;
            }
            ConnectionStatusChanged?.Invoke(displays.Count == 1 ? displays[0].Status.Text : "");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Report("Windows couldn’t remove the saved pairing."); }
        finally
        {
            if (display != null) display.Forgetting = false;
            if (!quitting) Render();
        }
    }

    private void UpdateDiscovery()
    {
        if (smoke || quitting || !IsVisible || navigation.SelectedIndex != 0 || !addingDisplay ||
            store.PairingUnavailable || manualAddress || pairingAddress != null)
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
        if (scanning) return;
        scanning = true;
        if (interactive) findDisplays.Content = "Searching…";
        findDisplays.IsEnabled = false;
        if (nearbyDisplays.Items.Count == 0) discoveryStatus.Text = "Looking for nearby displays…";
        try { ShowDiscoveredDisplays((await discover(lifetime.Token)).Where(display => !HasDisplay(display.Fingerprint)).ToArray()); }
        catch (NetworkInformationException) { ShowDiscoveredDisplays([]); }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        finally
        {
            scanning = false;
            findDisplays.Content = "Refresh";
            findDisplays.IsEnabled = true;
            discoveryStatus.Text = nearbyDisplays.Items.Count == 0 ? "No nearby displays found." : "";
            discoveryStatus.Visibility = nearbyDisplays.Items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
            nearbyDisplays.Visibility = nearbyDisplays.Items.Count == 0 ? Visibility.Collapsed : Visibility.Visible;
        }
    }

    private void ShowDiscoveredDisplays(DiscoveredDisplay[] found)
    {
        if (quitting || (discoveryChecked && discovered.SequenceEqual(found))) return;
        discovered = found;
        discoveryChecked = true;
        var selected = (nearbyDisplays.SelectedItem as ListBoxItem)?.Tag as DiscoveredDisplay;
        nearbyDisplays.Items.Clear();
        foreach (var display in found)
        {
            var details = new StackPanel { Margin = new Thickness(4, 4, 4, 4) };
            details.Children.Add(new TextBlock { Text = display.Name, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            details.Children.Add(new TextBlock { Text = display.Address, FontSize = 12, TextWrapping = TextWrapping.Wrap });
            var item = new ListBoxItem { Content = details, Tag = display };
            AutomationProperties.SetName(item, $"{display.Name}, {display.Address}");
            nearbyDisplays.Items.Add(item);
            if (selected?.Fingerprint == display.Fingerprint) nearbyDisplays.SelectedItem = item;
        }
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
        await Task.WhenAll(displays.Select(StopConnection));
        await StopObs();
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
        setupAction = null;
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
            case 4: ObsPage(); break;
            default: HelpPage(); break;
        }
        UpdateDiscovery();
    }

    private void DisplayPage()
    {
        if (store.PairingUnavailable && !HasPairing)
        {
            var card = Card("Saved displays");
            card.Children.Add(connectionText);
            Row(card, Button("Clear saved pairings", async () => await Forget(null)));
            return;
        }

        if (addingDisplay)
        {
            DisplaySetup();
            return;
        }

        var header = new WrapPanel { Margin = new Thickness(0, 0, 0, 12) };
        header.Children.Add(Button("Add display", () =>
        {
            ResetSetup();
            addingDisplay = true;
            Render();
        }));
        body.Children.Add(header);
        foreach (var display in displays)
        {
            var saved = display.Pairing;
            var card = Card(saved.DisplayName ?? "Paired display", DisplayEndpoint.Parse(saved.Address).Socket.Host);
            if (display.Status.Parent is Panel previous) previous.Children.Remove(display.Status);
            AutomationProperties.SetLiveSetting(display.Status, AutomationLiveSetting.Polite);
            card.Children.Add(display.Status);
            display.ConnectionButton = Button("Connect", async () => await ToggleConnection(display), !display.Forgetting);
            UpdateConnectionButton(display);
            Row(card, Button("Open display editor", () => OpenPanel(display.Pairing.Address)),
                display.ConnectionButton, Button("Forget display", async () => await Forget(display), !display.Forgetting));
        }
        var permissions = Card("Windows integration");
        var shortcuts = Toggle("Allow keyboard shortcuts and screen lock", store.Settings.Shortcuts, value =>
        {
            store.Settings.Shortcuts = value;
            desktop.Changed();
            Save();
        });
        permissions.Children.Add(shortcuts);
        permissions.Children.Add(Toggle("Start EspDesktop when I sign in", LocalStore.StartsAtLogin, enabled =>
        {
            try { LocalStore.StartsAtLogin = enabled; }
            catch (Exception e) when (e is UnauthorizedAccessException or IOException) { Report("Windows couldn’t change the startup setting."); }
        }));
    }

    private void DisplaySetup()
    {
        if (pairingAddress is { } target)
        {
            var card = Card("Enter pairing code", pairingName == null ? DisplayEndpoint.Parse(target).Socket.Host :
                $"{pairingName} · {DisplayEndpoint.Parse(target).Socket.Host}");
            card.Children.Add(Paragraph("Get the code from the pairing page, or press and hold the Wi-Fi icon on your display."));
            Row(card, Button("Open pairing page", () => OpenPanel(target, pairingPage: true), !busy));
            code.IsEnabled = !busy;
            Field(card, "Pairing code", code);
            card.Children.Add(connectionText);
            SetupActions(card, busy ? "Pairing…" : "Pair display", async () => await Pair(), Button("Back", () =>
            {
                pairingAddress = pairingName = null;
                code.Clear();
                Status("");
                Report("");
                Render();
                if (manualAddress) address.Focus(); else nearbyDisplays.Focus();
            }, !busy));
            return;
        }

        var selection = Card(manualAddress ? "Enter display address" : "Choose your display",
            manualAddress ? "Enter the display’s local IP address or .local name." :
            "Keep your PC and display on the same local network.");
        selection.Children.Add(connectionText);
        if (manualAddress) Field(selection, "Display address", address);
        else
        {
            if (nearbyDisplays.Parent is Panel listParent) listParent.Children.Remove(nearbyDisplays);
            if (discoveryStatus.Parent is Panel statusParent) statusParent.Children.Remove(discoveryStatus);
            selection.Children.Add(discoveryStatus);
            nearbyDisplays.Visibility = nearbyDisplays.Items.Count == 0 ? Visibility.Collapsed : Visibility.Visible;
            selection.Children.Add(nearbyDisplays);
            if (findDisplays.Parent is Panel refreshParent) refreshParent.Children.Remove(findDisplays);
        }

        var alternate = Button(manualAddress ? "Find nearby displays" : "Enter address manually", () =>
        {
            manualAddress = !manualAddress;
            Status("");
            Render();
            if (manualAddress) address.Focus(); else nearbyDisplays.Focus();
        });
        if (manualAddress) Row(selection, alternate);
        else Row(selection, alternate, findDisplays);
        SetupActions(selection, "Next", ChooseDisplay, HasPairing ? Button("Cancel", () =>
        {
            ResetSetup();
            addingDisplay = false;
            Render();
        }) : null);
    }

    private void SetupActions(Panel card, string label, Action action, Button? secondary)
    {
        setupAction = Button(label, action);
        if (TryFindResource("AccentButtonStyle") is Style accent) setupAction.Style = accent;
        UpdateSetupAction();
        var actions = new WrapPanel { HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 16, 0, 0) };
        if (secondary != null) actions.Children.Add(secondary);
        actions.Children.Add(setupAction);
        card.Children.Add(actions);
    }

    private void UpdateSetupAction()
    {
        if (setupAction == null) return;
        setupAction.IsEnabled = !busy && (pairingAddress != null ? code.Text.Trim().Length > 0 :
            manualAddress ? address.Text.Trim().Length > 0 : nearbyDisplays.SelectedItem != null);
    }

    private void ChooseDisplay()
    {
        var selected = (nearbyDisplays.SelectedItem as ListBoxItem)?.Tag as DiscoveredDisplay;
        var target = manualAddress ? address.Text.Trim() : selected?.Address;
        if (string.IsNullOrEmpty(target)) return;
        try { _ = DisplayEndpoint.Parse(target); }
        catch (ArgumentException e) { Status(e.Message); return; }
        pairingAddress = target;
        pairingName = manualAddress ? null : selected?.Name;
        Status("");
        Render();
        code.Focus();
    }

    private bool HasDisplay(string fingerprint) => displays.Any(display =>
        display.Pairing.Fingerprint.Equals(fingerprint, StringComparison.OrdinalIgnoreCase));

    private void ResetSetup()
    {
        pairingAddress = pairingName = null;
        manualAddress = false;
        address.Clear();
        code.Clear();
        discovered = [];
        discoveryChecked = false;
        nearbyDisplays.Items.Clear();
        discoveryStatus.Text = "Looking for nearby displays…";
        discoveryStatus.Visibility = Visibility.Visible;
        Status("");
        Report("");
    }

    private void ObsPage()
    {
        var card = Card("OBS WebSocket", "In OBS Studio on this PC, open Tools → WebSocket Server Settings. Enable the server, then enter its port and password here.");
        if (obsStatus.Parent is Panel parent) parent.Children.Remove(obsStatus);
        card.Children.Add(obsStatus);
        obsPort.IsEnabled = obsPassword.IsEnabled = obsTask == null;
        AutomationProperties.SetName(obsPort, "OBS WebSocket port");
        AutomationProperties.SetName(obsPassword, "OBS WebSocket password");
        Field(card, "Server port", obsPort);
        Field(card, "Server password", obsPassword);
        Row(card, obsTask == null ? Button("Connect to OBS", ConnectObs) : Button("Disconnect", async () =>
        {
            if (!SaveObsSettings(null, null)) return;
            await StopObs();
            if (!quitting && navigation.SelectedIndex == 4) Render();
        }));
        card.Children.Add(Paragraph("Once connected, add OBS controls in the display editor. In Studio Mode, a scene card selects Preview."));
        ObsBreakPage();
    }

    private sealed record ObsChoice(Guid? Id, string Label);

    private void ObsBreakPage()
    {
        var state = obs.BreakSettings();
        var card = Card("Break scene", "Set a scene and an optional microphone to mute while you take a break.");
        if (state.Reviewing)
        {
            card.Children.Add(Paragraph("The break was interrupted. Check the live scene and microphone in OBS before using Break again."));
            Row(card, Button("I checked OBS", obs.AcknowledgeBreak));
            return;
        }
        if (state.Scenes.Length == 0)
        {
            card.Children.Add(Paragraph("Connect to OBS to choose a break scene."));
            return;
        }
        if (!state.Editable)
        {
            card.Children.Add(Paragraph("Resume from the display before changing the break settings."));
            return;
        }
        var scene = ObsPicker("No break scene", state.Scenes, state.Choice?.Scene);
        var microphone = ObsPicker("Keep microphone as is", state.Microphones, state.Choice?.Microphone);
        Field(card, "Break scene", scene);
        Field(card, "Microphone to mute", microphone);
        Row(card, Button("Save break settings", () =>
        {
            var selected = ((ObsChoice)scene.SelectedItem).Id;
            var selectedMic = ((ObsChoice)microphone.SelectedItem).Id;
            var choice = selected is { } sceneId ? new ObsBreakChoice(sceneId, selectedMic) : null;
            if (!obs.ConfigureBreak(state.Collection, choice, () => SaveBreakChoice(state.Collection, choice)))
                Report("Couldn’t save the break settings. Check OBS and try again.");
        }));
    }

    private static ComboBox ObsPicker(string emptyLabel, (Guid Id, string Name)[] choices, Guid? selected)
    {
        var items = new[] { new ObsChoice(null, emptyLabel) }
            .Concat(choices.Select(choice => new ObsChoice(choice.Id, choice.Name))).ToArray();
        return new ComboBox { ItemsSource = items, DisplayMemberPath = nameof(ObsChoice.Label),
            SelectedItem = items.FirstOrDefault(choice => choice.Id == selected) ?? items[0] };
    }

    private bool SaveBreakChoice(string collection, ObsBreakChoice? choice)
    {
        var choices = store.Settings.ObsBreakChoices;
        var previous = choices.GetValueOrDefault(collection);
        if (choice == null) choices.Remove(collection);
        else choices[collection] = choice;
        if (SaveObsBreakSettings()) return true;
        if (previous == null) choices.Remove(collection);
        else choices[collection] = previous;
        return false;
    }

    private bool SaveBreakRecovery(bool review)
    {
        var previous = store.Settings.ObsBreakNeedsReview;
        if (previous == review) return true;
        store.Settings.ObsBreakNeedsReview = review;
        if (SaveObsBreakSettings()) return true;
        store.Settings.ObsBreakNeedsReview = previous;
        return false;
    }

    private bool SaveObsBreakSettings()
    {
        try { store.Save(); return true; }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            Report("Windows couldn’t save the OBS break settings.");
            return false;
        }
    }

    private void ConnectObs()
    {
        if (obsTask != null || quitting) return;
        if (!int.TryParse(obsPort.Text.Trim(), out var port) || port is < 1 or > 65535)
        {
            Report("Enter a WebSocket port from 1 to 65535.");
            return;
        }
        var password = obsPassword.Password;
        var bytes = Encoding.UTF8.GetBytes(password);
        try
        {
            var protectedPassword = password.Length == 0 ? null : Convert.ToBase64String(UserProtection.Transform(bytes, false));
            if (!SaveObsSettings(port, protectedPassword)) return;
        }
        catch (CryptographicException) { Report("Windows couldn’t protect the OBS password."); return; }
        finally { CryptographicOperations.ZeroMemory(bytes); }
        Report("");
        StartObs(port, password);
        Render();
    }

    private bool SaveObsSettings(int? port, string? protectedPassword)
    {
        var settings = store.Settings;
        var before = (settings.ObsPort, settings.ObsProtectedPassword);
        (settings.ObsPort, settings.ObsProtectedPassword) = (port, protectedPassword);
        try { store.Save(); return true; }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            (settings.ObsPort, settings.ObsProtectedPassword) = before;
            Report("Windows couldn’t save the OBS connection settings.");
            return false;
        }
    }

    private void RestoreObsConnection()
    {
        if (store.Settings.ObsPort is not (>= 1 and <= 65535) || store.Settings.ObsPort is not { } port) return;
        obsPort.Text = port.ToString(System.Globalization.CultureInfo.InvariantCulture);
        try
        {
            if (store.Settings.ObsProtectedPassword is { } protectedPassword)
            {
                var bytes = UserProtection.Transform(Convert.FromBase64String(protectedPassword), true);
                try { obsPassword.Password = Encoding.UTF8.GetString(bytes); }
                finally { CryptographicOperations.ZeroMemory(bytes); }
            }
            StartObs(port, obsPassword.Password);
        }
        catch (Exception exception) when (exception is CryptographicException or FormatException)
        {
            obsStatus.Text = "Windows couldn’t open the saved OBS password. Enter it again to reconnect.";
        }
        if (navigation.SelectedIndex == 4) Render();
    }

    private void StartObs(int port, string password)
    {
        obsCancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        obsTask = obs.Run(port, password, obsCancellation.Token);
    }

    private async Task StopObs()
    {
        if (obsCancellation is not { } cancellation || obsTask is not { } task) return;
        await cancellation.CancelAsync();
        await task;
        if (obsCancellation != cancellation) return;
        obsCancellation = null;
        obsTask = null;
        cancellation.Dispose();
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
        var card = Card("Approved folders", "Paired displays see folder names. Paths stay on this PC.");
        Row(card, Button("Add folder", PickFolder));
        if (store.Settings.Folders.Count == 0) card.Children.Add(Paragraph("No folders added yet."));
        foreach (var folder in store.Settings.Folders)
        {
            card.Children.Add(new Separator { Margin = new Thickness(0) });
            var entry = new DockPanel { Margin = new Thickness(0, 12, 0, 8) };
            card.Children.Add(entry);
            var remove = Button($"Remove {folder.Label}", () =>
            {
                if (MessageBox.Show(this, $"Remove {folder.Label} from the display? Your files stay where they are.",
                    "Remove approved folder?", MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK) return;
                store.Settings.Folders.Remove(folder);
                desktop.Changed(); Save(); Render();
            });
            remove.Content = new TextBlock
            {
                Text = "\uE74D",
                FontFamily = new FontFamily("Segoe Fluent Icons, Segoe MDL2 Assets")
            };
            AutomationProperties.SetName(remove, $"Remove {folder.Label}");
            remove.ToolTip = $"Remove {folder.Label}";
            remove.Margin = new Thickness(12, 0, 0, 0);
            remove.VerticalAlignment = VerticalAlignment.Center;
            DockPanel.SetDock(remove, Dock.Right);
            entry.Children.Add(remove);

            var details = new StackPanel();
            details.Children.Add(new TextBlock { Text = folder.Label, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            details.Children.Add(Paragraph(Directory.Exists(folder.Path) ? folder.Path : $"{folder.Path} · Folder not found"));
            entry.Children.Add(details);
        }
    }

    private void PickFolder()
    {
        var picker = new OpenFolderDialog { Title = "Choose a folder for your display" };
        if (picker.ShowDialog(this) != true) return;
        var path = Path.TrimEndingDirectorySeparator(picker.FolderName);
        if (store.Settings.Folders.Any(f => string.Equals(f.Path, path, StringComparison.OrdinalIgnoreCase)))
        { Report("That folder is already approved."); return; }
        if (store.Settings.Folders.Count >= 64) { Report("Remove an approved folder before adding another."); return; }
        store.Settings.Folders.Add(new("folder." + Guid.NewGuid().ToString().ToLowerInvariant(), path));
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
        if (!installerVerified) return;
        var install = Toggle("Install verified updates when I quit", store.Settings.InstallUpdates, value =>
        {
            store.Settings.InstallUpdates = value;
            Save();
            if (value) _ = CheckUpdates(false);
        });
        install.IsEnabled = store.Settings.CheckForUpdates;
        card.Children.Add(install);
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

    private static void Field(Panel parent, string label, Control input)
    {
        if (input.Parent is Panel existing) existing.Children.Remove(input);
        parent.Children.Add(new Label { Content = label, Target = input, Padding = new Thickness(0, 6, 0, 3) });
        input.HorizontalAlignment = HorizontalAlignment.Left;
        input.MinWidth = Math.Max(200, input.MinWidth);
        input.MinHeight = 33;
        parent.Children.Add(input);
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
