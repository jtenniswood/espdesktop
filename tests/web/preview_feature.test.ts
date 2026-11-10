import {
  cardPreviewTextColor,
  cardProgressColor,
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
  equal(cardPreviewTextColor("FFFFFF"), "#212121", "white card backgrounds use dark text like the device");
  equal(cardPreviewTextColor("FFEB3B"), "#212121", "bright yellow card backgrounds use dark text");
  equal(cardPreviewTextColor("313131"), "#FFFFFF", "dark card backgrounds retain white text");
  for (const colour of ["FF0000", "F6402C", "FF8C00", "1093F5", "46AF4A", "009687", "00BBD5", "00BCD4", "039BE5", "4FB9ED", "FF9800", "B2B2B2"]) {
    equal(cardPreviewTextColor(colour), "#FFFFFF", "mid-tone colour " + colour + " retains white content");
  }
  for (const colour of ["4DD0E1", "88C440", "CCDD1E", "FFEC16", "FFC100", "B3B3B3", "BABABA", "BBBBBB", "BFEAFF"]) {
    equal(cardPreviewTextColor(colour), "#212121", "light colour " + colour + " uses dark content");
  }
  for (const [base, fill] of [["00BCD4", "4DD0E1"], ["FFEC16", "B3A50F"], ["FFFFFF", "B3B3B3"], ["FF8C00", "FFAF4D"], ["9D9D9D", "BABABA"]]) {
    equal(cardProgressColor(base!), fill!, "media progress stays distinct on " + base);
  }
  equal(cardProgressColor("invalid"), "", "invalid progress colours use the theme default");
  equal(previewValue({ iconHtml: "custom" }, "iconHtml", "fallback"), "custom", "custom preview values win");
  equal(previewValue(null, "iconHtml", "fallback"), "fallback", "missing preview values use fallback");
  equal(infoOnlyCardVisible("sensor", true), false, "retired sensors are absent in info-only mode");
  equal(infoOnlyCardVisible("action", true), false, "actions are hidden in info-only mode");
  equal(defaultCardTypeForPicker("climate"), "climate_control", "picker aliases retain their defaults");
  equal(defaultCardTypeForPicker("companion_subpage"), "subpage", "Companion subpages use the shared subpage runtime");
  deepEqual(
    cardPickerConnectors(true, true),
    [["mac_companion", "Mac Companion"]],
    "legacy flags cannot restore a Home Assistant picker",
  );
  deepEqual(
    cardPickerConnectors(false, true),
    [["mac_companion", "Mac Companion"]],
    "a Companion-only setup omits the Home Assistant picker tab",
  );
  equal(cardTypeVisibleForConnector("subpage", "home_assistant"), false, "Home Assistant subpages remain in the Home Assistant picker");
  equal(cardTypeVisibleForConnector("subpage", "mac_companion"), false, "Home Assistant subpages are hidden from Companion");
  equal(cardTypeVisibleForConnector("companion_subpage", "home_assistant"), false, "Companion subpages are hidden from Home Assistant");
  equal(cardTypeVisibleForConnector("companion_subpage", "mac_companion"), true, "Companion subpages remain in the Companion picker");
  for (const key of ["push", "timer"]) {
    equal(cardTypeConnector(key), "home_assistant", `${key} is classified as Home Assistant-only`);
    equal(cardTypeVisibleForConnector(key, "home_assistant"), false, `${key} remains in the Home Assistant picker`);
    equal(cardTypeVisibleForConnector(key, "mac_companion"), false, `${key} is hidden from the Companion picker`);
  }
  equal(cardRequiresHomeAssistant("climate", {}), true, "Home Assistant-only cards require Home Assistant");
  equal(cardRequiresHomeAssistant("", {}), true, "the canonical empty-string Switch type requires Home Assistant");
  equal(cardRequiresHomeAssistant("push", {}), true, "Trigger cards require the Home Assistant event bus");
  equal(cardRequiresHomeAssistant("subpage", { options: "subpage_connector=mac_companion" }), false, "Mac Companion subpages can be transferred");
  equal(cardRequiresHomeAssistant("subpage", { options: "" }), false, "ordinary folder subpages do not require Home Assistant");
  equal(cardRequiresHomeAssistant("subpage", { options: "subpage_kind=climate" }), true, "Home Assistant subpage presets remain blocked from transfers");
  equal(cardRequiresHomeAssistant("subpage", { options: "subpage_kind=companion_stat" }), false, "Companion Stat subpages remain transferable");
  equal(cardTypeVisibleForConnector("action", "mac_companion"), false, "Action cards cannot return through the Companion picker");
  equal(cardTypeVisibleForConnector("push", "mac_companion"), false, "triggers are hidden from Companion");
  equal(cardTypeVisibleForConnector("companion_app", "mac_companion"), true, "Companion subtypes appear in the Companion picker");

  const definitions = {
    action: { label: "Action", allowInSubpage: true },
    climate: { label: "Climate", allowInSubpage: false },
    climate_control: { label: "Climate controls", pickerKey: "climate", allowInSubpage: false },
    subpage: { label: "Subpage", allowInSubpage: false },
  };
  deepEqual(
    cardTypePickerOptions(definitions, [], false, true, null).map((option) => option.key),
    [],
    "subpage picker excludes unavailable types",
  );
  const defaultPicker = cardTypePickerOptions(definitions, [], false, false, null);
  equal(defaultPicker.some((option) => option.key === "climate"), false,
    "Home Assistant cards stay hidden while support is disabled");
  equal(defaultPicker.some((option) => option.key === "subpage"), true,
    "ordinary folder subpages remain available while Home Assistant is disabled");
  const optedInPicker = cardTypePickerOptions(definitions, [], false, false, null, "home_assistant", true);
  equal(optedInPicker.some((option) => option.key === "climate"), false,
    "legacy firmware opt-in cannot restore HA cards");
  const companionOptions = cardTypePickerOptions({
      ...definitions,
      companion: { label: "Companion", allowInSubpage: true },
      companion_app: { label: "Applications", allowInSubpage: true },
      companion_shortcut: { label: "Key Shortcut", allowInSubpage: true },
      companion_url: { label: "Website", allowInSubpage: true },
      companion_folder: { label: "Folder", allowInSubpage: true },
      companion_subpage: { label: "Subpage", pickerKey: "subpage", allowInSubpage: false },
      push: { label: "Trigger", allowInSubpage: true },
      slider: { label: "Slider", allowInSubpage: true },
    }, [], false, false, null, "mac_companion");
  deepEqual(
    companionOptions.map((option) => option.key),
    ["companion_app", "companion_folder", "companion_shortcut", "subpage", "companion_url"],
    "Companion picker excludes retired controls and Home Assistant-only controls",
  );
  equal(
    companionOptions.find((option) => option.key === "companion_shortcut")?.icon,
    "apple-keyboard-command",
    "Companion keyboard shortcut cards use the Apple Command icon",
  );
  const infoOnlyOptions = cardTypePickerOptions(definitions, [], true, false, "action");
  equal(infoOnlyOptions.some((option) => option.key === "action"), false,
    "retired Action cards cannot be reintroduced as selected options");
  equal(infoOnlyOptions.some((option) => option.key === "sensor"), false,
    "retired sensor cards are not selectable");

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
