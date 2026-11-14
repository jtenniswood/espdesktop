const assert = require("node:assert/strict");
const test = require("node:test");
const cases = require("../../../compatibility/fixtures/finder_folder_preview.json");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

const { finderFolderPreview } = loadTypescriptTest("src/webserver/model/finder_folder_preview.ts");
const { buildSubpageGrid } = loadTypescriptTest("src/webserver/model/subpage.ts");

test("live Finder placement matches the firmware examples without changing the saved page", () => {
  for (const example of cases) {
    const order = Object.freeze(example.order.split(","));
    const buttons = Object.freeze(example.buttons.map(entity => Object.freeze({ entity, label: "Saved label" })));
    const { grid } = buildSubpageGrid({ order, buttons }, 9, 3);
    Object.freeze(grid);
    const actions = example.catalogue.map(([id, label]) => ({ id, label }));
    const placed = finderFolderPreview(order, grid, buttons, example.capacity, actions);
    assert.deepEqual([...placed].map(([cell, { id, label }]) => [cell, id, label]), example.expected);
  }
});
