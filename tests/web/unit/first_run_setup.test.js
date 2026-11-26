"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const {
  FIRST_RUN_COMPLETE, needsFirstRunSetup, firstRunApplications, applyFirstRunLayout,
} = loadTypescriptTest("src/webserver/application/first_run_setup.ts");
const { NativeLayoutDraft } = loadTypescriptTest("src/webserver/model/native_layout_draft.ts");
const { decodePanelPageSnapshot, encodePanelPageDocument } = loadTypescriptTest("src/webserver/model/panel_config_conversion.ts");
const { canExposeCard } = loadTypescriptTest("src/webserver/model/home_assistant_cards.ts");
const empty = overrides => encodePanelPageDocument({
  deviceProfile: "test", buttons: {}, subpages: {}, settings: { button_on_color: "FF0000" }, ...overrides,
});
const safari = { id: "com.apple.Safari", label: "Safari; Personal" };
const custom = { id: "org.example.custom", label: "Custom" };

test("OBS tiles that require a panel tap are excluded from Home Assistant export", () => {
  const uuid = "11111111-1111-1111-1111-111111111111";
  for (const entity of ["obs.take", "obs.studio", "obs.transition", "obs.brb", "obs.output.stream", "obs.output.record", "obs.target." + uuid, "obs.status.program"]) {
    assert.equal(canExposeCard({ type: "companion", entity, sensor: "" }), false, entity);
  }
  for (const entity of ["obs.mute." + uuid, "obs.scene." + uuid, "obs.replay"]) {
    assert.equal(canExposeCard({ type: "companion", entity, sensor: "" }), true, entity);
  }
});

function setup(input, apps, shortcuts, capacity = 4, replacing, openingMode, workflows) {
  const draft = new NativeLayoutDraft(input);
  applyFirstRunLayout(draft, decodePanelPageSnapshot(input), apps, shortcuts, capacity, replacing, openingMode, workflows);
  return draft.finish();
}

test("first-run setup only starts on an unconfigured display", () => {
  assert(needsFirstRunSetup(decodePanelPageSnapshot(empty())));
  for (const existing of [
    { buttons: { 1: "com.apple.Safari;Safari" } },
    { subpages: { 1: "B,1|saved" } },
    { settings: { button_order: "1" } },
    { settings: { special_page: "saved" } },
    { settings: { [FIRST_RUN_COMPLETE]: "1" } },
  ]) assert.equal(needsFirstRunSetup(decodePanelPageSnapshot(empty(existing))), false);
});

test("onboarding lists unique applications, excluding retired web apps and other actions", () => {
  assert.deepEqual(firstRunApplications([safari, safari, custom,
    { id: "webapp.notion", label: "Notion" },
    { id: "input.level." + "a".repeat(64), label: "USB Microphone" },
    { id: "obs.output.record", label: "Recording" },
    ...["folder.abc", "media.play_pause", "shortcut.command+k", "system.cpu", "window.left"].map(id => ({ id, label: id })),
  ]).map(app => app.id), [custom.id, safari.id]);
});

test("setup writes native cards and shortcut pages within capacity together with the preference", () => {
  const result = setup(empty(), [safari, custom], true, 4, undefined, "manual");
  const { document, layout } = decodePanelPageSnapshot(result);
  assert.equal(document.settings.button_order, "1,2");
  assert.equal(document.settings.button_on_color, "FF0000");
  assert.equal(document.settings[FIRST_RUN_COMPLETE], "1");
  assert.equal(document.settings.companion_app_subpage_mode, "manual");
  assert.equal(layout.rootCards[0].config.label, safari.label);
  assert.match(layout.rootCards[0].config.options, /app_shortcuts/);
  assert.equal(layout.rootCards[1].config.options, "", "unknown apps remain launch cards");
  assert.equal(layout.pages.length, 1);
  assert.equal(layout.pages[0].key, 1);
  assert.equal(layout.pages[0].order, "B,1,2,3");
  assert.equal(layout.pages[0].cards.length, 3, "Back reserves one of the four cards");
  assert.throws(() => setup(empty(), [safari, custom], false, 2), /setup limit/);
  assert.throws(() => setup(empty(), [safari, safari], false), /setup limit/);
  assert.throws(() => setup(result, [safari], false), /already has a layout/);
});

test("setup accepts the full app limit for each large touchscreen and rejects another app", () => {
  const apps = Array.from({ length: 21 }, (_, index) => ({ id: "org.example.app" + index, label: "App " + index }));
  for (const [deviceProfile, slots, limit] of [
    ["guition-esp32-p4-jc8012p4a1-v3", 24, 20],
    ["guition-esp32-p4-jc1060p470-v3", 15, 15],
    ["guition-esp32-s3-4848s040", 9, 8],
  ]) {
    const input = empty({ deviceProfile });
    const { layout } = decodePanelPageSnapshot(setup(input, apps.slice(0, limit), false, slots));
    assert.equal(layout.rootCards.length, limit, deviceProfile);
    assert.throws(() => setup(input, apps.slice(0, limit + 1), false, slots), /setup limit/, deviceProfile);
  }
});

test("skip saves completion without creating cards and launch-only creates no subpages", () => {
  const skipped = decodePanelPageSnapshot(setup(empty(), [], false));
  assert.deepEqual(skipped.layout.rootCards, []);
  assert.equal(needsFirstRunSetup(skipped), false);
  const launchOnly = decodePanelPageSnapshot(setup(empty(), [safari], false));
  assert.deepEqual(launchOnly.layout.pages, []);
  assert.equal(launchOnly.layout.rootCards[0].config.options, "");
});

test("setup gives the Shortcuts app a page of enabled workflows within capacity", () => {
  const shortcuts = { id: "com.apple.shortcuts", label: "Shortcuts" };
  const workflows = Array.from({ length: 5 }, (_, index) => ({
    id: "appleshortcut.727ed9bf-de97-42ed-b661-8967497b122" + index,
    label: "Workflow " + index,
  }));
  const { layout } = decodePanelPageSnapshot(setup(empty(), [shortcuts], true, 4, undefined, "focus", workflows));
  assert.equal(layout.pages[0].order, "B,1,2,3");
  assert.deepEqual(layout.pages[0].cards.map(card => card.config.entity), workflows.slice(0, 3).map(action => action.id));
});

test("replacing setup preserves other settings and rejects concurrent changes to the layout or preference", () => {
  const before = empty({ settings: { button_on_color: "FF0000", special_page: "existing special page" } });
  const saved = setup(before, [safari, custom], true, 4, decodePanelPageSnapshot(before), "focus");
  const original = decodePanelPageSnapshot(saved);
  const replacement = decodePanelPageSnapshot(setup(saved, [custom], false, 4, original, "manual"));
  assert.equal(replacement.layout.rootCards.length, 1);
  assert.equal(replacement.layout.rootCards[0].config.entity, custom.id);
  assert.deepEqual(replacement.layout.pages, []);
  assert.equal(replacement.document.settings.special_page, original.document.settings.special_page);
  assert.equal(replacement.document.settings.button_on_color, "FF0000");
  for (const change of [
    draft => draft.writeRootCard(3, { ...original.layout.rootCards[0].config, label: "Changed card" }),
    draft => draft.writePage(1, { order: "B", cards: [] }),
    draft => draft.writeSetting("button_order", "2,1"),
    draft => draft.writeSetting("companion_app_subpage_mode", "card"),
  ]) {
    const draft = new NativeLayoutDraft(saved);
    change(draft);
    assert.throws(() => setup(draft.finish(), [custom], false, 4, original), /layout changed/);
  }
  const otherSetting = new NativeLayoutDraft(saved);
  otherSetting.writeSetting("button_on_color", "00FF00");
  const combined = decodePanelPageSnapshot(setup(otherSetting.finish(), [custom], false, 4, original));
  assert.equal(combined.document.settings.button_on_color, "00FF00");
});
