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
test("Fans picker keeps the resolved All Controls icon and options", () => {
  const entries = definitions();
  const card = { type: defaultCardTypeForPicker("fan_speed"), options: "light_entity=light.fan" };
  entries[card.type].onSelect(card);
  entries.fan_speed.onSelect(card); // Same dual-callback path as the real picker.
  assert.equal(card.type, "fan_control");
  assert.equal(card.icon, "Fan");
  assert.equal(card.options, "light_entity=light.fan");
});
test("explicit Speed and Switch selections retain their own defaults", () => {
  const entries = definitions();
  for (const [type, icon, iconOn] of [["fan_speed", "Fan Speed 2", "Auto"], ["fan_switch", "Fan Off", "Fan"]]) {
    const card = { type, options: "light_entity=light.fan" };
    entries[type].onSelect(card);
    assert.equal(card.icon, icon);
    assert.equal(card.icon_on, iconOn);
    assert.equal(card.options, "");
  }
});
