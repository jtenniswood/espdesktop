import { isRetiredLayoutCard, removeRetiredPanelRecords } from "../features/retired_cards";
import { legacyHomeAssistantCards, legacyHomeAssistantWarning } from "../model/legacy_home_assistant";
import { normalizeCardIconSize } from "../model/config_primitives";
import { syncDefaultIconSizeUi } from "./default_icon_size_ui";
import { clearScreensaverPinForRestore } from "./screensaver_pin";
import { resetAwareFetch } from "../api/reset_session";
import type { PanelIdentityBackup } from "../model/panel_identity";
import type { PanelIdentityFeature } from "./panel_identity";
import { state } from "../state/app_instance";
import { SCREEN_SCHEDULE_PREFERENCES, decodeScreenSchedulePreferences,
    screenSchedulePreferencesFromState } from "../model/screen_schedule_preferences";
import { WEB_UI_COLORS } from "../state/ui_tokens";
import * as EspDesktopModel from "../model";
import {
    APP_SUBPAGE_PREFERENCE,
    nativeAppSubpagePreference,
    normalizeBrightnessMode,
    normalizeHexColor,
    normalizeHour,
    normalizeLanguage,
    normalizeScheduleClockBrightness,
    normalizeScheduleDimmedBrightness,
    normalizeScheduleMode,
    normalizeScheduleSensorActivation,
    normalizeScheduleTrigger,
    normalizeScheduleWakeBrightness,
    normalizeScheduleWakeTimeout,
    normalizeScreensaverAction,
    normalizeScreensaverCameraImageMode,
    normalizeScreensaverDimmedBrightness,
    normalizeTimeOfDay,
    parseThemeSunOffset,
} from "../model/settings";
import { syncThemeSettingsUi } from "./theme_settings_ui";
import { DISPLAY_THEME_PREFERENCES, decodeDisplayThemePreferences, displayThemePreferencesFromState,
    legacyDisplayThemePatch } from "../model/display_theme_preferences";
import { normalizeCardCurve } from "../model/settings";
import { syncCardCurveUi } from "./card_curve_ui";
import type { BackupImportController } from "../features/backup_import_controller";
import type { BackupExportController } from "../features/backup_export_controller";
import type { BackupFileController } from "../features/backup_file_controller";
import type { BackupRestoreController } from "../features/backup_restore_controller";
import type { ApplicationLayoutState } from "./application_context";
import type { NativePanelConfigController } from "../controllers/native_panel_config_controller";
import type { PanelConfigDocument } from "../model";
import type { ConfigCodecFeature } from "./config_codec";
import type { UiRuntimeState } from "./state";
import type { CoreFeature } from "./core";
import { syncLanguageSelect } from "./language_state";
import { hasCustomNtpServers, syncNtpServerUi } from "./ntp_state";
import { getActiveScreensaverMode } from "./screensaver_state";
import type { ScreenScheduleStateFeature } from "./screen_schedule_state";
import type { ScreensaverTimeoutFeature } from "./screensaver_timeout";
import type { FirmwareUpdateFeature } from "./firmware_update_state";
import type { ClockBarFeature } from "./clock_bar_state";
import type { EntityStateFeature } from "./entity_state";
import type { ControlsShellFeature } from "./controls_shell";
import type { ApplicationApiFeature } from "./api";
import type { AppStatusPreviewFeature } from "./app_status_preview";
import type { GridFeature } from "./grid";
import type { ScreenSchedulePostApiFeature } from "./screen_schedule_post_api";
import type { ClockBarPostApiFeature } from "./clock_bar_post_api";
import type { ConfigPersistenceFeature } from "./config_post_api";
import type { BackupContractFeature } from "./backup_contract";
import type { SettingsPageHelpersFeature } from "./settings_page_helpers";
import type { PreviewRenderFeature } from "./preview_render";
import type { ButtonSettingsFeature } from "./button_settings";
import { legacyRestoreFailureMessage, restoreLegacyLayoutDocument } from "../features/legacy_layout_restore";
import { NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE, nativeBackupHasInactiveRecords } from "../features/native_panel_config";
import { decodeNativeConfigBackupPayload, decodeNativeConfigDocument, nativeConfigDocumentVersion } from "../model/native_config_backup";
import { encodePanelPageDocument, panelPageDocumentDepth } from "../model/panel_config_conversion";

export interface AppBackupControllers {
    readonly identity?: PanelIdentityFeature;
    readonly waitForInitialState: () => Promise<void>;
    readonly layout: ApplicationLayoutState;
    readonly backupExport: BackupExportController;
    readonly backupImport: BackupImportController<any, any, any>;
    readonly backupRestore: BackupRestoreController<any, any>;
    readonly backupFile: BackupFileController;
    readonly normalizeImportedPanelSettings: (settings: any) => any;
    readonly gridColsForImportedSettings: (settings: any) => number;
    readonly nativePanelConfig?: NativePanelConfigController;
    readonly codec: ConfigCodecFeature;
    readonly configPersistence: Pick<ConfigPersistenceFeature, "subpageEntityKeys">;
    readonly backupContract: Pick<BackupContractFeature, "createBackupConfig" | "normalizeButtonConfig">;
    readonly runtime: UiRuntimeState;
    readonly core: Pick<CoreFeature, "syncPreviewOrientation">;
    readonly screenScheduleState: ScreenScheduleStateFeature;
    readonly screensaverTimeout: ScreensaverTimeoutFeature;
    readonly firmwareUpdate: FirmwareUpdateFeature;
    readonly clockBar: ClockBarFeature;
    readonly entityState: Pick<EntityStateFeature, "entityName" | "entityNameForSlot">;
    readonly shell: Pick<ControlsShellFeature, "switchTab"> & Partial<Pick<ControlsShellFeature, "showBanner">>;
    readonly requestApi: ApplicationApiFeature;
    readonly statusPreview: Pick<AppStatusPreviewFeature, "syncInput">;
    readonly grid: Pick<GridFeature, "applyImportedButtonOrder" | "cancelMainGridSave" | "flushMainGridSave" | "serializeGrid">;
    readonly schedulePostApi: ScreenSchedulePostApiFeature;
    readonly clockBarPostApi: ClockBarPostApiFeature;
    readonly settingsHelpers: Pick<SettingsPageHelpersFeature, "syncClockScreensaverControls">;
    readonly preview: Pick<PreviewRenderFeature, "render">;
    readonly buttonSettings: Pick<ButtonSettingsFeature, "render">;
}

export interface AppBackupFeature {
    backupExportFileName(value?: unknown): string;
    normalizeImportedPanelSettings(settings?: unknown): unknown;
    gridColsForImportedSettings(settings?: unknown): number;
    exportConfig(): Promise<void>;
    importConfig(): void;
}

export function createAppBackupFeature(controllers: AppBackupControllers): AppBackupFeature {
    const { syncClockScreensaverControls } = controllers.settingsHelpers;
    const { render: renderPreview } = controllers.preview;
    const { render: renderButtonSettings } = controllers.buttonSettings;
    const { subpageEntityKeys } = controllers.configPersistence;
    const { createBackupConfig, normalizeButtonConfig: backupNormalizeButtonConfig } = controllers.backupContract;
    const { entityName, entityNameForSlot } = controllers.entityState;
    const { switchTab } = controllers.shell;
    const requestApi = controllers.requestApi;
    const { syncInput,  } = controllers.statusPreview;
    const { applyImportedButtonOrder, cancelMainGridSave, serializeGrid } = controllers.grid;
    const {
        postBrightnessMode,
        postDisplayBacklightBrightness,
        postBrightnessDawnTime,
        postBrightnessDuskTime,
        postScreenSchedulePreferences,
    } = controllers.schedulePostApi;
    const {
        postClockBrightnessDay,
        postClockBrightnessNight,
        postClockScreensaver,
        postClockBar,

        postClockBarTime,
        postClockBarNightMode,
        postNetworkStatusIcon,

        postSubpageChevron,
        postReturnHomeOnAppSwitch,
        postSubpageTitleBar,
    } = controllers.clockBarPostApi;
    const {
        postText,
        postSwitch,
        postSelect,
        postScreensaverMode,
        postFirmwareAutoUpdate,
        postFirmwareUpdateFrequency,
        postScreensaverAction,
        postScreensaverDimmedBrightness,
        postScreensaverDimmedBrightnessDay,
        postScreensaverDimmedBrightnessNight,
        postScreensaverTimeout,
        postNumber,
    } = requestApi;
    const { syncPreviewOrientation } = controllers.core;
    const {
        buildSubpageGrid,
        parseButtonConfig,
        parseSubpageConfig,
        serializeButtonConfig,
        serializeSubpageConfig,
    } = controllers.codec;
    const els = controllers.runtime.els;
    const { syncUi: syncScreenScheduleUi } = controllers.screenScheduleState;
    const { syncUi: syncScreensaverTimeoutUi } = controllers.screensaverTimeout;
    const { controlsVisible: firmwareUpdateControlsVisible, syncUi: syncFirmwareUpdateUi } = controllers.firmwareUpdate;
    const {

        syncUi: syncClockBarUi,

    } = controllers.clockBar;
    // ── Export / Import ────────────────────────────────────────────────────
    var backupExportController: BackupExportController = controllers.backupExport;
    function backupExportScreenSizeSlug(this: any, value?: any) {
        return backupExportController.screenSizeSlug(value);
    }
    function backupExportFileDate(this: any, value?: any) {
        return backupExportController.fileDate(value);
    }
    function backupExportFileName(this: any, value?: any) {
        return backupExportController.fileName(controllers.layout.config.screenSize, value, controllers.identity?.backup());
    }
    function normalizeImportedPanelSettings(this: any, settings?: any) {
        return controllers.normalizeImportedPanelSettings(settings);
    }
    function gridColsForImportedSettings(this: any, importedSettings?: any) {
        return controllers.gridColsForImportedSettings(importedSettings);
    }
    var backupImportController: BackupImportController<any, any, any> = controllers.backupImport;
    var backupRestoreController: BackupRestoreController<any, any> = controllers.backupRestore;
    var backupFileController: BackupFileController = controllers.backupFile;
    function downloadBackupConfig(this: any, data: any, identity?: PanelIdentityBackup) {
        if (identity) data.identity = identity;
        backupFileController.download(data, backupExportController.fileName(controllers.layout.config.screenSize, undefined, identity));
    }
    function addNativeConfigToBackup(this: any, data: any, nativeDocumentBytes?: Uint8Array) {
        return backupExportController.addNativeConfig(data, {
            "deviceProfile": controllers.layout.deviceId,
            "buttons": state.buttons,
            "subpages": state.subpages,
            "buttonOrder": data.button_order,
            "buttonOnColor": data.button_on_color,
            ...(nativeDocumentBytes ? { nativeDocumentBytes } : {}),
        });
    }
    async function exportConfig(this: any) {
        let identity: PanelIdentityBackup | undefined;
        let identityUnavailable = false;
        try {
            await controllers.identity?.load();
            identity = controllers.identity?.backup();
        } catch { identityUnavailable = true; }
        let nativeDocumentBytes: Uint8Array | undefined;
        let nativeDocument: PanelConfigDocument | undefined;
        try {
            await controllers.waitForInitialState();
            nativeDocumentBytes = await controllers.nativePanelConfig?.readForBackup() ?? undefined;
            if (nativeDocumentBytes) {
                nativeDocument = decodeNativeConfigDocument(nativeDocumentBytes);
                if (removeRetiredPanelRecords(nativeDocument, controllers.codec, isRetiredLayoutCard)) {
                    nativeDocumentBytes = nativeConfigDocumentVersion(nativeDocumentBytes) === 2
                        ? encodePanelPageDocument(nativeDocument)
                        : EspDesktopModel.encodePanelConfig(nativeDocument);
                }
            }
        } catch {
            controllers.shell.showBanner?.("Could not export the backup. Check that changes have saved and the panel is connected, then try again.", "error");
            return;
        }
        const theme = decodeDisplayThemePreferences(nativeDocument?.settings[DISPLAY_THEME_PREFERENCES]) ??
            displayThemePreferencesFromState(state);
        // Project the same saved layout into the portable part of the backup.
        // SSE state can still be arriving or can lag another browser's edits.
        const savedSchedule = decodeScreenSchedulePreferences(nativeDocument?.settings[SCREEN_SCHEDULE_PREFERENCES]);
        const schedule = savedSchedule ?? state;
        const scheduleEnabled = savedSchedule ? savedSchedule.scheduleTrigger === "time" : state.scheduleEnabled;
        const nativeGrid = nativeDocument ? EspDesktopModel.parseGridOrder(
            nativeDocument.settings.button_order, controllers.layout.numSlots, controllers.layout.gridCols,
        ) : undefined;
        var data: any = createBackupConfig({
            device: controllers.layout.deviceId,
            slots: controllers.layout.numSlots,
            exported_at: new Date().toISOString(),
            grid: nativeGrid?.grid ?? state.grid,
            sizes: nativeGrid?.sizes ?? state.sizes,
            button_order: nativeDocument ? nativeDocument.settings.button_order || "" : serializeGrid(state.grid),
            button_on_color: nativeDocument ? nativeDocument.settings.button_on_color || "" : state.onColor,
            buttons: nativeDocument ? Array.from({ length: controllers.layout.numSlots }, (_, index) =>
                parseButtonConfig(nativeDocument.buttons[index + 1] || "")) : state.buttons,
            subpages: nativeDocument ? Object.fromEntries(Object.entries(nativeDocument.subpages).map(
                ([slot, value]) => [slot, parseSubpageConfig(value)],
            )) : state.subpages,
            settings: {
                clock_bar: state.clockBarOn,
                clock_bar_time: state.clockBarTimeOn,
                clock_bar_night_mode: state.clockBarNightModeOn,
                network_status_icon: state.networkStatusOn,

                subpage_chevron: state.subpageChevronsOn,
                auto_open_app_subpages: nativeAppSubpagePreference(nativeDocument?.settings) ??
                    (controllers.nativePanelConfig?.client?.supportsAppSubpagePreference() ? state.autoOpenAppSubpages : undefined),
                return_home_on_app_switch: state.returnHomeOnAppSwitch,
                subpage_title_bar: state.subpageTitleBarOn,
                timezone: state.timezone,
                language: normalizeLanguage(state.language),
                clock_format: state.clockFormat,
                ntp_server_1: state.ntpServer1,
                ntp_server_2: state.ntpServer2,
                ntp_server_3: state.ntpServer3,
                screensaver_mode: getActiveScreensaverMode(),
                clock_date: state.clockDateOn,
                firmware_auto_update: !!state.autoUpdate,
                firmware_update_frequency: state.updateFrequency,
                screensaver_action: normalizeScreensaverAction(state.screensaverAction),
                clock_screensaver: state.clockScreensaverOn,
                clock_brightness: state.clockBrightnessDay,
                clock_brightness_day: state.clockBrightnessDay,
                clock_brightness_night: state.clockBrightnessNight,
                screensaver_dimmed_brightness: normalizeScreensaverDimmedBrightness(state.screensaverDimmedBrightness),
                screensaver_dimmed_brightness_day: normalizeScreensaverDimmedBrightness(state.screensaverDimmedBrightnessDay),
                screensaver_dimmed_brightness_night: normalizeScreensaverDimmedBrightness(state.screensaverDimmedBrightnessNight),
                screensaver_timeout: state.screensaverTimeout,
                screen_rotation: state.screenRotation,
            },
            screen: {
                brightness_day: Math.round(state.brightnessDayVal),
                brightness_night: Math.round(state.brightnessNightVal),
                brightness_mode: normalizeBrightnessMode(state.brightnessMode),
                theme_mode: theme.themeMode,
                default_icon_size: state.defaultIconSizeSupported ? state.defaultIconSize : undefined,
                card_curve: state.cardCurveSupported ? normalizeCardCurve(state.cardCurve) : undefined,
                theme_auto_method: theme.themeAutoMethod,
                theme_light_start: theme.themeLightStart,
                theme_dark_start: theme.themeDarkStart,
                theme_sunrise_offset: theme.themeSunriseOffset,
                theme_sunset_offset: theme.themeSunsetOffset,
                manual_brightness: Math.round(state.manualBrightnessVal),
                brightness_dawn_time: normalizeTimeOfDay(state.brightnessDawnTime, "06:00"),
                brightness_dusk_time: normalizeTimeOfDay(state.brightnessDuskTime, "18:00"),
                schedule_trigger: normalizeScheduleTrigger(schedule.scheduleTrigger, scheduleEnabled),
                schedule_enabled: !!scheduleEnabled,
                schedule_on_hour: normalizeHour(schedule.scheduleOnHour, 6),
                schedule_off_hour: normalizeHour(schedule.scheduleOffHour, 23),
                schedule_mode: normalizeScheduleMode(schedule.scheduleMode),
                schedule_wake_timeout: normalizeScheduleWakeTimeout(schedule.scheduleWakeTimeout),
                schedule_wake_brightness: normalizeScheduleWakeBrightness(schedule.scheduleWakeBrightness),
                schedule_dimmed_brightness: normalizeScheduleDimmedBrightness(schedule.scheduleDimmedBrightness),
                schedule_clock_brightness: normalizeScheduleClockBrightness(schedule.scheduleClockBrightness),
                schedule_clock_text_color: normalizeHexColor(schedule.scheduleClockTextColor, "FFFFFF"),
            },
        } as any);
        downloadBackupConfig(addNativeConfigToBackup(data, nativeDocumentBytes), identity);
        if (identityUnavailable) controllers.shell.showBanner?.(
            "Backup exported without the panel name because naming is unavailable.", "warning");
    }
    function importConfig(this: any) {
        backupFileController.import(function (data: any) {
            void (async () => {
                // Validate the complete backup before offering identity changes.
                const validatedPlan = backupImportController.plan(data, { device: controllers.layout.deviceId, slots: controllers.layout.numSlots });
                const themeScreen = validatedPlan.backupPlan.screen || {};
                for (const key of ["theme_sunrise_offset", "theme_sunset_offset"]) {
                    if (Object.prototype.hasOwnProperty.call(themeScreen, key) && parseThemeSunOffset(themeScreen[key]) === null)
                        throw new Error("Invalid " + key.replace(/_/g, " ") + " in backup; use a whole number from -180 to 180 minutes.");
                }
                const restoredName = await controllers.identity?.chooseRestoreName(data);
                if (restoredName === null) return;
                async function applyBackupRestorePlan(this: any, plannedImport: any) {
                var importedSettings: any = plannedImport.importedSettings;
                var importedGridCols: any = plannedImport.importedGridCols;
                var backupPlan: any = plannedImport.backupPlan;
                var nativeDocument: PanelConfigDocument = {
                    deviceProfile: controllers.layout.deviceId,
                    buttons: {},
                    subpages: {},
                    settings: {
                        button_order: "",
                        button_on_color: backupPlan.config.button_on_color,
                    },
                };
                for (var nativeButtonIndex: any = 0; nativeButtonIndex < controllers.layout.numSlots; nativeButtonIndex++) {
                    var nativeButtonValue: any = serializeButtonConfig(backupNormalizeButtonConfig(backupPlan.buttons[nativeButtonIndex]));
                    if (nativeButtonValue)
                        nativeDocument.buttons[nativeButtonIndex + 1] = nativeButtonValue;
                }
                for (var nativeSubpageKey in backupPlan.subpages) {
                    var nativeSubpageValue: any = serializeSubpageConfig(backupPlan.subpages[nativeSubpageKey]);
                    if (nativeSubpageValue)
                        nativeDocument.subpages[Number(nativeSubpageKey)] = nativeSubpageValue;
                }
                var backedUpNativeConfig: any = backupPlan.config.native_config;
                const exactGraph = backedUpNativeConfig?.document_version === 2 &&
                    backedUpNativeConfig.device_profile === controllers.layout.deviceId;
                let exactLayoutBytes: Uint8Array | undefined;
                if (backedUpNativeConfig &&
                    backedUpNativeConfig.device_profile === controllers.layout.deviceId) {
                    const bytes = decodeNativeConfigBackupPayload(backedUpNativeConfig);
                    nativeDocument = decodeNativeConfigDocument(bytes);
                    if (exactGraph) exactLayoutBytes = bytes;
                }
                if (!exactGraph) {
                    nativeDocument.settings.button_order = String(nativeDocument.settings.button_order || backupPlan.button_order || "");
                    nativeDocument.settings.button_on_color = String(nativeDocument.settings.button_on_color || backupPlan.config.button_on_color || "");
                    var parsedButtonOrder: any = EspDesktopModel.parseGridOrder(
                        nativeDocument.settings.button_order,
                        controllers.layout.numSlots,
                        importedGridCols,
                        {});
                    nativeDocument.settings.button_order = EspDesktopModel.serializeGridOrder(
                        parsedButtonOrder.grid,
                        parsedButtonOrder.sizes);
                }
                if (removeRetiredPanelRecords(nativeDocument, controllers.codec)) exactLayoutBytes = undefined;

                function readLegacyText(name: string) {
                    return requestApi.getJsonFirst(requestApi.entityDetailPaths("text", [name], "state"));
                }
                function rejectBackup(message: string): never {
                    requestApi.postQueueError = true;
                    throw Object.assign(new Error(message), { backupMessage: message });
                }
                function queueLegacyLayoutRestore() {
                    if (Object.keys(nativeDocument.settings)
                        .some(key => key !== "button_order" && key !== "button_on_color")) {
                        rejectBackup(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE);
                    }
                    return restoreLegacyLayoutDocument(nativeDocument, {
                        slotCount: controllers.layout.numSlots,
                        subpageEntityKeys: subpageEntityKeys(),
                        entityName: entityName,
                        entityNameForSlot: entityNameForSlot,
                        splitSubpageConfigChunks: EspDesktopModel.splitSubpageConfigChunks,
                        postText: requestApi.postTextLegacy,
                        readText: readLegacyText,
                    }).then(function (result: any) {
                        if (!result.ok) {
                            rejectBackup(legacyRestoreFailureMessage(result));
                        }
                        return "legacy-fallback";
                    });
                }
                // Finish a pending grid move before the replacement so its
                // debounce cannot publish the old order after the restore.
                controllers.grid.flushMainGridSave();
                await requestApi.postQueue;
                var nativeController: any = controllers.nativePanelConfig;
                var nativeAvailability: any = nativeController && nativeController.client
                    ? await nativeController.waitForDiscovery()
                    : "legacy-fallback";
                if (nativeAvailability === "failed") {
                    rejectBackup("Could not confirm that this device can safely restore the layout. Check the connection and try again.");
                }
                if (panelPageDocumentDepth(nativeDocument) > 1 &&
                    (nativeAvailability !== true || nativeController.writableNavigationDepth() < 2))
                    rejectBackup(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE);
                if (nativeBackupHasInactiveRecords(nativeDocument, controllers.layout.numSlots) &&
                    nativeController?.client?.preservesInactiveRecords() !== true) {
                    rejectBackup(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE);
                }
                const savedAppSubpagePreference = nativeAppSubpagePreference(nativeDocument.settings);
                if (Object.hasOwn(nativeDocument.settings, APP_SUBPAGE_PREFERENCE) && savedAppSubpagePreference === undefined)
                    rejectBackup("Invalid backup value for automatic app switching.");
                const appSubpagePreference = savedAppSubpagePreference ??
                    (typeof backupPlan.settings?.auto_open_app_subpages === "boolean"
                        ? importedSettings.autoOpenAppSubpages : undefined);
                const appSubpageUpdateRequired = "Update the panel firmware before restoring the automatic app switching setting from this backup.";
                if (appSubpagePreference !== undefined) {
                    if (nativeAvailability !== true || nativeController?.client?.supportsAppSubpagePreference?.() !== true)
                        rejectBackup(appSubpageUpdateRequired);
                    nativeDocument.settings[APP_SUBPAGE_PREFERENCE] = appSubpagePreference ? "1" : "0";
                }
                const nativeTheme = nativeAvailability === true &&
                    nativeController?.client?.supportsDisplayThemePreferences?.() === true;
                const legacyThemePatch = legacyDisplayThemePatch(backupPlan.screen);
                if (Object.hasOwn(nativeDocument.settings, DISPLAY_THEME_PREFERENCES)) {
                    if (!decodeDisplayThemePreferences(nativeDocument.settings[DISPLAY_THEME_PREFERENCES]))
                        rejectBackup("Invalid display theme settings in this backup.");
                    if (!nativeTheme)
                        rejectBackup("Update the panel firmware before restoring the display theme settings in this backup.");
                }
                const scheduleRecord = nativeDocument.settings[SCREEN_SCHEDULE_PREFERENCES];
                const nativeSchedule = decodeScreenSchedulePreferences(scheduleRecord);
                if (scheduleRecord !== undefined) {
                    if (!nativeSchedule) rejectBackup("Invalid night schedule in this backup.");
                    if (nativeAvailability !== true || !nativeController.client?.supportsScreenSchedulePreferences())
                        rejectBackup(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE);
                }
                const themeRestore = nativeTheme
                    ? { legacy: displayThemePreferencesFromState(state), patch: legacyThemePatch }
                    : undefined;
                var layoutRestoreResult: any;
                if (nativeAvailability === "legacy-fallback") {
                    layoutRestoreResult = await queueLegacyLayoutRestore();
                }
                else {
                    var nativeRestore: any = nativeController.writeDocument(nativeDocument, exactLayoutBytes, themeRestore);
                    layoutRestoreResult = nativeRestore ? await nativeRestore : "failed";
                    if (layoutRestoreResult === "legacy-fallback") {
                        if (appSubpagePreference !== undefined) rejectBackup(appSubpageUpdateRequired);
                        if (nativeTheme) rejectBackup("The panel disconnected while restoring the display theme settings.");
                        layoutRestoreResult = await queueLegacyLayoutRestore();
                    }
                    else if (layoutRestoreResult === "firmware-update-required") {
                        rejectBackup(NATIVE_BACKUP_UPDATE_REQUIRED_MESSAGE);
                    }
                    else if (layoutRestoreResult === "mirror-failed") {
                        // The native document is durable, but the controller has
                        // already warned that its downgrade copy is stale.
                        requestApi.postQueueError = true;
                    }
                    else if (layoutRestoreResult !== "saved") {
                        rejectBackup("The layout could not be restored. No other backup settings were changed.");
                    }
                }

                const savedSchedule = nativeController?.client?.lastDocument?.()?.settings[SCREEN_SCHEDULE_PREFERENCES];
                if (nativeAvailability === true && savedSchedule) {
                    nativeDocument.settings[SCREEN_SCHEDULE_PREFERENCES] = savedSchedule;
                }
                if (nativeSchedule) {
                    Object.assign(state, nativeSchedule);
                    state.scheduleEnabled = nativeSchedule.scheduleTrigger === "time";
                    syncScreenScheduleUi();
                }
                if (nativeTheme) {
                    const savedTheme = nativeController.client?.lastDocument?.()?.settings[DISPLAY_THEME_PREFERENCES];
                    if (savedTheme) nativeDocument.settings[DISPLAY_THEME_PREFERENCES] = savedTheme;
                }
                Object.assign(state,
                    decodeDisplayThemePreferences(nativeDocument.settings[DISPLAY_THEME_PREFERENCES]) ?? legacyThemePatch);
                syncThemeSettingsUi(state, controllers.runtime);

                // Do not change the editor or unrelated device settings until
                // the complete layout has been accepted by the target firmware.
                cancelMainGridSave();
                var activeGridCols: any = controllers.layout.gridCols;
                controllers.layout.gridCols = importedGridCols;
                try {
                    state.buttons = [];
                    for (var canonicalButtonIndex: any = 0; canonicalButtonIndex < controllers.layout.numSlots; canonicalButtonIndex++)
                        state.buttons[canonicalButtonIndex] = parseButtonConfig(nativeDocument.buttons[canonicalButtonIndex + 1] || "");
                    state.subpages = {};
                    state.subpageRaw = {};
                    for (var canonicalSubpageKey in nativeDocument.subpages) {
                        var canonicalSubpage: any = parseSubpageConfig(nativeDocument.subpages[Number(canonicalSubpageKey)] || "");
                        buildSubpageGrid(canonicalSubpage);
                        state.subpages[canonicalSubpageKey] = canonicalSubpage;
                    }
                    const displayOrder = applyImportedButtonOrder(nativeDocument.settings.button_order || "", {});
                    if (!exactGraph) nativeDocument.settings.button_order = displayOrder;
                }
                finally {
                    controllers.layout.gridCols = activeGridCols;
                }
                state.nativePanelDocument = { ...nativeDocument, buttons: { ...nativeDocument.buttons }, subpages: { ...nativeDocument.subpages }, settings: { ...nativeDocument.settings } };
                state.nativeHasNestedPages = panelPageDocumentDepth(nativeDocument) > 1;
                state.nativeConfigReadOnly = false;
                state.subpageSavePending = {};
                state.pendingButtonOrderRaw = nativeDocument.settings.button_order || "";
                state.onColor = nativeDocument.settings.button_on_color || backupPlan.config.button_on_color || WEB_UI_COLORS.primary;
                if (els.setOnColor && els.setOnColor._syncColor)
                    els.setOnColor._syncColor(state.onColor);
                if (appSubpagePreference !== undefined) {
                    state.autoOpenAppSubpages = appSubpagePreference;
                    if (els.setAutoOpenAppSubpages) els.setAutoOpenAppSubpages.checked = appSubpagePreference;
                }
                if (backupPlan.settings) {
                    var s: any = backupPlan.settings;

                    postClockBar(importedSettings.clockBar);
                    postClockBarTime(importedSettings.clockBarTime);
                    postClockBarNightMode(importedSettings.clockBarNightMode);
                    postNetworkStatusIcon(importedSettings.networkStatusIcon);

                    postSubpageChevron(importedSettings.subpageChevron);
                    postReturnHomeOnAppSwitch(importedSettings.returnHomeOnAppSwitch);
                    postSubpageTitleBar(importedSettings.subpageTitleBar);
                    var importedTimezone: any = importedSettings.timezone;
                    var importedLanguage: any = importedSettings.language;
                    var importedClockFormat: any = importedSettings.clockFormat;
                    var hasNtpServer1: any = importedSettings.hasNtpServer1;
                    var hasNtpServer2: any = importedSettings.hasNtpServer2;
                    var hasNtpServer3: any = importedSettings.hasNtpServer3;
                    var importedNtpServer1: any = importedSettings.ntpServer1;
                    var importedNtpServer2: any = importedSettings.ntpServer2;
                    var importedNtpServer3: any = importedSettings.ntpServer3;
                    if (s.timezone)
                        postSelect(entityName("screen_timezone"), importedTimezone);
                    if (s.language)
                        postSelect(entityName("screen_language"), importedLanguage);

                    if (s.clock_format)
                        postSelect(entityName("screen_clock_format"), importedClockFormat);
                    if (hasNtpServer1) {
                        postText(entityName("screen_ntp_server_1"), importedNtpServer1);
                    }
                    if (hasNtpServer2) {
                        postText(entityName("screen_ntp_server_2"), importedNtpServer2);
                    }
                    if (hasNtpServer3) {
                        postText(entityName("screen_ntp_server_3"), importedNtpServer3);
                    }
                    var importedScreensaverMode: any = importedSettings.screensaverMode;
                    postScreensaverMode(importedScreensaverMode);
                    if (state.clockDateSupported) controllers.clockBarPostApi.postClockDate(importedSettings.clockDate);
                    if (firmwareUpdateControlsVisible()) {
                        postFirmwareAutoUpdate(importedSettings.autoUpdate);
                        postFirmwareUpdateFrequency(importedSettings.updateFrequency);
                    }
                    var importedScreensaverAction: any = importedSettings.screensaverAction;
                    if (importedScreensaverAction === "camera" &&
                        (!controllers.layout.config.features?.cameraScreensaver || !state.screensaverCameraSupported))
                        importedScreensaverAction = "off";
                    var importedScreensaverDimmedBrightness: any = importedSettings.screensaverDimmedBrightness;
                    var importedScreensaverDimmedBrightnessDay: any = importedSettings.screensaverDimmedBrightnessDay;
                    var importedScreensaverDimmedBrightnessNight: any = importedSettings.screensaverDimmedBrightnessNight;
                    var importedClockBrightnessDay: any = importedSettings.clockBrightnessDay;
                    var importedClockBrightnessNight: any = importedSettings.clockBrightnessNight;
                    postScreensaverAction(importedScreensaverAction);
                    postClockScreensaver(importedScreensaverAction === "clock");
                    postClockBrightnessDay(importedClockBrightnessDay);
                    postClockBrightnessNight(importedClockBrightnessNight);
                    postScreensaverDimmedBrightness(importedScreensaverDimmedBrightness);
                    postScreensaverDimmedBrightnessDay(importedScreensaverDimmedBrightnessDay);
                    postScreensaverDimmedBrightnessNight(importedScreensaverDimmedBrightnessNight);
                    postScreensaverTimeout(importedSettings.screensaverTimeout);
                    var importedScreenRotation: any = importedSettings.screenRotation;
                    if (controllers.layout.config.features && controllers.layout.config.features.screenRotation)
                        postSelect(entityName("screen_rotation"), importedScreenRotation);

                    state.clockBarOn = importedSettings.clockBar;
                    state.clockBarTimeOn = importedSettings.clockBarTime;
                    state.clockBarNightModeOn = importedSettings.clockBarNightMode;
                    state.networkStatusOn = importedSettings.networkStatusIcon;

                    state.subpageChevronsOn = importedSettings.subpageChevron;
                    state.returnHomeOnAppSwitch = importedSettings.returnHomeOnAppSwitch;
                    state.subpageTitleBarOn = importedSettings.subpageTitleBar;
                    if (els.setReturnHomeOnAppSwitch) els.setReturnHomeOnAppSwitch.checked = state.returnHomeOnAppSwitch;
                    state.timezone = importedTimezone;
                    state.language = importedLanguage;
                    state.clockFormat = importedClockFormat;
                    state.ntpServer1 = importedNtpServer1;
                    state.ntpServer2 = importedNtpServer2;
                    state.ntpServer3 = importedNtpServer3;
                    state.customNtpServers = hasCustomNtpServers();
                    state.screensaverMode = importedScreensaverMode;
                    state._screensaverModeReceived = true;
                    state.presenceEntity = importedSettings.presenceSensorEntity;
                    state.screensaverCameraEntity = importedSettings.screensaverCameraEntity;
                    state.screensaverMetadataEntity = importedSettings.screensaverMetadataEntity;
                    state.metadataOverlayOn = importedSettings.metadataOverlay;
                    state.screensaverCameraImageMode = normalizeScreensaverCameraImageMode(importedSettings.screensaverCameraImageMode);
                    state.clockDateOn = importedSettings.clockDate;
                    state.clockOverlayOn = importedSettings.clockOverlay;
                    state.autoUpdate = importedSettings.autoUpdate;
                    state.updateFrequency = importedSettings.updateFrequency;
                    state.screensaverAction = importedScreensaverAction;
                    state._screensaverActionReceived = true;
                    state.clockScreensaverOn = importedScreensaverAction === "clock";
                    state.clockBrightnessDay = importedClockBrightnessDay;
                    state.clockBrightnessNight = importedClockBrightnessNight;
                    state.screensaverDimmedBrightness = importedScreensaverDimmedBrightness;
                    state.screensaverDimmedBrightnessDay = importedScreensaverDimmedBrightnessDay;
                    state.screensaverDimmedBrightnessNight = importedScreensaverDimmedBrightnessNight;
                    state.screensaverTimeout = importedSettings.screensaverTimeout;
                    state.screenRotation = importedScreenRotation;

                    syncClockBarUi();

                    syncInput(els.setPresence, state.presenceEntity);
                    syncInput(els.setScreensaverCamera, state.screensaverCameraEntity);
                    syncInput(els.setScreensaverMetadata, state.screensaverMetadataEntity);
                    syncInput(els.setSchedulePresence, state.scheduleSensorEntity);
                    if (els.setAutoUpdate)
                        els.setAutoUpdate.checked = state.autoUpdate;
                    if (els.setUpdateFreq)
                        els.setUpdateFreq.value = state.updateFrequency;
                    syncFirmwareUpdateUi();
                    if (els.setTimezone)
                        els.setTimezone.value = state.timezone;
                    syncLanguageSelect(controllers.runtime);
                    if (els.setClockFormat)
                        els.setClockFormat.value = state.clockFormat;
                    syncNtpServerUi(controllers.runtime, syncInput);
                    syncClockScreensaverControls();
                    syncScreensaverTimeoutUi();
                    if (els.setScreenRotation)
                        els.setScreenRotation.value = state.screenRotation;
                    syncPreviewOrientation();
                    if (els.setSsMode)
                        els.setSsMode(getActiveScreensaverMode());

                }
                var screenSettings: any = backupPlan.screen;
                if (screenSettings) {
                    var importedScreenSettings: any = EspDesktopModel.normalizeBackupScreenSettings(screenSettings, {
                        scheduleWakeBrightness: state.scheduleWakeBrightness,
                        scheduleDimmedBrightness: state.scheduleDimmedBrightness,
                        scheduleClockBrightness: state.scheduleClockBrightness,
                        scheduleClockTextColor: state.scheduleClockTextColor,
                        scheduleSensorActivation: state.scheduleSensorActivation,
                        manualBrightnessVal: state.manualBrightnessVal,
                    }, importedSettings ? importedSettings.presenceSensorEntity : state.presenceEntity);
                    state.brightnessDayVal = importedScreenSettings.brightnessDayVal;
                    state.brightnessNightVal = importedScreenSettings.brightnessNightVal;
                    state.brightnessMode = importedScreenSettings.brightnessMode;
                    if (state.defaultIconSizeSupported && Object.prototype.hasOwnProperty.call(screenSettings, "default_icon_size")) {
                        state.defaultIconSize = normalizeCardIconSize(screenSettings.default_icon_size);
                        syncDefaultIconSizeUi(state, controllers.runtime);
                    }
                    if (state.cardCurveSupported && Object.prototype.hasOwnProperty.call(screenSettings, "card_curve")) {
                        state.cardCurve = normalizeCardCurve(screenSettings.card_curve);
                        syncCardCurveUi(state, controllers.runtime);
                        syncPreviewOrientation(true);
                    }
                    state.manualBrightnessVal = importedScreenSettings.manualBrightnessVal;
                    state.brightnessDawnTime = importedScreenSettings.brightnessDawnTime;
                    state.brightnessDuskTime = importedScreenSettings.brightnessDuskTime;
                    if (!nativeSchedule) {
                        Object.assign(state, screenSchedulePreferencesFromState(importedScreenSettings));
                        state.scheduleEnabled = importedScreenSettings.scheduleEnabled;
                        state.scheduleSensorActivation = importedScreenSettings.scheduleSensorActivation;
                        state.scheduleSensorEntity = importedScreenSettings.scheduleSensorEntity;
                    }
                    postNumber(entityName("screen_daytime_brightness"), state.brightnessDayVal);
                    postNumber(entityName("screen_nighttime_brightness"), state.brightnessNightVal);
                    postBrightnessMode(state.brightnessMode);
                    if (!nativeTheme) {
                        if (legacyThemePatch.themeLightStart !== undefined)
                            requestApi.postText(entityName("screen_theme_light_start"), state.themeLightStart);
                        if (legacyThemePatch.themeDarkStart !== undefined)
                            requestApi.postText(entityName("screen_theme_dark_start"), state.themeDarkStart);
                        if (legacyThemePatch.themeSunriseOffset !== undefined)
                            requestApi.postNumber(entityName("screen_theme_sunrise_offset"), state.themeSunriseOffset);
                        if (legacyThemePatch.themeSunsetOffset !== undefined)
                            requestApi.postNumber(entityName("screen_theme_sunset_offset"), state.themeSunsetOffset);
                        if (legacyThemePatch.themeAutoMethod !== undefined)
                            requestApi.postSelect(entityName("screen_theme_auto_method"), state.themeAutoMethod);
                        if (legacyThemePatch.themeMode !== undefined)
                            requestApi.postSelect(entityName("screen_theme_mode"), state.themeMode);
                    }
                    if (state.defaultIconSizeSupported && Object.prototype.hasOwnProperty.call(screenSettings, "default_icon_size"))
                        requestApi.postSelect(entityName("screen_default_icon_size"), state.defaultIconSize.charAt(0).toUpperCase() + state.defaultIconSize.slice(1));
                    if (state.cardCurveSupported && Object.prototype.hasOwnProperty.call(screenSettings, "card_curve"))
                        requestApi.postSelect(entityName("screen_card_curve"), state.cardCurve);
                    if (state.brightnessMode === "manual")
                        postDisplayBacklightBrightness(state.manualBrightnessVal);
                    postBrightnessDawnTime(state.brightnessDawnTime);
                    postBrightnessDuskTime(state.brightnessDuskTime);
                    if (!nativeSchedule && !(await postScreenSchedulePreferences(screenSchedulePreferencesFromState(state)))) {
                        requestApi.postQueueError = true;
                    }
                    if (els.setDayBrightness) {
                        els.setDayBrightness.value = state.brightnessDayVal;
                        els.setDayBrightnessVal.textContent = Math.round(state.brightnessDayVal) + "%";
                    }
                    if (els.setNightBrightness) {
                        els.setNightBrightness.value = state.brightnessNightVal;
                        els.setNightBrightnessVal.textContent = Math.round(state.brightnessNightVal) + "%";
                    }
                    syncScreenScheduleUi();
                    syncThemeSettingsUi(state, controllers.runtime);
                }
                state.selectedSlots = [];
                state.lastClickedSlot = -1;
                renderPreview();
                renderButtonSettings();
                switchTab("screen");
                await requestApi.postQueue;
                if (!requestApi.postQueueError) {
                    await clearScreensaverPinForRestore(resetAwareFetch);
                }
                if (typeof restoredName === "string" && !requestApi.postQueueError) {
                    try { await controllers.identity?.saveAndRestart(restoredName); }
                    catch (error) {
                        throw Object.assign(new Error("Configuration restored, but panel naming or restart failed: " + (error as Error).message), {
                            backupMessage: "Configuration restored, but panel naming or restart failed: " + (error as Error).message,
                        });
                    }
                }
                if (!controllers.nativePanelConfig?.homeAssistantSupportEnabled() && !requestApi.postQueueError) {
                    const warning = legacyHomeAssistantWarning(legacyHomeAssistantCards(nativeDocument));
                    if (warning) backupPlan.warnings.push(warning);
                }
                return layoutRestoreResult;
                }
                backupRestoreController.restore(data, {
                    device: controllers.layout.deviceId,
                    slots: controllers.layout.numSlots,
                }, applyBackupRestorePlan);
            })().catch((error) => {
                controllers.shell.showBanner?.((error as Error).message || "Could not restore backup", "error");
            });
        });
    }
    return {
        backupExportFileName: (value) => backupExportFileName(value),
        normalizeImportedPanelSettings: (settings) => normalizeImportedPanelSettings(settings),
        gridColsForImportedSettings: (settings) => gridColsForImportedSettings(settings),
        exportConfig: () => exportConfig(),
        importConfig: () => importConfig(),
    };
}
