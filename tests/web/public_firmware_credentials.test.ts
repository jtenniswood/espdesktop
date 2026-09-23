import { createPublicFirmwareInstallFeature } from "../../src/webserver/application/public_firmware_install";
import { createDeviceApi } from "../../src/webserver/api/device_api";
import { initializeAppState } from "../../src/webserver/state/app_instance";
import { initializeDeviceConfig } from "../../src/webserver/device_config";
function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`);
}
export async function runPublicFirmwareCredentialsTest() {
  Object.assign(globalThis, {
    __ESPDESKTOP_DEFAULT_DEVICE_ID__: "test",
    __ESPDESKTOP_DEVICE_PROFILES__: { test: { slots: 12, cols: 4, rows: 3 } },
    __ESPDESKTOP_TIMEZONE_OPTIONS__: [],
  });
  await initializeDeviceConfig();
  initializeAppState();
  const calls: Array<{url: string; init: any}> = [];
  const api = createDeviceApi(async (url, init) => {
    calls.push({ url, init });
    return { ok: url !== "/update", status: url === "/update" ? 400 : 200,
      json: async () => ({}), blob: async () => new Blob(["firmware"]), text: async () => "test upload rejected" };
  });
  const noop = () => {};
  const info = { latest_version: "1.0.0", ota_url: "https://jtenniswood.github.io/espdesktop/firmware/test.ota.bin" };
  const feature = createPublicFirmwareInstallFeature(api, "test", {
    selectedInfo: () => info, setPublicVersions: noop, infoForVersion: () => info,
    setPublicInfo: noop, clearWebOtaFallback: noop, renderStatus: noop,
    startInstallRefresh: noop, stopInstallRefresh: noop,
  } as any, { setConfigLocked: noop, showBanner: noop }, {
    getJsonQuietly: async (_url: any, _callback: any, options: any) => equal(options.credentials, "omit"),
  }, { connect: noop });
  equal(await feature.installPublicFirmwareViaWebOta(info), false);
  equal(calls[0]?.url, info.ota_url);
  equal(calls[0]?.init.credentials, "omit");
  equal(calls[1]?.url, "/update");
  equal(calls[1]?.init.credentials, "include");
  equal(calls[1]?.init.method, "POST");
}
