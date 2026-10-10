"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { preserveCardColorOptions } = loadTypescriptTest("src/webserver/model/config_primitives.ts");
const source = fs.readFileSync(path.resolve(__dirname, "../../../src/webserver/application/button_settings.ts"), "utf8");
const start = source.indexOf("        function selectCardType(");
const end = source.indexOf("        function renderCardTypeGrid(", start);
assert(start >= 0 && end > start);
const actualSelection = esbuild.transformSync(source.slice(start, end), { loader: "ts" }).code;
function runSelection(type, options, from = "action") {
  const b = { type: from, options, sensor: "old", unit: "old", precision: "old" };
  let selected = 0;
  const scope = {
    b, isNewDraft: true, draftKey: "new", state: { settingsDraft: { key: "new", typeSelected: false } },
    defaultButtonTypeForPicker: key => key === "media_control" ? "media" : key,
    clearAutomaticTypeDefaults() { b.options = ""; },
    preserveCardColorOptions,
    cardRegistry: { definitions: Object.fromEntries(["climate", "alarm", "media", "weather", "light_switch", "light_control", "subpage", "media_control"].map(key => [key, {
      onSelect(button) { selected++; button.options = "target_default=yes"; },
    }])) },
    cloneButtonConfig: button => ({ ...button }), saveField() {}, renderButtonSettings() {},
  };
  // Execute the real inner selection method, with host doubles for its UI and registry services.
  new Function("scope", `with (scope) { return (${actualSelection}); }`)(scope)(type);
  return { b, draft: scope.state.settingsDraft, selected };
}
test("generic type selection retains colours across destructive defaults and picker aliases", () => {
  for (const type of ["climate", "alarm", "media", "weather", "light_switch", "light_control", "subpage", "media_control"]) {
    const { b, draft, selected } = runSelection(type, "obsolete=yes,card_off_color=6633b9");
    assert(selected > 0);
    assert(b.options.includes("card_off_color=6633B9"), type);
    assert(!b.options.includes("obsolete="), type);
    assert.equal(draft.autoSelectedButton.options, b.options, type);
    assert.equal(b.options.includes("target_default=yes"), type !== "media_control", type);
  }
});
test("type selection migrates legacy colours and rejects malformed colour values", () => {
  assert.equal(runSelection("climate", "card_on_color=%23abc123").b.options, "target_default=yes,card_off_color=ABC123");
  assert.equal(runSelection("climate", "card_off_color=invalid").b.options, "target_default=yes");
});
