import type { CardConfig } from "../contracts/types";
import { configOptionEnabled, configOptionValue, setConfigOptionValue } from "./config_primitives";
import { pageOwnerSlot, parentPageKey } from "./page_keys";
import { APPLE_SHORTCUT_PREFIX } from "./companion_card_codec";

export const APPLE_SHORTCUTS_APP_ID = "com.apple.shortcuts";
export const APPLE_SHORTCUTS_SUBPAGE_KIND = "apple_shortcuts";
export const APPLE_SHORTCUTS_HIDDEN_OPTION = "apple_shortcuts_hidden";

const exclusionPrefix = "v1.";
const exclusionWidth = 11;
const exclusionAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Match the firmware's 64-bit fingerprint. One full catalogue fits in a card's options.
export function appleShortcutExclusionKey(actionId: string): string {
    const id = actionId.slice(APPLE_SHORTCUT_PREFIX.length);
    let hash = 0xcbf29ce484222325n;
    for (let i = 0; i < id.length; ++i) {
        hash = BigInt.asUintN(64, (hash ^ BigInt(id.charCodeAt(i))) * 0x100000001b3n);
    }
    let key = "";
    for (let i = 0; i < exclusionWidth; ++i) {
        key = exclusionAlphabet.charAt(Number(hash & 63n)) + key;
        hash >>= 6n;
    }
    return key;
}

export function hiddenAppleShortcuts(options?: string): Set<string> {
    const value = configOptionValue(options, APPLE_SHORTCUTS_HIDDEN_OPTION);
    if (value.startsWith(exclusionPrefix)) {
        const keys = new Set<string>();
        for (let i = exclusionPrefix.length; i + exclusionWidth <= value.length; i += exclusionWidth) {
            keys.add(value.slice(i, i + exclusionWidth));
        }
        return keys;
    }
    return new Set(value.split("|").filter(Boolean).map(id => appleShortcutExclusionKey(APPLE_SHORTCUT_PREFIX + id)));
}

export function setHiddenAppleShortcuts(options: string, exclusions: ReadonlySet<string>): string {
    return setConfigOptionValue(options, APPLE_SHORTCUTS_HIDDEN_OPTION,
        exclusions.size ? exclusionPrefix + [...exclusions].join("") : "");
}

export function isAppleShortcutsCard(card?: Partial<CardConfig> | null): boolean {
    return card?.type === "subpage" &&
        configOptionValue(card.options, "subpage_kind") === APPLE_SHORTCUTS_SUBPAGE_KIND;
}

export function isAppleShortcutsPage(card?: Partial<CardConfig> | null): boolean {
    return isAppleShortcutsCard(card) || appShortcutPageOwner(card) === APPLE_SHORTCUTS_APP_ID;
}

/** Saved pages remain available for editing without a live app definition. */
export function appShortcutPageOwner(card?: Partial<CardConfig> | null): string | undefined {
    const id = card?.entity || "";
    if (card?.type !== "companion" || card.sensor || !configOptionEnabled(card.options, "app_shortcuts")) return;
    if (id.length <= 96 && id.includes(".") && !/[^a-zA-Z0-9.-]/.test(id) &&
        !/^(shortcut|folder|stat)\./.test(id) && !id.startsWith(APPLE_SHORTCUT_PREFIX)) return id;
}

export function previewSubpageOwner(page: number | null, home: readonly CardConfig[],
    getSubpage: (key: number) => { buttons: readonly CardConfig[] } | null | undefined): CardConfig | undefined {
    if (!page) return;
    const parent = parentPageKey(page);
    return (parent ? getSubpage(parent)?.buttons : home)?.[pageOwnerSlot(page) - 1];
}

export function appShortcutPageBackIcon(icon?: string): string {
    return !icon || icon === "Auto" ? "Monitor" : icon;
}
