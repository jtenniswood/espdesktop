using System.Text.Json.Serialization;

namespace EspDesktop.Windows;

internal sealed class IracingTelemetryPublisher(
    Func<(RaceSnapshot? Snapshot, bool Fresh)> sample,
    Func<IracingTelemetryMessage, CancellationToken, Task<bool>> trySend,
    Action<bool> liveChanged,
    int protocol)
{
    private bool? lastSentAvailability;
    private bool? lastSampleAvailability;

    public async Task RunAsync(CancellationToken cancellation)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(200));
        do
        {
            await PollAsync(cancellation);
        }
        while (await timer.WaitForNextTickAsync(cancellation));
    }

    internal async Task PollAsync(CancellationToken cancellation)
    {
        var (snapshot, fresh) = sample();
        var available = snapshot is not null;
        if (lastSampleAvailability != available)
        {
            lastSampleAvailability = available;
            liveChanged(available);
        }

        if (available ? fresh : lastSentAvailability != false)
        {
            var message = new IracingTelemetryMessage(protocol, available, snapshot?.FuelLitres,
                snapshot?.Lap, snapshot?.DeltaSeconds, snapshot?.OnPitRoad, snapshot?.Flag);
            if (await trySend(message, cancellation))
                lastSentAvailability = available;
        }
    }
}

internal sealed record IracingTelemetryMessage(
    [property: JsonPropertyName("protocol")] int Protocol,
    [property: JsonPropertyName("available")] bool Available,
    [property: JsonPropertyName("fuelLitres"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] float? FuelLitres,
    [property: JsonPropertyName("lap"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Lap,
    [property: JsonPropertyName("deltaSeconds"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] float? DeltaSeconds,
    [property: JsonPropertyName("onPitRoad"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? OnPitRoad,
    [property: JsonPropertyName("flag"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Flag)
{
    [JsonPropertyName("type")]
    public string Type => "iracing.telemetry";
}
