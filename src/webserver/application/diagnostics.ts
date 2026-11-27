/**
 * Opt-in web editor diagnostics.
 *
 * Disabled by default. When off, callers pay one cached boolean check and
 * nothing is formatted or logged. Enable from Settings → System, with
 * ?diagnostics=1 in the address, or with window.espdesktopDiagnostics.enable().
 */
const STORAGE_KEY = "espdesktop-diagnostics";
let enabled = false;
let initialized = false;

function storage(): Storage | null {
    try {
        return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
        return null;
    }
}

function initialize(): void {
    if (initialized) return;
    initialized = true;
    try {
        enabled = storage()?.getItem(STORAGE_KEY) === "1";
    } catch {
        enabled = false;
    }
    try {
        if (typeof window === "undefined") return;
        const flag = new URLSearchParams(window.location.search).get("diagnostics");
        if (flag === "1" || flag === "on") {
            enabled = true;
            storage()?.setItem(STORAGE_KEY, "1");
        } else if (flag === "0" || flag === "off") {
            enabled = false;
            storage()?.removeItem(STORAGE_KEY);
        }
        (window as any).espdesktopDiagnostics = {
            get enabled() { return enabled; },
            enable: () => setDiagnosticsEnabled(true),
            disable: () => setDiagnosticsEnabled(false),
        };
    } catch {
        // Keep the stored value when the URL cannot be read.
    }
}

export function diagnosticsEnabled(): boolean {
    if (!initialized) initialize();
    return enabled;
}

export function setDiagnosticsEnabled(value: boolean): void {
    if (!initialized) initialize();
    enabled = value;
    try {
        if (value) storage()?.setItem(STORAGE_KEY, "1");
        else storage()?.removeItem(STORAGE_KEY);
    } catch {
        // Storage can be unavailable in private windows; the session value still works.
    }
    try {
        console.info(value
            ? "[EspDesktop] Diagnostics enabled. Reproduce the issue, then copy this console output."
            : "[EspDesktop] Diagnostics disabled.");
    } catch {
        // Ignore a missing console.
    }
}

export function diagnostics(event: string, details?: () => Record<string, unknown>): void {
    if (!diagnosticsEnabled()) return;
    try {
        console.debug("[EspDesktop diagnostics] " + event, details ? details() : undefined);
    } catch {
        // Diagnostics must never break the editor.
    }
}
