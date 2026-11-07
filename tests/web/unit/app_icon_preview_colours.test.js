"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");

test("app icons keep the theme unless a background was explicitly chosen", async (t) => {
  const { companionAppIconPreviewData } = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  const { COMPANION_APP_ICON_SIDE: side } = loadTypeScriptModule("src/webserver/generated/companion_capabilities.ts");
  // Include colour headers from older firmware: the default must still ignore them.
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    headers: new Headers({
      "X-EspDesktop-Companion-Online": "true",
      "X-EspDesktop-App-Icon-Palette": "1565c0,7985cb",
    }),
    arrayBuffer: async () => new ArrayBuffer(side * side * 3),
  }));
  const document = {
    createElement: () => ({
      getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(side * side * 4) }),
        putImageData() {},
      }),
      toDataURL: () => "data:image/png;base64,icon",
    }),
  };
  const defaultIcon = await companionAppIconPreviewData("com.example.Default", "", document);
  assert.ok(defaultIcon);
  assert.equal(defaultIcon.defaultColor, "");
  assert.equal(defaultIcon.activeColor, "");
  const customIcon = await companionAppIconPreviewData("com.example.Custom", "1565C0", document);
  assert.equal(customIcon.defaultColor, "1565c0");
  assert.equal(customIcon.activeColor, "7985cb");
});

function mockStorage(t, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else delete globalThis.localStorage;
  });
}
function iconDocument(side) {
  return { createElement: () => ({ getContext: () => ({
    createImageData: () => ({ data: new Uint8ClampedArray(side * side * 4) }), putImageData() {},
  }), toDataURL: () => "data:image/png;base64,icon" }) };
}
function iconResponse(side, online = true) {
  return { ok: true, headers: new Headers({ "X-EspDesktop-Companion-Online": String(online) }),
    arrayBuffer: async () => new ArrayBuffer(side * side * 3) };
}

test("icon cache shares requests, survives reloads, and respects catalogue/manual invalidation", async t => {
  const storage = new Map();
  mockStorage(t, {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  });
  const { COMPANION_APP_ICON_SIDE: side } = loadTypeScriptModule("src/webserver/generated/companion_capabilities.ts");
  const fetchMock = t.mock.method(globalThis, "fetch", async () => iconResponse(side));
  let ui = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  const document = iconDocument(side);
  const context = { name: "catalogue", value: "first-hash" };
  ui.clearCompanionAppIconPreviewCache(context);
  const first = ui.companionAppIconPreviewData("app", "", document);
  const second = ui.companionAppIconPreviewData("app", "", document);
  assert.equal(first, second);
  await first;
  assert.equal(fetchMock.mock.callCount(), 1);
  ui = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  assert.equal(ui.clearCompanionAppIconPreviewCache(context), false);
  assert.ok(await ui.companionAppIconPreviewData("app", "", document));
  assert.equal(fetchMock.mock.callCount(), 1, "page reload reuses browser storage");
  ui.clearCompanionAppIconPreviewCache({ name: "catalogue", value: "new-hash" });
  await ui.companionAppIconPreviewData("app", "", document);
  assert.equal(fetchMock.mock.callCount(), 2);
  ui.clearCompanionAppIconPreviewCache();
  ui = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  await ui.companionAppIconPreviewData("app", "", document);
  assert.equal(fetchMock.mock.callCount(), 3, "manual clear removes persisted copies");
});

test("offline icons and failures are briefly cached even with storage disabled", async t => {
  mockStorage(t, { getItem() { throw Error("disabled"); }, setItem() { throw Error("disabled"); } });
  const { COMPANION_APP_ICON_SIDE: side } = loadTypeScriptModule("src/webserver/generated/companion_capabilities.ts");
  const ui = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => iconResponse(side, false));
  const document = iconDocument(side);
  await ui.companionAppIconPreviewData("offline", "", document);
  await ui.companionAppIconPreviewData("offline", "", document);
  assert.equal(fetchMock.mock.callCount(), 1);
  now += 30001;
  await ui.companionAppIconPreviewData("offline", "", document);
  assert.equal(fetchMock.mock.callCount(), 2);
  fetchMock.mock.mockImplementation(async () => ({ ok: false }));
  assert.equal(await ui.companionAppIconPreviewData("missing", "", document), null);
  await ui.companionAppIconPreviewData("missing", "", document);
  assert.equal(fetchMock.mock.callCount(), 3);
  now += 5001;
  await ui.companionAppIconPreviewData("missing", "", document);
  assert.equal(fetchMock.mock.callCount(), 4);
});

test("clearing during a download cannot repopulate the cache with an old result", async t => {
  const { COMPANION_APP_ICON_SIDE: side } = loadTypeScriptModule("src/webserver/generated/companion_capabilities.ts");
  let complete;
  const fetchMock = t.mock.method(globalThis, "fetch", () => new Promise(resolve => { complete = resolve; }));
  const ui = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  const pending = ui.companionAppIconPreviewData("app", "", iconDocument(side));
  ui.clearCompanionAppIconPreviewCache();
  complete(iconResponse(side));
  await pending;
  fetchMock.mock.mockImplementation(async () => iconResponse(side));
  await ui.companionAppIconPreviewData("app", "", iconDocument(side));
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("stored icon previews expire after a day and stay within the 64-entry limit", async t => {
  const storage = new Map();
  mockStorage(t, { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });
  const ui = loadTypeScriptModule("src/webserver/application/preview_render.ts");
  const { COMPANION_APP_ICON_SIDE: side } = loadTypeScriptModule("src/webserver/generated/companion_capabilities.ts");
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => iconResponse(side));
  for (let index = 0; index < 65; index++)
    await ui.companionAppIconPreviewData("app" + index, "", iconDocument(side));
  assert.equal(JSON.parse([...storage.values()][0]).entries.length, 64);
  await ui.companionAppIconPreviewData("app64", "", iconDocument(side));
  assert.equal(fetchMock.mock.callCount(), 65);
  now += 24 * 60 * 60 * 1000 + 1;
  await ui.companionAppIconPreviewData("app64", "", iconDocument(side));
  assert.equal(fetchMock.mock.callCount(), 66);
});
