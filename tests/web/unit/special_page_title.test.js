"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const model = loadTypescriptTest("src/webserver/model/subpage.ts");

test("special page names survive both encodings, backup and layout changes", () => {
  const title = "Office: Tools, 50% | 日本語 <test>";
  for (const color of ["", "FFEC16"]) {
    const order = model.serializeSubpageGrid([-2, 1, 0], { "-2": { r: 1, c: 1 } }, "Return:Home", color, title);
    for (const serialized of [model.serializeLegacySubpageConfig(order, [["switch.test", "Test"]]),
      model.serializeCompactSubpageConfig(order, [["", "switch.test", "Test"]]), order.join(",")]) {
      const parsed = model.parseRawSubpageConfig(serialized, () => "");
      assert.equal(parsed.title, title);
      assert.equal(parsed.backLabel, "Return:Home");
      assert.equal(parsed.backColor || "", color);
      assert.equal(parsed.order.length, 2, "name does not occupy a grid cell");
      const restored = model.parseStructuredSubpageConfig(model.structuredSubpageFromParsed(parsed));
      assert.equal(restored.title, title);
      const resized = model.serializeSubpageGrid([1, -2], {}, restored.backLabel, restored.backColor, restored.title);
      assert.equal(model.parseSubpageOrder(resized.join(",")).title, title);
      const cleared = model.subpageOrderForSerialize(order, parsed.backLabel, color, "");
      assert.equal(model.parseSubpageOrder(cleared.join(",")).title, undefined);
    }
  }
  assert.equal(model.parseRawSubpageConfig("B,1|switch.test:Test", () => "").title, undefined);
});
