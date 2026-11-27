using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using EspDesktop.Core;

namespace EspDesktop;

/// <summary>
/// Reads and toggles Microsoft Teams' own microphone mute button through Windows
/// UI Automation. Teams is not a supported public API; this is best-effort and
/// returns unavailable when the button cannot be found.
/// </summary>
internal static class TeamsMute
{
    private static readonly string[] ProcessNames = ["ms-teams", "Teams"];
    private static readonly object Gate = new();
    private static int? cached;
    private static long cachedAt;
    private const long CacheMilliseconds = 900;

    /// <summary>100 means muted, 0 means unmuted, null means Teams is unavailable.</summary>
    public static int? Read()
    {
        lock (Gate)
        {
            if (Environment.TickCount64 - cachedAt < CacheMilliseconds) return cached;
        }
        var value = Sta.Run(ReadCore).GetAwaiter().GetResult();
        lock (Gate)
        {
            cached = value;
            cachedAt = Environment.TickCount64;
        }
        return value;
    }

    public static bool Set(int value)
    {
        if (value is not (0 or 100)) return false;
        if (Read() == value) return true;
        var changed = Sta.Run(() => ToggleCore(value)).GetAwaiter().GetResult();
        lock (Gate)
        {
            cached = null;
            cachedAt = 0;
        }
        return changed;
    }

    private static int? ReadCore() => State(FindButton());

    private static bool ToggleCore(int desired)
    {
        var button = FindButton();
        if (button is null) return false;
        if (State(button) == desired) return true;
        try
        {
            if (button.TryGetCurrentPattern(TogglePattern.Pattern, out var toggle))
                ((TogglePattern)toggle).Toggle();
            else if (button.TryGetCurrentPattern(InvokePattern.Pattern, out var invoke))
                ((InvokePattern)invoke).Invoke();
            else return false;
        }
        catch (Exception e) when (e is ElementNotAvailableException or InvalidOperationException or COMException)
        {
            return false;
        }
        // Teams updates the button name shortly after the click.
        for (var attempt = 0; attempt < 8; attempt++)
        {
            Thread.Sleep(100);
            if (State(FindButton()) == desired) return true;
        }
        return false;
    }

    private static int? State(AutomationElement? button)
    {
        if (button is null) return null;
        try
        {
            var name = button.Current.Name ?? "";
            if (name.Contains("unmute", StringComparison.OrdinalIgnoreCase)) return 100;
            if (name.Contains("mute", StringComparison.OrdinalIgnoreCase) &&
                !name.Contains("notification", StringComparison.OrdinalIgnoreCase)) return 0;
        }
        catch (ElementNotAvailableException) { }
        return null;
    }

    private static AutomationElement? FindButton()
    {
        foreach (var processName in ProcessNames)
        {
            Process[] processes;
            try { processes = Process.GetProcessesByName(processName); }
            catch (InvalidOperationException) { continue; }
            foreach (var process in processes)
            {
                using (process)
                {
                    try
                    {
                        var windows = AutomationElement.RootElement.FindAll(
                            TreeScope.Children,
                            new PropertyCondition(AutomationElement.ProcessIdProperty, process.Id));
                        foreach (AutomationElement window in windows)
                        {
                            var best = FindInWindow(window);
                            if (best is not null) return best;
                        }
                    }
                    catch (Exception e) when (e is ElementNotAvailableException or InvalidOperationException or COMException) { }
                }
            }
        }
        return null;
    }

    private static AutomationElement? FindInWindow(AutomationElement window)
    {
        AutomationElement? best = null;
        var bestScore = int.MinValue;
        try
        {
            var buttons = window.FindAll(
                TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Button));
            foreach (AutomationElement button in buttons)
            {
                try
                {
                    if (!button.Current.IsEnabled) continue;
                    var name = (button.Current.Name ?? "").Trim();
                    if (!name.Contains("mute", StringComparison.OrdinalIgnoreCase)) continue;
                    if (name.Contains("notification", StringComparison.OrdinalIgnoreCase) ||
                        name.Contains("mute all", StringComparison.OrdinalIgnoreCase)) continue;
                    var score = 0;
                    if (name.Equals("Mute", StringComparison.OrdinalIgnoreCase) ||
                        name.Equals("Unmute", StringComparison.OrdinalIgnoreCase)) score += 4;
                    if (name.Contains("mic", StringComparison.OrdinalIgnoreCase)) score += 2;
                    if (!button.Current.IsOffscreen) score += 3;
                    if (score > bestScore)
                    {
                        best = button;
                        bestScore = score;
                    }
                }
                catch (Exception e) when (e is ElementNotAvailableException or InvalidOperationException or COMException) { }
            }
        }
        catch (Exception e) when (e is ElementNotAvailableException or InvalidOperationException or COMException) { }
        return best;
    }
}
