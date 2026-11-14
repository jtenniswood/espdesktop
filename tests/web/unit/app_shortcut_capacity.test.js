"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
const { buildSubpageGrid } = loadTypeScriptModule("src/webserver/model/subpage.ts");
const appId = "com.openai.codex";
const selected = ["0", "3", "5", "6"];
function page() {
  const source = api.createCompanionShortcutSubpage(appId, selected);
  source.buttons.shift();
  source.order = ["B", "1", "2", "3", "4"];
  source.buttons.push({ type: "companion", entity: "shortcut.command+shift+p", label: "Custom shortcut", options: "" });
  source.order.push("5", "", "", "");
  Object.assign(source, buildSubpageGrid(source, 9, 3));
  return source;
}

test("three visible empty slots accept three app shortcuts without altering the saved page", () => {
  const source = page();
  assert.equal(source.grid.filter(slot => slot === 0).length, 3);
  const unchanged = structuredClone(source);
  for (const extra of [["7"], ["7", "2"], ["7", "2", "4"]]) {
    assert.equal(api.companionShortcutTabsFitSubpage(appId, [...selected, ...extra], source, 9), true);
    assert.deepEqual(source, unchanged, "checking capacity must not edit the saved subpage");
  }
});

test("sync invalidates cached positions before counting newly placed shortcuts", () => {
  const source = page();
  const next = [...selected, "7"];
  api.syncCompanionShortcutSubpage(appId, next, source, 9);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(appId, source), next);
  Object.assign(source, buildSubpageGrid(source, 9, 3));
  assert.equal(source.grid.filter(slot => slot > 0).length, 6);
  assert.equal(source.grid.filter(slot => slot === 0).length, 2);
});

test("capacity still reserves Back and respects custom tiles spanning multiple cells", () => {
  const source = page();
  source.buttons.push({ type: "companion", entity: "shortcut.command+q", label: "Custom wide" },
    { type: "companion", entity: "shortcut.command+w", label: "Custom" });
  source.order = ["B", "1", "5", "6w", "", "2", "3", "4", "7"];
  Object.assign(source, buildSubpageGrid(source, 9, 3));
  assert.equal(source.grid.filter(slot => slot === 0).length, 0);
  const unchanged = structuredClone(source);
  assert.equal(api.companionShortcutTabsFitSubpage(appId, [...selected, "7"], source, 9), false);
  assert.deepEqual(source, unchanged);
});


test("existing ChatGPT subpages add Usage before shortcuts once, when space permits", () => {
  const source = page();
  source.order = ["B", "1", "2", "3", "4", "", "5"];
  Object.assign(source, buildSubpageGrid(source, 9, 3));
  assert.equal(api.addAppTokenUsageCard(appId, source, 9), true);
  assert.equal(source.buttons[Number(source.order[1]) - 1].type, "token_usage");
  assert.equal(source.order[6], "5", "custom shortcut stays in its original cell");
  Object.assign(source, buildSubpageGrid(source, 9, 3));
  assert.equal(api.addAppTokenUsageCard(appId, source, 9), false);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(appId, source), selected);
  assert.equal(api.companionShortcutTabsForCapacity(selected, 4, appId).length, 2);
});

test("an existing custom tile blocks automatic insertion without changing the page", () => {
  const source = page();
  const original = structuredClone(source);
  assert.equal(api.addAppTokenUsageCard(appId, source, 9), false);
  assert.deepEqual(source, original);
});
