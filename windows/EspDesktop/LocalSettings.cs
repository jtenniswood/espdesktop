using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using EspDesktop.Core;
using Microsoft.Win32;

namespace EspDesktop;

internal sealed record ApprovedFolder(string Id, string Path, string? DisplayName = null)
{
    [JsonIgnore]
    public string Label
    {
        get
        {
            if (!string.IsNullOrWhiteSpace(DisplayName)) return DisplayName;
            var name = System.IO.Path.GetFileName(Path.TrimEnd('\\', '/'));
            if (name.Length > 0) return name;
            if (Path.Length >= 2 && char.IsAsciiLetter(Path[0]) && Path[1] == ':')
                return $"Drive {char.ToUpperInvariant(Path[0])}";
            return "Folder";
        }
    }

    public ApprovedFolder Relocate(string path) => this with { Path = path, DisplayName = Label };
}

internal sealed class LocalSettings
{
    public bool AllApps { get; set; } = true;
    public bool Shortcuts { get; set; }
    public bool ReuseOpenApps { get; set; } = true;
    public bool CheckForUpdates { get; set; } = true;
    public bool InstallUpdates { get; set; }
    public Version? LastNotifiedUpdate { get; set; }
    public int? ObsPort { get; set; }
    public string? ObsProtectedPassword { get; set; }
    public Dictionary<string, ObsBreakChoice> ObsBreakChoices { get; set; } = new(StringComparer.Ordinal);
    public bool ObsBreakNeedsReview { get; set; }
    public string ClientId { get; set; } = "";
    public string MicMuteSource { get; set; } = "system";
    public HashSet<string> AllowedApps { get; set; } = [];
    public List<ApprovedFolder> Folders { get; set; } = [];

    public bool MarkUpdateNotified(Version version)
    {
        if (!CheckForUpdates || version <= LastNotifiedUpdate) return false;
        LastNotifiedUpdate = version;
        return true;
    }
}

internal sealed class LocalStore
{
    private readonly string root;
    public LocalSettings Settings { get; }
    public bool PairingUnavailable { get; private set; }
    // A failed read means the saved approvals could not be trusted, so a later
    // save must not replace the intact file with fail-closed defaults.
    public bool SettingsUnavailable { get; private set; }

    public LocalStore() : this(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EspDesktop")) { }

    internal LocalStore(string root)
    {
        this.root = root;
        Settings = LoadSettings();
    }

    public Pairing[] LoadPairings()
    {
        try
        {
            var path = Path.Combine(root, "pairing.dat");
            var plain = UserProtection.Transform(File.ReadAllBytes(path), decrypt: true);
            try
            {
                using var json = JsonDocument.Parse(plain);
                var pairings = json.RootElement.ValueKind == JsonValueKind.Array
                    ? json.RootElement.Deserialize<Pairing[]>() ?? []
                    : new[] { json.RootElement.Deserialize<Pairing>() };
                var fingerprints = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var valid = pairings.Select(pairing =>
                {
                    if (pairing is null || string.IsNullOrWhiteSpace(pairing.Address) ||
                        pairing.Key?.Length != 32 || pairing.Fingerprint?.Length != 64 ||
                        !pairing.Fingerprint.All(Uri.IsHexDigit) || !fingerprints.Add(pairing.Fingerprint))
                        throw new IOException("Invalid saved pairing.");
                    _ = DisplayEndpoint.Parse(pairing.Address);
                    if (pairing.ComputerId is { } computerId &&
                        (computerId.Length != 16 || !computerId.All(Uri.IsHexDigit)))
                        pairing = pairing with { ComputerId = null };
                    return pairing with { DisplayName = Discovery.FriendlyName(pairing.DisplayName) };
                }).ToArray();
                PairingUnavailable = false;
                return valid;
            }
            finally { CryptographicOperations.ZeroMemory(plain); }
        }
        catch (FileNotFoundException) { return []; }
        catch (DirectoryNotFoundException) { return []; }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or
            ArgumentException or CryptographicException)
        {
            PairingUnavailable = true;
            return [];
        }
    }

    public void SavePairing(Pairing pairing)
    {
        var saved = LoadPairings().ToList();
        if (PairingUnavailable) throw new IOException("The saved pairings could not be read.");
        var index = saved.FindIndex(p => p.Fingerprint.Equals(pairing.Fingerprint, StringComparison.OrdinalIgnoreCase));
        if (index < 0) saved.Add(pairing);
        else saved[index] = pairing;
        WritePairings(saved);
    }

    public void ForgetPairing(string fingerprint)
    {
        var saved = LoadPairings();
        if (PairingUnavailable) throw new IOException("The saved pairings could not be read.");
        var remaining = saved.Where(p => !p.Fingerprint.Equals(fingerprint, StringComparison.OrdinalIgnoreCase)).ToArray();
        if (remaining.Length == 0) ForgetPairing();
        else WritePairings(remaining);
    }

    private void WritePairings(IReadOnlyList<Pairing> pairings)
    {
        // Keep the original file format when there is one display.
        var data = pairings.Count == 1 ? JsonSerializer.SerializeToUtf8Bytes(pairings[0]) :
            JsonSerializer.SerializeToUtf8Bytes(pairings);
        try { Write("pairing.dat", UserProtection.Transform(data, decrypt: false)); PairingUnavailable = false; }
        finally { CryptographicOperations.ZeroMemory(data); }
    }

    public void ForgetPairing()
    {
        try { File.Delete(Path.Combine(root, "pairing.dat")); }
        catch (DirectoryNotFoundException) { }
        PairingUnavailable = false;
    }

    public string ClientId()
    {
        if (Settings.ClientId is not { Length: 32 } id || !id.All(Uri.IsHexDigit))
        {
            Settings.ClientId = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(16));
            // Pairing can still work from memory while the file is locked.
            if (!SettingsUnavailable) Save();
        }
        return Settings.ClientId;
    }
    public void Save()
    {
        if (SettingsUnavailable)
            throw new IOException("The saved Windows settings are unavailable.");
        Write("settings.json", JsonSerializer.SerializeToUtf8Bytes(Settings));
    }
    private LocalSettings LoadSettings()
    {
        var path = Path.Combine(root, "settings.json");
        try
        {
            var settings = JsonSerializer.Deserialize<LocalSettings>(File.ReadAllBytes(path));
            if (settings?.AllowedApps is null || settings.Folders is null ||
                settings.Folders.Any(folder => folder is null || string.IsNullOrWhiteSpace(folder.Id) ||
                    string.IsNullOrWhiteSpace(folder.Path))) throw new JsonException("Invalid saved settings.");
            if (settings.MicMuteSource is not ("system" or "teams")) settings.MicMuteSource = "system";
            return settings;
        }
        catch (FileNotFoundException) { return new(); }
        catch (DirectoryNotFoundException) { return new(); }
        // Damaged JSON is kept for recovery; only then may a fail-closed set of
        // defaults replace it. A temporary lock must not destroy the file.
        catch (JsonException)
        {
            try { File.Move(path, path + ".bad", overwrite: true); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException) { }
            return new() { AllApps = false, CheckForUpdates = false };
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            SettingsUnavailable = true;
            return new() { AllApps = false, CheckForUpdates = false };
        }
    }

    private void Write(string name, byte[] bytes)
    {
        Directory.CreateDirectory(root);
        var file = Path.Combine(root, name);
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
