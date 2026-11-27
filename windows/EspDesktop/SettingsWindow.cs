using System.ComponentModel;
using System.IO;
using System.IO.Ports;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shell;
using System.Windows.Threading;
using EspDesktop.Core;
using Microsoft.Win32;
using Forms = System.Windows.Forms;

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
    private readonly Func<Uri, CancellationToken, Task<PairingPrompt>> requestPairingPrompt;
    private readonly Func<string, string, CancellationToken, IReadOnlySet<string>, Task<Pairing>> pairDisplay;
    private readonly CancellationTokenSource lifetime = new();
    private readonly DispatcherTimer discoveryTimer = new() { Interval = TimeSpan.FromSeconds(8) };
    private readonly DispatcherTimer updatesTimer = new() { Interval = TimeSpan.FromDays(1) };
    private readonly StackPanel body = new() { Margin = new Thickness(24, 0, 24, 24) };
    private readonly ScrollViewer scroll;
    private readonly TextBlock notice = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 0, 0, 12), Visibility = Visibility.Collapsed };
    private readonly TextBlock connectionText = new() { TextWrapping = TextWrapping.Wrap, Visibility = Visibility.Collapsed };
    private readonly TextBox address = new() { MinWidth = 270 };
    private readonly PairingCodeBoxes code = new();
    private readonly ListBox setupChoices = new() { MaxHeight = 265, BorderThickness = new Thickness(0), Background = Brushes.Transparent };
    private readonly StackPanel setupDetails = new();
    private readonly ListBoxItem usbChoice = SetupChoice("\uE88E", "Connect by USB", "Choose a COM port", SetupMethod.Usb);
    private readonly ListBoxItem manualChoice = SetupChoice("\uE765", "Enter address manually", "Use an IP address or hostname", SetupMethod.Address);
    private bool updatingSetupChoices;
    private int setupGeneration;
    private readonly TextBlock discoveryStatus = Paragraph("Looking for nearby displays…");
    private readonly Button findDisplays;
    private Button? setupAction;
    private enum SetupMethod { Nearby, Address, Usb }
    private SetupMethod SelectedSetupMethod => setupChoices.SelectedItem is ListBoxItem { Tag: SetupMethod method }
        ? method : SetupMethod.Nearby;
    private readonly ComboBox usbPorts = new() { MinWidth = 140 };
    private DisplayConnection? changingConnection;
    private string? pairingAddress, pairingName;
    private PairingPrompt? pairingPrompt;
    private readonly ListBox navigation = new() { BorderThickness = new Thickness(0), Background = Brushes.Transparent };
    private static readonly (string Name, string Icon)[] Pages =
    [
        ("Display", "\uE7F4"),    // TVMonitor
        ("Apps", "\uE8A9"),       // ViewAll
        ("Folders", "\uE8B7"),    // Folder
        ("Updates", "\uE777"),    // UpdateRestore
        ("OBS Studio", "\uE714"), // Video
        ("Help", "\uE897")        // Help
    ];
    private DiscoveredDisplay[] discovered = [];
    private HwndSource? hwndSource;
    private nint powerNotifications;
    private readonly List<DisplayConnection> displays = [];
    private bool addingDisplay;
    private DisplayConnection? completedDisplay;
    private sealed class DisplayConnection(Pairing pairing)
    {
        public Pairing Pairing { get; set; } = pairing;
        public CancellationTokenSource? Cancellation { get; set; }
        public Task? Task { get; set; }
        public DisplaySession? Session { get; set; }
        public UsbDisplayEditor? UsbEditor { get; set; }
        public UsbEditorWindow? EditorWindow { get; set; }
        public TextBlock Status { get; } = Paragraph("Disconnected");
        public bool ConnectionEnabled => Cancellation is { IsCancellationRequested: false };
        public ToggleButton? ConnectionSwitch { get; set; }
        public bool IsConnected => Status.Text.StartsWith("Connected to ", StringComparison.Ordinal);

        public void SetStatus(string status)
        {
            Status.Text = status;
            Status.Visibility = IsConnected ? Visibility.Collapsed : Visibility.Visible;
        }
    }
    private bool busy, scanning, discoveryChecked, appScanning, quitting, updateBusy, installerVerified;
    private WindowsRelease? release;
    private string? updatePath;
    private string updateStatus = "Check for new versions of EspDesktop.";
    public bool HasPairing => displays.Count > 0;
    public event Action<string>? ConnectionStatusChanged;
    public event Action<string>? ShortcutFailed;
    public event Action<Version>? UpdateAvailable;

    public SettingsWindow(bool smoke, Func<CancellationToken, Task<DiscoveredDisplay[]>>? discover = null, LocalStore? store = null,
        Func<Uri, CancellationToken, Task<PairingPrompt>>? requestPairingPrompt = null,
        Func<string, string, CancellationToken, IReadOnlySet<string>, Task<Pairing>>? pairDisplay = null)
    {
        this.smoke = smoke;
        this.discover = discover ?? Discovery.Find;
        this.requestPairingPrompt = requestPairingPrompt ?? DisplayPairingPrompt.Request;
        this.pairDisplay = pairDisplay ?? ((address, code, token, saved) =>
            DisplaySession.PairAsync(address, code, token, saved,
                Environment.MachineName + " (Windows)", this.store.ClientId()));
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
        findDisplays = Button("Refresh nearby displays", async () => await Scan(interactive: true));
        if (!smoke)
        {
            displays.AddRange(this.store.LoadPairings().Select(pairing => new DisplayConnection(pairing)));
            if (this.store.PairingUnavailable) Status("Windows couldn’t open the saved pairings. Clear them and pair again.");
        }
        addingDisplay = !HasPairing && !this.store.PairingUnavailable;
        Title = "EspDesktop";
        Icon = new IconBitmapDecoder(App.IconUri, BitmapCreateOptions.None, BitmapCacheOption.OnLoad)
            .Frames.MaxBy(frame => frame.PixelWidth);
        var captionInset = new Thickness(0, SystemParameters.WindowNonClientFrameThickness.Top, 0, 0);
        WindowChrome.SetWindowChrome(this, new WindowChrome
        {
            GlassFrameThickness = captionInset,
            NonClientFrameEdges = NonClientFrameEdges.Left | NonClientFrameEdges.Right | NonClientFrameEdges.Bottom
        });
        Width = 860;
        Height = 690;
        MinWidth = 670;
        MinHeight = 450;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Closing += (_, e) => { if (!quitting) { e.Cancel = true; Hide(); } };
        SourceInitialized += (_, _) => AttachNotifications();
        Closed += (_, _) =>
        {
            desktop.Dispose();
            DetachNotifications();
        };
        scroll = new ScrollViewer { Content = body, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 12, 0, 0) };
        var root = new Grid { Background = Brushes.Transparent, Margin = captionInset, UseLayoutRounding = true };
        root.ColumnDefinitions.Add(new() { Width = new GridLength(180) });
        root.ColumnDefinitions.Add(new());
        navigation.Margin = new Thickness(12, 12, 4, 8);
        navigation.Resources.MergedDictionaries.Add(new ResourceDictionary
        {
            Source = new Uri("pack://application:,,,/EspDesktop;component/SettingsNavigation.xaml")
        });
        navigation.SetResourceReference(ItemsControl.ItemContainerStyleProperty, "SettingsNavigationItem");
        AutomationProperties.SetName(navigation, "Settings pages");
        foreach (var page in Pages)
        {
            var listItem = new ListBoxItem { Content = page.Name, Tag = page.Icon };
            AutomationProperties.SetName(listItem, page.Name);
            navigation.Items.Add(listItem);
        }
        navigation.SelectionChanged += (_, _) => { Report(""); scroll.ScrollToTop(); Render(); };
        root.Children.Add(navigation);
        Grid.SetColumn(scroll, 1);
        root.Children.Add(scroll);
        Resources.MergedDictionaries.Add(new ResourceDictionary
        {
            Source = new Uri("pack://application:,,,/EspDesktop;component/DisplayConnectionSwitch.xaml")
        });
        Content = root;
        PopulateSetupChoices([]);
        navigation.SelectedIndex = 0;
        AutomationProperties.SetName(address, "Display address");
        AutomationProperties.SetName(usbPorts, "Display USB port");
        usbPorts.SelectionChanged += (_, _) => UpdateSetupAction();
        AutomationProperties.SetName(setupChoices, "Display connection options");
        AutomationProperties.SetLiveSetting(discoveryStatus, AutomationLiveSetting.Polite);
        setupChoices.SelectionChanged += (_, _) =>
        {
            if (updatingSetupChoices) return;
            Status("");
            ShowSetupDetails();
            UpdateSetupAction();
        };
        address.TextChanged += (_, _) => UpdateSetupAction();
        code.CodeChanged += UpdateSetupAction;
        AutomationProperties.SetLiveSetting(connectionText, AutomationLiveSetting.Polite);
        AutomationProperties.SetLiveSetting(notice, AutomationLiveSetting.Polite);
        code.Submitted += async () => await Pair();
        address.KeyDown += async (_, e) => { if (e.Key == Key.Enter) { e.Handled = true; await ChooseDisplay(); } };
        IsVisibleChanged += (_, _) => UpdateDiscovery();
        discoveryTimer.Tick += async (_, _) => await Scan();
        updatesTimer.Tick += async (_, _) => await CheckUpdates(false);
        setupChoices.KeyDown += async (_, e) =>
        {
            if (e.Key != Key.Enter) return;
            e.Handled = true;
            if (SelectedSetupMethod == SetupMethod.Address) address.Focus();
            else if (SelectedSetupMethod == SetupMethod.Usb) usbPorts.Focus();
            else await ChooseDisplay();
        };
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
            foreach (var index in Enumerable.Range(0, Pages.Length)) navigation.SelectedIndex = index;
            navigation.SelectedIndex = 0;
            return;
        }
        foreach (var display in displays) StartConnection(display);
        RestoreObsConnection();
        desktop.StartNotifications();
        updatesTimer.Start();
        _ = CheckUpdates(false);
        Render();
    }

    public void CapturePreview()
    {
        if (!smoke || Environment.GetEnvironmentVariable("ESPDESKTOP_SETTINGS_PREVIEW") is not { Length: > 0 } path) return;
        CapturePagePreview(path);
        var stem = Path.ChangeExtension(path, null);
        for (var index = 1; index < navigation.Items.Count; index++)
        {
            navigation.SelectedIndex = index;
            var page = (ListBoxItem)navigation.Items[index];
            var name = AutomationProperties.GetName(page).Replace(' ', '-').ToLowerInvariant();
            CapturePagePreview($"{stem}-{name}.png");
        }
        navigation.SelectedIndex = 0;
    }

    private void CapturePagePreview(string path)
    {
        UpdateLayout();
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

    public void ShowUpdates()
    {
        if (quitting) return;
        navigation.SelectedIndex = 3;
        ShowSettings();
    }

    public void OpenPanel()
    {
        if (displays.Count == 1) OpenPanel(displays[0]);
        else ShowDisplaySettings();
    }

    private void ShowDisplaySettings()
    {
        ShowSettings();
        navigation.SelectedIndex = 0;
    }

    private bool OpenPanel(DisplayConnection display)
    {
        if (DisplayEndpoint.Parse(display.Pairing.Address).UsbPort is null)
        {
            return OpenPanel(display.Pairing.Address);
        }

        if (display.EditorWindow is { } open)
        {
            if (open.WindowState == WindowState.Minimized) open.WindowState = WindowState.Normal;
            open.Activate();
            return true;
        }
        if (display.UsbEditor is null)
        {
            ShowDisplaySettings();
            Report(display.IsConnected
                ? "Update this display’s firmware to open its editor over USB."
                : "Connect the display by USB before opening its editor.");
            return false;
        }

        var window = new UsbEditorWindow(display.Pairing.DisplayName ?? "Display", () => display.UsbEditor);
        if (IsVisible) window.Owner = this;
        display.EditorWindow = window;
        window.Closed += (_, _) => display.EditorWindow = null;
        window.Show();
        return true;
    }

    private bool OpenPanel(string target, bool pairingPage = false)
    {
        DisplayEndpoint endpoint;
        try { endpoint = DisplayEndpoint.Parse(target); }
        catch (ArgumentException e)
        {
            ShowSettings();
            navigation.SelectedIndex = 0;
            Report(e.Message);
            return false;
        }
        var page = pairingPage ? endpoint.PairingPage : endpoint.Settings;
        if (page is null) return false;
        Report("");
        try
        {
            if (WindowsDesktop.OpenShell(page.AbsoluteUri)) return true;
        }
        catch (Exception e) when (WindowsDesktop.IsShellFailure(e)) { }
        ShowSettings();
        Report("Windows couldn’t open the display in your browser.");
        return false;
    }

    internal Forms.ContextMenuStrip CreateTrayMenu()
    {
        var menu = new Forms.ContextMenuStrip
        {
            ShowItemToolTips = true, ShowCheckMargin = true, ShowImageMargin = false
        };
        menu.Opening += (_, args) =>
        {
            PopulateTrayMenu(menu);
            args.Cancel = false;
        };
        return menu;
    }

    private void PopulateTrayMenu(Forms.ContextMenuStrip menu)
    {
        // Rebuild each time so names, status, and available actions reflect the current displays.
        foreach (var item in menu.Items.OfType<Forms.ToolStripItem>().ToArray())
            item.Dispose();

        if (!HasPairing)
            menu.Items.Add(new Forms.ToolStripMenuItem("No displays paired") { Enabled = false });

        foreach (var display in displays)
        {
            var address = DisplayEndpoint.Parse(display.Pairing.Address).Label;
            var status = display.Status.Text;
            var item = new Forms.ToolStripMenuItem((display.Pairing.DisplayName ?? address).Replace("&", "&&"))
            {
                Checked = display.IsConnected,
                ToolTipText = address
            };
            item.DropDownItems.Add(new Forms.ToolStripMenuItem(status.Replace("&", "&&")) { Enabled = false });
            item.DropDownItems.Add(new Forms.ToolStripSeparator());
            var connect = !display.ConnectionEnabled;
            item.DropDownItems.Add(new Forms.ToolStripMenuItem(connect ? "Connect" : "Disconnect",
                null, async (_, _) => await SetConnection(display, connect))
            {
                Enabled = !busy && display.Cancellation?.IsCancellationRequested != true
            });
            item.DropDownItems.Add(new Forms.ToolStripMenuItem("Customize Display", null,
                (_, _) => OpenPanel(display)) { Enabled = !busy });
            menu.Items.Add(item);
        }
        menu.Items.Add(new Forms.ToolStripSeparator());

        menu.Items.Add(new Forms.ToolStripMenuItem("Add device", null, (_, _) =>
        {
            ShowDisplaySettings();
            if (!addingDisplay) BeginDisplaySetup();
        }) { Enabled = !busy && !store.PairingUnavailable });
        menu.Items.Add("Settings", null, (_, _) => ShowSettings());
        menu.Items.Add("Support", null, (_, _) =>
        {
            navigation.SelectedIndex = Pages.Length - 1;
            ShowSettings();
        });
        menu.Items.Add("Quit", null, (_, _) => Quit());
        SpaceTrayMenuItems(menu);
    }

    private static void SpaceTrayMenuItems(Forms.ToolStripDropDownMenu menu)
    {
        var margin = new Forms.Padding(menu.LogicalToDeviceUnits(6), menu.LogicalToDeviceUnits(3),
            menu.LogicalToDeviceUnits(6), menu.LogicalToDeviceUnits(3));
        foreach (var item in menu.Items.OfType<Forms.ToolStripMenuItem>())
        {
            item.Margin = margin;
            if (item.HasDropDownItems && item.DropDown is Forms.ToolStripDropDownMenu submenu)
            {
                submenu.ShowImageMargin = false;
                SpaceTrayMenuItems(submenu);
            }
        }

        // WinForms measures the dropdown width without the horizontal item margins.
        menu.MinimumSize = System.Drawing.Size.Empty;
        var preferredWidth = menu.GetPreferredSize(System.Drawing.Size.Empty).Width;
        menu.MinimumSize = new System.Drawing.Size(preferredWidth + margin.Horizontal, 0);
    }

    private async Task SetConnection(DisplayConnection display, bool enabled)
    {
        if (enabled == display.ConnectionEnabled) return;
        if (busy || quitting || !displays.Contains(display) || display.Cancellation?.IsCancellationRequested == true)
        {
            UpdateConnectionSwitch(display);
            return;
        }

        if (enabled) StartConnection(display);
        else await StopConnection(display);
    }

    private void StartConnection(DisplayConnection display, string? newAddress = null)
    {
        if (display.Cancellation != null) return;
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        display.Cancellation = cancellation;
        display.Task = RunConnection(display, cancellation, newAddress);
        UpdateConnectionSwitch(display);
    }

    private async Task RunConnection(DisplayConnection display, CancellationTokenSource cancellation, string? newAddress)
    {
        await Task.Yield(); // publish the task before its completion can clear state
        try
        {
            var session = new DisplaySession(desktop, p =>
            {
                store.SavePairing(p);
                var changed = display.Pairing.Address != p.Address || display.Pairing.DisplayName != p.DisplayName;
                display.Pairing = p;
                if (changed && !quitting && !addingDisplay && navigation.SelectedIndex == 0) Render();
            }, status =>
            {
                display.SetStatus(status);
                if (displays.Count == 1) ConnectionStatusChanged?.Invoke(status);
            }, async (fingerprint, token) =>
            {
                try { return (await Discovery.Find(token)).FirstOrDefault(d => d.Fingerprint == fingerprint); }
                catch (NetworkInformationException) { return null; }
            });
            display.Session = session;
            await session.RunAsync(display.Pairing, cancellation.Token, newAddress, editor => display.UsbEditor = editor);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException or InvalidOperationException)
        { display.SetStatus("Couldn’t keep the connection. Check the saved pairing and try again."); }
        finally
        {
            display.Session = null;
            display.Cancellation = null;
            display.Task = null;
            if (cancellation.IsCancellationRequested && !quitting)
            {
                display.SetStatus("Disconnected");
                if (displays.Count == 1) ConnectionStatusChanged?.Invoke("Disconnected");
            }
            cancellation.Dispose();
            UpdateConnectionSwitch(display);
        }
    }

    private void UpdateConnectionSwitch(DisplayConnection display)
    {
        if (display.ConnectionSwitch is not { } connection) return;
        connection.IsEnabled = !busy && !quitting && display.Cancellation?.IsCancellationRequested != true;
        connection.IsChecked = display.ConnectionEnabled;
    }

    private async Task StopConnection(DisplayConnection display)
    {
        if (display.Task is not { } task) return;
        display.Cancellation?.Cancel();
        UpdateConnectionSwitch(display);
        await task;
    }

    private async Task Pair()
    {
        if (busy || quitting || !addingDisplay || pairingAddress is not { } entered) return;
        if (code.Code is not { } enteredCode) return;
        busy = true;
        Status("");
        Render();
        try
        {
            var next = await pairDisplay(entered, enteredCode, lifetime.Token,
                displays.Select(display => display.Pairing.Fingerprint).ToHashSet(StringComparer.OrdinalIgnoreCase));
            store.SavePairing(next);
            var display = new DisplayConnection(next);
            displays.Add(display);
            ResetSetup();
            completedDisplay = display;
            ConnectionStatusChanged?.Invoke(displays.Count > 1 ? "Multiple displays" : "Connecting…");
            StartConnection(display);
        }
        catch (Exception e) when (e is ArgumentException or SessionException) { Status(e.Message); }
        catch (Exception e) when (e is OperationCanceledException or WebSocketException or HttpRequestException)
        {
            Status(DisplayEndpoint.Parse(entered).UsbPort is { } port
                ? $"Couldn’t reach the display on {port}. Check the USB cable, port and firmware."
                : "Couldn’t reach the display. Check the address and that both devices are on the same network.");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or CryptographicException)
        { Status("Windows couldn’t save the pairing. Reset pairing on the display and try again."); }
        finally
        {
            busy = false;
            if (!quitting)
            {
                Render();
                if (navigation.SelectedIndex == 0)
                {
                    if (completedDisplay is not null)
                    {
                        scroll.ScrollToTop();
                        setupAction?.Focus();
                    }
                    else if (pairingAddress is not null) code.FocusCode();
                }
            }
        }
    }

    private async Task Forget(DisplayConnection? display)
    {
        if (busy || quitting) return;
        var title = display == null ? "Clear saved pairings?" : "Forget this display?";
        var message = display == null
            ? "This removes all saved display pairings from this PC and, when the displays are reachable, from the displays too."
            : "This removes the saved pairing from this PC and, when the display is reachable, from the display too. Cards set to this computer stop working.";
        if (MessageBox.Show(this, message, title, MessageBoxButton.OKCancel, MessageBoxImage.Question) != MessageBoxResult.OK ||
            quitting || busy) return;
        busy = true;
        Render();
        try
        {
            if (display != null)
            {
                if (display.Session is { } session) await session.ShowPairingBeforeDisconnecting();
                await StopConnection(display);
                await DisplaySession.ForgetAsync(display.Pairing, lifetime.Token);
                store.ForgetPairing(display.Pairing.Fingerprint);
                display.EditorWindow?.Close();
                displays.Remove(display);
            }
            else
            {
                await Task.WhenAll(displays.Select(StopConnection));
                await Task.WhenAll(displays.Select(display => DisplaySession.ForgetAsync(display.Pairing, lifetime.Token)));
                store.ForgetPairing();
                foreach (var saved in displays) saved.EditorWindow?.Close();
                displays.Clear();
            }
            if (!HasPairing)
            {
                ResetSetup();
                addingDisplay = true;
            }
            ConnectionStatusChanged?.Invoke(displays.Count == 1 ? displays[0].Status.Text : "");
            Report("");
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { Report("Windows couldn’t remove the saved pairing."); }
        finally
        {
            busy = false;
            if (!quitting) Render();
        }
    }

    private void UpdateDiscovery()
    {
        if (smoke || quitting || !IsVisible || navigation.SelectedIndex != 0 || !addingDisplay ||
            store.PairingUnavailable || pairingAddress != null || completedDisplay != null)
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
        if (!discoveryTimer.IsEnabled || busy || scanning) return;
        var generation = setupGeneration;
        scanning = true;
        if (interactive) findDisplays.Content = "Searching…";
        findDisplays.IsEnabled = false;
        try
        {
            var found = await discover(lifetime.Token);
            if (generation == setupGeneration)
                ShowDiscoveredDisplays(changingConnection is { } saved
                    ? found.Where(display => saved.Pairing.Fingerprint.Equals(display.Fingerprint, StringComparison.OrdinalIgnoreCase)).ToArray()
                    : found);
        }
        catch (NetworkInformationException)
        {
            if (generation == setupGeneration) ShowDiscoveredDisplays([]);
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        finally
        {
            scanning = false;
            findDisplays.Content = "Refresh nearby displays";
            findDisplays.IsEnabled = !busy;
            if (generation != setupGeneration) _ = Scan(interactive: true);
        }
    }

    private void ShowDiscoveredDisplays(DiscoveredDisplay[] found)
    {
        if (quitting || (discoveryChecked && discovered.SequenceEqual(found))) return;
        discovered = found;
        discoveryChecked = true;
        PopulateSetupChoices(found);
        discoveryStatus.Text = found.Length == 0 ? "No nearby displays found." : "";
        discoveryStatus.Visibility = found.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
    }

    private void PopulateSetupChoices(DiscoveredDisplay[] found)
    {
        var previous = setupChoices.SelectedItem as ListBoxItem;
        var restoreFocus = previous?.IsKeyboardFocusWithin == true;
        ListBoxItem? selected = previous == usbChoice || previous == manualChoice ? previous : null;
        updatingSetupChoices = true;
        setupChoices.Items.Clear();
        foreach (var display in found)
        {
            var paired = changingConnection is null && HasDisplay(display.Fingerprint);
            var item = SetupChoice(paired ? "\uE73E" : "\uE7F4", display.Name,
                paired ? "Already paired" : display.Address, display);
            item.IsEnabled = !paired;
            setupChoices.Items.Add(item);
            if (!paired && previous?.Tag is DiscoveredDisplay old &&
                old.Fingerprint.Equals(display.Fingerprint, StringComparison.OrdinalIgnoreCase)) selected = item;
        }
        setupChoices.Items.Add(manualChoice);
        setupChoices.Items.Add(usbChoice);
        setupChoices.SelectedItem = selected;
        updatingSetupChoices = false;
        if (restoreFocus) selected?.Focus();
        UpdateSetupAction();
    }

    private static ListBoxItem SetupChoice(string glyph, string title, string subtitle, object tag)
    {
        var item = new ListBoxItem
        {
            Content = SettingsCard.Header(glyph, title, subtitle),
            Tag = tag, Padding = new Thickness(12, 8, 12, 8), Margin = new Thickness(0, 0, 0, 4),
            MinHeight = 56, HorizontalContentAlignment = HorizontalAlignment.Stretch
        };
        item.SetValue(Border.CornerRadiusProperty, new CornerRadius(6));
        item.SetResourceReference(Control.BackgroundProperty, "CardBackgroundFillColorDefaultBrush");
        AutomationProperties.SetName(item, $"{title}, {subtitle}");
        return item;
    }

    private void Status(string value)
    {
        connectionText.Text = value;
        connectionText.Visibility = value.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        ConnectionStatusChanged?.Invoke(value);
    }

    private void Report(string text)
    {
        notice.Text = text;
        notice.Visibility = text.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
    }

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
            if (quitting) return;
            if (latest?.Installer != release?.Installer) updatePath = null;
            release = latest;
            updateStatus = release is { } available ? $"EspDesktop {available.Version} is available." :
                "No newer Windows release was found.";
            if (!manual && release is { } update && UpdateAvailable is { } notify &&
                store.Settings.MarkUpdateNotified(update.Version))
            {
                Save();
                notify(update.Version);
            }
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
        foreach (var display in displays) display.EditorWindow?.Close();
        await lifetime.CancelAsync();
        await Task.WhenAll(displays.Select(StopConnection));
        await StopObs();
        desktop.StopNotifications();
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
        if (index != 0 || !addingDisplay)
            body.Children.Add(new TextBlock { Text = Pages[index].Name, FontSize = 30, FontWeight = FontWeights.SemiBold,
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
            var card = Card("\uE7F4", "Saved displays");
            card.Children.Add(connectionText);
            Row(card, Button("Clear saved pairings", async () => await Forget(null), !busy));
            return;
        }

        if (addingDisplay)
        {
            DisplaySetup();
            return;
        }

        var header = new WrapPanel { Margin = new Thickness(0, 0, 0, 12) };
        header.Children.Add(Button("Add display", BeginDisplaySetup, !busy));
        body.Children.Add(header);
        foreach (var display in displays)
        {
            var saved = display.Pairing;
            var endpoint = DisplayEndpoint.Parse(saved.Address);
            var name = saved.DisplayName ?? "Paired display";
            var connection = new ToggleButton { Margin = new Thickness(12, 0, 0, 0) };
            connection.SetResourceReference(StyleProperty, "DisplayConnectionSwitch");
            AutomationProperties.SetName(connection, $"Connection for {saved.DisplayName ?? endpoint.Label}");
            display.ConnectionSwitch = connection;
            UpdateConnectionSwitch(display);
            connection.Checked += async (_, _) => await SetConnection(display, true);
            connection.Unchecked += async (_, _) => await SetConnection(display, false);
            var card = Card(endpoint.UsbPort is null ? "\uE968" : "\uE88E",
                name, endpoint.Label, connection);
            card.Children.Add(ConnectionMenu(display, endpoint));
            if (display.Status.Parent is Panel previous) previous.Children.Remove(display.Status);
            AutomationProperties.SetLiveSetting(display.Status, AutomationLiveSetting.Polite);
            card.Children.Add(display.Status);
            Row(card, Button("Device", () => OpenPanel(display), !busy),
                Button("Forget", async () => await Forget(display), !busy));
        }
        var permissions = Card("\uE713", "Windows integration");
        var shortcuts = Toggle("Allow keyboard shortcuts and screen lock", store.Settings.Shortcuts, value =>
        {
            store.Settings.Shortcuts = value;
            desktop.Changed();
            Save();
        });
        permissions.Children.Add(shortcuts);
        permissions.Children.Add(Toggle("Switch to open apps instead of launching another copy", store.Settings.ReuseOpenApps, value =>
        {
            store.Settings.ReuseOpenApps = value;
            Save();
        }));
        var micSource = new ComboBox { MinWidth = 240 };
        micSource.Items.Add(new ComboBoxItem { Content = "System microphone", Tag = "system" });
        micSource.Items.Add(new ComboBoxItem { Content = "Microsoft Teams", Tag = "teams" });
        micSource.SelectedIndex = store.Settings.MicMuteSource == "teams" ? 1 : 0;
        micSource.SelectionChanged += (_, _) =>
        {
            store.Settings.MicMuteSource = micSource.SelectedIndex == 1 ? "teams" : "system";
            desktop.Changed();
            Save();
        };
        Field(permissions, "Microphone mute source", micSource);
        permissions.Children.Add(Paragraph(
            "Microsoft Teams reads and toggles Teams' own Mute button through Windows accessibility. " +
            "Teams must be running. This is experimental and may depend on the Teams version and language."));
        permissions.Children.Add(Toggle("Start EspDesktop when I sign in", LocalStore.StartsAtLogin, enabled =>
        {
            try { LocalStore.StartsAtLogin = enabled; }
            catch (Exception e) when (e is UnauthorizedAccessException or IOException) { Report("Windows couldn’t change the startup setting."); }
        }));
    }

    private Menu ConnectionMenu(DisplayConnection display, DisplayEndpoint endpoint)
    {
        var usesUsb = endpoint.UsbPort is not null;
        var method = usesUsb ? "USB" : "Network";
        var label = new StackPanel { Orientation = Orientation.Horizontal };
        var icon = SettingsCard.Icon(usesUsb ? "\uE88E" : "\uE774", 14);
        icon.Margin = new Thickness(0, 0, 8, 0);
        label.Children.Add(icon);
        label.Children.Add(new TextBlock { Text = method, VerticalAlignment = VerticalAlignment.Center });
        var chevron = SettingsCard.Icon("\uE70D", 10);
        chevron.HorizontalAlignment = HorizontalAlignment.Center;
        var indicator = new Border
        {
            Width = 20, Height = 20, CornerRadius = new CornerRadius(10),
            Margin = new Thickness(8, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, Child = chevron
        };
        indicator.SetResourceReference(Border.BackgroundProperty, "SubtleFillColorSecondaryBrush");
        label.Children.Add(indicator);

        var dropdown = new MenuItem { Header = label, IsEnabled = !busy };
        AutomationProperties.SetName(dropdown, $"{method} connection for {display.Pairing.DisplayName ?? endpoint.Label}");
        void AddChoice(string title, SetupMethod target)
        {
            var item = new MenuItem { Header = title };
            item.Click += (_, _) => BeginConnectionChange(display, target);
            dropdown.Items.Add(item);
        }

        if (usesUsb)
        {
            AddChoice("Use Network", SetupMethod.Nearby);
            AddChoice("Change port", SetupMethod.Usb);
        }
        else
        {
            AddChoice("Use USB", SetupMethod.Usb);
            AddChoice("Update Address", SetupMethod.Address);
        }

        var menu = new Menu
        {
            IsMainMenu = false, Background = Brushes.Transparent, HorizontalAlignment = HorizontalAlignment.Left
        };
        menu.Items.Add(dropdown);
        return menu;
    }

    private void BeginConnectionChange(DisplayConnection display, SetupMethod target)
    {
        if (busy || quitting || !displays.Contains(display)) return;
        ResetSetup();
        addingDisplay = true;
        changingConnection = display;
        if (target == SetupMethod.Usb) setupChoices.SelectedItem = usbChoice;
        if (target == SetupMethod.Address)
        {
            address.Text = display.Pairing.Address;
            setupChoices.SelectedItem = manualChoice;
        }
        RenderSetupStep();
        FocusDisplayInput();
    }

    private void DisplaySetup()
    {
        if (completedDisplay is { } display)
        {
            var complete = SetupPage(3, "You’re connected", "Your display is paired and ready to configure.");
            SetupActions(complete, "Configure screen", () =>
            {
                if (OpenPanel(display)) FinishSetup();
            }, Button("Done", FinishSetup), HorizontalAlignment.Center);
            return;
        }

        if (pairingAddress is { } target)
        {
            var endpoint = DisplayEndpoint.Parse(target);
            if (pairingPrompt is not { } prompt)
            {
                SetupPage(2, "Requesting a pairing code…", "Check your display for the pairing prompt.");
                return;
            }

            var entry = SetupPage(2, "Enter pairing code", prompt.Kind switch
            {
                PairingPromptKind.Reset => "Confirm Reset pairing on the touchscreen, then enter the new code. If the prompt is missing, open Settings → Paired on the display.",
                PairingPromptKind.Code => "Enter the code shown on your display.",
                _ when endpoint.UsbPort is not null => "On the touchscreen, tap Pair on the Setup screen or open Settings → Paired or Unpaired.",
                _ => "Open pairing from the display’s Settings or use the pairing webpage to show the code."
            });
            var device = SetupText(pairingName ?? endpoint.Label, 14);
            device.Margin = new Thickness(0, 0, 0, 10);
            entry.Children.Add(device);
            if (code.Parent is Panel previous) previous.Children.Remove(code);
            code.IsEnabled = !busy;
            entry.Children.Add(code);
            entry.Children.Add(connectionText);
            SetupActions(entry, busy ? "Pairing…" : "Connect", async () => await Pair(), Button("Back", () =>
            {
                pairingAddress = pairingName = null;
                pairingPrompt = null;
                code.Reset(null);
                Status("");
                Report("");
                RenderSetupStep();
                FocusDisplayInput();
            }, !busy), HorizontalAlignment.Center);
            if (endpoint.PairingPage is not null)
                entry.Children.Add(SetupLink("Open pairing webpage", () => OpenPanel(target, pairingPage: true), !busy));
            if (code.CanChangeLength)
                entry.Children.Add(SetupLink("Change code length", code.ChangeLength, !busy));
            return;
        }

        var selection = changingConnection is null
            ? SetupPage(1, "Choose your display", "Choose a display connected by USB or on your local network.")
            : SetupPage(null, "Change connection", "Choose how to reconnect to this display.");
        if (setupChoices.Parent is Panel choicesParent) choicesParent.Children.Remove(setupChoices);
        if (setupDetails.Parent is Panel detailsParent) detailsParent.Children.Remove(setupDetails);
        if (discoveryStatus.Parent is Panel statusParent) statusParent.Children.Remove(discoveryStatus);
        if (findDisplays.Parent is Panel refreshParent) refreshParent.Children.Remove(findDisplays);
        setupChoices.IsEnabled = !busy;
        findDisplays.IsEnabled = !busy && !scanning;
        selection.Children.Add(setupChoices);
        selection.Children.Add(setupDetails);
        selection.Children.Add(discoveryStatus);
        Row(selection, findDisplays);
        selection.Children.Add(connectionText);
        ShowSetupDetails();
        SetupActions(selection, changingConnection is null ? "Continue" : "Connect", async () => await ChooseDisplay(),
            HasPairing ? Button("Cancel", FinishSetup, !busy) : null);
    }

    private StackPanel SetupPage(int? step, string title, string description)
    {
        var page = new StackPanel { MaxWidth = 520, Margin = new Thickness(0, 8, 0, 0) };
        if (step is { } number)
        {
            var progress = SetupText($"Step {number} of 3", 13);
            progress.Margin = new Thickness(0, 0, 0, 6);
            page.Children.Add(progress);
        }
        var heading = SetupText(title, 30);
        heading.FontWeight = FontWeights.SemiBold;
        AutomationProperties.SetHeadingLevel(heading, AutomationHeadingLevel.Level1);
        page.Children.Add(heading);
        var summary = SetupText(description, 15);
        summary.SetResourceReference(TextBlock.ForegroundProperty, "TextFillColorSecondaryBrush");
        summary.Margin = new Thickness(0, 6, 0, 20);
        page.Children.Add(summary);
        body.Children.Add(page);
        return page;
    }

    private static TextBlock SetupLink(string text, Action action, bool enabled)
    {
        var link = new Hyperlink(new Run(text)) { IsEnabled = enabled };
        link.Click += (_, _) => action();
        var line = new TextBlock { TextAlignment = TextAlignment.Center, Margin = new Thickness(0, 4, 0, 0) };
        line.Inlines.Add(link);
        return line;
    }

    private static TextBlock SetupText(string text, double size) => new()
    {
        Text = text, FontSize = size, TextWrapping = TextWrapping.Wrap, TextAlignment = TextAlignment.Center
    };

    private void ShowSetupDetails()
    {
        setupDetails.Children.Clear();
        switch (SelectedSetupMethod)
        {
            case SetupMethod.Address:
                address.IsEnabled = !busy;
                Field(setupDetails, "Display address", address);
                break;
            case SetupMethod.Usb:
                RefreshUsbPorts();
                usbPorts.IsEnabled = !busy;
                Field(setupDetails, "USB port", usbPorts);
                var noPorts = Paragraph("No COM ports found. Check your USB data cable and display firmware.");
                noPorts.Visibility = usbPorts.Items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
                setupDetails.Children.Add(noPorts);
                Row(setupDetails, Button("Refresh ports", () =>
                {
                    RefreshUsbPorts();
                    noPorts.Visibility = usbPorts.Items.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
                }, !busy));
                break;
        }
    }

    private void SetupActions(Panel page, string label, Action action, Button? secondary,
        HorizontalAlignment alignment = HorizontalAlignment.Right)
    {
        setupAction = Button(label, action);
        if (TryFindResource("AccentButtonStyle") is Style accent) setupAction.Style = accent;
        UpdateSetupAction();
        var actions = new WrapPanel { HorizontalAlignment = alignment, Margin = new Thickness(0, 16, 0, 0) };
        if (alignment == HorizontalAlignment.Center) setupAction.Margin = new Thickness(0, 0, 0, 6);
        if (secondary != null) actions.Children.Add(secondary);
        actions.Children.Add(setupAction);
        page.Children.Add(actions);
    }

    private void UpdateSetupAction()
    {
        if (setupAction == null) return;
        setupAction.IsEnabled = !busy && (completedDisplay != null || (pairingAddress != null
            ? code.Code is not null : SelectedSetupMethod switch
            {
                SetupMethod.Address => address.Text.Trim().Length > 0,
                SetupMethod.Usb => usbPorts.SelectedItem is string,
                _ => setupChoices.SelectedItem is ListBoxItem { IsEnabled: true, Tag: DiscoveredDisplay }
            }));
    }

    private void BeginDisplaySetup()
    {
        if (busy || quitting) return;
        ResetSetup();
        addingDisplay = true;
        RenderSetupStep();
    }

    private void RenderSetupStep()
    {
        scroll.ScrollToTop();
        Render();
    }

    private void FinishSetup()
    {
        ResetSetup();
        addingDisplay = false;
        RenderSetupStep();
    }

    private void RefreshUsbPorts()
    {
        var selected = usbPorts.SelectedItem as string;
        var reserved = displays.Where(d => d != changingConnection)
            .Select(d => DisplayEndpoint.Parse(d.Pairing.Address).UsbPort).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var found = SerialPort.GetPortNames().Where(p => DisplayEndpoint.IsComPort(p) && !reserved.Contains(p))
            .Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase).ToArray();
        usbPorts.ItemsSource = found;
        if (selected is not null && found.Contains(selected)) usbPorts.SelectedItem = selected;
        else if (found.Length == 1) usbPorts.SelectedIndex = 0;
    }

    private void FocusDisplayInput()
    {
        if (SelectedSetupMethod == SetupMethod.Address) address.Focus();
        else if (SelectedSetupMethod == SetupMethod.Usb) usbPorts.Focus();
        else if (setupChoices.SelectedItem is ListBoxItem item) item.Focus();
        else setupChoices.Focus();
    }

    private async Task ChooseDisplay()
    {
        if (busy || quitting || !addingDisplay || pairingAddress is not null) return;
        var selected = (setupChoices.SelectedItem as ListBoxItem)?.Tag as DiscoveredDisplay;
        var method = SelectedSetupMethod;
        var target = method switch
        {
            SetupMethod.Address => address.Text.Trim(),
            SetupMethod.Usb => usbPorts.SelectedItem is string port ? "usb:" + port : null,
            _ => setupChoices.SelectedItem is ListBoxItem { IsEnabled: true } ? selected?.Address : null
        };
        if (string.IsNullOrEmpty(target)) return;
        DisplayEndpoint endpoint;
        try
        {
            endpoint = DisplayEndpoint.Parse(target);
            if (method != SetupMethod.Usb && endpoint.UsbPort is not null)
            {
                Status("Choose Connect by USB to select a COM port.");
                return;
            }
        }
        catch (ArgumentException e) { Status(e.Message); return; }

        if (changingConnection is { } display)
        {
            busy = true;
            Render();
            try
            {
                await StopConnection(display);
                if (quitting) return;
                ResetSetup();
                addingDisplay = false;
                StartConnection(display, target);
            }
            finally
            {
                busy = false;
                Render();
            }
            return;
        }

        pairingAddress = target;
        pairingName = selected?.Name;
        if (endpoint.Settings is { } settings)
        {
            busy = true;
            RenderSetupStep();
            try { pairingPrompt = await requestPairingPrompt(settings, lifetime.Token); }
            catch (OperationCanceledException) when (quitting) { return; }
            finally { busy = false; }
            if (quitting) return;
        }
        else pairingPrompt = PairingPrompt.Unavailable;
        code.Reset(pairingPrompt?.CodeLength);
        Status("");
        Render();
        if (navigation.SelectedIndex == 0)
        {
            scroll.ScrollToTop();
            code.FocusCode();
        }
    }

    private bool HasDisplay(string fingerprint) => displays.Any(display =>
        display.Pairing.Fingerprint.Equals(fingerprint, StringComparison.OrdinalIgnoreCase));

    private void ResetSetup()
    {
        pairingAddress = pairingName = null;
        pairingPrompt = null;
        setupGeneration++;
        completedDisplay = changingConnection = null;
        usbPorts.ItemsSource = null;
        address.Clear();
        code.Reset(null);
        discovered = [];
        discoveryChecked = false;
        updatingSetupChoices = true;
        setupChoices.SelectedItem = null;
        updatingSetupChoices = false;
        PopulateSetupChoices([]);
        discoveryStatus.Text = "Looking for nearby displays…";
        discoveryStatus.Visibility = Visibility.Visible;
        Status("");
        Report("");
    }

    private void ObsPage()
    {
        var card = Card("\uE714", "OBS WebSocket", "In OBS Studio on this PC, open Tools → WebSocket Server Settings. Enable the server, then enter its port and password here.");
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
        var card = Card("\uE769", "Break scene", "Set a scene and an optional microphone to mute while you take a break.");
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
        var card = Card("\uE8A9", "Apps available to the display", "EspDesktop finds apps listed in your Start menu.");
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
        var card = Card("\uE8B7", "Approved folders", "Paired displays see folder names. Paths stay on this PC.");
        Row(card, Button("Add folder", () => PickFolder()));
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
            remove.Content = SettingsCard.Icon("\uE74D", 16);
            AutomationProperties.SetName(remove, $"Remove {folder.Label}");
            remove.ToolTip = $"Remove {folder.Label}";
            remove.Margin = new Thickness(12, 0, 0, 0);
            remove.VerticalAlignment = VerticalAlignment.Center;
            DockPanel.SetDock(remove, Dock.Right);
            entry.Children.Add(remove);

            var chooseAgain = Button("Choose again", () => PickFolder(folder));
            chooseAgain.Margin = new Thickness(0, 0, 8, 0);
            chooseAgain.VerticalAlignment = VerticalAlignment.Center;
            DockPanel.SetDock(chooseAgain, Dock.Right);
            entry.Children.Add(chooseAgain);

            var details = new StackPanel();
            details.Children.Add(new TextBlock { Text = folder.Label, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            details.Children.Add(Paragraph(Directory.Exists(folder.Path) ? folder.Path : $"{folder.Path} · Folder not found"));
            entry.Children.Add(details);
        }
    }

    private void PickFolder(ApprovedFolder? folder = null)
    {
        var picker = new OpenFolderDialog
        {
            Title = folder == null ? "Choose a folder for your display" : $"Choose a new location for {folder.Label}"
        };
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
        var card = Card("\uE777", $"EspDesktop {Updates.Current.ToString(3)}", updateStatus);
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
        body.Children.Add(SettingsCard.Link("\uE7F4", "Set up your display",
            "Find your display or enter its local address, then open its pairing page. Add your controls in the display editor after pairing.",
            () => navigation.SelectedIndex = 0));
        body.Children.Add(SettingsCard.Link("\uE8A7", "Open display editor", null, OpenPanel));
        body.Children.Add(SettingsCard.Link("\uE897", "EspDesktop documentation", null,
            () => Link(new("https://jtenniswood.github.io/espdesktop/")), external: true));
        body.Children.Add(SettingsCard.Link("\uE90A", "Report an issue", null,
            () => Link(new("https://github.com/jtenniswood/espdesktop/issues")), external: true));
        body.Children.Add(SettingsCard.Link("\uE734", "Support EspDesktop", null,
            () => Link(new("https://buymeacoffee.com/jtenniswood")), external: true));
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

    private StackPanel Card(string glyph, string title, string? description = null, FrameworkElement? action = null)
    {
        var fields = new StackPanel();
        body.Children.Add(SettingsCard.Create(glyph, title, description, fields, action));
        return fields;
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
        else if (message == 0x0218 && wParam == 4) desktop.Suspend();
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
