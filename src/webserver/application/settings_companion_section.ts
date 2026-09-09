import type { ApplicationDomServices } from "./application_context";
import type { ControlsFieldsFeature } from "./controls_fields";
import type { ControlsShellFeature } from "./controls_shell";

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
        onStatus?: (state: CompanionPairingState) => void,
        defaultCollapsed?: boolean,
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

// Display pages use local HTTP, where the modern Clipboard API may be unavailable.
export async function copyCompanionCode(document: Document, navigator: Navigator, code: string): Promise<void> {
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(code);
            return;
        } catch { /* Fall back to copying from a selected field on local HTTP. */ }
    }
    const previousFocus = document.activeElement;
    const field = document.createElement("textarea");
    field.value = code;
    field.readOnly = true;
    field.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(field);
    try {
        field.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
    } finally {
        field.remove();
        if (previousFocus && "focus" in previousFocus) (previousFocus as HTMLElement).focus();
    }
}

export function createSettingsCompanionSectionFeature(
    dom: Pick<ApplicationDomServices, "document" | "window" | "fetch">,
    shell: Pick<ControlsShellFeature, "createActionButton" | "showBanner">,
    fields: Pick<ControlsFieldsFeature, "makeCollapsibleCard">,
): SettingsCompanionSectionFeature {
    const { document, window, fetch } = dom;
    const { createActionButton, showBanner } = shell;
    let latestState: CompanionPairingState | null = null;

    async function requestPairing(): Promise<CompanionPairingState> {
        const options: RequestInit = {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "application/json" },
        };
        const response = await fetch("/companion/pairing", options);
        if (!response.ok) throw new Error("Companion pairing is not available on this panel");
        return await response.json() as CompanionPairingState;
    }

    function buildCompanionSettingsCard(
        onStatus?: (state: CompanionPairingState) => void,
        defaultCollapsed = true,
    ): HTMLElement {
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

        const pairingDetails = document.createElement("div");
        pairingDetails.className = "sp-companion-details sp-hidden";
        const pairingCodeRow = document.createElement("div");
        pairingCodeRow.className = "sp-companion-code-row";
        const codeLabel = document.createElement("div");
        codeLabel.className = "sp-companion-code-label";
        codeLabel.textContent = "YOUR PAIRING CODE";
        pairingDetails.appendChild(codeLabel);
        const pairingCode = document.createElement("strong");
        pairingCode.className = "sp-companion-code";
        pairingCodeRow.appendChild(pairingCode);
        const copyButton = createActionButton("sp-action-btn sp-companion-copy", "Copy", "content-copy", "Copy pairing code");
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
                await copyCompanionCode(document, window.navigator, code);
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
        body.appendChild(pairingDetails);

        const status = document.createElement("div");
        status.className = "sp-companion-status";
        status.textContent = "Checking Companion status…";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        body.appendChild(status);

        const resetButton = createActionButton(
            "sp-action-btn sp-delete-btn",
            "Reset pairing",
            "restore",
            "Reset Mac Companion pairing",
        );
        resetButton.classList.add("sp-hidden");
        body.appendChild(resetButton);
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

        function render(value: CompanionPairingState): void {
            if (latestState?.pairing_code !== value.pairing_code || !companionPairingCodeVisible(value)) {
                copyFeedback.textContent = "";
            }
            latestState = value;
            copyButton.disabled = copying || !companionPairingCodeVisible(value);
            if (onStatus) onStatus(value);
            status.textContent = companionPairingStatusText(value);
            status.classList.toggle("sp-companion-status-connected", value.connected);
            pairingCode.textContent = value.pairing_code;
            setHidden(pairingDetails, !companionPairingCodeVisible(value));
            setHidden(instructions, value.connected);
            setHidden(badge, !value.paired);
            setHidden(resetButton, !value.paired);
        }

        async function refreshStatus(): Promise<void> {
            try {
                render(await requestPairing());
            } catch {
                status.textContent = "Companion connection status unavailable";
                status.classList.remove("sp-companion-status-connected");
            }
        }

        requestPairing().then(render).catch(function () {
            status.textContent = "Companion pairing is unavailable";
        });
        const card = fields.makeCollapsibleCard("Mac Companion", body, defaultCollapsed, badge);
        let refreshInProgress = false;
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
