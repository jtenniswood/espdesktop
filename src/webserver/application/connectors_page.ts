import type { ApplicationDomServices } from "./application_context";
import type { ControlsFieldsFeature } from "./controls_fields";
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
    homeAssistantConfigured(): boolean;
    homeAssistantCardPickerEnabled(): boolean;
    companionConfigured(): boolean;
    onStatusChange(callback: () => void): void;
}

function setHidden(element: HTMLElement | null, hidden: boolean): void {
    if (!element) return;
    element.hidden = hidden;
    element.classList.toggle("sp-hidden", hidden);
}

export function homeAssistantConnectorStatusText(state: HomeAssistantConnectorState): string {
    if (state.connected) return "Home Assistant connected";
    if (state.configured) return "Home Assistant configured, but currently offline";
    return "Waiting for Home Assistant";
}

export function connectorOnboardingComplete(status: ConnectorsStatus): boolean {
    return !!(status.home_assistant.configured || status.mac_companion.paired);
}

export function homeAssistantPickerAvailable(
    status: ConnectorsStatus | null,
    statusEndpointAvailable: boolean,
): boolean {
    // Old firmware does not expose /connectors/status, so it must retain the
    // established Home Assistant picker. New firmware can use live connection
    // state to hide those cards while Home Assistant is unavailable.
    return !statusEndpointAvailable || status === null ||
        !!status.home_assistant.connected;
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
    fields: Pick<ControlsFieldsFeature, "makeCollapsibleCard">,
    companionSection: SettingsCompanionSectionFeature,
    companionSupported: boolean,
): ConnectorsPageFeature {
    const { document, window, fetch } = dom;
    let heading: HTMLElement | null = null;
    let homeAssistantCard: HTMLElement | null = null;
    let companionCard: HTMLElement | null = null;
    let homeAssistantStatus: HTMLElement | null = null;
    let homeAssistantOfflineInfo: HTMLElement | null = null;
    let homeAssistantInstructions: HTMLElement | null = null;
    let homeAssistantSteps: HTMLElement | null = null;
    let homeAssistantActionInfo: HTMLElement | null = null;
    let homeAssistantConfirmButton: HTMLButtonElement | null = null;
    let homeAssistantForgetButton: HTMLButtonElement | null = null;
    let homeAssistantBadge: HTMLElement | null = null;
    let current: ConnectorsStatus | null = null;
    let statusEndpointAvailable = false;
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
        value.onboarding_complete = connectorOnboardingComplete(value);
        const previous = current;
        const wasComplete = previous?.onboarding_complete === true;
        const announceCompletion = !!previous && !wasComplete && value.onboarding_complete;
        current = value;
        if (homeAssistantCard && companionCard) {
            // Use saved setup state so a temporary disconnect does not reorder cards.
            const companionFirst = value.mac_companion.paired && !value.home_assistant.configured;
            const first = companionFirst ? companionCard : homeAssistantCard;
            const second = companionFirst ? homeAssistantCard : companionCard;
            if (first.nextElementSibling !== second) {
                second.parentElement?.insertBefore(first, second);
            }
        }
        if (homeAssistantStatus) {
            homeAssistantStatus.textContent = homeAssistantConnectorStatusText(value.home_assistant);
            homeAssistantStatus.classList.toggle(
                "sp-connector-status-connected", value.home_assistant.connected);
        }
        const ha = value.home_assistant;
        if (homeAssistantStatus && homeAssistantOfflineInfo?.parentElement) {
            if (ha.configured && !ha.connected) {
                homeAssistantOfflineInfo.insertBefore(homeAssistantStatus, homeAssistantOfflineInfo.firstChild);
            } else {
                homeAssistantOfflineInfo.parentElement.insertBefore(homeAssistantStatus, homeAssistantOfflineInfo);
            }
        }
        // Show only the next relevant step, rather than repeating first-time
        // setup during an outage or offering an action that cannot run yet.
        setHidden(homeAssistantSteps, ha.connected || ha.configured);
        setHidden(homeAssistantOfflineInfo, !ha.configured || ha.connected);
        setHidden(homeAssistantActionInfo, !ha.connected || ha.actions_confirmed);
        if (homeAssistantConfirmButton) {
            homeAssistantConfirmButton.disabled = !value.home_assistant.connected ||
                value.home_assistant.actions_confirmed;
        }
        setHidden(homeAssistantForgetButton, !ha.configured || ha.connected);
        setHidden(homeAssistantInstructions, value.home_assistant.connected &&
            value.home_assistant.actions_confirmed);
        setHidden(homeAssistantBadge, !value.home_assistant.connected);
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
            statusEndpointAvailable = true;
            applyStatus(status);
        } catch {
            if (!current) applyStatus(fallbackStatus());
        } finally {
            refreshInProgress = false;
        }
    }

    function buildHomeAssistantCard(): HTMLElement {
        const body = document.createElement("div");
        body.className = "sp-ha-connector";
        homeAssistantStatus = document.createElement("div");
        homeAssistantStatus.className = "sp-connector-status";
        homeAssistantStatus.setAttribute("role", "status");
        homeAssistantStatus.setAttribute("aria-live", "polite");
        homeAssistantStatus.textContent = "Checking Home Assistant status…";

        homeAssistantOfflineInfo = document.createElement("div");
        homeAssistantOfflineInfo.className = "sp-connector-info sp-ha-offline-info";
        setHidden(homeAssistantOfflineInfo, true);
        homeAssistantOfflineInfo.appendChild(homeAssistantStatus);
        body.appendChild(homeAssistantOfflineInfo);

        homeAssistantInstructions = document.createElement("div");
        homeAssistantInstructions.className = "sp-connector-instructions";
        body.appendChild(homeAssistantInstructions);

        function addParagraph(parent: HTMLElement, text: string): HTMLElement {
            const paragraph = document.createElement("p");
            paragraph.textContent = text;
            parent.appendChild(paragraph);
            return paragraph;
        }
        function addHeading(parent: HTMLElement, text: string): void {
            const heading = document.createElement("h4");
            heading.textContent = text;
            parent.appendChild(heading);
        }

        const setup = document.createElement("div");
        homeAssistantSteps = setup;
        setHidden(setup, true);
        addHeading(setup, "Connect your display");
        const steps = document.createElement("ol");
        steps.className = "sp-ha-setup-steps";
        ([
            ["Open Devices & services", "In Home Assistant, go to Settings → Devices & services."],
            ["Add EspDesktop", "Select the discovered display and finish setup."],
        ] as const).forEach(function ([title, text]) {
            const item = document.createElement("li");
            const label = document.createElement("strong");
            label.textContent = title;
            item.appendChild(label);
            addParagraph(item, text);
            steps.appendChild(item);
        });
        setup.appendChild(steps);
        const fallback = addParagraph(setup, "Not listed? Add ESPHome at: ");
        const address = document.createElement("code");
        address.textContent = window.location.hostname;
        fallback.appendChild(address);
        homeAssistantInstructions.appendChild(setup);

        addParagraph(homeAssistantOfflineInfo, "Check that the device is enabled under Settings → Devices & services → ESPHome.");

        const actionInfo = document.createElement("div");
        homeAssistantActionInfo = actionInfo;
        actionInfo.className = "sp-connector-info";
        setHidden(actionInfo, true);
        addHeading(actionInfo, "Allow Home Assistant actions");
        addParagraph(actionInfo, "In the display’s ESPHome settings, enable:");
        const permission = addParagraph(actionInfo, "");
        const permissionLabel = document.createElement("strong");
        permissionLabel.textContent = "Allow the device to perform Home Assistant actions";
        permission.appendChild(permissionLabel);
        addParagraph(actionInfo, "This lets the display control your devices. Confirm to finish.");
        homeAssistantConfirmButton = document.createElement("button");
        homeAssistantConfirmButton.type = "button";
        homeAssistantConfirmButton.className = "sp-action-btn sp-save-btn";
        homeAssistantConfirmButton.textContent = "I’ve enabled actions";
        homeAssistantConfirmButton.disabled = true;
        homeAssistantConfirmButton.addEventListener("click", async function () {
            if (!current?.home_assistant.connected || !homeAssistantConfirmButton) return;
            homeAssistantConfirmButton.disabled = true;
            try {
                const response = await fetch("/connectors/home-assistant/complete", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error("Home Assistant action permission was not accepted");
                applyStatus(await response.json() as ConnectorsStatus);
            } catch {
                if (homeAssistantConfirmButton) homeAssistantConfirmButton.disabled = false;
            }
        });
        actionInfo.appendChild(homeAssistantConfirmButton);
        homeAssistantInstructions.appendChild(actionInfo);

        homeAssistantForgetButton = document.createElement("button");
        homeAssistantForgetButton.type = "button";
        homeAssistantForgetButton.className = "sp-action-btn sp-delete-btn";
        homeAssistantForgetButton.textContent = "Forget Home Assistant";
        homeAssistantForgetButton.hidden = true;
        homeAssistantForgetButton.addEventListener("click", async function () {
            if (!current?.home_assistant.configured ||
                current.home_assistant.connected || !homeAssistantForgetButton) return;
            homeAssistantForgetButton.disabled = true;
            try {
                const response = await fetch("/connectors/home-assistant/forget", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error("Home Assistant could not be forgotten");
                applyStatus(await response.json() as ConnectorsStatus);
            } catch {
                if (homeAssistantForgetButton) homeAssistantForgetButton.disabled = false;
            }
        });
        addParagraph(homeAssistantOfflineInfo, "Only forget this connection if you want to set up Home Assistant again.");
        homeAssistantOfflineInfo.appendChild(homeAssistantForgetButton);

        homeAssistantBadge = document.createElement("span");
        homeAssistantBadge.className = "sp-card-badge sp-hidden";
        const badgeDot = document.createElement("span");
        badgeDot.className = "sp-card-badge-dot";
        homeAssistantBadge.appendChild(badgeDot);
        homeAssistantBadge.appendChild(document.createTextNode("ON"));
        return fields.makeCollapsibleCard("Home Assistant", body, true, homeAssistantBadge);
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
        homeAssistantCard = buildHomeAssistantCard();
        config.appendChild(homeAssistantCard);
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

    function homeAssistantConfigured(): boolean {
        return !!current?.home_assistant.configured;
    }

    function homeAssistantCardPickerEnabled(): boolean {
        // Preserve the established picker while connector status is loading
        // or when older firmware falls back to Home Assistant support. The
        // configured flag is intentionally not used here because it remains
        // set after a previous connection or an upgrade from older firmware.
        return homeAssistantPickerAvailable(current, statusEndpointAvailable);
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
        homeAssistantConfigured,
        homeAssistantCardPickerEnabled,
        companionConfigured,
        onStatusChange,
    };
}
