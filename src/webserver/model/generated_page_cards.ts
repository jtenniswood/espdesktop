import type { CompanionAction } from "../api/companion_catalogue";
import type { CardConfig } from "../contracts/types";
import { emptyCardConfig } from "./card";
import { configOptionValue, setConfigOptionValue } from "./config_primitives";
import { OBS_SUBPAGES, type OBSSubpageKind } from "./obs_live_subpage";
import { OBS_SCENE_PAGE_CONTROLS } from "../generated/companion_capabilities";

export const generatedCardElements = new WeakMap<HTMLElement, { card: CardConfig; size: number }>();
const EXCLUSIONS = "generated_card_exclusions";

export function generatedCardKey(actionId: string): string {
  return actionId.slice(actionId.lastIndexOf(".") + 1).replace(/-/g, "");
}

export function generatedCardExclusions(options?: string): string[] {
  return configOptionValue(options, EXCLUSIONS).split("|")
    .filter(id => /^(?:[a-f0-9]{32}|take|transition|brb)$/.test(id));
}

export function preserveGeneratedCardExclusions(source: string, normalized: string): string {
  return setConfigOptionValue(normalized, EXCLUSIONS, generatedCardExclusions(source).join("|"));
}

export function excludeGeneratedCards(options: string, ids: readonly string[]): string {
  const history = [...new Set([...generatedCardExclusions(options), ...ids.map(generatedCardKey)])];
  return setConfigOptionValue(options, EXCLUSIONS, history.join("|"));
}

export function generatedPageCard(action: CompanionAction, kind: OBSSubpageKind | undefined, owner?: CardConfig): CardConfig {
  const sceneControl = OBS_SCENE_PAGE_CONTROLS.find(control => control.id === action.id);
  return {
    ...emptyCardConfig(),
    entity: action.id,
    label: sceneControl ? "" : action.label,
    type: kind === "obs_audio" ? "slider" : "companion",
    icon: sceneControl?.icon ||
      (kind ? OBS_SUBPAGES[kind].icon : "Folder"),
    options: !kind && configOptionValue(owner?.options, "finder_open_behavior") === "same_window"
      ? "finder_open_behavior=same_window" : "",
  };
}
