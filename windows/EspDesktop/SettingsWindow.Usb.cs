using System.IO;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Windows;
using System.Windows.Controls;
using EspDesktop.Core;

namespace EspDesktop;

internal sealed partial class SettingsWindow
{
    private static string DisplayAddress(string address) => UsbPort.PortName(address) is { } port
        ? $"USB · {port}" : DisplayEndpoint.Parse(address).Socket.Host;

    private void ChooseUsbForPairing()
    {
        if (ChooseUsbPort() is not { } port) return;
        pairingAddress = port.Endpoint;
        pairingName = null;
        Status("");
        Render();
        code.Focus();
    }

    private UsbPort? ChooseUsbPort(string? preferred = null)
    {
        UsbPort? selected = null;
        var window = UsbDialog("Choose the display’s USB port", out var content);
        content.Children.Add(Paragraph("Connect your display with a USB data cable, then select its COM port."));
        var list = new ComboBox { DisplayMemberPath = nameof(UsbPort.Name) };
        Field(content, "USB port", list);
        var status = Paragraph("");
        content.Children.Add(status);
        var use = Button("Use USB port", () =>
        {
            selected = list.SelectedItem as UsbPort;
            if (selected != null) window.DialogResult = true;
        });
        use.IsDefault = true;
        var cancel = Button("Cancel", window.Close);
        cancel.IsCancel = true;
        Row(content, Button("Refresh", Refresh), cancel, use);
        list.SelectionChanged += (_, _) => use.IsEnabled = list.SelectedItem is UsbPort;
        Refresh();
        window.ShowDialog();
        return selected;

        void Refresh()
        {
            var previous = (list.SelectedItem as UsbPort)?.Name ?? preferred;
            var ports = WindowsUsb.Find();
            list.ItemsSource = ports;
            list.SelectedItem = ports.FirstOrDefault(port => port.Name == previous) ??
                (ports.Length == 1 ? ports[0] : null);
            status.Text = ports.Length == 0 ? "No compatible USB serial port found. Check the cable or the display’s USB driver." : "";
            use.IsEnabled = list.SelectedItem is UsbPort;
        }
    }

    private Window UsbDialog(string title, out StackPanel content)
    {
        content = new StackPanel { Margin = new Thickness(20) };
        return new Window
        {
            Title = title, Owner = this, Content = content, Width = 460,
            SizeToContent = SizeToContent.Height, WindowStartupLocation = WindowStartupLocation.CenterOwner,
            ResizeMode = ResizeMode.NoResize, ShowInTaskbar = false
        };
    }

    private string? ChooseNetworkAddress(string? initial)
    {
        string? selected = null;
        var window = UsbDialog("Connect over the network", out var content);
        content.Children.Add(Paragraph("Enter the local IP address or .local name shown in the display’s network settings."));
        var input = new TextBox { Text = initial ?? "" };
        Field(content, "Display address", input);
        var error = Paragraph("");
        content.Children.Add(error);
        var connect = Button("Use network", () =>
        {
            var candidate = input.Text.Trim();
            try { _ = DisplayEndpoint.Parse(candidate); }
            catch (ArgumentException exception) { error.Text = exception.Message; return; }
            selected = candidate;
            window.DialogResult = true;
        });
        connect.IsDefault = true;
        var cancel = Button("Cancel", window.Close);
        cancel.IsCancel = true;
        Row(content, cancel, connect);
        window.Loaded += (_, _) => { input.SelectAll(); input.Focus(); };
        window.ShowDialog();
        return selected;
    }

    private async Task OpenEditor(DisplayConnection display)
    {
        if (UsbPort.PortName(display.Pairing.Address) == null)
        {
            OpenPanel(display.Pairing.Address);
            return;
        }
        if (display.EditorOpening || quitting || display.Forgetting || display.Switching) return;
        if (display.EditorHost == null && display.UsbClient is not { Connected: true })
        {
            ShowDisplaySettings();
            Report("Connect the display over USB first. The USB editor requires compatible display firmware.");
            return;
        }

        display.EditorOpening = true;
        try
        {
            display.EditorHost ??= await UsbEditorHost.Start(() => display.UsbClient, lifetime.Token);
            if (quitting || display.Forgetting || display.Switching)
            {
                await CloseEditor(display);
                return;
            }
            if (WindowsDesktop.OpenShell(display.EditorHost.EditorUrl.AbsoluteUri)) { Report(""); return; }
            Report("Windows couldn’t open the USB editor in your browser.");
        }
        catch (Exception exception) when (UsbFailure(exception) || WindowsDesktop.IsShellFailure(exception))
        {
            if (!quitting) Report("Windows couldn’t open the USB editor. Check the cable and try again.");
        }
        finally { display.EditorOpening = false; }
    }

    private async Task OpenNetworkEditor(DisplayConnection display)
    {
        if (display.UsbClient is not { Connected: true } client || quitting || display.Switching) return;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(5));
            var address = await client.NetworkAddress(deadline.Token);
            if (address == null)
            {
                var nearby = await discover(deadline.Token);
                address = nearby.FirstOrDefault(entry =>
                    entry.Fingerprint.Equals(display.Pairing.Fingerprint, StringComparison.OrdinalIgnoreCase))?.Address;
            }
            if (quitting || display.Forgetting || display.Switching || display.UsbClient != client) return;
            if (address != null) OpenPanel(address);
            else Report("The display has no reachable network address. Open the USB editor or turn on display Wi-Fi.");
        }
        catch (Exception exception) when (UsbFailure(exception) || exception is NetworkInformationException)
        { if (!quitting) Report("Couldn’t open the network editor. Use the USB editor to continue."); }
    }

    private static async Task CloseEditor(DisplayConnection display)
    {
        if (display.EditorHost is not { } host) return;
        display.EditorHost = null;
        await host.DisposeAsync();
    }

    private async Task UseUsb(DisplayConnection display)
    {
        if (quitting || display.Forgetting || display.Switching) return;
        if (ChooseUsbPort(UsbPort.PortName(display.Pairing.Address)) is not { } port) return;
        if (display.Pairing.Address == port.Endpoint && display.Cancellation != null) return;
        await SwitchTransport(display, port.Endpoint);
    }

    private async Task UseNetwork(DisplayConnection display)
    {
        if (quitting || display.Forgetting || display.Switching) return;
        display.Switching = true;
        Report("");
        Render();
        try
        {
            var address = await FindUsbNetworkAddress(display);
            if (quitting) return;
            address ??= ChooseNetworkAddress(display.Pairing.LastNetworkAddress);
            if (address != null) await ChangeTransport(display, address);
        }
        catch (Exception exception) when (UsbFailure(exception))
        {
            if (!quitting) Report("Couldn’t switch connections. Check the USB cable or enter the display’s network address.");
        }
        finally
        {
            display.Switching = false;
            if (!quitting) Render();
        }
    }

    private async Task<string?> FindUsbNetworkAddress(DisplayConnection display)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
        deadline.CancelAfter(TimeSpan.FromSeconds(12));
        var token = deadline.Token;
        try
        {
            if (display.UsbClient is { Connected: true } client)
            {
                if (await client.Wifi(null, token) == false && await client.Wifi(true, token) != true) return null;
                for (var attempt = 0; attempt < 6; attempt++)
                {
                    if (await client.NetworkAddress(token) is { } address) return address;
                    await Task.Delay(500, token);
                }
            }
            return (await discover(token)).FirstOrDefault(entry =>
                entry.Fingerprint.Equals(display.Pairing.Fingerprint, StringComparison.OrdinalIgnoreCase))?.Address;
        }
        catch (Exception exception) when (UsbFailure(exception) || exception is NetworkInformationException) { return null; }
    }

    private async Task SwitchTransport(DisplayConnection display, string address)
    {
        display.Switching = true;
        Report("");
        Render();
        try { await ChangeTransport(display, address); }
        finally
        {
            display.Switching = false;
            if (!quitting) Render();
        }
    }

    private async Task ChangeTransport(DisplayConnection display, string address)
    {
        await StopConnection(display);
        if (quitting || display.Forgetting) return;
        StartConnection(display, address);
    }

    private async Task ToggleDisplayWifi(DisplayConnection display)
    {
        if (display.WifiBusy || display.Switching || display.UsbClient is not { Connected: true } client) return;
        display.WifiBusy = true;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(12));
            var enabled = await client.Wifi(null, deadline.Token);
            var next = enabled is { } active ? await client.Wifi(!active, deadline.Token) : null;
            if (!quitting) Report(next switch
            {
                true => "Display Wi-Fi is on.",
                false => "Display Wi-Fi is off. You can still edit and control the display over USB.",
                _ => "Couldn’t change the display’s Wi-Fi setting. Check its firmware and try again."
            });
        }
        catch (Exception exception) when (UsbFailure(exception))
        { if (!quitting) Report("Couldn’t change the display’s Wi-Fi setting. Check the USB cable and try again."); }
        finally { display.WifiBusy = false; }
    }

    private static bool UsbFailure(Exception exception) => exception is IOException or UnauthorizedAccessException or
        HttpRequestException or WebSocketException or OperationCanceledException or InvalidOperationException;
}
