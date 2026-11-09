"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const root = path.resolve(__dirname, "../../..");
const { registerFanCardTypes } = loadTypeScriptModule(path.join(root, "src/webserver/cards/fan.ts"));
const { defaultCardTypeForPicker } = loadTypeScriptModule(path.join(root, "src/webserver/features/preview.ts"));
function definitions() {
  const entries = {};
  registerFanCardTypes({ register(key, definition) { entries[key] = definition; } },
    { normalizeFanControlOptions: value => value || "" },
    { cardBadgeLabelHtml() { return ""; } }, { renderButtonSettings() {} });
  return entries;
}
test("retired fan modes cannot apply new control defaults", () => {
  const entries=definitions();
  for (const type of ["fan_control", "fan_speed", "fan_switch", "fan_oscillate", "fan_direction", "fan_preset"]) {
    assert.equal(entries[type].onSelect,null,type);
  }
  assert.equal(defaultCardTypeForPicker("fan_speed"),"fan_control", "saved picker aliases remain readable");
});
