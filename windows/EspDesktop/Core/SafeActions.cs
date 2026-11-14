namespace EspDesktop.Core;

internal static class SafeActions
{
    public static Uri? WebUrl(string value, bool decode = true)
    {
        if (decode) value = Uri.UnescapeDataString(value);
        if (value.Any(c => char.IsControl(c) || c == '\\') ||
            !Uri.TryCreate(value, UriKind.Absolute, out var url) ||
            url.Scheme is not ("http" or "https") || url.Host.Length == 0 || url.UserInfo.Length != 0) return null;
        return url;
    }

    // The panel sends key identifiers, never command lines or text to type.
    // Command maps to Ctrl so existing cross-platform app shortcuts keep working.
    private static readonly Dictionary<string, ushort> Modifiers = new()
    { ["command"] = 0x11, ["control"] = 0x11, ["option"] = 0x12, ["shift"] = 0x10 };
    private static readonly Dictionary<string, ushort> Keys = new()
    {
        ["backspace"] = 0x08, ["delete"] = 0x08, ["forwarddelete"] = 0x2e,
        ["tab"] = 0x09, ["return"] = 0x0d, ["enter"] = 0x0d, ["escape"] = 0x1b, ["space"] = 0x20,
        ["pageup"] = 0x21, ["pagedown"] = 0x22, ["end"] = 0x23, ["home"] = 0x24,
        ["left"] = 0x25, ["up"] = 0x26, ["right"] = 0x27, ["down"] = 0x28, ["insert"] = 0x2d,
        ["keyminus"] = 0xbd, ["keyequal"] = 0xbb, ["keybracketleft"] = 0xdb, ["keybracketright"] = 0xdd,
        ["keybackslash"] = 0xdc, ["keysemicolon"] = 0xba, ["keyquote"] = 0xde, ["keycomma"] = 0xbc,
        ["keyperiod"] = 0xbe, ["keyslash"] = 0xbf, ["keybackquote"] = 0xc0
    };
    public static ushort[]? Shortcut(string id)
    {
        if (!id.StartsWith("shortcut.", StringComparison.Ordinal)) return null;
        var parts = id[9..].Split('+');
        if (parts.Length > 5 || parts.Distinct().Count() != parts.Length) return null;
        var result = new List<ushort>();
        foreach (var part in parts[..^1])
        {
            if (!Modifiers.TryGetValue(part, out var modifier)) return null;
            if (!result.Contains(modifier)) result.Add(modifier);
        }
        var key = parts[^1];
        if (key.Length == 1 && char.IsAsciiLetterOrDigit(key[0])) result.Add(char.ToUpperInvariant(key[0]));
        else if (key.StartsWith('f') && key.Length <= 3 && int.TryParse(key.AsSpan(1), out var f) && f is >= 1 and <= 20 &&
                 key == FormattableString.Invariant($"f{f}")) result.Add((ushort)(0x6f + f));
        else if (Keys.TryGetValue(key, out var vk)) result.Add(vk);
        else return null;
        // Windows shell and session shortcuts must not be triggered by the panel.
        if ((result.Contains(0x12) && result[^1] is 0x09 or 0x1b or 0x73) ||
            (result.Contains(0x11) && result[^1] == 0x1b)) return null;
        return [.. result];
    }
}
