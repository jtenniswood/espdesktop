const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("retired cards release their whole span and preserve neighbouring cards", () => {
  const { removeRetiredCards } = loadTypescriptTest("src/webserver/features/retired_cards.ts");
  const { CARD_CONTRACT_RETIRED_TYPES } = loadTypescriptTest("src/webserver/generated/card_contract.ts");
  const { emptyCardConfig } = loadTypescriptTest("src/webserver/model/card.ts");
  for (const type of CARD_CONTRACT_RETIRED_TYPES) {
    const neighbour = { ...emptyCardConfig(), entity: "switch.lamp", label: "Lamp" };
    const buttons = [{ ...emptyCardConfig(type), entity: "old.entity", options: "old=1" }, neighbour];
    const grid = [1, -1, 2, -1, -1, 0];
    const sizes = { 1: 4 };
    assert.deepEqual(removeRetiredCards(grid, sizes, buttons, 3), [1]);
    assert.deepEqual(grid, [0, 0, 2, 0, 0, 0]);
    assert.deepEqual(buttons[0], emptyCardConfig());
    assert.equal(buttons[1], neighbour);
    assert.deepEqual(sizes, {});
    assert.deepEqual(removeRetiredCards(grid, sizes, buttons, 3), []);
  }
});
