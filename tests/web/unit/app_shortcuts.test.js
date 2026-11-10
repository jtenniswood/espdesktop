"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");

test("Claude Desktop keeps its existing presets and exposes numbered and scoped shortcuts", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const claude = require("../../../product/v2/app_shortcuts/claude-desktop.json");
  const presets = api.companionShortcutPresetCards(claude.appId);
  assert.equal(presets.length, 93);
  assert.deepEqual(presets.slice(0, 4).map(card => card.entity),
    ["shortcut.option+space", "shortcut.command+keyslash", "shortcut.command+n", "shortcut.control+tab"]);
  assert(presets.every(card => api.companionShortcutActionIdValid(card.entity)));
  assert(!api.companionShortcutActionIdValid("shortcut.enter"));
  const keys = ["command+option+9", "command+9", "9", "shift+f6", "escape-twice"];
  const entries = [...claude.shortcuts, ...claude.claudeShortcuts];
  const ids = keys.map(key => entries.find(item => item.shortcut === key).id);
  const page = api.createCompanionShortcutSubpage(claude.appId, ids);
  assert.deepEqual(page.buttons.map(card => card.entity), keys.map(key => "shortcut." + key));
  assert.deepEqual(api.companionShortcutTabsFromSubpage(claude.appId, page), ids);
  api.replaceCompanionDefinitions([claude]);
  assert.deepEqual(api.companionShortcutPresetCards(claude.appId), presets);
});

test("Safari web apps use their own presets and keep their actual app identity", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const safari = require("../../../product/v2/app_shortcuts/safari.json");
  const webApp = require("../../../product/v2/app_shortcuts/safari-web-app.json");
  const installedId = "com.apple.Safari.WebApp.01234567-89AB-CDEF-0123-456789abcdef";
  const browserPresets = api.companionShortcutPresetCards(safari.appId);
  const webPresets = api.companionShortcutPresetCards(installedId);
  assert.equal(browserPresets.length, 22);
  assert.equal(webPresets.length, 17);
  assert(!browserPresets.some(card => card.label === "Copy Link"));
  assert.deepEqual(api.companionShortcutPresetCards("com.apple.Safari.WebApp.invalid"), []);
  assert(webPresets.every(card => api.companionShortcutActionIdValid(card.entity)));
  assert(!api.companionShortcutActionIdValid("shortcut.a"));
  const copyLink = webApp.shortcuts.find(item => item.label === "Copy Link");
  const tab = webApp.safariShortcuts.find(item => item.shortcut === "tab");
  const page = api.createCompanionShortcutSubpage(installedId, [copyLink.id, tab.id]);
  assert.deepEqual(page.buttons.map(card => card.entity), ["shortcut.command+option+c", "shortcut.tab"]);
  assert.equal(page.buttons[0].options, "app_shortcut_preset=" + installedId + "%3A" + copyLink.id);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(installedId, page), [copyLink.id, tab.id]);
  api.replaceCompanionDefinitions([safari, webApp]);
  assert.deepEqual(api.companionShortcutPresetCards(installedId), webPresets);
});

test("Athena presets use the installed Safari web app ID and preserve existing tiles", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const safari = require("../../../product/v2/app_shortcuts/safari-web-app.json");
  const athena = require("../../../product/v2/app_shortcuts/athena.json");
  const appId = "com.apple.Safari.WebApp.12345678-1234-5678-1234-567812345678";
  const otherAppId = "com.apple.Safari.WebApp.87654321-4321-8765-4321-876543218765";
  const newChat = athena.shortcuts[0];
  const copyLink = safari.shortcuts.find(item => item.label === "Copy Link");
  const page = api.createCompanionShortcutSubpage(appId, [copyLink.id]);
  page.buttons[0].label = "Saved Copy Link";
  const custom = { ...page.buttons[0], entity: "shortcut.command+shift+f", label: "My Search", options: "" };
  page.buttons.push(custom);
  page.order.push("2");

  const card = { type: "companion", entity: appId, sensor: "",
    options: "app_shortcuts,app_shortcuts_tabs=" + newChat.id };
  const savedTile = { ...page.buttons[0], entity: "shortcut.control+command+n",
    options: "app_shortcut_preset=" + appId + "%3A" + newChat.id };
  assert.equal(api.normalizeCompanionAppShortcutOptions(card), card.options);
  assert.equal(api.normalizeCompanionAppShortcutOptions(savedTile), savedTile.options);

  api.replaceCompanionDefinitions([safari, { ...athena, appId }]);
  assert.equal(api.companionShortcutFolderAppLabel(appId), "Athena");
  assert.equal(api.companionShortcutFolderAppLabel(otherAppId), "Safari Web App");
  assert.deepEqual(api.companionShortcutTabs(card), [newChat.id]);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(appId, page), [copyLink.id]);

  api.syncCompanionShortcutSubpage(appId, [copyLink.id, newChat.id], page);
  assert.equal(page.buttons[0].label, "Saved Copy Link");
  assert.equal(page.buttons[1], custom);
  assert.equal(page.buttons[2].entity, "shortcut.control+command+n");
  assert.equal(page.buttons[2].options, savedTile.options);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(appId, page), [copyLink.id, newChat.id]);
  assert.equal(api.companionShortcutPresetCards(appId).length, athena.shortcuts.length + 17);
  assert.equal(api.companionShortcutPresetCards(otherAppId).length, 17);
});

test("ChatGPT Desktop uses the installed app identifier and keeps its numbered shortcuts distinct", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const app = require("../../../product/v2/app_shortcuts/codex.json");
  const legacy = require("../../../product/v2/app_shortcuts/chatgpt.json");
  assert.equal(app.appId, "com.openai.codex");
  assert.equal(api.companionShortcutFolderAppLabel(app.appId), "ChatGPT Desktop");
  const presets = api.companionShortcutPresetCards(app.appId);
  assert.equal(presets.length, 72);
  assert.equal(api.companionShortcutPresetCards(legacy.appId).length, legacy.shortcuts.length);
  assert(presets.every(card => api.companionShortcutActionIdValid(card.entity)));
  assert(!api.companionShortcutActionIdValid("shortcut.shift+tab"));
  const keys = ["command+9", "command+option+6", "control+9", "shift+escape"];
  const entries = [...app.shortcuts, ...app.additionalShortcuts];
  const ids = keys.map(key => entries.find(item => item.shortcut === key).id);
  const page = api.createCompanionShortcutSubpage(app.appId, ids);
  assert.deepEqual(page.buttons.map(card => card.entity), keys.map(key => "shortcut." + key));
  assert.deepEqual(api.companionShortcutTabsFromSubpage(app.appId, page), ids);
  const custom = { ...page.buttons[0], entity: "shortcut.command+w", label: "My Close Card", options: "" };
  page.buttons.push(custom);
  page.order.push(String(page.buttons.length));
  assert.deepEqual(api.companionShortcutTabsFromSubpage(app.appId, page), ids);
  api.syncCompanionShortcutSubpage(app.appId, ids, page);
  assert(page.buttons.includes(custom), "a pre-existing custom shortcut must survive the new matching preset");
  api.replaceCompanionDefinitions([app]);
  assert.deepEqual(api.companionShortcutPresetCards(app.appId), presets);
  api.replaceCompanionDefinitions([{ ...app, additionalShortcuts: undefined }]);
  assert.equal(api.companionShortcutPresetCards(app.appId).length, 62);
});

test("Books presets work from both the bundled and Companion catalogues", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const books = require("../../../product/v2/app_shortcuts/books.json");
  const bundled = api.companionShortcutPresetCards(books.appId);
  assert.equal(bundled.length, 33);
  assert.deepEqual(bundled.slice(0, 4).map(card => card.entity),
    ["shortcut.right", "shortcut.left", "shortcut.function+f", "shortcut.space"]);
  assert(bundled.every(card => api.companionShortcutActionIdValid(card.entity)));
  assert(!api.companionShortcutActionIdValid("shortcut.a"));
  assert(!api.companionShortcutActionIdValid("shortcut.function+g"));
  api.replaceCompanionDefinitions([books]);
  assert.deepEqual(api.companionShortcutPresetCards(books.appId), bundled);
  api.replaceCompanionDefinitions([{ ...books, extendedShortcuts: undefined }]);
  assert.equal(api.companionShortcutPresetCards(books.appId).length, 29);
});

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
  assert.equal(options.configOptionEnabled(savedOptions, "app_icon_fill"), false);
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
  assert.equal(options.configOptionEnabled(safariOptions, "app_icon_fill"), false);

  const smallWithLabel = api.normalizeCompanionCardOptions({
    ...card,
    options: "app_bg_color=12ABEF",
  });
  assert.equal(options.configOptionEnabled(smallWithLabel, "app_hide_label"), false);
  assert.equal(options.configOptionEnabled(smallWithLabel, "app_icon_fill"), false);
});

test("legacy icon sizes clear on save while label visibility and app subpages survive", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const options = loadTypeScriptModule("src/webserver/model/config_primitives.ts");
  const card = { type: "companion", entity: "com.example.Editor", sensor: "",
    options: "app_icon_cover,app_hide_label,app_shortcuts" };
  const saved = api.normalizeCompanionCardOptions(card);
  assert.equal(options.configOptionEnabled(saved, "app_icon_cover"), false);
  assert.equal(options.configOptionEnabled(saved, "app_icon_fill"), false);
  for (const token of ["app_hide_label", "app_shortcuts"])
    assert(options.configOptionEnabled(saved, token));
  assert.equal(api.normalizeCompanionCardOptions({ ...card, options: saved }), saved);
});
