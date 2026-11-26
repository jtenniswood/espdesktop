"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const subpage = loadTypeScriptModule(path.resolve(__dirname, "../../../src/webserver/model/subpage.ts"));

test("extra home screens keep a custom title in their saved order", () => {
  const order = subpage.serializeSubpageGrid([1, 0, 0], {}, "Back", "", "Basement lights", true);
  assert.equal(order[0].startsWith("B="), true);
  assert.equal(subpage.parseSubpageOrder(order.join(",")).title, "Basement lights");
  assert.equal(subpage.subpageOrderForSerialize(order, "Back", "", "Basement lights")[0], order[0]);
});

test("extra home screens survive a title-free round trip", () => {
  const order = subpage.serializeSubpageGrid([1, 0], {}, "Back", "", "", true);
  assert.equal(subpage.parseSubpageOrder(order.join(",")).title || "", "");
  assert.equal(order[0], "B");
});
