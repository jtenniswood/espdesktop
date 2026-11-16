import type { CompanionAction } from "../api/companion_catalogue";
import { OBS_TRANSITION_SELECT, savedOBSTransition } from "./companion_card_codec";
import { configOptionValue, setConfigOptionValue } from "./config_primitives";

export const OBS_TRANSITION_SUBPAGE_KIND = "obs_transitions";
export const OBS_TRANSITION_ORDER = "obs_transition_order";

export function obsTransitionSubpage(options?: string): boolean {
    return configOptionValue(options, "subpage_kind") === OBS_TRANSITION_SUBPAGE_KIND;
}

export function transitionPreferences(options?: string): string[] {
    return configOptionValue(options, OBS_TRANSITION_ORDER).split("|")
        .filter(entry => /^!?[a-f0-9]{32}$/.test(entry)).slice(0, 48);
}

export function transitionCatalogue(actions: readonly CompanionAction[]): CompanionAction[] {
    const entries = new Map<string, CompanionAction>();
    for (const action of actions) {
        const id = savedOBSTransition(action.id);
        if (id) entries.set(id, { id, label: action.label });
    }
    return [...entries.values()];
}

export function orderedTransitions(transitions: readonly CompanionAction[], options?: string): CompanionAction[] {
    const remaining = new Map(transitions.map(item => [item.id.slice(OBS_TRANSITION_SELECT.length), item]));
    const ordered: CompanionAction[] = [];
    for (const preference of transitionPreferences(options)) {
        const hidden = preference.startsWith("!");
        const key = hidden ? preference.slice(1) : preference;
        const item = remaining.get(key);
        if (item && !hidden) ordered.push(item);
        remaining.delete(key);
    }
    return [...ordered, ...remaining.values()];
}

export function setTransitionPreferences(options: string, catalogue: readonly CompanionAction[], visible: readonly string[]): string {
    const hashes = catalogue.map(item => item.id.slice(OBS_TRANSITION_SELECT.length));
    const saved = transitionPreferences(options).filter(entry => !hashes.includes(entry.replace(/^!/, "")));
    const hidden = hashes.filter(hash => !visible.includes(hash)).map(hash => "!" + hash);
    return setConfigOptionValue(options, OBS_TRANSITION_ORDER, [...visible, ...hidden, ...saved].slice(0, 48).join("|"));
}
