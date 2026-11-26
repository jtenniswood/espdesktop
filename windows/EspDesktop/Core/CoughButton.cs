using System.Diagnostics;

namespace EspDesktop.Core;

internal sealed class CoughButton : IDisposable
{
    private static readonly TimeSpan HoldTimeout = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan HoldCheck = TimeSpan.FromMilliseconds(100);
    private readonly object gate = new();
    private readonly Dictionary<object, long> holds = new(ReferenceEqualityComparer.Instance);
    private readonly Dictionary<string, bool> previousMutes = new(StringComparer.Ordinal);
    private readonly Func<Dictionary<string, bool>, bool> muteDefaultInput;
    private readonly Action<Dictionary<string, bool>> restoreInputs;
    private readonly Timer timer;
    private bool disposed;

    public CoughButton(Func<Dictionary<string, bool>, bool> muteDefaultInput,
        Action<Dictionary<string, bool>> restoreInputs)
    {
        this.muteDefaultInput = muteDefaultInput;
        this.restoreInputs = restoreInputs;
        timer = new Timer(_ => CheckHolds());
    }

    public bool Set(int value, object session, Func<bool> canHold)
    {
        lock (gate)
        {
            if (disposed) return false;
            ExpireHolds();
            if (value == 0)
            {
                if (holds.Remove(session) && holds.Count == 0) Restore();
                return true;
            }

            // A delayed renewal may arrive after the original hold has ended.
            if (value is not (50 or 100) || (value == 50 && !holds.ContainsKey(session)) || !canHold())
                return false;
            var muted = muteDefaultInput(previousMutes);
            if (holds.Count == 0)
            {
                if (!muted) return false;
                timer.Change(HoldCheck, HoldCheck);
            }
            holds[session] = Stopwatch.GetTimestamp();
            return true;
        }
    }

    public void ReleaseAll()
    {
        lock (gate)
        {
            if (disposed) return;
            holds.Clear();
            Restore();
        }
    }

    private void CheckHolds()
    {
        lock (gate)
        {
            if (disposed) return;
            if (holds.Count == 0) Restore();
            else ExpireHolds();
        }
    }

    private void ExpireHolds()
    {
        if (holds.Count == 0) return;
        var now = Stopwatch.GetTimestamp();
        foreach (var (session, renewed) in holds)
        {
            if (Stopwatch.GetElapsedTime(renewed, now) >= HoldTimeout) holds.Remove(session);
        }
        if (holds.Count == 0) Restore();
    }

    private void Restore()
    {
        if (previousMutes.Count > 0) restoreInputs(previousMutes);
        // An endpoint may have been unplugged. Keep its original state until it returns.
        var delay = previousMutes.Count == 0 ? Timeout.InfiniteTimeSpan : HoldTimeout;
        timer.Change(delay, Timeout.InfiniteTimeSpan);
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
            Restore();
            holds.Clear();
            disposed = true;
            timer.Dispose();
        }
    }
}
