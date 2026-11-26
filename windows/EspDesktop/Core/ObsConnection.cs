using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using static EspDesktop.Core.Protocol;

namespace EspDesktop.Core;

internal sealed partial class ObsConnection
{
    private sealed record Scene(Guid Id, string Name);
    private sealed record TransitionList(string Current, string[] Names);
    private sealed record Snapshot(Scene[] Scenes, Guid? Program, Guid? Preview, bool StudioMode, Guid Token,
        bool TransitionIdle, TransitionList? Transitions, Guid ProductionToken)
    {
        public string TakeState => !StudioMode ? "take_studio_off" : !TransitionIdle ? "take_transitioning" :
            Preview == null || Program == null ? "take_no_preview" : Preview == Program ? "take_same_scene" : "take_ready";
    }
    private readonly SemaphoreSlim requestGate = new(1);
    private ClientWebSocket? socket;
    private Snapshot? snapshot;
    private CancellationToken connectionToken;
    public string Status { get; private set; } = "Disconnected";
    public event Action? CatalogueChanged;
    public event Action? StatusChanged;

    public async Task Run(int port, string password, CancellationToken token)
    {
        connectionToken = token;
        while (!token.IsCancellationRequested)
        {
            using var client = new ClientWebSocket();
            client.Options.Proxy = new WebProxy();
            client.Options.KeepAliveInterval = TimeSpan.FromSeconds(15);
            try
            {
                UpdateStatus("Connecting to OBS…");
                using (var deadline = Deadline(token))
                {
                    await client.ConnectAsync(new Uri($"ws://127.0.0.1:{port}"), deadline.Token);
                    await Identify(client, password, deadline.Token);
                }
                socket = client;
                while (!token.IsCancellationRequested)
                {
                    await requestGate.WaitAsync(token);
                    try
                    {
                        using var deadline = Deadline(token);
                        await RefreshScenes(client, deadline.Token);
                        UpdateStatus("Connected to OBS");
                    }
                    finally { requestGate.Release(); }
                    await Task.Delay(TimeSpan.FromSeconds(1), token);
                }
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
            catch (Exception exception) when (IsConnectionFailure(exception))
            {
                UpdateStatus("OBS unavailable. Check its WebSocket port and password. Retrying…");
            }
            finally
            {
                socket = null;
                var wasConnected = snapshot != null;
                snapshot = null;
                ResetControls();
                if (wasConnected) CatalogueChanged?.Invoke();
                BreakSettingsChanged?.Invoke();
            }
            try { await Task.Delay(TimeSpan.FromSeconds(3), token); }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
        }
        UpdateStatus("Disconnected");
    }

    public IEnumerable<CatalogueItem> Catalogue(uint capability)
    {
        if (capability < 13 || snapshot is not { } state) yield break;
        foreach (var entry in ControlCatalogue(state, capability)) yield return entry;
        var selected = state.StudioMode ? state.Preview : state.Program;
        foreach (var scene in state.Scenes)
        {
            var presentation = capability < 20 ? null : (state.StudioMode, scene.Id == state.Program, scene.Id == state.Preview) switch
            {
                (false, true, _) => "scene_live",
                (true, true, true) => "scene_program_preview",
                (true, true, false) => "scene_program",
                (true, false, true) => "scene_preview",
                _ => "scene_idle"
            };
            if (capability >= 19)
                yield return new($"obs.target.{scene.Id:D}.{state.Token:D}", scene.Name, presentation);
            // Preview and Program IDs also support older saved cards.
            yield return new(state.StudioMode ? $"obs.preview.{scene.Id:D}" : $"obs.scene.{scene.Id:D}", scene.Name, presentation);
        }
        if (selected is { } active) yield return new($"obs.selected.{active:D}", "Selected OBS scene");
        if (state.Program is { } program)
        {
            yield return new($"obs.program.{program:D}", "OBS Program scene");
            var name = state.Scenes.FirstOrDefault(scene => scene.Id == program)?.Name;
            if (name != null) yield return new("obs.status.program", $"Program · {name}");
        }
        var ready = state.TakeState == "take_ready";
        var takeDetail = state.TakeState switch
        {
            "take_ready" => state.Scenes.FirstOrDefault(scene => scene.Id == state.Preview)?.Name ?? "Ready",
            "take_studio_off" => "Enable Studio Mode",
            "take_no_preview" => "Choose a preview",
            "take_same_scene" => "Already on Program",
            _ => "Transitioning"
        };
        yield return new(ready ? $"obs.take.{state.ProductionToken:D}" : "obs.take", $"Take Live · {takeDetail}",
            capability >= 20 ? state.TakeState : null, capability >= 20 && ready ? takeDetail : null, capability >= 20 ? ready : null);
        if (state.Transitions is { } transitions)
        {
            yield return new(state.TransitionIdle && transitions.Names.Length > 1 ?
                $"obs.transition.{state.ProductionToken:D}" : "obs.transition", transitions.Current);
            foreach (var name in transitions.Names)
            {
                var id = TransitionId(name);
                yield return new(state.TransitionIdle ? $"{id}.{state.ProductionToken:D}" : id, name,
                    capability >= 21 ? name == transitions.Current ? "transition_selected" : "transition_idle" : null);
                if (name == transitions.Current) yield return new("obs.transition.selected", id);
            }
        }
    }

    public async Task<bool> Select(string action, Func<bool> isLocked, CancellationToken token)
    {
        await requestGate.WaitAsync(token);
        try
        {
            if (socket is not { State: WebSocketState.Open } client || snapshot is not { } state || isLocked())
                return false;
            using var deadline = Deadline(connectionToken);
            var generation = collectionGeneration;
            bool CanSend() => ReferenceEquals(socket, client) && generation == collectionGeneration &&
                !changingCollection && !isLocked() && !token.IsCancellationRequested;
            if (IsExtendedAction(action)) return await PerformControl(client, state, action, CanSend, deadline.Token);
            if (action.StartsWith("obs.take.", StringComparison.Ordinal) || action.StartsWith("obs.transition.", StringComparison.Ordinal))
                return await PerformProduction(client, state, action, CanSend, deadline.Token);
            var parts = action.Split('.');
            if (parts.Length is < 3 or > 4 || parts[0] != "obs" ||
                !Guid.TryParseExact(parts[2], "D", out var scene) || !state.Scenes.Any(entry => entry.Id == scene))
                return false;
            var matches = parts[1] switch
            {
                "target" => parts.Length == 4 && parts[3] == state.Token.ToString("D"),
                "scene" => parts.Length == 3 && !state.StudioMode,
                "preview" => parts.Length == 3 && state.StudioMode,
                _ => false
            };
            if (!matches) return false;

            // The socket is shared by all displays. A display disconnect should
            // cancel its command, without interrupting another display's OBS link.
            var mode = await Request(client, "GetStudioModeEnabled", null, deadline.Token);
            if (mode is not { } response || Flag(response, "studioModeEnabled") != state.StudioMode || !CanSend())
                return false;
            var command = state.StudioMode ? "SetCurrentPreviewScene" : "SetCurrentProgramScene";
            return await Request(client, command, new { sceneUuid = scene }, deadline.Token) != null;
        }
        catch (Exception exception) when (IsConnectionFailure(exception)) { return false; }
        finally { requestGate.Release(); }
    }

    private async Task<bool> PerformProduction(ClientWebSocket client, Snapshot state, string action,
        Func<bool> canSend, CancellationToken token)
    {
        var suffix = $".{state.ProductionToken:D}";
        if (!state.TransitionIdle || !action.EndsWith(suffix, StringComparison.Ordinal)) return false;
        var id = action[..^suffix.Length];
        if (!await TransitionIdle(client, token)) return false;
        if (id == "obs.take")
        {
            if (state.TakeState != "take_ready") return false;
            var mode = await Request(client, "GetStudioModeEnabled", null, token);
            if (mode is not { } studio || Flag(studio, "studioModeEnabled") != true) return false;
            var preview = await Request(client, "GetCurrentPreviewScene", null, token);
            var program = await Request(client, "GetCurrentProgramScene", null, token);
            if (preview is not { } next || SceneId(next, "sceneUuid") != state.Preview ||
                program is not { } live || SceneId(live, "sceneUuid") != state.Program || !canSend()) return false;
            if (await Request(client, "TriggerStudioModeTransition", null, token) == null) return false;
            if (ReferenceEquals(socket, client))
            {
                snapshot = state with { TransitionIdle = false, ProductionToken = Guid.NewGuid() };
                CatalogueChanged?.Invoke();
            }
            return true;
        }

        if (state.Transitions is not { } shown || await ReadTransitions(client, token) is not { } fresh ||
            shown.Current != fresh.Current || !shown.Names.SequenceEqual(fresh.Names)) return false;
        var nextTransition = id == "obs.transition" && fresh.Names.Length > 1
            ? fresh.Names[(Array.IndexOf(fresh.Names, fresh.Current) + 1) % fresh.Names.Length]
            : fresh.Names.FirstOrDefault(name => TransitionId(name) == id);
        if (nextTransition == null || !canSend()) return false;
        return nextTransition == fresh.Current ||
            await Request(client, "SetCurrentSceneTransition", new { transitionName = nextTransition }, token) != null;
    }

    private async Task RefreshScenes(ClientWebSocket client, CancellationToken token)
    {
        var collectionRevision = collectionGeneration;
        var mode = await Request(client, "GetStudioModeEnabled", null, token);
        var result = await Request(client, "GetSceneList", null, token);
        if (changingCollection || collectionRevision != collectionGeneration) return;
        if (mode is not { } studio || result is not { } list ||
            Flag(studio, "studioModeEnabled") is not { } enabled ||
            !list.TryGetProperty("scenes", out var scenes) || scenes.ValueKind != JsonValueKind.Array)
            throw new IOException("OBS did not return its scene list.");
        var targets = new List<Scene>();
        // Match the display's OBS catalogue capacity and UUID-based saved cards.
        foreach (var entry in scenes.EnumerateArray().Take(40))
        {
            if (Guid.TryParseExact(Text(entry, "sceneUuid"), "D", out var id) &&
                Discovery.FriendlyName(Text(entry, "sceneName")) is { } name)
                targets.Add(new(id, name));
        }
        var program = SceneId(list, "currentProgramSceneUuid");
        var preview = SceneId(list, "currentPreviewSceneUuid");
        var idle = await TransitionIdle(client, token);
        var transitions = await ReadTransitions(client, token);
        var collectionChanged = await RefreshControls(client, enabled ? preview : program, token);
        if (changingCollection || collectionRevision != collectionGeneration) return;
        var previous = snapshot;
        var sameTargets = !collectionChanged && previous != null && previous.StudioMode == enabled && previous.Scenes.SequenceEqual(targets);
        if (sameTargets && previous!.Program == program && previous.Preview == preview && previous.TransitionIdle == idle &&
            previous.Transitions?.Current == transitions?.Current &&
            (transitions == null || previous.Transitions!.Names.SequenceEqual(transitions.Names))) return;
        snapshot = new(targets.ToArray(), program, preview, enabled, sameTargets ? previous!.Token : Guid.NewGuid(),
            idle, transitions, Guid.NewGuid());
        BreakChanged();
        if (!sameTargets) BreakSettingsChanged?.Invoke();
    }

    private static string TransitionId(string name) => "obs.transition.select." + Hash(name)[..32];

    private async Task<bool> TransitionIdle(ClientWebSocket client, CancellationToken token)
    {
        var result = await Request(client, "GetCurrentSceneTransitionCursor", null, token);
        return result is { ValueKind: JsonValueKind.Object } response && response.TryGetProperty("transitionCursor", out var cursor) &&
            cursor.ValueKind == JsonValueKind.Number && cursor.GetDouble() == 1;
    }

    private async Task<TransitionList?> ReadTransitions(ClientWebSocket client, CancellationToken token)
    {
        var result = await Request(client, "GetSceneTransitionList", null, token);
        if (result is not { ValueKind: JsonValueKind.Object } response ||
            !response.TryGetProperty("transitions", out var choices) || choices.ValueKind != JsonValueKind.Array) return null;
        var current = Text(response, "currentSceneTransitionName");
        var names = choices.EnumerateArray().Select(choice => Text(choice, "transitionName")).Where(name => name.Length != 0)
            .GroupBy(name => name, StringComparer.Ordinal).Where(group => group.Count() == 1).Select(group => group.Key).ToArray();
        return names.Contains(current, StringComparer.Ordinal) ? new(current, names) : null;
    }

    private void UpdateStatus(string status)
    {
        if (Status == status) return;
        Status = status;
        StatusChanged?.Invoke();
    }

    private static async Task Identify(ClientWebSocket client, string password, CancellationToken token)
    {
        var hello = await Receive(client, 0, token);
        var identify = new Dictionary<string, object> { ["rpcVersion"] = 1, ["eventSubscriptions"] = 2 | 4 | 8 | 64 };
        if (hello.TryGetProperty("authentication", out var authentication))
        {
            var secret = Digest(password + Text(authentication, "salt"));
            identify["authentication"] = Digest(secret + Text(authentication, "challenge"));
        }
        await Send(client, 1, identify, token);
        await Receive(client, 2, token);
    }

    private async Task<JsonElement?> Request(ClientWebSocket client, string request, object? fields, CancellationToken token)
    {
        var id = Guid.NewGuid().ToString("N");
        var data = new Dictionary<string, object> { ["requestType"] = request, ["requestId"] = id };
        if (fields != null) data["requestData"] = fields;
        await Send(client, 6, data, token);
        var reply = await Receive(client, 7, token, ObserveEvent);
        if (Text(reply, "requestId") != id || Text(reply, "requestType") != request ||
            !reply.TryGetProperty("requestStatus", out var status))
            throw new IOException("OBS returned an unexpected response.");
        if (Flag(status, "result") != true) return null;
        return reply.TryGetProperty("responseData", out var response) ? response : default(JsonElement);
    }

    private static Task Send(ClientWebSocket client, int op, object data, CancellationToken token) =>
        client.SendAsync(JsonSerializer.SerializeToUtf8Bytes(new { op, d = data }), WebSocketMessageType.Text, true, token);

    private static async Task<JsonElement> Receive(ClientWebSocket client, uint opcode, CancellationToken token, Action<JsonElement>? onEvent = null)
    {
        var buffer = new byte[8192];
        while (true)
        {
            using var message = new MemoryStream();
            while (true)
            {
                var result = await client.ReceiveAsync(buffer.AsMemory(), token);
                if (result.MessageType != WebSocketMessageType.Text || message.Length + result.Count > 1024 * 1024)
                    throw new IOException("OBS closed the WebSocket or sent an invalid message.");
                message.Write(buffer, 0, result.Count);
                if (result.EndOfMessage) break;
            }
            using var json = JsonDocument.Parse(message.ToArray());
            var envelope = json.RootElement;
            if (envelope.ValueKind != JsonValueKind.Object || !envelope.TryGetProperty("op", out var op) ||
                op.ValueKind != JsonValueKind.Number || !op.TryGetUInt32(out var received) ||
                !envelope.TryGetProperty("d", out var data) || data.ValueKind != JsonValueKind.Object)
                throw new IOException("Unexpected OBS WebSocket message.");
            if (received == opcode) return data.Clone();
            if (received != 5 || onEvent == null) throw new IOException("Unexpected OBS WebSocket opcode.");
            onEvent(data);
        }
    }

    private static Guid? SceneId(JsonElement data, string key) => Guid.TryParseExact(Text(data, key), "D", out var id) ? id : null;
    private static bool? Flag(JsonElement data, string key) => data.ValueKind == JsonValueKind.Object &&
        data.TryGetProperty(key, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;
    private static string Digest(string data) => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(data)));
    private static bool IsConnectionFailure(Exception exception) => exception is IOException or WebSocketException
        or OperationCanceledException or JsonException or InvalidOperationException;
    private static CancellationTokenSource Deadline(CancellationToken token)
    {
        var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(4));
        return deadline;
    }
}
