import { COMPANION_SHORTCUT_APPS as BUNDLED_SHORTCUT_APPS } from "../generated/app_shortcuts";
import { bundledExpandedShortcuts, SCOPED_SHORTCUT_PREFIX } from "./companion_shortcut_data";
import type { AppShortcutApplication } from "../generated/app_shortcuts";
export { SCOPED_SHORTCUT_PREFIX } from "./companion_shortcut_data";
export const COMPANION_SHORTCUT_APPS: AppShortcutApplication[] = [...BUNDLED_SHORTCUT_APPS];

export function replaceCompanionDefinitions(apps: readonly AppShortcutApplication[]): boolean {
    const normalized = apps.map(({ extendedShortcuts, additionalShortcuts, claudeShortcuts, safariShortcuts, ...app }) => {
        if (app.appId === CODEX_BUNDLE_ID && !app.catalog && Array.isArray(additionalShortcuts)) {
            const additional = additionalShortcuts.filter((item) => {
                const action = COMPANION_SHORTCUT_PREFIX + item?.shortcut;
                return companionShortcutActionIdValid(action) && !isBooksExtendedShortcut(action) &&
                    !isSafariUnmodifiedShortcut(action) && !isClaudeScopedShortcut(action);
            });
            return { ...app, shortcuts: [...app.shortcuts, ...additional] };
        }
        const safari = safariShortcuts ?? extendedShortcuts;
        if ((app.appId === SAFARI_BUNDLE_ID || app.appId === SAFARI_WEB_APP_TEMPLATE) && Array.isArray(safari)) {
            const extended = safari.filter((item) =>
                isSafariUnmodifiedShortcut(COMPANION_SHORTCUT_PREFIX + item?.shortcut));
            return { ...app, shortcuts: [...app.shortcuts, ...extended] };
        }
        if (app.appId === CLAUDE_DESKTOP_BUNDLE_ID && !app.catalog && Array.isArray(claudeShortcuts)) {
            const additional = claudeShortcuts.filter((item) => {
                const action = COMPANION_SHORTCUT_PREFIX + item?.shortcut;
                return companionShortcutActionIdValid(action) && !isBooksExtendedShortcut(action) &&
                    !isSafariUnmodifiedShortcut(action) && action !== CHATGPT_CLEAR_UNREADS_ACTION;
            });
            return { ...app, shortcuts: [...app.shortcuts, ...additional] };
        }
        if (app.appId !== "com.apple.iBooksX" || app.catalog || !Array.isArray(extendedShortcuts)) return app;
        const extended = extendedShortcuts.filter((item) => isBooksExtendedShortcut(COMPANION_SHORTCUT_PREFIX + item?.shortcut));
        return { ...app, shortcuts: [...extended, ...app.shortcuts] };
    });
    // Keep the bundled catalogue available when the Mac supplies fewer definitions.
    const byAppId = new Map(BUNDLED_SHORTCUT_APPS.map((app) => [app.appId, app]));
    for (const app of normalized) {
        const bundled = byAppId.get(app.appId);
        const more = new Map(bundled?.moreShortcuts?.map(item => [item.id, item]));
        if (Array.isArray(app.moreShortcuts)) {
            for (const item of app.moreShortcuts) {
                if (typeof item?.id === "string" && /^(0|[1-9][0-9]{0,2})$/.test(item.id) &&
                    typeof item.label === "string" && typeof item.icon === "string" && typeof item.shortcut === "string" &&
                    companionShortcutActionIdValid(COMPANION_SHORTCUT_PREFIX + item.shortcut)) {
                    more.set(item.id, item);
                }
            }
        }
        const { moreShortcuts: _remote, ...starter } = app;
        const template = SAFARI_WEB_APP_BUNDLE_ID.test(app.appId) && app.label === "Athena"
            ? byAppId.get(ATHENA_TEMPLATE_APP_ID) : bundled;
        if (template?.defaultShortcutIds) starter.defaultShortcutIds ??= template.defaultShortcutIds;
        byAppId.set(app.appId, more.size ? { ...starter, moreShortcuts: [...more.values()] } : starter);
    }
    const definitions = [...byAppId.values()];
    const shortcutChanged = JSON.stringify(COMPANION_SHORTCUT_APPS) !== JSON.stringify(definitions);
    if (shortcutChanged) COMPANION_SHORTCUT_APPS.splice(0, COMPANION_SHORTCUT_APPS.length, ...definitions);
    return shortcutChanged;
}

import { companionSavedCardMode } from "../model/companion_card_codec";
import {
    configOptionEnabled,
    configOptionValue,
    setConfigOption,
    setConfigOptionValue,
    preserveCardColorOptions,
} from "../model/config_primitives";
import { cardTransferOwnsSubpage } from "../model/card_transfer";
import { appShortcutPageOwner } from "../model/companion_shortcut_page";
import type { CardConfig } from "../contracts/types";
import { isBackOrderToken } from "../model/subpage";
import type { SubpageConfig } from "../contracts/types";

export const COMPANION_APP_SHORTCUTS_OPTION = "app_shortcuts";
export const COMPANION_APP_SHORTCUTS_TABS_OPTION = "app_shortcuts_tabs";
export const COMPANION_URL_OPEN_BEHAVIOR = "url_open_behavior";
export const FINDER_OPEN_BEHAVIOR_OPTION = "finder_open_behavior";
export const FINDER_OPEN_OVERRIDE_OPTION = "finder_open_override";
export const COMPANION_SHORTCUT_PRESET_OPTION = "app_shortcut_preset";
const COMPANION_SHORTCUT_CUSTOM_PRESET = "custom";
export const SAFARI_BUNDLE_ID = "com.apple.Safari";
const CLAUDE_DESKTOP_BUNDLE_ID = "com.anthropic.claudefordesktop";
const SAFARI_WEB_APP_TEMPLATE = "com.apple.Safari.WebApp";
const SAFARI_WEB_APP_BUNDLE_ID = /^com\.apple\.Safari\.WebApp\.[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/;
const ATHENA_TEMPLATE_APP_ID = "io.github.jtenniswood.athena";
export const CODEX_BUNDLE_ID = "com.openai.codex";
export const CHATGPT_CLEAR_UNREADS_ACTION = "shortcut.shift+escape";
const LAST_LEGACY_CHATGPT_PRESET_ID = 18;
export const SLACK_BUNDLE_ID = "com.tinyspeck.slackmacgap";
export const COMPANION_SHORTCUT_PREFIX = "shortcut.";
const COMPANION_SHORTCUT_MODIFIERS = new Set(["command", "control", "option", "shift"]);
const COMPANION_SHORTCUT_KEYS = new Set([
    "space", "enter", "tab", "escape", "delete", "forwarddelete",
    "left", "right", "up", "down", "home", "end", "pageup", "pagedown",
    "keycomma", "keyperiod", "keyslash", "keysemicolon", "keyquote", "keybackslash",
    "keyminus", "keyequal", "keybracketleft", "keybracketright", "keybackquote",
]);

export interface CompanionShortcutPresetCard {
    entity: string;
    label: string;
    icon: string;
    icon_on: string;
    sensor: string;
    unit: string;
    type: string;
    precision: string;
    options: string;
}

export interface CompanionShortcutTabDefinition {
    value: string;
    label: string;
}

export function companionShortcutFolderAppLabel(bundleIdentifier: unknown): string {
    if (bundleIdentifier === "com.apple.finder") return "Finder";
    if (typeof bundleIdentifier !== "string") return "";
    return companionShortcutApp(bundleIdentifier)?.label || "";
}

function companionShortcutApp(bundleIdentifier: string): AppShortcutApplication | undefined {
    const exact = COMPANION_SHORTCUT_APPS.find((app) => app.appId === bundleIdentifier);
    if (SAFARI_WEB_APP_BUNDLE_ID.test(bundleIdentifier)) {
        const fallback = COMPANION_SHORTCUT_APPS.find((app) => app.appId === SAFARI_WEB_APP_TEMPLATE);
        if (!exact || !fallback) return exact ?? fallback;
        // Keep the generic presets available for already-saved Safari web app cards.
        const ids = new Set(exact.shortcuts.map((shortcut) => shortcut.id));
        return { ...exact, shortcuts: [...exact.shortcuts, ...fallback.shortcuts.filter(shortcut => !ids.has(shortcut.id))] };
    }
    return exact ?? COMPANION_SHORTCUT_APPS.find((app) => app.appId === "com.adobe.PremierePro" &&
        /^com\.adobe\.PremierePro\.\d+$/.test(bundleIdentifier));
}

export function companionAppShortcutFolderEnabled(card: any): boolean {
    return !!card && card.type === "companion" && !!companionShortcutFolderAppLabel(card.entity) &&
        !card.sensor &&
        configOptionEnabled(card.options, COMPANION_APP_SHORTCUTS_OPTION);
}

export function editableAppShortcutPage(card?: CardConfig): boolean {
    const app = appShortcutPageOwner(card);
    return !!app && app !== "com.apple.finder" && companionShortcutChoices(app).length > 0;
}

export function normalizeCompanionAppShortcutOptions(card: any): string {
    if (!card || card.type !== "companion") return "";
    const finish = (options: string): string => preserveCardColorOptions(card.options, options);
    const presetMarker = configOptionValue(card.options, COMPANION_SHORTCUT_PRESET_OPTION);
    if (presetMarker === COMPANION_SHORTCUT_CUSTOM_PRESET && companionShortcutActionIdValid(card.entity)) {
        return finish(setConfigOptionValue("", COMPANION_SHORTCUT_PRESET_OPTION, presetMarker));
    }
    const presetIdentity = companionShortcutPresetIdentity(card, true);
    if (presetIdentity && companionShortcutActionIdValid(card.entity)) {
        return finish(setConfigOptionValue("", COMPANION_SHORTCUT_PRESET_OPTION, presetIdentity));
    }
    if (!companionShortcutFolderAppLabel(card.entity)) {
        const identifier = typeof card.entity === "string" ? card.entity : "";
        const mayBeRemoteApplication = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(identifier);
        // A remote definition may arrive after saved cards have been parsed.
        // Keep its options intact so startup cannot migrate them away.
        return finish(mayBeRemoteApplication ? String(card.options || "") : "");
    }
    if (card.sensor) return finish("");
    const behavior = configOptionValue(card.options, FINDER_OPEN_BEHAVIOR_OPTION);
    let options = card.entity === "com.apple.finder" &&
        (behavior === "same_window" || behavior === "new_window")
        ? setConfigOptionValue("", FINDER_OPEN_BEHAVIOR_OPTION, behavior) : "";
    options = setConfigOption(
        options,
        COMPANION_APP_SHORTCUTS_OPTION,
        configOptionEnabled(card.options, COMPANION_APP_SHORTCUTS_OPTION),
    );
    if (!configOptionEnabled(options, COMPANION_APP_SHORTCUTS_OPTION)) return finish(options);
    const savedTabs = configOptionValue(card.options, COMPANION_APP_SHORTCUTS_TABS_OPTION);
    if (SAFARI_WEB_APP_BUNDLE_ID.test(card.entity) && /^\d{1,3}(?:\|\d{1,3})*$/.test(savedTabs) &&
        !COMPANION_SHORTCUT_APPS.some((app) => app.appId === card.entity)) {
        // The installed app definition may arrive after the saved card is parsed.
        return finish(setConfigOptionValue(options, COMPANION_APP_SHORTCUTS_TABS_OPTION, savedTabs));
    }
    const tabs = companionShortcutTabs(card);
    const defaults = companionShortcutDefaultTabs(card.entity);
    const value = tabs.length === 0 ? "none" :
        tabs.join("|") === defaults.join("|") ? "" : tabs.join("|");
    return finish(setConfigOptionValue(options, COMPANION_APP_SHORTCUTS_TABS_OPTION, value));
}

/** Normalize the saved options owned by each Companion card mode. */
export function normalizeCompanionCardOptions(card: any): string {
    if (!card || card.type !== "companion") return "";
    const mode = companionSavedCardMode(card);
    if (mode === "url") {
        const behavior = configOptionValue(card.options, COMPANION_URL_OPEN_BEHAVIOR);
        return preserveCardColorOptions(card.options, setConfigOptionValue("", COMPANION_URL_OPEN_BEHAVIOR,
            behavior === "new_window" ? behavior : ""));
    }
    let options = normalizeCompanionAppShortcutOptions(card);
    if (mode !== "app") return options;

    // App launch cards now always use the Mac app icon. Drop the legacy opt-out
    // token while preserving other saved app appearance settings.
    options = setConfigOption(options, "custom_icon", false);
    for (const legacySize of ["app_icon_fill", "app_icon_medium", "app_icon_cover"])
        options = setConfigOption(options, legacySize, false);
    const customColor = configOptionValue(card.options, "app_bg_color");
    if (/^[0-9a-f]{6}$/i.test(customColor))
        options = setConfigOptionValue(options, "app_bg_color", customColor.toUpperCase());
    if (!card.sensor) {
        options = setConfigOption(options, "app_hide_label", configOptionEnabled(card.options, "app_hide_label"));
    }
    return options;
}

export function setCompanionAppShortcutFolderEnabled(card: any, enabled: boolean): void {
    if (!card) return;
    const valid = enabled && card.type === "companion" &&
        !!companionShortcutFolderAppLabel(card.entity) && !card.sensor;
    let options = setConfigOption(
        card.options,
        COMPANION_APP_SHORTCUTS_OPTION,
        valid,
    );
    // Remove the retired flag from cards saved before app subpages became automatic.
    options = setConfigOption(options, "app_shortcuts_auto_switch", false);
    if (!valid) {
        options = setConfigOptionValue(options, COMPANION_APP_SHORTCUTS_TABS_OPTION, "");
    }
    card.options = options;
}

export type FinderOpenBehavior = "new_window" | "same_window";

export function finderOpenBehavior(card: any): FinderOpenBehavior {
    return configOptionValue(card?.options, FINDER_OPEN_BEHAVIOR_OPTION) === "same_window"
        ? "same_window" : "new_window";
}

export function setFinderOpenBehavior(card: any, behavior: FinderOpenBehavior, override: boolean): void {
    if (!card) return;
    let options = setConfigOptionValue(card.options, FINDER_OPEN_BEHAVIOR_OPTION, behavior);
    options = setConfigOption(options, FINDER_OPEN_OVERRIDE_OPTION, override);
    card.options = options;
}

export function inheritFinderOpenBehaviorForCard(card: any, behavior: FinderOpenBehavior): boolean {
    if (!card || configOptionEnabled(card.options, FINDER_OPEN_OVERRIDE_OPTION) ||
        configOptionValue(card.options, FINDER_OPEN_BEHAVIOR_OPTION) === behavior) return false;
    setFinderOpenBehavior(card, behavior, false);
    return true;
}

export function syncInheritedFinderOpenBehavior(subpage: any, behavior: FinderOpenBehavior): void {
    if (!subpage || !Array.isArray(subpage.buttons)) return;
    for (const button of subpage.buttons) {
        if (button?.type !== "companion" || !String(button.entity || "").startsWith("folder.")) continue;
        if (configOptionEnabled(button.options, FINDER_OPEN_OVERRIDE_OPTION)) continue;
        setFinderOpenBehavior(button, behavior, false);
    }
}

export function companionShortcutTabDefinitions(bundleIdentifier: string): CompanionShortcutTabDefinition[] {
    return companionShortcutChoices(bundleIdentifier).map((item) => ({ value: item.id, label: item.label }));
}

export function companionShortcutDefaultTabs(bundleIdentifier: string): string[] {
    if (bundleIdentifier === "com.apple.finder") return [];
    const app = companionShortcutApp(bundleIdentifier);
    if (!app) return [];
    if (Array.isArray(app.defaultShortcutIds)) {
        const available = new Set(companionShortcutChoices(bundleIdentifier).map(item => item.id));
        const defaults = [...new Set(app.defaultShortcutIds)].filter(id => available.has(id));
        if (defaults.length) return defaults;
    }
    return app.shortcuts.map(item => item.id);
}

export function companionShortcutTabs(card: any): string[] {
    const defaults = companionShortcutDefaultTabs(card?.entity || "");
    const raw = configOptionValue(card?.options, COMPANION_APP_SHORTCUTS_TABS_OPTION);
    if (!raw) return defaults;
    if (raw === "none") return [];
    const valid = new Set(companionShortcutChoices(card?.entity || "").map(item => item.id));
    const tabs: string[] = [];
    raw.split("|").forEach(function (value) {
        if (valid.has(value) && tabs.indexOf(value) < 0) tabs.push(value);
    });
    return tabs;
}

export function setCompanionShortcutTabs(card: any, tabs: readonly string[]): string {
    if (!card) return "";
    const defaults = companionShortcutDefaultTabs(card.entity);
    const valid = new Set(companionShortcutChoices(card?.entity || "").map(item => item.id));
    const normalized: string[] = [];
    (tabs || []).forEach(function (value) {
        if (valid.has(value) && normalized.indexOf(value) < 0) normalized.push(value);
    });
    const value = normalized.length === 0 ? "none" :
        normalized.join("|") === defaults.join("|") ? "" : normalized.join("|");
    card.options = setConfigOptionValue(card.options, COMPANION_APP_SHORTCUTS_TABS_OPTION, value);
    return card.options;
}

export function resetCompanionShortcutTabs(card: any): void {
    if (!card) return;
    card.options = setConfigOptionValue(card.options, COMPANION_APP_SHORTCUTS_TABS_OPTION, "");
}

export function cardOwnsSubpage(card: any): boolean {
    return !!card && cardTransferOwnsSubpage(card);
}

export function companionShortcutFolderEditorAvailable(draftCard: any, savedCard: any): boolean {
    return companionAppShortcutFolderEnabled(draftCard) && companionAppShortcutFolderEnabled(savedCard);
}

export function companionShortcutSelectionMatchesSavedParent(draftCard: any, savedCard: any): boolean {
    return companionAppShortcutFolderEnabled(draftCard) &&
        !!savedCard && savedCard.type === "companion" && !savedCard.sensor &&
        draftCard.entity === savedCard.entity;
}

const CLAUDE_SCOPED_SHORTCUT_PATTERN = /^shortcut\.(?:f6|shift\+f6|claude-escape|escape-twice|up|down|[1-9])$/;

export function isClaudeScopedShortcut(actionId: string): boolean {
    return CLAUDE_SCOPED_SHORTCUT_PATTERN.test(actionId);
}

export function isSafariUnmodifiedShortcut(actionId: string): boolean {
    return actionId === "shortcut.tab" || actionId === "shortcut.escape";
}

export function isBooksExtendedShortcut(actionId: string): boolean {
    return actionId === "shortcut.left" || actionId === "shortcut.right" ||
        actionId === "shortcut.space" || actionId === "shortcut.function+f";
}

function shortcutKeyValid(key: string, scoped = false): boolean {
    return /^[a-z0-9]$/.test(key) || COMPANION_SHORTCUT_KEYS.has(key) ||
        /^f(?:[1-9]|1[0-9]|20)$/.test(key) ||
        (scoped && /^keypad(?:[0-9]|plus|minus|multiply|divide|decimal|equal|enter|clear)$/.test(key));
}

export function companionShortcutActionIdValid(actionId: unknown): boolean {
    if (typeof actionId !== "string" || !actionId.startsWith(COMPANION_SHORTCUT_PREFIX) || actionId.length > 96) return false;
    if (actionId.startsWith(SCOPED_SHORTCUT_PREFIX)) {
        const strokes = actionId.slice(SCOPED_SHORTCUT_PREFIX.length).split("~");
        return strokes.length <= 3 && strokes.every(stroke => {
            const parts = stroke.split("+");
            const key = parts.pop() || "";
            return new Set(parts).size === parts.length &&
                parts.every(part => part === "function" || COMPANION_SHORTCUT_MODIFIERS.has(part)) &&
                shortcutKeyValid(key, true);
        });
    }
    if (isSafariUnmodifiedShortcut(actionId) || isClaudeScopedShortcut(actionId)) return true;
    if (isBooksExtendedShortcut(actionId) || actionId === CHATGPT_CLEAR_UNREADS_ACTION) return true;
    const parts = actionId.slice(COMPANION_SHORTCUT_PREFIX.length).split("+");
    if (parts.length < 2 || parts.length > 5) return false;
    const key = parts.pop() || "";
    const modifiers = parts;
    if (new Set(modifiers).size !== modifiers.length ||
        modifiers.some((modifier) => !COMPANION_SHORTCUT_MODIFIERS.has(modifier)) ||
        !modifiers.some((modifier) => modifier === "command" || modifier === "control" || modifier === "option")) {
        return false;
    }
    return shortcutKeyValid(key);
}

function shortcutCard(entity: string, label: string, icon: string): CompanionShortcutPresetCard {
    return {
        entity,
        label,
        icon,
        icon_on: "Auto",
        sensor: "",
        unit: "",
        type: "companion",
        precision: "",
        options: "",
    };
}

function companionShortcutChoices(bundleIdentifier: string) {
    const app = companionShortcutApp(bundleIdentifier);
    if (!app) return [];
    const more = new Map<string, ReturnType<typeof bundledExpandedShortcuts>[number]>();
    const merge = (source: AppShortcutApplication) => {
        for (const item of bundledExpandedShortcuts(source.appId)) more.set(item.id, item);
        for (const item of source.moreShortcuts ?? []) more.set(item.id, item);
    };
    if (SAFARI_WEB_APP_BUNDLE_ID.test(bundleIdentifier)) {
        const fallback = COMPANION_SHORTCUT_APPS.find(item => item.appId === SAFARI_WEB_APP_TEMPLATE);
        if (fallback) merge(fallback);
    }
    merge(app);
    for (const item of app.shortcuts) more.delete(item.id);
    return [...app.shortcuts, ...more.values()];
}

function companionShortcutPresetIdentity(card: any, preserveUnavailablePreset = false): string {
    const raw = configOptionValue(card?.options, COMPANION_SHORTCUT_PRESET_OPTION);
    const match = raw.match(/^(.*):(\d+)$/);
    if (!match) return "";
    const [, bundleIdentifier = "", id = ""] = match;
    // A saved preset may come from definitions the Mac has yet to send.
    if (preserveUnavailablePreset && bundleIdentifier.length <= 96 &&
        /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleIdentifier) &&
        /^(0|[1-9][0-9]{0,2})$/.test(id)) return raw;
    return companionShortcutChoices(bundleIdentifier).some(item => item.id === id) ? raw : "";
}

export function reconnectAthenaShortcutSubpage(
    page: SubpageConfig | undefined, previous: string | undefined, replacement: string,
): SubpageConfig | null {
    if (!page || !previous || previous === replacement || !SAFARI_WEB_APP_BUNDLE_ID.test(previous) ||
        !SAFARI_WEB_APP_BUNDLE_ID.test(replacement)) return null;
    const athena = BUNDLED_SHORTCUT_APPS.find(app => app.appId === ATHENA_TEMPLATE_APP_ID);
    const target = COMPANION_SHORTCUT_APPS.find(app => app.appId === replacement);
    if (!athena || !target) return null;
    const athenaTabs = new Set([...athena.shortcuts, ...bundledExpandedShortcuts(ATHENA_TEMPLATE_APP_ID)]
        .map(shortcut => shortcut.id));
    const preset = (card: { options: string }) => configOptionValue(card.options, COMPANION_SHORTCUT_PRESET_OPTION);
    const wasAthena = page.buttons.some(card => {
        const [id, tab] = preset(card).split(":");
        return id === previous && tab !== undefined && athenaTabs.has(tab);
    });
    if (!wasAthena || !companionShortcutChoices(target.appId).some(shortcut => athenaTabs.has(shortcut.id))) return null;

    const availableTabs = new Set(companionShortcutTabDefinitions(replacement).map(tab => tab.value));
    return {
        ...page,
        buttons: page.buttons.map(card => {
            const [id, tab] = preset(card).split(":");
            return id === previous && tab && availableTabs.has(tab) ? {
                ...card,
                options: setConfigOptionValue(card.options, COMPANION_SHORTCUT_PRESET_OPTION, replacement + ":" + tab),
            } : { ...card };
        }),
    };
}

export function safariShortcutPresetCards(): CompanionShortcutPresetCard[] {
    return companionShortcutPresetCards(SAFARI_BUNDLE_ID);
}

export function codexShortcutPresetCards(): CompanionShortcutPresetCard[] {
    return companionShortcutPresetCards(CODEX_BUNDLE_ID);
}

export function slackShortcutPresetCards(): CompanionShortcutPresetCard[] {
    return companionShortcutPresetCards(SLACK_BUNDLE_ID);
}

export function companionShortcutCatalogApps(appId?: string): AppShortcutApplication[] {
    // The Mac sends Athena under the actual installed web app's bundle ID.
    const apps = COMPANION_SHORTCUT_APPS.filter((app) => app.appId !== ATHENA_TEMPLATE_APP_ID && app.shortcuts?.length > 0);
    if (appId && appId !== ATHENA_TEMPLATE_APP_ID && !apps.some(app => app.appId === appId)) {
        const template = companionShortcutApp(appId);
        if (template) apps.push({ ...template, appId });
    }
    return apps;
}

export function companionShortcutPresetCards(bundleIdentifier: string): CompanionShortcutPresetCard[] {
    return companionShortcutChoices(bundleIdentifier).map(item => ({
        ...shortcutCard(COMPANION_SHORTCUT_PREFIX + item.shortcut, item.label, item.icon),
        options: setConfigOptionValue("", COMPANION_SHORTCUT_PRESET_OPTION, bundleIdentifier + ":" + item.id),
    }));
}

export function createCompanionShortcutSubpage(bundleIdentifier: string, tabs?: readonly string[]) {
    const presets = companionShortcutPresetCards(bundleIdentifier);
    const selected = tabs == null ? companionShortcutDefaultTabs(bundleIdentifier) : tabs;
    const buttons = selected.map(function (value) {
        return presets.find((preset) => companionShortcutPresetIdentity(preset) === bundleIdentifier + ":" + value);
    }).filter(preset => preset !== undefined);
    return {
        order: ["B"].concat(buttons.map((_button, index) => String(index + 1))),
        buttons,
        grid: [],
        sizes: {},
        backLabel: "Back",
    };
}

export function companionShortcutTabsForCapacity(tabs: readonly string[], maxSlots: number): string[] {
    return tabs.slice(0, Math.max(0, maxSlots - 1));
}

export function finderFolderTabs(subpage: any): string[] {
    const tokens = subpage?.grid?.length ? subpage.grid : (subpage?.order || []);
    const selected: string[] = [];
    for (const token of tokens) {
        const index = Number.parseInt(String(token), 10) - 1;
        const card = subpage?.buttons?.[index];
        if (card?.type === "companion" && card.entity?.startsWith("folder.") && !selected.includes(card.entity)) {
            selected.push(card.entity);
        }
    }
    return selected;
}

export function syncFinderFolderSelection(
    source: any, folders: readonly { id: string; label: string }[], selected: readonly string[],
    maxSlots: number, buildGrid: (page: any) => unknown,
): any | null {
    const page = JSON.parse(JSON.stringify(source));
    const managed = (card: any) => card?.type === "companion" && card.entity?.startsWith("folder.");
    const sizes = { ...(page.sizes || {}) };
    const pinned = finderFolderTabs(page);
    const existing = pinned.filter(id => selected.includes(id));
    const reordered = existing.some((id, index) => selected[index] !== id);
    const suffixes = new Map<string, string>();
    page.order = (page.order || []).map((token: string) => {
        const index = Number.parseInt(String(token), 10) - 1;
        const card = page.buttons[index];
        if (!managed(card)) return token;
        suffixes.set(card.entity, String(token).replace(/^\d+/, ""));
        return !reordered && selected.includes(card.entity) ? token : "";
    });
    page.sizes = {};
    buildGrid(page);
    for (const id of selected) {
        if (!reordered && existing.includes(id)) continue;
        let index = page.buttons.findIndex((card: any) => managed(card) && card.entity === id);
        if (index < 0) {
            const folder = folders.find(folder => folder.id === id);
            if (!folder) return null;
            index = page.buttons.findIndex((card: any) => managed(card) &&
                !selected.includes(card.entity) && !pinned.includes(card.entity));
            if (index < 0) index = page.buttons.length;
            page.buttons[index] = shortcutCard(folder.id, folder.label, "Folder Outline");
        }
        const suffix = suffixes.get(id) || "";
        const size = sizes[String(index + 1)] || 1;
        let placed = false;
        for (let position = 0; position < maxSlots; position++) {
            if (page.grid[position]) continue;
            const trial = JSON.parse(JSON.stringify(page));
            while (trial.order.length <= position) trial.order.push("");
            trial.order[position] = String(index + 1) + suffix;
            buildGrid(trial);
            if ((trial.sizes[String(index + 1)] || 1) !== size ||
                page.grid.some((cell: number, i: number) => cell !== 0 && trial.grid[i] !== cell)) continue;
            page.order = trial.order;
            page.grid = trial.grid;
            page.sizes = trial.sizes;
            placed = true;
            break;
        }
        if (!placed) return null;
    }
    return page;
}

function subpageOrderButtonIndex(token: unknown): number {
    const match = String(token || "").match(/^(\d+)/);
    return match ? Number.parseInt(match[1] || "0", 10) - 1 : -1;
}

function subpageOrderButtonSuffix(token: unknown): string {
    const match = String(token || "").match(/^\d+(.*)$/);
    return match ? (match[1] || "") : "";
}

function cardHasContent(card: any): boolean {
    return !!card && ["entity", "label", "sensor", "unit", "type", "precision", "options"].some(function (field) {
        return !!card[field];
    });
}

export function companionShortcutTabsFromSubpage(
    bundleIdentifier: string,
    subpage: any,
): string[] {
    const presets = companionShortcutPresetCards(bundleIdentifier);
    const presetIndex = new Map(companionShortcutChoices(bundleIdentifier).map(item =>
        [bundleIdentifier + ":" + item.id, item.id] as const));
    const legacyPresetKeys = legacyCompanionShortcutPresetKeys(bundleIdentifier, presets);
    const tabs: string[] = [];
    const visited = new Set<number>();
    (subpage?.grid?.length ? subpage.grid : subpage?.order || []).forEach(function (token: unknown) {
        const index = subpageOrderButtonIndex(token);
        if (index < 0 || visited.has(index)) return;
        visited.add(index);
        const card = subpage?.buttons?.[index];
        const marker = configOptionValue(card?.options, COMPANION_SHORTCUT_PRESET_OPTION);
        const identity = companionShortcutPresetIdentity(card);
        const value = identity ? presetIndex.get(identity) :
            marker ? undefined : presetIndex.get(legacyPresetKeys.get(card?.entity) || "");
        if (value != null && tabs.indexOf(value) < 0) tabs.push(value);
    });
    return tabs;
}

function legacyCompanionShortcutPresetKeys(
    bundleIdentifier: string,
    presets: readonly CompanionShortcutPresetCard[],
): Map<string, string> {
    const keys = new Map<string, string>();
    const safariPresetIDs = SAFARI_WEB_APP_BUNDLE_ID.test(bundleIdentifier)
        ? new Set(COMPANION_SHORTCUT_APPS.find((app) => app.appId === SAFARI_WEB_APP_TEMPLATE)?.shortcuts.map((item) => item.id))
        : undefined;
    const starterIDs = bundleIdentifier === "com.apple.finder" ? new Set<string>()
        : new Set(companionShortcutApp(bundleIdentifier)?.shortcuts.map(item => item.id));
    presets.forEach(card => {
        const key = configOptionValue(card.options, COMPANION_SHORTCUT_PRESET_OPTION);
        const id = key.slice(bundleIdentifier.length + 1);
        // New app-specific presets already save an ID. Keep older custom tiles
        // with the same keys separate from those presets.
        if (!starterIDs.has(id) || (safariPresetIDs && !safariPresetIDs.has(id))) return;
        if (bundleIdentifier !== CODEX_BUNDLE_ID || Number(id) <= LAST_LEGACY_CHATGPT_PRESET_ID) {
            keys.set(card.entity, key);
        }
    });
    return keys;
}

export function syncCompanionShortcutSubpage(
    bundleIdentifier: string,
    tabs: readonly string[],
    subpage: any,
    maxSlots = Number.POSITIVE_INFINITY,
): any {
    if (!subpage) return createCompanionShortcutSubpage(bundleIdentifier, tabs);
    const presets = companionShortcutPresetCards(bundleIdentifier);
    const presetKeyByEntity = legacyCompanionShortcutPresetKeys(bundleIdentifier, presets);
    function presetKey(card: any): string {
        const marker = configOptionValue(card?.options, COMPANION_SHORTCUT_PRESET_OPTION);
        const identity = companionShortcutPresetIdentity(card);
        if (identity) {
            return identity.startsWith(bundleIdentifier + ":") ? identity : "";
        }
        if (marker) return "";
        return presetKeyByEntity.get(card?.entity) || "";
    }
    const existingByKey = new Map<string, any>();
    (subpage.buttons || []).forEach(function (card: any) {
        const key = presetKey(card);
        if (key && !existingByKey.has(key)) {
            card.options = setConfigOptionValue(card.options, COMPANION_SHORTCUT_PRESET_OPTION, key);
            existingByKey.set(key, card);
        } else if (key && companionShortcutPresetIdentity(card)) {
            card.options = setConfigOptionValue(
                card.options,
                COMPANION_SHORTCUT_PRESET_OPTION,
                COMPANION_SHORTCUT_CUSTOM_PRESET,
            );
        }
    });
    function managedPresetKey(card: any): string {
        const key = presetKey(card);
        return key && existingByKey.get(key) === card ? key : "";
    }
    const desired = tabs.map(function (value) {
        const key = bundleIdentifier + ":" + value;
        const preset = presets.find((card) => companionShortcutPresetIdentity(card) === key);
        return preset ? { key, card: existingByKey.get(key) || preset } : null;
    }).filter(Boolean);
    const suffixByKey = new Map<string, string>();
    (subpage.order || []).forEach(function (token: unknown) {
        const index = subpageOrderButtonIndex(token);
        const key = index >= 0 ? managedPresetKey(subpage.buttons?.[index]) : "";
        if (key && !suffixByKey.has(key)) suffixByKey.set(key, subpageOrderButtonSuffix(token));
    });
    const newButtons: any[] = [];
    const newOrder: string[] = [];
    const visited = new Set<number>();
    let desiredIndex = 0;
    (subpage.order || []).forEach(function (token: unknown) {
        const rawToken = String(token || "");
        if (isBackOrderToken(rawToken) || !rawToken) {
            newOrder.push(rawToken);
            return;
        }
        const index = subpageOrderButtonIndex(token);
        if (index < 0) {
            newOrder.push(rawToken);
            return;
        }
        visited.add(index);
        const card = subpage.buttons?.[index];
        if (!cardHasContent(card)) {
            newOrder.push("");
            return;
        }
        if (managedPresetKey(card)) {
            if (desiredIndex < desired.length) {
                const entry: any = desired[desiredIndex++];
                newButtons.push(entry.card);
                newOrder.push(String(newButtons.length) + (suffixByKey.get(entry.key) || ""));
            } else {
                newOrder.push("");
            }
            return;
        }
        newButtons.push(card);
        newOrder.push(String(newButtons.length) + subpageOrderButtonSuffix(token));
    });
    (subpage.buttons || []).forEach(function (card: any, index: number) {
        if (visited.has(index) || !cardHasContent(card) || managedPresetKey(card)) return;
        newButtons.push(card);
        newOrder.push(String(newButtons.length));
    });
    for (let index = 0; index < newOrder.length && index < maxSlots && desiredIndex < desired.length; index += 1) {
        if (newOrder[index] || (subpage.grid?.length && subpage.grid[index] !== 0)) continue;
        const entry: any = desired[desiredIndex++];
        newButtons.push(entry.card);
        newOrder[index] = String(newButtons.length) + (suffixByKey.get(entry.key) || "");
    }
    while (desiredIndex < desired.length && newOrder.length < maxSlots) {
        const entry: any = desired[desiredIndex++];
        newButtons.push(entry.card);
        newOrder.push(String(newButtons.length) + (suffixByKey.get(entry.key) || ""));
    }
    if (!newOrder.some(function (token) { return isBackOrderToken(token); })) newOrder.unshift("B");
    subpage.buttons = newButtons;
    subpage.order = newOrder;
    subpage.sizes = {};
    // Button IDs and positions have changed. Until the grid is rebuilt, read
    // shortcut selections from the new order rather than the old cached grid.
    subpage.grid = [];
    return subpage;
}

export function companionShortcutTabsFitSubpage(
    bundleIdentifier: string,
    tabs: readonly string[],
    subpage: any,
    maxSlots: number,
): boolean {
    if (!subpage) return tabs.length + 1 <= maxSlots;
    const source = {
        ...subpage,
        order: (subpage.order || []).slice(),
        buttons: (subpage.buttons || []).map(function (button: any) { return { ...button }; }),
        grid: (subpage.grid || []).slice(),
        sizes: { ...(subpage.sizes || {}) },
    };
    syncCompanionShortcutSubpage(bundleIdentifier, tabs, source, maxSlots);
    return companionShortcutTabsFromSubpage(bundleIdentifier, source).join("|") === tabs.join("|");
}

export function createSafariShortcutSubpage(): any {
    return createCompanionShortcutSubpage(SAFARI_BUNDLE_ID);
}

export function createCodexShortcutSubpage(): any {
    return createCompanionShortcutSubpage(CODEX_BUNDLE_ID);
}

export function createSlackShortcutSubpage(): any {
    return createCompanionShortcutSubpage(SLACK_BUNDLE_ID);
}
