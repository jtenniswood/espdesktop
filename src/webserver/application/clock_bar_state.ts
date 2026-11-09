import { state } from "../state/app_instance";
import type { ClockBarController } from "../features/clock_bar_controller";
import type { UiRuntimeState } from "./state";
import type { CoreFeature } from "./core";

export interface ClockBarFeature {
    controllerState(): any;
    applyControllerState(next?: any): void;
    uiState(): any;
    setEnabled(enabled?: any): void;
    setNightModeEnabled(enabled?: any): void;
    visibleInPreview(): boolean;

    setItemVisible(item?: any, visible?: any): void;

    syncUi(): void;
}

export function createClockBarFeature(
    clockBarController: ClockBarController,
    runtime: UiRuntimeState,
    core: Pick<CoreFeature, "syncPreviewGridTop">,
    dependencies: {
        hideSettingsOverlay(): void;

        updateItemUi(): void;

        postTime(value: boolean): void;

        postNetworkStatus(value: boolean): void;
        renderSelectionBar(): void;
        updateNetworkPreview(): void;

    },
): ClockBarFeature {
    const { syncPreviewGridTop } = core;
    const els = runtime.els;
    // ── Clock Bar State ───────────────────────────────────────────────────
    var clockBarControllerInstance: ClockBarController = clockBarController;
    function clockBarControllerState(this: any) {
        return {
            enabled: !!state.clockBarOn,
            timeEnabled: !!state.clockBarTimeOn,
            nightModeEnabled: !!state.clockBarNightModeOn,
            selectedItem: state.clockBarSelectedItem || "",
        };
    }
    function applyClockBarControllerState(this: any, next?: any) {
        state.clockBarOn = next.enabled;
        state.clockBarTimeOn = next.timeEnabled;
        state.clockBarNightModeOn = next.nightModeEnabled;
        state.clockBarSelectedItem = next.selectedItem;
    }
    function clockBarUiState(this: any) {
        return clockBarControllerInstance.uiState(clockBarControllerState());
    }
    function setClockBarEnabled(this: any, enabled?: any) {
        var current: any = clockBarControllerState();
        var next: any = clockBarControllerInstance.setEnabled(current, enabled);
        // The editor belongs to the selected preview item. Close it before the
        // controller removes that selection, otherwise its modal can outlive
        // the Clock Bar that contained the item.
        if (!next.enabled && current.selectedItem)
            dependencies.hideSettingsOverlay();
        applyClockBarControllerState(next);
    }
    function setNightModeEnabled(enabled?: any) {
        applyClockBarControllerState(clockBarControllerInstance.setNightModeEnabled(clockBarControllerState(), enabled));
    }
    function clockBarVisibleInPreview(this: any) {
        return state.editingSubpage == null && clockBarUiState().previewVisible;
    }

    function setClockBarItemVisible(this: any, item?: any, visible?: any) {
        visible = !!visible;
        if (item === "time") {
            state.clockBarTimeOn = visible;
            dependencies.postTime(state.clockBarTimeOn);
        }
        else if (item === "network") {
            state.networkStatusOn = visible;
            dependencies.postNetworkStatus(state.networkStatusOn);
        }
        syncClockBarUi();

    }

    function syncClockBarUi(this: any) {
        var before: any = clockBarControllerState();
        applyClockBarControllerState(clockBarControllerInstance.reconcile(before));
        var uiState: any = clockBarUiState();
        var visible: any = clockBarVisibleInPreview();
        if (!visible && before.selectedItem) {
            dependencies.hideSettingsOverlay();
        }
        syncPreviewGridTop();
        if (els.topbar)
            els.topbar.className = "sp-topbar" + (visible ? "" : " sp-hidden");
        if (els.setSubpageTitleBar) els.setSubpageTitleBar.checked = state.subpageTitleBarOn;
        if (els.setSwipeUpPage) els.setSwipeUpPage.checked = state.swipeUpPageOn;
        if (els.setSubpageTitleBarRow) {
            els.setSubpageTitleBarRow.hidden = !!state.clockBarOn;
            els.setSubpageTitleBarRow.classList.toggle("sp-hidden", !!state.clockBarOn);
        }
        if (els.setClockBarToggle)
            els.setClockBarToggle.checked = uiState.previewVisible;
        if (els.setClockBarTimeToggle)
            els.setClockBarTimeToggle.checked = !!state.clockBarTimeOn;
        if (els.setNetworkStatusToggle) {
            els.setNetworkStatusToggle.checked = !!state.networkStatusOn;
        }

        if (els.setBatteryStatusToggle) {
            els.setBatteryStatusToggle.checked = !!state.batteryStatusOn;
        }
        if (els.setClockBarBadge) {
            els.setClockBarBadge.className = "sp-card-badge" + (uiState.badgeVisible ? "" : " sp-hidden");
        }
        if (els.setBatteryStatusBadge) {
            els.setBatteryStatusBadge.className = "sp-card-badge" + (state.batteryStatusOn ? "" : " sp-hidden");
        }

        if (els.setSubpageChevronToggle) {
            els.setSubpageChevronToggle.checked = !!state.subpageChevronsOn;
        }
        dependencies.updateItemUi();
        dependencies.renderSelectionBar();
        dependencies.updateNetworkPreview();

    }
    return {
        controllerState: clockBarControllerState,
        applyControllerState: applyClockBarControllerState,
        uiState: clockBarUiState,
        setEnabled: setClockBarEnabled,
        setNightModeEnabled,
        visibleInPreview: clockBarVisibleInPreview,

        setItemVisible: setClockBarItemVisible,

        syncUi: syncClockBarUi,
    };
}
