"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");

test("file-defined apps and stable shortcut IDs drive subpages without code registration", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const app = {
    version: 1, appId: "org.example.Editor", label: "Example Editor", catalog: true,
    shortcuts: [
      { id: "12", label: "New", shortcut: "command+n", icon: "Plus" },
      { id: "3", label: "Close", shortcut: "command+w", icon: "Close" },
    ],
  };
  api.COMPANION_SHORTCUT_APPS.push(app);
  const card = { type: "companion", entity: app.appId, sensor: "", options: "app_shortcuts" };
  assert(api.companionAppShortcutFolderEnabled(card));
  assert.equal(api.companionShortcutFolderAppLabel(app.appId), "Example Editor");
  assert.deepEqual(api.companionShortcutDefaultTabs(app.appId), ["12", "3"]);
  const page = api.createCompanionShortcutSubpage(app.appId, ["3", "12"]);
  assert.deepEqual(page.buttons.map(card => card.entity), ["shortcut.command+w", "shortcut.command+n"]);
  assert.equal(page.buttons[1].options, "app_shortcut_preset=org.example.Editor%3A12");
  page.buttons[1].label = "My custom label";
  app.shortcuts.reverse();
  assert.deepEqual(api.companionShortcutTabsFromSubpage(app.appId, page), ["3", "12"]);
  api.setCompanionShortcutTabs(card, ["12"]);
  assert.deepEqual(api.companionShortcutTabs(card), ["12"]);
  api.syncCompanionShortcutSubpage(app.appId, ["12"], page);
  assert.equal(page.buttons[0].label, "My custom label");
  assert.equal(page.buttons[0].entity, "shortcut.command+n");
  assert.equal(api.normalizeCompanionAppShortcutOptions(page.buttons[0]), "app_shortcut_preset=org.example.Editor%3A12");
});

test("saved Companion app cards retain label and icon size options", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const options = loadTypeScriptModule("src/webserver/model/config_primitives.ts");
  const codec = require("node:fs").readFileSync(
    require("node:path").resolve(__dirname, "../../../src/webserver/application/config_codec.ts"),
    "utf8",
  );
  const card = {
    type: "companion",
    entity: "com.example.Editor",
    sensor: "",
    options: "app_hide_label,app_icon_fill,app_bg_color=12abef",
  };

  const savedOptions = api.normalizeCompanionCardOptions(card);
  assert.equal(options.configOptionEnabled(savedOptions, "app_hide_label"), true);
  assert.equal(options.configOptionEnabled(savedOptions, "app_icon_fill"), true);
  assert.equal(options.configOptionValue(savedOptions, "app_bg_color"), "12ABEF");
  assert.equal(api.normalizeCompanionCardOptions({ ...card, options: savedOptions }), savedOptions);
  assert.match(codec, /normalizeCompanionCardOptions\(/);

  const safariOptions = api.normalizeCompanionCardOptions({
    type: "companion",
    entity: "com.apple.Safari",
    sensor: "",
    options: "app_shortcuts,app_hide_label,app_icon_fill",
  });
  assert.equal(options.configOptionEnabled(safariOptions, "app_shortcuts"), true);
  assert.equal(options.configOptionEnabled(safariOptions, "app_hide_label"), true);
  assert.equal(options.configOptionEnabled(safariOptions, "app_icon_fill"), true);

  const smallWithLabel = api.normalizeCompanionCardOptions({
    ...card,
    options: "app_bg_color=12ABEF",
  });
  assert.equal(options.configOptionEnabled(smallWithLabel, "app_hide_label"), false);
  assert.equal(options.configOptionEnabled(smallWithLabel, "app_icon_fill"), false);
});
