using System.Diagnostics;
using System.Net.WebSockets;
using System.Text.Json;

namespace EspDesktop.Core;

internal sealed partial class ObsConnection
{
    private sealed record CoughHold(object Owner, long Touched, bool Restore);
    private readonly Dictionary<Guid, CoughHold> coughs = [];
    private (Guid Id, bool Muted)? expectedMute;
    private bool sawExpectedMute;

    private static bool FreshCough(CoughHold hold) => Stopwatch.GetElapsedTime(hold.Touched) < TimeSpan.FromSeconds(1);

    private static Guid? ControlTarget(string id, string prefix) =>
        id.StartsWith(prefix, StringComparison.Ordinal) &&
        Guid.TryParseExact(id[prefix.Length..], "D", out var target) && id == $"{prefix}{target:D}" ? target : null;

    public IEnumerable<AudioValue> AudioValues()
    {
        if (snapshot == null) yield break;
        foreach (var input in inputs)
        {
            if (input.Level is { } level) yield return new($"obs.level.{input.Id:D}", level);
            yield return new($"obs.cough.{input.Id:D}", input.Muted ? 100 : 0);
        }
    }

    public async Task<bool> SetAudioValue(string id, int value, object owner, Func<bool> locked, CancellationToken token)
    {
        if (value is < 0 or > 100) return false;
        await requestGate.WaitAsync(token);
        try
        {
            if (socket is not { State: WebSocketState.Open } client || snapshot == null || locked()) return false;
            using var deadline = Deadline(connectionToken);
            var generation = collectionGeneration;
            bool CanSend() => !locked() && !token.IsCancellationRequested && generation == collectionGeneration &&
                !changingCollection && ReferenceEquals(client, socket);
            if (ControlTarget(id, "obs.level.") is { } target)
            {
                if (!inputs.Any(input => input.Id == target && input.Level != null) ||
                    !await CollectionMatches(client, deadline.Token) || !CanSend()) return false;
                var fields = value == 0 ? (object)new { inputUuid = target, inputVolumeMul = 0.0 } :
                    new { inputUuid = target, inputVolumeDb = (value - 80) * (value <= 80 ? 1.25 : 1.3) };
                var accepted = await Request(client, "SetInputVolume", fields, deadline.Token) != null;
                var level = await ReadLevel(client, target, deadline.Token);
                inputs = inputs.Select(input => input.Id == target ? input with { Level = level } : input).ToArray();
                if (level == null) CatalogueChanged?.Invoke();
                return accepted && level != null;
            }
            return ControlTarget(id, "obs.cough.") is { } mic && inputs.Any(input => input.Id == mic) &&
                await SetCough(client, mic, value, owner, CanSend, deadline.Token);
        }
        catch (Exception exception) when (IsConnectionFailure(exception)) { return false; }
        finally { requestGate.Release(); }
    }

    private async Task<bool> SetCough(ClientWebSocket client, Guid mic, int value, object owner,
        Func<bool> canSend, CancellationToken token)
    {
        if (BreakUsesMic(mic)) return false;
        var hold = coughs.GetValueOrDefault(mic);
        if (hold != null && !FreshCough(hold))
        {
            coughs.Remove(mic);
            hold = null;
        }
        if (value == 50 && hold != null && ReferenceEquals(hold.Owner, owner))
        {
            coughs[mic] = hold with { Touched = Stopwatch.GetTimestamp() };
            return true;
        }
        if (value == 100 && hold == null)
        {
            if (!await CollectionMatches(client, token) || await ReadMute(client, mic, token) is not { } wasMuted ||
                !canSend()) return false;
            var accepted = wasMuted || await SetMute(client, mic, true, token);
            if (accepted && canSend())
                coughs[mic] = new(owner, Stopwatch.GetTimestamp(), !wasMuted && sawExpectedMute);
            return accepted;
        }
        if (value != 0 || hold == null || !ReferenceEquals(hold.Owner, owner)) return false;
        if (!hold.Restore) { coughs.Remove(mic); return true; }
        try
        {
            return await CollectionMatches(client, token) && await ReadMute(client, mic, token) == true &&
                coughs.TryGetValue(mic, out var current) && current == hold && FreshCough(hold) && canSend() &&
                await SetMute(client, mic, false, token);
        }
        finally { coughs.Remove(mic); }
    }

    public void AbandonCoughs() => coughs.Clear();

    public void AbandonDisplay(object owner)
    {
        foreach (var id in coughs.Keys.Where(id => ReferenceEquals(coughs[id].Owner, owner)).ToArray())
            coughs.Remove(id);
    }

    private async Task<bool?> ReadMute(ClientWebSocket client, Guid mic, CancellationToken token) =>
        await Request(client, "GetInputMute", new { inputUuid = mic }, token) is { } result ? Flag(result, "inputMuted") : null;

    private async Task<bool> SetMute(ClientWebSocket client, Guid mic, bool muted, CancellationToken token)
    {
        expectedMute = (mic, muted);
        sawExpectedMute = false;
        try
        {
            var accepted = await Request(client, "SetInputMute", new { inputUuid = mic, inputMuted = muted }, token) != null;
            var confirmed = await ReadMute(client, mic, token);
            if (confirmed is { } current)
            {
                inputs = inputs.Select(input => input.Id == mic ? input with { Muted = current } : input).ToArray();
                CatalogueChanged?.Invoke();
            }
            return accepted && confirmed == muted;
        }
        finally { expectedMute = null; }
    }

    private void ObserveMute(Guid mic, bool? muted)
    {
        if (muted is { } state && expectedMute == (mic, state) && !sawExpectedMute)
        {
            sawExpectedMute = true;
            return;
        }
        if (coughs.TryGetValue(mic, out var hold)) coughs[mic] = hold with { Restore = false };
        if (BreakUsesMic(mic)) AbandonBreak();
    }

    private async Task<int?> ReadLevel(ClientWebSocket client, Guid id, CancellationToken token)
    {
        var response = await Request(client, "GetInputVolume", new { inputUuid = id }, token);
        if (response is not { ValueKind: JsonValueKind.Object } result) return null;
        if (Number(result, "inputVolumeMul") == 0) return 0;
        if (Number(result, "inputVolumeDb") is not { } db || !double.IsFinite(db)) return null;
        return Math.Clamp((int)Math.Round(80 + Math.Clamp(db, -100, 26) / (db <= 0 ? 1.25 : 1.3),
            MidpointRounding.AwayFromZero), 1, 100);
    }

    private static double? Number(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Number &&
        value.TryGetDouble(out var number) ? number : null;
}
