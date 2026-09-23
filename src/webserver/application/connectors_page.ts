import type { ApplicationDomServices } from "./application_context";
import type { ControlsShellFeature } from "./controls_shell";
import type {
    CompanionPairingState,
    SettingsCompanionSectionFeature,
} from "./settings_companion_section";

export interface ConnectorConnectionState {
    available: boolean;
    configured: boolean;
    connected: boolean;
}

export interface HomeAssistantConnectorState extends ConnectorConnectionState {
    actions_confirmed: boolean;
}

export interface MacCompanionConnectorState extends ConnectorConnectionState {
    paired: boolean;
}

export interface ConnectorsStatus {
    onboarding_complete: boolean;
    home_assistant: HomeAssistantConnectorState;
    mac_companion: MacCompanionConnectorState;
}

export interface ConnectorsPageFeature {
    buildPage(parent: HTMLElement): void;
    start(): void;
    homeAssistantConnected(): boolean;
    homeAssistantSettingsAvailable(): boolean;
    homeAssistantCardPickerEnabled(): boolean;
    companionConfigured(): boolean;
    onStatusChange(callback: () => void): void;
}

export function homeAssistantConnectorStatusText(state: HomeAssistantConnectorState): string {
    if (state.connected) return "Home Assistant connected";
    if (state.configured) return "Configured but disconnected";
    return "Waiting for Home Assistant";
}

export function connectorOnboardingComplete(status: ConnectorsStatus): boolean {
    // Connector setup is optional: users can configure local controls without
    // enabling an external integration.
    void status;
    return true;
}

export function homeAssistantPickerAvailable(
    status: ConnectorsStatus | null,
    statusEndpointAvailable: boolean,
): boolean {
    void status;
    void statusEndpointAvailable;
    return false;
}

export function requestedConnectorFromSearch(search: string): "mac_companion" | null {
    const params = new URLSearchParams(search);
    if (params.get("connector") === "mac_companion") return "mac_companion";
    // The original pairing URL only selected the Connectors tab. Preserve it
    // as a Mac Companion deep link so links already shown to users keep doing
    // the useful thing after this page gains multiple connector cards.
    if (params.get("tab") === "connectors" && !params.has("connector")) {
        return "mac_companion";
    }
    return null;
}

export function createConnectorsPageFeature(
    dom: Pick<ApplicationDomServices, "document" | "window" | "fetch">,
    shell: Pick<ControlsShellFeature, "setOnboardingComplete">,
    companionSection: SettingsCompanionSectionFeature,
    companionSupported: boolean,
): ConnectorsPageFeature {
    const { document, window, fetch } = dom;
    let heading: HTMLElement | null = null;
    let companionCard: HTMLElement | null = null;
    let current: ConnectorsStatus | null = null;
    const statusListeners: Array<() => void> = [];
    let timer: number | null = null;
    let refreshInProgress = false;

    function fallbackStatus(): ConnectorsStatus {
        return {
            // Older firmware has no connector endpoint. Keep its established
            // configurator usable rather than trapping it in an unfinishable
            // onboarding screen.
            onboarding_complete: true,
            home_assistant: {
                available: true,
                configured: true,
                connected: false,
                actions_confirmed: true,
            },
            mac_companion: {
                available: companionSupported,
                configured: false,
                paired: false,
                connected: false,
            },
        };
    }

    async function requestStatus(): Promise<ConnectorsStatus> {
        const response = await fetch("/connectors/status", {
            cache: "no-store",
            headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Connector status is unavailable");
        return await response.json() as ConnectorsStatus;
    }

    function applyStatus(value: ConnectorsStatus): void {
        value.onboarding_complete = true;
        const previous = current;
        const wasComplete = previous?.onboarding_complete === true;
        const announceCompletion = !!previous && !wasComplete && value.onboarding_complete;
        current = value;
        if (heading) {
            heading.textContent = value.onboarding_complete ? "Connectors" : "Connect EspDesktop";
        }
        shell.setOnboardingComplete(value.onboarding_complete, announceCompletion);
        statusListeners.forEach((listener) => listener());
    }

    async function refreshStatus(): Promise<void> {
        if (refreshInProgress) return;
        refreshInProgress = true;
        try {
            const status = await requestStatus();
            applyStatus(status);
        } catch {
            if (!current) applyStatus(fallbackStatus());
        } finally {
            refreshInProgress = false;
        }
    }

    function applyCompanionStatus(value: CompanionPairingState): void {
        if (!current) return;
        applyStatus({
            ...current,
            mac_companion: {
                available: value.available,
                configured: value.paired,
                paired: value.paired,
                connected: value.connected,
            },
        });
    }

    function buildPage(parent: HTMLElement): void {
        const page = document.createElement("div");
        page.id = "sp-connectors";
        page.className = "sp-page";
        const config = document.createElement("div");
        config.className = "sp-config sp-connectors-config fade-in";
        heading = document.createElement("h1");
        heading.className = "sp-connectors-heading sp-settings-status-title";
        heading.textContent = "Connect EspDesktop";
        config.appendChild(heading);
        if (companionSupported) {
            const openCompanion = requestedConnectorFromSearch(window.location.search) === "mac_companion";
            companionCard = companionSection.buildCompanionSettingsCard(
                applyCompanionStatus,
                !openCompanion,
            );
            config.appendChild(companionCard);
        }
        page.appendChild(config);
        parent.appendChild(page);
    }

    function start(): void {
        void refreshStatus();
        if (timer !== null) window.clearInterval(timer);
        timer = window.setInterval(function () { void refreshStatus(); }, 2000);
    }

    function homeAssistantConnected(): boolean {
        return false;
    }

    function homeAssistantSettingsAvailable(): boolean {
        return false;
    }

    function homeAssistantCardPickerEnabled(): boolean {
        return false;
    }

    function companionConfigured(): boolean {
        return !!current?.mac_companion.paired;
    }

    function onStatusChange(callback: () => void): void {
        statusListeners.push(callback);
    }

    return {
        buildPage,
        start,
        homeAssistantConnected,
        homeAssistantSettingsAvailable,
        homeAssistantCardPickerEnabled,
        companionConfigured,
        onStatusChange,
    };
}
