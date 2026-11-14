import type { PanelIdentityInfo } from "../model/panel_identity";

export interface AppTitleFeature {
    applyPageTitle(title?: unknown): void;
    handleWebServerPingEvent(event?: { data?: string }): void;
    loadPageTitleFromEventStream(): void;
}

export interface AppTitleDependencies {
    readonly document: Document;
    readonly panelIdentity: () => Pick<PanelIdentityInfo, "name" | "mac_suffix"> | null;
    readonly eventStreamEnabled: () => boolean;
    readonly eventSourceAvailable: () => boolean;
    readonly createEventSource: () => EventSource;
}

export function createAppTitleFeature(dependencies: AppTitleDependencies): AppTitleFeature {
    function applyPageTitle(title?: unknown) {
        const text = typeof title === "string" ? title.trim() : "";
        const identity = dependencies.panelIdentity();
        // Older ESPHome builds append six MAC characters to the friendly name or hostname.
        const legacySuffix = /(?:^|[\s-])([a-f0-9]{6})$/i.exec(text)?.[1];
        const label = identity
            ? identity.name || identity.mac_suffix.slice(-4)
            : legacySuffix?.slice(-4).toLowerCase() || text;
        dependencies.document.title = label ? "EspDesktop - " + label : "EspDesktop";
    }
    function handleWebServerPingEvent(event?: { data?: string }) {
        let data: any = null;
        try {
            data = event?.data ? JSON.parse(event.data) : null;
        }
        catch (_) {
            applyPageTitle();
            return;
        }
        if (data && Object.prototype.hasOwnProperty.call(data, "title"))
            applyPageTitle(data.title);
    }
    function loadPageTitleFromEventStream() {
        if (dependencies.eventStreamEnabled() || !dependencies.eventSourceAvailable())
            return;
        const source = dependencies.createEventSource();
        const closeTimer = setTimeout(() => source.close(), 5000);
        source.addEventListener("ping", (event) => {
            handleWebServerPingEvent(event as MessageEvent);
            clearTimeout(closeTimer);
            source.close();
        });
        source.addEventListener("error", () => {
            clearTimeout(closeTimer);
            source.close();
        });
    }
    return { applyPageTitle, handleWebServerPingEvent, loadPageTitleFromEventStream };
}
