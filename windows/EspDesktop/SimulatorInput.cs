using System.Diagnostics;
using System.Runtime.InteropServices;

namespace EspDesktop.Windows;

internal static class SimulatorInput
{
    private const string ShortcutPrefix = "shortcut.scoped.";
    private const uint KeyboardInput = 1;
    private const uint KeyUp = 2;

    private static readonly Dictionary<string, ushort> NamedKeys = new()
    {
        ["space"] = 0x20, ["enter"] = 0x0D, ["tab"] = 0x09, ["escape"] = 0x1B,
        ["delete"] = 0x08, ["forwarddelete"] = 0x2E,
        ["left"] = 0x25, ["up"] = 0x26, ["right"] = 0x27, ["down"] = 0x28,
        ["home"] = 0x24, ["end"] = 0x23, ["pageup"] = 0x21, ["pagedown"] = 0x22,
        ["keysemicolon"] = 0xBA, ["keyequal"] = 0xBB, ["keycomma"] = 0xBC,
        ["keyminus"] = 0xBD, ["keyperiod"] = 0xBE, ["keyslash"] = 0xBF,
        ["keybackquote"] = 0xC0, ["keybracketleft"] = 0xDB, ["keybackslash"] = 0xDC,
        ["keybracketright"] = 0xDD, ["keyquote"] = 0xDE,
        ["keypadmultiply"] = 0x6A, ["keypadplus"] = 0x6B, ["keypadminus"] = 0x6D,
        ["keypaddecimal"] = 0x6E, ["keypaddivide"] = 0x6F,
    };

    public static bool SimulatorIsForeground() => SimulatorWindow() != IntPtr.Zero;

    public static string SendShortcut(string actionId)
    {
        if (!TryGetKeys(actionId, out var keys))
            return "not_allowed";

        var target = SimulatorWindow();
        if (target == IntPtr.Zero || keys.Any(key => (GetAsyncKeyState(key) & 0x8000) != 0))
            return "not_allowed";

        var inputs = keys.Select(key => CreateInput(key, 0))
            .Concat(keys.Reverse().Select(key => CreateInput(key, KeyUp))).ToArray();
        if (GetForegroundWindow() != target)
            return "not_allowed";

        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<Input>());
        if (sent == inputs.Length)
            return "performed";

        // Release any keys for which Windows accepted the press but missed the release.
        if (sent > 0)
        {
            var released = Math.Max(0, (int)sent - keys.Length);
            var cleanup = keys.Take(Math.Min(keys.Length, (int)sent) - released).Reverse()
                .Select(key => CreateInput(key, KeyUp)).ToArray();
            SendInput((uint)cleanup.Length, cleanup, Marshal.SizeOf<Input>());
        }

        return "failed";
    }

    internal static bool TryGetKeys(string actionId, out ushort[] keys)
    {
        keys = [];
        if (!actionId.StartsWith(ShortcutPrefix, StringComparison.Ordinal) || actionId.Length > 96)
            return false;

        var parts = actionId[ShortcutPrefix.Length..].Split('+');
        if (parts.Length is < 1 or > 4 || !TryGetKey(parts[^1], out var key))
            return false;

        var modifiers = new HashSet<ushort>();
        foreach (var modifier in parts.SkipLast(1))
        {
            ushort virtualKey = modifier switch
            {
                "shift" => 0x10,
                "control" => 0x11,
                "option" => 0x12,
                _ => 0,
            };
            if (virtualKey == 0 || !modifiers.Add(virtualKey))
                return false;
        }

        // Alt+F4 closes the foreground window, including if focus changed during delivery.
        if (key == 0x73 && modifiers.Contains(0x12))
            return false;
        keys = [.. modifiers.Order(), key];
        return true;
    }

    private static bool TryGetKey(string name, out ushort key)
    {
        if (name.Length == 1 && name[0] is (>= 'a' and <= 'z') or (>= '0' and <= '9'))
        {
            key = char.ToUpperInvariant(name[0]);
            return true;
        }
        if (name.StartsWith('f') && int.TryParse(name.AsSpan(1), out var number) &&
            number is >= 1 and <= 20 && name == $"f{number}")
        {
            key = (ushort)(0x6F + number);
            return true;
        }
        if (name.Length == 7 && name.StartsWith("keypad", StringComparison.Ordinal) && char.IsAsciiDigit(name[6]))
        {
            key = (ushort)(0x60 + name[6] - '0');
            return true;
        }
        return NamedKeys.TryGetValue(name, out key);
    }

    private static IntPtr SimulatorWindow()
    {
        var window = GetForegroundWindow();
        if (window == IntPtr.Zero || GetWindowThreadProcessId(window, out var processId) == 0)
            return IntPtr.Zero;
        try
        {
            using var process = Process.GetProcessById((int)processId);
            var executable = process.ProcessName;
            return executable.Equals("iRacingSim64DX11", StringComparison.OrdinalIgnoreCase) ||
                   executable.Equals("iRacingSim64DX12", StringComparison.OrdinalIgnoreCase)
                ? window : IntPtr.Zero;
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            return IntPtr.Zero;
        }
    }

    private static Input CreateInput(ushort key, uint flags) =>
        new() { Type = KeyboardInput, Data = new() { Keyboard = new() { VirtualKey = key, Flags = flags } } };

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint Type;
        public InputData Data;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputData
    {
        [FieldOffset(0)] public KeyboardEvent Keyboard;
        [FieldOffset(0)] public MouseEvent Mouse;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardEvent
    {
        public ushort VirtualKey, ScanCode;
        public uint Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseEvent
    {
        public int X, Y;
        public uint Data, Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, [In] Input[] inputs, int inputSize);
}
