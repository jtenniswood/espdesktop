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

test("native backup cleanup discards retired payloads before native or legacy restore", () => {
  const { removeRetiredPanelRecords } = loadTypescriptTest("src/webserver/features/retired_cards.ts");
  const { CARD_CONTRACT_RETIRED_TYPES, cardContractSubpageTypeCode, cardContractSubpageTypeFromCode } = loadTypescriptTest("src/webserver/generated/card_contract.ts");
  const { parseRawButtonConfig } = loadTypescriptTest("src/webserver/model/card.ts");
  const { parseRawSubpageConfig } = loadTypescriptTest("src/webserver/model/subpage.ts");
  const codec = {
    parseButtonConfig: parseRawButtonConfig,
    parseSubpageConfig: value => parseRawSubpageConfig(value, cardContractSubpageTypeFromCode),
  };
  const neighbour = "switch.lamp;Lamp;Auto;Auto;;;switch;;icon_size=large";
  for (const type of CARD_CONTRACT_RETIRED_TYPES) {
    const retired = `old.entity;Old;Auto;Auto;old.sensor;;${type};;ssid64=old-network,pass64=old-secret`;
    for (const page of [`1b,,2|${retired.replaceAll(";", ":")}|${neighbour.replaceAll(";", ":")}`, `~1b,,2|${cardContractSubpageTypeCode(type)},old.entity,Old,,,old.sensor,,,pass64=old-secret|switch,switch.lamp,Lamp,,,,,,icon_size%3Dlarge`]) {
      const document = { deviceProfile: "test", buttons: { 1: retired, 2: neighbour },
        subpages: { 3: page, 4: "", 98: page }, settings: { button_order: "1b,,2" } };
      removeRetiredPanelRecords(document, codec);
      assert.equal(document.buttons[1], undefined);
      assert.equal(document.buttons[2], neighbour);
      assert.equal(document.settings.button_order, ",,2");
      assert.equal(document.subpages[4], "");
      for (const cleaned of [document.subpages[3], document.subpages[98]]) {
        assert.ok(!cleaned.includes("old.entity") && !cleaned.includes("old.sensor") && !cleaned.includes("old-secret"));
        const parsed = parseRawSubpageConfig(cleaned, code => code);
        assert.equal(cleaned.split("|")[2], page.split("|")[2]);
        assert.deepEqual(parsed.order, ["", "", "2"]);
        assert.equal(parsed.buttons[1].entity, "switch.lamp");
        assert.equal(parsed.buttons[1].options, "icon_size=large");
      }
    }
  }
});
