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
        var microphone = Guid.NewGuid();
        var programScene = scene;
        var inputMuted = false;
        var inputVolumeDb = 0.0;
        var sourceVisible = true;
        var outputs = new Dictionary<string, bool> { ["Record"] = false, ["Stream"] = false, ["VirtualCam"] = false, ["ReplayBuffer"] = false };
        var projectorCount = 0;
        var review = false;
        var studioMode = false;
        var transition = "Cut";
        var takeCount = 0;
        string? selectedBy = null;
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
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
                    var fields = request.TryGetProperty("requestData", out var data) ? data : default;
                    switch (requestType)
                    {
                        case "GetStudioModeEnabled":
                            responseData = new { studioModeEnabled = Volatile.Read(ref studioMode) };
                            break;
                        case "GetSceneList":
                            responseData = new
                            {
                                currentProgramSceneUuid = programScene,
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
                            responseData = new { sceneUuid = programScene };
                            break;
                        case "TriggerStudioModeTransition":
                            Interlocked.Increment(ref takeCount);
                            break;
                        case "SetCurrentSceneTransition":
                            Volatile.Write(ref transition, Text(request.GetProperty("requestData"), "transitionName"));
                            break;
                        case "SetCurrentProgramScene":
                        case "SetCurrentPreviewScene":
                            var destination = fields.GetProperty("sceneUuid").GetGuid();
                            Check(destination == scene || destination == previewScene, "switches only a known scene UUID");
                            if (requestType == "SetCurrentProgramScene")
                            {
                                programScene = destination;
                                await Event(socket, "CurrentProgramSceneChanged", new { sceneUuid = destination });
                            }
                            Volatile.Write(ref selectedBy, requestType);
                            break;
                        case "SetStudioModeEnabled":
                            Volatile.Write(ref studioMode, fields.GetProperty("studioModeEnabled").GetBoolean());
                            break;
                        case "GetSceneCollectionList":
                            responseData = new { currentSceneCollectionName = "Test" };
                            break;
                        case "GetInputList":
                            responseData = new { inputs = new[] { new { inputUuid = microphone, inputName = "Desk mic" } } };
                            break;
                        case "GetInputMute":
                            Check(fields.GetProperty("inputUuid").GetGuid() == microphone, "read the selected OBS microphone");
                            responseData = new { inputMuted };
                            break;
                        case "SetInputMute":
                            Check(fields.GetProperty("inputUuid").GetGuid() == microphone, "mute the selected OBS microphone");
                            inputMuted = fields.GetProperty("inputMuted").GetBoolean();
                            await Event(socket, "InputMuteStateChanged", new { inputUuid = microphone, inputMuted });
                            break;
                        case "GetInputVolume":
                            responseData = new { inputVolumeDb, inputVolumeMul = inputVolumeDb == -100 ? 0.0 : 1.0 };
                            break;
                        case "SetInputVolume":
                            inputVolumeDb = fields.TryGetProperty("inputVolumeDb", out var db) ? db.GetDouble() : -100;
                            break;
                        case "GetSceneItemList":
                            responseData = new { sceneItems = new[] { new { sceneItemId = 9, sourceName = "Camera", sceneItemEnabled = sourceVisible } } };
                            break;
                        case "SetSceneItemEnabled":
                            Check(fields.GetProperty("sceneUuid").GetGuid() == previewScene &&
                                fields.GetProperty("sceneItemId").GetInt32() == 9, "toggle only the requested source on Preview");
                            sourceVisible = fields.GetProperty("sceneItemEnabled").GetBoolean();
                            break;
                        case "OpenVideoMixProjector":
                            Check(Text(fields, "videoMixType") == "OBS_WEBSOCKET_VIDEO_MIX_TYPE_MULTIVIEW", "open the OBS Multiview projector");
                            projectorCount++;
                            break;
                        case "SaveReplayBuffer":
                            await Event(socket, "ReplayBufferSaved", new { savedReplayPath = "Replay.mkv" });
                            break;
                        case var status when status.StartsWith("Get", StringComparison.Ordinal) &&
                             status.EndsWith("Status", StringComparison.Ordinal) && outputs.TryGetValue(status[3..^6], out var active):
                            responseData = new { outputActive = active, outputPaused = false, outputReconnecting = false };
                            break;
                        case var start when start.StartsWith("Start", StringComparison.Ordinal) && outputs.ContainsKey(start[5..]):
                            outputs[start[5..]] = true;
                            break;
                        case var stop when stop.StartsWith("Stop", StringComparison.Ordinal) && outputs.ContainsKey(stop[4..]):
                            outputs[stop[4..]] = false;
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
        var obs = new ObsConnection
        {
            SaveBreakRecovery = value => { review = value; return true; }
        };
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

            const uint current = 23;
            var level = $"obs.level.{microphone:D}";
            var cough = $"obs.cough.{microphone:D}";
            Check(!obs.Catalogue(13).Any(item => item.Id == level) && !obs.Catalogue(15).Any(item => item.Id == cough),
                "filters OBS mixer controls for older panels");
            var owner = new object();
            var other = new object();
            Check(await obs.SetAudioValue(level, 60, owner, () => false, timeout.Token) && inputVolumeDb == -25 &&
                obs.AudioValues().Any(item => item.Id == level && item.Value == 60), "sets and confirms OBS fader levels");
            Check(!await obs.SetAudioValue(level, 80, owner, () => true, timeout.Token), "blocks mixer writes while Windows is locked");
            Check(await Invoke($"obs.mute.{microphone:D}") && inputMuted, "toggles the selected OBS mixer input");
            Check(await obs.SetAudioValue(cough, 100, owner, () => false, timeout.Token) &&
                await obs.SetAudioValue(cough, 0, owner, () => false, timeout.Token) && inputMuted,
                "cough keeps an already-muted input muted");
            Check(await Invoke($"obs.mute.{microphone:D}") && !inputMuted, "unmutes the selected OBS mixer input");
            Check(await obs.SetAudioValue(cough, 100, owner, () => false, timeout.Token) && inputMuted &&
                !await obs.SetAudioValue(cough, 0, other, () => false, timeout.Token) &&
                await obs.SetAudioValue(cough, 50, owner, () => false, timeout.Token) &&
                await obs.SetAudioValue(cough, 0, owner, () => false, timeout.Token) && !inputMuted,
                "only the display holding Cough can release it and restore a live microphone");
            Check(await obs.SetAudioValue(cough, 100, owner, () => false, timeout.Token), "starts another cough hold");
            obs.AbandonDisplay(owner);
            Check(!await obs.SetAudioValue(cough, 0, owner, () => false, timeout.Token) && inputMuted,
                "keeps the microphone muted when the display lost its hold");
            Check(await Invoke($"obs.mute.{microphone:D}"), "restores input for the subsequent tests");

            var source = Control("obs.source.", "source_visible");
            Check(await Invoke(source.Id) && !sourceVisible && !await Invoke(source.Id), "toggles only the displayed source state");
            Check(await Invoke("obs.multiview") && projectorCount == 1, "opens Multiview");

            foreach (var output in new[] { "stream", "record", "virtualcam" })
            {
                var id = "obs.output." + output + ".";
                var off = Control(id, "output_idle");
                Check(off.ObsAvailable == true && !obs.Catalogue(16).Any(item => item.Id == off.Id),
                    "advertises the output on supported panels");
                Check(await Invoke(off.Id) && !await Invoke(off.Id), "starts " + output + " and rejects a stale repeat");
                Check(await Invoke(Control(id, output == "stream" ? "output_live" : "output_active").Id), "stops " + output);
            }

            Check(await Invoke(Control("obs.replay.buffer.", "toggle_off").Id) && await Invoke("obs.replay") &&
                Control("obs.replay", "replay_saved").Label == "Saved", "confirms replay save from the OBS event");
            Check(await Invoke(Control("obs.replay.buffer.", "toggle_on").Id), "stops the replay buffer");

            Check(await Invoke(Control("obs.studio.", "toggle_on").Id) && !studioMode, "toggles Studio Mode from the panel");
            Check(obs.ConfigureBreak("Test", new(previewScene, microphone), () => true), "stores a break setup for the current collection");
            var brb = Control("obs.brb.", "break_start");
            Check(await Invoke(brb.Id) && review && programScene == previewScene && inputMuted && !await Invoke(brb.Id),
                "starts a break safely and rejects the previous tile");
            Check(await Invoke(Control("obs.brb.", "break_resume").Id) && !review && programScene == scene && !inputMuted,
                "resumes Program before restoring the microphone");
            Check(await Invoke(Control("obs.brb.", "break_start").Id) && review, "persists an outstanding break for recovery");

            Task<bool> Invoke(string id) => obs.Select(id, () => false, timeout.Token);
            CatalogueItem Control(string prefix, string state) => obs.Catalogue(current).Single(item =>
                item.Id.StartsWith(prefix, StringComparison.Ordinal) && item.ObsState == state);
        }
        finally
        {
            await connection.CancelAsync();
            await run;
        }
        Check(!obs.Catalogue(22).Any(), "clears the scene catalogue on disconnect");
        Check(review && inputMuted, "leaves an interrupted break muted and marked for review");
        Console.WriteLine("Passed OBS scenes, audio, outputs, replay, sources, Studio Mode, Multiview, and Break checks.");

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

        Task Event(WebSocket socket, string eventType, object eventData) => Send(socket, 5, new { eventType, eventData });

        Task Send(WebSocket socket, int op, object data) =>
            socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(new { op, d = data }), WebSocketMessageType.Text, true, timeout.Token);
    }

    private static string Digest(string text) => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
