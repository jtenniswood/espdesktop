"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { legacyHomeAssistantCards, legacyHomeAssistantWarning, cardRequiresHomeAssistant } =
  loadTypescriptTest("src/webserver/model/legacy_home_assistant.ts");
const { encodePanelConfig, decodePanelConfig } = loadTypescriptTest("src/webserver/model/panel_config.ts");
const { serializeCompactSubpageConfig } = loadTypescriptTest("src/webserver/model/subpage.ts");
const { emptyCardConfig } = loadTypescriptTest("src/webserver/model/card.ts");
const { cardContractSubpageTypeCode } = loadTypescriptTest("src/webserver/generated/card_contract.ts");

test("finds retired cards in native, legacy folder and special-page records without changing bytes", () => {
  const doc = {
    deviceProfile: "guition-esp32-s3-4848s040", buttons: {
      1: "light.desk;Desk;Auto;Auto;;;light_switch;;",
      2: ";Folder;Auto;Auto;;;subpage;;",
      3: ";Clock;Auto;Auto;;;clock;;",
      4: "",
      5: "zoom_mute;Mute;Auto;Auto;local;;action;;",
    }, subpages: {
      2: "1,B|sensor.room:Room:Auto:Auto:::sensor::",
    }, settings: {
      button_order: "1,2,3,5", button_on_color: "0099FF",
      special_page: "1,B|switch.guest:Guest:Auto:Auto:::::",
    },
  };
  const before = encodePanelConfig(doc);
  const restored = decodePanelConfig(before);
  const report = legacyHomeAssistantCards(restored);
  assert.deepEqual(report.map(card => card.location), ["Card 1", "Folder 2, card 1", "Special page, card 1"]);
  assert.deepEqual(encodePanelConfig(restored), before, "inspection must not rewrite or drop saved records");
  assert.match(legacyHomeAssistantWarning(report), /3 saved cards need Home Assistant/);
  assert.match(legacyHomeAssistantWarning(report), /configuration has been kept/);
});

test("keeps Mac, local controls and ordinary folders available while identifying mixed HA options", () => {
  for (const [type, data] of [
    ["companion_app", { entity: "com.apple.Safari" }],
    ["action", { sensor: "local" }], ["sensor", { sensor: "local" }],
    ["subpage", {}], ["subpage", { options: "subpage_connector=mac_companion" }],
    ["subpage", { options: "subpage_kind=companion_stat" }],
    ["clock", {}], ["timezone", {}], ["screensaver", {}],
    ["wifi_qr", { options: "wifi_tabs=qr%7Ccredentials" }], ["webhook", {}],
  ]) assert.equal(cardRequiresHomeAssistant(type, data), false, type);
  for (const [type, data] of [
    ["", { entity: "switch.desk" }], ["calendar", { entity: "sensor.date" }],
    ["action", { sensor: "scene.turn_on" }], ["sensor", { entity: "sensor.room" }],
    ["subpage", { options: "subpage_kind=climate" }],
    ["subpage", { entity: "light.desk" }],
    ["wifi_qr", { options: "wifi_tabs=qr%7Cguest" }],
  ]) assert.equal(cardRequiresHomeAssistant(type, data), true, type);
  assert.equal(legacyHomeAssistantWarning([]), "");
  assert.match(legacyHomeAssistantWarning([{ location: "Card 1", type: "", label: "Desk" }]), /1 saved card needs/);
});

test("finds compact folder records with escaped labels and reserved card identifiers", () => {
  const card = { ...emptyCardConfig("light_switch"), entity: "light.desk", label: "Desk | light" };
  const raw = serializeCompactSubpageConfig(["1", "B"], [[cardContractSubpageTypeCode(card.type), encodeURIComponent(card.entity), encodeURIComponent(card.label), "Auto", "Auto", "", "", "", ""]]);
  const report = legacyHomeAssistantCards({ deviceProfile: "test", buttons: {}, subpages: { 1: raw }, settings: {} });
  assert.equal(report.length, 1);
  assert.equal(report[0].type, "light_switch");
  assert.equal(report[0].label, "Desk | light");
});

test("restoring the former automatic timezone selects Mac timezone without altering manual choices", () => {
  const { normalizeTimezoneOption } = loadTypescriptTest("src/webserver/model/settings.ts");
  assert.equal(normalizeTimezoneOption("Auto (Home Assistant)", "UTC (GMT+0)"), "Auto (Mac Companion)");
  assert.equal(normalizeTimezoneOption("Auto (Mac Companion)", "UTC (GMT+0)"), "Auto (Mac Companion)");
  assert.equal(normalizeTimezoneOption("Europe/London", "UTC (GMT+0)"), "Europe/London");
  assert.equal(normalizeTimezoneOption(undefined, "Europe/London"), "Europe/London");
});
