using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using EspDesktop.Core;
using Microsoft.Win32;

namespace EspDesktop;

internal sealed record ApprovedFolder(string Id, string Path)
{
    public string Label
    {
        get
        {
            var name = System.IO.Path.GetFileName(Path.TrimEnd('\\', '/'));
            if (name.Length > 0) return name;
            if (Path.Length >= 2 && char.IsAsciiLetter(Path[0]) && Path[1] == ':')
                return $"Drive {char.ToUpperInvariant(Path[0])}";
            return "Folder";
        }
    }
}

internal sealed class LocalSettings
{
    public bool AllApps { get; set; } = true;
    public bool Shortcuts { get; set; }
    public bool CheckForUpdates { get; set; } = true;
    public bool InstallUpdates { get; set; }
    public HashSet<string> AllowedApps { get; set; } = [];
    public List<ApprovedFolder> Folders { get; set; } = [];
}

internal sealed class LocalStore
{
    private static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EspDesktop");
    public LocalSettings Settings { get; } = LoadSettings();
    public bool PairingUnavailable { get; private set; }

    public Pairing? LoadPairing()
    {
        try
        {
            var path = Path.Combine(Root, "pairing.dat");
            if (!File.Exists(path)) return null;
            var plain = UserProtection.Transform(File.ReadAllBytes(path), decrypt: true);
            try
            {
                var pairing = JsonSerializer.Deserialize<Pairing>(plain);
                if (pairing is null || pairing.Key?.Length != 32 || pairing.Fingerprint?.Length != 64 ||
                    !pairing.Fingerprint.All(Uri.IsHexDigit)) throw new IOException("Invalid saved pairing.");
                _ = DisplayEndpoint.Parse(pairing.Address);
                return pairing;
            }
            finally { CryptographicOperations.ZeroMemory(plain); }
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or
            ArgumentException or CryptographicException)
        {
            PairingUnavailable = true;
            return null;
        }
    }

    public void SavePairing(Pairing pairing)
    {
        var data = JsonSerializer.SerializeToUtf8Bytes(pairing);
        try { Write("pairing.dat", UserProtection.Transform(data, decrypt: false)); PairingUnavailable = false; }
        finally { CryptographicOperations.ZeroMemory(data); }
    }

    public void ForgetPairing()
    {
        File.Delete(Path.Combine(Root, "pairing.dat"));
        PairingUnavailable = false;
    }
    public void Save() => Write("settings.json", JsonSerializer.SerializeToUtf8Bytes(Settings));
    private static LocalSettings LoadSettings()
    {
        try
        {
            return JsonSerializer.Deserialize<LocalSettings>(File.ReadAllBytes(Path.Combine(Root, "settings.json"))) ?? new();
        }
        catch (FileNotFoundException) { return new(); }
        catch (DirectoryNotFoundException) { return new(); }
        // Fail closed rather than restoring all app approvals after damaged settings.
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
        { return new() { AllApps = false, CheckForUpdates = false }; }
    }

    private static void Write(string name, byte[] bytes)
    {
        Directory.CreateDirectory(Root);
        var file = Path.Combine(Root, name);
        var temp = file + ".new";
        File.WriteAllBytes(temp, bytes);
        File.Move(temp, file, overwrite: true);
    }

    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    public static bool StartsAtLogin
    {
        get
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue("EspDesktop") is string;
        }
        set
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (value) key.SetValue("EspDesktop", $"\"{Environment.ProcessPath}\" --background");
            else key.DeleteValue("EspDesktop", false);
        }
    }
}

internal static partial class UserProtection
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Blob { public int Size; public nint Data; }

    public static byte[] Transform(byte[] data, bool decrypt)
    {
        var input = new Blob { Size = data.Length, Data = Marshal.AllocHGlobal(data.Length) };
        Blob output = default;
        try
        {
            Marshal.Copy(data, 0, input.Data, input.Size);
            var ok = decrypt ? CryptUnprotectData(ref input, 0, 0, 0, 0, 1, out output) :
                CryptProtectData(ref input, "EspDesktop pairing", 0, 0, 0, 1, out output);
            if (!ok) throw new CryptographicException("Windows could not access this user's saved pairing.");
            var bytes = new byte[output.Size];
            Marshal.Copy(output.Data, bytes, 0, output.Size);
            return bytes;
        }
        finally
        {
            if (!decrypt) Marshal.Copy(new byte[input.Size], 0, input.Data, input.Size);
            Marshal.FreeHGlobal(input.Data);
            if (output.Data != 0)
            {
                if (decrypt) Marshal.Copy(new byte[output.Size], 0, output.Data, output.Size);
                _ = LocalFree(output.Data);
            }
        }
    }

    [LibraryImport("crypt32.dll", StringMarshalling = StringMarshalling.Utf16)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptProtectData(ref Blob data, string description, nint entropy, nint reserved,
        nint prompt, int flags, out Blob output);
    [LibraryImport("crypt32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool CryptUnprotectData(ref Blob data, nint description, nint entropy, nint reserved,
        nint prompt, int flags, out Blob output);
    [LibraryImport("kernel32.dll")]
    private static partial nint LocalFree(nint memory);
}
