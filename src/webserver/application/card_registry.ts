import { cardRuntimeRetired, cardTypeConnector } from "../model/legacy_home_assistant";
import type { CardConfig } from "../contracts/types";
import { CARD_RUNTIME_SPECS } from "../generated/card_contract";

export type CardDefinitionValue<T> = T | (() => T);

export interface CardDefinition {
  readonly key?: string;
  readonly label?: CardDefinitionValue<string>;
  readonly allowInSubpage?: CardDefinitionValue<boolean>;
  readonly hideLabel?: boolean;
  readonly labelPlaceholder?: string | null;
  readonly pickerKey?: CardDefinitionValue<string | null>;
  readonly pickerLabel?: CardDefinitionValue<string>;
  readonly hidden?: CardDefinitionValue<boolean>;
  readonly isAvailable?: (() => boolean) | null;
  readonly onSelect?: ((button: any) => void) | null;
  readonly renderSettingsBeforeLabel?: ((...args: any[]) => unknown) | null;
  readonly renderSettings?: ((...args: any[]) => unknown) | null;
  readonly renderAppShortcutSettings?: (panel: HTMLElement, card: CardConfig, page: number,
    helpers: { idPrefix: string; saveField: (field: string, value: unknown) => void }) => void;
  /** Preview results set labelEditable to false when their label shows generated state instead of the card name. */
  readonly renderPreview?: ((...args: any[]) => unknown) | null;
  readonly contextMenuItems?: ((...args: any[]) => unknown) | null;
  readonly cardMetadata?: Record<string, any> | null;
  readonly runtimeSpec?: unknown;
  readonly defaultConfig?: CardDefinitionValue<unknown> | null;
  readonly normalizeConfig?: ((...args: any[]) => unknown) | null;
  readonly [name: string]: unknown;
}

export type CardDefinitions = Record<string, CardDefinition>;

export interface CardRegistry {
  readonly definitions: CardDefinitions;
  readonly typedDefinitionCount: number;
  register(key: string, definition: CardDefinition): CardDefinition;
}

export interface CardUiServices {
    renderPreview(): void;
    renderButtonSettings(force?: boolean): void;
}

const DEFAULT_DEFINITION: CardDefinition = {
  label: "Toggle",
  allowInSubpage: false,
  hideLabel: false,
  labelPlaceholder: null,
  pickerKey: null,
  isAvailable: null,
  onSelect: null,
  renderSettingsBeforeLabel: null,
  renderSettings: null,
  renderPreview: null,
  contextMenuItems: null,
  cardMetadata: null,
  runtimeSpec: null,
  defaultConfig: null,
  normalizeConfig: null,
};

export function renderRetiredCardSettings(panel: HTMLElement): void {
  const warning = document.createElement("p");
  warning.className = "sp-setting-note";
  warning.textContent = "This saved card needs Home Assistant. Its configuration has been kept. Replace the card to use Mac Companion or a local control.";
  panel.appendChild(warning);
}

function localCardDefinition(key: string, definition: CardDefinition): CardDefinition {
  if (!CARD_RUNTIME_SPECS[key] || key === "subpage" || key === "wifi_qr" || key === "wifi_qr_card") return definition;
  if (key !== "slider" && cardTypeConnector(key) === "home_assistant") {
    return { ...definition, hidden: true, isAvailable: () => false, hideLabel: true,
      cardMetadata: {}, onSelect: null, renderSettingsBeforeLabel: null,
      renderSettings: (panel: HTMLElement, card: any) => {
        if (cardRuntimeRetired(key, card)) renderRetiredCardSettings(panel);
      }, contextMenuItems: null };
  }
  if (key !== "sensor" && key !== "action" && key !== "slider") return definition;
  const settings = definition.renderSettings;
  const beforeLabel = definition.renderSettingsBeforeLabel;
  return { ...definition,
    renderSettingsBeforeLabel: beforeLabel ? (panel: any, card: any, ...args: any[]) => {
      if (!cardRuntimeRetired(key, card)) return beforeLabel(panel, card, ...args);
    } : null,
    renderSettings: (panel: any, card: any, ...args: any[]) => {
      if (cardRuntimeRetired(key, card)) return renderRetiredCardSettings(panel);
      return settings?.(panel, card, ...args);
    },
  };
}

export function createCardRegistry(): CardRegistry {
  let definitions: CardDefinitions = {};
  let typedDefinitionCount = 0;

  const registerDefinition = (key: string, definition: CardDefinition): CardDefinition => {
    const registered = {
      ...DEFAULT_DEFINITION,
      key,
      label: key || "Toggle",
      ...localCardDefinition(key, definition),
      runtimeSpec: definition.runtimeSpec || CARD_RUNTIME_SPECS[key] || null,
    };
    definitions[key] = registered;
    return registered;
  };

  return {
    get definitions() {
      return definitions;
    },
    get typedDefinitionCount() {
      return typedDefinitionCount;
    },
    register(key, definition) {
      typedDefinitionCount += 1;
      return registerDefinition(key, definition);
    },
  };
}
