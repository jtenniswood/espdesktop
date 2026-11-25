import { obsSubpageCatalogue } from "../model/obs_live_subpage";
import { targetedAudioCard } from "./companion_app_volume";
import { childPageKey } from "../model/page_keys";
import { renderCompanionStorageSelector } from "./companion_storage";
import { APPLE_SHORTCUT_PREFIX, COMPANION_FOLDER_PREFIX, COMPANION_OBS_PREFIX, OBS_BRB_ID, OBS_MULTIVIEW_ID, OBS_OUTPUT_OPTIONS, OBS_PROGRAM_ID, OBS_REPLAY_BUFFER_ID, OBS_REPLAY_ID, OBS_STUDIO_ID, OBS_STUDIO_OPTIONS, OBS_TAKE_ID, OBS_TRANSITION_ID, OBS_TRANSITION_OPTIONS, OBS_TRANSITION_SELECT, savedOBSTransition, savedOBSSceneTarget, decodeCompanionCard, encodeCompanionCard, companionMetricForEntity, obsConfirmationControl, obsInputName, obsOutputCardEntity, obsSceneCardEntity } from "../model/companion_card_codec";
import { configOptionEnabled, configOptionValue, setConfigOption, setConfigOptionValue, normalizedCardColorOptions, preserveCardColorOptions, withoutCardColorOptions } from "../model/config_primitives";
import { createCompanionCatalogue, createCompanionCatalogueMonitor } from "../api/companion_catalogue";
import type { CompanionAction } from "../api/companion_catalogue";
export type { CompanionAction } from "../api/companion_catalogue";
import {
    cardContractAllowInSubpage,
    cardContractCard,
    cardContractCardLabel,
    cardContractDefaultConfig,
    cardContractHidden,
    cardContractPickerKey,
    CARD_RUNTIME_SPECS,
} from "../generated/card_contract";
import {
    COMPANION_SYSTEM_METRICS,
    OBS_CARD_STATES,
    OBS_OUTPUT_STATUS_ICONS,
} from "../generated/companion_capabilities";
import {
    companionCardDefaultIcon,
    companionCardModeOptions,
    companionCardModeValid,
    type CompanionCardModeId,
} from "../model/companion_card";
export { COMPANION_SYSTEM_METRICS } from "../generated/companion_capabilities";
import type { CardDefinition, CardRegistry, CardUiServices } from "../application/card_registry";
import { diagnostics } from "../application/diagnostics";
import type { ControlsFieldsFeature } from "../application/controls_fields";
import type { ConfigCodecFeature } from "../application/config_codec";
import type { ButtonSettingsSelectionFeature } from "../application/button_settings_selection";
import type { ConnectorsPageFeature } from "../application/connectors_page";
import type { ConfigModalTabOptionsFeature } from "../application/config_modal_tab_options";
import { state } from "../state/app_instance";
import {
    COMPANION_SHORTCUT_PREFIX,
    COMPANION_SHORTCUT_PRESET_OPTION,
    companionShortcutCatalogApps,
    companionShortcutDefaultTabs,
    companionShortcutPresetCards,
    companionAppShortcutFolderEnabled,
    companionShortcutActionIdValid,
    isSafariUnmodifiedShortcut,
    CHATGPT_CLEAR_UNREADS_ACTION,
    isBooksExtendedShortcut,
    isClaudeScopedShortcut,
    SCOPED_SHORTCUT_PREFIX,
    companionShortcutFolderAppLabel,
    companionShortcutFolderEditorAvailable,
    companionShortcutSelectionMatchesSavedParent,
    companionShortcutTabDefinitions,
    companionShortcutTabs,
    companionShortcutTabsForCapacity,
    companionShortcutTabsFitSubpage,
    companionShortcutTabsFromSubpage,
    replaceCompanionDefinitions,
    applyCompanionShortcutApplication,
    finderFolderTabs,
    reconnectAthenaShortcutSubpage,
    syncFinderFolderSelection,
    appleShortcutPageActions,
    appleShortcutPageTabs,
    createAppleShortcutSubpage,
    defaultAppleShortcutActions,
    syncAppleShortcutSelection,
    createCompanionShortcutSubpage,
    normalizeCompanionCardOptions,
    normalizeCompanionAppShortcutOptions,
    resetCompanionShortcutTabs,
    setCompanionAppShortcutFolderEnabled,
    finderOpenBehavior,
    inheritFinderOpenBehaviorForCard,
    setFinderOpenBehavior,
    syncInheritedFinderOpenBehavior,
    FINDER_OPEN_BEHAVIOR_OPTION,
    COMPANION_URL_OPEN_BEHAVIOR,
    FINDER_OPEN_OVERRIDE_OPTION,
    type FinderOpenBehavior,
    setCompanionShortcutTabs,
    syncCompanionShortcutSubpage,
} from "../application/companion_shortcut_folder";
import { APPLE_SHORTCUT_CUSTOM_ICON_OPTION, APPLE_SHORTCUTS_APP_ID, APPLE_SHORTCUTS_HIDDEN_OPTION, appleShortcutExclusionKey,
    appleShortcutUsesAppIcon, appShortcutPageOwner, hiddenAppleShortcuts, isAppleShortcutsPage, previewSubpageOwner,
    setHiddenAppleShortcuts } from "../model/companion_shortcut_page";
import { appleShortcutPreview } from "../model/finder_folder_preview";

const COMPANION_URL_PREFIX = "url.";
const COMPANION_DEFAULT_BROWSER = "system.default_browser";
const COMPANION_STATS_PLACEHOLDER = "stats";
const COMPANION_STATS_MODES = ["stats", ...COMPANION_SYSTEM_METRICS.map((metric) => metric.mode)];
export const COMPANION_STATS_OPTIONS = COMPANION_SYSTEM_METRICS
    .map((metric) => [metric.mode, metric.label] as const)
    .sort((first, second) => first[1].localeCompare(second[1]));
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
    "claude-escape": "Esc", "escape-twice": "Esc Esc",
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

function companionShortcutKeyLabel(key: string, windows: boolean): string {
    if (windows) {
        if (key === "enter") return "Enter";
        if (key === "delete") return "Backspace";
        if (key === "forwarddelete") return "Delete";
    }
    return COMPANION_SHORTCUT_KEY_LABELS[key] ||
        (key.startsWith("keypad") ? "Keypad " + key.slice(6) : key.toUpperCase());
}

export function formatCompanionShortcutActionId(actionId: string, windows = false): string {
    if (!companionShortcutActionIdValid(actionId)) return "";
    const scoped = actionId.startsWith(SCOPED_SHORTCUT_PREFIX);
    const strokes = actionId.slice((scoped ? SCOPED_SHORTCUT_PREFIX : COMPANION_SHORTCUT_PREFIX).length).split("~");
    const symbols: Readonly<Record<string, string>> = {
        command: "⌘", control: "⌃", option: "⌥", shift: "⇧", function: "Fn ",
    };
    return strokes.map(stroke => {
        const parts = stroke.split("+");
        const key = parts.pop() || "";
        const label = companionShortcutKeyLabel(key, windows);
        if (windows) {
            const names: Readonly<Record<string, string>> = {
                command: "Ctrl", control: "Ctrl", option: "Alt", shift: "Shift", function: "Fn",
            };
            return [...new Set(parts.map(part => names[part])), label].join("+");
        }
        return parts.map(part => symbols[part]).join("") + label;
    }).join(" then ");
}

const SHORTCUT_SEARCH_ALIASES: Readonly<Record<string, string>> = {
    "⌘": "cmd", "⌃": "ctrl", "⌥": "alt", "⇧": "shift",
    "←": "left", "→": "right", "↑": "up", "↓": "down",
    command: "cmd", control: "ctrl", option: "alt", function: "fn",
    return: "enter", escape: "esc",
};

function shortcutSearchKeys(value: string): string[] {
    return value.toLowerCase().replace(/[⌘⌃⌥⇧←→↑↓]/g, key => " " + SHORTCUT_SEARCH_ALIASES[key] + " ")
        .split(/[+\s]+/).filter(Boolean).map(key => SHORTCUT_SEARCH_ALIASES[key] ?? key);
}

export function companionShortcutCatalogSelection(card: any) {
    const options = withoutCardColorOptions(card?.options);
    const marker = configOptionValue(options, COMPANION_SHORTCUT_PRESET_OPTION);
    const separator = marker.lastIndexOf(":");
    if (separator < 0 || !/^(0|[1-9][0-9]{0,2})$/.test(marker.slice(separator + 1))) return undefined;
    const appId = marker.slice(0, separator);
    if (!companionShortcutCatalogApps({ savedAppId: appId }).some((app) => app.appId === appId)) return undefined;
    const preset = companionShortcutPresetCards(appId).find((preset) =>
        preset.entity === card?.entity && preset.options === options);
    if (preset) return { ...preset, appId };
    // A saved card includes the actual keys, even when its preset is offline or has changed.
    if (!companionShortcutActionIdValid(card?.entity)) return undefined;
    return { appId, entity: card.entity, label: card.label || "Saved shortcut",
        icon: card.icon || companionSubtypeDefaultIcon("shortcut"), options };
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

export function companionGeneratedIcon(
    currentIcon: string,
    previousGeneratedIcon: string,
    selectedGeneratedIcon: string,
): string {
    return !currentIcon || currentIcon === "Auto" || currentIcon === previousGeneratedIcon
        ? selectedGeneratedIcon : currentIcon;
}

export function companionSubtypeDefaultIcon(mode: string, entity = ""): string {
    if (entity === OBS_MULTIVIEW_ID) return "View Grid";
    if (mode === "ip_address") return "Laptop";

    if (COMPANION_STATS_MODES.includes(mode)) {
        return companionCardDefaultIcon("stats");
    }
    return companionCardModeValid(mode)
        ? companionCardDefaultIcon(mode)
        : companionCardDefaultIcon("app");
}

export function companionSubtypeIcon(
    currentIcon: string,
    previousMode: string,
    nextMode: string,
): string {
    const previousGeneratedIcon = companionSubtypeDefaultIcon(previousMode);
    const legacyFolderIcon = previousMode === "folder" && currentIcon === "Folder";
    return !currentIcon || currentIcon === "Auto" || currentIcon === "Monitor" ||
        currentIcon === previousGeneratedIcon || legacyFolderIcon
        ? companionSubtypeDefaultIcon(nextMode) : currentIcon;
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

export function companionAppIconEnabled(card: any): boolean {
    return companionCardMode(card) === "app";
}

export function normalizeCompanionAppOptions(card: any): string {
    return normalizeCompanionCardOptions(card);
}

function companionAppLaunchCard(card: any): boolean {
    return companionCardMode(card) === "app" && !String(card?.sensor || "");
}

export function companionEntityForMode(mode: string): string {
    if (mode === "url") return COMPANION_DEFAULT_BROWSER;
    if (mode === "shortcut") return COMPANION_SHORTCUT_PREFIX;
    if (mode === "folder") return COMPANION_FOLDER_PREFIX;
    if (mode === "obs") return COMPANION_OBS_PREFIX;
    if (mode === "obs_mic") return "obs.mute.";
    if (mode === "obs_brb") return OBS_BRB_ID;
    if (mode === "obs_take") return OBS_TAKE_ID;
    if (mode === "obs_studio") return OBS_STUDIO_ID;
    if (mode === "obs_transition") return OBS_TRANSITION_ID;
    if (mode === "obs_replay") return OBS_REPLAY_ID;
    if (mode === "obs_replay_buffer") return OBS_REPLAY_BUFFER_ID;
    if (mode === "obs_output") return OBS_OUTPUT_OPTIONS[0][0];
    if (mode === "obs_status") return OBS_PROGRAM_ID;
    if (mode === "apple_shortcut") return APPLE_SHORTCUT_PREFIX;
    if (mode === "stats") return COMPANION_SYSTEM_METRICS[0]?.id || "";
    return COMPANION_SYSTEM_METRICS.find((metric) => metric.mode === mode)?.id || "";
}

export function companionApplicationActions(actions: readonly CompanionAction[]): readonly CompanionAction[] {
    return sortCompanionLabels(actions.filter((action) =>
        !action.id.startsWith(COMPANION_FOLDER_PREFIX) &&
        !action.id.startsWith(APPLE_SHORTCUT_PREFIX) &&
        !action.id.startsWith(COMPANION_OBS_PREFIX) &&
        !action.id.startsWith("input.level.") &&
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

/** Binds a new companion card to the only connected computer.
 *
 * Without an explicit binding the card follows whichever computer becomes
 * primary, which silently moves cards when computers are added or removed.
 * Existing and unbound cards keep their previous behaviour.
 */
export function bindNewCompanionCardComputer(
    options: string, computers: readonly { id: string }[], isNew: boolean,
): string {
    if (!isNew || configOptionValue(options, "computer")) return options;
    const computer = computers.length === 1 ? computers[0]?.id ?? "" : "";
    return computer ? setConfigOptionValue(options, "computer", computer) : options;
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
    card.options = normalizedCardColorOptions(card.options);
}

export function normalizeCompanionCard(card: any): void {
    if (!card) return;
    const previousOptions = card.options;
    normalizeCompanionCardFields(card);
    card.options = preserveCardColorOptions(previousOptions, card.options);
    card.options = preserveCompanionComputerOption(previousOptions, card.options);
}

function preserveCompanionComputerOption(previous: unknown, normalized: unknown): string {
    const computer = configOptionValue(previous, "computer");
    const options = String(normalized || "");
    return computer && !configOptionValue(options, "computer")
        ? setConfigOptionValue(options, "computer", computer) : options;
}

function normalizeCompanionCardFields(card: any): void {
    if (!card) return;
    card.entity = obsSceneCardEntity(card.entity || "");
    const outputEntity = obsOutputCardEntity(card.entity);
    if (outputEntity !== card.entity) {
        card.entity = outputEntity;
        card.options = normalizedCardColorOptions(card.options);
    }
    if (card.entity === COMPANION_STATS_PLACEHOLDER) {
        card.type = "companion";
        card.sensor = "";
        card.unit = "";
        card.precision = "";
        card.options = normalizedCardColorOptions(card.options);
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
        if (metric.mode === "ip_address") card.options = normalizedCardColorOptions(card.options);
        card.icon_on = "Auto";
        if (!card.icon || card.icon === "Auto" || card.icon === "Monitor") {
            card.icon = companionSubtypeDefaultIcon(metric.mode);
        }
        return;
    }
    if (companionCardMode(card) === "apple_shortcut") {
        card.sensor = "";
        card.unit = "";
        card.precision = "";
        card.options = normalizeCompanionCardOptions(card);
        card.icon_on = "Auto";
        if (!card.icon || card.icon === "Auto") card.icon = companionSubtypeDefaultIcon("apple_shortcut");
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
            card.icon = companionSubtypeDefaultIcon("folder");
        }
        return;
    }
    const mode = companionCardMode(card);
    card.options = normalizeCompanionAppOptions(card);
    card.icon_on = "Auto";
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
    codec: Pick<ConfigCodecFeature, "buildSubpageGrid" | "enterSubpage" | "enterChildSubpage" | "canCreateSubpage" | "getSubpage" | "saveSubpageConfig">,
    selection: Pick<ButtonSettingsSelectionFeature, "closeSettings">,
    maxSlots: number,
    connectorStatus: Pick<ConnectorsPageFeature, "onCompanionConnectionChange" | "onStatusChange" | "companionPlatform">,
    publishGeneratedActions: (folders: readonly CompanionAction[]) => boolean,
) {
    const { cardBadgePreview, cardBadgeLabelHtml, cardSensorPreviewHtml, fieldLabel } = fields;
    const { renderButtonSettings, renderPreview } = cardUi;
    const catalogue = createCompanionCatalogue(fetchImpl);
    // The catalogue now includes actions from every connected computer. The
    // editor works against one computer at a time and saves that computer on
    // the card so the display routes its commands to the right machine.
    let selectedComputer = "";
    let knownComputers: Array<{ id: string; name: string; primary: boolean }> = [];
    let lastComputerSignature = "";
    const rememberComputers = (actions: readonly CompanionAction[]) => {
        const computers: Array<{ id: string; name: string; primary: boolean }> = [];
        for (const action of actions) {
            if (!action.computer || computers.some(computer => computer.id === action.computer)) continue;
            computers.push({
                id: action.computer,
                name: action.computerName || "Computer",
                primary: action.primary === true,
            });
        }
        computers.sort((first, second) => Number(second.primary) - Number(first.primary));
        knownComputers = computers;
        const signature = computers.map(computer =>
            computer.id + ":" + computer.name + ":" + (computer.primary ? "primary" : "secondary")).join("|");
        if (signature !== lastComputerSignature) {
            lastComputerSignature = signature;
            diagnostics("companion.computers", () => ({ computers }));
        }
        if (selectedComputer && !computers.some(computer => computer.id === selectedComputer))
            selectedComputer = "";
    };
    const filterCompanionActions = (actions: readonly CompanionAction[]): readonly CompanionAction[] => {
        const primary = knownComputers.find(computer => computer.primary) || knownComputers[0];
        const target = selectedComputer ||
            (knownComputers.length > 1 && primary ? primary.id : "");
        if (!target) return actions;
        const matching = actions.filter(action => !action.computer || action.computer === target);
        return matching.length > 0 ? matching : actions.filter(action => !action.computer);
    };
    const loadCompanionActions = (refresh = false) => catalogue.load(refresh).then(actions => {
        rememberComputers(actions);
        return filterCompanionActions(actions);
    });
    let lastWindowsCatalogue: boolean | undefined;
    function useWindowsShortcuts(): boolean | undefined {
        const platform = connectorStatus.companionPlatform();
        if (platform) return platform === "windows";
        if (lastWindowsCatalogue !== undefined) return lastWindowsCatalogue;
        const system = document.defaultView?.navigator.platform ?? "";
        if (/^win/i.test(system)) return true;
        if (/^mac/i.test(system)) return false;
        return undefined;
    }
    const obsControlLabels = new Map<string, string>();
    const obsCardStates = new Map<string, CompanionAction>();
    const obsPresentationKey = () => JSON.stringify([...obsCardStates].map(([id, action]) =>
        [id, action.obsState, action.obsDetail, action.obsAvailable]));
    function rememberOBSControls(actions: readonly CompanionAction[]): readonly CompanionAction[] {
        const targets = actions.filter(action => /^obs\.mute\.[a-f0-9-]{36}$/.test(action.id));
        obsControlLabels.clear();
        obsCardStates.clear();
        for (const target of targets) obsControlLabels.set(target.id, target.label);
        for (const action of actions) {
            const scene = savedOBSSceneTarget(action.id);
            if (action.obsState && Object.hasOwn(OBS_CARD_STATES, action.obsState)) {
                const id = scene || savedOBSTransition(action.id) ||
                    action.id.replace(/\.[a-f0-9-]{36}$/, match =>
                        /^(obs\.take|obs\.studio|obs\.brb|obs\.replay\.buffer|obs\.output\.|obs\.source\.)/.test(action.id)
                            ? "" : match);
                obsCardStates.set(id, action);
            }
            if (scene) {
                targets.push({ ...action, id: scene });
                obsControlLabels.set(scene, action.label);
                continue;
            }
            if (action.id === OBS_TAKE_ID || /^obs\.take\.[a-f0-9-]{36}$/.test(action.id)) {
                obsControlLabels.set(OBS_TAKE_ID, action.label);
                if (!action.obsState && action.id !== OBS_TAKE_ID)
                    obsCardStates.set(OBS_TAKE_ID, { ...action, obsState: "take_ready" });
            } else if (action.id === OBS_MULTIVIEW_ID) {
                obsControlLabels.set(action.id, action.label);
            } else if (action.id === OBS_STUDIO_ID || action.id.startsWith(OBS_STUDIO_ID + ".")) {
                obsControlLabels.set(OBS_STUDIO_ID, action.label);
            } else if (action.id === "obs.transition.selected") {
                obsControlLabels.set(action.id, action.label);
            } else if (action.id.startsWith(OBS_TRANSITION_SELECT)) {
                const id = savedOBSTransition(action.id);
                if (id) obsControlLabels.set(id, action.label);
            } else if (action.id === OBS_TRANSITION_ID || action.id.startsWith(OBS_TRANSITION_ID + ".")) {
                obsControlLabels.set(OBS_TRANSITION_ID, action.label);
            } else if (action.id.startsWith(OBS_REPLAY_BUFFER_ID + ".")) {
                obsControlLabels.set(OBS_REPLAY_BUFFER_ID, action.label);
            } else if (action.id.startsWith("obs.source.visible.")) {
                obsControlLabels.set(action.id, action.label);
            } else if (action.id.startsWith("obs.selected.")) {
                obsControlLabels.set("obs.selected", action.id.slice("obs.selected.".length));
            } else if (/^obs\.brb(?:\.[a-f0-9-]{36})?$/.test(action.id)) {
                const label = action.label;
                obsControlLabels.set(OBS_BRB_ID, label.startsWith("Resum") ? "Resume"
                    : (action.id !== OBS_BRB_ID || label === "Starting BRB…") ? "Start" : label);
            } else if (action.id.startsWith("obs.output.")) {
                const output = OBS_OUTPUT_OPTIONS.find(([id]) => action.id === id || action.id.startsWith(id + "."));
                if (output) obsControlLabels.set(output[0], action.label);
            } else if (action.id === "obs.record.active" || action.id === "obs.stream.active" || action.id === OBS_REPLAY_ID || action.id.startsWith("obs.status.")) {
                obsControlLabels.set(action.id, action.label);
            }
        }
        return targets;
    }

    function renderOBSControlSettings(panel: HTMLElement, card: { entity: string; label: string }, helpers: any, audio: boolean): void {
        const { input: labelInput } = helpers.renderCardTextField(panel, card, helpers, {
            label: "Label", idSuffix: "label", bindName: audio ? "label" : null,
            value: card.label || (!audio ? obsControlLabels.get(card.entity) : "") || "",
        });
        // The scene name is the default. Store a label only when the user edits it.
        if (!audio) labelInput.addEventListener("input", () => {
            card.label = labelInput.value;
            helpers.saveField("label", card.label);
            cardUi.renderPreview();
        });
        const showSceneLabel = () => {
            if (!audio && !card.label) labelInput.value = obsControlLabels.get(card.entity) || "";
        };
        const name = audio ? "Source" : "OBS scene";
        const target = audio ? "audio input" : name;
        const placeholder = "Select";
        const unavailable = audio ? "Saved OBS input (unavailable)" : "Saved scene (unavailable)";
        const isNew = card.entity === (audio ? "obs.mute." : COMPANION_OBS_PREFIX);
        const saved = card.entity;
        const options: Array<[string, string]> = [["", placeholder]];
        if (!isNew) {
            const label = obsControlLabels.get(saved);
            options.push([saved, (audio ? obsInputName(label) : label) || unavailable]);
        }
        const { field, select } = helpers.selectField(name, helpers.idPrefix + (audio ? "obs-mic" : "obs-scene"), options,
            saved, () => {
                if (!select.value) return;
                card.entity = select.value;
                helpers.saveField("entity", card.entity);
                showSceneLabel();
                if (!audio) cardUi.renderPreview();
            });
        panel.appendChild(field);
        helpers.markCardPrimaryField(field, "entity");
        helpers.requireField(select, "Choose an " + target + " before saving.");
        const note = document.createElement("p");
        note.className = "sp-setting-note";
        note.textContent = "Loading controls from OBS…";
        field.appendChild(note);
        select.disabled = true;
        void loadCompanionActions(true).then(actions => {
            const targets = rememberOBSControls(actions).filter(action =>
                action.id.startsWith(audio ? "obs.mute." : "obs.target."));
            const entries = targets.map(target => new Option(audio ? obsInputName(target.label) : target.label, target.id));
            if (!isNew && !targets.some(target => target.id === saved)) {
                entries.unshift(new Option(unavailable, saved));
            }
            select.replaceChildren(new Option(placeholder, ""), ...entries);
            select.value = isNew ? "" : saved;
            select.disabled = targets.length === 0;
            showSceneLabel();
            if (targets.length) note.remove();
            else note.textContent = "Connect OBS in the companion app and try again.";
            cardUi.renderPreview();
        }).catch(() => { note.textContent = "Connect OBS in the companion app and try again."; });
        helpers.renderCardIconPicker(panel, card, helpers, COMPANION_CARD_METADATA.icon);
    }
    function renderOBSConfirmation(panel: HTMLElement, card: { entity: string; options: string }, helpers: any): void {
        const control = obsConfirmationControl(card.entity);
        if (!control) return;
        const confirmation = helpers.disclosureSection("Confirmation", helpers.idPrefix + "obs-confirmation", false);
        const save = (key: string, value: string) => {
            card.options = setConfigOptionValue(card.options, key, value);
            helpers.saveField("options", card.options);
        };
        const stored = configOptionValue(card.options, "obs_confirm");
        const section = document.createElement("div");
        section.hidden = stored === "none";
        let when = ["on", "off", "both"].includes(stored) ? stored : control.when;
        helpers.renderCardOptionToggle(confirmation.section, card, helpers, {
            label: "Confirmation Required", idSuffix: "obs-confirm-toggle", checked: !section.hidden,
            onChange: (_: unknown, __: unknown, checked: boolean) => {
                section.hidden = !checked;
                save("obs_confirm", checked ? when : "none");
            },
        });
        helpers.renderCardSegmentControl(section, card, helpers, {
            label: "When", value: when,
            options: [["on", control.enableLabel], ["off", control.disableLabel], ["both", "Both"]],
            onSelect: (_: unknown, __: unknown, mode: string) => { when = mode; save("obs_confirm", mode); },
        });
        for (const [key, label, placeholder, limit] of [
            ["confirm_message", "Message", "Uses the OBS action", 72],
            ["confirm_yes", "Confirm Button", "Yes", 20],
            ["confirm_no", "Cancel Button", "No", 20],
        ] as const) {
            const { input } = helpers.renderCardTextField(section, card, helpers, {
                label, placeholder, idSuffix: key, bindName: null, value: configOptionValue(card.options, key),
            });
            input.maxLength = limit;
            input.addEventListener("input", () => save(key, input.value));
        }
        confirmation.section.appendChild(section);
        panel.appendChild(confirmation.panel);
    }

    function renderOBSProductionSettings(panel: HTMLElement, card: { entity: string; icon: string; options: string; label: string }, helpers: any, mode: "obs_status" | "obs_replay" | "obs_replay_buffer" | "obs_output" | "obs_brb" | "obs_studio" | "obs_transition"): void {
        const { input: labelInput } = helpers.renderCardTextField(panel, card, helpers, {
            label: "Label", idSuffix: "label", field: "label", placeholder: "Automatic",
        });
        const studio = mode === "obs_studio" || card.entity === OBS_PROGRAM_ID;
        const replay = mode === "obs_replay" || mode === "obs_replay_buffer";
        const transition = mode === "obs_transition";
        const directTransition = card.entity.startsWith(OBS_TRANSITION_SELECT);
        const replayOptions = [[OBS_REPLAY_ID, "Save Replay"], [OBS_REPLAY_BUFFER_ID, "Start / Stop Buffer"]];
        if (studio || replay || transition || mode === "obs_output") {
            const { field, select } = helpers.selectField(mode === "obs_output" ? "OBS output" : "Type",
                helpers.idPrefix + (studio ? "obs-studio" : transition ? "obs-transition-type" : replay ? "obs-replay-type" : "obs-output"),
                studio ? OBS_STUDIO_OPTIONS : transition ? OBS_TRANSITION_OPTIONS : replay ? replayOptions : OBS_OUTPUT_OPTIONS,
                directTransition ? OBS_TRANSITION_SELECT : card.entity, () => {
                    const previousIcon = card.entity === "obs.output.virtualcam" ? "Video"
                        : companionSubtypeDefaultIcon(companionCardMode(card), card.entity);
                    card.entity = select.value;
                    card.icon = companionGeneratedIcon(card.icon,
                        previousIcon,
                        card.entity === "obs.output.virtualcam" ? "Video"
                            : companionSubtypeDefaultIcon(companionCardMode(card), card.entity));
                    helpers.saveField("entity", card.entity);
                    cardUi.renderPreview();
                    cardUi.renderButtonSettings();
                });
            panel.appendChild(field);
            helpers.markCardPrimaryField(field, directTransition ? "type" : "entity");
        }
        if (directTransition) {
            const saved = savedOBSTransition(card.entity);
            const entries = [["", "Select"]];
            if (saved) entries.push([saved, obsControlLabels.get(saved) || card.label || "Saved transition"]);
            const { field, select } = helpers.selectField("OBS transition", helpers.idPrefix + "obs-transition",
                entries, saved, () => {
                    if (!select.value) return;
                    const previousName = obsControlLabels.get(card.entity);
                    card.entity = select.value;
                    if (!card.label || card.label === previousName) {
                        card.label = select.selectedOptions[0]?.textContent || "";
                        labelInput.value = card.label;
                        helpers.saveField("label", card.label);
                    }
                    helpers.saveField("entity", card.entity);
                    cardUi.renderPreview();
                });
            panel.appendChild(field);
            helpers.markCardPrimaryField(field, "entity");
            helpers.requireField(select, "Select a transition before saving.");
            select.disabled = true;
            void loadCompanionActions(true).then(actions => {
                rememberOBSControls(actions);
                const transitions = new Map<string, string>();
                for (const action of actions) {
                    const id = savedOBSTransition(action.id);
                    if (id) transitions.set(id, action.label);
                }
                if (saved && !transitions.has(saved)) transitions.set(saved, card.label || "Saved transition (unavailable)");
                select.replaceChildren(new Option("Select", ""), ...Array.from(transitions, ([id, label]) => new Option(label, id)));
                select.value = saved;
                select.disabled = transitions.size === 0;
                cardUi.renderPreview();
            }).catch(() => { /* Keep the saved transition when OBS is offline. */ });
        }
        if (mode !== "obs_output" && !transition) {
            const note = document.createElement("p");
            note.className = "sp-setting-note";
            const descriptions = {
                obs_brb: "Choose your break scene and optional mic in the companion app’s OBS settings.",
                obs_status: "Displays the selected status reported by OBS Studio.",
                obs_studio: "Choose a Studio Mode control.",
                obs_replay: "Saves a clip while the OBS Replay Buffer is running.",
                obs_replay_buffer: "Starts or stops the buffer. Enable Replay Buffer in OBS → Settings → Output first.",
            };
            note.textContent = descriptions[studio ? "obs_studio" : mode];
            panel.appendChild(note);
        }
        renderOBSConfirmation(panel, card, helpers);
        helpers.renderCardIconPicker(panel, card, helpers, COMPANION_CARD_METADATA.icon);
    }

    let companionApplications: readonly CompanionAction[] = [];
    const companionApplicationLabels = new Map<string, string>();
    const appleShortcutEditorActions = new WeakMap<object, readonly CompanionAction[]>();

    function publishLiveSubpageActions(actions: readonly CompanionAction[]): boolean {
        return publishGeneratedActions([
            ...actions.filter(action => action.id.startsWith(COMPANION_FOLDER_PREFIX) || action.id.startsWith(APPLE_SHORTCUT_PREFIX) ||
                action.id === "obs.transition.selected" || action.id.startsWith("obs.source.visible.")),
            ...obsSubpageCatalogue("obs_transitions", actions),
            ...obsSubpageCatalogue("obs_sources", actions),
            ...obsSubpageCatalogue("obs_audio", actions),
            ...obsSubpageCatalogue("obs_scenes", actions),
        ]);
    }

    const companionCatalogueMonitor = createCompanionCatalogueMonitor(
        () => loadCompanionActions(true),
        function (actions) {
            const previousOBS = JSON.stringify([...obsControlLabels]);
            const previousPresentation = obsPresentationKey();
            rememberOBSControls(actions);
            const foldersChanged = publishLiveSubpageActions(actions);
            if (rememberCompanionApplications(actions) || foldersChanged ||
                previousOBS !== JSON.stringify([...obsControlLabels]) ||
                previousPresentation !== obsPresentationKey()) cardUi.renderPreview();
        },
    );

    function rememberCompanionApplications(actions: readonly CompanionAction[]): boolean {
        const applications = companionApplicationActions(actions);
        for (const action of applications) companionApplicationLabels.set(action.id, action.label);
        const iconHashesChanged = applications.some(action =>
            action.iconHash !== companionApplications.find(previous => previous.id === action.id)?.iconHash) ||
            companionApplications.some(previous => previous.iconHash &&
                !applications.some(action => action.id === previous.id));
        const changed = applications.length !== companionApplications.length ||
            applications.some((action, index) =>
                action.id !== companionApplications[index]?.id ||
                action.label !== companionApplications[index]?.label);
        companionApplications = applications;
        if (iconHashesChanged || applications.length > 0)
            document.dispatchEvent(new CustomEvent("espdesktop:app-icon-cache-cleared", { detail: {
                name: "catalogue",
                value: JSON.stringify(applications.map(action => [action.id, action.iconHash || ""]).sort()),
            } }));
        return changed;
    }

    function companionApplicationLabel(actionId: string): string {
        return companionApplicationLabels.get(actionId) || "";
    }

    if (supported) {
        void loadCompanionActions().then(function (actions) {
            rememberCompanionApplications(actions);
            rememberOBSControls(actions);
            publishLiveSubpageActions(actions);
            cardUi.renderPreview();
        }).catch(function () {});
        let shortcutPlatform = connectorStatus.companionPlatform();
        connectorStatus.onStatusChange(() => {
            const platform = connectorStatus.companionPlatform();
            if (platform === shortcutPlatform) return;
            shortcutPlatform = platform;
            renderButtonSettings();
        });
        connectorStatus.onCompanionConnectionChange(function (connected) {
            diagnostics("companion.connection", () => ({ connected }));
            if (connected) companionCatalogueMonitor.start();
            else {
                companionCatalogueMonitor.stop();
                const hadOBSControls = obsControlLabels.size > 0;
                obsControlLabels.clear();
                obsCardStates.clear();
                if (publishGeneratedActions([]) || hadOBSControls) cardUi.renderPreview();
            }
            document.dispatchEvent(new CustomEvent("espdesktop:app-icon-cache-cleared", { detail: {
                name: "companion-connection", value: String(connected),
            } }));
        });
    }

    function applyCompanionPickerPreset(card: any, mode: string): void {
        if (!card) return;
        card.entity = companionEntityForMode(mode);
        card.sensor = mode === "url" ? COMPANION_URL_PREFIX : "";
        card.unit = "";
        card.precision = "";
        card.options = preserveCompanionComputerOption(card.options, normalizedCardColorOptions(card.options));
        card.icon_on = "Auto";
        card.label = "";

        const metric = mode === "stats" ? COMPANION_SYSTEM_METRICS[0] : undefined;
        if (metric) {
            card.unit = metric.unit;
            card.precision = "0";
        }
        card.icon = companionSubtypeDefaultIcon(mode);
    }

    function loadAppShortcuts(appId: string, panel: HTMLElement): void {
        void catalogue.loadShortcutApplication(appId, selectedComputer).then(app => {
            if (app && applyCompanionShortcutApplication(app) && panel.isConnected) renderButtonSettings();
        });
    }

    function renderAppShortcutSettings(panel: HTMLElement, card: any, page: number,
        helpers: { idPrefix: string; saveField: (field: string, value: unknown) => void }, showAll = false): void {
        selectCompanionComputerForCard(card);
        loadAppShortcuts(card.entity, panel);
        const savedShortcutSubpage = state.subpages[page];
        const savedParent = previewSubpageOwner(page, state.buttons, key => state.subpages[key]);
        if (isAppleShortcutsPage(card)) {
            renderAppleShortcutSettings(panel, card, helpers, showAll,
                isAppleShortcutsPage(savedParent) && savedParent?.type === card.type ? savedShortcutSubpage : undefined);
            return;
        }
        if (savedShortcutSubpage &&
            (companionShortcutSelectionMatchesSavedParent(card, savedParent) ||
                (!!appShortcutPageOwner(card) && appShortcutPageOwner(card) === appShortcutPageOwner(savedParent))) &&
            card._appShortcutSelectionChanged !== true) {
            setCompanionShortcutTabs(
                card,
                companionShortcutTabsFromSubpage(card.entity, savedShortcutSubpage),
                savedShortcutSubpage,
            );
        }
        modalTabs.renderModalTabSettings(panel, card, helpers, {
            definitions: function () { return companionShortcutTabDefinitions(card.entity, savedShortcutSubpage); },
            searchPlaceholder: "Find a keyboard shortcut…",
            showAll,
            dragOnly: true,
            tabs: (button: any) => companionShortcutTabsForCapacity(
                companionShortcutTabs(button), maxSlots,
            ),
            normalizeOptions: function (options: string) {
                return normalizeCompanionAppShortcutOptions({ ...card, options });
            },
            setTabs: function (button: any, tabs: string[]) {
                const candidate = reconnectAthenaShortcutSubpage(
                    savedShortcutSubpage ?? undefined, savedParent?.entity, button.entity,
                ) ?? savedShortcutSubpage;
                if (!companionShortcutTabsFitSubpage(button.entity, tabs, candidate, maxSlots)) {
                    button._appShortcutCapacityRejected = true;
                    return false;
                }
                delete button._appShortcutCapacityRejected;
                setCompanionShortcutTabs(button, tabs, candidate);
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
            capacityNote.textContent = "No free subpage space. Remove a custom card before enabling another keyboard shortcut.";
            panel.appendChild(capacityNote);
        }
    }

    function renderAppleShortcutSettings(panel: HTMLElement, card: any,
        helpers: { idPrefix: string; saveField: (field: string, value: unknown) => void },
        inOwnSection: boolean, savedPage?: typeof state.subpages[number]): void {
        const list = document.createElement("div");
        if (inOwnSection) {
            const disclosure = fields.disclosureSection(
                "Apple Shortcuts", helpers.idPrefix + "apple-shortcuts-list", card._appleShortcutListOpen !== false,
            );
            disclosure.button.addEventListener("click", () => {
                card._appleShortcutListOpen = disclosure.button.getAttribute("aria-expanded") === "true";
            });
            disclosure.section.appendChild(list);
            panel.appendChild(disclosure.panel);
        } else {
            panel.appendChild(list);
        }
        const status = document.createElement("div");
        status.className = "sp-field-info-text sp-visible";
        status.textContent = "Loading Apple Shortcuts…";
        list.appendChild(status);
        function render(actions: readonly CompanionAction[]) {
            const source = savedPage ?? createAppleShortcutSubpage([], maxSlots);
            const savedSelection = appleShortcutPageTabs(savedPage);
            const projected = savedPage ? appleShortcutPreview(savedPage.order, savedPage.grid.slice(0, maxSlots),
                savedPage.buttons, actions, hiddenAppleShortcuts(card.options)) : undefined;
            const savedIDs = new Set(savedSelection);
            const pageSelection = projected?.size ? [...new Set(savedPage!.grid.flatMap((slot, position) => {
                const id = projected.get(position)?.id ?? savedPage!.buttons[slot - 1]?.entity;
                return id && (savedIDs.has(id) || projected.has(position)) ? [id] : [];
            }))] : savedSelection;
            const selected: string[] = card._appleShortcutTabs ?? (savedPage ? pageSelection :
                defaultAppleShortcutActions(actions, maxSlots).map(action => action.id));
            const definitions = new Map(actions.map(action => [action.id, action.label]));
            for (const id of savedSelection) {
                if (definitions.has(id)) continue;
                const label = savedPage?.buttons.find(button => button.entity === id)?.label || "Apple Shortcut";
                definitions.set(id, label + " (unavailable)");
            }
            if (!definitions.size) {
                status.textContent = "Enable workflows in Shortcuts settings in the companion app.";
                return;
            }
            status.remove();
            modalTabs.renderModalTabSettings(list, card, helpers, {
                definitions: () => [...definitions].map(([value, label]) => ({ value, label })),
                searchPlaceholder: "Find an Apple Shortcut…",
                showAll: true,
                dragOnly: true,
                tabs: () => selected,
                normalizeOptions: (options: string) => options,
                setTabs: (button: any, tabs: string[]) => {
                    if (!syncAppleShortcutSelection(source, actions, tabs, maxSlots, codec.buildSubpageGrid)) {
                        button._appShortcutCapacityRejected = true;
                        return false;
                    }
                    delete button._appShortcutCapacityRejected;
                    const hidden = hiddenAppleShortcuts(button.options);
                    const checked = new Set(tabs);
                    for (const id of definitions.keys()) if (!checked.has(id)) hidden.add(appleShortcutExclusionKey(id));
                    for (const id of checked) hidden.delete(appleShortcutExclusionKey(id));
                    button.options = setHiddenAppleShortcuts(button.options, hidden);
                    button._appleShortcutTabs = tabs;
                    button._appShortcutSelectionChanged = true;
                    return true;
                },
                idPrefix: "apple-shortcut-",
                hideHeading: true,
                allowEmpty: true,
            });
            if (card._appShortcutCapacityRejected) {
                status.textContent = "No free subpage space. Turn off a shortcut or make room before adding another.";
                list.appendChild(status);
            }
        }
        const loaded = appleShortcutEditorActions.get(card);
        if (loaded) {
            render(loaded);
        } else {
            void loadCompanionActions(true).then(appleShortcutPageActions, () => []).then(actions => {
                if (!list.isConnected || !isAppleShortcutsPage(card)) return;
                appleShortcutEditorActions.set(card, actions);
                render(actions);
            });
        }
    }

    async function saveAppleShortcutSubpage(page: number, selected: readonly string[] | undefined,
        previous?: typeof state.subpages[number]) {
        if (previous && !selected) return "saved";
        const actions = await loadCompanionActions(true).then(appleShortcutPageActions, () => []);
        const subpage = selected
            ? syncAppleShortcutSelection(previous ?? createAppleShortcutSubpage([], maxSlots),
                actions, selected, maxSlots, codec.buildSubpageGrid)
            : createAppleShortcutSubpage(actions, maxSlots);
        if (!subpage) return "failed";
        codec.buildSubpageGrid(subpage);
        state.subpages[page] = subpage;
        return codec.saveSubpageConfig(page);
    }

    function selectCompanionComputerForCard(card: any): void {
        const saved = configOptionValue(card?.options, "computer");
        if (saved) selectedComputer = saved;
        else if (knownComputers.length > 1) {
            const primary = knownComputers.find(computer => computer.primary) || knownComputers[0];
            selectedComputer = primary ? primary.id : "";
        } else selectedComputer = knownComputers.length === 1 ? knownComputers[0]?.id ?? "" : "";
    }

    function renderCompanionComputerField(panel: HTMLElement | undefined, card: any, helpers: any): void {
        selectCompanionComputerForCard(card);
        const isNewDraft = state.settingsDraft?.isNew === true && state.settingsDraft.button === card;
        const bound = bindNewCompanionCardComputer(card.options, knownComputers, isNewDraft);
        if (bound !== card.options) {
            card.options = bound;
            diagnostics("companion.card-bound", () => ({
                entity: card.entity,
                label: card.label,
                computer: configOptionValue(bound, "computer"),
                options: bound,
            }));
            helpers.saveField("options", card.options);
        }
        const saved = configOptionValue(card.options, "computer");
        const savedMissing = !!saved && !knownComputers.some(computer => computer.id === saved);
        if (!panel) return;
        if (knownComputers.length < 2 && !savedMissing) {
            // The action catalogue arrives asynchronously. Re-render once the
            // connected computers are known so the selector appears the first
            // time a card is added instead of waiting for the card to reopen.
            const known = knownComputers.length;
            void loadCompanionActions(true).then(() => {
                if (panel.isConnected && knownComputers.length !== known) renderButtonSettings();
            }).catch(() => { /* Keep the primary computer while Companion is offline. */ });
            return;
        }
        const field = document.createElement("div");
        field.className = "sp-field";
        // Keep the computer selector above the collapsed Card Settings section.
        field.setAttribute("data-sp-card-primary", "computer");
        field.appendChild(fieldLabel("Computer", helpers.idPrefix + "companion-computer"));
        const select = document.createElement("select");
        select.className = "sp-select";
        select.id = helpers.idPrefix + "companion-computer";
        if (savedMissing) {
            const option = document.createElement("option");
            option.value = saved;
            option.textContent = "Saved computer (unavailable)";
            option.selected = true;
            select.appendChild(option);
        }
        for (const computer of knownComputers) {
            const option = document.createElement("option");
            option.value = computer.id;
            option.textContent = computer.name + (computer.primary ? " (primary)" : "");
            option.selected = computer.id === selectedComputer;
            select.appendChild(option);
        }
        select.addEventListener("change", () => {
            selectedComputer = select.value;
            card.options = setConfigOptionValue(card.options, "computer", selectedComputer);
            helpers.saveField("options", card.options);
            renderButtonSettings();
        });
        field.appendChild(select);
        panel.appendChild(field);
    }

    const companionDefinition: any = {
        renderAppShortcutSettings,
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
            renderCompanionComputerField(panel, card, helpers);
            const currentEntity = typeof card.entity === "string" ? card.entity : "";
            card.entity = currentEntity;
            const initialMode = companionCardMode(card);
            if (currentEntity.startsWith("obs.source.") && panel) {
                helpers.renderCardTextField(panel, card, helpers, {
                    label: "Label", idSuffix: "label", field: "label", rerender: true,
                });
                helpers.renderCardIconPicker(panel, card, helpers, COMPANION_CARD_METADATA.icon);
                return;
            }
            if ((initialMode === "obs" || initialMode === "obs_mic") && panel) {
                renderOBSControlSettings(panel, card, helpers, initialMode === "obs_mic");
                return;
            }
            const productionMode = initialMode === "obs_take" ? "obs_studio" : initialMode;
            if ((productionMode === "obs_status" || productionMode === "obs_replay" || productionMode === "obs_replay_buffer" || productionMode === "obs_output" || productionMode === "obs_brb" || productionMode === "obs_studio" || productionMode === "obs_transition") && panel) {
                renderOBSProductionSettings(panel, card, helpers, productionMode);
                return;
            }
            const parentPage = helpers.isSub ? state.editingSubpage : null;
            const canAddSubpage = codec.canCreateSubpage(parentPage);
            const subpageKey = canAddSubpage && slot ? childPageKey(parentPage ?? 0, Number(slot)) : null;
            if (canAddSubpage && initialMode === "app" && companionShortcutFolderAppLabel(card.entity)) {
                setCompanionAppShortcutFolderEnabled(card, true);
            }
            const savedParent = slot ? (helpers.isSub ? codec.getSubpage(parentPage).buttons[slot - 1] : state.buttons[slot - 1]) : null;
            let companionActions: readonly CompanionAction[] = [];
            void catalogue.loadDefinitions(true, selectedComputer).then((definitions) => {
                const windows = definitions.shortcutPlatform === "windows";
                const platformChanged = lastWindowsCatalogue !== windows;
                lastWindowsCatalogue = windows;
                const definitionsChanged = replaceCompanionDefinitions(definitions.applications);
                if (platformChanged) renderPreview();
                if ((platformChanged || definitionsChanged) && panel?.isConnected) renderButtonSettings();
            }).catch(() => { /* Keep available shortcut definitions while Companion is offline. */ });
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
                    status.textContent = "Loading network devices…";
                    field.append(select, status);
                    panel?.appendChild(field);
                    const networkPath = selectedComputer
                        ? `/companion/networks?computer=${encodeURIComponent(selectedComputer)}`
                        : "/companion/networks";
                    void fetch(networkPath, { cache: "no-store" }).then(async (response) => {
                        if (!response.ok) throw new Error("unavailable");
                        const networks: unknown = await response.json();
                        if (!Array.isArray(networks)) throw new Error("unavailable");
                        for (const network of networks) {
                            if (typeof network?.id !== "string" || typeof network?.label !== "string") continue;
                            if (network.id === selectedId) select.options[1]!.textContent = network.label;
                            else select.add(new Option(network.label, network.id));
                        }
                        status.textContent = networks.length ? "Shows the selected device’s IPv4 address." :
                            "Connect the computer and enable Stats sharing to load network devices.";
                    }).catch(() => { status.textContent = "Network devices unavailable. Connect the computer and enable Stats sharing."; });
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

            if (initialMode === "apple_shortcut") {
                const field = document.createElement("div");
                field.className = "sp-field";
                const picker = document.createElement("select");
                picker.className = "sp-select";
                picker.id = helpers.idPrefix + "apple-shortcut";
                field.append(fieldLabel("Apple Shortcut", picker.id), picker);
                const note = document.createElement("div");
                note.className = "sp-field-info-text";
                note.textContent = "Choose which workflows are available under Shortcuts in the companion app.";
                field.appendChild(note);
                panel?.appendChild(field);
                helpers.markCardPrimaryField(field, "entity");

                const savedID = currentEntity === APPLE_SHORTCUT_PREFIX ? "" : currentEntity;
                let workflows: readonly CompanionAction[] = [];
                function showWorkflows(emptyMessage: string): void {
                    picker.replaceChildren();
                    const placeholder = document.createElement("option");
                    placeholder.value = "";
                    placeholder.textContent = workflows.length ? "Choose an Apple Shortcut…" : emptyMessage;
                    placeholder.disabled = true;
                    picker.appendChild(placeholder);
                    for (const action of workflows) {
                        const option = document.createElement("option");
                        option.value = action.id;
                        option.textContent = action.label;
                        picker.appendChild(option);
                    }
                    const selectedID = card.entity === APPLE_SHORTCUT_PREFIX ? "" : card.entity;
                    if (selectedID && !workflows.some(action => action.id === selectedID)) {
                        const unavailable = document.createElement("option");
                        unavailable.value = selectedID;
                        unavailable.textContent = card.label ? card.label + " (unavailable)" : "Workflow unavailable";
                        picker.appendChild(unavailable);
                    }
                    picker.value = selectedID;
                    picker.disabled = workflows.length === 0;
                }
                showWorkflows("Loading Apple Shortcuts…");
                void loadCompanionActions(true).then(actions => {
                    workflows = sortCompanionLabels(actions.filter(action => action.id.startsWith(APPLE_SHORTCUT_PREFIX)));
                    showWorkflows("No available Apple Shortcuts");
                }).catch(() => showWorkflows("Apple Shortcuts unavailable"));
                helpers.requireField(picker, "Choose an Apple Shortcut before saving.", () => true,
                    (value: string) => !!value && (value === savedID || workflows.some(action => action.id === value)));
                picker.addEventListener("change", () => {
                    const selected = workflows.find(action => action.id === picker.value);
                    if (!selected || selected.id === card.entity) return;
                    card.entity = selected.id;
                    card.label = selected.label;
                    helpers.saveField("entity", selected.id);
                    helpers.saveField("label", selected.label);
                    const input = document.getElementById(helpers.idPrefix + "label") as HTMLInputElement | null;
                    if (input) input.value = selected.label;
                });
                helpers.renderBasicCardFields(panel, card, helpers, COMPANION_CARD_METADATA, { entity: false, icon: false });
                const defaultIcon = companionSubtypeDefaultIcon("apple_shortcut");
                const initialIconMode = appleShortcutUsesAppIcon(card) ? "app" : "custom";
                let customIcon = initialIconMode === "custom" && card.icon && card.icon !== "Auto" ? card.icon : defaultIcon;
                const customPicker = helpers.iconPickerField(
                    helpers.idPrefix + "icon-picker", helpers.idPrefix + "icon", customIcon, (icon: string) => {
                        customIcon = card.icon = icon;
                        helpers.saveField("icon", icon);
                    }, "Choose an icon", false,
                );
                const iconMode = helpers.segmentControl([
                    ["app", "Shortcuts App Icon"], ["custom", "Custom Icon"],
                ], initialIconMode, (value: "app" | "custom") => {
                    const useCustom = value === "custom";
                    card.icon = useCustom ? customIcon : defaultIcon;
                    card.options = setConfigOption(card.options, APPLE_SHORTCUT_CUSTOM_ICON_OPTION, useCustom);
                    helpers.saveField("icon", card.icon);
                    helpers.saveField("options", card.options);
                    syncIconControls(value);
                    cardUi.renderPreview();
                });
                function syncIconControls(value: "app" | "custom"): void {
                    iconMode.buttons.app.setAttribute("aria-pressed", String(value === "app"));
                    iconMode.buttons.custom.setAttribute("aria-pressed", String(value === "custom"));
                    customPicker.style.display = value === "custom" ? "" : "none";
                }
                iconMode.segment.setAttribute("role", "group");
                iconMode.segment.setAttribute("aria-label", "Icon");
                syncIconControls(initialIconMode);
                panel?.append(helpers.fieldWithControl("Icon", null, iconMode.segment), customPicker);
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
            loading.textContent = "Loading apps…";
            select.appendChild(loading);
            appField.appendChild(select);
            panel?.appendChild(appField);
            if (initialMode === "app") {
                helpers.markCardPrimaryField(appField, "entity");
            }
            helpers.requireField(select, "Choose an app before saving.", function () {
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
            shortcutField.className = "sp-field sp-shortcut-settings";
            if (initialMode === "shortcut") panel?.classList.add("sp-shortcut-card-settings");
            const savedCatalogShortcut = companionShortcutCatalogSelection(card);
            const isNewShortcut = initialMode === "shortcut" && state.settingsDraft?.isNew;
            const pageApp = isNewShortcut
                ? appShortcutPageOwner(previewSubpageOwner(parentPage, state.buttons, key => state.subpages[key]))
                : undefined;
            const windowsShortcuts = useWindowsShortcuts();
            const platformPending = connectorStatus.companionPlatform() === undefined;
            const catalogueApps = platformPending ? [] : sortCompanionLabels(companionShortcutCatalogApps({
                pageAppId: pageApp, savedAppId: savedCatalogShortcut?.appId, windows: windowsShortcuts,
            }));
            const defaultCatalogApp = catalogueApps.find(app => app.appId === pageApp)?.appId;
            const shortcutType = card._shortcutType || (savedCatalogShortcut || isNewShortcut ? "catalog" : "custom");
            const typeId = helpers.idPrefix + "shortcut-type";
            const typeTabs = helpers.segmentControl([
                ["catalog", "Application"], ["custom", "Custom"],
            ], shortcutType, function (type: string, tab: HTMLButtonElement) {
                if (type === shortcutType) return;
                card._shortcutType = type;
                card._shortcutCatalogSearch = "";
                if (!defaultCatalogApp) card._shortcutCatalogApp = "";
                // Keep the selected combination when switching to Custom.
                if (type === "catalog" || String(card.entity).startsWith(SCOPED_SHORTCUT_PREFIX)) {
                    card.entity = COMPANION_SHORTCUT_PREFIX;
                }
                card.options = preserveCompanionComputerOption(card.options,
                    preserveCardColorOptions(card.options, "app_shortcut_preset=custom"));
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                renderButtonSettings();
                document.getElementById(tab.id)?.focus({ preventScroll: true });
            });
            typeTabs.segment.id = typeId;
            typeTabs.segment.setAttribute("role", "tablist");
            typeTabs.segment.setAttribute("aria-label", "Keyboard shortcut type");
            const customField = document.createElement("div");
            const catalogField = document.createElement("div");
            for (const [type, field] of [["custom", customField], ["catalog", catalogField]] as const) {
                const tab: HTMLButtonElement = typeTabs.buttons[type];
                const selected = type === shortcutType;
                tab.id = typeId + "-" + type;
                tab.tabIndex = selected ? 0 : -1;
                tab.setAttribute("role", "tab");
                tab.setAttribute("aria-selected", String(selected));
                field.id = tab.id + "-panel";
                field.hidden = !selected;
                field.setAttribute("role", "tabpanel");
                field.setAttribute("aria-labelledby", tab.id);
                tab.setAttribute("aria-controls", field.id);
            }
            typeTabs.segment.addEventListener("keydown", function (event: KeyboardEvent) {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                typeTabs.buttons[shortcutType === "custom" ? "catalog" : "custom"].click();
            });
            shortcutField.appendChild(typeTabs.segment);
            const shortcutPanel = helpers.disclosureSection(
                "Keyboard Shortcut", helpers.idPrefix + "shortcut-panel", card._shortcutPanelOpen !== false,
            );
            shortcutPanel.button.addEventListener("click", function () {
                card._shortcutPanelOpen = shortcutPanel.panel.classList.contains("sp-open");
            });
            shortcutPanel.section.appendChild(customField);
            const modifierLabel = document.createElement("div");
            modifierLabel.className = "sp-field-label";
            modifierLabel.textContent = "Modifiers";
            customField.appendChild(modifierLabel);
            const modifierButtons = document.createElement("fieldset");
            modifierButtons.className = "sp-segment";
            modifierButtons.setAttribute("aria-label", "Keyboard shortcut modifiers");
            const shortcutParts: string[] = currentEntity.slice(COMPANION_SHORTCUT_PREFIX.length).split("+");
            let selectedKey = shortcutParts.pop() || "";
            const modifiers: [string, string][] = windowsShortcuts
                ? [["control", "Ctrl"], ["option", "Alt"], ["shift", "Shift"]]
                : [["command", "⌘ Command"], ["control", "⌃ Control"], ["option", "⌥ Option"], ["shift", "⇧ Shift"]];
            if (currentEntity === "shortcut.function+f") modifiers.push(["function", "Fn"]);
            const selectedModifiers = new Set(shortcutParts
                .map(part => windowsShortcuts && part === "command" ? "control" : part)
                .filter(part => modifiers.some(([key]) => key === part)));
            const modifierControls = new Map<string, HTMLButtonElement>();
            for (const [modifier, label] of modifiers) {
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
            keyPlaceholder.textContent = "Select";
            keySelect.appendChild(keyPlaceholder);
            const keyGroups: [string, readonly string[]][] = [
                ["Letters", Array.from("abcdefghijklmnopqrstuvwxyz")],
                ["Numbers", Array.from("0123456789")],
                ["Navigation and editing", Object.values(COMPANION_SHORTCUT_KEYS).filter((key) => !key.startsWith("key"))],
                ["Punctuation", Object.values(COMPANION_SHORTCUT_KEYS).filter((key) => key.startsWith("key"))],
                ["Function keys", Array.from({ length: 20 }, (_, index) => "f" + (index + 1))],
            ];
            if (currentEntity === "shortcut.claude-escape") keyGroups.push(["App keyboard shortcut", ["claude-escape"]]);
            if (currentEntity === "shortcut.escape-twice") keyGroups.push(["Sequence", ["escape-twice"]]);
            for (const [label, keys] of keyGroups) {
                const group = document.createElement("optgroup");
                group.label = label;
                for (const key of keys) {
                    const option = document.createElement("option");
                    option.value = key;
                    option.textContent = companionShortcutKeyLabel(key, windowsShortcuts === true);
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
                const selected = modifiers.map(([modifier]) => modifier).filter((modifier) => selectedModifiers.has(modifier));
                card.entity = COMPANION_SHORTCUT_PREFIX + [...selected, selectedKey].join("+");
                card.options = preserveCompanionComputerOption(card.options,
                    preserveCardColorOptions(card.options, "app_shortcut_preset=custom"));
                helpers.clearFieldError(keySelect);
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                syncShortcutBuilder();
            }
            syncShortcutBuilder();

            const catalogAppField = document.createElement("div");
            catalogAppField.className = "sp-field";
            catalogAppField.appendChild(fieldLabel("App", helpers.idPrefix + "shortcut-catalog-app"));
            const catalogApp = document.createElement("select");
            catalogApp.className = "sp-select";
            catalogApp.id = helpers.idPrefix + "shortcut-catalog-app";
            for (const [value, label] of [["", "Select"], ...catalogueApps.map((app) => [app.appId, app.label] as const)] as const) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                catalogApp.appendChild(option);
            }
            catalogApp.value = savedCatalogShortcut?.appId ?? card._shortcutCatalogApp ?? defaultCatalogApp ?? "";
            if (catalogApp.selectedIndex < 0) catalogApp.value = "";
            catalogAppField.appendChild(catalogApp);
            if (savedCatalogShortcut && !catalogApp.value && windowsShortcuts !== undefined &&
                savedCatalogShortcut.appId.startsWith("windows.") !== windowsShortcuts) {
                const platformHint = document.createElement("p");
                platformHint.className = "sp-field-hint";
                platformHint.textContent = "Choose this shortcut again for the paired computer.";
                catalogAppField.appendChild(platformHint);
            }
            catalogField.appendChild(catalogAppField);
            const catalogShortcutField = document.createElement("div");
            catalogShortcutField.className = "sp-field";
            const fields = document.createElement("div");
            fields.className = "sp-field-stack";
            const search = document.createElement("input");
            search.type = "search";
            search.className = "sp-input";
            search.id = helpers.idPrefix + "shortcut-catalog-search";
            search.placeholder = "Find a keyboard shortcut…";
            search.setAttribute("aria-label", search.placeholder);
            search.value = card._shortcutCatalogSearch ?? "";
            const list = document.createElement("div");
            list.className = "sp-light-tab-list sp-shortcut-catalog-list";
            list.id = helpers.idPrefix + "shortcut-catalog-action";
            list.setAttribute("role", "radiogroup");
            list.setAttribute("aria-label", "Keyboard shortcuts");
            search.setAttribute("aria-controls", list.id);
            const noMatches = document.createElement("div");
            noMatches.className = "sp-field-info-text";
            noMatches.setAttribute("role", "status");
            fields.append(search, list, noMatches);
            catalogShortcutField.appendChild(fields);
            if (catalogApp.value) catalogField.appendChild(catalogShortcutField);
            shortcutPanel.section.appendChild(catalogField);

            if (initialMode === "shortcut" && shortcutType === "catalog" && catalogApp.value && panel) {
                loadAppShortcuts(catalogApp.value, panel);
            }
            const options = initialMode === "shortcut" && shortcutType === "catalog" && catalogApp.value
                ? companionShortcutPresetCards(catalogApp.value) : [];
            const presets = sortCompanionLabels(savedCatalogShortcut?.appId === catalogApp.value &&
                !options.some(item => item.options === savedCatalogShortcut.options && item.entity === savedCatalogShortcut.entity)
                ? [...options.filter(item => item.options !== savedCatalogShortcut.options), savedCatalogShortcut] : options);
            const choices = presets.map((preset, index) => {
                const row = document.createElement("label");
                row.className = "sp-light-tab-row";
                const name = document.createElement("span");
                name.className = "sp-light-tab-label";
                name.textContent = preset.label;
                const keys = document.createElement("span");
                keys.className = "sp-shortcut-catalog-keys";
                keys.textContent = formatCompanionShortcutActionId(preset.entity, windowsShortcuts);
                const input = document.createElement("input");
                input.type = "radio";
                input.className = "sp-shortcut-catalog-radio";
                input.name = list.id;
                input.id = list.id + "-" + index;
                input.value = preset.options;
                input.checked = preset.options === savedCatalogShortcut?.options;
                row.append(input, name, keys);
                list.appendChild(row);
                input.addEventListener("change", () => {
                    card._shortcutType = "catalog";
                    card._shortcutCatalogApp = catalogApp.value;
                    card.label = companionAppLabel(card.label || "", savedCatalogShortcut?.label || "", preset.label);
                    card.icon = companionGeneratedIcon(card.icon || "", savedCatalogShortcut?.icon || companionSubtypeDefaultIcon("shortcut"), preset.icon);
                    card.entity = preset.entity;
                    card.options = preserveCompanionComputerOption(card.options,
                        preserveCardColorOptions(card.options, preset.options));
                    for (const field of ["entity", "options", "label", "icon"]) helpers.saveField(field, card[field]);
                    const scrollTop = list.scrollTop;
                    renderButtonSettings();
                    const updatedList = document.getElementById(list.id);
                    if (updatedList) updatedList.scrollTop = scrollTop;
                    document.getElementById(input.id)?.focus({ preventScroll: true });
                });
                return { row, label: preset.label.toLowerCase(), keys: shortcutSearchKeys(keys.textContent) };
            });
            function filterShortcuts() {
                const query = search.value.trim().toLowerCase();
                const keys = shortcutSearchKeys(query);
                let found = false;
                for (const choice of choices) {
                    const matches = !query || choice.label.includes(query) ||
                        (keys.length > 0 && keys.every(key => choice.keys.includes(key)));
                    choice.row.hidden = !matches;
                    found ||= matches;
                }
                list.hidden = !found;
                noMatches.textContent = query && !found ? "No matching keyboard shortcuts" : "";
                noMatches.classList.toggle("sp-visible", !!noMatches.textContent);
            }
            search.addEventListener("input", () => {
                card._shortcutCatalogSearch = search.value;
                filterShortcuts();
                list.scrollTop = 0;
            });
            filterShortcuts();
            helpers.requireField(catalogApp, "Choose an app before saving.", function () {
                return initialMode === "shortcut" && shortcutType === "catalog";
            });
            helpers.requireField(search, "Choose a shortcut before saving.", function () {
                return initialMode === "shortcut" && shortcutType === "catalog" && !!catalogApp.value;
            }, function () {
                return companionShortcutCatalogSelection(card)?.appId === catalogApp.value;
            });
            catalogApp.addEventListener("change", function () {
                card._shortcutCatalogSearch = "";
                card._shortcutType = "catalog";
                card._shortcutCatalogApp = catalogApp.value;
                card.entity = COMPANION_SHORTCUT_PREFIX;
                card.options = preserveCompanionComputerOption(card.options, normalizedCardColorOptions(card.options));
                helpers.saveField("entity", card.entity);
                helpers.saveField("options", card.options);
                renderButtonSettings();
                document.getElementById(catalogApp.id)?.focus({ preventScroll: true });
            });
            panel?.appendChild(shortcutField);
            helpers.markCardPrimaryField(shortcutField, "shortcut");
            helpers.requireField(keySelect, windowsShortcuts
                ? "Choose a key with Ctrl or Alt before saving."
                : "Choose a key with Command, Control, or Option before saving.", function () {
                return initialMode === "shortcut" && shortcutType === "custom";
            }, function () {
                return companionShortcutActionIdValid(card.entity) && !!selectedKey &&
                    !String(card.entity).startsWith(SCOPED_SHORTCUT_PREFIX) &&
                    ((!isSafariUnmodifiedShortcut(card.entity) &&
                        !isBooksExtendedShortcut(card.entity) && !isClaudeScopedShortcut(card.entity) && card.entity !== CHATGPT_CLEAR_UNREADS_ACTION) ||
                        card.entity === currentEntity);
            });

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

            const urlBehaviorField = document.createElement("div");
            urlBehaviorField.className = "sp-field";
            const urlBehaviorSelect = document.createElement("select");
            urlBehaviorSelect.className = "sp-select";
            urlBehaviorSelect.id = helpers.idPrefix + "companion-url-open-behavior";
            urlBehaviorField.appendChild(fieldLabel("Open in", urlBehaviorSelect.id));
            for (const [value, label] of [["new_tab", "New tab"], ["new_window", "New window"]] as const) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label;
                urlBehaviorSelect.appendChild(option);
            }
            urlBehaviorSelect.value = configOptionValue(card.options, COMPANION_URL_OPEN_BEHAVIOR) === "new_window"
                ? "new_window" : "new_tab";
            urlBehaviorSelect.addEventListener("change", function () {
                card.options = setConfigOptionValue(card.options, COMPANION_URL_OPEN_BEHAVIOR,
                    urlBehaviorSelect.value === "new_window" ? "new_window" : "");
                helpers.saveField("options", card.options);
            });
            urlBehaviorField.appendChild(urlBehaviorSelect);
            panel?.insertBefore(urlBehaviorField, appField);
            helpers.markCardPrimaryField(urlBehaviorField, "url-open-behavior");

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
            const savedShortcutSubpage = subpageKey ? state.subpages[subpageKey] : null;
            if (subpageKey && appShortcutPageOwner(card)) {
                const isFinder = card.entity === "com.apple.finder";
                const needsStarter = !isFinder && card.entity !== APPLE_SHORTCUTS_APP_ID &&
                    !!companionShortcutFolderAppLabel(card.entity) && !companionShortcutDefaultTabs(card.entity).length;
                if (isFinder || needsStarter) {
                    const noteField = document.createElement("div");
                    noteField.className = "sp-field";
                    const note = document.createElement("div");
                    note.className = "sp-field-info-text";
                    note.textContent = isFinder
                        ? "Folders approved in the companion app appear in free cells. Pin a folder to keep it on the board and edit its name or position."
                        : "Connect the companion app to load this app’s shortcuts.";
                    noteField.appendChild(note);
                    appSubpageDisclosure.section.appendChild(noteField);
                }
            }

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
            finderOpenBehaviorNote.textContent = "Default for folder shortcuts. Individual folder cards can override this in Advanced.";
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
                ? [["inherit", "Use folder subpage setting"], ["new_window", "A new window"], ["same_window", "The same window"]]
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
            if (subpageKey && appShortcutPageOwner(card) && card.entity !== "com.apple.finder") {
                renderAppShortcutSettings(appSubpageDisclosure.section, card, subpageKey, helpers);
            }

            function syncMode(mode: string): void {
                appField.style.display = mode === "app" ? "" : "none";
                appFieldLabel.textContent = "Application";
                folderField.style.display = mode === "folder" ? "" : "none";
                shortcutField.style.display = mode === "shortcut" ? "" : "none";
                urlField.style.display = mode === "url" ? "" : "none";
                urlBehaviorField.style.display = urlField.style.display;
                appSubpageDisclosure.panel.style.display = canAddSubpage && mode === "app" &&
                    appShortcutPageOwner(card) ? "" : "none";
                finderOpenBehaviorField.style.display = canAddSubpage && mode === "app" &&
                    card.entity === "com.apple.finder" && companionAppShortcutFolderEnabled(card) ? "" : "none";
                advancedFolderSettings.panel.style.display = mode === "folder" ? "" : "none";
            }
            syncMode(initialMode);

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
                diagnostics("companion.applications", () => ({
                    entity: card.entity,
                    selectedComputer,
                    count: applicationActions.length,
                    computers: knownComputers.map(computer => computer.name),
                }));
                const folderActions = companionFolderActions(actions);
                availableCompanionFolders = folderActions;
                if (card.entity === "com.apple.finder" && companionAppShortcutFolderEnabled(card)) {
                    finderFolderList.replaceChildren();
                    const page = savedShortcutSubpage || createCompanionShortcutSubpage(card.entity);
                    const heading = document.createElement("div");
                    heading.className = "sp-field";
                    heading.appendChild(helpers.fieldLabel("Pin folders"));
                    finderFolderList.appendChild(heading);
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
                            finderFolderTabs(page),
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
                        note.textContent = "No free subpage space. Remove a tile or reduce its size before pinning another folder.";
                        finderFolderList.appendChild(note);
                    }
                }
                select.replaceChildren();
                const placeholder = document.createElement("option");
                placeholder.value = "";
                placeholder.textContent = applicationActions.length ? "Select" : "No apps are available";
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
                    ? "Select" : "Add a folder in the Companion app";
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
            }).catch(function (error: unknown) {
                diagnostics("companion.applications-failed", () => ({
                    entity: card.entity,
                    selectedComputer,
                    error: error instanceof Error ? error.message : String(error),
                }));
                availableCompanionApps = [];
                availableCompanionFolders = [];
                select.replaceChildren();
                const unavailable = document.createElement("option");
                unavailable.value = card.entity || "";
                unavailable.textContent = card.entity ? "Unavailable (companion offline)" : "Companion unavailable";
                unavailable.selected = true;
                select.appendChild(unavailable);
                folderSelect.replaceChildren();
                const folderUnavailable = document.createElement("option");
                folderUnavailable.value = initialMode === "folder" && card.entity !== COMPANION_FOLDER_PREFIX
                    ? card.entity || "" : "";
                folderUnavailable.textContent = folderUnavailable.value
                    ? "Unavailable (companion offline)" : "Companion unavailable";
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
                if (appChanged) {
                    setCompanionAppShortcutFolderEnabled(card, canAddSubpage);
                    const changedFromSavedApp = card.entity !== savedParent?.entity;
                    card.options = setConfigOptionValue(card.options, APPLE_SHORTCUTS_HIDDEN_OPTION,
                        changedFromSavedApp ? "" : configOptionValue(savedParent?.options, APPLE_SHORTCUTS_HIDDEN_OPTION));
                    delete card._appleShortcutTabs;
                    delete card._modalTabsExpanded;
                    delete card._modalTabsSearch;
                    card._appShortcutSelectionChanged = changedFromSavedApp;
                    card._appShortcutAppChanged = changedFromSavedApp;
                    card._modalSettingsOpen = true;
                }
                const reconnected = reconnectAthenaShortcutSubpage(
                    savedShortcutSubpage ?? undefined, savedParent?.entity, card.entity);
                if (reconnected) {
                    setCompanionShortcutTabs(card, companionShortcutTabsFromSubpage(card.entity, reconnected), reconnected);
                } else {
                    resetCompanionShortcutTabs(card);
                }
                card.options = normalizeCompanionAppOptions(card);
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
                card.icon = companionSubtypeIcon(card.icon, "folder", "folder");
                helpers.saveField("entity", card.entity);
                helpers.saveField("icon", card.icon);
                if (nextLabel !== currentLabel) {
                    card.label = nextLabel;
                    const labelInput = document.getElementById(helpers.idPrefix + "label") as HTMLInputElement | null;
                    if (labelInput) labelInput.value = nextLabel;
                    helpers.saveField("label", nextLabel);
                }
            });
            helpers.renderBasicCardFields(panel, card, helpers, COMPANION_CARD_METADATA, {
                entity: false,
                icon: initialMode !== "app",
            });
            if (canAddSubpage && companionShortcutFolderEditorAvailable(card, savedParent)) {
                const editButton = document.createElement("button");
                editButton.className = "sp-action-btn sp-edit-subpage-btn";
                editButton.textContent = "Edit Subpage";
                editButton.addEventListener("click", function () {
                    selection.closeSettings();
                    codec.enterChildSubpage(parentPage, Number(slot));
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
            if (mode === "obs" || mode === "obs_mic" || mode === "obs_take" || mode === "obs_transition" || mode === "obs_status" || mode === "obs_replay" || mode === "obs_replay_buffer" || mode === "obs_output" || mode === "obs_brb" || mode === "obs_studio") {
                const fallback = {
                    obs: "OBS Scene",
                    obs_mic: "Input State",
                    obs_take: "Take Live",
                    obs_transition: "Transition",
                    obs_studio: "Studio Mode",
                    obs_brb: "Break",
                    obs_replay: "Save Replay",
                    obs_replay_buffer: "Replay Buffer",
                    obs_output: OBS_OUTPUT_OPTIONS.find(([id]) => id === card.entity)?.[1] || "OBS Output Control",
                    obs_status: "Program",
                };
                const entity = obsOutputCardEntity(obsSceneCardEntity(card.entity));
                const currentLabel = obsControlLabels.get(entity);
                const output = mode === "obs_output";
                const record = entity === "obs.output.record";
                const virtualCamera = entity === "obs.output.virtualcam";
                const outputKey = virtualCamera ? "obs.status.virtualcam" : record ? "obs.status.record" : "obs.status.stream";
                const presentation = obsCardStates.get(output ? outputKey : entity);
                const stateId = presentation?.obsState;
                const cardState = stateId && OBS_CARD_STATES[stateId];
                const outputStatus = output ? (cardState ? cardState.detail : record && currentLabel === "Stopping" ? "Stopping"
                    : obsControlLabels.get(outputKey)?.split(" · ")[1] || "Unavailable") : "";
                const outputOn = output && (cardState ? cardState.lit : virtualCamera ? outputStatus === "Active" : record
                    ? obsControlLabels.has("obs.record.active") || ["Active", "Paused", "Stopping"].includes(outputStatus)
                    : obsControlLabels.has("obs.stream.active") || ["Live", "Reconnecting"].includes(outputStatus));
                const source = entity.startsWith("obs.source.");
                const scene = mode === "obs" && !source;
                const directTransition = entity.startsWith(OBS_TRANSITION_SELECT);
                const sceneId = entity.slice(-36);
                const selectedScene = scene && !!currentLabel && sceneId === obsControlLabels.get("obs.selected");
                const sensor = mode === "obs_status";
                const multiview = entity === OBS_MULTIVIEW_ID;
                const toggle = entity === OBS_STUDIO_ID || mode === "obs_replay_buffer";
                const replay = mode === "obs_replay";
                const brb = mode === "obs_brb";
                const take = mode === "obs_take";
                const unavailable = (multiview && !currentLabel) || (virtualCamera && outputStatus === "Unavailable") ||
                    (!output && (presentation?.obsAvailable === false ||
                        (replay && !currentLabel && obsControlLabels.has("obs.status.program"))));
                const programScene = sensor && currentLabel?.replace(/^Program · /, "");
                const automaticOutputIcon = output && (!card.icon || ["Auto", "Monitor", virtualCamera ? "Video" : record ? "Record" : "Broadcast"].includes(card.icon));
                const statusIcon = sensor ? (programScene && programScene !== "Unknown" ? "Monitor" : "Monitor Off")
                    : OBS_OUTPUT_STATUS_ICONS[outputStatus]?.[virtualCamera ? 2 : record ? 0 : 1] || "Monitor Off";
                const alias = (mode === "obs_mic" || scene || source || directTransition) && card.label;
                const mic = mode === "obs_mic";
                const muted = mic && (cardState ? stateId === "audio_muted" : currentLabel?.startsWith("Muted · "));
                const live = mic && (cardState ? stateId === "audio_live" : currentLabel?.startsWith("Unmuted · "));
                const label = multiview ? card.label || "Multiview"
                    : output ? (virtualCamera ? "Virtual Camera" : record ? (outputOn ? "Recording" : "Record") : "Stream")
                    : alias || (!mic && currentLabel) || (directTransition && card.label) || fallback[mode];
                const preview = cardBadgePreview(sensor || automaticOutputIcon || muted
                    ? { ...card, icon: muted ? "Microphone Off" : statusIcon } : card, helpers, {
                    label, iconFallback: companionSubtypeDefaultIcon(mode, entity), badge: COMPANION_CARD_METADATA.preview.badge,
                });
                if (mic || sensor || output || scene || toggle || take || mode === "obs_transition" || brb || replay) {
                    const status = replay && currentLabel === "Save Replay" ? "Ready"
                        : currentLabel || (replay && obsControlLabels.has("obs.status.program") ? "Start Replay Buffer" : "");
                    const [name, detail] = status.split(" · ", 2);
                    const takeReady = stateId === "take_ready";
                    const takeScene = takeReady && (presentation?.obsDetail || status.slice("Take Live · ".length));
                    const legacyTakeDetail = take && !stateId && detail;
                    const takeSameScene = stateId === "take_same_scene" || legacyTakeDetail === "Already on Program";
                    const defaultTitle = takeSameScene ? "Currently Live" : takeScene ? "Take " + takeScene
                        : mic || output || scene || directTransition ? label : fallback[mode];
                    const title = ((takeReady || takeSameScene) && card.label === "Take Live" ? "" : card.label) || defaultTitle;
                    const presentationDetail = cardState && (take || toggle || replay || brb)
                        ? presentation?.obsDetail ?? cardState.detail : undefined;
                    const note = mic ? (!unavailable && muted ? "Muted" : !unavailable && live ? "Live" : "Unavailable")
                        : sensor ? programScene || "Unavailable"
                        : output ? outputStatus
                        : takeReady ? obsControlLabels.get(OBS_TRANSITION_ID) || ""
                        : takeSameScene || (take && (presentationDetail ?? detail) === "Transitioning") ? ""
                        : scene ? "Scene"
                        : directTransition ? currentLabel ? "Transition" : "Unavailable"
                        : mode === "obs_transition" ? currentLabel || "Unavailable"
                        : status === "BRB · Already on break" ? "" : presentationDetail ?? (detail || (name === defaultTitle ? "" : name || "Unavailable"));
                    preview.labelHtml = '<span class="sp-btn-label-row sp-obs-label"><span class="sp-btn-label">' +
                        helpers.escHtml(title) + '</span><span class="sp-obs-detail">' + helpers.escHtml(note) + '</span></span>';
                }
                return {
                    ...preview,
                    buttonClass: unavailable ? "sp-obs-unavailable" : undefined,
                    sensorSurface: sensor,
                    isOn: mic ? (!unavailable && !!live) : cardState ? cardState.lit : outputOn || (toggle && currentLabel === "On") || (brb && currentLabel === "Resume") || selectedScene ||
                        (directTransition && entity === obsControlLabels.get("obs.transition.selected")) ||
                        (source && obsControlLabels.has(entity.replace("obs.source.", "obs.source.visible."))),
                };
            }
            const shortcutLabel = formatCompanionShortcutActionId(card.entity, useWindowsShortcuts());
            const appLabel = mode === "app" || mode === "url"
                ? companionApplicationLabel(card.entity) : "";
            let urlLabel = "";
            try { urlLabel = new URL(companionUrlValue(card.sensor || "")).hostname; } catch { /* incomplete URL */ }
            const preview = cardBadgePreview(card, helpers, {
                label: card.label || (mode === "apple_shortcut" ? "Apple Shortcut" : "") ||
                    shortcutLabel || urlLabel || appLabel || card.entity ||
                    (mode === "folder" ? "File Folder" : "Application"),
                iconFallback: companionSubtypeDefaultIcon(mode),
                badge: COMPANION_CARD_METADATA.preview.badge,
            });
            const workflowIcon = mode === "apple_shortcut" && appleShortcutUsesAppIcon(card);
            if (workflowIcon || companionAppIconEnabled(card)) {
                preview.appIconId = workflowIcon ? APPLE_SHORTCUTS_APP_ID : card.entity;
                if (workflowIcon) preview.appIconSize = "small";
                const background = configOptionValue(card.options, "app_bg_color").toUpperCase();
                if (/^[0-9A-F]{6}$/.test(background)) preview.appIconBackgroundColor = background;
                preview.iconHtml = preview.iconHtml.replace(
                    "sp-btn-icon ", "sp-btn-icon sp-companion-app-icon-fallback ",
                );
            }
            const hideAppLaunchLabel = companionAppLaunchCard(card) &&
                configOptionEnabled(card.options, "app_hide_label");
            if (appShortcutPageOwner(card)) {
                if (hideAppLaunchLabel) {
                    preview.labelHtml =
                        '<span class="sp-btn-label-row"><span class="sp-subpage-badge mdi mdi-chevron-right"></span></span>';
                } else {
                    const label = card.label || appLabel || card.entity || "Safari";
                    preview.labelHtml = '<span class="sp-btn-label-row"><span class="sp-btn-label">' +
                        helpers.escHtml(label) +
                        '</span><span class="sp-subpage-badge mdi mdi-chevron-right"></span></span>';
                }
            } else if (hideAppLaunchLabel) {
                preview.labelHtml = "";
            }
            return preview;
        },
        contextMenuItems: function (slot?: any, card?: any, helpers?: any) {
            const parent = helpers?.isSub ? state.editingSubpage : null;
            if (!codec.canCreateSubpage(parent) || !appShortcutPageOwner(card)) return;
            helpers.addCtxItem("cog", "Edit Subpage", function () {
                codec.enterChildSubpage(parent, Number(slot));
            });
        },
        afterSave: async function (card?: any, slot?: any, context?: any) {
            const parent = context?.isSub ? context.page ?? state.editingSubpage : null;
            if (!codec.canCreateSubpage(parent)) return "saved";
            slot = childPageKey(parent ?? 0, Number(slot));
            const folderSelection = card._finderFolderTabs;
            delete card._finderFolderTabs;
            const appleShortcutSelection = card._appleShortcutTabs;
            delete card._appleShortcutTabs;
            const selectionChanged = card._appShortcutSelectionChanged === true;
            const appChanged = card._appShortcutAppChanged === true;
            const openBehaviorChanged = card._finderOpenBehaviorChanged === true;
            delete card._appShortcutSelectionChanged;
            delete card._appShortcutAppChanged;
            delete card._finderOpenBehaviorChanged;
            delete card._appShortcutCapacityRejected;
            const existing = context?.reconnectedSubpage ?? state.subpages[slot];
            if (!companionAppShortcutFolderEnabled(card) && (!existing || !appShortcutPageOwner(card))) return "saved";
            if (existing && !selectionChanged && !appChanged && !openBehaviorChanged) return "saved";
            if (card.entity === APPLE_SHORTCUTS_APP_ID) {
                return saveAppleShortcutSubpage(slot, appleShortcutSelection, appChanged ? undefined : existing);
            }
            if ((!existing || appChanged) && card.entity !== "com.apple.finder" &&
                !companionShortcutDefaultTabs(card.entity).length) {
                const app = await catalogue.loadShortcutApplication(card.entity, selectedComputer);
                if (app) applyCompanionShortcutApplication(app);
            }
            const source = existing ? {
                ...existing,
                order: (existing.order || []).slice(),
                buttons: (existing.buttons || []).map(function (button: any) { return { ...button }; }),
                grid: (existing.grid || []).slice(),
                sizes: { ...(existing.sizes || {}) },
            } : null;
            let subpage;
            if (source && context?.reconnectedSubpage) {
                const tabs = companionShortcutTabs(card);
                const existingTabs = companionShortcutTabsFromSubpage(card.entity, source);
                subpage = tabs.join("|") === existingTabs.join("|") ? source :
                    syncCompanionShortcutSubpage(card.entity, tabs, source, maxSlots);
            } else if (source && !appChanged) {
                subpage = card.entity === "com.apple.finder" ? source :
                    syncCompanionShortcutSubpage(card.entity, companionShortcutTabs(card), source, maxSlots);
            } else {
                subpage = createCompanionShortcutSubpage(card.entity,
                    companionShortcutTabsForCapacity(companionShortcutTabs(card), maxSlots));
            }
            if (card.entity === "com.apple.finder") {
                codec.buildSubpageGrid(subpage);
                if (Array.isArray(folderSelection)) {
                    const folders = companionFolderActions(await loadCompanionActions(true));
                    const updated = syncFinderFolderSelection(subpage, folders, folderSelection, maxSlots, codec.buildSubpageGrid);
                    if (!updated) return "failed";
                    subpage = updated;
                }
                syncInheritedFinderOpenBehavior(subpage, finderOpenBehavior(card));
            }
            codec.buildSubpageGrid(subpage);
            state.subpages[slot] = subpage;
            return codec.saveSubpageConfig(slot);
        },
    };
    registry.register("companion", companionDefinition);

    registry.register("companion_app_volume", targetedAudioCard(
        supported, async () => companionApplicationActions(await loadCompanionActions(true)), cardUi, fields, "companion_app_volume", false,
        (panel, card, helpers) => renderCompanionComputerField(panel, card, helpers)));
    registry.register("companion_input_device", targetedAudioCard(
        supported, async () => sortCompanionLabels(await loadCompanionActions(true)), cardUi, fields, "companion_input_device", true,
        (panel, card, helpers) => renderCompanionComputerField(panel, card, helpers)));

    function deviceAudioCard(type: string, slider: boolean): CardDefinition {
        const defaults = cardContractDefaultConfig(type);
        const metadata = { icon: { fallback: defaults.icon } };
        return {
            label: defaults.label,
            pickerLabel: cardContractCard(type)?.pickerLabel || defaults.label,
            pickerKey: cardContractPickerKey(type),
            cardMetadata: metadata,
            allowInSubpage: cardContractAllowInSubpage(type),
            isAvailable: () => supported,
            labelPlaceholder: defaults.label,
            defaultConfig: () => defaults,
            onSelect: (card) => Object.assign(card, defaults),
            renderSettings: (panel, card, _slot, helpers) => {
                renderCompanionComputerField(panel, card, helpers);
                if (type === "companion_input_mute") {
                    helpers.renderCardOptionToggle(panel, card, helpers, {
                        label: "Hold to end Teams call",
                        idSuffix: "hold-end-call",
                        checked: configOptionValue(card.options, "hold_action") === "end_call",
                        onChange: (_: unknown, __: unknown, checked: boolean) => {
                            card.options = setConfigOptionValue(card.options, "hold_action",
                                checked ? "end_call" : "");
                            helpers.saveField("options", card.options);
                        },
                    });
                }
                helpers.renderCardIconPicker(panel, card, helpers, metadata.icon);
            },
            renderPreview: (card, helpers) => cardBadgePreview(card, helpers, {
                label: card.label || defaults.label,
                iconFallback: defaults.icon,
                iconExtraHtml: slider
                    ? '<span class="sp-slider-preview"><span class="sp-slider-track"><span class="sp-slider-fill"></span></span></span>'
                    : "",
            }),
        };
    }

    registry.register("companion_output_volume", deviceAudioCard("companion_output_volume", true));
    registry.register("companion_input_volume", deviceAudioCard("companion_input_volume", true));
    registry.register("companion_output_mute", deviceAudioCard("companion_output_mute", false));
    registry.register("companion_input_mute", deviceAudioCard("companion_input_mute", false));

    const macLockDefaults = cardContractDefaultConfig("companion_mac_lock");
    const macLockMetadata = {
        icon: { fallback: macLockDefaults.icon },
        preview: { iconFallback: macLockDefaults.icon, badge: COMPANION_CARD_METADATA.preview.badge },
    };
    registry.register("companion_mac_lock", {
        label: macLockDefaults.label,
        pickerLabel: cardContractCard("companion_mac_lock")?.pickerLabel || macLockDefaults.label,
        cardMetadata: macLockMetadata,
        allowInSubpage: cardContractAllowInSubpage("companion_mac_lock"),
        isAvailable: () => supported,
        labelPlaceholder: macLockDefaults.label,
        defaultConfig: () => macLockDefaults,
        onSelect: (card) => Object.assign(card, macLockDefaults),
        normalizeConfig: (card) => Object.assign(card, macLockDefaults, {
            label: card.label || macLockDefaults.label,
            icon: card.icon && card.icon !== "Auto" ? card.icon : macLockDefaults.icon,
            options: preserveCompanionComputerOption(card.options,
                normalizedCardColorOptions(card.options)),
        }),
        renderSettings: (panel, card, _slot, helpers) => {
            renderCompanionComputerField(panel, card, helpers);
            helpers.renderCardIconPicker(panel, card, helpers, macLockMetadata.icon);
        },
        renderPreview: (card, helpers) => cardBadgePreview(card, helpers, {
            ...macLockMetadata.preview,
            label: card.label || macLockDefaults.label,
        }),
    });

    const coughDefaults = cardContractDefaultConfig("companion_cough");
    const coughMetadata = {
        icon: { fallback: coughDefaults.icon },
        preview: { iconFallback: coughDefaults.icon, badge: COMPANION_CARD_METADATA.preview.badge },
    };
    registry.register("companion_cough", {
        cardMetadata: coughMetadata,
        label: coughDefaults.label,
        pickerKey: cardContractPickerKey("companion_cough"),
        allowInSubpage: cardContractAllowInSubpage("companion_cough"),
        isAvailable: () => supported,
        labelPlaceholder: coughDefaults.label,
        defaultConfig: () => coughDefaults,
        onSelect: (card) => Object.assign(card, coughDefaults),
        renderSettings: (panel, card, _slot, helpers) => {
            renderCompanionComputerField(panel, card, helpers);
            helpers.renderCardIconPicker(panel, card, helpers, coughMetadata.icon);
        },
        renderPreview: (card, helpers) => cardBadgePreview(card, helpers, {
            ...coughMetadata.preview,
            label: card.label || coughDefaults.label,
        }),
    });

    const obsCoughDefaults = cardContractDefaultConfig("companion_obs_cough");
    const obsCoughPrefix = "obs.cough.";
    registry.register("companion_obs_cough", {
        ...registry.definitions.companion_cough,
        label: cardContractCardLabel("companion_obs_cough"),
        pickerKey: cardContractPickerKey("companion_obs_cough"),
        defaultConfig: () => obsCoughDefaults,
        onSelect: (card) => Object.assign(card, obsCoughDefaults),
        renderPreview: (card, helpers) => cardBadgePreview(card, helpers, {
            ...coughMetadata.preview,
            label: card.label || obsCoughDefaults.label,
        }),
        renderSettings: (panel, card, _slot, helpers) => {
            renderCompanionComputerField(panel, card, helpers);
            const saved = card.entity;
            const placeholder = "Select";
            const choices: [string, string][] = [["", placeholder]];
            if (saved) choices.push([saved, "Saved OBS input"]);
            const { field, select } = helpers.selectField("Source", helpers.idPrefix + "obs-cough",
                choices, saved, () => {
                    if (!select.value) return;
                    card.entity = select.value;
                    helpers.saveField("entity", card.entity);
                });
            panel.appendChild(field);
            helpers.markCardPrimaryField(field, "entity");
            helpers.requireField(select, "Choose an audio input before saving.");
            const note = document.createElement("p");
            note.className = "sp-setting-note";
            note.textContent = "Loading audio inputs from OBS…";
            field.appendChild(note);
            select.disabled = true;
            void loadCompanionActions(true).then(actions => {
                const inputs = actions.filter(action => action.id.startsWith(obsCoughPrefix));
                const entries = inputs.map(input => new Option(input.label, input.id));
                if (saved && !inputs.some(input => input.id === saved))
                    entries.unshift(new Option("Saved OBS input (unavailable)", saved));
                select.replaceChildren(new Option(placeholder, ""), ...entries);
                select.value = saved;
                select.disabled = inputs.length === 0;
                note.textContent = inputs.length ? "Hold to mute the selected input in OBS."
                    : "Connect OBS in the companion app to choose an input.";
            }).catch(() => { note.textContent = "Connect OBS in the companion app to choose an input."; });
            helpers.renderCardIconPicker(panel, card, helpers, coughMetadata.icon);
        },
    });

    const companionPickerDefinitions: readonly [string, string, string][] = [
        ["companion_app", "Applications", "app"],
        ["companion_shortcut", "Keyboard Shortcut", "shortcut"],
        ["companion_url", "Website", "url"],
        ["companion_folder", "File Folder", "folder"],
        ["companion_obs", "Scene", "obs"],
        ["companion_obs_mic", "Input State", "obs_mic"],
        ["companion_obs_studio", "Studio Mode", "obs_studio"],
        ["companion_obs_transition", "Transitions", "obs_transition"],
        ["companion_obs_brb", "Break", "obs_brb"],
        ["companion_obs_replay", "Replay Buffer", "obs_replay"],
        ["companion_obs_output", "Output Controls", "obs_output"],
        ["companion_apple_shortcut", "Run a shortcut", "apple_shortcut"],
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
    return { renderAppShortcutSettings, saveAppleShortcutSubpage };
}
