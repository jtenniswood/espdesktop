"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { registerActionCardTypes } = loadTypescriptTest("src/webserver/cards/action.ts");
function card() {
  let definition;
  registerActionCardTypes({ register(_key, value) { definition = value; } }, { cardBadgeLabelHtml: (_helpers, label) => label });
  return definition;
}
test("opening a retired service action preserves its saved fields and explains replacement", () => {
  const previous = global.document;
  global.document = { createElement: () => ({}) };
  try {
    const button = { type: "action", entity: "script.evening", sensor: "script.turn_on", options: "script_fields=mode%3Anight,state_entity=sensor.room", label: "Evening" };
    const before = JSON.stringify(button), children = [];
    card().renderSettings({ appendChild: child => children.push(child) }, button, 1, {});
    assert.equal(JSON.stringify(button), before);
    assert.equal(children.length, 1);
    assert.match(children[0].textContent, /needs Home Assistant/);
    assert.match(children[0].textContent, /configuration has been kept/);
  } finally { global.document = previous; }
});
test("a new Action card defaults to local invocation and removes obsolete service fields", () => {
  const button = { type: "action", entity: "script.evening", sensor: "script.turn_on", unit: "50", precision: "text", options: "state_entity=sensor.room,card_off_color=00BCD4" };
  card().onSelect(button);
  assert.equal(button.sensor, "local");
  assert.equal(button.entity, "");
  assert.equal(button.unit, "");
  assert.equal(button.precision, "");
  assert.equal(button.options, "card_off_color=00BCD4");
});
