import type { CardConfig } from "../contracts/types";
import { COMPANION_SYSTEM_METRICS, COMPANION_SYSTEM_ACTIONS, OBS_CONFIRMATION_CONTROLS } from "../generated/companion_capabilities";
import type { CompanionCardModel, CompanionCardModeId } from "./companion_card";
import { retiredSavedCardType } from "./card";

export const COMPANION_FOLDER_PREFIX = "folder.";
export const COMPANION_OBS_PREFIX = "obs.";
export function obsInputName(label = ""): string {
  return label.replace(/^(Muted|Unmuted) · /, "");
}
export function savedOBSSceneTarget(actionId: string): string {
  const id = /^obs\.target\.([0-9a-f-]{36})\.[0-9a-f-]{36}$/.exec(actionId)?.[1];
  return id ? "obs.target." + id : "";
}
export function obsSceneCardEntity(entity: string): string {
  return entity.replace(/^obs\.(?:scene|preview)\.([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/, "obs.target.$1");
}
export const OBS_BRB_ID = "obs.brb";
export const OBS_TAKE_ID = "obs.take";
export const OBS_STUDIO_ID = "obs.studio";
export const OBS_MULTIVIEW_ID = "obs.multiview";
export const OBS_TRANSITION_ID = "obs.transition";
export const OBS_TRANSITION_SELECT = OBS_TRANSITION_ID + ".select.";
export function savedOBSTransition(id: string): string {
  const match = /^obs\.transition\.select\.([a-f0-9]{32})(?:\.[a-f0-9-]{36})?$/.exec(id);
  return match ? OBS_TRANSITION_SELECT + match[1] : "";
}
export const OBS_PROGRAM_ID = "obs.status.program";
export const OBS_REPLAY_ID = "obs.replay";
export const OBS_REPLAY_BUFFER_ID = "obs.replay.buffer";
export function obsConfirmationControl(entity: string) {
  return OBS_CONFIRMATION_CONTROLS.find(control => control.id === entity);
}
export function obsConfirmableToggle(entity: string): boolean {
  return obsConfirmationControl(entity)?.kind === "toggle";
}
export const OBS_OUTPUT_OPTIONS = [
  ["obs.output.stream", "Streaming"],
  ["obs.output.record", "Recording"],
  ["obs.output.virtualcam", "Virtual Camera"],
] as const;
export function obsOutputCardEntity(entity: string): string {
  if (entity === "obs.status.stream") return "obs.output.stream";
  if (entity === "obs.status.record") return "obs.output.record";
  return entity;
}
export const OBS_STUDIO_OPTIONS = [
  [OBS_STUDIO_ID, "Studio Mode"],
  [OBS_PROGRAM_ID, "Program scene"],
  [OBS_TAKE_ID, "Take Live"],
  [OBS_MULTIVIEW_ID, "Open Multiview"],
] as const;
export const OBS_TRANSITION_OPTIONS = [
  [OBS_TRANSITION_ID, "Cycle transitions"],
  [OBS_TRANSITION_SELECT, "Select a transition"],
] as const;
export const APPLE_SHORTCUT_PREFIX = "appleshortcut.";

export function companionMetricForEntity(entity: unknown) {
  const baseEntity = typeof entity === "string" ? entity.split(":", 1)[0] : entity;
  return COMPANION_SYSTEM_METRICS.find((metric) => metric.id === baseEntity || metric.freeId === baseEntity);
}

export function companionSavedCardMode(config: Partial<CardConfig>): CompanionCardModeId {
  const entity = config.entity || "";
  if (entity.startsWith("shortcut.")) return "shortcut";
  if (COMPANION_SYSTEM_ACTIONS.some((action) => action.id === entity)) return "system";
  if (entity.startsWith(COMPANION_FOLDER_PREFIX)) return "folder";
  if (entity === OBS_BRB_ID) return "obs_brb";
  if (entity === OBS_TAKE_ID) return "obs_take";
  if (entity === OBS_STUDIO_ID || entity === OBS_MULTIVIEW_ID) return "obs_studio";
  if (entity === OBS_TRANSITION_ID || entity.startsWith(OBS_TRANSITION_SELECT)) return "obs_transition";
  if (entity === OBS_REPLAY_ID) return "obs_replay";
  if (entity === OBS_REPLAY_BUFFER_ID) return "obs_replay_buffer";
  if (OBS_OUTPUT_OPTIONS.some(([id]) => obsOutputCardEntity(entity) === id)) return "obs_output";
  if (entity === OBS_PROGRAM_ID) return "obs_status";
  if (entity.startsWith("obs.mute.")) return "obs_mic";
  if (entity.startsWith(COMPANION_OBS_PREFIX)) return "obs";
  if (entity.startsWith(APPLE_SHORTCUT_PREFIX)) return "apple_shortcut";
  if (entity === "stats" || companionMetricForEntity(entity)) return "stats";
  if (config.sensor?.startsWith("url.")) return "url";
  return "app";
}

// Only native application cards display app artwork with an adjustable size.
export function companionCardHasAppIcon(config: Partial<CardConfig>): boolean {
  return config.type === "companion" && !!config.entity && !config.sensor &&
    !retiredSavedCardType(config) && companionSavedCardMode(config) === "app";
}

export function decodeCompanionCard(config: Partial<CardConfig>, mode = companionSavedCardMode(config)): CompanionCardModel {
  const entity = config.entity || "";
  switch (mode) {
    case "app": return { mode, applicationId: entity };
    case "shortcut": return { mode, shortcutId: entity };
    case "folder": return { mode, folderId: entity };
    case "obs_output": return { mode, actionId: obsOutputCardEntity(entity) };
    case "obs_brb":
    case "obs_replay":
    case "obs_replay_buffer":
    case "obs_status":
    case "obs_take":
    case "obs_transition":
    case "obs_studio":
    case "obs_mic":
    case "obs": return { mode, actionId: entity };
    case "apple_shortcut": return { mode, actionId: entity };
    case "url": return { mode, applicationId: entity, encodedUrl: config.sensor || "" };
    case "system": return { mode, actionId: entity };
    case "stats": return { mode, metricId: entity, precision: config.precision || "", unit: config.unit || "" };
  }
}

// Preserve presentation, shortcut drafts, and unknown options verbatim. Only
// fields owned by the selected variant are written through this adapter.
export function encodeCompanionCard(model: CompanionCardModel, original: CardConfig): CardConfig {
  const config = { ...original };
  switch (model.mode) {
    case "app": config.entity = model.applicationId; break;
    case "shortcut": config.entity = model.shortcutId; break;
    case "folder": config.entity = model.folderId; break;
    case "obs_output":
    case "obs_brb":
    case "obs_replay":
    case "obs_replay_buffer":
    case "obs_status":
    case "obs_take":
    case "obs_transition":
    case "obs_studio":
    case "obs_mic":
    case "obs": config.entity = model.actionId; break;
    case "apple_shortcut": config.entity = model.actionId; break;
    case "url": config.entity = model.applicationId; config.sensor = model.encodedUrl; break;
    case "system": config.entity = model.actionId; break;
    case "stats":
      config.entity = model.metricId; config.precision = model.precision; config.unit = model.unit;
      break;
  }
  return config;
}
