const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { loadTypescriptTest: load } = require("./helpers/load_typescript_test");
const model = load("src/webserver/model/index.ts");
const native = load("src/webserver/model/native_config_backup.ts");
const graph = load("src/webserver/model/panel_config_conversion.ts");
const { createBackupFeature } = load("src/webserver/features/backup.ts");
const { createBackupExportController } = load("src/webserver/features/backup_export_controller.ts");
const { createBackupContractFeature } = load("src/webserver/application/backup_contract.ts");
const contract = load("src/webserver/generated/card_contract.ts");
const parse = raw => model.parseRawSubpageConfig(raw, contract.cardContractSubpageTypeFromCode);
const fixture = JSON.parse(fs.readFileSync("compatibility/fixtures/companion_nested_pages.json", "utf8")).document;
for (const version of [1, 2]) {
  test(`application export/import round trip accepts native v${version}`, () => {
    const document = structuredClone(fixture);
    if (version === 1) document.subpages = { 1: "~B,1|companion,shortcut.command%2Bl,Address" };
    const bytes = version === 1 ? model.encodePanelConfig(document) : graph.encodePanelPageDocument(document);
    const feature = createBackupFeature({ deviceId: document.deviceProfile, gridCols: 3, numSlots: 9,
      normalizeButtonConfig: model.cloneCardConfig, parseSubpageConfig: parse,
      serializeSubpageConfig: () => "", buildSubpageGrid: sp => model.buildSubpageGrid(sp, 9, 3).grid });
    const buttons = Array.from({ length: 9 }, (_, index) => model.parseRawButtonConfig(document.buttons[index + 1]));
    const outer = feature.createBackupConfig({ buttons, subpages: {}, button_order: "1" });
    const exporter = createBackupExportController({ serializeButtonConfig: () => "", serializeSubpageConfig: () => "" });
    const exported = exporter.addNativeConfig(outer, { deviceProfile: document.deviceProfile, buttons,
      subpages: {}, nativeDocumentBytes: bytes });
    const wrapper = createBackupContractFeature(feature, { parseSubpageConfig: parse },
      { definitions: {} }, { config: { disabledCardTypes: [] } });
    const planned = wrapper.planBackupImport(exported, { device: document.deviceProfile, slots: 9 });
    assert.equal(planned.config.native_config.document_version, version);
    assert.deepEqual(native.decodeNativeConfigBackupPayload(planned.config.native_config), bytes);
    const restored = native.decodeNativeConfigDocument(native.decodeNativeConfigBackupPayload(planned.config.native_config));
    assert.deepEqual(JSON.parse(JSON.stringify(restored)), document);
    const restricted = createBackupContractFeature(feature, { parseSubpageConfig: parse },
      { definitions: {} }, { config: { disabledCardTypes: ["companion"] } });
    assert.throws(() => restricted.planBackupImport(exported, { device: document.deviceProfile, slots: 9 }), /does not support the companion/);
  });
}
