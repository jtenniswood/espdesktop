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
