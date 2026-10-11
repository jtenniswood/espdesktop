"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { normalizeCompanionCard, resetCompanionMetricPresentation, companionShortcutCatalogSelection } = loadTypescriptTest("src/webserver/cards/companion.ts");
const { companionShortcutPresetCards, normalizeCompanionAppShortcutOptions } = loadTypescriptTest("src/webserver/application/companion_shortcut_folder.ts");
test("every Companion normalizer preserves saved colour through repeated editor normalization", () => {
  for (const [entity, sensor, flags] of [
    ["stats", "", ""], ["stat.cpu", "", "large_numbers,stat_labels_off"],
    ["stat.network_throughput", "", "large_numbers"], ["stat.ip_address", "", ""],
    ["folder.home", "", "finder_open_behavior=same_window,finder_open_override"],
    ["com.apple.Safari", "", "app_shortcuts"],
    ["com.apple.Safari", "url.https%3A%2F%2Fexample.com", ""],
    ["webapp.browser", "", "webapp_icon_title"],
    ["shortcut.command+shift+k", "", "app_shortcut_preset=custom"],
  ]) {
    const card = { type: "companion", entity, sensor, options: [flags, "card_off_color=6633b9"].filter(Boolean).join(",") };
    for (let reopen = 0; reopen < 3; reopen++) {
      normalizeCompanionCard(card);
      assert(card.options.includes("card_off_color=6633B9"), entity);
      for (const flag of flags.split(",").filter(Boolean)) assert(card.options.includes(flag), `${entity}: ${flag}`);
    }
  }
});
test("Companion metric reset and shortcut presets retain colour without confusing preset selection", () => {
  const metric = { entity: "stat.cpu", options: "large_numbers,card_off_color=FFFFFF" };
  resetCompanionMetricPresentation(metric, "app");
  assert.equal(metric.options, "card_off_color=FFFFFF");
  const preset = companionShortcutPresetCards("com.apple.Safari")[0];
  assert(preset);
  const card = { ...preset, type: "companion", options: preset.options + ",card_off_color=00BCD4" };
  assert(companionShortcutCatalogSelection(card));
  assert(normalizeCompanionAppShortcutOptions(card).includes("card_off_color=00BCD4"));
  normalizeCompanionCard(card);
  assert(companionShortcutCatalogSelection(card));
});
