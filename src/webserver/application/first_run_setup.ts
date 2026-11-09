import { companionAppIconPreviewData } from "./preview_render";
import { iconSlug } from "./ui_primitives";
import { createCompanionCatalogue, type CompanionAction } from "../api/companion_catalogue";
import type { PanelConfigDocument } from "../model/panel_config";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import type { ConfigCodecFeature } from "./config_codec";
import type { ConnectorsPageFeature } from "./connectors_page";
import type { ControlsFieldsFeature } from "./controls_fields";
import type { ControlsShellFeature } from "./controls_shell";
import {
    companionShortcutPresetCards,
    companionShortcutDefaultTabs,
    companionShortcutTabsForCapacity,
    createCompanionShortcutSubpage,
    replaceCompanionDefinitions,
    setCompanionAppShortcutFolderEnabled,
} from "./companion_shortcut_folder";
import { parseRawButtonConfig } from "../model";
import { configOptionEnabled, setConfigOptionValue } from "../model/config_primitives";

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
            !action.id.startsWith("window.") && !action.id.startsWith("webapp.")) unique.set(action.id, action);
    }
    return [...unique.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function supportsSetupShortcuts(id: string): boolean {
    return companionShortcutPresetCards(id).length > 0;
}

function layoutSignature(document: PanelConfigDocument): string {
    return JSON.stringify([document.deviceProfile,
        Object.entries(document.buttons).sort(([a], [b]) => Number(a) - Number(b)),
        Object.entries(document.subpages).sort(([a], [b]) => Number(a) - Number(b)),
        document.settings.button_order || "", document.settings.special_page || ""]);
}

/** Build one atomic layout update, rechecking the live document before saving. */
export function firstRunDocument(
    current: PanelConfigDocument,
    apps: readonly CompanionAction[],
    addShortcutPages: boolean,
    capacity: number,
    codec: Pick<ConfigCodecFeature, "serializeButtonConfig" | "serializeSubpageConfig">,
    replacing?: PanelConfigDocument,
): PanelConfigDocument {
    if (replacing && layoutSignature(current) !== layoutSignature(replacing)) {
        throw new Error("The layout changed while setup was open. Cancel and reopen setup to keep those changes.");
    }
    if (!replacing && !needsFirstRunSetup(current)) throw new Error("This display already has a layout. Reload to keep its changes.");
    if (!Number.isInteger(capacity) || capacity < 1 || apps.length > capacity ||
        new Set(apps.map(app => app.id)).size !== apps.length) throw new Error("Choose apps within the display’s card limit.");
    const buttons: Record<number, string> = {};
    const subpages: Record<number, string> = {};
    apps.forEach((app, index) => {
        const card = { entity: app.id, label: app.label, icon: "Auto", icon_on: "Auto",
            sensor: "", unit: "", type: "companion", precision: "", options: "" };
        if (addShortcutPages && supportsSetupShortcuts(app.id)) {
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
    gridColumns: () => number;
    supported: boolean;
    native: NativePanelConfigController;
    codec: Pick<ConfigCodecFeature, "serializeButtonConfig" | "serializeSubpageConfig">;
    connectors: Pick<ConnectorsPageFeature, "onCompanionConnectionChange">;
    fields: Pick<ControlsFieldsFeature, "textInput" | "toggleRow">;
    shell: Pick<ControlsShellFeature, "switchTab" | "isConfigLocked" | "showBanner" | "createMdiIcon">;
    saveAutoSwitch: (enabled: boolean) => Promise<boolean>;
    onSaved: (mirrorFailed: boolean) => void;
    autoSwitchEnabled: () => boolean;
}

export function createFirstRunSetup(deps: FirstRunSetupDependencies): { start(): void; open(): void } {
    const { document, window } = deps;
    const catalogue = createCompanionCatalogue(deps.fetch);
    let dialog: HTMLDialogElement | null = null;
    let eligible = false;
    let replacing: PanelConfigDocument | undefined;
    let opening = false;
    let connected = false;
    let step = 1;
    let apps: CompanionAction[] = [];
    const selected = new Set<string>();
    let addShortcutPages = false;
    let autoSwitch = true;
    let busy = false;
    let loading = false;
    let started = false;
    let error = "";
    let query = "";
    let previousFocus: HTMLElement | null = null;

    const selectedApps = () => apps.filter(app => selected.has(app.id));
    const supportedApps = () => selectedApps().filter(app => supportsSetupShortcuts(app.id));

    function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = "", className = ""): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        node.textContent = text;
        if (className) node.className = className;
        return node;
    }
    function button(text: string, action: () => void, primary = false): HTMLButtonElement {
        const node = element("button", text, "sp-action-btn " + (primary ? "sp-save-btn" : "sp-cancel-btn"));
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
    function dismiss(): void {
        if (busy) return;
        eligible = false;
        close();
    }
    function show(): void {
        if (!eligible || dialog) return;
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog = element("dialog", "", "sp-settings-modal sp-config sp-first-run");
        dialog.setAttribute("aria-labelledby", "sp-setup-title");
        dialog.addEventListener("cancel", event => {
            event.preventDefault();
            dismiss();
        });
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
                    replaceCompanionDefinitions(definitions.applications);
                }).catch(() => { /* Bundled shortcuts remain available on older firmware. */ }),
            ]);
            apps = firstRunApplications(actions);
            const ids = new Set(apps.map(app => app.id));
            for (const id of selected) if (!ids.has(id)) selected.delete(id);
        } catch {
            error = "Could not load apps. Check that EspDesktop is connected on your Mac, then try again.";
        } finally {
            loading = false;
            render();
        }
    }
    async function finish(skip = false): Promise<void> {
        if (skip && replacing) {
            dismiss();
            return;
        }
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
        const previousAutoSwitch = deps.autoSwitchEnabled();
        let switchAttempted = false;
        let layoutSaved = false;
        try {
            // Save the global switch first. A failure must not mark setup complete.
            if (!skip) {
                switchAttempted = true;
                if (!await deps.saveAutoSwitch(addShortcutPages && supportedApps().length > 0 && autoSwitch)) {
                    throw new Error("Could not save automatic switching. Check the connection and try again.");
                }
            }
            const chosen = skip ? [] : selectedApps();
            const result = await deps.native.schedule(current =>
                firstRunDocument(current, chosen, addShortcutPages, deps.capacity, deps.codec, replacing));
            if (result !== "saved" && result !== "mirror-failed") throw new Error("Could not finish setup. Reload the page to check the display’s saved layout before trying again.");
            layoutSaved = true;
            eligible = false;
            close();
            if (skip) {
                deps.shell.switchTab("screen");
            } else {
                deps.onSaved(result === "mirror-failed");
            }
        } catch (failure) {
            error = failure instanceof Error ? failure.message : "Could not save setup. Please try again.";
            if (switchAttempted && !layoutSaved) {
                const restored = await deps.saveAutoSwitch(previousAutoSwitch).catch(() => false);
                if (!restored) error += " Could not restore automatic switching. Check Screen → App Subpages after reconnecting.";
            }
        } finally {
            busy = false;
            render();
        }
    }
    function toggle(id: string, label: string, checked: boolean, change: (enabled: boolean) => void, disabled = false) {
        const { row, input } = deps.fields.toggleRow(label, id, checked) as { row: HTMLDivElement; input: HTMLInputElement };
        input.disabled = busy || disabled;
        input.setAttribute("data-setup-key", id);
        input.addEventListener("change", () => change(input.checked));
        return row;
    }
    function appTile(app: CompanionAction): HTMLElement {
        const initial = [...app.label.trim()][0]?.toLocaleUpperCase() || "?";
        const tile = element("span", initial, "sp-setup-tile");
        tile.title = app.label;
        if (app.iconHash) {
            void companionAppIconPreviewData(app.id, "", document).then(artwork => {
                if (!artwork || !tile.isConnected) return;
                const icon = element("img");
                icon.alt = "";
                icon.src = artwork.dataUrl;
                tile.replaceChildren(icon);
            });
        }
        return tile;
    }
    function homePreview(shortcutPageCount?: number): HTMLElement {
        const chosen = selectedApps();
        const preview = element("div", "", "sp-setup-preview");
        const grid = element("div", "", "sp-setup-grid");
        grid.style.setProperty("--sp-setup-columns", String(deps.gridColumns()));
        grid.setAttribute("aria-hidden", "true");
        for (let index = 0; index < deps.capacity; index++) {
            const app = chosen[index];
            grid.appendChild(app ? appTile(app) : element("span", "", "sp-setup-tile"));
        }
        const summary = element("div", "", "sp-setup-summary");
        const count = element("strong", `${chosen.length} / ${deps.capacity} cards`);
        count.setAttribute("role", "status");
        summary.append(element("span", "Home screen"), count);
        if (shortcutPageCount !== undefined) {
            summary.appendChild(element("span", `${shortcutPageCount} shortcut ${shortcutPageCount === 1 ? "page" : "pages"}`));
        }
        preview.append(grid, summary);
        return preview;
    }
    function shortcutPreview(app: CompanionAction): HTMLElement {
        const preview = element("div", "", "sp-setup-preview sp-setup-example");
        preview.classList.toggle("sp-inactive", !addShortcutPages);
        preview.setAttribute("role", "img");
        preview.setAttribute("aria-label", `Shortcut page example for ${app.label}`);
        const grid = element("div", "", "sp-setup-grid");
        const icons = ["chevron-left", ...companionShortcutPresetCards(app.id).slice(0, 3).map(card => iconSlug(card.icon))];
        for (const icon of icons) {
            const tile = element("span", "", "sp-setup-tile");
            tile.appendChild(deps.shell.createMdiIcon(icon));
            grid.appendChild(tile);
        }
        preview.append(appTile(app), deps.shell.createMdiIcon("chevron-right"), grid);
        return preview;
    }
    function render(): void {
        if (!dialog) return;
        const focusWasInside = dialog.contains(document.activeElement);
        const focusKey = document.activeElement?.getAttribute("data-setup-key");
        const selectionStart = document.activeElement instanceof HTMLInputElement ? document.activeElement.selectionStart : null;
        dialog.replaceChildren();
        const progress = element("div", "", "sp-setup-progress");
        progress.setAttribute("role", "img");
        progress.setAttribute("aria-label", `Step ${step} of 3`);
        for (let index = 1; index <= 3; index++) {
            progress.appendChild(element("span", "", index <= step ? "sp-active" : ""));
        }
        const title = element("h1", step === 1 ? "Pick your apps" : step === 2 ? "Shortcut pages" : "Finish setup", "sp-section-title");
        title.id = "sp-setup-title";
        const closeButton = element("button", "", "sp-settings-close");
        closeButton.type = "button";
        closeButton.disabled = busy;
        closeButton.setAttribute("aria-label", "Close setup");
        closeButton.appendChild(deps.shell.createMdiIcon("close"));
        closeButton.addEventListener("click", dismiss);
        dialog.append(progress, title, closeButton);
        const content = element("div", "", "sp-setup-content");
        if (step === 1) {
            if (!connected) {
                content.appendChild(element("p", "Connect your Mac to see your apps."));
                content.appendChild(button("Connect your Mac", () => { close(); deps.shell.switchTab("device"); }));
            } else {
                content.appendChild(homePreview());
                const toolbar = element("div", "", "sp-setup-toolbar");
                const search: HTMLInputElement = deps.fields.textInput("sp-setup-search", query, "Search apps");
                search.type = "search";
                search.setAttribute("aria-label", "Search apps");
                search.setAttribute("data-setup-key", "search");
                search.disabled = busy;
                search.addEventListener("input", () => { query = search.value; render(); });
                toolbar.append(search, button(loading ? "Loading…" : "Refresh apps", () => { void refresh(); }));
                content.appendChild(toolbar);
                if (!loading && apps.length === 0) content.appendChild(element("p", "No apps available. Check app access on your Mac.", "sp-setting-note"));
                const list = element("div", "", "sp-light-tab-list sp-setup-list");
                for (const app of apps.filter(app => app.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) {
                    const row = toggle(`sp-setup-app-${app.id}`, app.label, selected.has(app.id), enabled => {
                        if (enabled && selected.size < deps.capacity) selected.add(app.id);
                        else selected.delete(app.id);
                        render();
                    }, loading || (!selected.has(app.id) && selected.size >= deps.capacity));
                    row.classList.add("sp-light-tab-row");
                    row.querySelector(".sp-toggle-label")?.classList.add("sp-light-tab-label");
                    list.appendChild(row);
                }
                content.appendChild(list);
            }
        } else if (step === 2) {
            const supported = supportedApps();
            const example = supported[0];
            if (example) content.appendChild(shortcutPreview(example));
            content.appendChild(toggle("sp-setup-add-pages", "Add shortcut pages", addShortcutPages && !!example,
                enabled => { addShortcutPages = enabled; render(); }, !example));
            content.appendChild(element("p", example
                ? `For ${supported.length === 1 ? "1 supported app" : `${supported.length} supported apps`}.`
                : "No shortcut pages available for these apps.", "sp-setting-note"));
        } else {
            const shortcutPageCount = addShortcutPages ? supportedApps().length : 0;
            content.appendChild(homePreview(shortcutPageCount));
            if (shortcutPageCount > 0) {
                content.appendChild(toggle("sp-setup-auto-switch", "Open pages on app focus", autoSwitch,
                    enabled => { autoSwitch = enabled; }));
            }
            if (replacing) {
                content.appendChild(element("p", "Replaces your home screen and subpages.", "sp-setting-note"));
            }
        }
        dialog.appendChild(content);
        if (step > 1 && !connected) {
            const status = element("p", "Reconnect your Mac to continue.");
            status.setAttribute("role", "status");
            dialog.appendChild(status);
        }
        if (error) {
            const message = element("p", error, "sp-setup-error");
            message.setAttribute("role", "alert");
            dialog.appendChild(message);
        }
        const footer = element("div", "", "sp-btn-row sp-btn-row--save sp-has-secondary sp-setup-footer");
        footer.appendChild(button(replacing ? "Cancel" : "Skip setup", () => { void finish(true); }));
        const actions = element("div", "", "sp-btn-group-right");
        if (step > 1) actions.appendChild(button("Back", () => { --step; render(); }));
        const next = button(busy ? "Saving…" : step === 3 ? (replacing ? "Replace layout" : "Save setup") : "Continue", () => {
            if (step === 3) void finish(); else { ++step; render(); }
        }, true);
        next.disabled = busy || loading || !connected || selected.size === 0;
        actions.appendChild(next);
        footer.appendChild(actions);
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
        open(): void {
            if (!deps.supported || dialog || opening) return;
            opening = true;
            void (async () => {
                if (await deps.native.waitForDiscovery() !== true) throw new Error("Update the display firmware to use app setup.");
                const saved = (await deps.native.readSnapshot())?.document;
                if (!saved) throw new Error("Could not load the display’s layout. Check the connection and try again.");
                replacing = saved;
                selected.clear();
                addShortcutPages = false;
                for (const value of Object.values(saved.buttons)) {
                    const card = parseRawButtonConfig(value);
                    if (card.type !== "companion" || !card.entity || card.sensor || selected.size >= deps.capacity) continue;
                    selected.add(card.entity);
                    if (configOptionEnabled(card.options, "app_shortcuts")) addShortcutPages = true;
                }
                autoSwitch = deps.autoSwitchEnabled();
                query = "";
                error = "";
                step = 1;
                eligible = true;
                show();
            })().catch(failure => deps.shell.showBanner(failure.message, "error"))
                .finally(() => { opening = false; });
        },
        start(): void {
            if (!deps.supported || started) return;
            started = true;
            void (async () => {
                if (await deps.native.waitForDiscovery() !== true) return;
                const saved = (await deps.native.readSnapshot())?.document;
                if (!saved || !needsFirstRunSetup(saved)) return;
                eligible = true;
                const params = new URLSearchParams(window.location.search);
                const pairingLink = params.get("connector") === "mac_companion" || params.get("tab") === "connectors";
                if (!pairingLink || connected) show();
            })().catch(() => { /* A failed discovery must leave the normal editor available. */ });
        },
    };
}
