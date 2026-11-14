#if WINDOWS
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;
using EspDesktop;
using ComObject = EspDesktop.Com;

internal sealed class WindowsAppActions : IDisposable
{
    private const string TargetMode = "--desktop-shortcut-target";
    public const string Shortcut = "shortcut.command+shift+f8";
    private readonly string root;
    private readonly string link;
    public StartApp Entry { get; }

    private WindowsAppActions(string root, string link, StartApp entry) =>
        (this.root, this.link, Entry) = (root, link, entry);

    public static async Task<WindowsAppActions> Create(WindowsDesktop desktop)
    {
        var executable = Environment.ProcessPath;
        if (!string.Equals(Path.GetFileName(executable), "EspDesktop.Tests.exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Start the Windows desktop checks through their app executable.");
        var root = Directory.CreateTempSubdirectory("EspDesktop shortcut test ").FullName;
        var name = "EspDesktop test " + Guid.NewGuid().ToString("N")[..8];
        var link = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), name + ".lnk");
        try
        {
            await Sta.Run(() =>
            {
                object? shell = null, shortcut = null;
                try
                {
                    shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell")!);
                    shortcut = ((dynamic)shell!).CreateShortcut(link);
                    dynamic entry = shortcut!;
                    entry.TargetPath = executable;
                    entry.Arguments = $"{TargetMode} \"{root}\"";
                    entry.Save();
                    return true;
                }
                finally { ComObject.Release(shortcut); ComObject.Release(shell); }
            });

            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            while (!deadline.IsCancellationRequested)
            {
                await desktop.Refresh();
                var entry = desktop.Apps.FirstOrDefault(app => app.Name == name);
                if (entry is not null) return new(root, link, entry);
                await Task.Delay(250);
            }
            throw new InvalidOperationException("Windows did not list the test shortcut in the Start menu app catalogue.");
        }
        catch
        {
            File.Delete(link);
            Directory.Delete(root, recursive: true);
            throw;
        }
    }

    public async Task WaitForShortcut(CancellationToken token) =>
        await WaitForMarker("received", "The Windows test app did not receive Ctrl+Shift+F8.", token);

    public async Task CheckForeground(CancellationToken token)
    {
        var ready = await WaitForMarker("ready", "The Windows test app did not open a window.", token);
        _ = InputSession.GetWindowThreadProcessId(InputSession.GetForegroundWindow(), out var foreground);
        if (File.ReadAllText(ready) != FormattableString.Invariant($"{foreground}"))
            throw new InvalidOperationException("The Windows test app opened without becoming the foreground window.");
    }

    private async Task<string> WaitForMarker(string name, string failure, CancellationToken token)
    {
        var marker = Path.Combine(root, name);
        for (var attempt = 0; attempt < 40; attempt++)
        {
            if (File.Exists(marker)) return marker;
            await Task.Delay(100, token);
        }
        throw new InvalidOperationException(failure);
    }

    public void Dispose()
    {
        File.Delete(link);
        Directory.Delete(root, recursive: true);
    }

    public static async Task<bool> TryRunTarget(string[] args)
    {
        if (args is not [TargetMode, var directory]) return false;
        await Sta.Run(() =>
        {
            if (!Directory.Exists(directory)) return false;
            var app = new Application();
            var input = new TextBox { Text = "EspDesktop shortcut test" };
            var window = new Window { Title = input.Text, Width = 360, Height = 140, Content = input };
            window.ContentRendered += (_, _) =>
            {
                _ = input.Focus();
                var pending = Path.Combine(directory, "starting");
                File.WriteAllText(pending, FormattableString.Invariant($"{Environment.ProcessId}"));
                File.Move(pending, Path.Combine(directory, "ready"));
            };
            window.PreviewKeyDown += (_, key) =>
            {
                if (key.Key == Key.F8 && Keyboard.Modifiers == (ModifierKeys.Control | ModifierKeys.Shift))
                    File.WriteAllText(Path.Combine(directory, "received"), "Ctrl+Shift+F8");
            };
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
            var started = System.Diagnostics.Stopwatch.StartNew();
            timer.Tick += (_, _) =>
            {
                if (Directory.Exists(directory) && started.Elapsed < TimeSpan.FromSeconds(45)) return;
                timer.Stop();
                window.Close();
            };
            timer.Start();
            app.Run(window);
            return true;
        });
        return true;
    }
}
#endif
