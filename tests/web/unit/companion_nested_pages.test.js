"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const codec = loadTypescriptTest("src/webserver/model/panel_config_conversion.ts");
const transfer = loadTypescriptTest("src/webserver/model/page_card_transfer.ts");
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../compatibility/fixtures/companion_nested_pages.json"), "utf8"));

test("a Companion app inside a folder retains its shortcut page in the native wire format", () => {
  const wire = codec.encodePanelPageDocument(fixture.document);
  assert.equal(Buffer.from(wire).toString("hex"), fixture.wire_hex);
  assert.deepEqual(JSON.parse(JSON.stringify(codec.decodePanelPageDocument(wire))), fixture.document);
  assert.throws(() => codec.convertNativeV2ToV1(wire));
});
test("copying a folder retains its app shortcut descendants and rejects a third level", () => {
  const layout = { slots: 9, columns: 3 };
  const entries = transfer.capturePageCards(fixture.document, 0, [1], layout);
  const result = transfer.planPageCardPaste(fixture.document, 0, 1, entries.entries, layout);
  assert.equal(result.document.subpages[65], fixture.document.subpages[33]);
  const tooDeep = structuredClone(fixture.document);
  tooDeep.subpages[33] = "~B,1|companion,com.apple.finder,Finder,,,,,,app_shortcuts";
  assert.throws(() => codec.encodePanelPageDocument(tooDeep));
});

const { NativePanelConfigController } = loadTypescriptTest("src/webserver/controllers/native_panel_config_controller.ts");
const { updateEditorPage } = loadTypescriptTest("src/webserver/model/page_edit.ts");
test("app owner and shortcut page commit together, with no partial write on rejection", async () => {
  for (const rejected of [false, true]) {
    let persisted = structuredClone(fixture.document), puts = 0;
    const response = (status, body = new Uint8Array()) => ({ ok: status < 300, status,
      headers: { get: name => name === "ETag" ? '"v2-1"' : name === "X-Panel-Config-Version" ? "2" : null },
      arrayBuffer: async () => Uint8Array.from(body).buffer, json: async () => ({}) });
    const controller = new NativePanelConfigController({
      fetch: async (url, request) => {
        if (url.endsWith("capabilities")) return { ...response(200), json: async () => ({ configuration: {
          read: true, write: true, document_versions: [1,2], durable_document_version: 2,
          max_navigation_depth: 2, writable_navigation_depth: 2, max_record_body_bytes: 4096,
          max_v2_document_bytes: 524288, preserves_inactive_records: true,
        } }) };
        if (request?.method === "PUT") {
          puts++;
          if (rejected) return response(413);
          persisted = codec.decodePanelPageDocument(request.body);
          return response(204);
        }
        return response(200, codec.encodePanelPageDocument(persisted));
      }, deviceProfile: () => fixture.document.deviceProfile, slotCount: () => 9,
      entityName: name => name, entityNameForSlot: (name, slot) => `${name}_${slot}`,
      normalizeHexColor: value => value, showBanner: () => {}, delay: callback => callback(),
    });
    assert.equal(await controller.begin(), true);
    const edit = controller.beginAtomicEdit();
    assert.ok(edit);
    const nextPage = fixture.document.subpages[33].replace("Address", "Edited address");
    await controller.writeSetting("button_order", "1");
    await controller.writeSubpage(33, nextPage);
    assert.equal(puts, 0);
    assert.equal(await edit.finish(true), !rejected);
    assert.equal(puts, 1);
    assert.equal(persisted.subpages[33], rejected ? fixture.document.subpages[33] : nextPage);
    const cancelled = controller.beginAtomicEdit();
    await controller.writeSubpage(33, nextPage);
    cancelled.cancel();
    assert.equal(puts, 1);
  }
});
test("deleting a folder removes its shortcut descendants without changing the original", () => {
  const original = structuredClone(fixture.document);
  const next = updateEditorPage(original, 1, "");
  assert.equal(next.subpages[1], undefined);
  assert.equal(next.subpages[33], undefined);
  assert.deepEqual(original, fixture.document);
});

test("preset reindexing keeps a custom folder's shortcut descendants with its owner", () => {
  const original = structuredClone(fixture.document);
  const safari = original.subpages[1].split("|")[1];
  original.subpages[1] = "~B,1,2|" + safari + "|companion,shortcut.command%2Bt,New tab";
  const changed = updateEditorPage(original, 1, "~B,1,2|companion,shortcut.command%2Bt,New tab|" + safari);
  assert.equal(changed.subpages[33], undefined);
  assert.equal(changed.subpages[34], fixture.document.subpages[33]);
  assert.equal(original.subpages[33], fixture.document.subpages[33]);
});

test("renaming a folder to match a sibling retains both independent child pages", () => {
  const original = structuredClone(fixture.document);
  original.subpages[1] = "~B,1,2|subpage,,A|subpage,,B";
  original.subpages[33] = "~B,1|companion,shortcut.command%2Bl,First contents";
  original.subpages[34] = "~B,1|companion,shortcut.command%2Bt,Second contents";
  const changed = updateEditorPage(original, 1, "~B,1,2|subpage,,B|subpage,,B");
  assert.equal(changed.subpages[33], original.subpages[33]);
  assert.equal(changed.subpages[34], original.subpages[34]);
});

test("a settings-only native save keeps nonsequential page and card identities", async () => {
  const { NativeV2Kind: K, decodeNativeV2, encodeNativeV2 } = loadTypescriptTest("src/webserver/model/panel_config_v2.ts");
  const records = decodeNativeV2(codec.encodePanelPageDocument(fixture.document));
  const pageId = id => id === 0 || id === 65535 ? id : id + 100;
  const cardId = id => id === 65535 ? id : id + 1000;
  for (const record of records) {
    if (record.kind === K.Page) {
      record.id = pageId(record.id);
      record.first = pageId(record.first);
      record.second = cardId(record.second);
    } else if (record.kind === K.Card) {
      record.id = cardId(record.id);
      record.first = pageId(record.first);
    } else if (record.kind === K.Navigation) {
      record.id = cardId(record.id);
      record.first = pageId(record.first);
    }
  }
  let persisted = encodeNativeV2(records);
  const layoutRows = bytes => decodeNativeV2(bytes).filter(row =>
    row.kind === K.Card || row.kind === K.Navigation || (row.kind === K.Page && row.id));
  const originalLayout = layoutRows(persisted);
  const savedBackup = persisted;
  let generation = 0;
  const response = (status, bytes = new Uint8Array()) => ({ ok: status < 300, status,
    headers: { get: name => name === "ETag" ? `"v2-${generation}"` : name === "X-Panel-Config-Version" ? "2" : null },
    arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  const controller = new NativePanelConfigController({
    fetch: async (url, request) => {
      if (url.endsWith("capabilities")) return { ...response(200), json: async () => ({ configuration: {
        read: true, write: true, document_versions: [2], durable_document_version: 2,
        max_navigation_depth: 2, writable_navigation_depth: 2, max_record_body_bytes: 4096,
      } }) };
      if (request?.method === "PUT") {
        assert.equal(request.headers["If-Match"], `"v2-${generation}"`);
        persisted = request.body;
        generation++;
        return response(204);
      }
      return response(200, persisted);
    }, deviceProfile: () => fixture.document.deviceProfile, slotCount: () => 9,
    entityName: name => name, entityNameForSlot: (name, slot) => `${name}_${slot}`,
    normalizeHexColor: value => value, showBanner: () => {}, delay: callback => callback(),
  });
  assert.equal(await controller.begin(), true);
  const initialCount = decodeNativeV2(persisted).length;
  for (const value of ["first", "second", "third", ""]) {
    assert.equal(await controller.writeSetting("opaque_setting", value), "saved");
    assert.equal(codec.decodePanelPageDocument(persisted).settings.opaque_setting, value || undefined);
    assert.deepEqual(layoutRows(persisted), originalLayout);
    assert.ok(decodeNativeV2(persisted).length <= initialCount + 3, "repeated setting edits reclaim replaced strings");
  }
  assert.equal(await controller.writeSetting("button_order", "1w"), "saved");
  assert.equal(codec.decodePanelPageDocument(persisted).settings.button_order, "1w");
  assert.deepEqual(layoutRows(persisted), originalLayout);
  assert.equal(generation, 5);
  const restored = codec.decodePanelPageDocument(savedBackup);
  assert.equal(await controller.writeDocument(restored, savedBackup), "saved");
  assert.deepEqual(persisted, savedBackup, "an unchanged backup restores the exact native graph bytes");
  const withSetting = { ...restored, settings: { ...restored.settings, automatic_switching: "0" } };
  assert.equal(await controller.writeDocument(withSetting, savedBackup), "saved");
  assert.deepEqual(layoutRows(persisted), originalLayout);
  assert.equal(codec.decodePanelPageDocument(persisted).settings.automatic_switching, "0");
  const mismatched = { ...restored, buttons: { 1: "light.kitchen;Kitchen" } };
  assert.equal(await controller.writeDocument(mismatched, savedBackup), "failed");
  assert.equal(generation, 7);

  assert.equal(await controller.schedule(current => {
    current.settings.automatic_switching = "1";
    return current;
  }, true), "saved");
  assert.equal(codec.decodePanelPageDocument(persisted).settings.automatic_switching, "1");
  assert.deepEqual(layoutRows(persisted), originalLayout);

  assert.equal(await controller.schedule(current => {
    current.subpages[33] = current.subpages[33].replace("Address", "Edited address");
    return current;
  }, true), "saved");
  assert.match(codec.decodePanelPageDocument(persisted).subpages[33], /Edited address/);
  assert.equal(generation, 9, "in-place changes are committed even when unchanged writes can be skipped");
});

test("structured root and folder edits keep wire identities and retry the latest generation", async () => {
  const { NativeV2Kind: K, decodeNativeV2 } = loadTypescriptTest("src/webserver/model/panel_config_v2.ts");
  const { updateNativePanelSettings } = loadTypescriptTest("src/webserver/model/panel_config_settings.ts");
  const { NativeLayoutDraft } = loadTypescriptTest("src/webserver/model/native_layout_draft.ts");
  let persisted = codec.encodePanelPageDocument(fixture.document);
  const original = decodeNativeV2(persisted);
  const rootId = original.find(row => row.kind === K.Card && row.first === 0 && row.second === 1).id;
  const folderId = original.find(row => row.kind === K.Page && row.second === rootId).id;
  const safariId = original.find(row => row.kind === K.Card && row.first === folderId).id;
  const shortcutPage = original.find(row => row.kind === K.Page && row.second === safariId).id;
  let generation = 1, puts = 0, legacyCalls = 0;
  const legacy = () => { ++legacyCalls; throw new Error("native edit reached the text serializer"); };
  const response = (status, bytes = new Uint8Array()) => ({
    ok: status < 300, status, arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    headers: { get: name => name === "ETag" ? `"v2-${generation}"` : name === "X-Panel-Config-Version" ? "2" : null },
  });
  const controller = new NativePanelConfigController({
    fetch: async (url, request) => {
      if (url.endsWith("capabilities")) return { ...response(200), json: async () => ({ configuration: {
        read: true, write: true, document_versions: [2], durable_document_version: 2,
        max_navigation_depth: 2, writable_navigation_depth: 2, max_record_body_bytes: 4096,
      } }) };
      if (request?.method !== "PUT") return response(200, persisted);
      assert.equal(request.headers["If-Match"], `"v2-${generation}"`);
      if (++puts === 1) {
        const before = codec.decodePanelPageDocument(persisted).settings;
        persisted = updateNativePanelSettings(persisted, before, { ...before, parallel: "saved elsewhere" });
        generation++;
        return response(409);
      }
      if (puts === 3) {
        const concurrent = new NativeLayoutDraft(persisted);
        const page = codec.decodePanelPageSnapshot(persisted).layout.pages.find(page => page.key === 34);
        concurrent.writePage(34, { order: page.order, cards: [{ ...page.cards[0].config, label: "Other browser" }] });
        persisted = concurrent.finish();
        generation++;
        return response(409);
      }
      persisted = request.body;
      generation++;
      return response(204);
    },
    deviceProfile: () => fixture.document.deviceProfile, slotCount: () => 9,
    entityName: name => name, entityNameForSlot: (name, slot) => `${name}_${slot}`,
    normalizeHexColor: value => value, showBanner() {}, delay: callback => callback(),
  });
  assert.equal(await controller.begin(), true);
  const { layout } = codec.decodePanelPageSnapshot(persisted);
  const [safari] = layout.pages.find(page => page.key === 1).cards;
  const [address] = layout.pages.find(page => page.key === 33).cards;
  const group = controller.beginAtomicEdit();
  assert.equal(await controller.writeButtonAndOrder(1, legacy, "1w", {
    ...layout.rootCards[0].config, label: "Home | work",
  }), "saved");
  assert.equal(await controller.writeSubpage(1, legacy, {
    order: "B,1,2", cards: [{ ...address.config, label: "New first card" }, safari.config],
  }), "saved");
  assert.equal(await controller.writeSubpage(34, legacy, {
    order: "B,1", cards: [{ ...address.config, label: "Address | work" }],
  }), "saved");
  assert.equal(puts, 0);
  assert.equal(await group.finish(true), true);
  assert.equal(legacyCalls, 0);
  assert.equal(puts, 2);
  const result = codec.decodePanelPageSnapshot(persisted);
  assert.equal(result.document.settings.parallel, "saved elsewhere");
  assert.equal(result.document.settings.button_order, "1w");
  assert.equal(result.layout.rootCards[0].config.label, "Home | work");
  assert.equal(result.layout.pages.find(page => page.key === 34).cards[0].config.label, "Address | work");
  const saved = decodeNativeV2(persisted);
  assert.equal(saved.find(row => row.kind === K.Card && row.id === rootId).second, 1);
  assert.equal(saved.find(row => row.kind === K.Card && row.id === safariId).second, 2);
  assert.equal(saved.find(row => row.kind === K.Page && row.id === shortcutPage).second, safariId);

  assert.equal(await controller.writeSubpage(34, legacy, {
    order: "B,1", cards: [{ ...address.config, label: "Conflicting edit" }],
  }), "conflict");
  assert.equal(puts, 3, "an overlapping edit must not be retried");
  assert.equal(codec.decodePanelPageSnapshot(persisted).layout.pages.find(page => page.key === 34).cards[0].config.label,
    "Other browser");
});

test("native transfers preserve existing card and page records and retain copied descendants", () => {
  const { NativeLayoutDraft } = loadTypescriptTest("src/webserver/model/native_layout_draft.ts");
  const { NativeV2Kind: K, decodeNativeV2 } = loadTypescriptTest("src/webserver/model/panel_config_v2.ts");
  const grid = { slots: 9, columns: 3 };
  const original = codec.encodePanelPageDocument({
    ...fixture.document,
    buttons: { ...fixture.document.buttons, 9: "light.keep;Keep;;;;;" },
  });
  const snapshot = codec.decodePanelPageSnapshot(original);
  const copied = transfer.captureNativePageCards(snapshot.document, snapshot.layout, 0, [1], grid);
  const draft = new NativeLayoutDraft(original);
  // Browser-internal copy carries the structured subtree independently of the
  // portable Paste Code copy.
  transfer.pasteNativePageCards(draft, 0, 1, copied.entries.map(entry => ({ ...entry, subtree: null })), grid);
  const pasted = draft.finish();
  const updated = codec.decodePanelPageSnapshot(pasted);
  assert.equal(updated.layout.pages.find(page => page.key === 65).cards[0].config.label, "Address");
  const originalRecords = decodeNativeV2(original).filter(row =>
    row.kind === K.Card || row.kind === K.Navigation || (row.kind === K.Page && row.id));
  const expectOriginal = input => {
    const records = decodeNativeV2(input);
    for (const row of originalRecords) assert.deepEqual(records.find(saved => saved.kind === row.kind && saved.id === row.id), row);
  };
  expectOriginal(pasted);
  const pastedCard = transfer.captureNativePageCards(updated.document, updated.layout, 0, [2], grid);
  const cut = new NativeLayoutDraft(pasted);
  transfer.deleteNativePageCards(cut, pastedCard.origin, grid);
  const afterCut = cut.finish();
  expectOriginal(afterCut);
  const result = codec.decodePanelPageSnapshot(afterCut);
  assert.equal(result.layout.pages.find(page => page.key === 65), undefined);
  assert.equal(result.layout.pages.find(page => page.key === 33).cards[0].config.label, "Address");
});

test("a flat native backup restores losslessly when the panel negotiates a flat format", async () => {
  const { createNativePanelConfigClient } = loadTypescriptTest("src/webserver/features/native_panel_config.ts");
  const { decodePanelConfig, encodePanelConfig } = loadTypescriptTest("src/webserver/model/panel_config.ts");
  const flat = { deviceProfile: fixture.document.deviceProfile, buttons: { 1: ";Folder;;;;;subpage" },
    subpages: { 1: "B,1|switch.lamp:Lamp:::::switch" }, settings: { button_order: "1", opaque: "value" } };
  const backup = codec.encodePanelPageDocument(flat);
  for (const version of [1, 2]) {
    let saved;
    const represent = document => version === 2 ? codec.convertNativeV1ToV2(encodePanelConfig(document)) : encodePanelConfig(document);
    const response = (status, body = new Uint8Array()) => ({ ok: status < 300, status,
      headers: { get: name => name === "ETag" ? '"1"' : name === "X-Panel-Config-Version" ? String(version) : null },
      arrayBuffer: async () => Uint8Array.from(body).buffer, json: async () => ({}) });
    const client = createNativePanelConfigClient(async (url, request) => {
      if (url.endsWith("capabilities")) return { ...response(200), json: async () => ({ configuration: {
        read: true, write: true, document_versions: [version], max_record_body_bytes: 4096,
      } }) };
      if (request?.method === "PUT") {
        saved = version === 2 ? codec.convertNativeV2ToV1(request.body) : request.body;
        return response(204);
      }
      return response(200, represent({ ...flat, buttons: {}, subpages: {}, settings: {} }));
    });
    assert.equal(await client.save(() => codec.decodePanelPageDocument(backup), false, backup), "saved");
    assert.deepEqual(JSON.parse(JSON.stringify(decodePanelConfig(saved))), flat);
  }
});
