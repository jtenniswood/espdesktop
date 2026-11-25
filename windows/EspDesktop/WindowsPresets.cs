using System.IO;
using System.Text.Json;
using EspDesktop.Core;

namespace EspDesktop;

internal static class WindowsPresets
{
    internal sealed record Preset(string Id, string Label, string Shortcut, string Icon)
    {
        // Plain and Shift-only strokes need the scoped form on the display.
        public string DisplayShortcut => Shortcut.Contains('~') ||
            !Shortcut.Split('+').SkipLast(1).Any(key => key is "control" or "option")
                ? "scoped." + Shortcut : Shortcut;
    }
    internal sealed record Template(string[] Executables, string[]? Targets, string[]? DefaultShortcutIds, Preset[] Shortcuts);
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
}
