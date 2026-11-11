import type { ApplicationDomServices } from "./application_context";
import type { ControlsShellFeature } from "./controls_shell";
import type { CompanionPairingState, SettingsCompanionSectionFeature } from "./settings_companion_section";

export interface MacCompanionConnectorState {
    available: boolean;
    configured: boolean;
    paired: boolean;
    connected: boolean;
}

export interface ConnectorsStatus {
    onboarding_complete: boolean;
    mac_companion: MacCompanionConnectorState;
}

export interface ConnectorsPageFeature {
    buildPage(parent: HTMLElement): void;
    start(): void;
    companionConfigured(): boolean;
    onStatusChange(callback: () => void): void;
    onCompanionConnectionChange(callback: (connected: boolean) => void): void;
    // Transitional adapters for shared editors while their retired modes are removed.
    homeAssistantConfigured(): boolean;
    homeAssistantConnected(): boolean;
    homeAssistantSettingsAvailable(): boolean;
    homeAssistantCardPickerEnabled(): boolean;
}

export function connectorOnboardingComplete(_status: ConnectorsStatus): boolean {
    // Local controls remain usable without an external connection.
    return true;
}

export function requestedConnectorFromSearch(search: string): "mac_companion" | null {
    const params = new URLSearchParams(search);
    if (params.get("connector") === "mac_companion") return "mac_companion";
    if (params.get("tab") === "connectors" && !params.has("connector")) return "mac_companion";
    return null;
}

export function createConnectorsPageFeature(
    dom: Pick<ApplicationDomServices, "document" | "window" | "fetch">,
    shell: Pick<ControlsShellFeature, "setOnboardingComplete">,
    companionSection: SettingsCompanionSectionFeature,
    companionSupported: boolean,
): ConnectorsPageFeature {
    const { document, window, fetch } = dom;
    let current: ConnectorsStatus | null = null;
    let lastConnection: boolean | null = null;
    let timer: number | null = null;
    let refreshInProgress = false;
    const statusListeners: Array<() => void> = [];
    const connectionListeners: Array<(connected: boolean) => void> = [];

    function fallbackStatus(): ConnectorsStatus {
        return { onboarding_complete: true, mac_companion: {
            available: companionSupported, configured: false, paired: false, connected: false,
        } };
    }
    function applyStatus(value: ConnectorsStatus): void {
        current = value;
        if (lastConnection === null || lastConnection !== value.mac_companion.connected) {
            lastConnection = value.mac_companion.connected;
            connectionListeners.forEach(listener => listener(value.mac_companion.connected));
        }
        shell.setOnboardingComplete(connectorOnboardingComplete(value), false);
        statusListeners.forEach(listener => listener());
    }
    async function refreshStatus(): Promise<void> {
        if (refreshInProgress) return;
        refreshInProgress = true;
        try {
            const response = await fetch("/connectors/status", {
                cache: "no-store", headers: { Accept: "application/json" },
            });
            if (!response.ok) throw new Error("Connector status is unavailable");
            const status = await response.json() as ConnectorsStatus;
            if (!status?.mac_companion || typeof status.mac_companion.paired !== "boolean" ||
                typeof status.mac_companion.connected !== "boolean") throw new Error("Invalid Companion status");
            applyStatus(status);
        } catch {
            if (!current) applyStatus(fallbackStatus());
        } finally { refreshInProgress = false; }
    }
    function applyCompanionStatus(value: CompanionPairingState): void {
        applyStatus({ onboarding_complete: true, mac_companion: {
            available: value.available, configured: value.paired, paired: value.paired, connected: value.connected,
        } });
    }
    function buildPage(parent: HTMLElement): void {
        const page = document.createElement("div");
        page.id = "sp-connectors";
        page.className = "sp-connectors-section";
        const config = document.createElement("div");
        config.className = "sp-connectors-config";
        const heading = document.createElement("h1");
        heading.className = "sp-connectors-heading sp-settings-status-title";
        heading.textContent = "Connectors";
        config.appendChild(heading);
        if (companionSupported) {
            const open = requestedConnectorFromSearch(window.location.search) === "mac_companion";
            config.appendChild(companionSection.buildCompanionSettingsCard(applyCompanionStatus, !open));
        } else {
            const message = document.createElement("p");
            message.className = "sp-connectors-unavailable";
            message.textContent = "No external connectors are available on this display.";
            config.appendChild(message);
        }
        page.appendChild(config);
        parent.appendChild(page);
    }
    function start(): void {
        void refreshStatus();
        if (timer !== null) window.clearInterval(timer);
        timer = window.setInterval(() => { void refreshStatus(); }, 2000);
    }
    return {
        buildPage, start,
        companionConfigured: () => !!current?.mac_companion.paired,
        onStatusChange: callback => { statusListeners.push(callback); },
        onCompanionConnectionChange: callback => { connectionListeners.push(callback); },
        homeAssistantConfigured: () => false,
        homeAssistantConnected: () => false,
        homeAssistantSettingsAvailable: () => false,
        homeAssistantCardPickerEnabled: () => false,
    };
}
