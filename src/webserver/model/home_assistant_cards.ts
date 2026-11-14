import type { CardConfig } from "../contracts/types";
import { configOptionEnabled, configOptionValue, setConfigOption, setConfigOptionValue } from "./config_primitives";

export function canExposeCard(card: CardConfig): boolean {
    return card.type === "subpage" || card.type === "companion_mac_lock" ||
        (card.type === "companion" && !card.entity.startsWith("stat.") && Boolean(card.entity || card.sensor));
}

export function cardExposure(options: string) {
    const identity = configOptionValue(options, "ha_id");
    return {
        identity: /^[a-f0-9]{96}$/.test(identity) ? identity : "",
        enabled: configOptionEnabled(options, "ha_exposed"),
    };
}

export function setCardExposure(options: string, identity: string, enabled: boolean): string {
    return setConfigOption(setConfigOptionValue(options, "ha_id", identity), "ha_exposed", !!identity && enabled);
}

export function sameCardAction(a: CardConfig, b: CardConfig): boolean {
    return a.type === b.type && a.entity === b.entity && a.sensor === b.sensor &&
        ["app_shortcut_preset", "finder_open_behavior", "url_open_behavior"].every(
            key => configOptionValue(a.options, key) === configOptionValue(b.options, key));
}
