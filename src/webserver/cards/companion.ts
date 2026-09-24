import { renderCompanionStorageSelector } from "./companion_storage";
import { decodeCompanionCard, encodeCompanionCard, companionMetricForEntity } from "../model/companion_card_codec";
import { configOptionEnabled, configOptionValue, setConfigOption, setConfigOptionValue } from "../model/config_primitives";
import { createCompanionCatalogue } from "../api/companion_catalogue";
import type { CompanionAction } from "../api/companion_catalogue";
export type { CompanionAction } from "../api/companion_catalogue";
import {
    cardContractAllowInSubpage,
    cardContractCardLabel,
    cardContractDefaultConfig,
    cardContractHidden,
    cardContractPickerKey,
    CARD_RUNTIME_SPECS,
} from "../generated/card_contract";
import {
    COMPANION_CARD_MODES,
    COMPANION_SYSTEM_METRICS,
    COMPANION_WINDOW_ACTIONS,
} from "../generated/companion_capabilities";
import {
    companionCardDefaultIcon,
    companionCardModeOptions,
    type CompanionCardModeId,
} from "../model/companion_card";
export {
    COMPANION_SYSTEM_METRICS,
    COMPANION_WINDOW_ACTIONS,
} from "../generated/companion_capabilities";
import type { CardRegistry, CardUiServices } from "../application/card_registry";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import type { ConfigCodecFeature } from "../application/config_codec";
import type { ButtonSettingsSelectionFeature } from "../application/button_settings_selection";
import type { ConfigModalTabOptionsFeature } from "../application/config_modal_tab_options";
import { state } from "../state/app_instance";
import {
    COMPANION_SHORTCUT_PREFIX,
    companionShortcutPresetCards,
    COMPANION_SHORTCUT_APPS,
    companionAppShortcutAutoSwitchEnabled,
    companionAppShortcutFolderEnabled,
    companionShortcutActionIdValid,
    companionShortcutFolderAppLabel,
    companionShortcutFolderEditorAvailable,
    companionShortcutSelectionMatchesSavedParent,
    companionShortcutTabDefinitions,
    companionShortcutTabs,
    companionShortcutTabsFitSubpage,
    companionShortcutTabsFromSubpage,
    finderFolderTabs,
    syncFinderFolderSelection,
    addFinderFolderTiles,
    createCompanionShortcutSubpage,
    normalizeCompanionAppShortcutOptions,
    resetCompanionShortcutTabs,
    setCompanionAppShortcutFolderEnabled,
    setCompanionAppShortcutAutoSwitchEnabled,
    finderOpenBehavior,
    inheritFinderOpenBehaviorForCard,
    setFinderOpenBehavior,
    syncInheritedFinderOpenBehavior,
    FINDER_OPEN_BEHAVIOR_OPTION,
    FINDER_OPEN_OVERRIDE_OPTION,
    type FinderOpenBehavior,
    setCompanionShortcutTabs,
    syncCompanionShortcutSubpage,
} from "../application/companion_shortcut_folder";

const COMPANION_URL_PREFIX = "url.";
const COMPANION_DEFAULT_BROWSER = "system.default_browser";
const COMPANION_STATS_PLACEHOLDER = "stats";
export const COMPANION_FOLDER_PREFIX = "folder.";
const COMPANION_WINDOW_PREFIX = "window.";
const COMPANION_WINDOW_ACTION_ICONS: Readonly<Record<string, string>> = {
    "window.close": "Window Close",
    "window.minimize": "Window Minimise",
    "window.hide": "Eye Off",
    "window.fullscreen": "Full Screen",
    "window.fill": "Fit to Screen",
    "window.center": "Target",
    "window.left": "Dock Left",
    "window.right": "Dock Right",
    "window.top": "Dock Top",
    "window.bottom": "Dock Bottom",
    "window.top-left": "Arrow Top Left",
    "window.top-right": "Arrow Top Right",
    "window.bottom-left": "Arrow Bottom Left",
    "window.bottom-right": "Arrow Bottom Right",
    "window.restore": "Window Restore",
    "window.arrange.left-right": "Split Vertical",
    "window.arrange.right-left": "Arrow Left Right",
    "window.arrange.top-bottom": "Split Horizontal",
    "window.arrange.bottom-top": "Arrow Up Down",
    "window.arrange.left-quarters": "Arrow Left Bold Box Outline",
    "window.arrange.right-quarters": "Arrow Right Bold Box Outline",
    "window.arrange.top-quarters": "Arrow Up Bold Box Outline",
    "window.arrange.bottom-quarters": "Arrow Down Bold Box Outline",
    "window.arrange.quarters": "View Grid",
    "window.fullscreen.enter": "Arrow Expand",
    "window.fullscreen.exit": "Arrow Collapse",
    "window.split.left": "Dock Left",
    "window.split.right": "Dock Right",
};
const COMPANION_STATS_MODES = ["stats", ...COMPANION_SYSTEM_METRICS.map((metric) => metric.mode)];
export const COMPANION_SUBTYPE_DEFAULT_ICONS = {
    ...Object.fromEntries(COMPANION_CARD_MODES.map((mode) => [mode.id, mode.defaultIcon])),
} as Readonly<Record<CompanionCardModeId, string>>;
export const COMPANION_STATS_OPTIONS = COMPANION_SYSTEM_METRICS
    .map((metric) => [metric.mode, metric.label] as const)
    .sort((first, second) => first[1].localeCompare(second[1]));
const COMPANION_SHORTCUT_MODIFIERS = ["command", "control", "option", "shift"] as const;
const COMPANION_SHORTCUT_KEYS: Readonly<Record<string, string>> = {
    Space: "space", Enter: "enter", Tab: "tab", Escape: "escape",
    Backspace: "delete", Delete: "forwarddelete",
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
    Comma: "keycomma", Period: "keyperiod", Slash: "keyslash", Semicolon: "keysemicolon",
    Quote: "keyquote", Backslash: "keybackslash", Minus: "keyminus", Equal: "keyequal",
    BracketLeft: "keybracketleft", BracketRight: "keybracketright", Backquote: "keybackquote",
};
const COMPANION_SHORTCUT_KEY_LABELS: Readonly<Record<string, string>> = {
    space: "Space", enter: "Return", tab: "Tab", escape: "Esc",
    delete: "Delete", forwarddelete: "Forward Delete",
    left: "←", right: "→", up: "↑", down: "↓",
    home: "Home", end: "End", pageup: "Page Up", pagedown: "Page Down",
    keycomma: ",", keyperiod: ".", keyslash: "/", keysemicolon: ";", keyquote: "'",
    keybackslash: "\\", keyminus: "-", keyequal: "=", keybracketleft: "[",
    keybracketright: "]", keybackquote: "`",
};

function companionShortcutKey(code: string): string {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^F(?:[1-9]|1[0-9]|20)$/.test(code)) return code.toLowerCase();
    return COMPANION_SHORTCUT_KEYS[code] || "";
}

function sortCompanionLabels<T extends { readonly label: string }>(options: readonly T[]): T[] {
    return [...options].sort((first, second) =>
        first.label.localeCompare(second.label, undefined, { sensitivity: "base" }));
}

export function companionShortcutActionId(event: Pick<KeyboardEvent,
    "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string {
    const key = companionShortcutKey(event.code);
    if (!key || (!event.metaKey && !event.ctrlKey && !event.altKey)) return "";
    const parts: string[] = [];
    if (event.metaKey) parts.push("command");
    if (event.ctrlKey) parts.push("control");
    if (event.altKey) parts.push("option");
    if (event.shiftKey) parts.push("shift");
    parts.push(key);
    return COMPANION_SHORTCUT_PREFIX + parts.join("+");
}

export function formatCompanionShortcutActionId(actionId: string): string {
    if (!companionShortcutActionIdValid(actionId)) return "";
    const parts = actionId.slice(COMPANION_SHORTCUT_PREFIX.length).split("+");
    const key = parts.pop() || "";
    if (!key || !parts.length || parts.some((part) =>
        !(COMPANION_SHORTCUT_MODIFIERS as readonly string[]).includes(part))) return "";
    const symbols: Readonly<Record<string, string>> = {
        command: "⌘", control: "⌃", option: "⌥", shift: "⇧",
    };
    const keyLabel = COMPANION_SHORTCUT_KEY_LABELS[key]
        || (/^[a-z]$/.test(key) ? key.toUpperCase() : key.toUpperCase());
    return parts.map((part) => symbols[part]).join("") + keyLabel;
}

export function companionShortcutCatalogSelection(card: any) {
    for (const app of COMPANION_SHORTCUT_APPS.filter((app) => app.catalog)) {
        const preset = companionShortcutPresetCards(app.appId).find((preset) =>
            preset.entity === card?.entity && preset.options === card?.options);
        if (preset) return { ...preset, appId: app.appId };
    }
    return undefined;
}

export function companionUrlConfig(rawValue: string): string {
    const value = rawValue.trim();
    if (!value) return "";
    try {
        const url = new URL(value);
        if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname ||
            url.username || url.password) return "";
        const encoded = encodeURIComponent(url.href);
        return encoded.length <= 128 ? COMPANION_URL_PREFIX + encoded : "";
    } catch {
        return "";
    }
}

export function companionUrlValue(sensor: string): string {
    if (!sensor.startsWith(COMPANION_URL_PREFIX)) return "";
    try {
        return decodeURIComponent(sensor.slice(COMPANION_URL_PREFIX.length));
    } catch {
        return "";
    }
}

export function companionAppLabel(
    currentLabel: string,
    previousAppLabel: string,
    selectedAppLabel: string,
): string {
    if (!selectedAppLabel) return currentLabel;
    const trimmedLabel = currentLabel.trim();
    return !trimmedLabel || trimmedLabel === previousAppLabel ? selectedAppLabel : currentLabel;
}

export function companionWindowActionLabel(actionId: string): string {
    return COMPANION_WINDOW_ACTIONS.find((action) => action.id === actionId)?.label || "";
}

export function companionGeneratedIcon(
    currentIcon: string,
    previousGeneratedIcon: string,
    selectedGeneratedIcon: string,
): string {
    return !currentIcon || currentIcon === "Auto" || currentIcon === previousGeneratedIcon
        ? selectedGeneratedIcon : currentIcon;
}

export function companionSubtypeDefaultIcon(mode: string, entity = ""): string {
    if (mode === "ip_address") return "Laptop";

    if (COMPANION_STATS_MODES.includes(mode)) {
        return companionCardDefaultIcon("stats");
    }
    if (mode === "window") {
        return COMPANION_WINDOW_ACTION_ICONS[entity] || companionCardDefaultIcon("window");
    }
    return COMPANION_CARD_MODES.some((candidate) => candidate.id === mode)
        ? companionCardDefaultIcon(mode as CompanionCardModeId)
        : companionCardDefaultIcon("app");
}

export function companionSubtypeIcon(
    currentIcon: string,
    previousMode: string,
    nextMode: string,
    previousEntity = "",
    nextEntity = "",
): string {
    const previousGeneratedIcon = companionSubtypeDefaultIcon(previousMode, previousEntity);
    const legacyFolderIcon = previousMode === "folder" && currentIcon === "Folder";
    return !currentIcon || currentIcon === "Auto" || currentIcon === "Monitor" ||
        currentIcon === previousGeneratedIcon || legacyFolderIcon
        ? companionSubtypeDefaultIcon(nextMode, nextEntity) : currentIcon;
}

export function companionPreviousAppLabel(
    actions: readonly Pick<CompanionAction, "id" | "label">[],
    previousMode: string,
    previousEntity: string,
): string | null {
    if ((previousMode !== "app" && previousMode !== "url") || !previousEntity) return "";
    return actions.find((action) => action.id === previousEntity)?.label ?? null;
}

const COMPANION_CARD_METADATA = {
    mode: {
        label: "Type",
        idSuffix: "companion-mode",
        options: companionCardModeOptions(),
        value: companionCardMode,
    },
    icon: {
        pickerIdSuffix: "icon-picker",
        idSuffix: "icon",
        field: "icon",
        fallback: "Monitor",
    },
    largeNumbers: {
        label: "Large Sensor Numbers",
        idSuffix: "large-companion-numbers",
        supported: (card: any) => companionCardIsMetric(card) && companionMetricForEntity(card?.entity)?.mode !== "ip_address",
    },
    preview: { badge: "monitor" },
};

export function companionCardIsMetric(card: any): boolean {
    return !!companionMetricForEntity(card?.entity);
}

export function companionMetricDisplayMode(card: any): "used" | "free" | "remaining" {
    const metric = companionMetricForEntity(card?.entity);
    if (metric?.mode === "battery") return metric.freeId === card?.entity?.split(":")[0] ? "free" : "used";
    return metric?.freeId === card?.entity?.split(":")[0] ? "free" : "used";
}

export function companionLabelPlaceholder(card: any): string {
    const metric = companionMetricForEntity(card?.entity);
    if (!metric && companionCardMode(card) === "folder") return "e.g. Folder Name";
    if (!metric && companionCardMode(card) === "url") return "e.g. Website name";
    return metric ? `e.g. ${metric.label}` : "e.g. Safari or Select all";
}

export function companionMetricIcon(entity: string): string {
    if (entity === "stat.battery" || entity === "stat.battery_used") return "battery-outline";
    if (entity.startsWith("stat.memory")) return "memory";
    if (entity.startsWith("stat.storage")) return "harddisk";
    if (entity === "stat.network_throughput") return "lan";
    return "gauge";
}

export function companionMetricLabel(entity: string, value: string, unit: string): string {
    entity = entity.split(":")[0] || entity;
    const suffix = entity === "stat.battery_used" ? " used"
        : entity === "stat.battery" ? " left"
        : entity.endsWith("_free") ? " free"
        : entity === "stat.network_throughput" ? "" : " used";
    return value + (unit === "%" ? "" : " ") + unit + suffix;
}

export function companionMetricDescriptionEnabled(card: any): boolean {
    return !configOptionEnabled(card?.options, "stat_labels_off");
}

export function companionMetricDisplayLabel(card: any, value: string, unit: string): string {
    return companionMetricLabel(card.entity, value, unit).replace(
        / (used|free|remaining)$/, companionMetricDescriptionEnabled(card) ? " $1" : "");
}

export function companionMetricPreviewValue(precision: unknown, sample = Math.random()): string {
    const parsed = Number.parseInt(String(precision ?? "0"), 10);
    const digits = parsed >= 0 && parsed <= 2 ? parsed : 0;
    const normalizedSample = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
    return (10 + normalizedSample * 80).toFixed(digits);
}

export function companionCardMode(card: any): CompanionCardModeId {
    return decodeCompanionCard(card || {}).mode;
}

export function companionEntityForMode(mode: string): string {
    if (mode === "url") return COMPANION_DEFAULT_BROWSER;
    if (mode === "shortcut") return COMPANION_SHORTCUT_PREFIX;
    if (mode === "folder") return COMPANION_FOLDER_PREFIX;
    if (mode === "stats") return COMPANION_SYSTEM_METRICS[0]?.id || "";
    if (mode === "window") return COMPANION_WINDOW_ACTIONS[0]?.id || "";
    return COMPANION_SYSTEM_METRICS.find((metric) => metric.mode === mode)?.id || "";
}

export function companionApplicationActions(actions: readonly CompanionAction[]): readonly CompanionAction[] {
    return sortCompanionLabels(actions.filter((action) =>
        !action.id.startsWith(COMPANION_FOLDER_PREFIX) &&
        !["media.play_pause", "media.previous", "media.next"].includes(action.id)));
}

export function companionApplicationActionIdValid(
    actions: readonly CompanionAction[], actionId: string,
): boolean {
    return companionApplicationActions(actions).some((action) => action.id === actionId);
}

export function companionApplicationActionIdCanSave(
    actions: readonly CompanionAction[], actionId: string, savedActionId: string,
): boolean {
    return !!actionId && (actionId === savedActionId || companionApplicationActionIdValid(actions, actionId));
}

export function companionFolderActions(actions: readonly CompanionAction[]): readonly CompanionAction[] {
    return sortCompanionLabels(actions.filter((action) => action.id.startsWith(COMPANION_FOLDER_PREFIX)));
}

export function companionFolderActionIdCanSave(
    actions: readonly CompanionAction[], actionId: string, savedActionId: string,
): boolean {
    return actionId.startsWith(COMPANION_FOLDER_PREFIX) && actionId.length > COMPANION_FOLDER_PREFIX.length &&
        (actionId === savedActionId || companionFolderActions(actions).some((action) => action.id === actionId));
}

export function resetCompanionMetricPresentation(card: any, nextMode: string): void {
    if (!card) return;
    const previous = companionMetricForEntity(card.entity);
    const nextMetric = nextMode === "stats" || COMPANION_SYSTEM_METRICS.some((metric) => metric.mode === nextMode);
    if (!previous || previous.mode === nextMode || nextMetric) return;
    if (card.label === previous.label) card.label = "";
    card.unit = "";
    card.precision = "";
    card.options = "";
}

export function normalizeCompanionCard(card: any): void {
    if (!card) return;
    if (card.entity === COMPANION_STATS_PLACEHOLDER) {
        card.type = "companion";
        card.sensor = "";
        card.unit = "";
        card.precision = "";
        card.options = "";
        card.icon_on = "Auto";
        if (!card.icon || card.icon === "Auto" || card.icon === "Monitor") {
            card.icon = companionSubtypeDefaultIcon("stats");
        }
        return;
    }
    const metric = companionMetricForEntity(card.entity);
    if (metric) {
        card.type = "companion";
        card.sensor = "";
        // Existing cards may still contain the old generated KB/s unit.
        const model = decodeCompanionCard(card);
        if (model.mode !== "stats") return;
        Object.assign(card, encodeCompanionCard({ ...model,
            unit: metric.mode === "ip_address" ? "" : (model.unit === "KB/s" ? metric.unit : (model.unit || metric.unit)),
            precision: ["0", "1", "2"].includes(model.precision) ? model.precision : "0",
        }, card));
        card.options = String(card.options || "").split(",").filter((option) =>
            option === "large_numbers" || option === "large_numbers=off" || option === "stat_labels_off").join(",");
        if (metric.mode === "ip_address") card.options = "";
        card.icon_on = "Auto";
        if (!card.icon || card.icon === "Auto" || card.icon === "Monitor") {
            card.icon = companionSubtypeDefaultIcon(metric.mode, card.entity);
        }
        return;
    }
    const urlConfig = typeof card.sensor === "string" && card.sensor.startsWith(COMPANION_URL_PREFIX)
        ? card.sensor : "";
    card.type = "companion";
    card.sensor = urlConfig;
    card.unit = "";
    card.precision = "";
    if (!urlConfig && typeof card.entity === "string" && card.entity.startsWith(COMPANION_FOLDER_PREFIX)) {
        const behavior = configOptionValue(card.options, FINDER_OPEN_BEHAVIOR_OPTION);
        let options = behavior === "same_window" || behavior === "new_window"
            ? setConfigOptionValue("", FINDER_OPEN_BEHAVIOR_OPTION, behavior) : "";
        options = setConfigOption(options, FINDER_OPEN_OVERRIDE_OPTION,
            configOptionEnabled(card.options, FINDER_OPEN_OVERRIDE_OPTION));
        card.options = options;
        card.icon_on = "Auto";
        if (!card.icon || card.icon === "Auto" || card.icon === "Monitor" || card.icon === "Folder") {
            card.icon = companionSubtypeDefaultIcon("folder", card.entity);
        }
        return;
    }
    card.options = normalizeCompanionAppShortcutOptions(card);
    card.icon_on = "Auto";
    const mode = companionCardMode(card);
    if (!card.icon || card.icon === "Auto" ||
        (card.icon === "Monitor" && mode !== "app") ||
        (card.icon === "Folder" && mode === "folder")) {
        card.icon = companionSubtypeDefaultIcon(mode, card.entity);
    }
}

export function registerCompanionCardTypes(
    registry: CardRegistry,
    supported: boolean,
    document: Document,
    fetchImpl: typeof fetch,
    fields: ControlsFieldsFeature,
    cardUi: CardUiServices,
    modalTabs: Pick<ConfigModalTabOptionsFeature, "renderModalTabSettings">,
    codec: Pick<ConfigCodecFeature, "buildSubpageGrid" | "enterSubpage" | "saveSubpageConfig">,
    selection: Pick<ButtonSettingsSelectionFeature, "closeSettings">,
    maxSlots: number,
): void {
    const { cardBadgePreview, cardBadgeLabelHtml, cardSensorPreviewHtml, fieldLabel } = fields;
    const { renderButtonSettings } = cardUi;
    const catalogue = createCompanionCatalogue(fetchImpl);
    const loadCompanionActions = catalogue.load;
    let companionApplications: readonly CompanionAction[] = [];

    function rememberCompanionApplications(actions: readonly CompanionAction[]): void {
        companionApplications = companionApplicationActions(actions);
    }

    function companionApplicationLabel(actionId: string): string {
        return companionApplications.find((action) => action.id === actionId)?.label || "";
    }

    if (supported) {
        void loadCompanionActions().then(function (actions) {
            rememberCompanionApplications(actions);
            cardUi.renderPreview();
        }).catch(function () {});
    }

    function applyCompanionPickerPreset(card: any, mode: string): void {
        if (!card) return;
        card.entity = companionEntityForMode(mode);
        card.sensor = mode === "url" ? COMPANION_URL_PREFIX : "";
        card.unit = "";
        card.precision = "";
        card.options = "";
        card.icon_on = "Auto";
        card.label = "";

        const metric = mode === "stats" ? COMPANION_SYSTEM_METRICS[0] : undefined;
        if (metric) {
            card.unit = metric.unit;
            card.precision = "0";
        }
        card.icon = companionSubtypeDefaultIcon(mode, card.entity);
    }

    const companionDefinition: any = {
        label: function () { return cardContractCardLabel("companion"); },
        allowInSubpage: function () { return cardContractAllowInSubpage("companion"); },
        pickerKey: function () { return cardContractPickerKey("companion"); },
        hidden: function () { return cardContractHidden("companion"); },
        hideLabel: true,
        labelPlaceholder: "e.g. Safari or Select all",
        defaultConfig: function () { return cardContractDefaultConfig("companion"); },
        cardMetadata: COMPANION_CARD_METADATA,
        isAvailable: function () { return supported; },
        normalizeConfig: normalizeCompanionCard,
        onSelect: function (card?: any) {
            const defaults: any = cardContractDefaultConfig("companion");
            Object.keys(defaults).forEach(function (key) { card[key] = defaults[key]; });
        },
        renderSettings: function (panel?: HTMLElement, card?: any, slot?: any, helpers?: any) {
            normalizeCompanionCard(card);
            const currentEntity = typeof card.entity === "string" ? card.entity : "";
            card.entity = currentEntity;
            const initialMode = companionCardMode(card);
            const savedParent = !helpers.isSub && slot ? state.buttons[slot - 1] : null;
            let companionActions: readonly CompanionAction[] = [];
            let availableCompanionApps: readonly CompanionAction[] = [];
            let availableCompanionFolders: readonly CompanionAction[] = [];

            if (!companionCardIsMetric(card)) {
                helpers.renderCardTextField(panel, card, helpers, {
                    label: "Label",
                    idSuffix: "label", field: "label",
                    placeholder: companionLabelPlaceholder(card), rerender: true,
                });
            }

            if (companionCardIsMetric(card)) {
                const metric = companionMetricForEntity(card.entity);
                const statsField = document.createElement("div");
                statsField.className = "sp-field";
                statsField.appendChild(fieldLabel("Statistic", helpers.idPrefix + "companion-stat"));
                const statsSelect = document.createElement("select");
                statsSelect.className = "sp-select";
                statsSelect.id = helpers.idPrefix + "companion-stat";
                COMPANION_STATS_OPTIONS.forEach(function (item) {
                    const option = document.createElement("option");
                    option.value = item[0];
                    option.textContent = item[1];
                    option.selected = item[0] === metric?.mode;
                    statsSelect.appendChild(option);
                });
                statsSelect.addEventListener("change", function () {
                    const selected = COMPANION_SYSTEM_METRICS.find((candidate) => candidate.mode === this.value);
                    if (!selected) return;
                    if (!card.unit || card.unit === metric?.unit || card.unit === "KB/s") {
                        card.unit = selected.unit;
                        helpers.saveField("unit", card.unit);
                    }
                    card.icon = companionGeneratedIcon(card.icon, companionSubtypeDefaultIcon(metric?.mode || "stats"), companionSubtypeDefaultIcon(selected.mode));
                    helpers.saveField("icon", card.icon);
                    card.entity = selected.id;
                    helpers.saveField("entity", card.entity);
                    renderButtonSettings();
                });
                statsField.appendChild(statsSelect);
                helpers.markCardPrimaryField(statsField, "statistic");
                panel?.appendChild(statsField);
                if (metric?.mode === "storage") {
                    renderCompanionStorageSelector(panel, card, helpers, fetchImpl);
                }
                if (metric?.freeId || metric?.mode === "battery") {
                    const displayField = document.createElement("div");
                    displayField.className = "sp-field sp-metric-capacity-field";
                    displayField.appendChild(fieldLabel("Capacity", helpers.idPrefix + "metric-display"));
                    const displaySelect = document.createElement("select");
                    displaySelect.className = "sp-select";
                    displaySelect.id = helpers.idPrefix + "metric-display";
                    sortCompanionLabels([
                        ...(metric?.freeId ? [{ value: "used", label: "Used" }, { value: "free", label: metric?.mode === "battery" ? "Left" : "Free" }] :
                            [{ value: "remaining", label: "Remaining" }]),
                    ]).forEach((item) => {
                        const option = document.createElement("option");
                        option.value = item.value;
                        option.textContent = item.label;
                        displaySelect.appendChild(option);
                    });
                    displaySelect.value = companionMetricDisplayMode(card);
                    displaySelect.addEventListener("change", function () {
                        if (!metric?.freeId) return;
                        const device = card.entity.split(":")[1];
                        card.entity = (this.value === "free" ? metric.freeId : metric.id) + (device ? ":" + device : "");
                        helpers.saveField("entity", card.entity);
                        renderButtonSettings();
                    });
                    displayField.appendChild(displaySelect);
                    panel?.appendChild(displayField);
                }
                if (metric?.mode === "ip_address") {
                    const field = document.createElement("div");
                    field.className = "sp-field";
                    field.appendChild(fieldLabel("Network device", helpers.idPrefix + "companion-network"));
                    const select = document.createElement("select");
                    select.id = helpers.idPrefix + "companion-network";
                    select.className = "sp-select";
                    const selectedId = String(card.entity).split(":")[1] || "";
                    select.add(new Option("Automatic (available network)", ""));
                    if (selectedId) select.add(new Option(selectedId, selectedId));
                    select.value = selectedId;
                    select.addEventListener("change", function () {
                        card.entity = "stat.ip_address" + (this.value ? ":" + this.value : "");
                        helpers.saveField("entity", card.entity);
                    });
                    const status = document.createElement("p");
                    status.textContent = "Loading Mac network devices…";
                    field.append(select, status);
                    panel?.appendChild(field);
                    void fetch("/companion/networks", { cache: "no-store" }).then(async (response) => {
                        if (!response.ok) throw new Error("unavailable");
                        const networks: unknown = await response.json();
                        if (!Array.isArray(networks)) throw new Error("unavailable");
                        for (const network of networks) {
                            if (typeof network?.id !== "string" || typeof network?.label !== "string") continue;
                            if (network.id === selectedId) select.options[1]!.textContent = network.label;
                            else select.add(new Option(network.label, network.id));
                        }
                        status.textContent = networks.length ? "Shows the selected device’s IPv4 address." :
                            "Connect the Mac and enable Stats sharing to load network devices.";
                    }).catch(() => { status.textContent = "Network devices unavailable. Connect the Mac and enable Stats sharing."; });
                    return;
                }
                const description = helpers.toggleRow("Show capacity label", helpers.idPrefix + "stat-labels", companionMetricDescriptionEnabled(card));
                description.input.addEventListener("change", function (this: HTMLInputElement) {
                    card.options = setConfigOption(card.options, "stat_labels_off", !this.checked);
                    helpers.saveField("options", card.options);
                });
                panel?.appendChild(description.row);
                helpers.renderCardTextField(panel, card, helpers, {
                    label: "Unit", idSuffix: "unit", field: "unit",
                    placeholder: "%", rerender: true,
                });
                const precision = helpers.precisionField(
                    helpers.idPrefix + "precision", card.precision || "0", function (this: HTMLSelectElement) {
                        card.precision = this.value;
                        helpers.saveField("precision", card.precision);
                    });
                panel?.appendChild(precision.field);
                return;
            }

            const appField = document.createElement("div");
            appField.className = "sp-field";
            const appFieldLabel = fieldLabel("Application", helpers.idPrefix + "companion-action");
            appField.appendChild(appFieldLabel);

            const select = document.createElement("select");
            select.className = "sp-select";
            select.id = helpers.idPrefix + "companion-action";
            select.disabled = true;
            const loading = document.createElement("option");
            loading.value = "";
            loading.textContent = "Loading Mac apps…";
            select.appendChild(loading);
            appField.appendChild(select);
            panel?.appendChild(appField);
            if (initialMode === "app") {
                helpers.markCardPrimaryField(appField, "entity");
            }
            helpers.requireField(select, "Choose a Mac app before saving.", function () {
                return initialMode === "app";
            }, function (value: string) {
                return companionApplicationActionIdCanSave(availableCompanionApps, value, currentEntity);
            });

            const folderField = document.createElement("div");
            folderField.className = "sp-field";
            folderField.appendChild(fieldLabel("Folder", helpers.idPrefix + "companion-folder"));
            const folderSelect = document.createElement("select");
            folderSelect.className = "sp-select";
            folderSelect.id = helpers.idPrefix + "companion-folder";
            folderSelect.disabled = true;
            const folderLoading = document.createElement("option");
            folderLoading.value = "";
            folderLoading.textContent = "Loading approved folders…";
            folderSelect.appendChild(folderLoading);
            folderField.appendChild(folderSelect);
            const folderNote = document.createElement("div");
            folderNote.className = "sp-field-info-text";
            folderNote.textContent = "Add folders from the Folders tab in the EspDesktop app.";
            folderField.appendChild(folderNote);
            panel?.appendChild(folderField);
            helpers.markCardPrimaryField(folderField, "folder");
            helpers.requireField(folderSelect, "Choose a folder before saving.", function () {
                return initialMode === "folder";
            }, function (value: string) {
                return companionFolderActionIdCanSave(availableCompanionFolders, value, currentEntity);
            });

            const shortcutField = document.createElement("div");
            shortcutField.className = "sp-field";
            const savedCatalogShortcut = companionShortcutCatalogSelection(card);
            const shortcutType = card._shortcutType || (savedCatalogShortcut ? "catalog" : "custom");
            const typeField = document.createElement("div");
            typeField.className = "sp-field";
            typeField.appendChild(fieldLabel("Type", helpers.idPrefix + "shortcut-type"));
            const typeSelect = document.createElement("select");
            typeSelect.className = "sp-select";
            typeSelect.id = helpers.idPrefix + "shortcut-type";
            for (const [value, label] of [["custom", "Custom Shortcut"], ["catalog", "Shortcut Catalog"]] as const) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                typeSelect.appendChild(option);
            }
            typeSelect.value = shortcutType;
            typeField.appendChild(typeSelect);
            shortcutField.appendChild(typeField);
            const shortcutPanel = helpers.disclosureSection(
                "Shortcut", helpers.idPrefix + "shortcut-panel", card._shortcutPanelOpen !== false,
            );
            shortcutPanel.button.addEventListener("click", function () {
                card._shortcutPanelOpen = shortcutPanel.panel.classList.contains("sp-open");
            });
            const customField = document.createElement("div");
            customField.style.display = shortcutType === "custom" ? "" : "none";
            shortcutPanel.section.appendChild(customField);
            const modifierLabel = document.createElement("div");
            modifierLabel.className = "sp-field-label";
            modifierLabel.textContent = "Modifiers";
            customField.appendChild(modifierLabel);
            const modifierButtons = document.createElement("fieldset");
            modifierButtons.className = "sp-segment";
            modifierButtons.style.padding = "0";
            modifierButtons.style.minWidth = "0";
            modifierButtons.setAttribute("aria-label", "Shortcut modifiers");
            const shortcutParts: string[] = currentEntity.slice(COMPANION_SHORTCUT_PREFIX.length).split("+");
            let selectedKey = shortcutParts.pop() || "";
            const selectedModifiers = new Set(shortcutParts.filter((part) =>
                (COMPANION_SHORTCUT_MODIFIERS as readonly string[]).includes(part)));
            const modifierControls = new Map<string, HTMLButtonElement>();
            for (const [modifier, label] of [
                ["command", "⌘ Command"], ["control", "⌃ Control"],
                ["option", "⌥ Option"], ["shift", "⇧ Shift"],
            ] as const) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = label;
                button.addEventListener("click", function () {
                    if (selectedModifiers.has(modifier)) selectedModifiers.delete(modifier);
                    else selectedModifiers.add(modifier);
                    saveBuiltShortcut();
                });
                modifierControls.set(modifier, button);
                modifierButtons.appendChild(button);
            }
            customField.appendChild(modifierButtons);
            const keyField = document.createElement("div");
            keyField.className = "sp-field";
            keyField.appendChild(fieldLabel("Key", helpers.idPrefix + "shortcut-key"));
            const keySelect = document.createElement("select");
            keySelect.className = "sp-select";
            keySelect.id = helpers.idPrefix + "shortcut-key";
            const keyPlaceholder = document.createElement("option");
            keyPlaceholder.value = "";
            keyPlaceholder.textContent = "Choose a key…";
            keySelect.appendChild(keyPlaceholder);
            const keyGroups: readonly [string, readonly string[]][] = [
                ["Letters", Array.from("abcdefghijklmnopqrstuvwxyz")],
                ["Numbers", Array.from("0123456789")],
                ["Navigation and editing", Object.values(COMPANION_SHORTCUT_KEYS).filter((key) => !key.startsWith("key"))],
                ["Punctuation", Object.values(COMPANION_SHORTCUT_KEYS).filter((key) => key.startsWith("key"))],
                ["Function keys", Array.from({ length: 20 }, (_, index) => "f" + (index + 1))],
            ];
            for (const [label, keys] of keyGroups) {
                const group = document.createElement("optgroup");
                group.label = label;
                for (const key of keys) {
                    const option = document.createElement("option");
                    option.value = key;
                    option.textContent = COMPANION_SHORTCUT_KEY_LABELS[key] || key.toUpperCase();
                    group.appendChild(option);
                }
                keySelect.appendChild(group);
            }
            keySelect.addEventListener("change", function () {
                selectedKey = keySelect.value;
                saveBuiltShortcut();
            });
            keyField.appendChild(keySelect);
            customField.appendChild(keyField);
            shortcutField.appendChild(shortcutPanel.panel);
            function syncShortcutBuilder(): void {
                for (const [modifier, button] of modifierControls) {
                    const selected = selectedModifiers.has(modifier);
                    button.classList.toggle("active", selected);
                    button.setAttribute("aria-pressed", String(selected));
                }
                keySelect.value = selectedKey;
            }
            function saveBuiltShortcut(): void {
                const modifiers = COMPANION_SHORTCUT_MODIFIERS.filter((modifier) => selectedModifiers.has(modifier));
                card.entity = COMPANION_SHORTCUT_PREFIX + [...modifiers, selectedKey].join("+");
                card.options = "app_shortcut_preset=custom";
                helpers.clearFieldError(keySelect);
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                syncShortcutBuilder();
            }
            syncShortcutBuilder();

            const catalogField = document.createElement("div");
            catalogField.style.display = shortcutType === "catalog" ? "" : "none";
            const catalogAppField = document.createElement("div");
            catalogAppField.className = "sp-field";
            catalogAppField.appendChild(fieldLabel("App", helpers.idPrefix + "shortcut-catalog-app"));
            const catalogApp = document.createElement("select");
            catalogApp.className = "sp-select";
            catalogApp.id = helpers.idPrefix + "shortcut-catalog-app";
            for (const [value, label] of [["", "Choose an app…"], ...COMPANION_SHORTCUT_APPS.filter((app) => app.catalog).map((app) => [app.appId, app.label] as const)] as const) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                catalogApp.appendChild(option);
            }
            catalogApp.value = savedCatalogShortcut?.appId || card._shortcutCatalogApp || "";
            catalogAppField.appendChild(catalogApp);
            catalogField.appendChild(catalogAppField);
            const catalogShortcutField = document.createElement("div");
            catalogShortcutField.className = "sp-field";
            catalogShortcutField.appendChild(fieldLabel("Shortcut", helpers.idPrefix + "shortcut-catalog-action"));
            const catalogShortcut = document.createElement("select");
            catalogShortcut.className = "sp-select";
            catalogShortcut.id = helpers.idPrefix + "shortcut-catalog-action";
            const catalogPlaceholder = document.createElement("option");
            catalogPlaceholder.value = "";
            catalogPlaceholder.textContent = "Choose a shortcut…";
            catalogShortcut.appendChild(catalogPlaceholder);
            if (catalogApp.value) {
                companionShortcutPresetCards(catalogApp.value).forEach((preset) => {
                    const option = document.createElement("option");
                    option.value = preset.options;
                    option.textContent = preset.label + " (" + formatCompanionShortcutActionId(preset.entity) + ")";
                    catalogShortcut.appendChild(option);
                });
            }
            catalogShortcut.disabled = !catalogApp.value;
            catalogShortcut.value = savedCatalogShortcut?.options || "";
            catalogShortcutField.appendChild(catalogShortcut);
            catalogField.appendChild(catalogShortcutField);
            shortcutPanel.section.appendChild(catalogField);
            helpers.requireField(catalogShortcut, "Choose an app and shortcut before saving.", function () {
                return initialMode === "shortcut" && shortcutType === "catalog";
            }, function () {
                return !!catalogApp.value && companionShortcutCatalogSelection(card)?.appId === catalogApp.value;
            });
            typeSelect.addEventListener("change", function () {
                card._shortcutType = typeSelect.value;
                card._shortcutCatalogApp = "";
                // Keep the selected combination when switching to Custom Shortcut.
                if (typeSelect.value === "catalog") card.entity = COMPANION_SHORTCUT_PREFIX;
                card.options = "app_shortcut_preset=custom";
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                renderButtonSettings();
            });
            catalogApp.addEventListener("change", function () {
                card._shortcutCatalogApp = catalogApp.value;
                card.entity = COMPANION_SHORTCUT_PREFIX;
                card.options = "";
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                renderButtonSettings();
            });
            catalogShortcut.addEventListener("change", function () {
                const preset = companionShortcutPresetCards(catalogApp.value).find((item) => item.options === catalogShortcut.value);
                if (!preset) {
                    card.entity = COMPANION_SHORTCUT_PREFIX;
                    card.options = "";
                } else {
                    card.label = companionAppLabel(card.label || "", savedCatalogShortcut?.label || "", preset.label);
                    card.icon = companionGeneratedIcon(card.icon || "", savedCatalogShortcut?.icon || "Shortcut Command", preset.icon);
                    card.entity = preset.entity;
                    card.options = preset.options;
                }
                for (const field of ["entity", "options", "label", "icon"]) helpers.saveField(field, card[field]);
                renderButtonSettings();
            });
            panel?.appendChild(shortcutField);
            helpers.markCardPrimaryField(shortcutField, "shortcut");
            helpers.requireField(keySelect, "Choose a key with Command, Control, or Option before saving.", function () {
                return initialMode === "shortcut" && shortcutType === "custom";
            }, function () {
                return companionShortcutActionIdValid(card.entity) && !!selectedKey &&
                    COMPANION_SHORTCUT_MODIFIERS.some((modifier) =>
                        modifier !== "shift" && selectedModifiers.has(modifier));
            });

            const windowField = document.createElement("div");
            windowField.className = "sp-field";
            windowField.appendChild(fieldLabel("Window action", helpers.idPrefix + "companion-window-action"));
            const windowSelect = document.createElement("select");
            windowSelect.className = "sp-select";
            windowSelect.id = helpers.idPrefix + "companion-window-action";
            const groups = new Map<string, HTMLOptGroupElement>();
            [...COMPANION_WINDOW_ACTIONS].sort((first, second) =>
                first.group.localeCompare(second.group, undefined, { sensitivity: "base" }) ||
                first.label.localeCompare(second.label, undefined, { sensitivity: "base" })).forEach(function (action) {
                let group = groups.get(action.group);
                if (!group) {
                    group = document.createElement("optgroup");
                    group.label = action.group;
                    groups.set(action.group, group);
                    windowSelect.appendChild(group);
                }
                const option = document.createElement("option");
                option.value = action.id;
                option.textContent = action.label;
                option.selected = action.id === card.entity;
                group.appendChild(option);
            });
            windowField.appendChild(windowSelect);
            const windowNote = document.createElement("div");
            windowNote.className = "sp-field-info-text sp-visible";
            windowNote.textContent = "Controls the active Mac window. Tiling actions require macOS 15 or later.";
            windowField.appendChild(windowNote);
            panel?.appendChild(windowField);
            helpers.markCardPrimaryField(windowField, "window");

            const urlField = document.createElement("div");
            urlField.className = "sp-field";
            urlField.appendChild(fieldLabel("URL", helpers.idPrefix + "companion-url"));
            const urlInput = document.createElement("input");
            urlInput.className = "sp-input";
            urlInput.id = helpers.idPrefix + "companion-url";
            urlInput.type = "url";
            urlInput.inputMode = "url";
            urlInput.autocomplete = "off";
            urlInput.spellcheck = false;
            urlInput.maxLength = 700;
            urlInput.placeholder = "https://example.com";
            urlInput.value = companionUrlValue(card.sensor);
            urlField.appendChild(urlInput);
            const urlNote = document.createElement("div");
            urlNote.className = "sp-field-info-text";
            urlNote.textContent = "Only http:// and https:// addresses are supported.";
            urlField.appendChild(urlNote);
            panel?.insertBefore(urlField, appField);
            helpers.markCardPrimaryField(urlField, "url");
            helpers.requireField(urlInput, "Enter an http:// or https:// address before saving.", function () {
                return initialMode === "url";
            }, function (value: string) {
                return Boolean(companionUrlConfig(value));
            });

            const appSubpageDisclosure = helpers.disclosureSection(
                "App Subpage",
                helpers.idPrefix + "companion-app-subpage",
                card._modalSettingsOpen === true,
            );
            appSubpageDisclosure.panel.classList.add("sp-app-subpage-settings");
            appSubpageDisclosure.button.addEventListener("click", function () {
                card._modalSettingsOpen = appSubpageDisclosure.panel.classList.contains("sp-open");
            });
            panel?.appendChild(appSubpageDisclosure.panel);
            const savedShortcutSubpage = !helpers.isSub && slot ? state.subpages[slot] : null;
            if (savedShortcutSubpage &&
                companionShortcutSelectionMatchesSavedParent(card, savedParent) &&
                card._appShortcutSelectionChanged !== true) {
                setCompanionShortcutTabs(
                    card,
                    companionShortcutTabsFromSubpage(card.entity, savedShortcutSubpage),
                );
            }
            const shortcutFolderField = document.createElement("div");
            shortcutFolderField.className = "sp-field";
            const folderToggle = helpers.toggleRow(
                "Add app subpage",
                helpers.idPrefix + "companion-app-shortcuts",
                !helpers.isSub && companionAppShortcutFolderEnabled(card),
            );
            shortcutFolderField.appendChild(folderToggle.row);
            const shortcutFolderNote = document.createElement("div");
            shortcutFolderNote.className = "sp-field-info-text";
            const shortcutFolderApp = companionShortcutFolderAppLabel(card.entity);
            shortcutFolderNote.textContent = card.entity === "com.apple.finder"
                ? "Enabling adds your configured Mac folders as tiles, as space allows. Existing tiles are kept."
                : "Launch " + shortcutFolderApp +
                ", then open an editable subpage. It starts with " + shortcutFolderApp + " keyboard shortcuts.";
            shortcutFolderField.appendChild(shortcutFolderNote);
            appSubpageDisclosure.section.appendChild(shortcutFolderField);
            folderToggle.input.addEventListener("change", function () {
                if (!folderToggle.input.checked) {
                    card._appShortcutDisabledTabs = companionShortcutTabs(card);
                }
                if (folderToggle.input.checked && card.entity === "com.apple.finder") {
                    card._appShortcutSelectionChanged = true;
                }
                setCompanionAppShortcutFolderEnabled(card, folderToggle.input.checked);
                if (folderToggle.input.checked && Array.isArray(card._appShortcutDisabledTabs)) {
                    setCompanionShortcutTabs(card, card._appShortcutDisabledTabs);
                    delete card._appShortcutDisabledTabs;
                }
                card._modalSettingsOpen = true;
                helpers.saveField("options", card.options);
                renderButtonSettings();
            });

            const autoSwitchField = document.createElement("div");
            autoSwitchField.className = "sp-field";
            const autoSwitchToggle = helpers.toggleRow(
                "Auto switch to subpage",
                helpers.idPrefix + "companion-app-shortcuts-auto-switch",
                companionAppShortcutAutoSwitchEnabled(card),
            );
            autoSwitchField.appendChild(autoSwitchToggle.row);
            const autoSwitchNote = document.createElement("div");
            autoSwitchNote.className = "sp-field-info-text";
            autoSwitchNote.textContent = "Automatically show this subpage when " + shortcutFolderApp +
                " is opened or focused on the Mac.";
            autoSwitchField.appendChild(autoSwitchNote);
            appSubpageDisclosure.section.appendChild(autoSwitchField);
            autoSwitchToggle.input.addEventListener("change", function () {
                setCompanionAppShortcutAutoSwitchEnabled(card, autoSwitchToggle.input.checked);
                helpers.saveField("options", card.options);
            });

            const finderOpenBehaviorField = document.createElement("div");
            finderOpenBehaviorField.className = "sp-field";
            finderOpenBehaviorField.appendChild(fieldLabel("Folder shortcuts open in", helpers.idPrefix + "finder-open-behavior"));
            const finderOpenBehaviorSelect = document.createElement("select");
            finderOpenBehaviorSelect.className = "sp-select";
            finderOpenBehaviorSelect.id = helpers.idPrefix + "finder-open-behavior";
            const globalBehaviorChoices: readonly [FinderOpenBehavior, string][] = [
                ["new_window", "A new window"],
                ["same_window", "The same window"],
            ];
            for (const [value, label] of globalBehaviorChoices) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = value === finderOpenBehavior(card);
                finderOpenBehaviorSelect.appendChild(option);
            }
            finderOpenBehaviorField.appendChild(finderOpenBehaviorSelect);
            const finderOpenBehaviorNote = document.createElement("div");
            finderOpenBehaviorNote.className = "sp-field-info-text";
            finderOpenBehaviorNote.textContent = "Default for Finder folder shortcuts. Individual folder cards can override this in Advanced.";
            finderOpenBehaviorField.appendChild(finderOpenBehaviorNote);
            appSubpageDisclosure.section.appendChild(finderOpenBehaviorField);
            finderOpenBehaviorSelect.addEventListener("change", function () {
                const behavior: FinderOpenBehavior = finderOpenBehaviorSelect.value === "same_window"
                    ? "same_window" : "new_window";
                card.options = setConfigOptionValue(card.options, FINDER_OPEN_BEHAVIOR_OPTION, behavior);
                card._finderOpenBehaviorChanged = true;
                helpers.saveField("options", card.options);
            });

            const advancedFolderSettings = helpers.disclosureSection(
                "Advanced", helpers.idPrefix + "finder-folder-advanced", false,
            );
            const advancedFolderBehaviorField = document.createElement("div");
            advancedFolderBehaviorField.className = "sp-field";
            advancedFolderBehaviorField.appendChild(fieldLabel("Open folder in", helpers.idPrefix + "finder-folder-open-behavior"));
            const advancedFolderBehaviorSelect = document.createElement("select");
            advancedFolderBehaviorSelect.className = "sp-select";
            advancedFolderBehaviorSelect.id = helpers.idPrefix + "finder-folder-open-behavior";
            const parentSlot = Number(state.editingSubpage || slot || 0);
            const parentCard = parentSlot > 0 ? state.buttons[parentSlot - 1] : null;
            const canInheritFinderBehavior = helpers.isSub && parentCard?.entity === "com.apple.finder";
            if (canInheritFinderBehavior &&
                inheritFinderOpenBehaviorForCard(card, finderOpenBehavior(parentCard))) {
                helpers.saveField("options", card.options);
            }
            const folderBehaviorChoices: readonly [string, string][] = helpers.isSub
                && canInheritFinderBehavior
                ? [["inherit", "Use Finder subpage setting"], ["new_window", "A new window"], ["same_window", "The same window"]]
                : [["new_window", "A new window"], ["same_window", "The same window"]];
            const hasFinderOverride = configOptionEnabled(card.options, FINDER_OPEN_OVERRIDE_OPTION);
            const selectedFolderBehavior = canInheritFinderBehavior && !hasFinderOverride
                ? "inherit" : finderOpenBehavior(card);
            for (const [value, label] of folderBehaviorChoices) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                option.selected = value === selectedFolderBehavior;
                advancedFolderBehaviorSelect.appendChild(option);
            }
            advancedFolderBehaviorField.appendChild(advancedFolderBehaviorSelect);
            advancedFolderSettings.section.appendChild(advancedFolderBehaviorField);
            advancedFolderBehaviorSelect.addEventListener("change", function () {
                const inherited = canInheritFinderBehavior && advancedFolderBehaviorSelect.value === "inherit";
                const behavior: FinderOpenBehavior = inherited
                    ? finderOpenBehavior(parentCard)
                    : advancedFolderBehaviorSelect.value === "same_window" ? "same_window" : "new_window";
                setFinderOpenBehavior(card, behavior, !inherited);
                helpers.saveField("options", card.options);
            });
            panel?.appendChild(advancedFolderSettings.panel);

            const finderFolderList = document.createElement("div");
            if (card.entity === "com.apple.finder" && companionAppShortcutFolderEnabled(card)) {
                finderFolderList.className = "sp-app-subpage-folder-list";
                appSubpageDisclosure.section.appendChild(finderFolderList);
            }
            if (companionAppShortcutFolderEnabled(card) && card.entity !== "com.apple.finder") {
                const shortcutOptionsDivider = document.createElement("div");
                shortcutOptionsDivider.className = "sp-app-subpage-options-divider";
                appSubpageDisclosure.section.appendChild(shortcutOptionsDivider);
                modalTabs.renderModalTabSettings(appSubpageDisclosure.section, card, helpers, {
                    definitions: function () { return companionShortcutTabDefinitions(card.entity); },
                    tabs: companionShortcutTabs,
                    normalizeOptions: function (options: string) {
                        return normalizeCompanionAppShortcutOptions({ ...card, options });
                    },
                    setTabs: function (button: any, tabs: string[]) {
                        if (!companionShortcutTabsFitSubpage(
                            button.entity, tabs, savedShortcutSubpage, maxSlots,
                        )) {
                            button._appShortcutCapacityRejected = true;
                            return false;
                        }
                        delete button._appShortcutCapacityRejected;
                        setCompanionShortcutTabs(button, tabs);
                        button._appShortcutSelectionChanged = true;
                        return true;
                    },
                    idPrefix: "companion-shortcut-",
                    hideHeading: true,
                    allowEmpty: true,
                });
                if (card._appShortcutCapacityRejected === true) {
                    const capacityNote = document.createElement("div");
                    capacityNote.className = "sp-field-info-text sp-visible";
                    capacityNote.textContent = "No free subpage space. Remove a custom card before enabling another shortcut.";
                    appSubpageDisclosure.section.appendChild(capacityNote);
                }
            }

            function syncMode(mode: string): void {
                appField.style.display = mode === "app" ? "" : "none";
                appFieldLabel.textContent = "Application";
                folderField.style.display = mode === "folder" ? "" : "none";
                shortcutField.style.display = mode === "shortcut" ? "" : "none";
                windowField.style.display = mode === "window" ? "" : "none";
                urlField.style.display = mode === "url" ? "" : "none";
                appSubpageDisclosure.panel.style.display = !helpers.isSub && mode === "app" &&
                    !!companionShortcutFolderAppLabel(card.entity) ? "" : "none";
                autoSwitchField.style.display = !helpers.isSub && mode === "app" &&
                    companionAppShortcutFolderEnabled(card) ? "" : "none";
                finderOpenBehaviorField.style.display = !helpers.isSub && mode === "app" &&
                    card.entity === "com.apple.finder" && companionAppShortcutFolderEnabled(card) ? "" : "none";
                advancedFolderSettings.panel.style.display = mode === "folder" ? "" : "none";
            }
            syncMode(initialMode);

            windowSelect.addEventListener("change", function () {
                const currentLabel = typeof card.label === "string" ? card.label : "";
                const previousLabel = companionWindowActionLabel(card.entity);
                const nextLabel = companionWindowActionLabel(windowSelect.value);
                const previousIcon = companionSubtypeDefaultIcon("window", card.entity);
                const currentIcon = card.icon === "Monitor" ? previousIcon : card.icon || "";
                card.entity = windowSelect.value;
                card.icon = companionGeneratedIcon(
                    currentIcon,
                    previousIcon,
                    companionSubtypeDefaultIcon("window", card.entity),
                );
                helpers.saveField("entity", card.entity);
                helpers.saveField("icon", card.icon);
                const updatedLabel = companionAppLabel(currentLabel, previousLabel, nextLabel);
                if (updatedLabel !== currentLabel) {
                    card.label = updatedLabel;
                    const labelInput = document.getElementById(helpers.idPrefix + "label") as HTMLInputElement | null;
                    if (labelInput) labelInput.value = updatedLabel;
                    helpers.saveField("label", updatedLabel);
                }
                renderButtonSettings();
            });

            function saveUrl(): void {
                const config = companionUrlConfig(urlInput.value);
                card.sensor = config || COMPANION_URL_PREFIX;
                urlNote.textContent = urlInput.value && !config
                    ? "Enter a complete http:// or https:// address."
                    : "Only http:// and https:// addresses are supported.";
                helpers.saveField("sensor", card.sensor);
            }
            urlInput.addEventListener("input", saveUrl);
            urlInput.addEventListener("change", saveUrl);

            loadCompanionActions(true).then(function (actions) {
                companionActions = actions;
                const applicationActions = companionApplicationActions(actions);
                rememberCompanionApplications(applicationActions);
                cardUi.renderPreview();
                availableCompanionApps = applicationActions;
                const folderActions = companionFolderActions(actions);
                availableCompanionFolders = folderActions;
                if (card.entity === "com.apple.finder" && companionAppShortcutFolderEnabled(card)) {
                    finderFolderList.replaceChildren();
                    const page = savedShortcutSubpage || createCompanionShortcutSubpage(card.entity);
                    const definitions = [...folderActions];
                    for (const tile of page.buttons || []) {
                        if (tile.type === "companion" && tile.entity.startsWith(COMPANION_FOLDER_PREFIX) &&
                            !definitions.some(folder => folder.id === tile.entity)) {
                            definitions.push({ id: tile.entity, label: tile.label || tile.entity });
                        }
                    }
                    modalTabs.renderModalTabSettings(finderFolderList, card, helpers, {
                        definitions: () => definitions.map(folder => ({ value: folder.id, label: folder.label })),
                        tabs: (button: any) => button._finderFolderTabs ||
                            (savedShortcutSubpage ? finderFolderTabs(page) : definitions.map(folder => folder.id)),
                        normalizeOptions: (options: string) => options,
                        setTabs: (button: any, tabs: string[]) => {
                            if (!syncFinderFolderSelection(page, definitions, tabs, maxSlots, codec.buildSubpageGrid)) {
                                button._appShortcutCapacityRejected = true;
                                return false;
                            }
                            delete button._appShortcutCapacityRejected;
                            button._finderFolderTabs = tabs;
                            button._appShortcutSelectionChanged = true;
                            return true;
                        },
                        idPrefix: "finder-folder-", hideHeading: true, allowEmpty: true,
                    });
                    if (card._appShortcutCapacityRejected) {
                        const note = document.createElement("div");
                        note.className = "sp-field-info-text sp-visible";
                        note.textContent = "No free subpage space. Remove a tile or reduce its size before enabling another folder.";
                        finderFolderList.appendChild(note);
                    }
                }
                select.replaceChildren();
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = applicationActions.length ? "Choose a Mac app…" : "No Mac apps are available";
                select.appendChild(placeholder);
                applicationActions.forEach(function (action) {
                    const option = document.createElement("option");
                    option.value = action.id;
                    option.textContent = action.label;
                    option.selected = action.id === card.entity;
                    select.appendChild(option);
                });
                if ((initialMode === "app" || initialMode === "url") && card.entity &&
                    !applicationActions.some(function (action) { return action.id === card.entity; })) {
                    const unavailable = document.createElement("option");
                    unavailable.value = card.entity;
                    unavailable.textContent = "Unavailable (" + card.entity + ")";
                    unavailable.selected = true;
                    select.appendChild(unavailable);
                }
                select.disabled = applicationActions.length === 0;

                folderSelect.replaceChildren();
                const folderPlaceholder = document.createElement("option");
                folderPlaceholder.value = "";
                folderPlaceholder.textContent = folderActions.length
                    ? "Choose a folder…" : "Add a folder in the Companion app";
                folderPlaceholder.disabled = true;
                folderPlaceholder.hidden = true;
                folderPlaceholder.selected = !folderActions.some(function (action) { return action.id === card.entity; });
                folderSelect.appendChild(folderPlaceholder);
                folderActions.forEach(function (action) {
                    const option = document.createElement("option");
                    option.value = action.id;
                    option.textContent = action.label;
                    option.selected = action.id === card.entity;
                    folderSelect.appendChild(option);
                });
                if (initialMode === "folder" && card.entity && card.entity !== COMPANION_FOLDER_PREFIX &&
                    !folderActions.some(function (action) { return action.id === card.entity; })) {
                    const unavailable = document.createElement("option");
                    unavailable.value = card.entity;
                    unavailable.textContent = "Unavailable (" + card.entity + ")";
                    unavailable.selected = true;
                    folderSelect.appendChild(unavailable);
                }
                folderSelect.disabled = folderActions.length === 0;
            }).catch(function () {
                availableCompanionApps = [];
                availableCompanionFolders = [];
                select.replaceChildren();
                const unavailable = document.createElement("option");
                unavailable.value = card.entity || "";
                unavailable.textContent = card.entity ? "Unavailable (companion offline)" : "Mac companion unavailable";
                unavailable.selected = true;
                select.appendChild(unavailable);
                folderSelect.replaceChildren();
                const folderUnavailable = document.createElement("option");
                folderUnavailable.value = initialMode === "folder" && card.entity !== COMPANION_FOLDER_PREFIX
                    ? card.entity || "" : "";
                folderUnavailable.textContent = folderUnavailable.value
                    ? "Unavailable (companion offline)" : "Mac companion unavailable";
                folderUnavailable.selected = true;
                folderSelect.appendChild(folderUnavailable);
            });
            select.addEventListener("change", function () {
                const previousAction = companionActions.find(function (action) { return action.id === card.entity; });
                const selectedAction = companionActions.find(function (action) { return action.id === select.value; });
                const currentLabel = typeof card.label === "string" ? card.label : "";
                const nextLabel = companionAppLabel(
                    currentLabel,
                    previousAction?.label || "",
                    selectedAction?.label || "",
                );
                const appChanged = card.entity !== select.value;
                card.entity = select.value;
                resetCompanionShortcutTabs(card);
                if (appChanged) {
                    delete card._appShortcutDisabledTabs;
                    const changedFromSavedApp = card.entity !== savedParent?.entity;
                    card._appShortcutSelectionChanged = changedFromSavedApp;
                    card._appShortcutAppChanged = changedFromSavedApp;
                    card._modalSettingsOpen = true;
                }
                card.options = normalizeCompanionAppShortcutOptions(card);
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                if (nextLabel !== currentLabel) {
                    card.label = nextLabel;
                    const labelInput = document.getElementById(helpers.idPrefix + "label") as HTMLInputElement | null;
                    if (labelInput) labelInput.value = nextLabel;
                    helpers.saveField("label", nextLabel);
                }
                renderButtonSettings();
            });
            folderSelect.addEventListener("change", function () {
                const previousAction = companionActions.find(function (action) { return action.id === card.entity; });
                const selectedAction = companionActions.find(function (action) { return action.id === folderSelect.value; });
                const currentLabel = typeof card.label === "string" ? card.label : "";
                const nextLabel = companionAppLabel(
                    currentLabel,
                    previousAction?.label || "",
                    selectedAction?.label || "",
                );
                card.entity = folderSelect.value;
                card.icon = companionSubtypeIcon(card.icon, "folder", "folder", card.entity, card.entity);
                helpers.saveField("entity", card.entity);
                helpers.saveField("icon", card.icon);
                if (nextLabel !== currentLabel) {
                    card.label = nextLabel;
                    const labelInput = document.getElementById(helpers.idPrefix + "label") as HTMLInputElement | null;
                    if (labelInput) labelInput.value = nextLabel;
                    helpers.saveField("label", nextLabel);
                }
            });
            helpers.renderBasicCardFields(panel, card, helpers, COMPANION_CARD_METADATA, { entity: false });
            if (companionShortcutFolderEditorAvailable(card, savedParent)) {
                const editButton = document.createElement("button");
                editButton.className = "sp-action-btn sp-edit-subpage-btn";
                editButton.textContent = "Edit " + companionShortcutFolderAppLabel(card.entity) + " Subpage";
                editButton.addEventListener("click", function () {
                    selection.closeSettings();
                    codec.enterSubpage(slot);
                });
                panel?.appendChild(editButton);
            }
        },
        renderPreview: function (card?: any, helpers?: any) {
            const mode = companionCardMode(card);
            if (companionCardIsMetric(card)) {
                const metric = companionMetricForEntity(card.entity);
                if (metric?.mode === "ip_address") return {
                    iconHtml: '<span class="sp-btn-icon mdi mdi-laptop"></span>',
                    labelHtml: cardBadgeLabelHtml(helpers, "192.168.1.100"),
                };
                return {
                    iconHtml: '<span class="sp-btn-icon mdi mdi-' + companionMetricIcon(card.entity) + '"></span>',
                    labelHtml: cardBadgeLabelHtml(helpers, companionMetricDisplayLabel(card,
                        companionMetricPreviewValue(card.precision), card.unit || metric?.unit || "%")),
                };
            }
            if (mode === "stats") {
                return cardBadgePreview(card, helpers, {
                    label: card.label || "Stats",
                    iconFallback: companionSubtypeDefaultIcon("stats"),
                    badge: COMPANION_CARD_METADATA.preview.badge,
                });
            }
            const shortcutLabel = formatCompanionShortcutActionId(card.entity);
            const windowLabel = companionWindowActionLabel(card.entity);
            const appLabel = mode === "app" || mode === "url"
                ? companionApplicationLabel(card.entity) : "";
            let urlLabel = "";
            try { urlLabel = new URL(companionUrlValue(card.sensor || "")).hostname; } catch { /* incomplete URL */ }
            const preview = cardBadgePreview(card, helpers, {
                label: card.label || shortcutLabel || windowLabel || urlLabel || appLabel || card.entity ||
                    (mode === "folder" ? "Folder" : "Mac App"),
                iconFallback: companionSubtypeDefaultIcon(mode, card.entity),
                badge: COMPANION_CARD_METADATA.preview.badge,
            });
            if (companionAppShortcutFolderEnabled(card)) {
                const label = card.label || appLabel || card.entity || "Safari";
                preview.labelHtml = '<span class="sp-btn-label-row"><span class="sp-btn-label">' +
                    helpers.escHtml(label) +
                    '</span><span class="sp-subpage-badge mdi mdi-chevron-right"></span></span>';
            }
            return preview;
        },
        contextMenuItems: function (slot?: any, card?: any, helpers?: any) {
            if (helpers?.isSub || !companionAppShortcutFolderEnabled(card)) return;
            helpers.addCtxItem("cog", "Edit " + companionShortcutFolderAppLabel(card.entity) + " Subpage", function () {
                codec.enterSubpage(slot);
            });
        },
        afterSave: async function (card?: any, slot?: any, context?: any) {
            if (context?.isSub) return "saved";
            const folderSelection = card._finderFolderTabs;
            delete card._finderFolderTabs;
            const selectionChanged = card._appShortcutSelectionChanged === true;
            const appChanged = card._appShortcutAppChanged === true;
            const openBehaviorChanged = card._finderOpenBehaviorChanged === true;
            delete card._appShortcutSelectionChanged;
            delete card._appShortcutAppChanged;
            delete card._finderOpenBehaviorChanged;
            delete card._appShortcutDisabledTabs;
            delete card._appShortcutCapacityRejected;
            if (!companionAppShortcutFolderEnabled(card)) return "saved";
            const existing = state.subpages[slot];
            if (existing && !selectionChanged && !appChanged && !openBehaviorChanged) return "saved";
            const source = existing ? {
                ...existing,
                order: (existing.order || []).slice(),
                buttons: (existing.buttons || []).map(function (button: any) { return { ...button }; }),
                grid: (existing.grid || []).slice(),
                sizes: { ...(existing.sizes || {}) },
            } : null;
            let subpage = source && !appChanged
                ? card.entity === "com.apple.finder" ? source : syncCompanionShortcutSubpage(card.entity, companionShortcutTabs(card), source, maxSlots)
                : createCompanionShortcutSubpage(card.entity, companionShortcutTabs(card));
            if (card.entity === "com.apple.finder") {
                codec.buildSubpageGrid(subpage);
                const folders = companionFolderActions(await loadCompanionActions(true));
                if (Array.isArray(folderSelection)) {
                    const updated = syncFinderFolderSelection(subpage, folders, folderSelection, maxSlots, codec.buildSubpageGrid);
                    if (!updated) return "failed";
                    subpage = updated;
                } else {
                    addFinderFolderTiles(subpage, folders, maxSlots);
                }
                syncInheritedFinderOpenBehavior(subpage, finderOpenBehavior(card));
            }
            codec.buildSubpageGrid(subpage);
            state.subpages[slot] = subpage;
            return codec.saveSubpageConfig(slot);
        },
    };
    registry.register("companion", companionDefinition);

    const companionPickerDefinitions: readonly [string, string, string][] = [
        ["companion_app", "Applications", "app"],
        ["companion_shortcut", "Keyboard shortcut", "shortcut"],
        ["companion_url", "Open URL", "url"],
        ["companion_folder", "Open folder", "folder"],
        ["companion_stats", "Stats", "stats"],
        ["companion_window", "Window control", "window"],
    ];
    companionPickerDefinitions.forEach(function (definition) {
        const key = definition[0];
        const label = definition[1];
        const mode = definition[2];
        registry.register(key, {
            ...companionDefinition,
            label,
            pickerKey: null,
            runtimeSpec: CARD_RUNTIME_SPECS.companion,
            onSelect: function (card?: any) {
                companionDefinition.onSelect(card);
                applyCompanionPickerPreset(card, mode);
            },
        });
    });
}
