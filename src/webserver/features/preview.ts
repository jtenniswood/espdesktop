import { cardContractAvailability, cardContractTypeRetired } from "../generated/card_contract";
import { cardTypeConnector, cardRequiresHomeAssistant } from "../model/legacy_home_assistant";
export { cardTypeConnector, cardRequiresHomeAssistant } from "../model/legacy_home_assistant";
import { configOptionValue } from "../model/config_primitives";

import { activeCardColor, lighterCardColor } from "../model/config_primitives";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PositionedRect extends Rect {
  readonly pos: number;
}

export interface MenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface CardTypeDefinition {
  readonly key?: string;
  readonly label?: string | (() => string);
  readonly pickerKey?: string | null | (() => string | null);
  readonly pickerLabel?: string | (() => string);
  readonly allowInSubpage?: boolean | (() => boolean);
  readonly isAvailable?: ((context: { isSub: boolean }) => boolean) | null;
}

export interface CardPickerOption {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly connector: "home_assistant" | "mac_companion" | "mixed" |
    "home_assistant_or_local" | "local" | "network";
}

interface PickerDetails {
  readonly icon: string;
  readonly description: string;
}

const INFO_ONLY_CARD_TYPES = new Set([
  "door_window",
  "image",
  "presence",
  "weather",
  "weather_forecast",
]);

const CARD_TYPE_PICKER_DETAILS: Readonly<Record<string, PickerDetails>> = {
  "": { icon: "toggle-switch", description: "Toggle lights, switches, helpers, or fans." },
  alarm: { icon: "shield-home", description: "Control or trigger alarm panel actions." },
  climate: { icon: "thermostat", description: "Show climate status and temperature controls." },
  companion_cough: { icon: "microphone-off", description: "Hold to mute the paired computer’s microphone." },
  companion_apple_shortcut: { icon: "flash", description: "Add one card that runs a selected Apple Shortcut." },
  companion_apple_shortcuts: { icon: "flash", description: "Add a card that opens a subpage of Apple Shortcuts workflows." },
  companion_app: { icon: "application-outline", description: "Launch an app and set up a subpage for its keyboard shortcuts." },
  companion_folder: { icon: "folder", description: "Open a folder subpage or add a shortcut to a single folder." },
  companion_output_volume: { icon: "volume-high", description: "Control speakers, mics, and apps." },
  companion_output_mute: { icon: "volume-off", description: "Mute or unmute the paired computer’s sound output." },
  companion_input_mute: { icon: "microphone-off", description: "Mute or unmute the paired computer’s microphone." },
  companion_app_volume: { icon: "volume-high", description: "Adjust the sound from one app." },
  companion_mac_lock: { icon: "lock", description: "Lock the paired computer." },
  companion_obs_brb: { icon: "coffee-to-go", description: "Switch to your break scene and resume when ready." },
  companion_obs_studio_control: { icon: "movie", description: "Open a page for recording, streaming, Studio Mode, and replay." },
  companion_obs_studio: { icon: "view-split-vertical", description: "Toggle Studio Mode, see Program, or take Preview live." },
  companion_obs_audio: { icon: "microphone", description: "Open a page of mixer sliders." },
  companion_obs_scenes: { icon: "image", description: "Open a page of scenes from the current collection." },
  companion_obs_transition: { icon: "flip-horizontal", description: "Cycle through transitions or select a specific one." },
  companion_obs_transitions: { icon: "flip-horizontal", description: "Open a page that fills with the current transitions." },
  companion_obs_output: { icon: "broadcast", description: "Control streaming, recording, and the virtual camera." },
  companion_obs_replay: { icon: "history", description: "Save a replay or start and stop the buffer." },
  companion_obs_fader: { icon: "tune-vertical", description: "Adjust levels, toggle mute, or hold to mute an audio input." },
  companion_obs: { icon: "monitor", description: "Choose a scene to switch to." },
  companion_shortcut: { icon: "keyboard-outline", description: "Run a keyboard shortcut on the paired computer." },
  companion_subpage: { icon: "view-grid-plus", description: "Open a nested page of Companion cards." },
  companion_url: { icon: "web", description: "Open a website in the paired computer’s browser." },
  cover: { icon: "window-shutter", description: "Control blinds, curtains, or covers." },
  door_window: { icon: "door-open", description: "Show open or closed sensor state." },
  presence: { icon: "account", description: "Show person or presence status." },
  fan_speed: { icon: "fan", description: "Control fan speed, mode, or direction." },
  garage: { icon: "garage", description: "Show and control a garage door." },
  gate: { icon: "gate", description: "Show and control a gate." },
  image: { icon: "image", description: "Display an image card where supported." },
  light_brightness: { icon: "lightbulb", description: "Configure light switch, brightness, or temperature controls." },
  lawn_mower: { icon: "robot-mower", description: "Show or control a robotic lawn mower." },
  lock: { icon: "lock", description: "Show and control a lock." },
  media: { icon: "speaker", description: "Control media playback or volume." },
  media_control: { icon: "music", description: "Open all media controls and volume in a modal." },
  push: { icon: "gesture-tap-button", description: "Fire a momentary button event." },
  subpage: { icon: "view-grid-plus", description: "Create a subpage for additional cards" },
  vacuum: { icon: "robot-vacuum", description: "Show or control a vacuum cleaner." },
  weather: { icon: "weather-partly-cloudy", description: "Show weather or forecast data." },
};

const CARD_TYPE_PICKER_DEFAULTS: Readonly<Record<string, string>> = {
  climate: "climate_control",
  fan_speed: "fan_control",
  media_control: "media",
  companion_app: "companion",
  companion_apple_shortcut: "companion",
  companion_apple_shortcuts: "subpage",
  companion_folder: "companion",
  companion_obs: "companion",
  companion_obs_mic: "companion",
  companion_obs_fader: "slider",
  companion_obs_brb: "companion",
  companion_obs_studio: "companion",
  companion_obs_transition: "companion",
  companion_obs_transitions: "subpage",
  companion_obs_audio: "subpage",
  companion_obs_scenes: "subpage",
  companion_obs_studio_control: "subpage",
  companion_obs_replay: "companion",
  companion_obs_output: "companion",
  companion_shortcut: "companion",
  companion_subpage: "subpage",
  companion_url: "companion",
};

const MAC_COMPANION_HIDDEN_CARD_TYPES = new Set([
  "companion", "push", "slider",
  "companion_obs_mic", "companion_obs_cough",
]);



export type CardPickerConnector = "home_assistant" | "mac_companion";

export function cardPickerConnectors(
  homeAssistantEnabled: boolean,
  companionSupported: boolean,
): Array<[CardPickerConnector, string]> {
  const connectors: Array<[CardPickerConnector, string]> = [];
  if (homeAssistantEnabled) connectors.push(["home_assistant", "Home Assistant"]);
  if (companionSupported) connectors.push(["mac_companion", "Companion"]);
  return connectors;
}

export function cardTypeVisibleForConnector(key: string, connector: CardPickerConnector): boolean {
  if (cardContractTypeRetired(key)) return false;
  // The default Switch card keeps the empty contract ID used by saved layouts;
  // the contract cannot list an empty ID as stable, so admit it explicitly.
  if (key !== "" && key !== "companion_obs_fader" &&
      cardContractAvailability(defaultCardTypeForPicker(key)) !== "stable") return false;
  if (connector === "mac_companion" && MAC_COMPANION_HIDDEN_CARD_TYPES.has(key)) return false;
  const source = cardTypeConnector(key);
  if (connector === "home_assistant")
    return source !== "mac_companion" || key === "slider";
  return source !== "home_assistant";
}

function cardRelativeLuminance(background: string): number {
  const rgb = parseInt(background.replace(/^#/, ""), 16);
  // Match the firmware's fixed-point luminance calculation and light-background threshold.
  const linear = (channel: number) => {
    const value = channel / 255;
    return Math.round((value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * 1000000);
  };
  const red = (rgb >> 16) & 255, green = (rgb >> 8) & 255, blue = rgb & 255;
  const luminance = Math.floor((linear(red) * 2126 + linear(green) * 7152 + linear(blue) * 722) / 10000);
  return luminance;
}

export function cardPreviewTextColor(background: string): string {
  // Prefer white on mid-tone card colours, matching the firmware's crossover.
  return cardRelativeLuminance(background) < 450000 ? "#FFFFFF" : "#212121";
}

export function darkerCardColor(background: string, percent: number): string {
  const hex = background.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return "";
  return [0, 2, 4].map(offset =>
    Math.floor(parseInt(hex.slice(offset, offset + 2), 16) * percent / 100).toString(16).padStart(2, "0").toUpperCase()).join("");
}

export function cardPatternHighlightColor(background: string): string {
  const hex = background.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return "";
  if (cardPreviewTextColor(hex) === "#FFFFFF") return darkerCardColor(hex, 65);
  return [0, 2, 4].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    const shade = channel + Math.floor((255 - channel) * 35 / 100);
    return shade.toString(16).padStart(2, "0").toUpperCase();
  }).join("");
}

export function applySliderPreviewTextContrast(card: HTMLElement, baseTextColor: string, fillColor: string): void {
  const fill = card.querySelector<HTMLElement>(".sp-slider-fill");
  if (!fill) return;
  const fillTextColor = cardPreviewTextColor(fillColor);
  if (fillTextColor === baseTextColor) return;
  const fromTop = card.classList.contains("sp-cover-preview");
  const fillBounds = fill.getBoundingClientRect();
  const edge = fromTop ? fillBounds.bottom : fillBounds.top;
  const topTextColor = fromTop ? fillTextColor : baseTextColor;
  const bottomTextColor = fromTop ? baseTextColor : fillTextColor;
  for (const label of card.querySelectorAll<HTMLElement>(".sp-btn-icon,.sp-btn-label,.sp-sensor-badge,.sp-btn-label-row .mdi")) {
    const bounds = label.getBoundingClientRect();
    if (bounds.height <= 0) continue;
    const split = Math.max(0, Math.min(100, (edge - bounds.top) / bounds.height * 100));
    // A sharp text gradient follows the same boundary as the slider fill,
    // including when it crosses an icon or a wrapped label.
    label.style.backgroundImage = `linear-gradient(to bottom,${topTextColor} ${split}%,${bottomTextColor} ${split}%)`;
    label.style.backgroundClip = "text";
    label.style.color = "transparent";
  }
}

export function cardProgressColor(background: string): string {
  const hex = background.replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return "";
  // Keep progress shades independent of the foreground contrast rule.
  const rgb = parseInt(hex, 16);
  const red = (rgb >> 16) & 255, green = (rgb >> 8) & 255, blue = rgb & 255;
  const crossover = green >= red + 32 && blue >= red + 32 ? 550000 : 450000;
  if (cardRelativeLuminance(hex) < crossover) return lighterCardColor(hex);
  // Match the firmware's rounded 30% darkening on pale backgrounds.
  return [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.floor((channel * 70 + 50) / 100).toString(16).padStart(2, "0");
  }).join("").toUpperCase();
}

export function previewValue<T>(preview: Record<string, unknown> | null | undefined, key: string, fallback: T): T {
  return preview && Object.prototype.hasOwnProperty.call(preview, key) ? preview[key] as T : fallback;
}

export function registryValue<T>(definition: Record<string, unknown> | null | undefined, key: string, fallback: T): T {
  if (!definition || !Object.prototype.hasOwnProperty.call(definition, key)) return fallback;
  const candidate = definition[key];
  const value = typeof candidate === "function" ? (candidate as () => unknown)() : candidate;
  return value == null ? fallback : value as T;
}

export function buttonConfigDisabledForDevice(
  definitions: Readonly<Record<string, CardTypeDefinition>>,
  disabledCardTypes: readonly string[],
  button: { readonly type?: string | null } | null | undefined,
): boolean {
  const type = button?.type || "";
  if (disabledCardTypes.includes(type)) return true;
  const definition = definitions[type] as Record<string, unknown> | undefined;
  const pickerKey = registryValue(definition, "pickerKey", "");
  return !!pickerKey && disabledCardTypes.includes(pickerKey);
}

export function infoOnlyCardVisible(key: string, infoOnly: boolean): boolean {
  return !infoOnly || INFO_ONLY_CARD_TYPES.has(key || "");
}

export function defaultCardTypeForPicker(key: string): string {
  return CARD_TYPE_PICKER_DEFAULTS[key] || key;
}

export function cardTypePickerDetails(key: string, label: string): PickerDetails {
  return CARD_TYPE_PICKER_DETAILS[key || ""] || {
    icon: "card-outline",
    description: `Configure a ${label || "card"} card.`,
  };
}

export function cardTypePickerOptions(
  definitions: Readonly<Record<string, CardTypeDefinition>>,
  disabledCardTypes: readonly string[],
  infoOnly: boolean,
  isSub: boolean,
  selectedTypeKey: string | null | undefined,
  connector: CardPickerConnector = "home_assistant",
  homeAssistantEnabled = false,
): CardPickerOption[] {
  const options: CardPickerOption[] = [];
  let selectedUnsupported: { key: string; label: string } | null = null;
  const hasSelectedType = selectedTypeKey !== null && selectedTypeKey !== undefined;
  for (const [typeKey, definition] of Object.entries(definitions)) {
    if (cardContractTypeRetired(typeKey)) continue;
    const rawDefinition = definition as Record<string, unknown>;
    const pickerKey = String(registryValue(rawDefinition, "pickerKey", ""));
    const allowInSubpage = !!registryValue(rawDefinition, "allowInSubpage", false);
    const defaultLabel = registryValue(rawDefinition, "label", definition.key || "Toggle");
    const label = registryValue(rawDefinition, "pickerLabel", defaultLabel);
    const source = cardTypeConnector(typeKey);
    const requiresHomeAssistant = !homeAssistantEnabled && (source === "home_assistant" ||
      source === "home_assistant_or_local");
    const localFolderPicker = !homeAssistantEnabled && typeKey === "subpage";
    if (requiresHomeAssistant && !localFolderPicker) {
      if (hasSelectedType && (selectedTypeKey === typeKey || (pickerKey && selectedTypeKey === pickerKey))) {
        selectedUnsupported = { key: selectedTypeKey, label };
      }
      continue;
    }
    if (disabledCardTypes.includes(typeKey) || disabledCardTypes.includes(pickerKey)) continue;
    if (!infoOnlyCardVisible(typeKey, infoOnly) || (pickerKey && !infoOnlyCardVisible(pickerKey, infoOnly))) {
      if (hasSelectedType && (selectedTypeKey === typeKey || (pickerKey && selectedTypeKey === pickerKey))) {
        selectedUnsupported = { key: selectedTypeKey, label };
      }
      continue;
    }
    if (pickerKey && pickerKey !== typeKey) continue;
    if (isSub && !allowInSubpage) continue;
    if (definition.isAvailable && !definition.isAvailable({ isSub }) && selectedTypeKey !== typeKey) continue;
    if (!cardTypeVisibleForConnector(typeKey, connector) && !localFolderPicker) continue;
    options.push({
      key: typeKey,
      label,
      disabled: false,
      connector: cardTypeConnector(typeKey),
      ...cardTypePickerDetails(typeKey, label),
    });
  }
  if (selectedUnsupported) {
    const label = `${selectedUnsupported.label} (not available)`;
    options.push({
      key: selectedUnsupported.key,
      label,
      disabled: true,
      connector: cardTypeConnector(selectedUnsupported.key),
      ...cardTypePickerDetails(selectedUnsupported.key, label),
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function closestGridCell(point: Point, cells: readonly PositionedRect[]): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPosition = -1;
  for (const cell of cells) {
    if (point.x >= cell.left && point.x <= cell.right && point.y >= cell.top && point.y <= cell.bottom) {
      return cell.pos;
    }
    const centerX = (cell.left + cell.right) / 2;
    const centerY = (cell.top + cell.bottom) / 2;
    const distance = (point.x - centerX) ** 2 + (point.y - centerY) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPosition = cell.pos;
    }
  }
  return bestPosition;
}

export function swapGridCell(
  point: Point,
  container: Rect,
  gridCols: number,
  gridRows: number,
): number {
  const width = Math.max(1, container.right - container.left);
  const height = Math.max(1, container.bottom - container.top);
  const column = Math.max(0, Math.min(Math.floor((point.x - container.left) / (width / gridCols)), gridCols - 1));
  const row = Math.max(0, Math.min(Math.floor((point.y - container.top) / (height / gridRows)), gridRows - 1));
  return row * gridCols + column;
}

export function clampMenuPosition(
  point: Point,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 4,
): MenuPosition {
  return {
    x: Math.max(margin, Math.min(point.x, viewportWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(point.y, viewportHeight - menuHeight - margin)),
  };
}
