using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using EspDesktop.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace EspDesktop;

internal sealed class UsbEditorWindow : Window
{
    private readonly byte[]? bundledScript = ReadBundledScript();
    private readonly Uri origin = new($"https://{Guid.NewGuid():N}.espdesktop.invalid/");
    private readonly WebView2 browser = new();
    private readonly TextBlock status = new() { Text = "Loading editor over USB…", TextWrapping = TextWrapping.Wrap };
    private readonly StackPanel signIn = new() { Visibility = Visibility.Collapsed };
    private readonly TextBox username = new() { MinWidth = 170 };
    private readonly PasswordBox password = new() { MinWidth = 170 };
    private readonly Button reload = new() { Content = "Reload", IsEnabled = false };
    private readonly Func<UsbDisplayEditor?> getEditor;
    private readonly CancellationTokenSource lifetime = new();
    private CancellationTokenSource pageReads = new();
    private Task<UsbEditorResponse?>? initialVersion;
    private Task<UsbEditorResponse>? capabilitiesRead;
    private NetworkCredential? credentials;
    private bool closed;

    public UsbEditorWindow(string name, Func<UsbDisplayEditor?> getEditor)
    {
        Title = $"{name} — USB editor";
        Width = 1040;
        Height = 760;
        MinWidth = 640;
        MinHeight = 480;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        this.getEditor = getEditor;

        var root = new DockPanel();
        var footer = new DockPanel { Margin = new Thickness(12, 8, 12, 8) };
        DockPanel.SetDock(footer, Dock.Bottom);
        DockPanel.SetDock(reload, Dock.Right);
        footer.Children.Add(reload);
        footer.Children.Add(status);
        reload.Click += (_, _) => ReloadEditor();
        root.Children.Add(footer);

        var fields = new WrapPanel { Margin = new Thickness(0, 4, 0, 0) };
        fields.Children.Add(new Label { Content = "Username", Target = username });
        fields.Children.Add(username);
        fields.Children.Add(new Label { Content = "Password", Target = password });
        fields.Children.Add(password);
        var submit = new Button { Content = "Sign in", Margin = new Thickness(8, 0, 0, 0) };
        submit.Click += (_, _) =>
        {
            credentials = new NetworkCredential(username.Text, password.Password);
            password.Clear();
            signIn.Visibility = Visibility.Collapsed;
            ReloadEditor();
        };
        fields.Children.Add(submit);
        signIn.Margin = new Thickness(12);
        signIn.Children.Add(new TextBlock { Text = "Sign in with this display’s web editor username and password." });
        signIn.Children.Add(fields);
        DockPanel.SetDock(signIn, Dock.Top);
        root.Children.Add(signIn);
        root.Children.Add(browser);
        Content = root;
        Loaded += Initialize;
        Closed += (_, _) =>
        {
            closed = true;
            lifetime.Cancel();
            pageReads.Cancel();
            browser.Dispose();
            lifetime.Dispose();
            pageReads.Dispose();
        };
    }

    private async void Initialize(object sender, RoutedEventArgs e)
    {
        Loaded -= Initialize;
        try
        {
            PrefetchVersion();
            var dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "EspDesktop", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataFolder);
            if (closed) return;
            var options = environment.CreateCoreWebView2ControllerOptions();
            options.IsInPrivateModeEnabled = true;
            await browser.EnsureCoreWebView2Async(environment, options);
            if (closed) return;
            var web = browser.CoreWebView2;
            web.Settings.AreDevToolsEnabled = false;
            web.Settings.AreHostObjectsAllowed = false;
            web.Settings.IsWebMessageEnabled = false;
            web.Settings.IsPasswordAutosaveEnabled = false;
            web.Settings.IsGeneralAutofillEnabled = false;
            web.NavigationStarting += (_, nav) => nav.Cancel = !IsLocal(nav.Uri);
            web.FrameNavigationStarting += (_, nav) => nav.Cancel = true;
            web.NewWindowRequested += (_, nav) => nav.Handled = true;
            web.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            web.WebResourceRequested += HandleRequest;
            // The editor already has a snapshot fallback when streaming events are unavailable.
            await web.AddScriptToExecuteOnDocumentCreatedAsync("window.EventSource = undefined;");
            if (closed) return;
            reload.IsEnabled = true;
            LoadEditor();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            if (!closed) status.Text = "Install the Microsoft Edge WebView2 Runtime to open the USB editor.";
        }
        catch (Exception ex) when (ex is InvalidOperationException or COMException or ArgumentException)
        {
            if (!closed) status.Text = "Windows couldn’t open the USB editor.";
        }
    }

    private bool IsLocal(string url) => Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
        uri.Scheme == origin.Scheme && uri.Host == origin.Host && uri.IsDefaultPort && uri.UserInfo.Length == 0;

    private void ReloadEditor()
    {
        // Drop queued reads from the previous page. Any submitted write keeps
        // its normal lifetime so reloading cannot interrupt a save.
        var previousReads = pageReads;
        pageReads = new CancellationTokenSource();
        previousReads.Cancel();
        previousReads.Dispose();
        capabilitiesRead = null;
        PrefetchVersion();
        LoadEditor();
    }

    private void LoadEditor()
    {
        status.Text = "Loading editor over USB…";
        browser.CoreWebView2.Navigate(origin.AbsoluteUri);
    }

    private void PrefetchVersion()
    {
        initialVersion = bundledScript is not null && getEditor() is { } editor
            ? ReadVersion(editor, credentials, pageReads.Token) : null;
    }

    private static async Task<UsbEditorResponse?> ReadVersion(UsbDisplayEditor editor,
        NetworkCredential? credentials, CancellationToken token)
    {
        // Find the display profile while WebView2 is starting. Transient
        // failures fall through to the normal request and retry flow.
        try
        {
            var reply = await editor.Request("GET", "/espdesktop/version.json", new Dictionary<string, string>(), [], credentials, token);
            return reply.Status is 200 or 401 ? reply : null;
        }
        catch (Exception ex) when (IsConnectionError(ex)) { return null; }
    }

    private async void HandleRequest(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        if (closed) return;
        using var deferral = e.GetDeferral();
        string? path = null;
        var method = "";
        var token = lifetime.Token;
        try
        {
            var request = e.Request;
            path = IsLocal(request.Uri) ? new Uri(request.Uri).PathAndQuery : null;
            method = request.Method;
            if (method == "GET") token = pageReads.Token;
            if (path == "/" && request.Method == "GET")
            {
                Respond(e, 200, "Content-Type: text/html; charset=utf-8\r\n" +
                    "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; font-src data: blob:; connect-src 'self'",
                    Encoding.UTF8.GetBytes(Html));
                return;
            }
            if (path is null) { Respond(e, 403); return; }
            if (path == "/favicon.ico") { Respond(e, 404); return; }
            if (getEditor() is not { } editor)
            {
                status.Text = "Reconnect the display by USB to continue.";
                Respond(e, 503);
                return;
            }

            if (path == "/0.js" && request.Method == "GET" && bundledScript is not null)
            {
                Respond(e, 200, "Content-Type: text/javascript", bundledScript);
                return;
            }

            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var header in request.Headers) headers[header.Key] = header.Value;
            var body = ReadBody(request.Content, token);
            if (body is null) { Respond(e, 413); return; }
            var usedCredentials = credentials;
            var reply = await RequestResource(editor, method, path, headers, body, usedCredentials, token);
            if (closed) return;
            if (token.IsCancellationRequested) { Respond(e, 503); return; }
            if (reply.Status == 401 && ReferenceEquals(credentials, usedCredentials))
            {
                credentials = null;
                status.Text = "Sign in to the display to continue.";
                signIn.Visibility = Visibility.Visible;
            }
            else if (reply.Status != 401)
            {
                status.Text = path == "/0.js" && reply.Status != 200
                    ? "The display couldn’t load the editor. Check its firmware and reload." : "Connected over USB";
                if (reply.Status < 400) signIn.Visibility = Visibility.Collapsed;
            }
            Respond(e, reply.Status, string.Join("\r\n", reply.Headers.Select(header => $"{header.Key}: {header.Value}")), reply.Body);
        }
        catch (Exception ex) when (IsConnectionError(ex) || ex is COMException)
        {
            if (closed) return;
            if (!token.IsCancellationRequested && (method != "GET" || path is "/0.js" or "/api/v1/config" || getEditor() is null))
                status.Text = "The display didn’t respond. Check the USB connection and retry.";
            Respond(e, 503);
        }
    }

    private async Task<UsbEditorResponse> RequestResource(UsbDisplayEditor editor, string method, string path,
        Dictionary<string, string> headers, byte[] body, NetworkCredential? usedCredentials, CancellationToken token)
    {
        if (method == "GET" && !headers.ContainsKey("If-Match") &&
            !headers.ContainsKey("X-Panel-Config-Version") && !headers.ContainsKey("X-EspDesktop-Epoch"))
        {
            if (path == "/espdesktop/version.json" && initialVersion is { } prefetched)
            {
                initialVersion = null;
                if (await prefetched is { } version) return version;
            }
            if (path == "/api/v1/capabilities")
            {
                // Layout, identity and settings can share an in-flight read.
                var read = capabilitiesRead ??= RequestPanel(editor, method, path, headers, body, usedCredentials, token);
                try { return await read; }
                finally { if (ReferenceEquals(capabilitiesRead, read)) capabilitiesRead = null; }
            }
        }
        return await RequestPanel(editor, method, path, headers, body, usedCredentials, token);
    }

    private async Task<UsbEditorResponse> RequestPanel(UsbDisplayEditor editor, string method, string path,
        Dictionary<string, string> headers, byte[] body, NetworkCredential? usedCredentials, CancellationToken token)
    {
        try { return await editor.Request(method, path, headers, body, usedCredentials, token); }
        catch (Exception ex) when (method == "GET" && !token.IsCancellationRequested && IsConnectionError(ex))
        {
            await Task.Delay(500, token);
            var current = getEditor();
            if (current is null)
            {
                await Task.Delay(2500, token);
                current = getEditor();
            }
            if (current is null) throw;
            return await current.Request(method, path, headers, body, usedCredentials, token);
        }
    }

    private static bool IsConnectionError(Exception error) => error is HttpRequestException or IOException or
        OperationCanceledException or System.Net.WebSockets.WebSocketException;

    private static byte[]? ReadBundledScript()
    {
        using var source = typeof(UsbEditorWindow).Assembly.GetManifestResourceStream("UsbEditor.js");
        if (source is null) return null;
        using var output = new MemoryStream();
        source.CopyTo(output);
        return output.ToArray();
    }

    private static byte[]? ReadBody(Stream? content, CancellationToken token)
    {
        if (content is null) return [];
        using var sink = new MemoryStream();
        var buffer = new byte[8192];
        int count;
        while ((count = content.Read(buffer, 0, buffer.Length)) != 0)
        {
            token.ThrowIfCancellationRequested();
            if (sink.Length + count > UsbDisplayEditor.MaxRequestBytes) return null;
            sink.Write(buffer, 0, count);
        }
        return sink.ToArray();
    }

    private void Respond(CoreWebView2WebResourceRequestedEventArgs e, int code, string headers = "", byte[]? body = null)
    {
        e.Response = browser.CoreWebView2.Environment.CreateWebResourceResponse(
            new MemoryStream(body ?? []), code, code < 400 ? "OK" : "Request failed",
            "Cache-Control: no-store" + (headers.Length == 0 ? "" : "\r\n" + headers));
    }

    private const string Html = """
        <!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="espdesktop-transport" content="usb"><title>EspDesktop USB editor</title><style>.card:has(.sp-reset-options){display:none!important}</style></head>
        <body><esp-app></esp-app><script src="/0.js"></script></body></html>
        """;
}
