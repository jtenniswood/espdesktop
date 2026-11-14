import type { CardConfig } from "../contracts/types";
import type { PanelConfigDocument } from "./panel_config";
import { isMacAudioCard, parseRawButtonConfig } from "./card";
import { parseRawSubpageConfig } from "./subpage";
import { cardContractSubpageTypeFromCode } from "../generated/card_contract";
import { configOptionValue } from "./config_primitives";

// These saved identifiers remain reserved after their runtime support is removed.
// Keeping this reader independent of the card registry lets old backups remain
// understandable without registering the retired cards again.
export type SavedCardConnector = "home_assistant" | "mac_companion" |
  "home_assistant_or_local" | "local" | "network";

const SUBPAGE_CONNECTOR_OPTION = "subpage_connector";
const SUBPAGE_KIND_OPTION = "subpage_kind";
const WIFI_QR_TABS_OPTION = "wifi_tabs";

const HOME_ASSISTANT_ONLY_CARD_TYPES = new Set([
  "push",
]);

const LOCAL_CARD_TYPES = new Set([
  "calendar", "clock", "internal", "local_sensor", "screen_lock", "screensaver", "timezone", "wifi_qr", "wifi_qr_card",
]);

export function cardTypeConnector(key: string): SavedCardConnector {
  if (key === "token_usage" || key === "slider" || key === "companion" || key.startsWith("companion_")) return "mac_companion";
  if (HOME_ASSISTANT_ONLY_CARD_TYPES.has(key)) return "home_assistant";
  if (key === "action" || key === "sensor") {
    return "home_assistant_or_local";
  }
  if (key === "webhook") return "network";
  if (LOCAL_CARD_TYPES.has(key)) return "local";
  return "home_assistant";
}

export function cardRequiresHomeAssistant(
  key: string,
  card: {
    readonly entity?: string | null;
    readonly options?: string | null;
    readonly sensor?: string | null;
  } | null | undefined,
): boolean {
  if (key === "slider") {
    return !isMacAudioCard(key, card?.entity);
  }
  if (key === "subpage") {
    const connector = configOptionValue(card?.options, SUBPAGE_CONNECTOR_OPTION);
    const kind = configOptionValue(card?.options, SUBPAGE_KIND_OPTION);
    if (connector === "mac_companion" || kind === "companion_stat") return false;
    const hasState = !!(card?.sensor || card?.entity);
    // An unconfigured folder is only navigation; presets and state bindings
    // use Home Assistant, including on an otherwise plain folder card.
    return connector === "home_assistant" || !!kind || hasState;
  }
  if (key === "wifi_qr" || key === "wifi_qr_card") {
    const tabs = configOptionValue(card?.options, WIFI_QR_TABS_OPTION).split("|");
    return tabs.includes("guest") || /^switch\./.test(String(card?.entity || ""));
  }
  const source = cardTypeConnector(key);
  if (source === "home_assistant") return true;
  if (source !== "home_assistant_or_local") return false;
  return card?.sensor !== "local";
}


/** Retire only the HA card itself; mixed folders/QR keep their local purpose. */
export function cardRuntimeRetired(key: string, card?: {
  readonly entity?: string | null; readonly sensor?: string | null;
  readonly label?: string | null; readonly options?: string | null;
} | null): boolean {
  if (key === "webhook") return true;
  if (!key && !card?.entity && !card?.sensor && !card?.label) return false;
  if (key === "local" || key === "subpage" || key === "wifi_qr" || key === "wifi_qr_card") return false;
  return cardRequiresHomeAssistant(key, card);
}


export interface LegacyHomeAssistantCard {
  readonly location: string;
  readonly type: string;
  readonly label: string;
}

/** Inspect the actual document selected for restore, including native backups.
 * Do not normalize, clear or renumber any saved cards here. Retired identifiers
 * must survive export/restore so a user can recover their original layout.
 */
export function legacyHomeAssistantCards(document: PanelConfigDocument): LegacyHomeAssistantCard[] {
  const result: LegacyHomeAssistantCard[] = [];
  function inspect(card: CardConfig, location: string): void {
    // Empty slots use the same unnamed type as legacy Switch cards.
    if (!card.type && !card.entity && !card.label && !card.sensor) return;
    if (cardRequiresHomeAssistant(card.type, card)) {
      result.push({ location, type: card.type, label: card.label || card.entity || "Switch" });
    }
  }
  for (const [slot, raw] of Object.entries(document.buttons)) {
    inspect(parseRawButtonConfig(raw), `Card ${slot}`);
  }
  for (const [slot, raw] of Object.entries(document.subpages)) {
    const subpage = parseRawSubpageConfig(raw, cardContractSubpageTypeFromCode);
    subpage.buttons.forEach((card, index) => inspect(card, `Folder ${slot}, card ${index + 1}`));
  }
  return result;
}

export function legacyHomeAssistantWarning(cards: readonly LegacyHomeAssistantCard[]): string {
  if (!cards.length) return "";
  return `${cards.length} saved ${cards.length === 1 ? "card needs" : "cards need"} Home Assistant, which is unavailable on this firmware. ` +
    "Their saved configuration has been kept. Replace or remove them in the editor.";
}
