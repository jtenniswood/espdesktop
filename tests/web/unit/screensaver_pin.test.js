"use strict";
const test = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
test("legacy screensaver PIN clearing on backup restore", async () => {
  await loadTypescriptTest("tests/web/screensaver_pin.test.ts").runScreensaverPinTests();
});
