"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const {
  FIRST_RUN_COMPLETE, needsFirstRunSetup, firstRunApplications, firstRunDocument,
} = loadTypescriptTest("src/webserver/application/first_run_setup.ts");
const empty = () => ({ deviceProfile: "test", buttons: {}, subpages: {}, settings: { button_on_color: "FF0000" } });
const safari = { id: "com.apple.Safari", label: "Safari; Personal" };
const custom = { id: "org.example.custom", label: "Custom" };
const codec = { serializeButtonConfig: JSON.stringify, serializeSubpageConfig: JSON.stringify };

test("first-run setup only starts on an unconfigured display", () => {
  assert(needsFirstRunSetup(empty()));
  for (const existing of [
    { buttons: { 1: "com.apple.Safari;Safari" } },
    { subpages: { 1: "B,1|saved" } },
    { settings: { button_order: "1" } },
    { settings: { special_page: "saved" } },
    { settings: { [FIRST_RUN_COMPLETE]: "1" } },
  ]) assert.equal(needsFirstRunSetup({ ...empty(), ...existing }), false);
});

test("onboarding lists unique applications, excluding retired web apps and other actions", () => {
  assert.deepEqual(firstRunApplications([safari, safari, custom,
    { id: "webapp.notion", label: "Notion" },
    ...["folder.abc", "media.play_pause", "shortcut.command+k", "system.cpu", "window.left"].map(id => ({ id, label: id })),
  ]).map(app => app.id), [custom.id, safari.id]);
});

test("setup respects home and subpage capacity and preserves unrelated settings", () => {
  const original = empty();
  const before = JSON.stringify(original);
  const result = firstRunDocument(original, [safari, custom], true, 4, codec);
  assert.equal(JSON.stringify(original), before, "the source document stays unchanged");
  assert.equal(result.settings.button_order, "1,2");
  assert.equal(result.settings.button_on_color, "FF0000");
  assert.equal(result.settings[FIRST_RUN_COMPLETE], "1");
  assert.equal(JSON.parse(result.buttons[1]).label, safari.label);
  assert(JSON.parse(result.buttons[1]).options.includes("app_shortcuts"));
  assert.equal(JSON.parse(result.buttons[2]).options, "", "unknown apps remain launch cards");
  const page = JSON.parse(result.subpages[1]);
  assert.equal(page.order[0], "B");
  assert.equal(page.buttons.length, 3, "Back reserves one of the four cards");
  assert.equal(result.subpages[2], undefined);
  assert.throws(() => firstRunDocument(empty(), [safari, custom], false, 1, codec));
  assert.throws(() => firstRunDocument(empty(), [safari, safari], false, 4, codec));
  assert.throws(() => firstRunDocument(result, [safari], false, 4, codec), /already has a layout/);
});

test("skip saves completion without creating cards and launch-only creates no subpages", () => {
  const skipped = firstRunDocument(empty(), [], false, 4, codec);
  assert.deepEqual(skipped.buttons, {});
  assert.equal(needsFirstRunSetup(skipped), false);
  const launchOnly = firstRunDocument(empty(), [safari], false, 4, codec);
  assert.deepEqual(launchOnly.subpages, {});
  assert.equal(JSON.parse(launchOnly.buttons[1]).options, "");
});

test("settings can replace a reviewed layout while preserving other settings and rejecting concurrent edits", () => {
  const saved = firstRunDocument(empty(), [safari, custom], true, 4, codec);
  saved.settings.special_page = "existing special page";
  const original = JSON.stringify(saved);
  const replacement = firstRunDocument(saved, [custom], false, 4, codec, saved);
  assert.equal(JSON.stringify(saved), original);
  assert.equal(Object.keys(replacement.buttons).length, 1);
  assert.equal(JSON.parse(replacement.buttons[1]).entity, custom.id);
  assert.deepEqual(replacement.subpages, {});
  assert.equal(replacement.settings.special_page, saved.settings.special_page);
  assert.equal(replacement.settings.button_on_color, "FF0000");
  for (const changed of [
    { ...saved, buttons: { ...saved.buttons, 3: "new card" } },
    { ...saved, subpages: { 1: "changed shortcuts" } },
    { ...saved, settings: { ...saved.settings, button_order: "2,1" } },
  ]) assert.throws(() => firstRunDocument(changed, [custom], false, 4, codec, saved), /layout changed/);
});
