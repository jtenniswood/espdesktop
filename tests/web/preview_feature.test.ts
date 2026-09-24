import {
  cardPickerConnectors,
  cardRequiresHomeAssistant,
  cardTypeConnector,
  cardTypePickerOptions,
  cardTypeVisibleForConnector,
  clampMenuPosition,
  closestGridCell,
  defaultCardTypeForPicker,
  infoOnlyCardVisible,
  previewValue,
  swapGridCell,
} from "../../src/webserver/features/preview";

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) throw new Error(`${message}: expected ${expectedText}, received ${actualText}`);
}

export function runPreviewFeatureTests(): void {
  equal(previewValue({ iconHtml: "custom" }, "iconHtml", "fallback"), "custom", "custom preview values win");
  equal(previewValue(null, "iconHtml", "fallback"), "fallback", "missing preview values use fallback");
  equal(infoOnlyCardVisible("sensor", true), true, "sensors remain visible in info-only mode");
  equal(infoOnlyCardVisible("action", true), false, "actions are hidden in info-only mode");
  equal(defaultCardTypeForPicker("climate"), "climate_control", "picker aliases retain their defaults");
  equal(defaultCardTypeForPicker("companion_stats"), "companion", "Companion subtype pickers use the Companion runtime card");
  equal(defaultCardTypeForPicker("companion_subpage"), "subpage", "Companion subpages use the shared subpage runtime");
  deepEqual(
    cardPickerConnectors(true, true),
    [["home_assistant", "Home Assistant"], ["mac_companion", "Mac Companion"]],
    "Home Assistant is available when explicitly enabled and Companion is supported",
  );
  deepEqual(
    cardPickerConnectors(false, true),
    [["mac_companion", "Mac Companion"]],
    "a Companion-only setup omits the Home Assistant picker tab",
  );
  equal(cardTypeVisibleForConnector("subpage", "home_assistant"), true, "Home Assistant subpages remain in the Home Assistant picker");
  equal(cardTypeVisibleForConnector("subpage", "mac_companion"), false, "Home Assistant subpages are hidden from Companion");
  equal(cardTypeVisibleForConnector("companion_subpage", "home_assistant"), false, "Companion subpages are hidden from Home Assistant");
  equal(cardTypeVisibleForConnector("companion_subpage", "mac_companion"), true, "Companion subpages remain in the Companion picker");
  for (const key of ["calendar", "push", "slider", "timer"]) {
    equal(cardTypeConnector(key), "home_assistant", `${key} is classified as Home Assistant-only`);
    equal(cardTypeVisibleForConnector(key, "home_assistant"), true, `${key} remains in the Home Assistant picker`);
    equal(cardTypeVisibleForConnector(key, "mac_companion"), false, `${key} is hidden from the Companion picker`);
  }
  for (const key of ["internal", "screen_lock", "wifi_qr", "wifi_qr_card"]) {
    equal(cardTypeConnector(key), "local", `${key} is classified as a local card`);
    equal(cardTypeVisibleForConnector(key, "mac_companion"), true, `${key} remains available without Home Assistant`);
  }
  equal(cardRequiresHomeAssistant("climate", {}), true, "Home Assistant-only cards require Home Assistant");
  equal(cardRequiresHomeAssistant("", {}), true, "the canonical empty-string Switch type requires Home Assistant");
  equal(cardRequiresHomeAssistant("push", {}), true, "Trigger cards require the Home Assistant event bus");
  equal(cardRequiresHomeAssistant("action", { sensor: "light.turn_on" }), true, "Home Assistant actions require Home Assistant");
  equal(cardRequiresHomeAssistant("action", { sensor: "local" }), false, "local actions can be transferred");
  equal(cardRequiresHomeAssistant("sensor", { sensor: "sensor.temperature" }), true, "Home Assistant sensors require Home Assistant");
  equal(cardRequiresHomeAssistant("sensor", { sensor: "local" }), false, "local sensors can be transferred");
  equal(cardRequiresHomeAssistant("subpage", { options: "subpage_connector=mac_companion" }), false, "Mac Companion subpages can be transferred");
  equal(cardRequiresHomeAssistant("subpage", { options: "" }), true, "Home Assistant subpages remain blocked from transfers");
  equal(cardRequiresHomeAssistant("wifi_qr", { options: "wifi_tabs=qr%7Ccredentials" }), false, "local Wi-Fi sharing cards can be transferred");
  equal(cardRequiresHomeAssistant("wifi_qr", { options: "wifi_tabs=qr%7Cguest" }), true, "Wi-Fi cards with Guest Wi-Fi controls require Home Assistant");
  equal(cardRequiresHomeAssistant("wifi_qr_card", { entity: "switch.guest_wifi" }), true, "Wi-Fi cards with a guest switch require Home Assistant");
  equal(cardTypeVisibleForConnector("action", "mac_companion"), true, "local actions remain available with Companion");
  equal(cardTypeVisibleForConnector("push", "mac_companion"), false, "triggers are hidden from Companion");
  equal(cardTypeVisibleForConnector("sensor", "mac_companion"), true, "local sensors remain available with Companion");
  equal(cardTypeVisibleForConnector("companion_stats", "mac_companion"), true, "Companion subtypes appear in the Companion picker");
  equal(cardTypeVisibleForConnector("webhook", "home_assistant"), true, "shared webhook cards appear for Home Assistant");
  equal(cardTypeVisibleForConnector("webhook", "mac_companion"), true, "shared webhook cards appear for Companion");

  const definitions = {
    action: { label: "Action", allowInSubpage: true },
    calendar: { label: "Date & Time", allowInSubpage: true },
    climate: { label: "Climate", allowInSubpage: false },
    climate_control: { label: "Climate controls", pickerKey: "climate", allowInSubpage: false },
    sensor: { label: "Sensor", allowInSubpage: true },
    wifi_qr: { label: "Wifi Sharing", allowInSubpage: true },
    wifi_qr_card: { label: "QR Card", pickerKey: "wifi_qr", allowInSubpage: true },
  };
  deepEqual(
    cardTypePickerOptions(definitions, [], false, true, null).map((option) => option.key),
    ["action", "calendar", "sensor", "wifi_qr"],
    "subpage picker retains local-only cards and the Date & Time route for local modes",
  );
  const defaultPicker = cardTypePickerOptions(definitions, [], false, false, null);
  equal(defaultPicker.some((option) => option.key === "calendar"), true,
    "the Date & Time route remains available for local Clock and World Clock modes");
  equal(defaultPicker.some((option) => option.key === "climate"), false,
    "Home Assistant cards stay hidden while support is disabled");
  const optedInPicker = cardTypePickerOptions(definitions, [], false, false, null, "home_assistant", true);
  equal(optedInPicker.some((option) => option.key === "climate"), true,
    "firmware opt-in restores Home Assistant cards to the picker");
  const companionOptions = cardTypePickerOptions({
      ...definitions,
      calendar: { label: "Date & Time", allowInSubpage: true },
      companion: { label: "Companion", allowInSubpage: true },
      companion_app: { label: "Applications", allowInSubpage: true },
      companion_shortcut: { label: "Keyboard shortcut", allowInSubpage: true },
      companion_url: { label: "Open URL", allowInSubpage: true },
      companion_folder: { label: "Open folder", allowInSubpage: true },
      companion_stats: { label: "Stats", allowInSubpage: true },
      companion_subpage: { label: "Subpage", allowInSubpage: false },
      companion_window: { label: "Window control", allowInSubpage: true },
      internal: { label: "Internal Switches", allowInSubpage: true },
      push: { label: "Trigger", allowInSubpage: true },
      screen_lock: { label: "Screen Lock", allowInSubpage: true },
      webhook: { label: "Webhook", allowInSubpage: true },
      slider: { label: "Slider", allowInSubpage: true },
      wifi_qr: { label: "Wifi Sharing", allowInSubpage: true },
      wifi_qr_card: { label: "QR Card", pickerKey: "wifi_qr", allowInSubpage: true },
    }, [], false, false, null, "mac_companion");
  deepEqual(
    companionOptions.map((option) => option.key),
    ["action", "companion_app", "calendar", "internal", "companion_shortcut", "companion_folder", "companion_url", "screen_lock", "sensor", "companion_stats", "companion_subpage", "webhook", "wifi_qr", "companion_window"],
    "Companion picker includes local cards and Date & Time while excluding Home Assistant-only controls",
  );
  equal(
    companionOptions.find((option) => option.key === "companion_shortcut")?.icon,
    "apple-keyboard-command",
    "Companion keyboard shortcut cards use the Apple Command icon",
  );
  const infoOnlyOptions = cardTypePickerOptions(definitions, [], true, false, "action");
  equal(infoOnlyOptions.find((option) => option.key === "action")?.disabled, true,
    "selected Home Assistant type is labelled unavailable");
  equal(infoOnlyOptions.find((option) => option.key === "sensor")?.disabled, false,
    "local-only info sensor remains selectable");

  equal(
    swapGridCell({ x: 99, y: 75 }, { left: 0, top: 0, right: 100, bottom: 100 }, 2, 2),
    3,
    "swap targeting resolves the containing grid cell",
  );
  equal(
    closestGridCell({ x: 24, y: 10 }, [
      { pos: 0, left: 0, top: 0, right: 10, bottom: 20 },
      { pos: 1, left: 20, top: 0, right: 30, bottom: 20 },
    ]),
    1,
    "drag targeting chooses the closest rendered cell",
  );
  deepEqual(
    clampMenuPosition({ x: 198, y: 99 }, 40, 30, 200, 100),
    { x: 156, y: 66 },
    "context menus stay inside the viewport",
  );
}
