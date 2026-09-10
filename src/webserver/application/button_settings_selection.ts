import { state } from "../state/app_instance";
import type { UiRuntimeState } from "./state";
import type { ClockBarFeature } from "./clock_bar_state";
import type { EntityStateFeature } from "./entity_state";
import type { ControlsShellFeature } from "./controls_shell";
import type { AppStatusPreviewFeature } from "./app_status_preview";
import type { GridFeature } from "./grid";
import type { ButtonSettingsRenderQueueFeature } from "./button_settings_render_queue";
import type { ControlsFieldsFeature } from "./controls_fields";

export interface ButtonSettingsSelectionFeature {
    hideSettingsOverlay(): void;
    updatePreviewHint(context?: any): void;
    renderSelectionBar(context?: any): void;
    closeSettings(): void;
    clearCardSelection(): void;
    isSelectionControlTarget(target?: any): boolean;
    handleDocumentSelectionMouseDown(event?: any): void;
    openSelectedCardSettings(): void;
    selectClockBarItem(item?: any): void;
}

export interface ButtonSettingsSelectionDependencies {
    readonly document: Document;
    readonly fields: Pick<ControlsFieldsFeature, "fieldLabel" | "toggleRow">;
    readonly renderPreview: () => void;
    readonly renderButtonSettings: (force?: boolean) => void;
    readonly showSelectionMenu: (event?: any) => void;
    readonly contextMenuContains: (target?: any) => boolean;
    readonly openVoiceServicesSettings: () => void;
}

export function createButtonSettingsSelectionFeature(runtime: UiRuntimeState, clockBar: ClockBarFeature, entityState: Pick<EntityStateFeature, "entityInput">, shell: Pick<ControlsShellFeature, "isConfigLocked" | "createActionButton">, statusPreview: Pick<AppStatusPreviewFeature, "clockBarItemActive" | "clockBarItemLabel" | "clockBarItems" | "updateClockBarItemUi">, grid: Pick<GridFeature, "ctx">, renderQueue: ButtonSettingsRenderQueueFeature, dependencies: ButtonSettingsSelectionDependencies): ButtonSettingsSelectionFeature {
    const { document, fields: { fieldLabel, toggleRow }, renderPreview, renderButtonSettings, showSelectionMenu, openVoiceServicesSettings } = dependencies;
    const { entityInput } = entityState;
    const { isConfigLocked, createActionButton } = shell;
    const els = runtime.els;
    const { clockBarItemActive, clockBarItemLabel, clockBarItems, updateClockBarItemUi } = statusPreview;
    const { ctx } = grid;
    const {
        setItemVisible: setClockBarItemVisible,
    } = clockBar;
    // ── Button Settings Selection ─────────────────────────────────────
    function hideSettingsOverlay(this: any) {
        if (els.settingsOverlay)
            els.settingsOverlay.classList.remove("sp-visible");
    }
    function updatePreviewHint(this: any, c?: any) {
        if (!els.previewHint)
            return;
        c = c || ctx();
        els.previewHint.style.display = "";
        if (isConfigLocked()) {
            els.previewHint.textContent = "Editing is paused while the device reconnects";
        }
        else if (state.clockBarSelectedItem) {
            els.previewHint.textContent = clockBarItemLabel(state.clockBarSelectedItem) + " selected";
        }
        else if (c.selected.length > 1) {
            els.previewHint.textContent = c.selected.length + " buttons selected \u2022 right click to copy, cut, or delete";
        }
        else {
            els.previewHint.textContent = "tap to select \u2022 shift/ctrl+tap to multi-select \u2022 right click to manage";
        }
    }
    function renderClockBarSelectionBar(this: any) {
        if (!els.selectionBar || !state.clockBarSelectedItem)
            return false;
        els.selectionBar.className = "sp-selection-bar sp-visible";
        var canEditClockBarItem: any = state.clockBarSelectedItem === "voice";
        var label: any = document.createElement("span");
        label.className = "sp-selection-label";
        label.textContent = clockBarItemLabel(state.clockBarSelectedItem) + " selected";
        els.selectionBar.appendChild(label);
        var actions: any = document.createElement("div");
        actions.className = "sp-selection-actions";
        var editBtn: any = createActionButton("sp-selection-btn sp-selection-btn-primary", "Edit", "pencil");
        editBtn.disabled = !canEditClockBarItem;
        editBtn.addEventListener("click", function (this: any, e?: any) {
            e.preventDefault();
            e.stopPropagation();
            if (editBtn.disabled)
                return;
            if (state.clockBarSelectedItem === "voice") {
                openVoiceServicesSettings();
            }
        });
        actions.appendChild(editBtn);
        var visible: any = clockBarItemActive(state.clockBarSelectedItem);
        var hideBtn: any = createActionButton("sp-selection-btn", visible ? "Hide" : "Show", visible ? "eye-off-outline" : "eye-outline");
        hideBtn.addEventListener("click", function (this: any, e?: any) {
            e.preventDefault();
            e.stopPropagation();
            setClockBarItemVisible(state.clockBarSelectedItem, !visible);
            renderSelectionBar(ctx());
        });
        actions.appendChild(hideBtn);
        els.selectionBar.appendChild(actions);
        return true;
    }
    function renderSelectionBar(this: any, c?: any) {
        if (!els.selectionBar)
            return;
        c = c || ctx();
        els.selectionBar.innerHTML = "";
        if (!isConfigLocked() && renderClockBarSelectionBar())
            return;
        if (isConfigLocked() || !c.selected.length) {
            els.selectionBar.className = "sp-selection-bar";
            return;
        }
        els.selectionBar.className = "sp-selection-bar sp-visible";
        var label: any = document.createElement("span");
        label.className = "sp-selection-label";
        if (c.selected.length === 1 && c.selected[0] === -2) {
            label.textContent = "Back button selected";
        }
        else {
            label.textContent = c.selected.length === 1 ? "1 card selected" : c.selected.length + " cards selected";
        }
        els.selectionBar.appendChild(label);
        var actions: any = document.createElement("div");
        actions.className = "sp-selection-actions";
        if (c.selected.length === 1) {
            var editBtn: any = createActionButton("sp-selection-btn sp-selection-btn-primary", "Edit", "pencil");
            editBtn.addEventListener("click", function (this: any, e?: any) {
                e.preventDefault();
                e.stopPropagation();
                openSelectedCardSettings();
            });
            actions.appendChild(editBtn);
        }
        var menuBtn: any = createActionButton("sp-selection-btn", "", "dots-horizontal", "Card actions");
        menuBtn.addEventListener("click", function (this: any, e?: any) {
            e.preventDefault();
            e.stopPropagation();
            showSelectionMenu(e);
        });
        actions.appendChild(menuBtn);
        els.selectionBar.appendChild(actions);
    }
    function closeSettings(this: any) {
        hideSettingsOverlay();
        renderQueue.clearDeferred();
        state.settingsDraft = null;
        ctx().setSelected([]);
        state.clockBarSelectedItem = "";
        updateClockBarItemUi();
        renderPreview();
    }
    function clearCardSelection(this: any) {
        var c: any = ctx();
        if (!c.selected.length && c.getLastClicked() < 0 && !state.clockBarSelectedItem)
            return;
        c.setSelected([]);
        c.setLastClicked(-1);
        state.clockBarSelectedItem = "";
        hideSettingsOverlay();
        updateClockBarItemUi();
        renderPreview();
        renderButtonSettings();
    }
    function isSelectionControlTarget(this: any, target?: any) {
        return !!((els.previewMain && els.previewMain.contains(target)) ||
            (els.topbar && els.topbar.contains(target)) ||
            (els.selectionBar && els.selectionBar.contains(target)) ||
            (els.settingsOverlay && els.settingsOverlay.contains(target)) ||
            dependencies.contextMenuContains(target) ||
            (target.closest && target.closest(".sp-ctx-menu")));
    }
    function handleDocumentSelectionMouseDown(this: any, e?: any) {
        if (e.button !== 0)
            return;
        if (isSelectionControlTarget(e.target))
            return;
        clearCardSelection();
    }
    function openSelectedCardSettings(this: any) {
        if (isConfigLocked())
            return;
        if (state.clockBarSelectedItem) {
            if (state.clockBarSelectedItem === "voice")
                openVoiceServicesSettings();
            return;
        }
        var c: any = ctx();
        if (c.selected.length !== 1)
            return;
        renderButtonSettings(true);
    }
    function selectClockBarItem(this: any, item?: any) {
        if (isConfigLocked() || clockBarItems().indexOf(item) === -1)
            return;
        var c: any = ctx();
        c.setSelected([]);
        c.setLastClicked(-1);
        hideSettingsOverlay();
        state.clockBarSelectedItem = state.clockBarSelectedItem === item ? "" : item;
        updateClockBarItemUi();
        renderPreview();
        renderButtonSettings();
    }
    return {
        hideSettingsOverlay,
        updatePreviewHint,
        renderSelectionBar,
        closeSettings,
        clearCardSelection,
        isSelectionControlTarget,
        handleDocumentSelectionMouseDown,
        openSelectedCardSettings,
        selectClockBarItem,
    };
}
