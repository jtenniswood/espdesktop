using System.Windows;
using System.Windows.Threading;
using Forms = System.Windows.Forms;

namespace EspDesktop;

internal sealed class App : Application
{
    internal static readonly Uri IconUri = new("pack://application:,,,/Packaging/EspDesktop.ico");

    [STAThread]
    public static int Main(string[] args)
    {
        var smoke = args.Contains("--smoke-test");
        // Publish the wake event before taking the mutex so another launch can
        // request Settings even while this instance is still starting up.
        using var open = new EventWaitHandle(false, EventResetMode.AutoReset, smoke ? null : @"Local\EspDesktop.Windows.Show");
        using var instance = new Mutex(initiallyOwned: false, smoke ? null : @"Local\EspDesktop.Windows");
        var acquired = false;
        try { acquired = instance.WaitOne(0); }
        catch (AbandonedMutexException) { acquired = true; }
        if (!acquired)
        {
            if (!args.Contains("--background")) open.Set();
            return 0;
        }

        var app = new App { ShutdownMode = ShutdownMode.OnExplicitShutdown };
#pragma warning disable WPF0001 // WPF's system Fluent theme API remains marked experimental.
        app.ThemeMode = smoke && args.Contains("--dark-preview") ? ThemeMode.Dark : ThemeMode.System;
#pragma warning restore WPF0001
        var window = new SettingsWindow(smoke);
        app.MainWindow = window;
        var registration = ThreadPool.RegisterWaitForSingleObject(open,
            (_, _) => app.Dispatcher.InvokeAsync(window.ShowSettings), null, Timeout.Infinite, false);
        Forms.NotifyIcon? tray = null;
        System.Drawing.Icon? trayIcon = null;
        try
        {
            using var stream = GetResourceStream(IconUri).Stream;
            trayIcon = new System.Drawing.Icon(stream);
            if (!smoke)
            {
                var menu = new Forms.ContextMenuStrip();
                menu.Items.Add("Open EspDesktop", null, (_, _) => window.ShowSettings());
                menu.Items.Add("Open display settings", null, (_, _) => window.OpenPanel());
                menu.Items.Add("Connect / disconnect", null, async (_, _) => await window.ToggleConnection());
                menu.Items.Add(new Forms.ToolStripSeparator());
                menu.Items.Add("Quit EspDesktop", null, (_, _) => window.Quit());
                tray = new Forms.NotifyIcon { Icon = trayIcon, Text = "EspDesktop", ContextMenuStrip = menu, Visible = true };
                tray.DoubleClick += (_, _) => window.ShowSettings();
                window.ConnectionStatusChanged += status => tray.Text = Core.Protocol.Bound("EspDesktop · " + status, 100);
            }
            var background = !smoke && args.Contains("--background") && window.HasPairing;
            app.Dispatcher.BeginInvoke(async () =>
            {
                if (!background) window.ShowSettings();
                await window.Initialize();
                if (smoke)
                {
                    await app.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                    window.CapturePreview();
                    window.Quit();
                }
            });
            return app.Run();
        }
        finally
        {
            registration.Unregister(null);
            if (tray is not null)
            {
                tray.Visible = false;
                tray.ContextMenuStrip?.Dispose();
                tray.Dispose();
            }
            trayIcon?.Dispose();
            instance.ReleaseMutex();
        }
    }
}
