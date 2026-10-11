"use strict";
const test = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
test("firmware upload progress and confirmation", async () => {
  await loadTypescriptTest("tests/web/firmware_update.test.ts").runFirmwareUpdateTests();
});
