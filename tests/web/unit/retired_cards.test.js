const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

test("retired cards release their whole span and preserve neighbouring cards", () => {
  const { removeRetiredCards } = loadTypescriptTest("src/webserver/features/retired_cards.ts");
  const { CARD_CONTRACT_RETIRED_TYPES, cardContractSubpageTypeCode, cardContractSubpageTypeFromCode } = loadTypescriptTest("src/webserver/generated/card_contract.ts");
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

test("removes saved Window Control cards while keeping other Companion cards", () => {
  const { removeRetiredCards } = loadTypescriptTest("src/webserver/features/retired_cards.ts");
  const { emptyCardConfig, retiredSavedCardType } = loadTypescriptTest("src/webserver/model/card.ts");
  const window = { ...emptyCardConfig("companion"), entity: "window.minimize" };
  const shortcut = { ...emptyCardConfig("companion"), entity: "shortcut.command+a" };
  assert.equal(retiredSavedCardType(window), "companion_window");
  assert.equal(retiredSavedCardType(shortcut), "");
  const grid = [1, 2];
  const buttons = [window, shortcut];
  assert.deepEqual(removeRetiredCards(grid, {}, buttons, 2), [1]);
  assert.deepEqual(grid, [0, 2]);
  assert.deepEqual(buttons, [emptyCardConfig(), shortcut]);
});

test("saved Window Control cleanup preserves nested pages, neighbours and other retired cards", () => {
  const { isRetiredLayoutCard, removeRetiredPanelRecords } = loadTypescriptTest("src/webserver/features/retired_cards.ts");
  const { parseRawButtonConfig } = loadTypescriptTest("src/webserver/model/card.ts");
  const { parseRawSubpageConfig } = loadTypescriptTest("src/webserver/model/subpage.ts");
  const { cardContractSubpageTypeFromCode } = loadTypescriptTest("src/webserver/generated/card_contract.ts");
  const codec = { parseButtonConfig: parseRawButtonConfig,
    parseSubpageConfig: raw => parseRawSubpageConfig(raw, cardContractSubpageTypeFromCode) };
  const { encodePanelPageDocument, decodePanelPageDocument } = loadTypescriptTest("src/webserver/model/panel_config_conversion.ts");
  const old = "window.minimize;Minimise;Monitor;Auto;;;companion";
  const folder = ";Rooms;;;;;subpage";
  const page = "~B=Rooms:112233:Main,1w,,2,3|CP,window.left,Tile|G,,Child|CP,shortcut.command%2Ba,Keep";
  const nested = "B=Child,1,2|window.close:Close:Monitor:Auto:::companion|com.apple.Finder:Finder:Monitor:Auto:::companion";
  const special = "~B=Close,1,2|CP,window.restore,Restore|CP,shortcut.command%2Bb,Keep";
  const document = { deviceProfile: "test", buttons: { 1: old, 2: folder, 3: ";Old;;;;;screen_lock", 9: old },
    subpages: { 2: page, 66: nested }, settings: { button_order: "1w,,2,3", special_page: special, button_on_color: "112233" } };
  const cleaned = structuredClone(document);
  assert.equal(removeRetiredPanelRecords(cleaned, codec, isRetiredLayoutCard), true);
  assert.deepEqual(cleaned.buttons, { 2: folder, 3: ";Old;;;;;screen_lock" });
  assert.equal(cleaned.settings.button_order, ",,2,3");
  assert.equal(cleaned.settings.button_on_color, "112233");
  assert.equal(cleaned.settings.special_page, "~B=Close,,2||CP,shortcut.command%2Bb,Keep");
  assert.equal(cleaned.subpages[2], "~B=Rooms:112233:Main,,,2,3||G,,Child|CP,shortcut.command%2Ba,Keep");
  assert.equal(cleaned.subpages[66], "B=Child,,2||com.apple.Finder:Finder:Monitor:Auto:::companion");
  const roundTrip = decodePanelPageDocument(encodePanelPageDocument(cleaned));
  assert.deepEqual({ ...roundTrip, buttons: { ...roundTrip.buttons }, subpages: { ...roundTrip.subpages },
    settings: { ...roundTrip.settings } }, cleaned);
  assert.equal(document.buttons[1], old);
  assert.equal(removeRetiredPanelRecords(cleaned, codec, isRetiredLayoutCard), false);
});

test("native cleanup clears retired Mac audio sliders on home and folder grids", () => {
  const { removeRetiredPanelRecords } = loadTypescriptTest("src/webserver/features/retired_cards.ts");
  const { encodePanelPageDocument, decodePanelPageSnapshot } = loadTypescriptTest("src/webserver/model/panel_config_conversion.ts");
  const { document, layout } = decodePanelPageSnapshot(encodePanelPageDocument({
    deviceProfile: "test",
    buttons: { 1: "media.output_volume;Output;;;;;slider", 2: ";Folder;;;;;subpage" },
    subpages: { 2: "B,1,2|media.input_mute:Mic:::::slider|switch.lamp:Lamp:::::switch" },
    settings: { button_order: "1,2" },
  }));
  const codec = {
    parseButtonConfig() { assert.fail("expected a native home card"); },
    parseSubpageConfig() { assert.fail("expected a native folder card"); },
  };
  assert.equal(removeRetiredPanelRecords(document, codec, undefined, layout), true);
  assert.equal(document.buttons[1], undefined);
  assert.equal(document.settings.button_order, ",2");
  assert.equal(document.subpages[2], "B,,2||switch.lamp:Lamp:::::switch");
});
