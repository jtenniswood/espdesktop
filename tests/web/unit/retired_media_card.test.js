"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { registerMediaCardTypes } = loadTypescriptTest("src/webserver/cards/media.ts");
const { createConfigMediaOptionsFeature } = loadTypescriptTest("src/webserver/application/config_media_options.ts");
test("retired media cards keep all saved fields and expose replacement guidance", () => {
  let definition;
  registerMediaCardTypes({ register(key, value) { if (key === "media") definition = value; } }, createConfigMediaOptionsFeature({}), "test", {});
  const previous = global.document;
  global.document = { createElement: () => ({}) };
  try {
    for (const mode of ["control_modal", "speaker_group", "play_pause", "volume", "position", "cover_art", "now_playing", "playlist"]) {
      const card = { type: "media", entity: "media_player.office", sensor: mode, label: "Office", options: "media_secondary_entity=media_player.other,unknown=keep", icon: "Custom", unit: "legacy" };
      const before = JSON.stringify(card), children = [];
      definition.renderSettings({ appendChild: child => children.push(child) }, card, 1, {});
      assert.equal(JSON.stringify(card), before);
      assert.match(children[0].textContent, /configuration has been kept/);
    }
    assert.equal(definition.hidden(), true);
    assert.equal(definition.onSelect, undefined);
    assert.equal(definition.renderSettingsBeforeLabel, undefined);
    assert.equal(definition.cardMetadata.entity, undefined);
  } finally { global.document = previous; }
});
