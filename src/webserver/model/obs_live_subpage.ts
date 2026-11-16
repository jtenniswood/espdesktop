import type { CompanionAction } from "../api/companion_catalogue";
import { OBS_FADER_PREFIX, isOBSFaderControlID } from "./card";
import { OBS_TRANSITION_SELECT, savedOBSTransition } from "./companion_card_codec";
import { configOptionValue, setConfigOptionValue } from "./config_primitives";

export const OBS_SUBPAGES = {
    obs_transitions: { label: "Transitions", icon: "Flip Horizontal", prefix: OBS_TRANSITION_SELECT, order: "obs_transition_order" },
    obs_audio: { label: "Audio", icon: "Microphone", prefix: OBS_FADER_PREFIX, order: "obs_audio_order" },
    obs_sources: { label: "Sources", icon: "Image Card Loading", prefix: "obs.source.", order: "obs_source_order" },
} as const;

export type OBSSubpageKind = keyof typeof OBS_SUBPAGES;

export function obsSubpageKind(options?: string): OBSSubpageKind | undefined {
    const kind = configOptionValue(options, "subpage_kind");
    return Object.hasOwn(OBS_SUBPAGES, kind) ? kind as OBSSubpageKind : undefined;
}

export function obsSubpageTileKey(kind: OBSSubpageKind, id: string): string {
    return id.slice(OBS_SUBPAGES[kind].prefix.length).replace(/-/g, "");
}

export function obsSubpagePreferences(kind: OBSSubpageKind, options?: string): string[] {
    return configOptionValue(options, OBS_SUBPAGES[kind].order).split("|")
        .filter(entry => /^!?[a-f0-9]{32}$/.test(entry)).slice(0, 48);
}

export function obsSubpageCatalogue(kind: OBSSubpageKind, actions: readonly CompanionAction[]): CompanionAction[] {
    const entries = new Map<string, CompanionAction>();
    for (const action of actions) {
        const id = kind === "obs_transitions" ? savedOBSTransition(action.id)
            : kind === "obs_sources" ? action.id.match(/^obs\.source\.[a-f0-9]{32}(?=\.|$)/)?.[0]
            : isOBSFaderControlID(action.id) ? action.id : "";
        if (id) entries.set(id, { id, label: action.label });
    }
    return [...entries.values()];
}

export function orderedOBSTiles(kind: OBSSubpageKind, catalogue: readonly CompanionAction[], options?: string): CompanionAction[] {
    const remaining = new Map(catalogue.map(item => [obsSubpageTileKey(kind, item.id), item]));
    const ordered: CompanionAction[] = [];
    for (const preference of obsSubpagePreferences(kind, options)) {
        const hidden = preference.startsWith("!");
        const key = hidden ? preference.slice(1) : preference;
        const item = remaining.get(key);
        if (item && !hidden) ordered.push(item);
        remaining.delete(key);
    }
    return [...ordered, ...remaining.values()];
}

export function setOBSSubpagePreferences(kind: OBSSubpageKind, options: string, catalogue: readonly CompanionAction[], visible: readonly string[]): string {
    const hashes = catalogue.map(item => obsSubpageTileKey(kind, item.id));
    const saved = obsSubpagePreferences(kind, options).filter(entry => !hashes.includes(entry.replace(/^!/, "")));
    const hidden = hashes.filter(hash => !visible.includes(hash)).map(hash => "!" + hash);
    return setConfigOptionValue(options, OBS_SUBPAGES[kind].order, [...visible, ...hidden, ...saved].slice(0, 48).join("|"));
}
