namespace EspDesktop.Core;

// Runs shell and COM work on its own STA thread. Callers await the result, so
// a slow shell extension or COM call never blocks the WPF UI thread.
internal static class Sta
{
    public static Task<T> Run<T>(Func<T> work)
    {
        var completion = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            try { completion.SetResult(work()); }
            catch (Exception e) { completion.SetException(e); }
        }) { IsBackground = true };
        if (OperatingSystem.IsWindows()) thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return completion.Task;
    }
}
