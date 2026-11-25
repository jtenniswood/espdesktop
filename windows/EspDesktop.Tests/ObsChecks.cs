using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EspDesktop.Core;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using static EspDesktop.Core.Protocol;

internal static class ObsChecks
{
    public static async Task Run()
    {
        var scene = Guid.NewGuid();
        Check(CatalogueLabel("Camera, wide | backup") == "Camera  wide   backup",
            "removes display catalogue delimiters from an OBS scene label");
        var previewScene = Guid.NewGuid();
        var studioMode = false;
        var transition = "Cut";
        var takeCount = 0;
        string? selectedBy = null;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var builder = WebApplication.CreateSlimBuilder();
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, 0));
        await using var server = builder.Build();
        server.UseWebSockets();
        server.Map("/", async context =>
        {
            using var socket = await context.WebSockets.AcceptWebSocketAsync();
            try
            {
                await Send(socket, 0, new { rpcVersion = 1, authentication = new { salt = "salt", challenge = "challenge" } });
                var identify = await Receive(socket, 1);
                var expected = Digest(Digest("testsalt") + "challenge");
                Check(Text(identify, "authentication") == expected, "authenticates to OBS with the configured password");
                await Send(socket, 2, new { negotiatedRpcVersion = 1 });
                while (!timeout.IsCancellationRequested)
                {
                    var request = await Receive(socket, 6);
                    var requestType = Text(request, "requestType");
                    object responseData = new { };
                    switch (requestType)
                    {
                        case "GetStudioModeEnabled":
                            responseData = new { studioModeEnabled = Volatile.Read(ref studioMode) };
                            break;
                        case "GetSceneList":
                            responseData = new
                            {
                                currentProgramSceneUuid = scene,
                                currentPreviewSceneUuid = previewScene,
                                scenes = new[] { new { sceneUuid = scene, sceneName = "Starting soon" },
                                    new { sceneUuid = previewScene, sceneName = "Live camera" } }
                            };
                            break;
                        case "GetCurrentSceneTransitionCursor":
                            responseData = new { transitionCursor = 1 };
                            break;
                        case "GetSceneTransitionList":
                            responseData = new { currentSceneTransitionName = transition,
                                transitions = new[] { new { transitionName = "Cut" }, new { transitionName = "Fade" } } };
                            break;
                        case "GetCurrentPreviewScene":
                            responseData = new { sceneUuid = previewScene };
                            break;
                        case "GetCurrentProgramScene":
                            responseData = new { sceneUuid = scene };
                            break;
                        case "TriggerStudioModeTransition":
                            Interlocked.Increment(ref takeCount);
                            break;
                        case "SetCurrentSceneTransition":
                            Volatile.Write(ref transition, Text(request.GetProperty("requestData"), "transitionName"));
                            break;
                        case "SetCurrentProgramScene":
                        case "SetCurrentPreviewScene":
                            Check(request.GetProperty("requestData").GetProperty("sceneUuid").GetGuid() == scene,
                                "switches only the requested scene UUID");
                            Volatile.Write(ref selectedBy, requestType);
                            break;
                        default: throw new InvalidOperationException("Unexpected OBS request " + requestType);
                    }
                    await Send(socket, 7, new
                    {
                        requestType, requestId = Text(request, "requestId"),
                        requestStatus = new { result = true, code = 100 }, responseData
                    });
                }
            }
            catch (WebSocketException) when (socket.State != WebSocketState.Open) { }
            catch (OperationCanceledException) when (timeout.IsCancellationRequested) { }
        });
        await server.StartAsync(timeout.Token);
        var obs = new ObsConnection();
        using var connection = CancellationTokenSource.CreateLinkedTokenSource(timeout.Token);
        var run = obs.Run(new Uri(server.Urls.Single()).Port, "test", connection.Token);
        try
        {
            var target = await Target();
            Check(target.Label == "Starting soon" && target.ObsState == "scene_live", "publishes named scenes and live state");
            Check(!obs.Catalogue(12).Any() && !obs.Catalogue(18).Any(item => item.Id.StartsWith("obs.target.")),
                "uses the panel's supported OBS scene catalogue format");
            Check(obs.Catalogue(22).Any(item => item.Id == "obs.take" && item.ObsState == "take_studio_off"),
                "shows why Take Live is disabled outside Studio Mode");
            var frame = Message("catalogue.page", ("generation", 1), ("page", 0), ("complete", true),
                ("items", new[] { new { id = target.Id, label = target.Label, obsState = target.ObsState } }));
            _ = Serialize(frame, "connected");
            Check(!await obs.Select(target.Id, () => true, timeout.Token) && selectedBy == null,
                "blocks scene switching while Windows is locked");
            Check(await obs.Select(target.Id, () => false, timeout.Token) &&
                Volatile.Read(ref selectedBy) == "SetCurrentProgramScene", "switches Program in normal mode");

            Volatile.Write(ref studioMode, true);
            Check(!await obs.Select(target.Id, () => false, timeout.Token), "rejects commands using the old Studio Mode state");
            var studioTarget = await Target(target.Id);
            Check(await obs.Select(studioTarget.Id, () => false, timeout.Token) &&
                Volatile.Read(ref selectedBy) == "SetCurrentPreviewScene", "selects Preview in Studio Mode");
            var take = obs.Catalogue(22).Single(item => item.Id.StartsWith("obs.take."));
            Check(take.ObsState == "take_ready" && take.ObsDetail == "Live camera", "publishes the preview for Take Live");
            Check(await obs.Select(take.Id, () => false, timeout.Token) && Volatile.Read(ref takeCount) == 1,
                "takes the displayed preview live");
            Check(!await obs.Select(take.Id, () => false, timeout.Token), "rejects a repeated Take Live command");
            while (!obs.Catalogue(22).Any(item => item.Id.StartsWith("obs.transition.") && item.Label == "Cut" &&
                !item.Id.StartsWith("obs.transition.select"))) await Task.Delay(25, timeout.Token);
            var cycle = obs.Catalogue(22).Single(item => item.Id.StartsWith("obs.transition.") &&
                !item.Id.StartsWith("obs.transition.select"));
            Check(await obs.Select(cycle.Id, () => false, timeout.Token) && Volatile.Read(ref transition) == "Fade",
                "cycles to the next OBS transition");
            Check(!await obs.Select(cycle.Id, () => false, timeout.Token), "rejects a stale transition button");
            while (!obs.Catalogue(22).Any(item => item.Id.StartsWith("obs.transition.") && item.Label == "Fade" &&
                !item.Id.StartsWith("obs.transition.select"))) await Task.Delay(25, timeout.Token);
            var cut = obs.Catalogue(22).Single(item => item.Id.StartsWith("obs.transition.select.") && item.Label == "Cut");
            Check(await obs.Select(cut.Id, () => false, timeout.Token) && Volatile.Read(ref transition) == "Cut",
                "selects a named OBS transition directly");
        }
        finally
        {
            await connection.CancelAsync();
            await run;
        }
        Check(!obs.Catalogue(22).Any(), "clears the scene catalogue on disconnect");
        Console.WriteLine("Passed OBS authentication, scene switching, Take Live, transition controls, and disconnect checks.");

        async Task<CatalogueItem> Target(string? previous = null)
        {
            while (true)
            {
                var item = obs.Catalogue(22).FirstOrDefault(item =>
                    item.Id.StartsWith($"obs.target.{scene:D}.", StringComparison.Ordinal) && item.Id != previous);
                if (item != null) return item;
                await Task.Delay(25, timeout.Token);
            }
        }

        async Task<JsonElement> Receive(WebSocket socket, uint opcode)
        {
            var buffer = new byte[4096];
            var result = await socket.ReceiveAsync(buffer.AsMemory(), timeout.Token);
            if (result.MessageType == WebSocketMessageType.Close) throw new WebSocketException("Client disconnected.");
            Check(result.MessageType == WebSocketMessageType.Text && result.EndOfMessage, "OBS test message framing");
            using var data = JsonDocument.Parse(buffer.AsMemory(0, result.Count));
            Check(UInt(data.RootElement, "op") == opcode, "OBS request opcode");
            return data.RootElement.GetProperty("d").Clone();
        }

        Task Send(WebSocket socket, int op, object data) =>
            socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(new { op, d = data }), WebSocketMessageType.Text, true, timeout.Token);
    }

    private static string Digest(string text) => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
