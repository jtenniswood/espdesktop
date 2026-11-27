using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using EspDesktop.Core;

namespace EspDesktop;

/// <summary>
/// Ends the active Microsoft Teams call by invoking its Leave/Hang up button
/// through Windows UI Automation. Teams is not a supported public API; this is
/// best-effort and returns false when no call control can be found.
/// </summary>
internal static class TeamsCall
{
    private static readonly string[] ProcessNames = ["ms-teams", "Teams"];

    public static bool End() => Sta.Run(EndCore).GetAwaiter().GetResult();

    private static bool EndCore()
    {
        var button = FindLeaveButton();
        if (button is null) return false;
        try
        {
            if (button.TryGetCurrentPattern(InvokePattern.Pattern, out var invoke))
            {
                ((InvokePattern)invoke).Invoke();
                return true;
            }
            if (button.TryGetCurrentPattern(TogglePattern.Pattern, out var toggle))
            {
                ((TogglePattern)toggle).Toggle();
                return true;
            }
        }
        catch (Exception e) when (e is ElementNotAvailableException or InvalidOperationException or COMException)
        {
        }
        return false;
    }

    private static AutomationElement? FindLeaveButton()
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
                    var score = LeaveScore(name);
                    if (score <= 0) continue;
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

    internal static int LeaveScore(string name)
    {
        if (name.Equals("Leave", StringComparison.OrdinalIgnoreCase) ||
            name.Equals("Hang up", StringComparison.OrdinalIgnoreCase) ||
            name.Equals("End call", StringComparison.OrdinalIgnoreCase)) return 4;
        if (name.Contains("hang up", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("end call", StringComparison.OrdinalIgnoreCase)) return 3;
        if (name.Contains("leave", StringComparison.OrdinalIgnoreCase) &&
            !name.Contains("leave team", StringComparison.OrdinalIgnoreCase)) return 1;
        return 0;
    }
}
