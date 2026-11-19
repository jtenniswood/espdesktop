export function allowanceState(connected: boolean, now: number, observedAt: number, resetsAt: number | null) {
    if (!observedAt) return "unavailable";
    if (!connected || now <= 1700000000 || now - observedAt > 900 ||
        observedAt - now > 60 || (resetsAt !== null && resetsAt <= now)) return "last_known";
    return resetsAt === null ? "available" : "countdown";
}

export function allowanceTileText(remainingPercent: number, connected: boolean, now: number,
    observedAt: number, resetsAt: number | null) {
    const state = allowanceState(connected, now, observedAt, resetsAt);
    if (state === "unavailable") return { value: "Unavailable", detail: "" };
    const value = remainingPercent + "% left";
    if (state === "last_known") return { value, detail: "Last known" };
    if (state !== "countdown" || resetsAt === null) return { value, detail: "" };
    const seconds = resetsAt - now;
    const hours = Math.floor(seconds / 3600);
    const days = Math.floor(hours / 24);
    const parts = [days ? days + "d" : "", hours % 24 ? hours % 24 + "h" : "",
        hours === 0 ? Math.max(1, Math.floor(seconds / 60)) + "m" : ""];
    return { value, detail: "Resets " + parts.filter(Boolean).join(" ") };
}
