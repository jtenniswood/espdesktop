import { copyTextToClipboard as copyCompanionCode } from "../features/browser_clipboard";
import type { ApplicationDomServices } from "./application_context";
import type { ControlsFieldsFeature } from "./controls_fields";
import type { ControlsShellFeature } from "./controls_shell";

export { copyCompanionCode };

export interface CompanionComputerState {
    id: string;
    name: string;
    connected: boolean;
    primary: boolean;
}

export interface CompanionPairingState {
    available: boolean;
    active: boolean;
    paired: boolean;
    connected: boolean;
    port?: number;
    pairing_code: string;
    mdns_name?: string;
    can_add?: boolean;
    computers?: CompanionComputerState[];
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
    const computers = state.computers ?? [];
    const connected = computers.filter(computer => computer.connected).length;
    if (state.connected) {
        return computers.length > 1
            ? `${connected} of ${computers.length} computers connected`
            : "Companion connected";
    }
    if (state.active && !state.paired) return "Ready to pair";
    if (!state.paired) return "No computer paired";
    return computers.length > 1
        ? `${computers.length} computers paired, none connected`
        : "Companion paired, but not connected";
}

export function companionPairingCodeVisible(state: CompanionPairingState): boolean {
    return state.active && state.pairing_code.trim().length > 0;
}

export function createCompanionPairingDetails(
    { document, window }: Pick<ApplicationDomServices, "document" | "window">,
    createActionButton: ControlsShellFeature["createActionButton"],
): { element: HTMLElement; update(state: CompanionPairingState | null): void } {
    let latestState: CompanionPairingState | null = null;
    const pairingDetails = document.createElement("div");
    pairingDetails.className = "sp-companion-details";
    setHidden(pairingDetails, true);
    const instructions = document.createElement("p");
    instructions.className = "sp-setting-note sp-companion-instructions";
    instructions.textContent = "Open the Companion app on the computer and enter the code.";
    const pairingCodeRow = document.createElement("div");
    pairingCodeRow.className = "sp-companion-code-row";
    const pairingCode = document.createElement("code");
    pairingCode.className = "sp-companion-code";
    pairingCode.dir = "ltr";
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
            if (latestState?.pairing_code === code) copyFeedback.textContent = "Copied";
        } catch {
            if (latestState?.pairing_code === code) copyFeedback.textContent = "Select the code to copy it manually.";
        } finally {
            copying = false;
            copyButton.disabled = !latestState || !companionPairingCodeVisible(latestState);
        }
    });
    pairingDetails.append(instructions, pairingCodeRow, copyFeedback);
    return {
        element: pairingDetails,
        update(state) {
            const visible = !!state && companionPairingCodeVisible(state);
            if (!visible || state.pairing_code !== latestState?.pairing_code) copyFeedback.textContent = "";
            latestState = state;
            copyButton.disabled = copying || !visible;
            const code = visible ? state.pairing_code : "";
            if (pairingCode.textContent !== code) {
                pairingCode.replaceChildren(...Array.from(code, character => {
                    const glyph = document.createElement("span");
                    glyph.className = character === "-" ? "sp-companion-code-dash" : "sp-companion-code-letter";
                    glyph.textContent = character;
                    return glyph;
                }));
            }
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

    async function requestPairing(showOnDisplay = false, addComputer = false): Promise<CompanionPairingState> {
        const options: RequestInit = {
            method: "GET",
            cache: "no-store",
            headers: { Accept: "application/json" },
        };
        const params = new URLSearchParams();
        if (showOnDisplay) params.set("show_on_display", "1");
        if (addComputer) params.set("add", "1");
        const query = params.toString();
        const path = query ? `/companion/pairing?${query}` : "/companion/pairing";
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
        const pairingDetails = createCompanionPairingDetails(dom, createActionButton);
        body.appendChild(pairingDetails.element);

        const status = document.createElement("div");
        status.className = "sp-companion-status";
        status.textContent = "Checking Companion status…";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        body.appendChild(status);

        const computerList = document.createElement("div");
        computerList.className = "sp-companion-computers";
        setHidden(computerList, true);
        body.appendChild(computerList);
        const computerLimitNote = document.createElement("p");
        computerLimitNote.className = "sp-setting-note";
        computerLimitNote.textContent = "Up to two paired computers can stay connected at once.";
        body.appendChild(computerLimitNote);
        let computerSignature = "";

        const actions = document.createElement("div");
        actions.className = "sp-companion-actions";
        body.appendChild(actions);
        const addComputerButton = createActionButton(
            "sp-action-btn",
            "Pair another computer",
            "plus",
            "Pair another computer",
        );
        addComputerButton.classList.add("sp-hidden");
        actions.appendChild(addComputerButton);
        let addingComputer = false;

        async function addComputer(): Promise<void> {
            if (addingComputer || !latestState?.available) return;
            addingComputer = true;
            addComputerButton.disabled = true;
            try {
                render(await requestPairing(true, true));
            } catch {
                showBanner("Could not start pairing another computer.", "error");
            } finally {
                addingComputer = false;
                addComputerButton.disabled = false;
            }
        }
        addComputerButton.addEventListener("click", () => { void addComputer(); });

        async function forgetComputer(computer: CompanionComputerState): Promise<void> {
            if (!window.confirm(
                `Forget ${computer.name}? This disconnects it and removes its pairing. Cards set to this computer will stop working.`,
            )) return;
            try {
                const response = await fetch(
                    `/companion/pairing/forget?computer=${encodeURIComponent(computer.id)}`,
                    { method: "POST", headers: { Accept: "application/json" } },
                );
                if (!response.ok) throw new Error("Companion pairing removal was not accepted");
                showBanner(`${computer.name} forgotten.`, "success");
                await refreshStatus();
            } catch {
                showBanner(`Could not forget ${computer.name}.`, "error");
            }
        }

        function renderComputers(value: CompanionPairingState, visible: boolean): void {
            const computers = visible ? value.computers ?? [] : [];
            const signature = JSON.stringify(computers.map(computer =>
                [computer.id, computer.name, computer.connected, computer.primary])) + (visible ? "1" : "0");
            if (signature === computerSignature) return;
            computerSignature = signature;
            computerList.replaceChildren();
            for (const computer of computers) {
                const row = document.createElement("div");
                row.className = "sp-companion-computer";
                const name = document.createElement("span");
                name.className = "sp-companion-computer-name";
                name.textContent = computer.name + (computer.primary ? " (primary)" : "");
                const state = document.createElement("span");
                state.className = "sp-companion-computer-state";
                state.textContent = computer.connected ? "Connected" : "Offline";
                const forget = createActionButton(
                    "sp-action-btn sp-delete-btn", "Forget", "close", `Forget ${computer.name}`,
                );
                forget.addEventListener("click", () => { void forgetComputer(computer); });
                row.append(name, state, forget);
                computerList.appendChild(row);
            }
            setHidden(computerList, computers.length === 0);
        }
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
                "Clear downloaded app icons? Icons used by cards will be requested again from the connected companion app. Until they arrive, cards may show their custom fallback icons.",
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
            "Reset all pairings",
            "restore",
            "Reset all Companion pairings",
        );
        resetButton.classList.add("sp-hidden");
        actions.appendChild(resetButton);
        let resetInProgress = false;

        async function resetPairing(): Promise<void> {
            if (resetInProgress || !latestState?.paired) return;
            if (!window.confirm(
                "Reset all pairings? This disconnects and removes every paired computer. You will need to pair the display again.",
            )) return;
            resetInProgress = true;
            resetButton.disabled = true;
            try {
                const response = await fetch("/companion/pairing/reset", {
                    method: "POST",
                    headers: { Accept: "application/json" },
                });
                if (!response.ok) throw new Error("Pairing reset was not accepted");
                showBanner("Companion pairings reset.", "success");
                await refreshStatus();
            } catch {
                showBanner("Could not reset Companion pairings.", "error");
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

        const card: HTMLElement = fields.makeCollapsibleCard("Companion", body, defaultCollapsed, badge);

        function render(value: CompanionPairingState): void {
            if (value.connected && !latestState?.connected) {
                card.classList.add("collapsed");
            }
            latestState = value;
            pairingDetails.update(value);
            onStatus?.(value);
            status.textContent = companionPairingStatusText(value);
            status.classList.toggle("sp-companion-status-connected", value.connected);
            setHidden(status, !pairingDetails.element.hidden);
            renderComputers(value, value.paired);
            setHidden(computerLimitNote, !value.paired);
            setHidden(addComputerButton,
                !value.available || !value.paired || value.active || value.can_add === false);
            setHidden(badge, !value.paired);
            setHidden(resetButton, !value.paired);
            setHidden(clearIconCacheButton, !value.available || !value.paired);
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
            setHidden(status, false);
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
