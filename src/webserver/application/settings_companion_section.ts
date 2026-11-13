import { copyTextToClipboard as copyCompanionCode } from "../features/browser_clipboard";
import type { ApplicationDomServices } from "./application_context";
import type { ControlsFieldsFeature } from "./controls_fields";
import type { ControlsShellFeature } from "./controls_shell";

export { copyCompanionCode };

export interface CompanionPairingState {
    available: boolean;
    active: boolean;
    paired: boolean;
    connected: boolean;
    expires_in_seconds: number;
    port?: number;
    pairing_code: string;
    mdns_name?: string;
}

export interface SettingsCompanionSectionFeature {
    buildCompanionSettingsCard(
        onStatus?: (state: CompanionPairingState | null) => void,
        defaultCollapsed?: boolean,
        showOnDisplay?: boolean,
    ): HTMLElement;
}

function setHidden(element: HTMLElement, hidden: boolean): void {
    element.hidden = hidden;
    element.classList.toggle("sp-hidden", hidden);
}

export function companionPairingStatusText(state: CompanionPairingState): string {
    if (state.active) {
        const hours = Math.ceil(state.expires_in_seconds / 3600);
        const minutes = Math.max(1, Math.ceil(state.expires_in_seconds / 60));
        const duration = hours >= 2
            ? hours + (hours === 1 ? " hour" : " hours")
            : minutes + (minutes === 1 ? " minute" : " minutes");
        const pairing = "Pairing is open for about " + duration + ".";
        return state.connected ? "Mac Companion connected. " + pairing : pairing;
    }
    if (state.connected) return "Mac Companion connected";
    return state.paired ? "Mac paired, but not connected" : "No Mac paired";
}

export function companionPairingCodeVisible(state: CompanionPairingState): boolean {
    return !state.paired && state.active && state.pairing_code.trim().length > 0;
}

export function createCompanionPairingDetails(
    { document, window }: Pick<ApplicationDomServices, "document" | "window">,
    createActionButton: ControlsShellFeature["createActionButton"],
): { element: HTMLElement; update(state: CompanionPairingState | null): void } {
    let latestState: CompanionPairingState | null = null;
    const pairingDetails = document.createElement("div");
    pairingDetails.className = "sp-companion-details";
    setHidden(pairingDetails, true);
    const pairingCodeRow = document.createElement("div");
    pairingCodeRow.className = "sp-companion-code-row";
    const codeLabel = document.createElement("div");
    codeLabel.className = "sp-companion-code-label";
    codeLabel.textContent = "YOUR PAIRING CODE";
    pairingDetails.appendChild(codeLabel);
    const pairingCode = document.createElement("strong");
    pairingCode.className = "sp-companion-code";
    pairingCodeRow.appendChild(pairingCode);
    const copyButton = createActionButton(
        "sp-action-btn sp-transfer-copy-btn sp-companion-copy",
        "Copy", "content-copy", "Copy pairing code",
    );
    copyButton.disabled = true;
    pairingCodeRow.appendChild(copyButton);
    const copyFeedback = document.createElement("div");
    copyFeedback.className = "sp-companion-copy-feedback";
    copyFeedback.setAttribute("role", "status");
    copyFeedback.setAttribute("aria-live", "polite");
    let copying = false;
    copyButton.addEventListener("click", async () => {
        if (copying || !latestState || !companionPairingCodeVisible(latestState)) return;
        const code = latestState.pairing_code;
        copying = true;
        copyButton.disabled = true;
        try {
            await copyCompanionCode(document, window.navigator, code, pairingDetails);
            if (latestState?.pairing_code === code) copyFeedback.textContent = "Copied. Paste it into the Mac app.";
        } catch {
            copyFeedback.textContent = "Select the code and press ⌘C on Mac or Ctrl+C to copy.";
        } finally {
            copying = false;
            copyButton.disabled = !latestState || !companionPairingCodeVisible(latestState);
        }
    });
    pairingDetails.appendChild(pairingCodeRow);
    pairingDetails.appendChild(copyFeedback);
    return {
        element: pairingDetails,
        update(state) {
            const visible = !!state && companionPairingCodeVisible(state);
            if (!visible || state.pairing_code !== latestState?.pairing_code) copyFeedback.textContent = "";
            latestState = state;
            copyButton.disabled = copying || !visible;
            const code = visible ? state.pairing_code : "";
            if (pairingCode.textContent !== code) pairingCode.textContent = code;
            setHidden(pairingDetails, !visible);
        },
    };
}

export function createSettingsCompanionSectionFeature(
    dom: Pick<ApplicationDomServices, "document" | "window" | "fetch">,
    shell: Pick<ControlsShellFeature, "createActionButton" | "showBanner">,
    fields: Pick<ControlsFieldsFeature, "makeCollapsibleCard">,
): SettingsCompanionSectionFeature {
    const { document, window, fetch } = dom;
    const { createActionButton, showBanner } = shell;

    async function requestPairing(showOnDisplay = false): Promise<CompanionPairingState> {
        const options: RequestInit = {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "application/json" },
        };
        const path = showOnDisplay ? "/companion/pairing?show_on_display=1" : "/companion/pairing";
        const response = await fetch(path, options);
        if (!response.ok) throw new Error("Companion pairing is not available on this panel");
        const state = await response.json() as CompanionPairingState;
        if (typeof state?.paired !== "boolean" || typeof state.connected !== "boolean" ||
            typeof state.pairing_code !== "string") throw new Error("Invalid Companion pairing state");
        return state;
    }

    function buildCompanionSettingsCard(
        onStatus?: (state: CompanionPairingState | null) => void,
        defaultCollapsed = true,
        showOnDisplay = false,
    ): HTMLElement {
        let latestState: CompanionPairingState | null = null;
        const body = document.createElement("div");
        const instructions = document.createElement("div");
        instructions.className = "sp-connector-instructions";
        const note = document.createElement("p");
        note.className = "sp-setting-note sp-companion-note";
        const heading = document.createElement("h3");
        heading.className = "sp-companion-heading";
        heading.textContent = "Connect your Mac";
        instructions.appendChild(heading);
        note.textContent = "Your display and Mac, working together. Pair once to get started.";
        instructions.appendChild(note);

        const steps = document.createElement("ol");
        steps.className = "sp-connector-steps";
        [
            "Choose this display in the EspDesktop Mac app, or enter its address manually.",
            "Copy the code below, paste it into the app, then select Connect.",
        ].forEach(function (text) {
            const item = document.createElement("li");
            item.textContent = text;
            steps.appendChild(item);
        });
        instructions.appendChild(steps);
        body.appendChild(instructions);

        const pairingDetails = createCompanionPairingDetails(dom, createActionButton);
        body.appendChild(pairingDetails.element);

        const status = document.createElement("div");
        status.className = "sp-companion-status";
        status.textContent = "Checking Companion status…";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        body.appendChild(status);

        const iconCacheNote = document.createElement("p");
        iconCacheNote.className = "sp-setting-note sp-companion-note";
        iconCacheNote.textContent = "Clear downloaded app icons if you need to refresh them. Icons used by your cards will be requested again from the Mac app.";
        body.appendChild(iconCacheNote);
        const actions = document.createElement("div");
        actions.className = "sp-companion-actions";
        body.appendChild(actions);
        const clearIconCacheButton = createActionButton(
            "sp-action-btn sp-delete-btn",
            "Clear app icon cache",
            "trash-can-outline",
            "Clear downloaded app icons",
        );
        clearIconCacheButton.classList.add("sp-hidden");
        actions.appendChild(clearIconCacheButton);
        let clearingIconCache = false;

        async function clearIconCache(): Promise<void> {
            if (clearingIconCache || !latestState?.available) return;
            if (!window.confirm(
                "Clear downloaded app icons? Icons used by cards will be requested again from the connected Mac app. Until they arrive, cards may show their custom fallback icons.",
            )) return;
            clearingIconCache = true;
            clearIconCacheButton.disabled = true;
            try {
                const response = await fetch("/companion/app-icons/clear", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error("App icon cache clear was not accepted");
                document.dispatchEvent(new Event("espdesktop:app-icon-cache-cleared"));
                showBanner("App icon cache cleared. Icons are being requested again.", "success");
            } catch {
                showBanner("Could not clear the app icon cache.", "error");
            } finally {
                clearingIconCache = false;
                clearIconCacheButton.disabled = false;
            }
        }
        clearIconCacheButton.addEventListener("click", () => { void clearIconCache(); });

        const resetButton = createActionButton(
            "sp-action-btn sp-delete-btn sp-destructive-btn",
            "Reset pairing",
            "restore",
            "Reset Mac Companion pairing",
        );
        resetButton.classList.add("sp-hidden");
        actions.appendChild(resetButton);
        let resetInProgress = false;

        async function resetPairing(): Promise<void> {
            if (resetInProgress || !latestState?.paired) return;
            if (!window.confirm(
                "Reset pairing? This will disconnect and remove the saved Mac Companion pairing. You will need to pair the display again.",
            )) return;
            resetInProgress = true;
            resetButton.disabled = true;
            try {
                const response = await fetch("/companion/pairing/reset", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error("Pairing reset was not accepted");
                showBanner("Mac Companion pairing reset.", "success");
                await refreshStatus();
            } catch {
                showBanner("Could not reset Mac Companion pairing.", "error");
            } finally {
                resetInProgress = false;
                resetButton.disabled = false;
            }
        }
        resetButton.addEventListener("click", () => { void resetPairing(); });

        const badge = document.createElement("span");
        badge.className = "sp-card-badge sp-hidden";
        const badgeDot = document.createElement("span");
        badgeDot.className = "sp-card-badge-dot";
        badge.appendChild(badgeDot);
        badge.appendChild(document.createTextNode("ON"));

        const card: HTMLElement = fields.makeCollapsibleCard("Mac Companion", body, defaultCollapsed, badge);

        function render(value: CompanionPairingState): void {
            if (value.connected && !latestState?.connected) {
                card.classList.add("collapsed");
            }
            latestState = value;
            pairingDetails.update(value);
            onStatus?.(value);
            status.textContent = companionPairingStatusText(value);
            status.classList.toggle("sp-companion-status-connected", value.connected);
            setHidden(instructions, value.connected);
            setHidden(badge, !value.paired);
            setHidden(resetButton, !value.paired);
            setHidden(iconCacheNote, !value.available);
            setHidden(clearIconCacheButton, !value.available);
        }

        async function refreshStatus(): Promise<void> {
            try {
                render(await requestPairing());
            } catch {
                showUnavailable("Companion connection status unavailable");
            }
        }

        function showUnavailable(message: string): void {
            pairingDetails.update(null);
            onStatus?.(null);
            status.textContent = message;
            status.classList.remove("sp-companion-status-connected");
        }

        let refreshInProgress = true;
        requestPairing(showOnDisplay).then(render).catch(function () {
            showUnavailable("Companion pairing is unavailable");
        }).finally(function () {
            refreshInProgress = false;
        });
        const refreshTimer = window.setInterval(async function () {
            if (!card.isConnected) {
                window.clearInterval(refreshTimer);
                return;
            }
            if (refreshInProgress) return;
            refreshInProgress = true;
            try {
                await refreshStatus();
            } finally {
                refreshInProgress = false;
            }
        }, 2000);
        return card;
    }

    return { buildCompanionSettingsCard };
}
