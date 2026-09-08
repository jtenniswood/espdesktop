"use strict";

const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("imports card codes created before the product rename", () => {
  const { runCardTransferCompatibilityTests } = loadTypescriptTest(
    "tests/web/card_transfer_compatibility.test.ts",
  );
  runCardTransferCompatibilityTests();
});
