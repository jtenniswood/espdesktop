"use strict";
const test = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("retired camera cards preserve saved fields and explain replacement", () => {
  loadTypescriptTest("tests/web/camera_name.test.ts").runCameraNameTests();
});
