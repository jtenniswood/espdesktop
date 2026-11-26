using System.Net.WebSockets;

namespace EspDesktop.Core;

internal sealed record ObsBreakChoice(Guid Scene, Guid? Microphone);

internal sealed partial class ObsConnection
{
    private sealed record ActiveBreak(string Collection, Guid Original, ObsBreakChoice Choice, bool RestoreMic);

    private readonly Dictionary<string, ObsBreakChoice> breakChoices = new(StringComparer.Ordinal);
    private ActiveBreak? activeBreak;
    private bool breakReview;
    private bool changingBreak;
    private Guid breakToken;
    private Guid? expectedBreakProgram;

    public event Action? BreakSettingsChanged;
    public Func<bool, bool>? SaveBreakRecovery { get; set; }

    public (string Collection, (Guid Id, string Name)[] Scenes, (Guid Id, string Name)[] Microphones,
        ObsBreakChoice? Choice, bool Reviewing, bool Editable) BreakSettings()
    {
        var state = snapshot;
        return (collection, state?.Scenes.Select(scene => (scene.Id, scene.Name)).ToArray() ?? [],
            inputs.Select(input => (input.Id, input.Name)).ToArray(),
            breakChoices.GetValueOrDefault(collection), breakReview,
            state != null && collection.Length != 0 && activeBreak == null && !changingBreak && !breakReview);
    }

    public void RestoreBreakSettings(IEnumerable<KeyValuePair<string, ObsBreakChoice>> choices, bool review)
    {
        foreach (var (key, value) in choices) breakChoices[key] = value;
        breakReview = review;
    }

    public bool ConfigureBreak(string key, ObsBreakChoice? choice, Func<bool> save)
    {
        if (key != collection || !BreakSettings().Editable ||
            (choice != null && (snapshot?.Scenes.Any(scene => scene.Id == choice.Scene) != true ||
             (choice.Microphone is { } mic && !inputs.Any(input => input.Id == mic))))) return false;
        if (!save()) return false;
        if (choice == null) breakChoices.Remove(key);
        else breakChoices[key] = choice;
        BreakChanged();
        BreakSettingsChanged?.Invoke();
        return true;
    }

    public void AcknowledgeBreak()
    {
        if (!breakReview || changingBreak || SaveBreakRecovery?.Invoke(false) == false) return;
        breakReview = false;
        BreakChanged();
        BreakSettingsChanged?.Invoke();
    }

    private void BreakChanged()
    {
        breakToken = Guid.NewGuid();
        CatalogueChanged?.Invoke();
    }

    private bool BreakUsesMic(Guid mic) => activeBreak?.Choice.Microphone == mic;

    private void AbandonBreak()
    {
        if (activeBreak == null) return;
        activeBreak = null;
        breakReview = true;
        BreakChanged();
        BreakSettingsChanged?.Invoke();
    }

    private CatalogueItem? BreakCard(Snapshot state)
    {
        if (breakReview) return new("obs.brb", "BRB · Check OBS", "break_check", ObsAvailable: false);
        if (changingBreak)
            return new("obs.brb", activeBreak?.Choice.Scene == state.Program ? "Resuming…" : "Starting BRB…",
                "break_transitioning", ObsAvailable: false);
        if (activeBreak is { } current)
            return state.TransitionIdle && current.Choice.Scene == state.Program &&
                   state.Scenes.Any(scene => scene.Id == current.Original)
                ? new($"obs.brb.{breakToken:D}", "Resume", "break_resume", ObsAvailable: true)
                : new("obs.brb", "Resume · Transitioning", "break_resume", ObsAvailable: false);

        if (!breakChoices.TryGetValue(collection, out var choice) ||
            state.Scenes.FirstOrDefault(scene => scene.Id == choice.Scene) is not { } target) return null;
        if (!state.TransitionIdle) return new("obs.brb", "BRB · Transitioning", "break_transitioning", ObsAvailable: false);
        if (state.Program == target.Id) return new("obs.brb", "BRB · Already on break", "break_already", ObsAvailable: false);
        if (state.Program == null || (choice.Microphone is { } mic && !inputs.Any(input => input.Id == mic)))
            return new("obs.brb", "BRB · Unavailable", "break_unavailable", ObsAvailable: false);
        return new($"obs.brb.{breakToken:D}", $"BRB · {target.Name}", "break_start", ObsAvailable: true);
    }

    private async Task<bool> ToggleBreak(ClientWebSocket client, Snapshot state, Func<bool> canSend, CancellationToken token)
    {
        if (state.Program is not { } program || !breakChoices.TryGetValue(collection, out var choice) ||
            (choice.Microphone is { } held && coughs.ContainsKey(held))) return false;
        var returning = activeBreak != null;
        var transaction = activeBreak ?? new(collection, program, choice, false);
        var destination = returning ? transaction.Original : choice.Scene;
        if (transaction.Collection != collection || !await CollectionMatches(client, token) ||
            !await ProgramSettled(client, program, token) || !canSend() ||
            (returning && activeBreak != transaction) || SaveBreakRecovery?.Invoke(true) == false) return false;

        activeBreak = transaction;
        changingBreak = true;
        BreakChanged();
        BreakSettingsChanged?.Invoke();
        bool Valid() => activeBreak != null && activeBreak.Collection == transaction.Collection && !changingCollection && canSend();
        var succeeded = false;
        try
        {
            if (transaction.Choice.Microphone is { } mic)
            {
                var muted = await ReadMute(client, mic, token);
                if (muted == null || !Valid() || (returning && !muted.Value)) return false;
                if (!muted.Value)
                {
                    if (!await SetMute(client, mic, true, token) || !sawExpectedMute || !Valid()) return false;
                    transaction = transaction with { RestoreMic = true };
                    activeBreak = transaction;
                }
            }

            if (!await ProgramSettled(client, program, token) || !Valid()) return false;
            expectedBreakProgram = destination;
            if (await Request(client, "SetCurrentProgramScene", new { sceneUuid = destination }, token) == null)
                return false;
            for (var attempt = 0; attempt < 21; attempt++)
            {
                if (await ProgramSettled(client, destination, token) && Valid())
                {
                    if (returning && transaction.RestoreMic && transaction.Choice.Microphone is { } micToRestore)
                    {
                        if (await ReadMute(client, micToRestore, token) != true ||
                            !await ProgramSettled(client, destination, token) || !Valid() ||
                            !await SetMute(client, micToRestore, false, token) || !Valid()) return false;
                    }
                    if (returning)
                    {
                        if (SaveBreakRecovery?.Invoke(false) == false) return false;
                        activeBreak = null;
                    }
                    succeeded = true;
                    await RefreshScenes(client, token);
                    return true;
                }
                if (!Valid()) return false;
                await Task.Delay(150, token);
            }
            return false;
        }
        finally
        {
            if (!succeeded) AbandonBreak();
            expectedBreakProgram = null;
            changingBreak = false;
            BreakChanged();
            BreakSettingsChanged?.Invoke();
        }
    }

    private async Task<bool> ProgramSettled(ClientWebSocket client, Guid scene, CancellationToken token) =>
        await TransitionIdle(client, token) &&
        await Request(client, "GetCurrentProgramScene", null, token) is { } program && SceneId(program, "sceneUuid") == scene;
}
