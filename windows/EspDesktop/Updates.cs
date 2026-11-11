using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using EspDesktop.Core;

namespace EspDesktop;

internal sealed record WindowsRelease(Version Version, Uri Page, Uri Installer, string Sha256);

internal static class Updates
{
    public static readonly Version Current = typeof(Updates).Assembly.GetName().Version ?? new(0, 0, 0);
    public static readonly Uri Releases = new("https://github.com/jtenniswood/espdesktop/releases");
    private const int Limit = 250 * 1024 * 1024;
    private static readonly string Cache = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EspDesktop", "Updates");
    private static readonly HttpClient Client = new(new SocketsHttpHandler { AllowAutoRedirect = true })
    {
        Timeout = TimeSpan.FromMinutes(2),
        MaxResponseContentBufferSize = 1024 * 1024
    };

    static Updates() => Client.DefaultRequestHeaders.UserAgent.ParseAdd("EspDesktop-Windows");

    public static async Task<WindowsRelease?> Check(CancellationToken token)
    {
        using var response = await Client.GetAsync("https://api.github.com/repos/jtenniswood/espdesktop/releases/latest", token);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync(token));
        var root = document.RootElement;
        var tag = Protocol.Text(root, "tag_name");
        if (!Version.TryParse(tag.TrimStart('v'), out var version) || version.CompareTo(new Version(Current.Major, Current.Minor, Current.Build)) <= 0)
            return null;
        var arch = RuntimeInformation.ProcessArchitecture == Architecture.Arm64 ? "arm64" : "x64";
        var file = $"EspDesktop-Windows-{version}-{arch}-Setup.exe";
        var downloads = new Uri($"https://github.com/jtenniswood/espdesktop/releases/download/{tag}/");
        var expected = new Uri(downloads, file);
        var compatibility = new Uri(downloads, "companion-compatibility.json");
        var assets = root.GetProperty("assets");
        if (!assets.EnumerateArray().Any(a => Protocol.Text(a, "browser_download_url") == compatibility.AbsoluteUri) ||
            !assets.EnumerateArray().Any(a => Protocol.Text(a, "browser_download_url") == expected.AbsoluteUri)) return null;
        using var contract = JsonDocument.Parse(await Client.GetByteArrayAsync(compatibility, token));
        if (!contract.RootElement.TryGetProperty("protocolVersion", out var protocol) ||
            protocol.ValueKind != JsonValueKind.Number || !protocol.TryGetInt32(out var wire) || wire != Protocol.Version) return null;
        foreach (var asset in assets.EnumerateArray())
        {
            if (Protocol.Text(asset, "name") != file || Protocol.Text(asset, "browser_download_url") != expected.AbsoluteUri) continue;
            var digest = Protocol.Text(asset, "digest");
            if (digest.Length != 71 || !digest.StartsWith("sha256:", StringComparison.Ordinal) || !digest[7..].All(Uri.IsHexDigit))
                return null;
            return new(version, new($"https://github.com/jtenniswood/espdesktop/releases/tag/{tag}"), expected, digest[7..].ToLowerInvariant());
        }
        return null;
    }

    public static bool CanInstall => Environment.ProcessPath is { } path && Authenticode.PublisherKey(path) is not null;

    public static async Task<string> Download(WindowsRelease release, CancellationToken token)
    {
        if (!CanInstall) throw new InvalidOperationException("Install a signed release to turn on in-app updates.");
        Directory.CreateDirectory(Cache);
        var path = Path.Combine(Cache, Path.GetFileName(release.Installer.AbsolutePath));
        var temp = path + ".part.exe";
        try
        {
            using var response = await Client.GetAsync(release.Installer, HttpCompletionOption.ResponseHeadersRead, token);
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > Limit) throw new IOException("The update is too large.");
            await using var input = await response.Content.ReadAsStreamAsync(token);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var output = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 65536, useAsync: true))
            {
                var buffer = new byte[65536];
                var total = 0;
                int length;
                while ((length = await input.ReadAsync(buffer, token)) != 0)
                {
                    total += length;
                    if (total > Limit) throw new IOException("The update is too large.");
                    hash.AppendData(buffer, 0, length);
                    await output.WriteAsync(buffer.AsMemory(0, length), token);
                }
            }
            if (Convert.ToHexStringLower(hash.GetHashAndReset()) != release.Sha256 || !SamePublisher(temp))
                throw new CryptographicException("Windows could not verify the update publisher.");
            File.Move(temp, path, true);
            return path;
        }
        finally { File.Delete(temp); }
    }

    public static void Install(string path, bool quiet)
    {
        if (!SamePublisher(path)) throw new CryptographicException("Windows could not verify the update publisher.");
        var start = new ProcessStartInfo(path) { UseShellExecute = false };
        if (quiet) start.ArgumentList.Add("/VERYSILENT");
        start.ArgumentList.Add("/NORESTART");
        start.ArgumentList.Add("/CLOSEAPPLICATIONS");
        using var process = Process.Start(start);
        if (process is null) throw new IOException("The update installer did not start.");
    }

    private static bool SamePublisher(string path) =>
        Environment.ProcessPath is { } current && Authenticode.PublisherKey(current) is { } expected &&
        Authenticode.PublisherKey(path) == expected;
}

internal static class Authenticode
{
    public static string? PublisherKey(string path)
    {
        var file = new FileInfoNative { Size = (uint)Marshal.SizeOf<FileInfoNative>(), Path = path };
        var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<FileInfoNative>());
        Marshal.StructureToPtr(file, pointer, false);
        try
        {
            // Disable network retrieval here. A build or installer that Windows
            // cannot validate using the system trust store cannot auto-update.
            var data = new TrustData
            {
                Size = (uint)Marshal.SizeOf<TrustData>(), UI = 2, Union = 1, File = pointer,
                ProviderFlags = 0x1000, StateAction = 1
            };
            var action = new Guid("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");
            try
            {
                if (WinVerifyTrust(new IntPtr(-1), in action, ref data) != 0) return null;
                var provider = WTHelperProvDataFromStateData(data.State);
                if (provider == 0) return null;
                var verified = WTHelperGetProvSignerFromChain(provider, 0, false, 0);
                if (verified == 0) return null;
                var providerCert = WTHelperGetProvCertFromChain(verified, 0);
                if (providerCert == 0) return null;
                var context = Marshal.ReadIntPtr(providerCert, IntPtr.Size);
                if (context == 0) return null;
                var certificate = Marshal.PtrToStructure<CertificateContext>(context);
                if (certificate.Length is 0 or > 65536) return null;
                var der = new byte[certificate.Length];
                Marshal.Copy(certificate.Encoded, der, 0, der.Length);
                using var signer = X509CertificateLoader.LoadCertificate(der);
                return Protocol.Hash(signer.PublicKey.ExportSubjectPublicKeyInfo());
            }
            finally
            {
                data.StateAction = 2;
                _ = WinVerifyTrust(new IntPtr(-1), in action, ref data);
            }
        }
        catch (CryptographicException) { return null; }
        finally { Marshal.DestroyStructure<FileInfoNative>(pointer); Marshal.FreeHGlobal(pointer); }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct FileInfoNative
    {
        public uint Size;
        [MarshalAs(UnmanagedType.LPWStr)] public string Path;
        public nint Handle, KnownSubject;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct TrustData
    {
        public uint Size;
        public nint Callback, Client;
        public uint UI, Revocation, Union;
        public nint File;
        public uint StateAction;
        public nint State, Url;
        public uint ProviderFlags, Context;
        public nint SignatureSettings;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct CertificateContext
    {
        public uint Encoding;
        public nint Encoded;
        public uint Length;
        public nint Info, Store;
    }
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern nint WTHelperProvDataFromStateData(nint state);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern nint WTHelperGetProvSignerFromChain(nint provider, uint index,
        [MarshalAs(UnmanagedType.Bool)] bool counterSigner, uint counterIndex);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern nint WTHelperGetProvCertFromChain(nint signer, uint index);
    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern int WinVerifyTrust(nint owner, in Guid action, ref TrustData data);
}
