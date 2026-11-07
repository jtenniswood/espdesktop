import { createCompanionCatalogue, type CompanionAction } from "../api/companion_catalogue";
import type { PanelConfigDocument } from "../model/panel_config";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import type { ConfigCodecFeature } from "./config_codec";
import type { ConnectorsPageFeature } from "./connectors_page";
import type { ControlsShellFeature } from "./controls_shell";
import {
    companionShortcutPresetCards,
    companionShortcutDefaultTabs,
    companionShortcutTabsForCapacity,
    createCompanionShortcutSubpage,
    replaceCompanionDefinitions,
    setCompanionAppShortcutFolderEnabled,
} from "./companion_shortcut_folder";
import { setConfigOptionValue } from "../model/config_primitives";

export const FIRST_RUN_COMPLETE = "web_onboarding_complete";

/** Only offer setup for an empty display, never over an existing layout. */
export function needsFirstRunSetup(document: PanelConfigDocument): boolean {
    return document.settings[FIRST_RUN_COMPLETE] !== "1" &&
        !Object.values(document.buttons).some(value => value.trim()) &&
        !Object.values(document.subpages).some(value => value.trim()) &&
        !document.settings.button_order?.trim() && !document.settings.special_page?.trim();
}

export function firstRunApplications(actions: readonly CompanionAction[]): CompanionAction[] {
    const unique = new Map<string, CompanionAction>();
    for (const action of actions) {
        if (!action.id.startsWith("folder.") && !action.id.startsWith("shortcut.") &&
            !action.id.startsWith("media.") && !action.id.startsWith("system.") &&
            !action.id.startsWith("window.")) unique.set(action.id, action);
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function supportsSetupShortcuts(id: string): boolean {
    return companionShortcutPresetCards(id).length > 0;
}

/** Build one atomic layout update, rechecking the live document before saving. */
export function firstRunDocument(
    current: PanelConfigDocument,
    apps: readonly CompanionAction[],
    shortcutIDs: ReadonlySet<string>,
    capacity: number,
    codec: Pick<ConfigCodecFeature, "serializeButtonConfig" | "serializeSubpageConfig">,
): PanelConfigDocument {
    if (!needsFirstRunSetup(current)) throw new Error("This display already has a layout. Reload to keep its changes.");
    if (!Number.isInteger(capacity) || capacity < 1 || apps.length > capacity ||
        new Set(apps.map(app => app.id)).size !== apps.length) throw new Error("Choose apps within the display’s card limit.");
    const buttons: Record<number, string> = {};
    const subpages: Record<number, string> = {};
    apps.forEach((app, index) => {
        const card = { entity: app.id, label: app.label, icon: "Auto", icon_on: "Auto",
            sensor: "", unit: "", type: "companion", precision: "", options: "" };
        if (shortcutIDs.has(app.id) && supportsSetupShortcuts(app.id)) {
            const tabs = companionShortcutTabsForCapacity(companionShortcutDefaultTabs(app.id), capacity);
            setCompanionAppShortcutFolderEnabled(card, true);
            card.options = setConfigOptionValue(card.options, "app_shortcuts_tabs", tabs.join("|") || "none");
            subpages[index + 1] = codec.serializeSubpageConfig(createCompanionShortcutSubpage(app.id, tabs));
        }
        buttons[index + 1] = codec.serializeButtonConfig(card);
    });
    return { ...current, buttons, subpages,
        settings: { ...current.settings, button_order: apps.map((_app, index) => String(index + 1)).join(","),
            [FIRST_RUN_COMPLETE]: "1" } };
}

interface FirstRunSetupDependencies {
    document: Document;
    window: Window;
    fetch: typeof fetch;
    capacity: number;
    supported: boolean;
    native: NativePanelConfigController;
    codec: Pick<ConfigCodecFeature, "serializeButtonConfig" | "serializeSubpageConfig">;
    connectors: Pick<ConnectorsPageFeature, "onCompanionConnectionChange">;
    shell: Pick<ControlsShellFeature, "switchTab" | "isConfigLocked" | "showBanner">;
    saveAutoSwitch: (enabled: boolean) => Promise<boolean>;
    onSaved: () => void;
}

export function createFirstRunSetup(deps: FirstRunSetupDependencies): { start(): void } {
    const { document, window } = deps;
    const catalogue = createCompanionCatalogue(deps.fetch);
    let dialog: HTMLDialogElement | null = null;
    let eligible = false;
    let connected = false;
    let step = 1;
    let apps: CompanionAction[] = [];
    const selected = new Set<string>();
    const shortcuts = new Set<string>();
    let autoSwitch = true;
    let busy = false;
    let loading = false;
    let started = false;
    let error = "";
    let query = "";
    let previousFocus: HTMLElement | null = null;

    const selectedApps = () => apps.filter(app => selected.has(app.id));
    const shortcutApps = () => selectedApps().filter(app => supportsSetupShortcuts(app.id));

    function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        node.textContent = text;
        if (className) node.className = className;
        return node;
    }
    function button(text: string, action: () => void, primary = false): HTMLButtonElement {
        const node = element("button", text, "sp-action-btn" + (primary ? " sp-setup-primary" : ""));
        node.type = "button";
        node.disabled = busy;
        node.addEventListener("click", action);
        return node;
    }
    function close(): void {
        dialog?.close();
        dialog?.remove();
        dialog = null;
        previousFocus?.focus();
    }
    function show(): void {
        if (!eligible || dialog) return;
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog = element("dialog", "", "sp-first-run");
        dialog.setAttribute("aria-labelledby", "sp-setup-title");
        dialog.addEventListener("cancel", event => { event.preventDefault(); });
        document.body.appendChild(dialog);
        render();
        dialog.showModal();
        if (connected) void refresh();
    }
    async function refresh(): Promise<void> {
        if (loading || busy) return;
        loading = true;
        error = "";
        render();
        try {
            const [actions] = await Promise.all([
                catalogue.load(true),
                catalogue.loadDefinitions(true).then(definitions => {
                    replaceCompanionDefinitions(definitions.applications, definitions.webApplications);
                }).catch(() => { /* Bundled shortcuts remain available on older firmware. */ }),
            ]);
            apps = firstRunApplications(actions);
            const ids = new Set(apps.map(app => app.id));
            for (const id of selected) if (!ids.has(id)) { selected.delete(id); shortcuts.delete(id); }
        } catch {
            error = "Could not load apps. Check that EspDesktop is connected on your Mac, then try again.";
        } finally {
            loading = false;
            render();
        }
    }
    async function finish(skip = false): Promise<void> {
        if (busy || (loading && !skip)) return;
        if (deps.shell.isConfigLocked()) {
            error = "The display is reconnecting. Wait for it to reconnect, then try again.";
            render();
            return;
        }
        if (!skip && (!connected || selectedApps().length === 0)) return;
        busy = true;
        error = "";
        render();
        try {
            // Save the global switch first. A failure must not mark setup complete.
            if (!skip && !await deps.saveAutoSwitch(shortcuts.size > 0 && autoSwitch)) {
                throw new Error("Could not save automatic switching. Check the connection and try again.");
            }
            const chosen = skip ? [] : selectedApps();
            const result = await deps.native.schedule(current =>
                firstRunDocument(current, chosen, shortcuts, deps.capacity, deps.codec));
            if (result !== "saved") throw new Error("Could not finish setup. Reload the page to check the display’s saved layout before trying again.");
            eligible = false;
            close();
            if (skip) {
                deps.shell.switchTab("screen");
            } else {
                deps.onSaved();
            }
        } catch (failure) {
            error = failure instanceof Error ? failure.message : "Could not save setup. Please try again.";
        } finally {
            busy = false;
            render();
        }
    }
    function checkbox(label: string, checked: boolean, change: (enabled: boolean) => void, disabled = false): HTMLLabelElement {
        const row = element("label", "", "sp-setup-choice");
        const input = element("input");
        input.type = "checkbox";
        input.checked = checked;
        input.disabled = busy || disabled;
        input.addEventListener("change", () => change(input.checked));
        row.append(input, element("span", label));
        return row;
    }
    function render(): void {
        if (!dialog) return;
        const focusWasInside = dialog.contains(document.activeElement);
        const focusKey = document.activeElement?.getAttribute("data-setup-key");
        const selectionStart = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null;
        dialog.replaceChildren();
        const progress = element("p", `Step ${step} of 3`, "sp-setup-progress");
        const title = element("h1", step === 1 ? "Choose your home-screen apps" : step === 2 ? "Add app shortcut pages" : "Switch pages with your apps");
        title.id = "sp-setup-title";
        dialog.append(progress, title);
        dialog.appendChild(element("p", step === 1
            ? `Choose up to ${deps.capacity} apps. You can change these later in Layout.`
            : step === 2 ? "Choose which apps get a page of useful shortcuts. Other apps will simply launch from their card."
            : "Automatically open an app’s shortcut page when that app is in focus on your Mac. This applies to all app shortcut pages."));
        const content = element("div", "", "sp-setup-content");
        if (step === 1) {
            if (!connected) {
                content.appendChild(element("p", "Connect EspDesktop on your Mac to choose from your apps."));
                content.appendChild(button("Connect your Mac", () => { close(); deps.shell.switchTab("device"); }));
            } else {
                const toolbar = element("div", "", "sp-setup-toolbar");
                const search = element("input");
                search.type = "search";
                search.placeholder = "Search apps";
                search.setAttribute("aria-label", "Search apps");
                search.setAttribute("data-setup-key", "search");
                search.value = query;
                search.disabled = busy;
                search.addEventListener("input", () => { query = search.value; render(); });
                toolbar.append(search, button(loading ? "Loading…" : "Refresh apps", () => { void refresh(); }));
                content.appendChild(toolbar);
                const count = element("p", `${selected.size} of ${deps.capacity} apps selected`, "sp-setup-count");
                count.setAttribute("role", "status");
                content.appendChild(count);
                if (!loading && apps.length === 0) content.appendChild(element("p", "No apps are available yet. Check app access in the Mac app, then refresh."));
                const list = element("div", "", "sp-setup-list");
                for (const app of apps.filter(app => app.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) {
                    const row = checkbox(app.label, selected.has(app.id), enabled => {
                        if (enabled && selected.size < deps.capacity) selected.add(app.id);
                        else { selected.delete(app.id); shortcuts.delete(app.id); }
                        render();
                    }, loading || (!selected.has(app.id) && selected.size >= deps.capacity));
                    row.querySelector("input")?.setAttribute("data-setup-key", app.id);
                    list.appendChild(row);
                }
                content.appendChild(list);
            }
        } else if (step === 2) {
            for (const app of shortcutApps()) {
                const row = checkbox(app.label, shortcuts.has(app.id), enabled => {
                    if (enabled) shortcuts.add(app.id); else shortcuts.delete(app.id);
                });
                content.appendChild(row);
            }
            if (shortcutApps().length === 0) content.appendChild(element("p", "Your selected apps don’t have built-in shortcut pages. You can add your own shortcuts later in Layout."));
            const unsupported = selectedApps().filter(app => !supportsSetupShortcuts(app.id));
            if (shortcutApps().length && unsupported.length) content.appendChild(element("p", `Launch only: ${unsupported.map(app => app.label).join(", ")}.`));
            content.appendChild(element("p", `Each shortcut page includes a Back card and up to ${Math.max(0, deps.capacity - 1)} shortcuts. You can edit it later.`));
        } else {
            content.appendChild(checkbox("Open shortcut pages when apps are in focus", autoSwitch && shortcuts.size > 0,
                enabled => { autoSwitch = enabled; }, shortcuts.size === 0));
            content.appendChild(element("p", shortcuts.size > 0
                ? "When this is off, tap an app card while the app is already in focus to open its shortcut page."
                : "No shortcut pages selected. Your app cards will launch their apps."));
            content.appendChild(element("p", `${selected.size} ${selected.size === 1 ? "home-screen app" : "home-screen apps"} · ${shortcuts.size} shortcut ${shortcuts.size === 1 ? "page" : "pages"}`));
            content.appendChild(element("p", "After saving, choose Apply Configuration in Layout to restart the display and show your new cards."));
        }
        dialog.appendChild(content);
        if (step > 1 && !connected) {
            const status = element("p", "Your Mac disconnected. Reconnect EspDesktop on your Mac to continue.");
            status.setAttribute("role", "status");
            dialog.appendChild(status);
        }
        if (error) {
            const message = element("p", error, "sp-setup-error");
            message.setAttribute("role", "alert");
            dialog.appendChild(message);
        }
        const footer = element("div", "", "sp-setup-footer");
        footer.appendChild(button("Skip setup", () => { void finish(true); }));
        if (step > 1) footer.appendChild(button("Back", () => { --step; render(); }));
        const next = button(busy ? "Saving…" : step === 3 ? "Save setup" : "Continue", () => {
            if (step === 3) void finish(); else { ++step; render(); }
        }, true);
        next.disabled = busy || loading || !connected || selected.size === 0;
        footer.appendChild(next);
        dialog.appendChild(footer);
        if (!focusKey && focusWasInside) {
            title.tabIndex = -1;
            title.focus();
        }
        if (focusKey) {
            const target = [...dialog.querySelectorAll<HTMLInputElement>("[data-setup-key]")].find(node => node.getAttribute("data-setup-key") === focusKey);
            target?.focus();
            if (target?.type === "search" && selectionStart !== null) target.setSelectionRange(selectionStart, selectionStart);
        }
    }
    deps.connectors.onCompanionConnectionChange(value => {
        const reconnected = value && !connected;
        connected = value;
        render();
        if (eligible && reconnected) {
            if (!dialog) show(); else void refresh();
        }
    });
    return {
        start(): void {
            if (!deps.supported || started) return;
            started = true;
            void (async () => {
                if (await deps.native.waitForDiscovery() !== true) return;
                const saved = await deps.native.client?.load();
                if (!saved || !needsFirstRunSetup(saved)) return;
                eligible = true;
                const params = new URLSearchParams(window.location.search);
                const pairingLink = params.get("connector") === "mac_companion" || params.get("tab") === "connectors";
                if (!pairingLink || connected) show();
            })().catch(() => { /* A failed discovery must leave the normal editor available. */ });
        },
    };
}
