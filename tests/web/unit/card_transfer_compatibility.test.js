"use strict";

const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("imports card codes using the current product format", () => {
  const { runCardTransferCompatibilityTests } = loadTypescriptTest(
    "tests/web/card_transfer_compatibility.test.ts",
  );
  runCardTransferCompatibilityTests();
});
