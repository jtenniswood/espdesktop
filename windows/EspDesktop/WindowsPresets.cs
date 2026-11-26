using System.IO;
using System.Text.Json;
using EspDesktop.Core;

namespace EspDesktop;

internal static class WindowsPresets
{
    internal sealed record Preset(string Id, string Label, string Shortcut, string Icon, string? Group)
    {
        public string DisplayShortcut
        {
            get
            {
                var parts = Shortcut.Split('+');
                var key = parts[^1];
                return Shortcut.Contains('~') || key == "insert" || key.StartsWith("keypad", StringComparison.Ordinal) ||
                    !parts.SkipLast(1).Any(modifier => modifier is "control" or "option")
                        ? "scoped." + Shortcut : Shortcut;
            }
        }
    }
    internal sealed record Template(string[] Executables, string[]? Targets, Preset[] Shortcuts, string[]? DefaultShortcutIds);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly Dictionary<string, Template> ByExecutable = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, Template> ByTarget = new(StringComparer.OrdinalIgnoreCase);

    static WindowsPresets()
    {
        const string prefix = "WindowsAppShortcuts.";
        var assembly = typeof(WindowsPresets).Assembly;
        foreach (var resource in assembly.GetManifestResourceNames().Where(name => name.StartsWith(prefix, StringComparison.Ordinal)))
        {
            using var stream = assembly.GetManifestResourceStream(resource)!;
            var template = JsonSerializer.Deserialize<Template>(stream, JsonOptions)
                ?? throw new InvalidDataException($"Empty Windows shortcut template: {resource}");
            foreach (var preset in template.Shortcuts)
                if (SafeActions.ShortcutStrokes(SafeActions.ScopedShortcutPrefix + preset.Shortcut) is null)
                    throw new InvalidDataException($"Invalid Windows shortcut in {resource}: {preset.Id}");
            foreach (var executable in template.Executables)
                ByExecutable.Add(executable, template);
            foreach (var target in template.Targets ?? [])
                ByTarget.Add(target, template);
        }
    }

    public static Template? For(string? executable, string target)
    {
        if (ByTarget.TryGetValue(target, out var presets)) return presets;
        var name = Path.GetFileName((executable ?? target).Replace('\\', '/'));
        return ByExecutable.GetValueOrDefault(name);
    }

    public static string? IRacingInstallDirectory(string? launcher)
    {
        if (launcher is null) return null;
        var path = launcher.Replace('\\', '/');
        var name = Path.GetFileName(path);
        var directory = Path.GetDirectoryName(path);
        if (name.Equals("iRacingUI.exe", StringComparison.OrdinalIgnoreCase))
            return string.Equals(Path.GetFileName(directory), "ui", StringComparison.OrdinalIgnoreCase)
                ? Path.GetDirectoryName(directory) : directory;
        return name.Equals("iRacingLauncher64.exe", StringComparison.OrdinalIgnoreCase) ? directory : null;
    }

    public static bool IsIRacingSimulator(string installDirectory, string? executable)
    {
        if (executable is null) return false;
        var path = executable.Replace('\\', '/');
        var name = Path.GetFileName(path);
        return (name.Equals("iRacingSim64DX11.exe", StringComparison.OrdinalIgnoreCase) ||
                name.Equals("iRacingSim64DX12.exe", StringComparison.OrdinalIgnoreCase)) &&
            string.Equals(Path.GetDirectoryName(path), installDirectory, StringComparison.OrdinalIgnoreCase);
    }
}
