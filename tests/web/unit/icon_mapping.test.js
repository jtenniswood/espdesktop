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

test("Command is selectable and shortcut icon names retain their glyphs", () => {
  assert.ok(iconOptions.includes("Shortcut Command"));
  assert.equal(iconSlug("Shortcut Command"), "apple-keyboard-command");
  assert.equal(iconSlug("Shortcut Control"), "apple-keyboard-control");
  assert.equal(iconSlug("Shortcut Option"), "apple-keyboard-option");
  assert.equal(iconSlug("Shortcut Shift"), "apple-keyboard-shift");
  assert.equal(iconSlug("Shortcut Left"), "arrow-left");
  assert.equal(iconSlug("Shortcut Right"), "arrow-right");
});

test("desktop picker offers PC and Mac controls and removed icons fall back", () => {
  for (const name of ["Apple", "Windows", "Keyboard", "Shortcut Option", "Copy", "Paste",
    "Terminal", "Screenshot", "Screen Share", "Video Call", "CPU", "USB", "Sleep", "Window Maximise"]) {
    assert.ok(iconOptions.includes(name), `${name} is selectable`);
  }
  for (const name of ["Ceiling Light", "Air Conditioner", "Bathtub", "Robot Vacuum", "Robot Mower", "Weather Rainy", "Washing Machine"]) {
    assert.ok(!iconOptions.includes(name), `${name} is absent from the desktop picker`);
    assert.equal(iconSlug(name), "cog", `${name} uses the fallback icon`);
  }
});
