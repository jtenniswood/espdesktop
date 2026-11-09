"use strict";
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
test("native audio cards can cut/copy/import without HA while HA cards remain protected", () => {
  loadTypescriptTest("tests/web/companion_volume_clipboard.test.ts").runCompanionVolumeClipboardTests();
});
