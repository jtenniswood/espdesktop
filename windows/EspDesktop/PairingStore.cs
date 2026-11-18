using System.Security.Cryptography;
using System.Text.Json;

namespace EspDesktop.Windows;

internal static class PairingStore
{
    private static readonly string PathName = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "EspDesktop", "iracing-pairing.dat");

    public static Pairing? Load()
    {
        if (!File.Exists(PathName))
            return null;
        var bytes = ProtectedData.Unprotect(File.ReadAllBytes(PathName), null, DataProtectionScope.CurrentUser);
        return JsonSerializer.Deserialize<Pairing>(bytes);
    }

    public static void Save(Pairing pairing)
    {
        var bytes = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(pairing), null, DataProtectionScope.CurrentUser);
        Directory.CreateDirectory(Path.GetDirectoryName(PathName)!);
        var temporary = PathName + ".tmp";
        File.WriteAllBytes(temporary, bytes);
        File.Move(temporary, PathName, overwrite: true);
    }

    public static void Forget() => File.Delete(PathName);
}
