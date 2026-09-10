"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const { iconSlug, iconOptions } = loadTypeScriptModule("src/webserver/application/ui_primitives.ts");
const icons = require("../../../product/v2/icons.json");

test("every firmware icon name resolves to its actual web glyph", () => {
  for (const icon of [icons.fallback, ...icons.structural, ...icons.icons]) {
    assert.equal(iconSlug(icon.name), icon.mdi, icon.name);
  }
});

test("Command is selectable and existing shortcut names retain their glyphs", () => {
  assert.ok(iconOptions.includes("Shortcut Command"));
  assert.equal(iconSlug("Shortcut Command"), "apple-keyboard-command");
  assert.equal(iconSlug("Shortcut Control"), "apple-keyboard-control");
  assert.equal(iconSlug("Shortcut Option"), "apple-keyboard-option");
  assert.equal(iconSlug("Shortcut Shift"), "apple-keyboard-shift");
  assert.equal(iconSlug("Shortcut Left"), "arrow-left");
  assert.equal(iconSlug("Shortcut Right"), "arrow-right");
});
