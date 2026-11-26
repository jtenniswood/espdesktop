"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");

test("Windows app defaults survive loading shortcuts after the app index", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const card = { type: "companion", entity: "windows.chrome", options: "app_shortcuts" };
  const indexed = { version: 1, appId: card.entity, label: "Google Chrome", catalog: false, shortcuts: [] };
  api.replaceCompanionDefinitions([indexed]);
  assert.deepEqual(api.companionShortcutTabs(card), []);
  card.options = api.normalizeCompanionAppShortcutOptions(card);
  assert.equal(card.options, "app_shortcuts");

  const { shortcuts } = require("../../../product/v2/app_shortcuts/platforms/windows/google-chrome.json");
  api.applyCompanionShortcutApplication({ ...indexed,
    shortcuts: shortcuts.slice(0, 6),
    defaultShortcutIds: shortcuts.slice(0, 6).map(shortcut => shortcut.id),
    moreShortcuts: shortcuts.slice(6),
  });
  const expected = shortcuts.slice(0, 7).map(shortcut => shortcut.id);
  assert.deepEqual(api.companionShortcutTabs(card), expected);
  const page = api.createCompanionShortcutSubpage(card.entity, api.companionShortcutTabs(card));
  assert.deepEqual(api.companionShortcutTabsFromSubpage(card.entity, page), expected);

  api.setCompanionShortcutTabs(card, []);
  card.options = api.normalizeCompanionAppShortcutOptions(card);
  assert.equal(card.options, "app_shortcuts,app_shortcuts_tabs=none");
  assert.deepEqual(api.companionShortcutTabs(card), []);
});

test("the shortcut catalogue combines bundled and live presets and preserves saved live presets", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const safari = require("../../../product/v2/app_shortcuts/safari.json");
  const live = { ...safari, appId: "org.example.Editor", label: "Example Editor", catalog: false,
    shortcuts: [{ id: "12", label: "New", shortcut: "command+n", icon: "Plus" }], safariShortcuts: undefined };
  const card = { type: "companion", entity: "shortcut.command+n", options: "app_shortcut_preset=org.example.Editor%3A12" };
  assert.equal(api.normalizeCompanionAppShortcutOptions(card), card.options, "keep the preset before its definition arrives");
  const updatedSafari = { ...safari, label: "Updated Safari" };
  const chatGPT = require("../../../product/v2/app_shortcuts/codex.json");
  const classic = require("../../../product/v2/app_shortcuts/chatgpt.json");
  assert(api.replaceCompanionDefinitions([updatedSafari, live, chatGPT, classic]));
  const apps = new Map(api.companionShortcutCatalogApps().map(app => [app.appId, app.label]));
  assert.equal(apps.get(safari.appId), updatedSafari.label);
  assert.equal(apps.get(live.appId), live.label);
  assert.equal(apps.get("com.tinyspeck.slackmacgap"), "Slack");
  assert.equal(apps.get(chatGPT.appId), "ChatGPT");
  assert(!apps.has(classic.appId));
  assert(!apps.has("io.github.jtenniswood.athena"), "Athena uses an installed web app ID");
  assert.equal(api.companionShortcutPresetCards(live.appId)[0].options, card.options);
  assert.equal(api.replaceCompanionDefinitions([updatedSafari, live, chatGPT, classic]), false,
    "reloading the same catalogue leaves it unchanged");
});

test("Google Meet presets are offered under the installed app ID", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const template = require("../../../product/v2/app_shortcuts/google-meet.json");
  const appId = "com.google.Chrome.app.abcdefghijklmnopabcdefghijklmnop";
  const installed = { ...template, appId, label: "Google Meet (Chrome)" };
  api.replaceCompanionDefinitions([template, installed]);
  const choices = api.companionShortcutCatalogApps({ savedAppId: template.appId });
  assert(!choices.some(app => app.appId === template.appId));
  assert.equal(choices.find(app => app.appId === appId)?.label, installed.label);
  const page = api.createCompanionShortcutSubpage(appId);
  assert.equal(page.buttons.length, 8);
  assert.equal(page.buttons[0].options, "app_shortcut_preset=" + appId + "%3A100");
  assert(page.buttons.some(card => card.entity === "shortcut.scoped.c"));
});

test("Claude Desktop keeps its existing presets and exposes numbered and scoped shortcuts", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const claude = require("../../../product/v2/app_shortcuts/claude-desktop.json");
  const presets = api.companionShortcutPresetCards(claude.appId);
  assert.equal(presets.length, 93 + claude.moreShortcuts.length);
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
  assert.equal(browserPresets.length, 22 + safari.moreShortcuts.length);
  assert.equal(webPresets.length, 17 + webApp.moreShortcuts.length);
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
  assert.deepEqual(api.companionShortcutDefaultTabs(appId), athena.defaultShortcutIds);
  assert.deepEqual(api.companionShortcutDefaultTabs(otherAppId), safari.defaultShortcutIds);
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
  assert.equal(api.companionShortcutPresetCards(appId).length, athena.shortcuts.length + athena.moreShortcuts.length + 17 + safari.moreShortcuts.length);
  assert.equal(api.companionShortcutPresetCards(otherAppId).length, 17 + safari.moreShortcuts.length);

  const { defaultShortcutIds, moreShortcuts, ...legacyAthena } = athena;
  api.replaceCompanionDefinitions([safari, { ...legacyAthena, appId }]);
  assert.deepEqual(api.companionShortcutDefaultTabs(appId), defaultShortcutIds);
});

test("Twitch presets target the installed Safari web app", async () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const { appId: templateId, moreShortcuts, ...twitch } = require("../../../product/v2/app_shortcuts/twitch.json");
  const appId = "com.apple.Safari.WebApp.12345678-1234-5678-1234-567812345678";
  assert(!api.companionShortcutCatalogApps({ savedAppId: templateId }).some(app => app.appId === templateId));
  const { createCompanionCatalogue } = loadTypeScriptModule("src/webserver/api/companion_catalogue.ts");
  const catalogue = createCompanionCatalogue(async () => ({
    ok: true,
    json: async () => ({
      page: 0, hasMore: false,
      definitions: [
        { kind: "application", definition: { ...twitch, appId } },
        { kind: "application", definition: { appId, shortcuts: [], moreShortcuts } },
      ],
    }),
  }));
  assert(api.replaceCompanionDefinitions((await catalogue.loadDefinitions()).applications));
  const page = api.createCompanionShortcutSubpage(appId);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(appId, page), twitch.defaultShortcutIds);
  assert.equal(page.buttons[0].entity, "shortcut.scoped.k");
  assert.equal(page.buttons[0].options, "app_shortcut_preset=" + appId + "%3A100");
  assert(!api.companionShortcutPresetCards("com.apple.Safari").some(card => card.label === "Clip Live Stream"));
});

test("ChatGPT Desktop subpages use the curated catalogue and preserve custom cards", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const app = require("../../../product/v2/app_shortcuts/codex.json");
  const legacy = require("../../../product/v2/app_shortcuts/chatgpt.json");
  assert.equal(app.appId, "com.openai.codex");
  assert.equal(api.companionShortcutFolderAppLabel(app.appId), "ChatGPT Desktop");
  const presets = api.companionShortcutPresetCards(app.appId);
  assert.equal(presets.length, app.shortcuts.length + app.moreShortcuts.length);
  assert.equal(api.companionShortcutPresetCards(legacy.appId).length, legacy.shortcuts.length + legacy.moreShortcuts.length);
  assert(presets.every(card => api.companionShortcutActionIdValid(card.entity)));
  assert(!api.companionShortcutActionIdValid("shortcut.shift+tab"));
  const ids = ["32", "17", "62", "97"];
  const page = api.createCompanionShortcutSubpage(app.appId, ids);
  assert.deepEqual(page.buttons.map(card => card.entity), [
    "shortcut.option+space", "shortcut.control+shift+tab", "shortcut.command+option+6", "shortcut.scoped.up",
  ]);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(app.appId, page), ids);
  const custom = { ...page.buttons[0], entity: "shortcut.command+w", label: "My Close Card", options: "" };
  const savedAlternate = {
    ...page.buttons[0],
    entity: "shortcut.command+shift+o",
    label: "New Chat",
    options: "app_shortcut_preset=com.openai.codex%3A87",
  };
  page.buttons.push(custom, savedAlternate);
  page.order.push(String(page.buttons.length - 1), String(page.buttons.length));
  assert.deepEqual(api.companionShortcutTabsFromSubpage(app.appId, page), ids);
  api.syncCompanionShortcutSubpage(app.appId, ids, page);
  assert(page.buttons.includes(custom), "a pre-existing custom shortcut must survive the new matching preset");
  assert(page.buttons.includes(savedAlternate), "a saved New Chat tile must survive removal of the alternate preset");
  api.replaceCompanionDefinitions([app]);
  assert.deepEqual(api.companionShortcutPresetCards(app.appId), presets);
});

test("Books presets work from both the bundled and Companion catalogues", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const books = require("../../../product/v2/app_shortcuts/books.json");
  const bundled = api.companionShortcutPresetCards(books.appId);
  assert.equal(bundled.length, 33 + books.moreShortcuts.length);
  assert.deepEqual(bundled.slice(0, 4).map(card => card.entity),
    ["shortcut.right", "shortcut.left", "shortcut.function+f", "shortcut.space"]);
  assert(bundled.every(card => api.companionShortcutActionIdValid(card.entity)));
  assert(!api.companionShortcutActionIdValid("shortcut.a"));
  assert(!api.companionShortcutActionIdValid("shortcut.function+g"));
  api.replaceCompanionDefinitions([books]);
  assert.deepEqual(api.companionShortcutPresetCards(books.appId), bundled);
  api.replaceCompanionDefinitions([{ ...books, extendedShortcuts: undefined }]);
  assert.equal(api.companionShortcutPresetCards(books.appId).length, 29 + books.moreShortcuts.length);
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

test("every packed hosted shortcut preserves the authored ID, keys, icon and label", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const directory = path.resolve(__dirname, "../../../product/v2/app_shortcuts");
  const { bundledExpandedShortcuts } = loadTypeScriptModule("src/webserver/application/companion_shortcut_data.ts");
  const { companionShortcutActionIdValid, companionShortcutPresetCards, companionShortcutDefaultTabs,
    createCompanionShortcutSubpage, companionShortcutTabsForCapacity, companionShortcutTabsFromSubpage,
    replaceCompanionDefinitions } =
    loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const canonical = key => key.split("~").map(stroke => {
    const parts = stroke.split("+");
    const last = parts.pop();
    return [...parts.sort(), last].join("+");
  }).join("~");
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
  for (const { path: filename } of manifest.entries.filter(entry => entry.offline)) {
    const app = JSON.parse(fs.readFileSync(path.join(directory, filename), "utf8"));
    const expected = app.moreShortcuts ?? [];
    const decoded = bundledExpandedShortcuts(app.appId);
    assert.deepEqual(decoded.map(item => ({ ...item, shortcut: canonical(item.shortcut) })),
      expected.map(item => ({ ...item, shortcut: canonical(item.shortcut) })), filename);
    assert(decoded.every(item => companionShortcutActionIdValid("shortcut." + item.shortcut)), filename);
    const defaults = companionShortcutDefaultTabs(app.appId);
    if (app.appId === "com.apple.finder") {
      assert.deepEqual(defaults, [], filename);
    } else {
      assert(app.defaultShortcutIds?.length <= 8, filename);
      assert.deepEqual(defaults, app.defaultShortcutIds, filename);
      assert.equal(createCompanionShortcutSubpage(app.appId).buttons.length, defaults.length, filename);
    }
  }

  const finalCut = require("../../../product/v2/app_shortcuts/final-cut-pro.json");
  const { defaultShortcutIds, moreShortcuts, ...starter } = finalCut;
  replaceCompanionDefinitions([starter]);
  const last = moreShortcuts.at(-1);
  assert(companionShortcutPresetCards(finalCut.appId).length > 300, "a legacy Companion must not hide bundled choices");
  const defaults = companionShortcutDefaultTabs(finalCut.appId);
  assert.deepEqual(defaults, defaultShortcutIds);
  const compactPage = createCompanionShortcutSubpage(finalCut.appId, companionShortcutTabsForCapacity(defaults, 4));
  assert.deepEqual(compactPage.order, ["B", "1", "2", "3"]);
  assert.deepEqual(compactPage.buttons.map(card => card.label), ["Play/Pause", "Blade at Playhead", "Add marker"]);
  assert(!defaults.includes(last.id), "extra presets remain available in the picker");
  const legacyPage = createCompanionShortcutSubpage(finalCut.appId, ["0"]);
  legacyPage.buttons[0].options = "";
  assert.deepEqual(companionShortcutTabsFromSubpage(finalCut.appId, legacyPage), ["0"]);
  replaceCompanionDefinitions([{ ...starter, defaultShortcutIds: [last.id, "0", "999"] }]);
  assert.deepEqual(companionShortcutDefaultTabs(finalCut.appId), [last.id, "0"]);
  const page = createCompanionShortcutSubpage(finalCut.appId, [last.id]);
  assert.deepEqual(companionShortcutTabsFromSubpage(finalCut.appId, page), [last.id]);
  assert.equal(page.buttons[0].entity, "shortcut." + last.shortcut);
  assert(!companionShortcutActionIdValid("shortcut.scoped.a~b~c~d"));
  assert(!companionShortcutActionIdValid("shortcut.scoped.command+command+a"));
});


test("saved expanded presets can still be edited and reordered without their catalogue", () => {
  const api = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const appId = "com.example.Offline";
  const saved = {
    type: "companion", entity: "shortcut.scoped.tab", label: "My custom name", icon: "Arrow Right",
    options: "app_shortcut_preset=com.example.Offline%3A901",
  };
  const parent = {
    type: "companion", entity: appId, options: "app_shortcuts,app_shortcuts_tabs=901",
  };
  const page = { order: ["B", "1"], buttons: [saved] };
  assert(api.editableAppShortcutPage(parent));
  assert.deepEqual(api.companionShortcutTabDefinitions(appId, page), [{ value: "901", label: "My custom name" }]);
  assert.deepEqual(api.companionShortcutTabsFromSubpage(appId, page), ["901"]);
  assert.deepEqual(api.companionShortcutTabs(parent), ["901"]);
  assert.deepEqual(api.syncCompanionShortcutSubpage(appId, ["901"], page, 3).buttons, [saved]);
  assert.deepEqual(api.syncCompanionShortcutSubpage(appId, [], page, 3).buttons, []);
});
