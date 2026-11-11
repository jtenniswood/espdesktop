import type { CardConfig } from "../contracts/types";
import { configOptionEnabled } from "./config_primitives";
import { pageOwnerSlot, parentPageKey } from "./page_keys";

/** Saved pages remain available for editing without a live app definition. */
export function appShortcutPageOwner(card?: Partial<CardConfig> | null): string | undefined {
    const id = card?.entity || "";
    if (card?.type !== "companion" || card.sensor || !configOptionEnabled(card.options, "app_shortcuts")) return;
    if (id.length <= 96 && id.includes(".") && !/[^a-zA-Z0-9.-]/.test(id) &&
        !/^(shortcut|folder|stat)\./.test(id)) return id;
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
