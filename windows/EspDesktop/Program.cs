using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text.Json;

namespace EspDesktop.Windows;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        using var singleInstance = new Mutex(true, @"Local\EspDesktop.IRacing", out var firstInstance);
        if (!firstInstance)
        {
            MessageBox.Show("EspDesktop is already running. Open it from the notification area.", "EspDesktop");
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new CompanionWindow());
    }
}

internal sealed class CompanionWindow : Form
{
    private readonly TextBox address = new() { PlaceholderText = "192.168.1.20 or espdesktop.local", Dock = DockStyle.Fill };
    private readonly TextBox code = new() { UseSystemPasswordChar = true, MaxLength = 16, Dock = DockStyle.Fill };
    private readonly Button pair = new() { Text = "Pair display", AutoSize = true };
    private readonly Button forget = new() { Text = "Forget pairing", AutoSize = true, Enabled = false };
    private readonly Label status = new() { AutoSize = true, MaximumSize = new Size(408, 0) };
    private readonly NotifyIcon tray;
    private CancellationTokenSource? connection;
    private Task? connectionTask;
    private bool exiting;

    public CompanionWindow()
    {
        Text = "EspDesktop for iRacing";
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(440, 250);
        MinimumSize = new Size(440, 250);

        var fields = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, Padding = new Padding(16), ColumnCount = 1,
        };
        var buttons = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill };
        buttons.Controls.AddRange([pair, forget]);
        fields.Controls.Add(new Label { Text = "Display address", AutoSize = true });
        fields.Controls.Add(address);
        fields.Controls.Add(new Label { Text = "Temporary pairing code", AutoSize = true });
        fields.Controls.Add(code);
        fields.Controls.Add(buttons);
        fields.Controls.Add(status);
        Controls.Add(fields);
        AcceptButton = pair;
        status.Text = "Open Companion settings on the display to get a pairing code.";

        var menu = new ContextMenuStrip();
        menu.Items.Add("Open EspDesktop", null, (_, _) => ShowWindow());
        menu.Items.Add("Exit", null, (_, _) => { exiting = true; Close(); });
        tray = new NotifyIcon
        {
            Icon = SystemIcons.Application, Text = "EspDesktop for iRacing", ContextMenuStrip = menu, Visible = true,
        };
        tray.DoubleClick += (_, _) => ShowWindow();

        Shown += (_, _) =>
        {
            try
            {
                if (PairingStore.Load() is not { } pairing)
                    return;
                address.Text = pairing.Endpoint.IsDefaultPort || pairing.Endpoint.Port == 8443
                    ? pairing.Endpoint.Host : pairing.Endpoint.Authority;
                StartConnection(pairing);
            }
            catch (Exception error) when (IsExpected(error))
            {
                forget.Enabled = true;
                ShowStatus("The saved pairing could not be read. Forget it and pair the display again.");
            }
        };
        pair.Click += async (_, _) => await PairDisplay();
        forget.Click += async (_, _) => await ForgetPairing();
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!exiting && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }
        else
        {
            connection?.Cancel();
            tray.Visible = false;
            tray.ContextMenuStrip?.Dispose();
            tray.Dispose();
        }
        base.OnFormClosing(e);
    }

    private void ShowWindow()
    {
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void ShowStatus(string message)
    {
        if (IsDisposed || !IsHandleCreated)
            return;
        if (InvokeRequired)
        {
            BeginInvoke(() => ShowStatus(message));
            return;
        }
        status.Text = message;
    }

    private CompanionClient CreateClient() => new(ShowStatus, PairingStore.Save);

    private async Task PairDisplay()
    {
        pair.Enabled = false;
        forget.Enabled = false;
        using var timeout = new CancellationTokenSource();
        try
        {
            await StopConnection();
            var pairing = await CreateClient().PairAsync(
                CompanionClient.GetEndpoint(address.Text), code.Text.Trim(), timeout.Token);
            code.Clear();
            StartConnection(pairing);
        }
        catch (Exception error) when (IsExpected(error))
        {
            ShowStatus(MessageFor(error));
            forget.Enabled = true;
        }
        finally
        {
            pair.Enabled = true;
        }
    }

    private async Task ForgetPairing()
    {
        pair.Enabled = false;
        forget.Enabled = false;
        try
        {
            await StopConnection();
            PairingStore.Forget();
            ShowStatus("Pairing removed from this PC. Reset pairing on the display to get a new code.");
        }
        catch (Exception error) when (IsExpected(error))
        {
            ShowStatus(MessageFor(error));
            forget.Enabled = true;
        }
        finally
        {
            pair.Enabled = true;
        }
    }

    private void StartConnection(Pairing pairing)
    {
        var stop = new CancellationTokenSource();
        connection = stop;
        forget.Enabled = true;
        ShowStatus("Connecting to display…");
        connectionTask = Task.Run(async () =>
        {
            try { await CreateClient().RunAsync(pairing, stop.Token); }
            catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            catch (Exception error) when (IsExpected(error)) { ShowStatus(MessageFor(error)); }
        });
    }

    private async Task StopConnection()
    {
        if (connection is null || connectionTask is null)
            return;
        await connection.CancelAsync();
        await connectionTask;
        connection.Dispose();
        connection = null;
        connectionTask = null;
    }

    private static bool IsExpected(Exception error) => error is PairingException or WebSocketException
        or OperationCanceledException or FormatException or IOException or CryptographicException
        or UnauthorizedAccessException or JsonException or System.Net.Sockets.SocketException or OverflowException;

    private static string MessageFor(Exception error) => error switch
    {
        PairingException => error.Message,
        OperationCanceledException or WebSocketException or System.Net.Sockets.SocketException =>
            "Could not connect. Check the display address, Wi-Fi and firmware.",
        _ => "Could not complete the request. Check the saved pairing and display settings.",
    };
}
