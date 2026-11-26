using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Logging;

namespace EspDesktop.Core;

internal sealed class UsbEditorHost : IAsyncDisposable
{
    private readonly WebApplication app;
    private readonly Func<UsbEditorClient?> current;
    private readonly string secret = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
    private readonly string cookie = "EspDesktopUSB" + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(12));
    private readonly CancellationTokenSource lifetime = new();
    private Uri? origin;
    private int disposed;

    private UsbEditorHost(WebApplication app, Func<UsbEditorClient?> current)
    {
        this.app = app;
        this.current = current;
    }

    public Uri EditorUrl => new(origin!, "/open/" + secret);

    public static async Task<UsbEditorHost> Start(Func<UsbEditorClient?> current, CancellationToken token)
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        { Args = [], ContentRootPath = AppContext.BaseDirectory });
        // Keep this listener loopback-only even if the desktop process inherited
        // server settings or was launched from a directory with appsettings.json.
        builder.Configuration.Sources.Clear();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(server =>
        {
            server.AddServerHeader = false;
            server.Limits.MaxRequestBodySize = UsbHttpRequest.RequestLimit;
            server.Listen(IPAddress.Loopback, 0, endpoint => endpoint.Protocols = HttpProtocols.Http1);
        });
        var app = builder.Build();
        var host = new UsbEditorHost(app, current);
        app.Run(host.Handle);
        try
        {
            await app.StartAsync(token);
            host.origin = new Uri(app.Urls.Single());
            return host;
        }
        catch { await host.DisposeAsync(); throw; }
    }

    private async Task Handle(HttpContext context)
    {
        var request = context.Request;
        var response = context.Response;
        response.Headers.CacheControl = "no-store";
        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["Referrer-Policy"] = "no-referrer";
        response.Headers["X-Frame-Options"] = "DENY";
        if (origin == null || request.Host.Value != origin.Authority ||
            request.Headers.TryGetValue("Origin", out var sentOrigin) && sentOrigin.ToString() != origin.GetLeftPart(UriPartial.Authority) ||
            request.Headers.TryGetValue("Sec-Fetch-Site", out var site) && site.ToString() is not ("same-origin" or "none"))
        {
            response.StatusCode = 403;
            return;
        }

        if (request.Method == "GET" && request.Path == "/open/" + secret && !request.QueryString.HasValue)
        {
            response.Cookies.Append(cookie, secret, new CookieOptions { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/" });
            response.Redirect("/");
            return;
        }
        if (!request.Cookies.TryGetValue(cookie, out var supplied) || supplied.Length != secret.Length ||
            !CryptographicOperations.FixedTimeEquals(System.Text.Encoding.ASCII.GetBytes(supplied), System.Text.Encoding.ASCII.GetBytes(secret)))
        {
            response.StatusCode = 403;
            return;
        }

        if (request.Path == "/" && request.Method == "GET")
        {
            response.ContentType = "text/html; charset=utf-8";
            response.Headers.ContentSecurityPolicy = "default-src 'none'; script-src 'self' 'unsafe-inline'; " +
                "style-src 'unsafe-inline' 'self'; img-src 'self' data: blob:; font-src 'self' data: blob:; " +
                "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
            await response.WriteAsync(Page);
            return;
        }

        using var token = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted, lifetime.Token);
        try
        {
            using var buffer = new MemoryStream();
            await request.Body.CopyToAsync(buffer, token.Token);
            var raw = context.Features.Get<IHttpRequestFeature>()?.RawTarget;
            var transfer = raw == null ? null : UsbHttpRequest.Create(request.Method, raw,
                request.Headers.Select(header => KeyValuePair.Create(header.Key, header.Value.ToString())), buffer.ToArray());
            if (transfer == null) { response.StatusCode = 405; return; }
            var reply = await Send(transfer, token.Token);
            response.StatusCode = reply.Status is >= 200 and <= 599 and not (>= 300 and < 400) ? reply.Status : 502;
            if (response.StatusCode == 502 && reply.Status != 502) return;
            foreach (var (name, value) in reply.Headers) response.Headers[name] = value;
            if (response.StatusCode is not (204 or 205))
            {
                response.ContentLength = reply.Body.Length;
                await response.Body.WriteAsync(reply.Body, token.Token);
            }
        }
        catch (Microsoft.AspNetCore.Http.BadHttpRequestException e) { response.StatusCode = e.StatusCode; }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { }
        catch (Exception e) when (ConnectionError(e))
        {
            if (!response.HasStarted)
            {
                response.StatusCode = 503;
                response.Headers.RetryAfter = "2";
                await response.WriteAsync("Reconnect the display by USB to continue.", token.Token);
            }
        }
    }

    private async Task<UsbHttpResponse> Send(UsbHttpRequest request, CancellationToken token)
    {
        var client = await WaitForDisplay(token);
        try { return await client.Request(request, token); }
        catch (Exception e) when (ConnectionError(e) && !token.IsCancellationRequested)
        {
            if (request.Method == "POST") throw;
            var restored = await WaitForDisplay(token);
            if (request.Method == "GET") return await restored.Request(request, token);

            // A PUT can be delivered before the USB cable is lost. Read the
            // saved settings before repeating a write or reporting failure.
            var readHeaders = request.Headers.Where(header =>
                    header.Key is "authorization" or "x-panel-config-version")
                .ToDictionary(header => header.Key, header => header.Value);
            var saved = await restored.Request(request with { Method = "GET", Body = [], Headers = readHeaders }, token);
            if (saved.Status == 401) return saved;
            if (saved.Status == 200 && saved.Headers.TryGetValue("etag", out var generation) &&
                (!request.Headers.TryGetValue("x-panel-config-version", out var version) ||
                 saved.Headers.GetValueOrDefault("x-panel-config-version") == version))
            {
                if (saved.Body.AsSpan().SequenceEqual(request.Body)) return saved;
                if (generation == request.Headers.GetValueOrDefault("if-match"))
                    return await restored.Request(request, token);
            }
            return new(409, new Dictionary<string, string>(), "The display’s layout changed. Export the unsaved layout before reloading."u8.ToArray());
        }
    }

    private async Task<UsbEditorClient> WaitForDisplay(CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(90));
        try
        {
            while (true)
            {
                if (current() is { Connected: true } client) return client;
                await Task.Delay(250, deadline.Token);
            }
        }
        catch (OperationCanceledException e) when (!token.IsCancellationRequested)
        {
            throw new IOException("The USB display did not reconnect.", e);
        }
    }

    private static bool ConnectionError(Exception exception) =>
        exception is IOException or HttpRequestException or WebSocketException or InvalidOperationException;

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        await lifetime.CancelAsync();
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try { await app.StopAsync(deadline.Token); }
        catch (OperationCanceledException) { }
        finally
        {
            await app.DisposeAsync();
            lifetime.Dispose();
        }
    }

    private const string Page = """
        <!doctype html><html lang="en"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>EspDesktop USB Editor</title>
        <style>
        .card:has(.sp-reset-options), .card:has(#sp-fw-previous-panel) { display: none !important; }
        #usb-message { position: fixed; z-index: 10000; right: 1rem; bottom: 1rem;
          padding: .75rem; background: Canvas; color: CanvasText; border: 1px solid GrayText; }
        </style></head><body><esp-app></esp-app>
        <aside id="usb-message" hidden><span id="usb-status"></span>
        <button id="usb-export" type="button" hidden>Export unsaved layout</button>
        <button id="usb-retry" type="button" hidden>Retry loading</button></aside>
        <script>
        (() => {
          // The display editor falls back to its local snapshot when SSE is unavailable.
          window.EventSource = undefined;
          const panel = document.querySelector('#usb-message');
          const status = document.querySelector('#usb-status');
          const exportButton = document.querySelector('#usb-export');
          const retryButton = document.querySelector('#usb-retry');
          const request = window.fetch.bind(window);
          let draft = null, failedDraft = false;
          const show = (message, retry = false) => {
            status.textContent = message; panel.hidden = false;
            exportButton.hidden = !draft; retryButton.hidden = !retry;
          };
          retryButton.onclick = () => location.reload();
          exportButton.onclick = () => {
            if (!draft) return;
            const url = URL.createObjectURL(new Blob([draft]));
            const link = document.createElement('a');
            link.href = url; link.download = 'Unsaved EspDesktop Layout.bin'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          };
          window.addEventListener('beforeunload', event => {
            if (draft && failedDraft) { event.preventDefault(); event.returnValue = ''; }
          });
          window.fetch = async (input, init) => {
            const outgoing = new Request(input, init);
            const url = new URL(outgoing.url);
            if (url.origin !== location.origin) throw new TypeError('The USB editor is offline.');
            if (outgoing.method !== 'PUT' || url.pathname !== '/api/v1/config') return request(outgoing);
            const saving = await outgoing.clone().arrayBuffer();
            draft = saving; failedDraft = true;
            try {
              const result = await request(outgoing);
              if (result.ok && draft === saving) { draft = null; failedDraft = false; panel.hidden = true; }
              else if (draft === saving) show('The layout save was not confirmed.');
              return result;
            } catch (error) {
              if (draft === saving) show('The layout save was not confirmed. Check the USB connection.');
              throw error;
            }
          };
          const script = document.createElement('script');
          script.src = '/0.js';
          script.onerror = () => show('Couldn’t load the editor. Check the USB cable and display firmware.', true);
          document.head.append(script);
        })();
        </script></body></html>
        """;
}
