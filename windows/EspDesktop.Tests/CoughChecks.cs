using EspDesktop.Core;

internal static class CoughChecks
{
    public static void Run(Action<bool, string> check)
    {
        var firstDisplay = new object();
        var secondDisplay = new object();
        string? defaultInput = "desk";
        var microphones = new Dictionary<string, bool> { ["desk"] = false, ["headset"] = false };
        using var controller = new CoughButton(
            previous =>
            {
                if (defaultInput is null || !microphones.TryGetValue(defaultInput, out var muted)) return false;
                previous.TryAdd(defaultInput, muted);
                microphones[defaultInput] = true;
                return true;
            },
            previous =>
            {
                foreach (var (id, muted) in previous)
                {
                    if (!microphones.ContainsKey(id)) continue;
                    microphones[id] = muted;
                    previous.Remove(id);
                }
            });
        bool Set(int value, object session, bool unlocked = true) => controller.Set(value, session, () => unlocked);

        check(!Set(50, firstDisplay), "a renewal cannot start a cough hold");
        check(!Set(100, firstDisplay, unlocked: false), "a locked session cannot start a cough hold");
        check(!Set(20, firstDisplay), "reject values outside the cough protocol");
        check(Set(100, firstDisplay) && microphones["desk"], "press mutes the default microphone");
        defaultInput = "headset";
        check(Set(50, firstDisplay) && microphones["headset"] && Set(100, secondDisplay),
            "renewal mutes a different default input and a second display can join the hold");
        check(Set(0, firstDisplay) && microphones["desk"], "one display cannot release another display's hold");
        check(!Set(50, firstDisplay), "ignore late renewals after release");
        check(Set(0, secondDisplay, unlocked: false) && !microphones["desk"] && !microphones["headset"],
            "release while locked restores each input's previous mute state");

        microphones["headset"] = true;
        check(Set(100, firstDisplay) && Set(0, firstDisplay) && microphones["headset"],
            "release preserves an already-muted microphone");
        microphones["headset"] = false;
        check(Set(100, firstDisplay) && microphones["headset"], "mute the newly selected default");
        controller.ReleaseAll();
        check(!microphones["headset"] && !Set(50, firstDisplay), "release on lock or sleep ends all outstanding holds");

        defaultInput = null;
        check(!Set(100, firstDisplay), "refuse a press without a default microphone");
        using var restored = new ManualResetEventSlim();
        // Track a muted endpoint so the timeout must restore it without any further display traffic.
        using var timeout = new CoughButton(previous => previous.TryAdd("desk", false), previous =>
        {
            previous.Clear();
            restored.Set();
        });
        check(timeout.Set(100, firstDisplay, () => true), "start a hold with a missing release");
        check(restored.Wait(TimeSpan.FromSeconds(4)), "a missing release restores mute after the hold expires");
        check(!timeout.Set(50, firstDisplay, () => true), "ignore a renewal after expiry");
        Console.WriteLine("Passed Windows Input Cough hold, release, and timeout checks.");
    }
}
