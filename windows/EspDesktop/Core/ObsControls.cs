using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;
using static EspDesktop.Core.Protocol;

namespace EspDesktop.Core;

internal sealed partial class ObsConnection
{
    private sealed record Input(Guid Id, string Name, bool Muted, int? Level);
    private sealed record Source(int Id, string Key, string Name, bool Enabled);
    private sealed record Output(string Id, string Request, string Label, string? Detail = null);
    private sealed record SwitchState(bool Active, string Presentation, string Label, bool Ready, Guid Token);
    private sealed record PendingSwitch(bool Expected, long Started);

    private static readonly Output[] Outputs =
    [
        new("stream", "Stream", "Stream", "outputReconnecting"),
        new("record", "Record", "Recording", "outputPaused"),
        new("virtualcam", "VirtualCam", "Virtual Camera")
    ];
    private static readonly Output ReplayBuffer = new("replay", "ReplayBuffer", "Replay Buffer");

    private string collection = "";
    private bool changingCollection;
    private int collectionGeneration;
    private Input[] inputs = [];
    private Source[]? sources;
    private Guid? sourceScene;
    private Guid sourceToken;
    private readonly Dictionary<string, SwitchState> switches = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> outputTransitions = new(StringComparer.Ordinal);
    private readonly Dictionary<string, PendingSwitch> pendingSwitches = new(StringComparer.Ordinal);
    private string replayState = "replay_ready";
    private long replayChanged;
    private bool replayEvent;

    public Func<bool>? RaiseMultiview { get; set; }

    private void ResetControls()
    {
        AbandonBreak();
        collection = "";
        changingCollection = false;
        inputs = [];
        sources = null;
        sourceScene = null;
        switches.Clear();
        outputTransitions.Clear();
        pendingSwitches.Clear();
        AbandonCoughs();
        replayState = "replay_ready";
    }

    private async Task<string> ReadCollection(ClientWebSocket client, CancellationToken token) =>
        await Request(client, "GetSceneCollectionList", null, token) is { } result
            ? Text(result, "currentSceneCollectionName") : "";

    private async Task<bool> RefreshControls(ClientWebSocket client, Guid? scene, CancellationToken token)
    {
        var nextCollection = await ReadCollection(client, token);
        if (changingCollection) return true;
        var collectionChanged = collection != nextCollection;
        if (collectionChanged)
        {
            AbandonBreak();
            AbandonCoughs();
            collection = nextCollection;
            sourceToken = Guid.NewGuid();
        }

        var oldInputs = inputs;
        inputs = await ReadInputs(client, token);
        var mixerChanged = !oldInputs.Select(input => (input.Id, input.Name, input.Muted, HasLevel: input.Level != null))
            .SequenceEqual(inputs.Select(input => (input.Id, input.Name, input.Muted, HasLevel: input.Level != null)));
        if (mixerChanged || collectionChanged) BreakChanged();
        if (!oldInputs.Select(input => (input.Id, input.Name)).SequenceEqual(inputs.Select(input => (input.Id, input.Name))))
            BreakSettingsChanged?.Invoke();

        var newSources = scene is { } target ? await ReadSources(client, target, token) : null;
        if (sourceScene != scene || (sources == null) != (newSources == null) ||
            (sources != null && newSources != null && !sources.SequenceEqual(newSources)))
        {
            sourceScene = scene;
            sources = newSources;
            sourceToken = Guid.NewGuid();
            CatalogueChanged?.Invoke();
        }

        foreach (var output in Outputs) await ReadSwitch(client, output, token);
        await ReadSwitch(client, ReplayBuffer, token);
        if (switches.GetValueOrDefault(ReplayBuffer.Id)?.Active != true)
            SetReplayState("replay_ready");
        else if (replayState == "replay_saving" && Stopwatch.GetElapsedTime(replayChanged).TotalSeconds >= 8)
            SetReplayState("replay_unconfirmed");
        else if ((replayState is "replay_saved" or "replay_unconfirmed") &&
                 Stopwatch.GetElapsedTime(replayChanged).TotalSeconds >= 5)
            SetReplayState("replay_ready");
        foreach (var id in coughs.Keys.Where(id => !FreshCough(coughs[id])).ToArray()) coughs.Remove(id);
        return collectionChanged;
    }

    private async Task<Input[]> ReadInputs(ClientWebSocket client, CancellationToken token)
    {
        var response = await Request(client, "GetInputList", null, token);
        if (response is not { ValueKind: JsonValueKind.Object } list ||
            !list.TryGetProperty("inputs", out var entries) || entries.ValueKind != JsonValueKind.Array) return [];

        var result = new List<Input>();
        foreach (var entry in entries.EnumerateArray().Take(40))
        {
            if (SceneId(entry, "inputUuid") is not { } id || result.Any(input => input.Id == id) ||
                Discovery.FriendlyName(Text(entry, "inputName")) is not { } name ||
                await ReadMute(client, id, token) is not { } muted) continue;
            result.Add(new(id, name, muted, await ReadLevel(client, id, token)));
        }
        return result.ToArray();
    }

    private async Task<SwitchState?> ReadSwitch(ClientWebSocket client, Output output, CancellationToken token)
    {
        var response = await Request(client, $"Get{output.Request}Status", null, token);
        if (response is not { } result || Flag(result, "outputActive") is not { } active)
        {
            if (switches.Remove(output.Id)) CatalogueChanged?.Invoke();
            pendingSwitches.Remove(output.Id);
            return null;
        }

        var detail = output.Detail is { } field ? Flag(result, field) : false;
        var pending = pendingSwitches.GetValueOrDefault(output.Id);
        if (pending != null && ((pending.Expected == active && (output.Id != "stream" || detail == false)) ||
                                Stopwatch.GetElapsedTime(pending.Started).TotalSeconds >= 8))
        {
            pendingSwitches.Remove(output.Id);
            pending = null;
        }
        var inFlight = outputTransitions.GetValueOrDefault(output.Id);
        var starting = inFlight == "OBS_WEBSOCKET_OUTPUT_STARTING";
        var stopping = inFlight == "OBS_WEBSOCKET_OUTPUT_STOPPING";
        var (presentation, label) = (output.Id, active, detail, stopping ? false : starting ? true : pending?.Expected) switch
        {
            ("stream", _, true, _) => ("output_reconnecting", "Reconnecting"),
            ("record", _, _, false) => ("output_stopping", "Stopping"),
            (_, true, _, not null) => ("output_changing_live", "Changing"),
            (_, false, _, not null) => ("output_changing", "Changing"),
            ("record", true, true, _) => ("output_paused", "Paused"),
            ("stream", true, _, _) => ("output_live", "Live"),
            (_, true, _, _) => ("output_active", "Active"),
            _ => ("output_idle", "Idle")
        };
        var ready = pending == null && !starting && !stopping && detail.HasValue && (output.Id != "stream" || detail == false);
        var previous = switches.GetValueOrDefault(output.Id);
        if (previous != null && previous.Active == active && previous.Presentation == presentation && previous.Ready == ready)
            return previous;
        var current = new SwitchState(active, presentation, label, ready, Guid.NewGuid());
        switches[output.Id] = current;
        CatalogueChanged?.Invoke();
        return current;
    }

    private IEnumerable<CatalogueItem> ControlCatalogue(Snapshot state, uint capability)
    {
        var studioId = state.TransitionIdle ? $"obs.studio.{state.Token:D}" : "obs.studio";
        yield return new(studioId, state.StudioMode ? "On" : "Off",
            capability >= 21 ? state.StudioMode ? "toggle_on" : "toggle_off" : null,
            ObsAvailable: capability >= 21 ? state.TransitionIdle : null);
        yield return new("obs.multiview", "Multiview");
        foreach (var input in inputs)
        {
            yield return new($"obs.mute.{input.Id:D}", $"{(input.Muted ? "Muted" : "Unmuted")} · {input.Name}",
                capability >= 21 ? input.Muted ? "audio_muted" : "audio_live" : null);
            if (capability >= 14 && input.Level != null) yield return new($"obs.level.{input.Id:D}", input.Name);
            if (capability >= 16) yield return new($"obs.cough.{input.Id:D}", input.Name);
        }

        foreach (var output in Outputs)
        {
            if (!switches.TryGetValue(output.Id, out var status)) continue;
            if (output.Id != "virtualcam" || capability >= 17)
                yield return new($"obs.status.{output.Id}", $"{output.Label} · {status.Label}",
                    capability >= 21 ? status.Presentation : null);
            if (status.Active && output.Id != "virtualcam")
                yield return new($"obs.{output.Id}.active", status.Label);
            if (capability < 17) continue;
            var id = $"obs.output.{output.Id}";
            yield return new(status.Ready ? $"{id}.{status.Token:D}" : id, status.Label,
                capability >= 21 ? status.Presentation : null, ObsAvailable: capability >= 21 ? status.Ready : null);
        }

        if (switches.TryGetValue(ReplayBuffer.Id, out var replay))
        {
            var id = replay.Ready ? $"obs.replay.buffer.{replay.Token:D}" : "obs.replay.buffer";
            yield return new(id, replay.Active ? "On" : "Off",
                capability >= 21 ? replay.Active ? "toggle_on" : "toggle_off" : null,
                ObsAvailable: capability >= 21 ? replay.Ready : null);
            if (replay.Active)
                yield return new("obs.replay", replayState switch
                {
                    "replay_saved" => "Saved",
                    "replay_saving" => "Saving",
                    "replay_unconfirmed" => "Replay not confirmed",
                    _ => "Ready"
                }, capability >= 21 ? replayState : null,
                    ObsAvailable: capability >= 21 ? replayState != "replay_saving" && replay.Ready : null);
        }

        if (capability >= 18 && BreakCard(state) is { } card)
            yield return capability >= 21 ? card : card with { ObsState = null, ObsAvailable = null };

        if (capability >= 21 && sources != null)
        {
            yield return new("obs.sources", state.Scenes.FirstOrDefault(scene => scene.Id == sourceScene)?.Name ?? "Sources");
            foreach (var source in sources)
            {
                var id = $"obs.source.{source.Key}";
                yield return new(state.TransitionIdle ? $"{id}.{sourceToken:D}" : id, source.Name,
                    source.Enabled ? "source_visible" : "source_hidden", ObsAvailable: state.TransitionIdle);
                if (source.Enabled) yield return new($"obs.source.visible.{source.Key}", source.Name);
            }
        }
    }

    private static bool IsExtendedAction(string action) =>
        action is "obs.multiview" or "obs.replay" || action.StartsWith("obs.studio.", StringComparison.Ordinal) ||
        action.StartsWith("obs.output.", StringComparison.Ordinal) || action.StartsWith("obs.replay.buffer.", StringComparison.Ordinal) ||
        action.StartsWith("obs.mute.", StringComparison.Ordinal) || action.StartsWith("obs.brb.", StringComparison.Ordinal) ||
        action.StartsWith("obs.source.", StringComparison.Ordinal);

    private async Task<bool> PerformControl(ClientWebSocket client, Snapshot state, string action,
        Func<bool> canSend, CancellationToken token)
    {
        if (action == "obs.multiview")
            return canSend() && (RaiseMultiview?.Invoke() == true ||
                await Request(client, "OpenVideoMixProjector",
                    new { videoMixType = "OBS_WEBSOCKET_VIDEO_MIX_TYPE_MULTIVIEW", monitorIndex = -1 }, token) != null);

        if (action == "obs.replay")
        {
            if (replayState == "replay_saving" ||
                await ReadSwitch(client, ReplayBuffer, token) is not { Active: true, Ready: true } || !canSend()) return false;
            replayEvent = false;
            SetReplayState("replay_saving");
            var accepted = await Request(client, "SaveReplayBuffer", null, token) != null;
            if (!accepted) SetReplayState("replay_unconfirmed");
            else if (replayEvent) SetReplayState("replay_saved");
            return accepted;
        }

        foreach (var output in Outputs)
            if (action.StartsWith($"obs.output.{output.Id}.", StringComparison.Ordinal))
                return await ChangeSwitch(client, output, $"obs.output.{output.Id}", action, canSend, token);

        if (action.StartsWith("obs.replay.buffer.", StringComparison.Ordinal))
            return await ChangeSwitch(client, ReplayBuffer, "obs.replay.buffer", action, canSend, token);

        if (ControlTarget(action, "obs.mute.") is { } mic && inputs.Any(input => input.Id == mic))
            return !coughs.ContainsKey(mic) && !BreakUsesMic(mic) &&
                await CollectionMatches(client, token) && await ReadMute(client, mic, token) is { } muted && canSend() &&
                await SetMute(client, mic, !muted, token);

        if (!state.TransitionIdle || changingBreak) return false;
        if (action == $"obs.studio.{state.Token:D}")
        {
            var mode = await Request(client, "GetStudioModeEnabled", null, token);
            if (mode is not { } response || Flag(response, "studioModeEnabled") != state.StudioMode ||
                !await TransitionIdle(client, token) || !canSend()) return false;
            if (await Request(client, "SetStudioModeEnabled", new { studioModeEnabled = !state.StudioMode }, token) == null) return false;
            await RefreshScenes(client, token);
            return true;
        }

        if (action == $"obs.brb.{breakToken:D}" && BreakCard(state)?.Id == action)
            return await ToggleBreak(client, state, canSend, token);

        if (sourceScene is not { } scene || sources?.FirstOrDefault(item =>
                action == $"obs.source.{item.Key}.{sourceToken:D}") is not { } source) return false;
        var freshMode = await Request(client, "GetStudioModeEnabled", null, token);
        var focused = await Request(client, state.StudioMode ? "GetCurrentPreviewScene" : "GetCurrentProgramScene", null, token);
        if (freshMode is not { } currentMode || Flag(currentMode, "studioModeEnabled") != state.StudioMode ||
            focused is not { } focusedScene || SceneId(focusedScene, "sceneUuid") != scene ||
            (await ReadSources(client, scene, token))?.Contains(source) != true ||
            !await CollectionMatches(client, token) ||
            !await TransitionIdle(client, token) || !canSend()) return false;
        if (await Request(client, "SetSceneItemEnabled",
            new { sceneUuid = scene, sceneItemId = source.Id, sceneItemEnabled = !source.Enabled }, token) == null) return false;
        sourceToken = Guid.NewGuid();
        await RefreshScenes(client, token);
        return true;
    }

    private async Task<bool> ChangeSwitch(ClientWebSocket client, Output output, string id, string action,
        Func<bool> canSend, CancellationToken token)
    {
        if (!switches.TryGetValue(output.Id, out var shown) || !shown.Ready || action != $"{id}.{shown.Token:D}" ||
            await ReadSwitch(client, output, token) != shown || !canSend()) return false;
        var command = (shown.Active ? "Stop" : "Start") + output.Request;
        var accepted = await Request(client, command, null, token) != null;
        if (accepted)
        {
            pendingSwitches[output.Id] = new(!shown.Active, Stopwatch.GetTimestamp());
            switches[output.Id] = shown with { Token = Guid.NewGuid(), Ready = false };
            CatalogueChanged?.Invoke();
        }
        await ReadSwitch(client, output, token);
        return accepted;
    }

    private async Task<Source[]?> ReadSources(ClientWebSocket client, Guid scene, CancellationToken token)
    {
        var response = await Request(client, "GetSceneItemList", new { sceneUuid = scene }, token);
        if (response is not { ValueKind: JsonValueKind.Object } result ||
            !result.TryGetProperty("sceneItems", out var items) || items.ValueKind != JsonValueKind.Array) return null;
        var sources = new List<Source>();
        foreach (var item in items.EnumerateArray().Reverse())
        {
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("sceneItemId", out var number) ||
                number.ValueKind != JsonValueKind.Number || !number.TryGetInt32(out var id) || id < 0 ||
                Flag(item, "sceneItemEnabled") is not { } visible ||
                Discovery.FriendlyName(Text(item, "sourceName")) is not { } label) continue;
            var identity = Text(item, "sourceUuid");
            if (identity.Length == 0) identity = Text(item, "sourceName");
            sources.Add(new(id, Hash(FormattableString.Invariant($"{scene:D}:{id}:{identity}"))[..32], label, visible));
            if (sources.Count == 48) break;
        }
        return sources.ToArray();
    }

    private async Task<bool> CollectionMatches(ClientWebSocket client, CancellationToken token) =>
        collection.Length != 0 && !changingCollection &&
        await ReadCollection(client, token) == collection && !changingCollection;

    private void SetReplayState(string value)
    {
        if (replayState == value) return;
        replayState = value;
        replayChanged = Stopwatch.GetTimestamp();
        CatalogueChanged?.Invoke();
    }

    private void ObserveEvent(JsonElement message)
    {
        var type = Text(message, "eventType");
        if (type == "ReplayBufferSaved" && replayState == "replay_saving")
        {
            replayEvent = true;
            SetReplayState("replay_saved");
        }
        if (type is "CurrentSceneCollectionChanging" or "CurrentSceneCollectionChanged")
        {
            collectionGeneration++;
            changingCollection = type == "CurrentSceneCollectionChanging";
            snapshot = null;
            inputs = [];
            sources = null;
            sourceScene = null;
            CatalogueChanged?.Invoke();
            BreakSettingsChanged?.Invoke();
            AbandonBreak();
            AbandonCoughs();
        }
        if (!message.TryGetProperty("eventData", out var data)) return;
        var outputId = type switch
        {
            "StreamStateChanged" => "stream",
            "RecordStateChanged" => "record",
            "VirtualcamStateChanged" => "virtualcam",
            "ReplayBufferStateChanged" => ReplayBuffer.Id,
            _ => null
        };
        if (outputId != null)
        {
            var state = Text(data, "outputState");
            if (state is "OBS_WEBSOCKET_OUTPUT_STARTING" or "OBS_WEBSOCKET_OUTPUT_STOPPING")
                outputTransitions[outputId] = state;
            else
                outputTransitions.Remove(outputId);
        }
        if (type == "InputMuteStateChanged" && SceneId(data, "inputUuid") is { } mic)
            ObserveMute(mic, Flag(data, "inputMuted"));
        if (type == "CurrentProgramSceneChanged" && activeBreak != null &&
            SceneId(data, "sceneUuid") != (expectedBreakProgram ?? activeBreak.Choice.Scene))
            AbandonBreak();
    }
}
