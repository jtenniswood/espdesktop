import type { AppState } from "../state/types";
import type { UiRuntimeState } from "./state";

export function renderPanelBrand(brand: Element, document: Document, name?: string): void {
    brand.textContent = "EspDesktop";
    if (name) {
        const label = document.createElement("span");
        label.className = "sp-brand-name";
        label.textContent = " " + name;
        brand.appendChild(label);
    }
}

export interface ControlsShellDependencies {
    readonly document: Document;
    readonly panelName?: () => string | undefined;
    readonly state: AppState;
    readonly schedule: typeof setTimeout;
    readonly cancelSchedule: (handle: any) => void;
    readonly buildSettingsPage: (parent: HTMLElement) => void;
    readonly closeSettings: () => void;
    readonly postButtonPress: (name: string) => Promise<Response>;
    readonly waitForReboot: () => void;
    readonly hideContextMenu: () => void;
    readonly hideSettingsOverlay: () => void;
    readonly clearPlaceholder: () => void;
    readonly updatePreviewHint: () => void;
    readonly renderPreview: () => void;
    // Extra home screens are stored as pages keyed above the visible grid.
    readonly screenKeys: () => readonly number[];
    readonly enterScreen: (key: number | null) => void;
    readonly addScreen: () => Promise<boolean> | boolean;
    readonly removeScreen: (key: number) => Promise<boolean> | boolean;
    readonly renameScreen: (key: number, name: string) => Promise<boolean> | boolean;
    readonly moveScreen: (key: number, targetIndex: number) => Promise<boolean> | boolean;
}

export interface ControlsShellFeature {
    readonly createMdiIcon: (name?: any, className?: any) => HTMLElement;
    readonly createActionButton: (className?: any, label?: any, iconName?: any, ariaLabel?: any) => HTMLButtonElement;
    readonly createDisclosureChevron: (className?: any) => HTMLElement;
    readonly showBanner: (msg?: any, type?: any) => void;
    readonly buildUI: () => void;
    readonly buildHeader: (parent?: any) => void;
    readonly buildScreenPage: (parent?: any) => void;
    readonly buildApplyBar: () => HTMLElement;
    readonly switchTab: (tab?: any) => void;
    readonly syncTabChrome: () => void;
    readonly isPreviewReadOnly: () => boolean;
    readonly isConfigLocked: () => boolean;
    readonly syncConfigLockUi: () => void;
    readonly setConfigLocked: (locked?: any, reason?: any) => void;
    readonly renderScreenTabs: () => void;
    readonly screenKeys: () => readonly number[];
    readonly enterScreen: (key: number | null) => void;
}

export function createControlsShellFeature(
    runtime: UiRuntimeState,
    dependencies: ControlsShellDependencies,
): ControlsShellFeature {
    const els = runtime.els;
    const document = dependencies.document;
    const state = dependencies.state;
    const initialParams = new URLSearchParams(document.defaultView?.location.search ?? "");
    const requestedConnectorView = initialParams.get("connector") === "mac_companion" ||
        initialParams.get("tab") === "connectors";
    const requestedTabName = initialParams.get("tab") ?? "";
    const requestedInitialTab = requestedConnectorView ? "device"
        : requestedTabName === "layout" ? "screen"
        : requestedTabName === "settings" || requestedTabName === "screen" ? "settings"
        : requestedTabName === "system" || requestedTabName === "device" ? "device"
        : null;
    // Restored once the saved layout has loaded and the screen keys are known.
    let pendingInitialScreen: string | null = initialParams.get("screen") ?? null;
    // ── Build UI ───────────────────────────────────────────────────────────
    function createMdiIcon(this: any, name?: any, className?: any) {
        var icon: any = document.createElement("span");
        icon.className = (className || "mdi") + " mdi-" + name;
        icon.setAttribute("aria-hidden", "true");
        return icon;
    }
    function createActionButton(this: any, className?: any, label?: any, iconName?: any, ariaLabel?: any) {
        var btn: any = document.createElement("button");
        btn.type = "button";
        btn.className = className;
        if (ariaLabel)
            btn.setAttribute("aria-label", ariaLabel);
        if (iconName)
            btn.appendChild(createMdiIcon(iconName));
        if (label)
            btn.appendChild(document.createTextNode(label));
        return btn;
    }
    function createDisclosureChevron(this: any, className?: any) {
        var wrap: any = document.createElement("span");
        wrap.className = className;
        var svg: any = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2.5");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        var path: any = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M6 9l6 6 6-6");
        svg.appendChild(path);
        wrap.appendChild(svg);
        return wrap;
    }
    function showBanner(this: any, msg?: any, type?: any) {
        if (!els.banner)
            return;
        dependencies.cancelSchedule(els._bannerTimer);
        els.banner.textContent = msg;
        els.banner.className = "sp-banner sp-" + type;
        if (type === "error" || type === "success" || type === "warning") {
            els._bannerTimer = dependencies.schedule(function (this: any) {
                els.banner.className = "sp-banner";
            }, 6000);
        }
    }
    function buildUI(this: any) {
        var root: any = document.createElement("div");
        root.id = "sp-app";
        var banner: any = document.createElement("div");
        banner.className = "sp-banner";
        root.appendChild(banner);
        els.banner = banner;
        buildHeader(root);
        buildScreenPage(root);
        dependencies.buildSettingsPage(root);
        var app: any = document.querySelector("esp-app");
        if (app) {
            app.parentNode.insertBefore(root, app);
        }
        else {
            document.body.insertBefore(root, document.body.firstChild);
        }
        els.root = root;
        switchTab(requestedInitialTab ?? "screen");
    }
    function buildHeader(this: any, parent?: any) {
        var header: any = document.createElement("div");
        header.className = "sp-header";
        var brand: any = document.createElement("div");
        brand.className = "sp-brand";
        renderPanelBrand(brand, document, dependencies.panelName?.());
        header.appendChild(brand);
        var nav: any = document.createElement("nav");
        nav.className = "sp-nav";
        nav.setAttribute("aria-label", "Primary");
        var tabs: any = [
            { id: "screen", label: "Layout" },
            { id: "settings", label: "Screen" },
            { id: "device", label: "System" },
        ];
        tabs.forEach(function (this: any, t?: any) {
            var tab: any = document.createElement("div");
            tab.className = "sp-tab";
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", "false");
            tab.textContent = t.label;
            tab.addEventListener("click", function (this: any) { switchTab(t.id); });
            nav.appendChild(tab);
            els["tab_" + t.id] = tab;
        });
        var docsLink: any = document.createElement("a");
        docsLink.className = "sp-tab sp-tab-docs";
        docsLink.href = "https://espdesktop.com/";
        docsLink.target = "_blank";
        docsLink.rel = "noopener";
        docsLink.appendChild(document.createTextNode("Docs "));
        docsLink.appendChild(createMdiIcon("arrow-top-right"));
        nav.appendChild(docsLink);
        header.appendChild(nav);
        parent.appendChild(header);
    }
    function buildScreenPage(this: any, parent?: any) {
        var page: any = document.createElement("div");
        page.id = "sp-screen";
        page.className = "sp-page";
        var selectionBar: any = document.createElement("div");
        selectionBar.className = "sp-selection-bar";
        els.selectionBar = selectionBar;
        page.appendChild(selectionBar);
        var screenTabs: any = document.createElement("div");
        screenTabs.className = "sp-screen-tabs";
        screenTabs.style.cssText = "display:flex;gap:6px;align-items:center;margin:0 0 10px;flex-wrap:wrap;";
        page.appendChild(screenTabs);
        els.screenTabs = screenTabs;
        var wrap: any = document.createElement("div");
        wrap.className = "sp-wrap";
        wrap.innerHTML =
            '<div class="sp-screen">' +
                '<div class="sp-topbar">' +
                '<div class="sp-clockbar-section sp-clockbar-left" data-clockbar-section="left"></div>' +
                '<div class="sp-clockbar-section sp-clockbar-middle" data-clockbar-section="middle"></div>' +
                '<div class="sp-clockbar-section sp-clockbar-right" data-clockbar-section="right"></div>' +
                "</div>" +
                '<div class="sp-main"></div>' +
                "</div>";
        page.appendChild(wrap);
        els.previewWrap = wrap;
        els.previewScreen = wrap.querySelector(".sp-screen");
        els.topbar = wrap.querySelector(".sp-topbar");
        els.clockBarSections = {
            left: wrap.querySelector('[data-clockbar-section="left"]'),
            middle: wrap.querySelector('[data-clockbar-section="middle"]'),
            right: wrap.querySelector('[data-clockbar-section="right"]'),
        };
        els.clockBarItems = {};
        els.previewMain = wrap.querySelector(".sp-main");
        els.previewMain.setAttribute("role", "grid");
        els.previewMain.setAttribute("aria-label", "Button grid");
        var hint: any = document.createElement("div");
        hint.className = "sp-hint";
        hint.style.display = "none";
        els.previewHint = hint;
        page.appendChild(hint);
        var overlay: any = document.createElement("div");
        overlay.className = "sp-settings-overlay";
        var modal: any = document.createElement("div");
        modal.className = "sp-settings-modal";
        var closeBtn: any = document.createElement("button");
        closeBtn.className = "sp-settings-close";
        closeBtn.innerHTML = '<svg class="sp-settings-close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>' +
            '</svg>';
        closeBtn.setAttribute("aria-label", "Close settings");
        closeBtn.addEventListener("click", dependencies.closeSettings);
        modal.appendChild(closeBtn);
        var config: any = document.createElement("div");
        config.className = "sp-config";
        els.buttonSettings = config;
        modal.appendChild(config);
        overlay.appendChild(modal);
        page.appendChild(overlay);
        els.settingsOverlay = overlay;
        parent.appendChild(page);
        els.screenPage = page;
        renderScreenTabs();
    }
    function renderScreenTabs(this: any) {
        if (!els.screenTabs)
            return;
        els.screenTabs.textContent = "";
        var screenTitle: any = function (key: any, index?: any) {
            var page: any = state.subpages[key];
            return page && page.title ? String(page.title) : "Screen " + (index + 2);
        };
        var beginRename: any = function (tab?: any, label?: any, key?: any, index?: any) {
            if (tab.querySelector("input"))
                return;
            var input: any = document.createElement("input");
            input.type = "text";
            input.className = "sp-tab-rename";
            input.value = (state.subpages[key] && state.subpages[key].title) || "";
            input.placeholder = "Screen " + (index + 2);
            input.style.cssText = "width:8em;min-width:5em;font:inherit;color:inherit;background:transparent;border:0;border-bottom:1px solid currentColor;outline:none;";
            var finished = false;
            var finish = async function (this: any, save?: any) {
                if (finished)
                    return;
                finished = true;
                var value: any = input.value.trim();
                input.replaceWith(label);
                label.textContent = screenTitle(key, index);
                if (save && value !== ((state.subpages[key] && state.subpages[key].title) || "")) {
                    if (await dependencies.renameScreen(key, value))
                        renderScreenTabs();
                }
            };
            input.addEventListener("keydown", function (this: any, event?: any) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    void finish(true);
                }
                else if (event.key === "Escape") {
                    event.preventDefault();
                    void finish(false);
                }
            });
            input.addEventListener("blur", function (this: any) { void finish(true); });
            input.addEventListener("click", function (this: any, event?: any) { event.stopPropagation(); });
            input.addEventListener("dblclick", function (this: any, event?: any) { event.stopPropagation(); });
            label.replaceWith(input);
            input.focus();
            input.select();
        };
        var makeTab: any = function (label?: any, active?: any, onClick?: any, screenKey?: any, index?: any) {
            var tab: any = document.createElement("div");
            tab.className = "sp-tab" + (active ? " active" : "");
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", active ? "true" : "false");
            tab.style.cursor = "pointer";
            var labelNode: any = document.createElement("span");
            labelNode.className = "sp-tab-label";
            labelNode.textContent = label;
            tab.appendChild(labelNode);
            if (onClick)
                tab.addEventListener("click", onClick);
            if (screenKey != null) {
                tab.draggable = true;
                tab.title = "Drag to reorder; double-click to rename";
                tab.addEventListener("dragstart", function (this: any, event?: any) {
                    if (event.dataTransfer) {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", String(screenKey));
                    }
                    tab.classList.add("sp-tab-dragging");
                });
                tab.addEventListener("dragend", function (this: any) {
                    tab.classList.remove("sp-tab-dragging");
                });
                tab.addEventListener("dragover", function (this: any, event?: any) {
                    event.preventDefault();
                    if (event.dataTransfer)
                        event.dataTransfer.dropEffect = "move";
                    tab.classList.add("sp-tab-drop-target");
                });
                tab.addEventListener("dragleave", function (this: any) {
                    tab.classList.remove("sp-tab-drop-target");
                });
                tab.addEventListener("drop", async function (this: any, event?: any) {
                    event.preventDefault();
                    tab.classList.remove("sp-tab-drop-target");
                    var source: any = Number(event.dataTransfer && event.dataTransfer.getData("text/plain"));
                    if (!source || source === screenKey)
                        return;
                    if (await dependencies.moveScreen(source, index))
                        renderScreenTabs();
                });
                tab.addEventListener("dblclick", function (this: any, event?: any) {
                    event.preventDefault();
                    event.stopPropagation();
                    beginRename(tab, labelNode, screenKey, index);
                });
            }
            return tab;
        };
        els.screenTabs.appendChild(makeTab("Home", state.editingSubpage == null, function () {
            dependencies.enterScreen(null);
            renderScreenTabs();
        }));
        dependencies.screenKeys().forEach(function (key: any, index?: any) {
            var tab: any = makeTab(screenTitle(key, index), state.editingSubpage === key, function () {
                dependencies.enterScreen(key);
                renderScreenTabs();
            }, key, index);
            var remove: any = document.createElement("span");
            remove.textContent = "×";
            remove.title = "Remove screen";
            remove.style.cssText = "margin-left:6px;opacity:.7;";
            remove.addEventListener("click", async function (event?: any) {
                event.stopPropagation();
                var view: any = document.defaultView;
                if (view && !view.confirm("Remove this screen and its cards?"))
                    return;
                if (await dependencies.removeScreen(key))
                    renderScreenTabs();
            });
            tab.appendChild(remove);
            els.screenTabs.appendChild(tab);
        });
        var add: any = makeTab("+", false, async function () {
            if (await dependencies.addScreen())
                renderScreenTabs();
        });
        add.title = "Add screen";
        els.screenTabs.appendChild(add);
        // Restore a deep-linked screen once the saved layout reports its keys.
        if (pendingInitialScreen !== null) {
            const requested: any = pendingInitialScreen === "home" ? null : pendingInitialScreen;
            const known = requested == null ||
                dependencies.screenKeys().some(function (this: any, key?: any) { return String(key) === String(requested); });
            if (known) {
                pendingInitialScreen = null;
                const current: any = state.editingSubpage == null ? null : String(state.editingSubpage);
                if ((requested == null ? null : String(requested)) !== current) {
                    dependencies.enterScreen(requested == null ? null : Number(requested));
                    renderScreenTabs();
                    return;
                }
            }
        }
        syncViewUrl(state.activeTab);
    }
    // ── Shell controls ───────────────────────────────────────────────────
    function buildApplyBar(this: any) {
        var bar: any = document.createElement("div");
        bar.className = "sp-apply-bar";
        var btn: any = document.createElement("button");
        btn.className = "sp-apply-btn";
        btn.textContent = "Apply Configuration";
        btn.addEventListener("click", function (this: any) {
            if (isConfigLocked())
                return;
            if (document.activeElement && "blur" in document.activeElement) {
                (document.activeElement as HTMLElement).blur();
            }
            setConfigLocked(true, "Restarting device\u2026");
            dependencies.schedule(function (this: any) {
                dependencies.postButtonPress("Apply Configuration").then(function (this: any, response?: any) {
                    if (response && response.ok) {
                        dependencies.waitForReboot();
                    }
                    else if (response) {
                        setConfigLocked(false);
                    }
                });
            }, 600);
        });
        bar.appendChild(btn);
        var note: any = document.createElement("div");
        note.className = "sp-apply-note";
        note.textContent = "Restarts the device to apply changes";
        bar.appendChild(note);
        return bar;
    }
    function tabUrlName(tab: string): string {
        return tab === "screen" ? "layout" : tab === "settings" ? "screen" : "system";
    }
    function syncViewUrl(tab: string): void {
        const view = document.defaultView;
        if (!view)
            return;
        try {
            const url = new URL(view.location.href);
            const connectorView = url.searchParams.get("connector") === "mac_companion" ||
                url.searchParams.get("tab") === "connectors";
            if (!(tab === "device" && connectorView))
                url.searchParams.set("tab", tabUrlName(tab));
            const screenKey = state.editingSubpage;
            if (tab === "screen" && screenKey != null &&
                dependencies.screenKeys().some(function (this: any, key?: any) { return String(key) === String(screenKey); }))
                url.searchParams.set("screen", String(screenKey));
            else
                url.searchParams.delete("screen");
            view.history.replaceState(null, "", url);
        }
        catch (e) { /* History is unavailable in embedded or restricted views. */ }
    }
    function switchTab(this: any, tab?: any) {
        const returningToScreen = tab === "screen" && state.activeTab !== "screen";
        state.activeTab = tab;
        if (els.root)
            els.root.setAttribute("data-active-tab", tab);
        ["screen", "settings", "device"].forEach(function (this: any, t?: any) {
            els["tab_" + t].className = "sp-tab" + (tab === t ? " active" : "");
            els["tab_" + t].setAttribute("aria-selected", tab === t ? "true" : "false");
        });
        els.screenPage.className = "sp-page" + (tab === "screen" ? " active" : "");
        els.settingsPage.className = "sp-page" + (tab === "settings" ? " active" : "");
        els.devicePage.className = "sp-page" + (tab === "device" ? " active" : "");
        syncTabChrome();
        syncViewUrl(tab);
        if (returningToScreen) dependencies.renderPreview();
    }
    function syncTabChrome(this: any) {
        var support: any = document.querySelector(".sp-support-btn");
        if (support)
            support.classList.remove("sp-support-hidden");
    }
    function isPreviewReadOnly() {
        return state.configLocked || state.nativeConfigReadOnly;
    }
    function isConfigLocked(this: any) {
        return isPreviewReadOnly() || state.nativeConfigLoading || state.nativeTransferActive;
    }
    function syncConfigLockUi(this: any) {
        const previewLocked = !!state.configLocked || !!state.nativeConfigLoading ||
            (!!state.nativeConfigReadOnly && !state.nativePanelDocument);
        if (els.root) {
            els.root.classList.toggle("sp-config-locked", previewLocked);
            els.root.classList.toggle("sp-config-busy", !!state.nativeTransferActive);
        }
        if (els.previewMain) {
            els.previewMain.setAttribute("aria-disabled", previewLocked || state.nativeTransferActive ? "true" : "false");
        }
        if (els.root) {
            var text: any = state.nativeConfigReadOnly ? "Read-only configuration" : state.nativeTransferActive ? "Updating cards\u2026" : state.nativeConfigLoading ? "Loading pages\u2026" : "Waiting for device\u2026";
            if ((state.configLockReason || "").indexOf("Restarting") !== -1)
                text = "Restarting\u2026";
            els.root.querySelectorAll(".sp-apply-btn").forEach(function (this: any, btn?: any) {
                btn.disabled = isConfigLocked();
                btn.textContent = isConfigLocked() ? text : "Apply Configuration";
            });
        }
        dependencies.updatePreviewHint();
    }
    function setConfigLocked(this: any, locked?: any, reason?: any) {
        var nextLocked: any = !!locked;
        state.configLocked = nextLocked;
        state.configLockReason = nextLocked ? (reason || "Reconnecting to device\u2026") : "";
        if (nextLocked) {
            dependencies.hideContextMenu();
            dependencies.hideSettingsOverlay();
            state.settingsDraft = null;
            state.selectedSlots = [];
            state.lastClickedSlot = -1;
            state.subpageSelectedSlots = [];
            state.subpageLastClicked = -1;
            if (runtime.dragSrcEl) {
                runtime.dragSrcEl.classList.remove("sp-dragging");
                runtime.dragSrcEl = null;
            }
            runtime.dragSrcPos = -1;
            runtime.previewDropIdx = -1;
            dependencies.clearPlaceholder();
        }
        syncConfigLockUi();
        if (els.previewMain)
            dependencies.renderPreview();
    }
    return {
        createMdiIcon,
        createActionButton,
        createDisclosureChevron,
        showBanner,
        buildUI,
        buildHeader,
        buildScreenPage,
        buildApplyBar,
        switchTab,
        syncTabChrome,
        isPreviewReadOnly,
        isConfigLocked,
        syncConfigLockUi,
        setConfigLocked,
        renderScreenTabs,
        screenKeys: () => dependencies.screenKeys(),
        enterScreen: (key) => { dependencies.enterScreen(key); renderScreenTabs(); },
    };
}
