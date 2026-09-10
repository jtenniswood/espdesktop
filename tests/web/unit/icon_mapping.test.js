"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");

test("browser names match product icons including built-in shortcut glyphs", () => {
  const { iconSlug } = loadTypeScriptModule("src/webserver/application/ui_primitives.ts");
  const data = JSON.parse(fs.readFileSync("product/v2/icons.json", "utf8"));
  for (const icon of [...data.structural, ...data.icons]) {
    assert.equal(iconSlug(icon.name), icon.mdi, icon.name);
  }
  assert.equal(iconSlug("Shortcut Command"), "apple-keyboard-command");
});
