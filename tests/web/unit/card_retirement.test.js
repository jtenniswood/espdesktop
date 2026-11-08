"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { cardRuntimeRetired } = loadTypescriptTest("src/webserver/model/legacy_home_assistant.ts");
const { createCardRegistry } = loadTypescriptTest("src/webserver/application/card_registry.ts");
const fixtures = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../common/config/card_retirement_fixtures.json")));
test("all saved card types agree on retirement while local variants stay supported", () => {
  for (const { card, retired } of fixtures) {
    const before = JSON.stringify(card);
    assert.equal(cardRuntimeRetired(card.type, card), retired, JSON.stringify(card));
    assert.equal(JSON.stringify(card), before);
  }
});
test("retired editors cannot mutate saved cards or create controls", () => {
  const previous = global.document;
  global.document = { createElement: () => ({}) };
  try {
    for (const { card, retired } of fixtures.filter(f => f.retired)) {
      let oldCalls=0;
      const registry=createCardRegistry(), normalize=() => {};
      const definition=registry.register(card.type, {
        cardMetadata:{entity:{domains:["light"]}}, onSelect: () => ++oldCalls,
        renderSettingsBeforeLabel: () => ++oldCalls, renderSettings: () => ++oldCalls,
        normalizeConfig: normalize,
      });
      const before=JSON.stringify(card), children=[];
      definition.renderSettingsBeforeLabel?.({appendChild() {}}, card);
      definition.renderSettings({appendChild: child => children.push(child)}, card);
      assert.equal(oldCalls, 0, card.type);
      assert.equal(JSON.stringify(card), before);
      assert.match(children[0].textContent, /configuration has been kept/);
      assert.equal(definition.normalizeConfig, normalize, "legacy backup normalization remains readable");
    }
  } finally { global.document=previous; }
});
test("local action, sensor, Mac slider and Date & Time editors remain active", () => {
  for (const card of [
    {type:"action",sensor:"local",entity:"zoom_mute"},
    {type:"sensor",sensor:"local",entity:"cpu_temp"},
    {type:"slider",entity:"media.output_volume"},
    {type:"slider",entity:"media.input_volume"},
    {type:"calendar",entity:"sensor.date"},
  ]) {
    let calls=0;
    const definition=createCardRegistry().register(card.type,{renderSettings:() => ++calls});
    definition.renderSettings({},card);
    assert.equal(calls,1,card.type);
  }
});
