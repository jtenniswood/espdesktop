#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium, webkit } = require("playwright");
const { loadTypeScriptModule } = require("./load_typescript_module");
const { freshWebOutputDir } = require("./web_source");

const ROOT = path.resolve(__dirname, "..");
const {
  createPanelConfigBackupPayload,
  decodePanelConfig,
  encodePanelConfig,
  activeCardColor,
  decodeConfigField,
  parseRawButtonConfig,
  setConfigOptionValue,
} = loadTypeScriptModule(path.join(ROOT, "src", "webserver", "model", "index.ts"));
const { encodePanelPageDocument, decodePanelPageSnapshot } = loadTypeScriptModule("src/webserver/model/panel_config_conversion.ts");
const MANIFEST_PATH = path.join(ROOT, "devices", "manifest.json");
const WEB_OUTPUT_DIR = freshWebOutputDir();
const FAILURE_DIR = path.join(ROOT, ".cache", "web-browser-smoke");

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function parseAspect(aspect) {
  const parts = String(aspect || "").split("/");
  assert.strictEqual(parts.length, 2, `invalid web screen aspect: ${aspect}`);
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  assert(width > 0 && height > 0, `invalid web screen aspect: ${aspect}`);
  return { width, height, ratio: width / height };
}

function orientationFor(ratio) {
  if (Math.abs(ratio - 1) < 0.05) return "square";
  return ratio > 1 ? "landscape" : "portrait";
}

function viewportFor(ratio) {
  const orientation = orientationFor(ratio);
  if (orientation === "square") return { width: 1000, height: 900 };
  if (orientation === "portrait") return { width: 1100, height: 1000 };
  return { width: 1280, height: 900 };
}

function casesFromManifest() {
  const manifest = readManifest();
  const sharedFourInchSquareSlugs = new Set([
    "esp32-p4-86",
    "guition-esp32-s3-4848s040",
  ]);
  const releaseDevices = new Set(require("../product/release_devices.json").devices);
  const profiles = Object.entries(manifest.devices || {});
  profiles.sort(([left], [right]) => Number(releaseDevices.has(right)) - Number(releaseDevices.has(left)));
  return profiles.map(([slug, device]) => {
    const aspect = parseAspect(
      device.web && device.web.screen && device.web.screen.aspect,
    );
    const orientation = orientationFor(aspect.ratio);
    return {
      name: `${orientation}-${slug}`,
      slug,
      slots: device.slots,
      viewport: viewportFor(aspect.ratio),
      companionSupported: !!(device.capabilities && device.capabilities.companion),
      mediaCoverArtSupported: !(
        device.web &&
        Array.isArray(device.web.disabledCardTypes) &&
        device.web.disabledCardTypes.includes("media_cover_art")
      ),
      minVisibleCards: device.web && device.web.infoOnly ? 1 : 4,
      exerciseInteractions: slug === "guition-esp32-p4-jc8012p4a1",
      exerciseDeviceMocks: sharedFourInchSquareSlugs.has(slug),
    };
  });
}

const CASES = casesFromManifest();
const ACTIVE_CASES = process.env.ESPDESKTOP_BROWSER_PROFILE
  ? CASES.filter((testCase) => testCase.slug === process.env.ESPDESKTOP_BROWSER_PROFILE)
  : CASES;
assert(
  ACTIVE_CASES.length > 0,
  `Unknown browser profile: ${process.env.ESPDESKTOP_BROWSER_PROFILE || "(none)"}`,
);

const BUTTON_FIXTURES = [
  "light.kitchen;Kitchen;Lightbulb;Lightbulb",
  "sensor.energy;Energy;Gauge;Auto;sensor.energy;W;sensor;0",
  "climate.hall;Hall;Thermostat;Auto;;;climate;;",
  "media_player.living;Living Artwork;Auto;Auto;cover_art;;media;;cover_art_details",
  "cover.office_blind;Blind;Blinds Open;Blinds;modal;;cover;;cover_tabs=controls%7Cposition%7Ctilt",
  "alarm_control_panel.house;Alarm;Security;Auto;;;alarm;;",
];

const COPY_SHORTCUT = "shortcut.command+c;Copy;Shortcut Command;Auto;;;companion";

function nativeConfigState(slug) {
  const buttons = {};
  BUTTON_FIXTURES.forEach((value, index) => { buttons[index + 1] = value; });
  buttons[2] = COPY_SHORTCUT;
  buttons[3] = ";Rooms;Home;Auto;;;subpage";
  return {
    document: {
      deviceProfile: slug,
      buttons,
      subpages: {
        3: "~B,1|,light.kitchen,Kitchen,Lightbulb,Lightbulb",
      },
      settings: { button_order: "1,2,3w,4,5,6" },
    },
    generation: 1,
    puts: [],
    requests: [],
  };
}

async function assertSubpageBackCard(page, label, nativeState) {
  await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
  await page.waitForSelector(".sp-back-btn");
  assert(await page.locator(".sp-topbar").evaluate(el => el.classList.contains("sp-hidden")),
    `${label}: subpages have no clock bar`);
  assert.strictEqual(await page.locator(".sp-clockbar-subpage-title").count(), 0,
    `${label}: subpages have no top label`);
  assert.strictEqual(await page.locator(".sp-back-btn .mdi-chevron-left").count(), 1,
    `${label}: regular subpages retain their Back arrow`);
  const initialColor = await page.locator(".sp-back-btn").evaluate(el => getComputedStyle(el).backgroundColor);
  await page.locator(".sp-back-btn").click({ position: { x: (await page.locator(".sp-back-btn").boundingBox()).width - 2, y: (await page.locator(".sp-back-btn").boundingBox()).height / 2 } });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Custom Colours", exact: true }).click();
  await page.getByRole("button", { name: "Set colour to yellow", exact: true }).click();
  await page.waitForFunction(() => {
    const back = document.querySelector(".sp-back-btn");
    return getComputedStyle(back).backgroundColor === "rgb(238, 209, 70)" &&
      getComputedStyle(back.querySelector(".sp-btn-label")).color === "rgb(33, 33, 33)" &&
      getComputedStyle(back.querySelector(".sp-btn-icon")).color === "rgb(33, 33, 33)";
  });
  await waitForNativeState(nativeState,
    () => nativeState.document.subpages[3].includes("B=:EED146"), `${label}: save back colour`);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".sp-back-btn .sp-back-hit").click();
  await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
  assert.strictEqual(await page.locator(".sp-back-btn").evaluate(el => getComputedStyle(el).backgroundColor),
    "rgb(238, 209, 70)", `${label}: reopening subpage preserves its back colour`);
  await page.locator(".sp-back-btn").click({ position: { x: (await page.locator(".sp-back-btn").boundingBox()).width - 2, y: (await page.locator(".sp-back-btn").boundingBox()).height / 2 } });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Custom Colours", exact: true }).click();
  const custom = page.locator(".sp-settings-modal").getByLabel("Choose custom colour", { exact: true });
  await custom.evaluate(input => {
    input.value = "#123abc";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForNativeState(nativeState,
    () => nativeState.document.subpages[3].includes("B=:123ABC"), `${label}: save custom back colour`);
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".sp-back-btn")).backgroundColor === "rgb(18, 58, 188)");
  await page.getByRole("button", { name: "Reset colours to defaults", exact: true }).click();
  await waitForNativeState(nativeState,
    () => !nativeState.document.subpages[3].includes("B=:"), `${label}: reset back colour`);
  assert.strictEqual(await page.locator(".sp-back-btn").evaluate(el => getComputedStyle(el).backgroundColor),
    initialColor, `${label}: reset restores the theme colour`);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".sp-back-btn .sp-back-hit").click();
  await page.waitForSelector(".sp-clockbar-subpage-title", { state: "detached" });
}

function htmlFor(slug, embeddedFallback = false) {
  const scripts = embeddedFallback
    ? [
        `<script src="/webserver/embedded/www.js?device=${slug}"></script>`,
        `<script src="/webserver/www.js?device=${slug}&v=v2.8.0"></script>`,
      ]
    : [`<script src="/webserver/www.js?device=${slug}"></script>`];
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${slug}</title>`,
    "</head>",
    "<body>",
    "<esp-app></esp-app>",
    ...scripts,
    "</body>",
    "</html>",
  ].join("");
}

function routeContentType(url) {
  const pathname = typeof url === "string" ? url : url.pathname;
  if (
    typeof url !== "string" &&
    url.hostname === "fonts.googleapis.com" &&
    pathname === "/css2"
  )
    return "text/css";
  if (/\.css(?:$|\?)/.test(pathname)) return "text/css";
  if (/\.(?:png|jpg|jpeg|gif|webp|svg)(?:$|\?)/.test(pathname))
    return "image/svg+xml";
  return "text/plain";
}

function publicFirmwareManifest(slug) {
  return {
    version: "v1.13.0",
    builds: [{
      ota: {
        path: `${slug}.ota.bin`,
        md5: "0123456789abcdef0123456789abcdef",
      },
    }],
  };
}

function publicFirmwareVersions(slug) {
  return {
    device: slug,
    versions: ["v1.13.0", "v1.12.0", "v1.11.0"].map((version, index) => ({
      version,
      ota: {
        path: index === 0 ? `${slug}.ota.bin` : `versions/${version}/${slug}.ota.bin`,
        md5: "0123456789abcdef0123456789abcdef",
      },
    })),
  };
}

async function installRoutes(context, slug, options = {}) {
  const nativeState = options.nativeState || null;
  const connectorsStatus = options.connectorsStatus || null;
  const offlineFallback = options.offlineFallback === true;
  const legacyTextState = options.legacyTextState || {};
  const truncateLegacyText = options.truncateLegacyText || "";
  const scriptPath = path.join(WEB_OUTPUT_DIR, "www.js");
  const webAssetManifestPath = path.join(WEB_OUTPUT_DIR, "web-assets.json");
  assert(
    fs.existsSync(scriptPath),
    `${slug}: generated web UI does not exist at ${scriptPath}`,
  );
  const webAssetManifest = JSON.parse(fs.readFileSync(webAssetManifestPath, "utf8"));
  const immutableBundlePath = path.join(
    WEB_OUTPUT_DIR,
    webAssetManifest.bundles[0].path,
  );

  await context.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.hostname === "espdesktop.test" && requestUrl.pathname === "/api/v1/reset") {
      const reset = options.resetState;
      if (!reset) { await route.abort("connectionclosed"); throw new Error("Legacy firmware must never receive a reset status request"); }
      if (route.request().method() === "POST") {
        assert.strictEqual(route.request().headers()["x-espdesktop-request"], "reset");
        assert.strictEqual(route.request().headers()["x-espdesktop-epoch"], String(reset.epoch));
        reset.requests.push(JSON.parse(route.request().postData()));
        reset.pending = true;
        reset.epoch++;
        await route.fulfill({ status: 202, contentType: "application/json", body: '{"status":"restarting"}' });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ modes: ["customization", "factory"], epoch: reset.epoch, pending: reset.pending }) });
      }
      return;
    }
    if (
      connectorsStatus &&
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === "/connectors/status"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(connectorsStatus),
      });
      return;
    }
    const legacyTextMatch = requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname.match(/^\/text\/([^/]+)(?:\/set)?$/);
    if (legacyTextMatch) {
      const name = decodeURIComponent(legacyTextMatch[1]);
      const objectId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (route.request().method() === "POST") {
        const value = requestUrl.searchParams.get("value") || "";
        const storedValue = objectId === truncateLegacyText ? "" : value;
        legacyTextState[name] = storedValue;
        legacyTextState[objectId] = storedValue;
        await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
        return;
      }
      if (route.request().method() === "GET") {
        const value = Object.prototype.hasOwnProperty.call(legacyTextState, name)
          ? legacyTextState[name]
          : legacyTextState[objectId];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ value: value || "" }),
        });
        return;
      }
    }
    if (requestUrl.hostname === "espdesktop.test" && requestUrl.pathname === "/api/v1/identity") {
      const identity = options.identityState;
      if (!identity) {
        // Old firmware does not implement this endpoint. A plain 204 is not a
        // valid discovery response for a JSON endpoint.
        await route.fulfill({ status: 404, body: "Not found" });
        return;
      }
      if (route.request().method() === "GET" && identity.failLoad) {
        await route.fulfill({ status: 503, body: "Starting up" });
        return;
      }
      if (route.request().method() === "POST") {
        identity.posts.push(route.request().postDataJSON());
        if (identity.failSave) {
          await route.fulfill({ status: 500, body: "Save failed" });
          return;
        }
        identity.info.name = route.request().postDataJSON().name;
        identity.info.friendly_name = identity.info.name || "Original panel";
        identity.info.hostname = require("./load_typescript_module").loadTypeScriptModule(
          path.join(ROOT, "src/webserver/model/panel_identity.ts")
        ).panelHostname(identity.info.name, identity.info.mac_suffix);
        identity.info.restart_required = true;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(identity.info) });
      return;
    }
    if (requestUrl.hostname === "espdesktop.test" && requestUrl.pathname === "/api/v1/screensaver-pin") {
      const pin = options.screensaverPinState;
      if (!pin) { await route.fulfill({ status: 404, body: "Not found" }); return; }
      if (route.request().method() === "POST") {
        if (options.resetState && route.request().headers()["x-espdesktop-epoch"] !== String(options.resetState.epoch)) {
          await route.fulfill({ status: 428, contentType: "application/json", body: '{"error":"Reload the page before changing settings"}' });
          return;
        }
        const settings = route.request().postDataJSON();
        pin.posts.push(settings);
        pin.enabled = settings.enabled;
        if (typeof settings.pin === "string") pin.pin = settings.pin;
      }
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ enabled: pin.enabled, has_pin: !!pin.pin }) });
      return;
    }
    if (nativeState && requestUrl.pathname.startsWith("/api/v1/")) {
      const suppliedGeneration = route.request().headers()["if-match"];
      nativeState.requests.push(
        `${route.request().method()} ${requestUrl.pathname}` +
        (suppliedGeneration ? ` if-match=${suppliedGeneration}` : ""),
      );
    }
    if (
      nativeState &&
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === "/api/v1/capabilities"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          api: { version: 1 },
          home_assistant_support: options.homeAssistantSupport === true,
          reset: options.resetState ? { modes: ["customization", "factory"], status: "/api/v1/reset" } : undefined,
          identity: options.identityState ? { version: 1 } : undefined,
          screensaver_pin: options.screensaverPinState ? { version: 1 } : undefined,
          configuration: { read: true, write: true, document_versions: options.nativeV2 ? [1, 2] : [1],
            durable_document_version: options.nativeV2 ? 2 : 1,
            max_navigation_depth: options.nativeV2 ? 2 : 1, writable_navigation_depth: options.nativeV2 ? 2 : 1,
            max_v2_document_bytes: 524288, preserves_inactive_records: true,
            companion_auto_open_app_subpages: options.nativeAppSubpagePreference === true,
            max_record_body_bytes: nativeState.maxRecordBodyBytes },
          web_assets: { versions: [1] },
        }),
      });
      return;
    }
    if (
      !nativeState &&
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === "/api/v1/capabilities"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          api: { version: 1 },
          home_assistant_support: options.homeAssistantSupport === true,
          reset: options.resetState ? { modes: ["customization", "factory"], status: "/api/v1/reset" } : undefined,
          identity: options.identityState ? { version: 1 } : undefined,
          screensaver_pin: options.screensaverPinState ? { version: 1 } : undefined,
          configuration: { read: false, write: false, document_versions: [] },
        }),
      });
      return;
    }
    if (
      nativeState &&
      requestUrl.hostname === "espdesktop.test" &&
      (requestUrl.pathname === "/api/v1/config" || /^\/api\/v1\/config\/generation\/\d+$/.test(requestUrl.pathname))
    ) {
      if (route.request().method() === "PUT") {
        const expected = `"${nativeState.generation}"`;
        const generationMatch = requestUrl.pathname.match(/\/generation\/(\d+)$/);
        const supplied = generationMatch ? `"${generationMatch[1]}"` : route.request().headers()["if-match"];
        if (generationMatch) assert.strictEqual(route.request().headers()["x-panel-config-generation"], generationMatch[1]);
        if (supplied !== expected) {
          await route.fulfill({ status: 409, body: "generation conflict" });
          return;
        }
        const body = route.request().postDataBuffer();
        assert(body, `${slug}: native configuration PUT has a binary body`);
        const input = new Uint8Array(body);
        const graph = options.nativeV2 ? decodePanelPageSnapshot(input) : undefined;
        nativeState.document = graph?.document ?? decodePanelConfig(input);
        nativeState.generation += 1;
        nativeState.puts.push({
          generation: nativeState.generation,
          document: JSON.parse(JSON.stringify(nativeState.document)),
          layout: graph?.layout,
        });
        if (nativeState.loseWriteResponse) {
          await route.abort("connectionreset");
          return;
        }
        await route.fulfill({
          status: nativeState.writeStatus ?? 204,
          headers: { ETag: `"${nativeState.generation}"`, "X-Panel-Config-Version": options.nativeV2 ? "2" : "1" },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.espdesktop.panel-config",
        headers: { ETag: `"${nativeState.generation}"`, "X-Panel-Config-Version": options.nativeV2 ? "2" : "1" },
        body: Buffer.from((options.nativeV2 ? encodePanelPageDocument : encodePanelConfig)(nativeState.document)),
      });
      return;
    }
    if (
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === `/${slug}`
    ) {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: htmlFor(slug, offlineFallback),
      });
      return;
    }
    if (
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === "/webserver/www.js"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(scriptPath, "utf8"),
      });
      return;
    }
    if (
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === "/webserver/embedded/www.js"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(path.join(WEB_OUTPUT_DIR, "embedded", "www.js"), "utf8"),
      });
      return;
    }
    if (
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === "/webserver/web-assets.json"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(webAssetManifest),
      });
      return;
    }
    if (
      requestUrl.hostname === "espdesktop.test" &&
      requestUrl.pathname === `/webserver/${webAssetManifest.bundles[0].path}`
    ) {
      if (offlineFallback) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: fs.readFileSync(immutableBundlePath, "utf8"),
      });
      return;
    }
    if (requestUrl.hostname === "espdesktop.test" && route.request().method() === "GET" && /^\/(text|text_sensor|select|number|switch|sensor|binary_sensor|button|update|light)\//.test(requestUrl.pathname)) {
      const parts = requestUrl.pathname.split("/").filter(Boolean);
      const domain = parts[0], name = decodeURIComponent(parts[1] || "");
      const normalized = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
      const events = nativeState ? nativeDocumentEvents(nativeState.document) : seededEvents();
      const event = events.find(event => normalized(event.id) === normalized(domain + "-" + name));
      await route.fulfill(event ? { status: 200, contentType: "application/json", body: JSON.stringify(event) } : { status: 404, body: "Entity absent from this fixture" });
      return;
    }
    if (requestUrl.hostname === "espdesktop.test") {
      await route.fulfill({ status: 204, contentType: "text/plain", body: "" });
      return;
    }
    if (requestUrl.origin === "https://espdesktop.com" && requestUrl.pathname.startsWith("/firmware/")) {
      if (requestUrl.pathname.endsWith("/manifest.json")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(publicFirmwareManifest(slug)),
        });
        return;
      }
      if (requestUrl.pathname.endsWith("/versions.json")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(publicFirmwareVersions(slug)),
        });
        return;
      }
    }
    await route.fulfill({
      status: 200,
      contentType: routeContentType(requestUrl),
      body: "",
    });
  });
}

async function installFakeEventSource(page) {
  await page.addInitScript(() => {
    window.__eventSources = [];
    window.__seedEspState = function (events) {
      if (!window.__eventSources.length)
        throw new Error("No EventSource instance was created");
      var source = window.__eventSources[window.__eventSources.length - 1];
      events.forEach(function (event) {
        source.dispatch("state", { data: JSON.stringify(event) });
      });
    };
    window.__disconnectEsp = function () {
      if (!window.__eventSources.length)
        throw new Error("No EventSource instance was created");
      var source = window.__eventSources[window.__eventSources.length - 1];
      source.readyState = 2;
      source.dispatch("error", {});
    };
    window.__seedEspPing = function (payload) {
      if (!window.__eventSources.length)
        throw new Error("No EventSource instance was created");
      window.__eventSources[0].dispatch("ping", {
        data: typeof payload === "string" ? payload : JSON.stringify(payload),
      });
    };

    window.EventSource = class FakeEventSource {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.listeners = {};
        window.__eventSources.push(this);
        setTimeout(() => {
          this.readyState = 1;
          this.dispatch("open", {});
        }, 0);
      }

      addEventListener(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
      }

      close() {
        this.readyState = 2;
      }

      dispatch(type, event) {
        (this.listeners[type] || []).forEach((listener) => listener(event));
      }
    };
  });
}

function seededEvents() {
  const events = [
    { id: "text-button_order", state: "1,2,3w,4,5,6" },
    { id: "text-button_on_color", state: "0073FF" },
    { id: "text-button_off_color", state: "CECECE" },
    { id: "text-sensor_card_color", state: "DEDEDE" },
    { id: "switch-screen__clock_bar", state: "ON", value: true },
    { id: "switch-screen__clock_bar_time", state: "ON", value: true },
    { id: "switch-screen__network_status_icon", state: "ON", value: true },
    { id: "switch-indoor_temp_enable", state: "ON", value: true },
    { id: "switch-outdoor_temp_enable", state: "ON", value: true },
    { id: "text-indoor_temp_entity", state: "sensor.indoor_temperature" },
    { id: "text-outdoor_temp_entity", state: "sensor.outdoor_temperature" },
    {
      id: "select-screen__temperature_unit",
      state: "Auto",
      value: "Auto",
      option: ["Auto", "°C", "°F"],
    },
    {
      id: "switch-screen__temperature_degree_symbol",
      state: "ON",
      value: true,
    },
    {
      id: "select-screen__timezone",
      state: "Europe/London (GMT+0)",
      value: "Europe/London (GMT+0)",
      option: ["Europe/London (GMT+0)", "America/New_York (GMT-5)"],
    },
    { id: "select-screen__language", state: "en", value: "en", option: ["en"] },
    {
      id: "select-home_assistant_artwork_endpoint_mode",
      state: "Automatic",
      value: "Automatic",
      option: ["Automatic", "Manual"],
    },
    {
      id: "text_sensor-home_assistant_artwork_endpoint_status",
      state: "Automatic — http://192.0.2.10",
    },
    {
      id: "select-home_assistant_artwork_protocol",
      state: "http",
      value: "http",
      option: ["http", "https"],
    },
    {
      id: "number-home_assistant_artwork_port",
      state: "8123",
      value: 8123,
      min: 1,
      max: 65535,
    },
    { id: "text-home_assistant_artwork_host", state: "" },
    { id: "switch-firmware__auto_update", state: "ON", value: true },
    { id: "text_sensor-firmware__version", state: "v1.12.0" },
    {
      id: "update-firmware__update",
      state: "UPDATE AVAILABLE",
      current_version: "v1.12.0",
      latest_version: "v1.13.0",
    },
    {
      id: "select-firmware__update_frequency",
      state: "Daily",
      value: "Daily",
      option: ["Hourly", "Daily", "Weekly", "Monthly"],
    },
    {
      id: "select-screen__clock_format",
      state: "24h",
      value: "24h",
      option: ["12h", "24h"],
    },
    {
      id: "select-screen__rotation",
      state: "0",
      value: "0",
      option: ["0", "90", "180", "270"],
    },
    {
      id: "number-screensaver_timeout",
      state: "300",
      value: 300,
      min: 10,
      max: 3600,
    },
    {
      id: "text-subpage_6_config",
      state: "1,B|media_player.living:Living:Speaker:Auto:play_pause::media",
    },
  ];
  BUTTON_FIXTURES.forEach((state, index) => {
    events.push({ id: `text-button_${index + 1}_config`, state });
  });
  return events;
}

function nativeDocumentEvents(document) {
  const events = seededEvents().filter((event) =>
    event.id !== "text-button_order" &&
    !/^text-button_\d+_config$/.test(event.id),
  );
  events.push({
    id: "text-button_order",
    state: document.settings.button_order || "",
  });
  Object.entries(document.buttons).forEach(([slot, state]) => {
    events.push({ id: `text-button_${slot}_config`, state });
  });
  Object.entries(document.subpages).forEach(([slot, state]) => {
    events.push({ id: `text-subpage_${slot}_config`, state });
  });
  return events;
}

function rotationStartupBaseEvents(includeRotation = true, fixtureCount = BUTTON_FIXTURES.length) {
  const events = [
    { id: "text-button_on_color", state: "0073FF" },
    { id: "text-button_off_color", state: "CECECE" },
    { id: "text-sensor_card_color", state: "DEDEDE" },
  ];
  if (includeRotation) {
    events.push({
      id: "select-screen__rotation",
      state: "90",
      value: "90",
      option: ["0", "90", "180", "270"],
    });
  }
  BUTTON_FIXTURES.slice(0, fixtureCount).forEach((state, index) => {
    events.push({ id: `text-button_${index + 1}_config`, state: index === 1 ? COPY_SHORTCUT : state });
  });
  return events;
}

function assertNoLayoutBreaks(result, label, options = {}) {
  const minVisibleCards = options.minVisibleCards || BUTTON_FIXTURES.length;
  assert(result.appVisible, `${label}: #sp-app should be visible`);
  assert(result.screenVisible, `${label}: .sp-screen should be visible`);
  assert(result.mainVisible, `${label}: .sp-main should be visible`);
  assert(result.gridChildren > 0, `${label}: grid should render cells`);
  assert(
    result.visibleGridChildren > 0,
    `${label}: grid cells should have visible size`,
  );
  assert(
    result.visibleCards >= minVisibleCards,
    `${label}: seeded cards should render`,
  );
  assert.strictEqual(
    result.outsideGrid.length,
    0,
    `${label}: grid children overflowed the preview: ${result.outsideGrid.join(", ")}`,
  );
  assert.strictEqual(
    result.overlaps.length,
    0,
    `${label}: grid children overlapped: ${result.overlaps.join(", ")}`,
  );
  assert(
    result.documentScrollWidth <= result.documentClientWidth + 1,
    `${label}: page has horizontal overflow (${result.documentScrollWidth}px > ${result.documentClientWidth}px)`,
  );
}

async function measureCoreLayout(page) {
  return page.evaluate(() => {
    function rectFor(el) {
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    }
    function visible(rect) {
      return !!rect && rect.width > 1 && rect.height > 1;
    }
    function overlap(a, b) {
      var width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      var height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return width > 1 && height > 1;
    }

    var app = document.querySelector("#sp-app");
    var screen = document.querySelector(".sp-screen");
    var main = document.querySelector(".sp-main");
    var mainRect = rectFor(main);
    var children = Array.from(document.querySelectorAll(".sp-main > *")).map(
      function (el, index) {
        return { index: index, className: el.className, rect: rectFor(el) };
      },
    );
    var visibleChildren = children.filter(function (child) {
      return visible(child.rect);
    });
    var outsideGrid = visibleChildren
      .filter(function (child) {
        var r = child.rect;
        return (
          r.left < mainRect.left - 1 ||
          r.top < mainRect.top - 1 ||
          r.right > mainRect.right + 1 ||
          r.bottom > mainRect.bottom + 1
        );
      })
      .map(function (child) {
        return String(child.index);
      });
    var overlaps = [];
    for (var i = 0; i < visibleChildren.length; i++) {
      for (var j = i + 1; j < visibleChildren.length; j++) {
        if (overlap(visibleChildren[i].rect, visibleChildren[j].rect)) {
          overlaps.push(
            visibleChildren[i].index + "/" + visibleChildren[j].index,
          );
        }
      }
    }

    return {
      appVisible: visible(rectFor(app)),
      screenVisible: visible(rectFor(screen)),
      mainVisible: visible(mainRect),
      gridChildren: children.length,
      visibleGridChildren: visibleChildren.length,
      visibleCards: document.querySelectorAll(".sp-main > .sp-btn").length,
      outsideGrid: outsideGrid,
      overlaps: overlaps,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    };
  });
}

async function measureRotationStartupLayout(page) {
  return page.evaluate(() => {
    var screen = document.querySelector(".sp-screen");
    var main = document.querySelector(".sp-main");
    var screenRect = screen ? screen.getBoundingClientRect() : null;
    var style = main ? getComputedStyle(main) : null;
    return {
      loading: !!main && main.classList.contains("sp-grid-loading"),
      busy: main ? main.getAttribute("aria-busy") : null,
      gridHidden: !!style && style.visibility === "hidden",
      visibleCards: document.querySelectorAll(".sp-main > .sp-btn").length,
      screenWidth: screenRect ? screenRect.width : 0,
      screenHeight: screenRect ? screenRect.height : 0,
      gridTemplateColumns: style ? style.gridTemplateColumns : "",
      gridTemplateRows: style ? style.gridTemplateRows : "",
    };
  });
}

function gridTrackCount(value) {
  value = String(value || "").trim();
  if (!value) return 0;
  return value.split(/\s+/).length;
}

function assertPortraitGridLayout(result, label, options = {}) {
  assert(
    !result.loading,
    `${label}: grid should no longer be waiting for startup rotation`,
  );
  assert.strictEqual(
    result.busy,
    null,
    `${label}: grid should not remain aria-busy`,
  );
  assert.strictEqual(
    result.gridHidden,
    false,
    `${label}: grid should be visible after startup rotation is known`,
  );
  assert(
    result.visibleCards >= (options.minVisibleCards || BUTTON_FIXTURES.length),
    `${label}: saved cards should render`,
  );
  assert(
    result.screenHeight > result.screenWidth,
    `${label}: preview should end in portrait orientation`,
  );
  assert.strictEqual(
    gridTrackCount(result.gridTemplateColumns),
    3,
    `${label}: portrait grid should use 3 columns`,
  );
  assert.strictEqual(
    gridTrackCount(result.gridTemplateRows),
    5,
    `${label}: portrait grid should use 5 rows`,
  );
}

async function assertPageTitleEvents(browser) {
  const slug = "guition-esp32-p4-jc1060p470";
  const context = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
  });
  await installRoutes(context, slug);
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );

    assert.strictEqual(
      await page.title(),
      "EspDesktop",
      "page should start with EspDesktop fallback title",
    );

    await page.evaluate(() =>
      window.__seedEspPing({ title: "Guition ESP32-S3-4848S040 f45c6c" }),
    );
    assert.strictEqual(
      await page.title(),
      "EspDesktop - 5c6c",
      "ping title should set browser title",
    );

    await page.evaluate(() => window.__seedEspPing({ uptime: 12 }));
    assert.strictEqual(
      await page.title(),
      "EspDesktop - 5c6c",
      "keepalive ping should preserve browser title",
    );

    await page.evaluate(() => window.__seedEspPing({ title: "   " }));
    assert.strictEqual(
      await page.title(),
      "EspDesktop",
      "blank ping title should restore fallback title",
    );

    await page.evaluate(() =>
      window.__seedEspPing({ title: "Guition ESP32-S3-4848S040 f45c6c" }),
    );
    await page.evaluate(() => window.__seedEspPing({}));
    assert.strictEqual(
      await page.title(),
      "EspDesktop - 5c6c",
      "missing ping title should preserve current title",
    );

    await page.evaluate(() => window.__seedEspPing("not-json"));
    assert.strictEqual(
      await page.title(),
      "EspDesktop",
      "malformed ping payload should not break title fallback",
    );
  } finally {
    await context.close();
  }

  const normalContext = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
  });
  await installRoutes(normalContext, slug);
  const normalPage = await normalContext.newPage();
  await installFakeEventSource(normalPage);
  try {
    await normalPage.goto(`http://espdesktop.test/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    await normalPage.waitForSelector("#sp-app");
    await normalPage.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await normalPage.evaluate(() =>
      window.__seedEspPing({ title: "Workshop" }),
    );
    assert.strictEqual(
      await normalPage.title(),
      "EspDesktop - Workshop",
      "normal page should read title from one-shot event stream",
    );
    assert.strictEqual(
      await normalPage.evaluate(() => window.__eventSources[0].readyState),
      2,
      "normal page title probe should close event stream after title ping",
    );
  } finally {
    await normalContext.close();
  }
}

async function assertRotationStartupOrdering(browser) {
  const slug = "guition-esp32-p4-jc1060p470";
  const context = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
  });
  await installRoutes(context, slug);
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );

    await page.evaluate(
      (events) => window.__seedEspState(events),
      [{ id: "text-button_order", state: "1,2,3w,4,5" }].concat(
        rotationStartupBaseEvents(false, 5),
      ),
    );
    let layout = await measureRotationStartupLayout(page);
    assert(
      layout.loading,
      "button_order before rotation: grid should stay in startup loading state",
    );
    assert.strictEqual(
      layout.busy,
      "true",
      "button_order before rotation: grid should be marked busy",
    );
    assert(
      layout.gridHidden,
      "button_order before rotation: grid should be hidden until rotation arrives",
    );
    assert.strictEqual(
      layout.visibleCards,
      0,
      "button_order before rotation: cards should not render in the default layout first",
    );

    await page.evaluate(() =>
      window.__seedEspState([
        {
          id: "select-screen__rotation",
          state: "90",
          value: "90",
          option: ["0", "90", "180", "270"],
        },
      ]),
    );
    await page.waitForSelector(".sp-main > .sp-btn");
    layout = await measureRotationStartupLayout(page);
    assertPortraitGridLayout(layout, "button_order before rotation", {
      minVisibleCards: 5,
    });
  } finally {
    await context.close();
  }

  const reverseContext = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
  });
  await installRoutes(reverseContext, slug);
  const reversePage = await reverseContext.newPage();
  await installFakeEventSource(reversePage);
  try {
    await reversePage.goto(`http://espdesktop.test/${slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await reversePage.waitForSelector("#sp-app");
    await reversePage.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await reversePage.evaluate(
      (events) => window.__seedEspState(events),
      rotationStartupBaseEvents(true, 5).concat([
        { id: "text-button_order", state: "1,2,3w,4,5" },
      ]),
    );
    await reversePage.waitForSelector(".sp-main > .sp-btn");
    assertPortraitGridLayout(
      await measureRotationStartupLayout(reversePage),
      "rotation before button_order",
      { minVisibleCards: 5 },
    );
  } finally {
    await reverseContext.close();
  }

  const fallbackContext = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
  });
  await installRoutes(fallbackContext, slug);
  const fallbackPage = await fallbackContext.newPage();
  const fallbackPosts = [];
  fallbackPage.on("request", (request) => {
    if (request.method() === "POST") fallbackPosts.push(request.url());
  });
  await installFakeEventSource(fallbackPage);
  try {
    await fallbackPage.goto(`http://espdesktop.test/${slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await fallbackPage.waitForSelector("#sp-app");
    await fallbackPage.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await fallbackPage.evaluate(
      (events) => window.__seedEspState(events),
      [{ id: "text-button_order", state: "1,,,,,,,,,,,,2,3,4" }].concat(
        rotationStartupBaseEvents(false, 4),
      ),
    );
    let layout = await measureRotationStartupLayout(fallbackPage);
    assert(
      layout.loading,
      "rotation fallback: grid should wait briefly when rotation support exists but no value has arrived",
    );
    await fallbackPage.waitForFunction(
      () => {
        var main = document.querySelector(".sp-main");
        return (
          main &&
          !main.classList.contains("sp-grid-loading") &&
          document.querySelectorAll(".sp-main > .sp-btn").length >= 4
        );
      },
      null,
      { timeout: 3000 },
    );
    layout = await measureRotationStartupLayout(fallbackPage);
    assert(
      !layout.loading,
      "rotation fallback: grid should appear after fallback timeout",
    );
    assert.strictEqual(
      layout.gridHidden,
      false,
      "rotation fallback: grid should be visible after fallback timeout",
    );
    assert(
      layout.visibleCards >= 4,
      "rotation fallback: saved cards should render after fallback timeout",
    );

    await fallbackPage.evaluate(() =>
      window.__seedEspState([
        {
          id: "select-screen__rotation",
          state: "90",
          value: "90",
          option: ["0", "90", "180", "270"],
        },
      ]),
    );
    await fallbackPage.waitForFunction(() => {
      var main = document.querySelector(".sp-main");
      return main && getComputedStyle(main).gridTemplateColumns.split(" ").length === 3;
    });
    assertPortraitGridLayout(
      await measureRotationStartupLayout(fallbackPage),
      "rotation after fallback",
      { minVisibleCards: 4 },
    );
    assert.deepStrictEqual(
      fallbackPosts.filter((url) => /\/text\/button_order\//.test(url)),
      [],
      "rotation fallback: an unconfirmed startup orientation must not overwrite the saved layout",
    );
  } finally {
    await fallbackContext.close();
  }
}

async function assertSettingsPage(page, label, options = {}, posts = []) {
  await page.getByRole("tab", { name: "Screen" }).click();
  await page.waitForSelector("#sp-settings.sp-page.active");
  const settingsVisible = await page.locator("#sp-settings").isVisible();
  const appearanceVisible = await page
    .locator("text=Appearance")
    .first()
    .isVisible();
  if (!(await page.locator("#sp-set-on-color").isVisible())) {
    await page.getByRole("heading", { name: "Active Colour", exact: true }).click();
  }
  const onColorVisible = await page.locator("#sp-set-on-color").isVisible();
  assert(settingsVisible, `${label}: settings page should be visible`);
  assert(appearanceVisible, `${label}: settings content should render`);
  assert.strictEqual(
    onColorVisible,
    true,
    `${label}: color controls should be visible`,
  );
  if (options.exerciseInteractions) {
    const picker = page.locator('#sp-set-on-color input[type="color"]');
    const originalColour = await picker.inputValue();
    const colourPosts = () => posts.filter(post => post.domain === "text" && post.name === "button_on_color");
    const savesBefore = colourPosts().length;
    await picker.evaluate(input => {
      for (const hex of ["#112233", "#223344", "#123abc"]) {
        input.value = hex;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(100);
    assert.strictEqual(colourPosts().length, savesBefore,
      `${label}: dragging the native picker must not save intermediate colours`);
    const committed = page.waitForRequest(request => request.method() === "POST" &&
      postRecord(request.url()).name === "button_on_color");
    await picker.dispatchEvent("change");
    await committed;
    assert.strictEqual(colourPosts().length, savesBefore + 1,
      `${label}: confirming the native picker saves exactly once`);
    assert.strictEqual(colourPosts().at(-1).value, "123ABC",
      `${label}: the committed colour is saved as uppercase hex`);
    await picker.dispatchEvent("change");
    await page.waitForTimeout(100);
    assert.strictEqual(colourPosts().length, savesBefore + 1,
      `${label}: repeated confirmation of the same colour does not save again`);
    const customSwatch = page.locator("#sp-set-on-color .sp-card-color-custom");
    assert.strictEqual(await customSwatch.evaluate(el => getComputedStyle(el).borderTopStyle), "solid",
      `${label}: choosing a custom colour fills its swatch with a solid border`);
    const presetSaved = page.waitForRequest(request => request.method() === "POST" &&
      postRecord(request.url()).name === "button_on_color");
    await page.locator('#sp-set-on-color [data-color="FF8C00"]').click();
    await presetSaved;
    assert.strictEqual(colourPosts().at(-1).value, "FF8C00", `${label}: preset selection still saves its colour`);
    assert.strictEqual(await customSwatch.getAttribute("data-selected"), "false");
    assert.strictEqual(await customSwatch.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(18, 58, 188)",
      `${label}: selecting a preset retains the custom swatch colour`);
    assert.strictEqual(await customSwatch.evaluate(el => getComputedStyle(el).borderTopStyle), "solid");
    assert.strictEqual(await picker.inputValue(), "#123abc");
    const customSaved = page.waitForRequest(request => request.method() === "POST" &&
      postRecord(request.url()).name === "button_on_color");
    await picker.dispatchEvent("click");
    await customSaved;
    assert.strictEqual(colourPosts().at(-1).value, "123ABC", `${label}: clicking the custom swatch restores its retained colour`);
    assert.strictEqual(await customSwatch.getAttribute("data-selected"), "true");
    await picker.fill(originalColour);
  }
  const themeModes = page.locator("#sp-set-theme-mode");
  if (!(await themeModes.isVisible())) await page.getByRole("heading", { name: "Theme", exact: true }).click();
  assert.deepStrictEqual(await themeModes.locator("button").allTextContents(),
    ["Dark", "Light", "Automatic"], `${label}: theme modes render`);
  await themeModes.getByRole("button", { name: "Automatic" }).click();
  assert(await page.locator("#sp-set-theme-auto-method").isVisible(),
    `${label}: Auto exposes its method`);
  assert(await page.locator("#sp-set-theme-light-start").isVisible(),
    `${label}: Time exposes Light start`);
  assert(await page.locator("#sp-set-theme-dark-start").isVisible(),
    `${label}: Time exposes Dark start`);
  await page.locator("#sp-set-theme-auto-method").getByRole("button", { name: "Sunrise & Sunset", exact: true }).click();
  assert.strictEqual(await page.locator("#sp-set-theme-sunrise-offset").count(), 0,
    `${label}: solar method does not expose sunrise offset control`);
  assert.strictEqual(await page.locator("#sp-set-theme-sunset-offset").count(), 0,
    `${label}: solar method does not expose sunset offset control`);
  assert(!(await page.locator("#sp-set-theme-light-start").isVisible()),
    `${label}: solar method hides time inputs`);
  await themeModes.getByRole("button", { name: "Light" }).click();
  const lightPreview = await page.locator(".sp-screen").evaluate((screen) => {
    // Some layouts occupy every slot, so exercise the preview-only empty slot
    // style with a temporary element under the same themed screen.
    const placeholder = document.createElement("div");
    placeholder.className = "sp-empty-cell";
    placeholder.innerHTML = '<span class="sp-add-icon"></span>';
    screen.appendChild(placeholder);
    const result = {
      background: getComputedStyle(screen).backgroundColor,
      outline: getComputedStyle(placeholder).borderTopColor,
      foreground: getComputedStyle(placeholder.querySelector(".sp-add-icon")).color,
      card: getComputedStyle(screen).getPropertyValue("--preview-surface-card").trim(),
      sensor: getComputedStyle(screen).getPropertyValue("--preview-surface-sensor").trim(),
    };
    placeholder.remove();
    return result;
  });
  assert.strictEqual(lightPreview.background, "rgb(227, 227, 227)", `${label}: preview uses Light background`);
  assert.strictEqual(lightPreview.card, "#FFFFFF", `${label}: Light cards retain their separate white fill`);
  assert.strictEqual(lightPreview.sensor, "#F5F5F5", `${label}: Light sensors retain their separate grey fill`);
  assert.notStrictEqual(lightPreview.outline, lightPreview.background,
    `${label}: Light placeholder dashed outline separates from its background`);
  assert.strictEqual(lightPreview.foreground, "rgb(51, 51, 51)",
    `${label}: Light placeholder icon uses semantic foreground`);
  await page.evaluate(() => window.__seedEspState([{
    id: "text_sensor-screen__active_theme", state: "Light", value: "Light",
  }]));
  await themeModes.getByRole("button", { name: "Automatic" }).click();
  assert(await page.locator(".sp-screen").evaluate((screen) => screen.classList.contains("sp-theme-light")),
    `${label}: Auto preview follows Active Theme`);
  await themeModes.getByRole("button", { name: "Dark" }).click();
  const darkPreview = await page.locator(".sp-screen").evaluate((screen) => ({
    background: getComputedStyle(screen).backgroundColor,
    card: getComputedStyle(screen).getPropertyValue("--preview-surface-card").trim(),
    sensor: getComputedStyle(screen).getPropertyValue("--preview-surface-sensor").trim(),
  }));
  assert.strictEqual(darkPreview.background, "rgb(0, 0, 0)", `${label}: Dark restores the main background`);
  assert.strictEqual(darkPreview.card, "#313131", `${label}: Dark restores the main card fill`);
  assert.strictEqual(darkPreview.sensor, "#212121", `${label}: Dark restores the main sensor fill`);
  assert(!(await page.locator("#sp-set-theme-light-start").isVisible()),
    `${label}: manual theme hides Auto inputs`);
  assert.deepStrictEqual(
    await page
      .locator("#sp-settings .sp-settings-status-title")
      .evaluateAll((nodes) => nodes.map((node) => node.textContent)),
    ["Appearance", "Display", "Sleep & Schedule"],
    `${label}: settings groups should be ordered by purpose`,
  );
  const settingsPlacement = await page.locator("#sp-settings .sp-config").evaluate((config) => {
    let section = "";
    const placement = {};
    Array.from(config.children).forEach((child) => {
      if (child.classList.contains("sp-settings-status-header")) {
        section = child.querySelector(".sp-settings-status-title")?.textContent || "";
        return;
      }
      const title = child.querySelector(":scope > .card-header h3")?.textContent || "";
      if (title) placement[title] = section;
    });
    return placement;
  });
  assert(!Object.hasOwn(settingsPlacement, "Cover Art Screen Saver"),
    `${label}: the retired cover art settings are absent`);
  assert(!Object.hasOwn(settingsPlacement, "Idle"), `${label}: Screen settings omit the retired Idle card`);
  assert.strictEqual(settingsPlacement["Clock Bar"], "Appearance",
    `${label}: clock bar settings should be grouped with appearance controls`);
  assert.deepStrictEqual(await page.locator(".sp-nav [role='tab']").allTextContents(),
    ["Layout", "Screen", "System"], `${label}: primary navigation follows the current tab order`);
  await page.getByRole("tab", { name: "System", exact: true }).click();
  await page.waitForSelector("#sp-device.sp-page.active");
  assert(!(await page.locator("#sp-settings").isVisible()), `${label}: System hides Screen`);
  assert.strictEqual(await page.getByRole("tab", { name: "System", exact: true }).getAttribute("aria-selected"), "true");
  assert.deepStrictEqual(await page.locator("#sp-device .sp-settings-status-title").allTextContents(),
    ["Connectors", "Preferences", "System"], `${label}: system groups should be ordered by purpose`);
  const devicePlacement = await page.locator("#sp-device .sp-config").evaluate(config => {
    let section = "";
    const placement = {};
    for (const child of config.children) {
      if (child.classList.contains("sp-settings-status-header")) {
        section = child.querySelector(".sp-settings-status-title").textContent;
      } else {
        const title = child.querySelector(":scope > .card-header h3")?.textContent;
        if (title) placement[title] = section;
      }
    }
    return placement;
  });
  assert.strictEqual(settingsPlacement.Backlight, "Display", `${label}: Backlight is under Screen > Display`);
  if (settingsPlacement.Rotation) {
    assert.strictEqual(settingsPlacement.Rotation, "Display", `${label}: Rotation is under Screen > Display`);
  }
  assert(!devicePlacement.Backlight && !devicePlacement.Rotation, `${label}: System does not duplicate display controls`);
  assert.strictEqual(devicePlacement.Language, "Preferences", `${label}: Language is under System > Preferences`);
  assert.strictEqual(devicePlacement.Firmware, "System", `${label}: Firmware is under System > System`);
  assert(await page.locator("#sp-device .sp-apply-btn").isVisible(), `${label}: System has Apply Configuration`);
  if (options.slug === "guition-esp32-p4-jc8012p4a1") {
    assert.strictEqual(
      devicePlacement.Battery,
      "System",
      `${label}: battery settings should be grouped with system controls`,
    );
    assert.strictEqual(
      await page.locator("label[for='sp-set-battery-status']").textContent(),
      "Enable battery support",
      `${label}: battery support should use its stable settings label`,
    );
  }
  const firmwareCard = page
    .locator("#sp-device .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Firmware$/ }),
    })
    .first();
  assert(
    await firmwareCard.isVisible(),
    `${label}: firmware settings card should render`,
  );
  if (options.exerciseInteractions) {
    await firmwareCard.locator(":scope > .card-header").click();
    await page.waitForSelector("#sp-fw-updates-panel", { state: "visible" });
    assert.deepStrictEqual(
      await firmwareCard
        .locator(".sp-fw-subpanels > .sp-disclosure")
        .evaluateAll((nodes) => nodes.map((node) => node.id)),
      ["sp-fw-updates-panel", "sp-fw-auto-panel", "sp-fw-wifi-panel", "sp-fw-previous-panel"],
      `${label}: firmware sub-panels should use the requested order`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-updates-panel .sp-disclosure-button > span").first().innerText(),
      "Firmware updates",
      `${label}: firmware update details should have a clear panel title`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-updates-panel .sp-disclosure-button").getAttribute("aria-expanded"),
      "false",
      `${label}: firmware updates should start closed`,
    );
    assert(
      await page.locator("#sp-fw-updates-panel .sp-disclosure-badge").isVisible(),
      `${label}: available firmware should show an update badge while closed`,
    );
    await page.locator("#sp-fw-updates-panel .sp-disclosure-button").click();
    assert(
      await page.locator("#sp-fw-updates-panel .sp-fw-overview").isVisible(),
      `${label}: firmware update details should render inside the panel`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-updates-panel .sp-disclosure-badge").isVisible(),
      false,
      `${label}: firmware update badge should hide while open`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-auto-panel").getAttribute("class"),
      "sp-disclosure",
      `${label}: auto updates should start closed`,
    );
    assert(
      await page.locator("#sp-fw-auto-panel .sp-disclosure-badge").isVisible(),
      `${label}: enabled auto updates should show an On badge while closed`,
    );
    await page.locator("#sp-fw-auto-panel .sp-disclosure-button").click();
    assert.strictEqual(
      await page.locator("#sp-fw-auto-panel .sp-disclosure-button").getAttribute("aria-expanded"),
      "true",
      `${label}: auto updates should expose its expanded state`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-auto-panel .sp-disclosure-badge").isVisible(),
      false,
      `${label}: auto-update badge should hide while open`,
    );
    assert(
      await page.locator("#sp-set-update-freq").isVisible(),
      `${label}: enabled auto updates should show frequency inside the panel`,
    );
    assert.deepStrictEqual(
      await firmwareCard
        .locator(
          ".sp-fw-label, .sp-fw-version, .sp-disclosure-button, .sp-toggle-label, .sp-select, .sp-fw-btn",
        )
        .evaluateAll((nodes) => [
          ...new Set(nodes.map((node) => getComputedStyle(node).fontSize)),
        ]),
      ["14px"],
      `${label}: firmware labels, values, headings, fields, and actions should use one primary font size`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-previous-panel .sp-disclosure-button").getAttribute("aria-expanded"),
      "false",
      `${label}: previous firmware should start closed`,
    );
    await page.locator("#sp-fw-previous-panel .sp-disclosure-button").click();
    assert.deepStrictEqual(
      await page.locator("#sp-set-firmware-version option").evaluateAll(
        (options) => options.map((option) => option.value),
      ),
      ["v1.11.0"],
      `${label}: previous firmware should exclude latest and installed versions`,
    );
    assert.strictEqual(
      await page.locator("#sp-fw-previous-panel .sp-fw-btn").isEnabled(),
      true,
      `${label}: a previous firmware selection should enable Install`,
    );
    const confirmPromise = page.waitForEvent("dialog");
    const installClick = page.locator("#sp-fw-previous-panel .sp-fw-btn").click();
    const confirmDialog = await confirmPromise;
    assert.strictEqual(
      confirmDialog.message(),
      "Install older firmware v1.11.0? The display will restart during installation.",
      `${label}: previous firmware installation should require confirmation`,
    );
    await confirmDialog.dismiss();
    await installClick;
    assert.strictEqual(
      await page
        .locator("#sp-device .card-header h3")
        .filter({ hasText: /^WiFi$/ })
        .count(),
      0,
      `${label}: WiFi firmware should not remain a standalone settings card`,
    );
    await page.evaluate(() => window.__seedEspState([
      { id: "text_sensor-esp32_c6__current_firmware", state: "2.12.8" },
      { id: "text_sensor-esp32_c6__latest_firmware", state: "2.12.9" },
      { id: "switch-wifi_firmware__auto_update", state: "ON", value: true },
      { id: "button-firmware_esp32_c6__install_update", state: "" },
    ]));
    const wifiPanel = page.locator("#sp-fw-wifi-panel");
    assert(await wifiPanel.isVisible(), `${label}: supported WiFi firmware panel should render`);
    assert(
      await wifiPanel.locator(".sp-disclosure-badge").isVisible(),
      `${label}: WiFi update badge should show while the closed panel has an update`,
    );
    await wifiPanel.locator(".sp-disclosure-button").click();
    assert.strictEqual(
      await wifiPanel.locator(".sp-disclosure-badge").isVisible(),
      false,
      `${label}: WiFi update badge should hide while open`,
    );
    assert.deepStrictEqual(
      await wifiPanel.locator(".sp-fw-version").evaluateAll(
        (nodes) => nodes.map((node) => node.textContent),
      ),
      ["2.12.8", "2.12.9"],
      `${label}: WiFi panel should show current and available versions`,
    );
    assert.strictEqual(
      await wifiPanel.locator("#sp-set-c6-auto-update").isChecked(),
      true,
      `${label}: WiFi automatic updates should be enabled by default`,
    );
    assert(
      await firmwareCard
        .locator(".sp-fw-overview .sp-fw-actions")
        .evaluate((node) => ["flex-end", "flow-end"].includes(getComputedStyle(node).justifyContent)),
      `${label}: firmware actions should align with the version values`,
    );
    await page.evaluate(() => window.__seedEspState([{
      id: "update-firmware__update",
      state: "INSTALLING",
      current_version: "v1.12.0",
      latest_version: "v1.13.0",
    }]));
    assert.strictEqual(
      await firmwareCard.locator(".sp-fw-overview .sp-fw-btn").innerText(),
      "Installing…",
      `${label}: install progress should stay in the action button`,
    );
    assert.strictEqual(
      await firmwareCard.locator("#sp-fw-status").innerText(),
      "",
      `${label}: install progress should not be duplicated below the action`,
    );
  }
  await page.getByRole("tab", { name: "Screen", exact: true }).click();
  const clockBarCard = page
    .locator("#sp-settings .card")
    .filter({ hasText: "Clock Bar" })
    .first();
  const clockBarText = await clockBarCard.textContent();
  const voiceServicesCard = page
    .locator("#sp-settings .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Voice Services$/ }),
    })
    .first();
  const alarmDelayAudioCard = page
    .locator("#sp-settings .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Alarm Audio$/ }),
    })
    .first();
  assert(!clockBarText.includes("Voice Services"), `${label}: voice services are removed`);
  assert.strictEqual(await voiceServicesCard.count(), 0, `${label}: voice settings are not shown`);
  assert.strictEqual(await alarmDelayAudioCard.count(), 0, `${label}: alarm audio settings are not shown`);
  const nightScheduleCard = page
    .locator("#sp-settings .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Night Schedule$/ }),
    })
    .first();
  const brightnessCard = page
    .locator("#sp-settings .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Backlight$/ }),
    })
    .first();
  const screensaverCard = page
    .locator("#sp-settings .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Screensaver$/ }),
    })
    .first();
  assert(await brightnessCard.isVisible(), `${label}: backlight settings should render`);
  await brightnessCard.locator(".card-header").click();
  assert(await screensaverCard.isVisible(), `${label}: screensaver settings should render`);
  await screensaverCard.locator(".card-header").click();
  await screensaverCard.getByRole("button", { name: "Timer", exact: true }).click();
  const dimmedAction = screensaverCard.locator("#sp-set-clock-mode");
  const clockOverlayToggle = screensaverCard.locator("#sp-set-ss-clock-overlay");
  const clockOverlayRow = clockOverlayToggle.locator("..").locator("..");
  assert.strictEqual(await dimmedAction.locator('option[value="camera"]').count(), 0,
    `${label}: older firmware without camera entities does not offer Camera`);
  assert.strictEqual(await clockOverlayRow.isVisible(), false,
    `${label}: older firmware without the overlay entity hides Display Clock`);
  await page.evaluate(() => window.__seedEspState([
    { id: "text-screen_saver__camera_entity", state: "" },
    { id: "switch-screen_saver__clock_overlay", state: "OFF", value: false },
  ]));
  const dateToggle = screensaverCard.locator("#sp-set-clock-date");
  const dateRow = dateToggle.locator("..").locator("..");
  await dimmedAction.selectOption("clock");
  assert.strictEqual(await dateRow.isVisible(), false,
    `${label}: old firmware hides the date toggle`);
  await page.evaluate(() => window.__seedEspState([
    { id: "switch-screen_saver__show_date", state: "OFF", value: false },
  ]));
  await dateRow.waitFor({ state: "visible", timeout: 10000 });
  assert(await dateRow.isVisible(), `${label}: clock screensaver offers Show date`);
  assert.strictEqual(await dateToggle.isChecked(), false, `${label}: date defaults off`);
  await screensaverCard.locator('label[for="sp-set-clock-date"]').click();
  await page.evaluate(() => window.__seedEspState([
    { id: "switch-clock_screensaver_show_date", state: "ON", value: true },
  ]));
  assert(await dateToggle.isChecked(), `${label}: date state aliases synchronize`);
  assert.strictEqual(await screensaverCard.getByRole("button", { name: "Home Assistant", exact: true }).count(), 0,
    `${label}: retired screensaver mode is absent`);
  await dimmedAction.selectOption("dim");
  const manualDimmedBrightness = screensaverCard.locator("#sp-set-dimmed-brightness");
  const daytimeDimmedBrightness = screensaverCard.locator("#sp-set-daytime-dimmed-brightness");
  const nighttimeDimmedBrightness = screensaverCard.locator("#sp-set-nighttime-dimmed-brightness");
  await brightnessCard.getByRole("button", { name: "Manual", exact: true }).click();
  assert(await manualDimmedBrightness.isVisible(), `${label}: Manual mode shows one dimmed-screen brightness`);
  assert.strictEqual(await daytimeDimmedBrightness.isVisible(), false, `${label}: Manual mode hides daytime dimmed brightness`);
  assert.strictEqual(await nighttimeDimmedBrightness.isVisible(), false, `${label}: Manual mode hides nighttime dimmed brightness`);
  await brightnessCard.getByRole("button", { name: "Automatic", exact: true }).click();
  assert.strictEqual(await manualDimmedBrightness.isVisible(), false, `${label}: Automatic mode hides the manual dimmed brightness`);
  assert(await daytimeDimmedBrightness.isVisible(), `${label}: Automatic mode shows daytime dimmed brightness`);
  assert(await nighttimeDimmedBrightness.isVisible(), `${label}: Automatic mode shows nighttime dimmed brightness`);
  const dimmedBrightnessPostStart = posts.length;
  await daytimeDimmedBrightness.evaluate((input) => {
    input.value = "30";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitForPost(
    posts,
    { domain: "number", name: "screen_saver__daytime_dimmed_brightness", action: "set", value: "30" },
    `${label}: Automatic mode posts daytime dimmed brightness`,
    dimmedBrightnessPostStart,
  );
  await brightnessCard.getByRole("button", { name: "Timed", exact: true }).click();
  assert(await daytimeDimmedBrightness.isVisible(), `${label}: Timed mode keeps daytime dimmed brightness visible`);
  assert(await nighttimeDimmedBrightness.isVisible(), `${label}: Timed mode keeps nighttime dimmed brightness visible`);
  assert(
    await nightScheduleCard.isVisible(),
    `${label}: night schedule settings card should render`,
  );
  await nightScheduleCard.locator(".card-header").click();
  const scheduleOnHour = nightScheduleCard.locator("#sp-set-schedule-on-hour");
  assert.strictEqual(await scheduleOnHour.isVisible(), false,
    `${label}: Night Schedule starts disabled and hides time fields`);
  await nightScheduleCard.getByRole("button", { name: "Time", exact: true }).click();
  assert(await scheduleOnHour.isVisible(), `${label}: enabling Night Schedule shows time fields`);
  await nightScheduleCard.getByRole("button", { name: "Disabled", exact: true }).click();
  assert.strictEqual(await scheduleOnHour.isVisible(), false,
    `${label}: disabled night schedule hides time fields`);
  await nightScheduleCard.getByRole("button", { name: "Time", exact: true }).click();
  assert(await scheduleOnHour.isVisible(), `${label}: re-enabled Night Schedule shows time fields`);
  assert.strictEqual(await nightScheduleCard.getByRole("button", { name: "Home Assistant", exact: true }).count(), 0,
    `${label}: retired night schedule mode is absent`);
  await page.getByRole("tab", { name: "System", exact: true }).click();
  assert.strictEqual(await page.getByRole("heading", { name: "Home Assistant Settings", exact: true }).count(), 0,
    `${label}: retired connector settings are absent`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert(!overflow, `${label}: settings page has horizontal overflow`);
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.waitForSelector("#sp-screen.sp-page.active");
  await assertVoiceClockBarPreview(page, label);
}

async function assertVoiceClockBarPreview(page, label) {
  const voiceItem = page.locator('[data-clockbar-item="voice"]');
  assert.strictEqual(await voiceItem.count(), 0, `${label}: voice clock bar item is removed`);
}

async function assertClockBarTypographyAndIconLayout(page, label) {
  assert.deepStrictEqual(
    await page.locator("[data-clockbar-item]").evaluateAll(items => items.map(item => [
      item.getAttribute("data-clockbar-item"), item.getAttribute("data-clockbar-section"),
    ])),
    [["time", "left"], ["network", "right"]],
    `${label}: home clock bar contains the left clock and right connectivity indicator`,
  );
  const metrics = await page.evaluate(() => {
    const cardLabel = document.querySelector(".sp-main .sp-btn-label");
    const clock = document.querySelector(".sp-clock");
    const networkIcon = document.querySelector(".sp-network-preview");
    const topbar = document.querySelector(".sp-topbar");
    if (!cardLabel || !clock || !networkIcon || !topbar)
      return null;
    const cardStyle = getComputedStyle(cardLabel);
    const clockStyle = getComputedStyle(clock);
    const networkStyle = getComputedStyle(networkIcon);
    const networkGlyphStyle = getComputedStyle(networkIcon, "::before");
    const iconRect = networkIcon.getBoundingClientRect();
    const clockRect = clock.getBoundingClientRect();
    const topbarRect = topbar.getBoundingClientRect();
    return {
      cardFontSize: cardStyle.fontSize,
      cardFontWeight: cardStyle.fontWeight,
      clockFontSize: clockStyle.fontSize,
      clockFontWeight: clockStyle.fontWeight,
      iconFontSize: networkStyle.fontSize,
      glyphFontSize: networkGlyphStyle.fontSize,
      iconHeight: iconRect.height,
      topbarHeight: topbarRect.height,
      iconCenterY: iconRect.y + iconRect.height / 2,
      clockCenterY: clockRect.y + clockRect.height / 2,
    };
  });
  assert(metrics, `${label}: clock bar typography is measurable`);
  assert.strictEqual(
    metrics.clockFontSize,
    metrics.cardFontSize,
    `${label}: clock font size matches card labels`,
  );
  assert.strictEqual(
    metrics.clockFontWeight,
    metrics.cardFontWeight,
    `${label}: clock font weight matches card labels`,
  );
  assert.strictEqual(
    metrics.iconFontSize,
    metrics.cardFontSize,
    `${label}: connectivity icon scales with the device label size`,
  );
  assert.strictEqual(
    metrics.glyphFontSize,
    metrics.iconFontSize,
    `${label}: icon-font defaults do not override connectivity sizing`,
  );
  assert(
    metrics.iconHeight <= metrics.topbarHeight,
    `${label}: connectivity icon fits inside the clock bar`,
  );
  assert(
    Math.abs(metrics.iconCenterY - metrics.clockCenterY) <= 1,
    `${label}: connectivity icon is vertically aligned with the clock (${JSON.stringify(metrics)})`,
  );
}

async function assertMobileTabLayout(page, label, restoreViewport) {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(100);
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.waitForSelector("#sp-screen.sp-page.active");
  let mobile = await page.evaluate(() => {
    var support = document.querySelector(".sp-support-btn");
    var supportStyle = support ? getComputedStyle(support) : null;
    var screen = document.querySelector(".sp-screen").getBoundingClientRect();
    return {
      tab: document.querySelector("#sp-app").getAttribute("data-active-tab"),
      supportDismissControl: !!document.querySelector(".sp-support-dismiss"),
      viewportMeta:
        document.querySelector('meta[name="viewport"]') &&
        document.querySelector('meta[name="viewport"]').getAttribute("content"),
      supportVisible:
        !!support &&
        supportStyle.display !== "none" &&
        support.getBoundingClientRect().width > 1,
      screenWidth: screen.width,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    };
  });
  assert.strictEqual(
    mobile.tab,
    "screen",
    `${label}: screen tab is marked active on mobile`,
  );
  assert.strictEqual(
    mobile.viewportMeta,
    "width=device-width,initial-scale=1",
    `${label}: web app should provide mobile viewport metadata`,
  );
  assert.strictEqual(
    mobile.supportDismissControl,
    false,
    `${label}: support button should not have a dismiss control`,
  );
  assert(
    mobile.supportVisible,
    `${label}: support button remains visible on the screen tab`,
  );
  assert(
    mobile.screenWidth <= mobile.windowWidth + 1,
    `${label}: mobile screen preview fits viewport`,
  );
  assert(
    mobile.documentScrollWidth <= mobile.documentClientWidth + 1,
    `${label}: mobile screen tab has horizontal overflow`,
  );
  await page.locator('.sp-main [data-slot="1"] .sp-btn-icon').click();
  await page.waitForSelector(".sp-selection-bar.sp-visible");
  mobile = await page.evaluate(() => {
    var header = document.querySelector(".sp-header");
    var bar = document.querySelector(".sp-selection-bar");
    var label = document.querySelector(".sp-selection-label");
    var actions = document.querySelector(".sp-selection-actions");
    var headerRect = header ? header.getBoundingClientRect() : null;
    var barRect = bar ? bar.getBoundingClientRect() : null;
    var labelRect = label ? label.getBoundingClientRect() : null;
    var actionsRect = actions ? actions.getBoundingClientRect() : null;
    return {
      selectionBarVisible: !!barRect && barRect.width > 1 && barRect.height > 1,
      selectionBarMatchesHeader:
        !!headerRect &&
        !!barRect &&
        Math.abs(barRect.left - headerRect.left) <= 1 &&
        Math.abs(barRect.right - headerRect.right) <= 1,
      selectionBarWithinViewport:
        !!barRect &&
        barRect.left >= -1 &&
        barRect.right <= document.documentElement.clientWidth + 1,
      selectionLabelFits:
        !!labelRect &&
        !!actionsRect &&
        labelRect.left >= barRect.left - 1 &&
        labelRect.right <= actionsRect.left + 1,
      selectionActionsWithinViewport:
        !!actionsRect &&
        actionsRect.right <= document.documentElement.clientWidth + 1,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    };
  });
  assert(
    mobile.selectionBarVisible,
    `${label}: mobile card selection bar should be visible after selecting a card`,
  );
  assert(
    mobile.selectionBarMatchesHeader,
    `${label}: mobile card selection bar should match header width`,
  );
  assert(
    mobile.selectionBarWithinViewport,
    `${label}: mobile card selection bar should fit viewport`,
  );
  assert(
    mobile.selectionLabelFits,
    `${label}: mobile card selection label should shrink before action buttons`,
  );
  assert(
    mobile.selectionActionsWithinViewport,
    `${label}: mobile card selection actions should fit viewport`,
  );
  assert(
    mobile.documentScrollWidth <= mobile.documentClientWidth + 1,
    `${label}: mobile card selection bar has horizontal overflow`,
  );

  await page.getByRole("tab", { name: "Screen" }).click();
  await page.waitForSelector("#sp-settings.sp-page.active");
  const nightScheduleCard = page
    .locator("#sp-settings .card")
    .filter({ hasText: "Night Schedule" })
    .first();
  await nightScheduleCard.locator(".card-header").click();
  mobile = await page.evaluate(() => {
    var support = document.querySelector(".sp-support-btn");
    var supportStyle = support ? getComputedStyle(support) : null;
    var activeCard = Array.from(
      document.querySelectorAll("#sp-settings .card"),
    ).find(function (card) {
      return !card.classList.contains("collapsed");
    });
    var activeCardRect = activeCard ? activeCard.getBoundingClientRect() : null;
    var headers = Array.from(
      document.querySelectorAll("#sp-settings .card-header"),
    ).map(function (header) {
      var rect = header.getBoundingClientRect();
      return { width: rect.width, left: rect.left, right: rect.right };
    });
    return {
      tab: document.querySelector("#sp-app").getAttribute("data-active-tab"),
      supportVisible:
        !!support &&
        supportStyle.display !== "none" &&
        support.getBoundingClientRect().width > 1,
      activeCardVisible:
        !!activeCardRect &&
        activeCardRect.width > 1 &&
        activeCardRect.height > 1,
      activeCardWithinViewport:
        !!activeCardRect &&
        activeCardRect.left >= -1 &&
        activeCardRect.right <= window.innerWidth + 1,
      headersWithinViewport: headers.every(function (rect) {
        return rect.left >= -1 && rect.right <= window.innerWidth + 1;
      }),
      documentScrollWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
    };
  });
  assert.strictEqual(
    mobile.tab,
    "settings",
    `${label}: settings tab is marked active on mobile`,
  );
  assert(
    mobile.supportVisible,
    `${label}: support button remains visible on the settings tab`,
  );
  assert(
    mobile.activeCardVisible,
    `${label}: expanded mobile settings card should be visible`,
  );
  assert(
    mobile.activeCardWithinViewport,
    `${label}: expanded mobile settings card should fit viewport`,
  );
  assert(
    mobile.headersWithinViewport,
    `${label}: mobile settings headers should fit viewport`,
  );
  assert(
    mobile.documentScrollWidth <= mobile.windowWidth + 1,
    `${label}: mobile settings tab has horizontal overflow`,
  );
  await page.setViewportSize(restoreViewport);
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.waitForSelector("#sp-screen.sp-page.active");
  await page.waitForTimeout(100);
}

async function assertMobileDeviceViewport(browser, testCase) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  await installRoutes(context, testCase.slug);
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await page.evaluate(
      (events) => window.__seedEspState(events),
      seededEvents(),
    );
    await page.waitForSelector(".sp-main > .sp-btn");
    await page.getByRole("tab", { name: "Screen" }).click();
    await page.waitForSelector("#sp-settings.sp-page.active");
    const mobile = await page.evaluate(() => {
      var support = document.querySelector(".sp-support-btn");
      var supportStyle = support ? getComputedStyle(support) : null;
      return {
        viewportMeta:
          document.querySelector('meta[name="viewport"]') &&
          document
            .querySelector('meta[name="viewport"]')
            .getAttribute("content"),
        windowWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        supportVisible:
          !!support &&
          supportStyle.display !== "none" &&
          support.getBoundingClientRect().width > 1,
      };
    });
    assert.strictEqual(
      mobile.viewportMeta,
      "width=device-width,initial-scale=1",
      `${testCase.name}: mobile browser should receive device-width viewport metadata`,
    );
    assert(
      mobile.windowWidth <= 380,
      `${testCase.name}: mobile browser should not render with a desktop layout viewport (${mobile.windowWidth}px)`,
    );
    assert(
      mobile.documentScrollWidth <= mobile.windowWidth + 1,
      `${testCase.name}: mobile device settings tab has horizontal overflow`,
    );
    assert(
      mobile.supportVisible,
      `${testCase.name}: support button remains visible on settings on mobile devices`,
    );
    for (const width of [360, 320]) {
      await page.setViewportSize({ width, height: 740 });
      for (const { label, id } of [
        { label: "System", id: "device" },
        { label: "Screen", id: "settings" },
        { label: "Layout", id: "screen" },
      ]) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        assert(await page.locator(`#sp-${id}.active`).isVisible(),
          `${testCase.name}: ${label} opens at ${width}px`);
        assert.strictEqual(await page.locator(".sp-page.active").count(), 1,
          `${testCase.name}: only the selected page is shown`);
        assert(await page.locator(".sp-nav").evaluate(nav => {
          const rect = nav.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1;
        }), `${testCase.name}: navigation fits ${width}px`);
        assert(await page.locator(".sp-brand").evaluate(brand => {
          const text = document.createRange();
          text.selectNodeContents(brand);
          return text.getBoundingClientRect().right <= brand.getBoundingClientRect().right + 1;
        }),
          `${testCase.name}: EspDesktop title fits beside navigation at ${width}px`);
      }
    }
  } catch (error) {
    fs.mkdirSync(FAILURE_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(
        FAILURE_DIR,
        `${testCase.name}-${testCase.slug}-mobile.png`,
      ),
      fullPage: true,
    });
    throw error;
  } finally {
    await context.close();
  }
}

async function assertEmptyCellSettings(page, posts, label) {
  const emptyCell = page
    .locator(".sp-empty-cell:not(.sp-info-only-hidden)")
    .first();
  if ((await emptyCell.count()) === 0) return;
  assert.strictEqual(
    await page.locator(".sp-btn .sp-add-pill").count(),
    0,
    `${label}: configured slots do not show add controls`,
  );
  const addPill = emptyCell.locator(".sp-add-pill");
  await page.mouse.move(0, 0);
  assert.strictEqual(
    await addPill.evaluate((el) => getComputedStyle(el).opacity),
    "0",
    `${label}: empty-slot add control is hidden until hover`,
  );
  await emptyCell.hover();
  await page.waitForFunction(
    (el) => parseFloat(getComputedStyle(el).opacity) > 0.9,
    await addPill.elementHandle(),
  );
  const pos = await emptyCell.getAttribute("data-pos");
  const before = posts.length;
  await emptyCell.click();
  await page.waitForSelector(".sp-settings-overlay.sp-visible");
  await page.waitForTimeout(100);
  assert.strictEqual(
    posts.length,
    before,
    `${label}: opening a new card draft should not post immediately`,
  );
  assert(
    await page.locator("#sp-card-type-picker").isVisible(),
    `${label}: new card draft shows the card type grid`,
  );
  assert.strictEqual(
    await page.locator(".sp-card-type-source, [data-card-connector], .sp-card-type-connector").count(),
    0,
    `${label}: card choices do not display connector source labels`,
  );
  for (const retired of ["Webhook", "Switch", "Trigger", "Action"]) {
    assert.strictEqual(await page.getByRole("button", { name: `${retired} card type`, exact: true }).count(), 0,
      `${label}: retired ${retired} is absent from the picker`);
  }
  assert.strictEqual(
    await page.locator("#sp-inp-type").count(),
    0,
    `${label}: new card draft does not show the compact type dropdown before selection`,
  );
  assert.strictEqual(
    await page.locator(".sp-settings-modal .sp-save-btn").count(),
    0,
    `${label}: new card draft hides Save until a type is selected`,
  );
  assert.strictEqual(
    await page.locator(".sp-settings-modal .sp-delete-btn").count(),
    0,
    `${label}: new card draft hides Delete before save`,
  );
  const modalLayout = await page.evaluate(() => {
    var modal = document.querySelector(".sp-settings-modal");
    var rect = modal.getBoundingClientRect();
    return {
      visible: rect.width > 1 && rect.height > 1,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
    };
  });
  assert(
    modalLayout.visible,
    `${label}: card settings modal should be visible`,
  );
  assert(
    modalLayout.left >= -1 && modalLayout.right <= modalLayout.windowWidth + 1,
    `${label}: card settings modal overflows horizontally`,
  );
  assert(
    modalLayout.top < modalLayout.windowHeight && modalLayout.bottom > 0,
    `${label}: card settings modal is outside the viewport`,
  );
  assert(
    modalLayout.documentScrollWidth <= modalLayout.windowWidth + 1,
    `${label}: card settings modal introduced horizontal overflow`,
  );
  const closeControl = await page.evaluate(() => {
    var button = document.querySelector(".sp-settings-close");
    var icon = button && button.querySelector(".sp-settings-close-icon path");
    if (!button) return { visible: false };
    var rect = button.getBoundingClientRect();
    var styles = getComputedStyle(button);
    return {
      visible: rect.width > 1 && rect.height > 1,
      hasCloseIcon: !!icon,
      usesInlineIcon: !!icon && icon.tagName.toLowerCase() === "path",
      width: rect.width,
      height: rect.height,
      radius: parseFloat(styles.borderRadius),
      borderWidth: parseFloat(styles.borderTopWidth),
    };
  });
  assert(
    closeControl.visible,
    `${label}: settings modal close control is visible`,
  );
  assert(
    closeControl.hasCloseIcon,
    `${label}: settings modal close control uses a close icon`,
  );
  assert(
    closeControl.usesInlineIcon,
    `${label}: settings modal close control icon does not depend on external icon fonts`,
  );
  assert(
    Math.abs(closeControl.width - closeControl.height) <= 1,
    `${label}: settings modal close control is circular`,
  );
  assert(
    closeControl.radius >= closeControl.width / 2 - 1,
    `${label}: settings modal close control has a circle container`,
  );
  assert(
    closeControl.borderWidth >= 1,
    `${label}: settings modal close control has a visible container border`,
  );
  await page.locator(".sp-settings-close").click();
  await page.waitForFunction(() => {
    var overlay = document.querySelector(".sp-settings-overlay");
    return overlay && !overlay.classList.contains("sp-visible");
  });
  assert.strictEqual(
    posts.length,
    before,
    `${label}: closing a new card draft before choosing a type should not post`,
  );
  await page
    .locator(`.sp-main [data-pos="${pos}"].sp-empty-cell`)
    .waitFor({ state: "visible" });

  await page.locator(`.sp-main [data-pos="${pos}"]`).click();
  await page.waitForSelector(".sp-settings-overlay.sp-visible");
  await chooseCardType(page, "Subpage");
  const folderName = page.getByPlaceholder("e.g. Folder Name", { exact: true });
  if (!(await folderName.isVisible())) {
    await page.getByRole("button", { name: "Card Settings", exact: true }).click();
  }
  await folderName.fill("Local folder");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(`.sp-main [data-pos="${pos}"][data-slot]`).waitFor();
  const slot = await page
    .locator(`.sp-main [data-pos="${pos}"]`)
    .getAttribute("data-slot");
  await waitForPost(
    posts,
    { domain: "text", name: "button_order", action: "set" },
    `${label}: saving a Subpage posts button order`,
    before,
  );
  await waitForAnyPost(
    posts,
    [
      { domain: "text", name: `button_${slot}_config`, action: "set" },
      { domain: "text", name: `Button ${slot} Config`, action: "set" },
    ],
    `${label}: saving a Subpage posts card config`,
    before,
  );
}

async function assertConnectorsManagement(page, testCase) {
  await page.getByRole("tab", { name: "System", exact: true }).click();
  await page.waitForSelector("#sp-device.sp-page.active #sp-connectors");
  const homeAssistantHeading = page
    .locator("#sp-connectors")
    .getByRole("heading", { name: "Home Assistant", exact: true });
  assert.strictEqual(await homeAssistantHeading.count(), 0,
    `${testCase.name}: retired Home Assistant connector is absent`);
  if (testCase.companionSupported) {
    assert(
      await page.locator("#sp-connectors").getByRole("heading", { name: "Mac Companion", exact: true }).count() > 0,
      `${testCase.name}: Mac Companion remains available`,
    );
  } else {
    assert(
      await page.locator("#sp-connectors").getByRole("heading", { name: "Mac Companion", exact: true }).count() === 0,
      `${testCase.name}: unsupported profiles hide Mac Companion setup`,
    );
  }
  assert.strictEqual(
    await page.locator("#sp-connectors .sp-card-type-source, #sp-connectors [data-card-connector]").count(),
    0,
    `${testCase.name}: connector cards do not expose card-source badges`,
  );
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.waitForSelector("#sp-screen.sp-page.active");
}

async function chooseCardType(page, label) {
  const option = page.getByRole("button", { name: `${label} card type` });
  await option.waitFor({ state: "visible" });
  await option.click();
  await page.waitForSelector(".sp-settings-modal");
  assert.strictEqual(
    await page.locator("#sp-inp-type").count(),
    0,
    `${label}: selected card does not expose a card type dropdown`,
  );
}

async function assertAutomaticAppIcons(browser, testCase) {
  if (!testCase.companionSupported) return;
  for (const native of [false, true]) {
    const fixture = nativeConfigState(testCase.slug);
    fixture.document.buttons[1] = "com.apple.Safari;Safari;Auto;Auto;;;companion;;card_off_color=123ABC";
    fixture.document.buttons[2] = "com.apple.finder;Finder;Auto;Auto;;;companion;;app_shortcuts";
    fixture.document.subpages[2] = "~B,1|companion,com.apple.Safari,Safari,Auto,Auto";
    const legacyTextState = {};
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: native ? fixture : null, legacyTextState });
    const { COMPANION_APP_ICON_SIDE: iconSide } = loadTypeScriptModule("src/webserver/generated/companion_capabilities.ts");
    const iconBytes = Buffer.alloc(iconSide * iconSide * 3);
    for (let y = iconSide / 8; y < iconSide * 7 / 8; y++)
      for (let x = iconSide / 8; x < iconSide * 7 / 8; x++) {
        const index = y * iconSide + x;
        iconBytes.writeUInt16LE(0x07e0, index * 2);
        iconBytes[iconSide * iconSide * 2 + index] = 255;
      }
    let iconRequests = 0;
    await context.route("**/companion/app-icon?*", route => {
      iconRequests++;
      return route.fulfill({
        status: 200, contentType: "application/octet-stream",
        headers: { "X-EspDesktop-Companion-Online": "true" }, body: iconBytes,
      });
    });
    const page = await context.newPage();
    await installFakeEventSource(page);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const card = slot => page.locator(`.sp-main [data-slot="${slot}"]`);
    async function chooseSize(slot, size) {
      await card(slot).click({ button: "right" });
      const trigger = page.locator(".sp-ctx-menu").getByRole("button", { name: "App Icon Size", exact: true });
      await trigger.click();
      const submenu = page.locator(".sp-ctx-submenu").filter({ has: page.getByRole("button", { name: "Use Default", exact: true }) });
      assert.deepStrictEqual(await submenu.getByRole("button").allTextContents().then(labels => labels.map(label => label.replace("✓", "").trim())),
        ["Use Default", "Small", "Medium", "Large"], "all size choices use consistent menu rows");
      const rows = await submenu.getByRole("button").evaluateAll(buttons => buttons.map(button => {
        const style = getComputedStyle(button);
        return { width: button.getBoundingClientRect().width, background: style.backgroundColor,
          color: style.color, border: style.borderTopWidth, radius: style.borderRadius,
          fontSize: style.fontSize, fontFamily: style.fontFamily, fontWeight: style.fontWeight };
      }));
      const parentStyle = await trigger.evaluate(el => {
        const style = getComputedStyle(el);
        return { color: style.color, fontSize: style.fontSize, fontFamily: style.fontFamily, fontWeight: style.fontWeight };
      });
      for (const row of rows) {
        assert(Math.abs(row.width - rows[0].width) < 1, "submenu rows have equal full widths");
        assert.strictEqual(row.background, "rgba(0, 0, 0, 0)", "submenu rows have no native button background");
        assert.strictEqual(row.border, "0px", "submenu rows have no native button border");
        assert.strictEqual(row.radius, "0px", "submenu rows are flat rather than rounded pills");
        for (const property of ["color", "fontSize", "fontFamily", "fontWeight"])
          assert.strictEqual(row[property], parentStyle[property], "submenu typography matches the main menu");
      }
      const selected = submenu.locator('[aria-pressed="true"]');
      assert.strictEqual(await selected.count(), 1, "one current size is selected");
      assert.strictEqual(await selected.locator(".sp-ctx-check").textContent(), "✓", "the current choice has a checkmark");
      await submenu.getByRole("button", { name: size, exact: true }).click();
      await page.waitForFunction(({ slot, size }) =>
        document.querySelector(`.sp-main [data-slot="${slot}"]`)?.dataset.iconSize === size.toLowerCase(), { slot, size });
      await card(slot).locator(".sp-companion-app-icon").waitFor();
    }
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seedNativeDocument(page, fixture);
      await page.getByRole("tab", { name: "Layout" }).click();
      await card(1).locator(".sp-companion-app-icon").waitFor();
      await card(2).locator(".sp-companion-app-icon").waitFor();
      const initialIconRequests = iconRequests;
      const widths = {};
      for (const size of ["Medium", "Large", "Small"]) {
        await chooseSize(2, size);
        const saved = native ? fixture.document.buttons[2] : legacyTextState.button_2_config;
        assert(saved.includes(`icon_size=${size.toLowerCase()}`), "right-click choice persists");
        assert.strictEqual(await card(2).locator(".sp-btn-label").isVisible(), size !== "Large", "Large hides the label; other sizes restore it");
        const bounds = await card(2).boundingBox();
        const image = await card(2).locator(".sp-companion-app-icon").boundingBox();
        widths[size] = image.width;
        const badge = card(2).locator(".sp-subpage-badge");
        const arrow = await badge.boundingBox();
        const badgeStyle = await badge.evaluate(el => ({ background: getComputedStyle(el).backgroundColor,
          shadow: getComputedStyle(el).textShadow }));
        assert.strictEqual(badgeStyle.background, "rgba(0, 0, 0, 0)", "chevron has no background");
        assert.notStrictEqual(badgeStyle.shadow, "none", "the chevron glyph has a shadow over artwork");
        if (size === "Large") {
          assert(arrow.x < bounds.x + bounds.width / 3, "hidden-label chevron sits on the left");
          const available = await card(2).evaluate(el => Math.min(el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) - parseFloat(getComputedStyle(el).paddingRight),
            el.clientHeight - parseFloat(getComputedStyle(el).paddingTop) - parseFloat(getComputedStyle(el).paddingBottom)));
          assert(Math.abs(image.width * 0.75 - available) < 2, "Large artwork fills the content box");
        } else {
          const label = await card(2).locator(".sp-btn-label").boundingBox();
          assert(Math.abs(arrow.x - label.x - label.width - 4) <= 2, "chevron follows the end of the label");
          assert(image.y + image.height * 0.875 < label.y, "small and medium artwork remain above the label");
        }
      }
      assert(widths.Small < widths.Medium && widths.Medium < widths.Large, "all app icon sizes are distinct");
      assert.strictEqual(iconRequests, initialIconRequests, "preview rebuilds reuse cached images");
      await page.getByRole("tab", { name: "System", exact: true }).click();
      await page.getByRole("tab", { name: "Layout", exact: true }).click();
      await card(1).locator(".sp-companion-app-icon").waitFor();
      assert.strictEqual(iconRequests, initialIconRequests, "tab navigation reuses cached images");
      // Use the same menu inside a subpage and verify the complete subpage record.
      await card(2).locator(".sp-subpage-badge").click();
      await page.locator(".sp-back-btn").waitFor();
      const backAppIcon = page.locator(".sp-back-btn img.sp-back-hit");
      await backAppIcon.waitFor();
      assert.strictEqual(await page.locator(".sp-back-btn").getAttribute("data-icon-size"), "large");
      assert(!(await page.locator(".sp-back-btn .sp-btn-label").isVisible()), "app Back card hides its label");
      assert(await page.locator(".sp-back-btn .sp-back-badge.mdi-chevron-left").isVisible(),
        "app Back card shows the opposite chevron to the subpage link");
      assert.strictEqual(await page.locator(".sp-clockbar-subpage-title").count(), 0,
        "app subpage identity moves from the clock bar to the return-home card");
      if (process.env.ESPDESKTOP_APP_BACK_SCREENSHOT) {
        await page.locator(".sp-screen").screenshot({ path: process.env.ESPDESKTOP_APP_BACK_SCREENSHOT });
      }
      await page.locator(".sp-back-btn .sp-back-badge").click();
      await card(2).locator(".sp-subpage-badge").waitFor();
      await card(2).locator(".sp-subpage-badge").click();
      await chooseSize(1, "Large");
      const subpageSaved = native ? fixture.document.subpages[2] : Object.entries(legacyTextState)
        .filter(([key]) => key.includes("subpage_2")).map(([,value]) => value).join("");
      assert(subpageSaved.includes("icon_size=large"), "subpage icon size is saved");
      await chooseSize(1, "Small");
      assert(await card(1).locator(".sp-btn-label").isVisible(), "subpage label returns with Small");
      const requestsBeforeReload = iconRequests;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seedNativeDocument(page, fixture);
      await page.getByRole("tab", { name: "Layout", exact: true }).click();
      await card(1).locator(".sp-companion-app-icon").waitFor();
      await card(2).locator(".sp-companion-app-icon").waitFor();
      assert.strictEqual(iconRequests, requestsBeforeReload, "browser reload reuses locally stored images");
      await page.addStyleTag({ content: ".sp-btn{--card-active-color:#ff00ff!important}" });
      await card(1).hover();
      await page.mouse.down();
      try {
        await assertPreviewOutlinePixels(page, '.sp-main > .sp-btn[data-slot="1"]:active',
          `${testCase.slug}/${native ? "native" : "legacy"}/pressed app icon`, 3);
      } finally {
        await page.mouse.up();
      }

      assert.deepStrictEqual(errors, []);
    } finally { await context.close(); }
  }
}

async function assertContextColourPicker(browser, testCase) {
  for (const native of [false, true]) {
    const fixture = nativeConfigState(testCase.slug);
    fixture.maxRecordBodyBytes = 4096;
    fixture.document.buttons[1] += ";;;;;card_active_color=custom,card_on_color=FFFFFF";
    fixture.document.buttons[2] = COPY_SHORTCUT + ";;card_off_color=DA5125";
    const legacyTextState = {};
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: native ? fixture : null, legacyTextState });
    const page = await context.newPage();
    await page.addInitScript(() => { window.__ESPDESKTOP_TEST_HOOKS__ = {}; });
    const errors = [];
    const configurationWrites = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      const url = new URL(request.url());
      if ((request.method() === "POST" && url.pathname.startsWith("/text/")) ||
          (request.method() === "PUT" && url.pathname === "/api/v1/config")) configurationWrites.push(request.url());
    });
    await installFakeEventSource(page);
    const label = `${testCase.name}/${native ? "native" : "legacy"}`;
    const storedButton = slot => native ? fixture.document.buttons[slot] : legacyTextState[`button_${slot}_config`];
    const subpageChunkNames = ["subpage_3_config", "subpage_3_config_ext", ...Array.from({ length: 6 }, (_, i) => `subpage_3_config_ext_${i + 2}`)];
    const storedSubpage = () => native ? fixture.document.subpages[3] : subpageChunkNames.map(name => legacyTextState[name] || "").join("");
    const waitForSaved = async predicate => {
      const deadline = Date.now() + 10000;
      while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
      assert(predicate(), `${label}: colour change persisted`);
    };
    const card = slot => page.locator(`.sp-main [data-slot="${slot}"]`);
    const menu = page.locator(".sp-ctx-menu");
    const openPicker = async target => {
      await target.click({ button: "right" });
      const trigger = menu.getByRole("button", { name: "Card Colour", exact: true });
      await trigger.hover();
      await menu.getByRole("group", { name: "Card colour presets", exact: true }).waitFor();
      assert.strictEqual(await trigger.getAttribute("aria-expanded"), "true");
      assert.strictEqual(await trigger.locator(".mdi-palette").count(), 1, `${label}: Card Colour uses the palette icon`);
      assert.strictEqual(await menu.locator(".sp-ctx-submenu.sp-ctx-colours").getByText(/^Card Colours?$/, { exact: true }).count(), 0,
        `${label}: the colour panel has no redundant title`);
      assert(await trigger.evaluate(el => !["none", "normal", '""'].includes(getComputedStyle(el, "::after").content)),
        `${label}: Card Colour shows a submenu chevron`);
      assert(await menu.locator(":scope > .sp-ctx-item").count() > 0,
        `${label}: the original menu remains alongside the palette`);
      assert.strictEqual(await page.locator(".sp-settings-overlay.sp-visible").count(), 0,
        `${label}: quick colour picker does not open card settings`);
    };
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seedNativeDocument(page, fixture);
      await openPicker(card(1));
      const submenu = menu.locator(".sp-ctx-submenu.sp-ctx-colours");
      const trigger = menu.getByRole("button", { name: "Card Colour", exact: true });
      let menuBounds = await menu.boundingBox();
      let paletteBounds = await submenu.boundingBox();
      assert(paletteBounds.x >= menuBounds.x + menuBounds.width - 1,
        `${label}: the palette pops out to the right when space allows`);
      await menu.getByText("Duplicate", { exact: true }).hover();
      await submenu.waitFor({ state: "hidden" });
      assert.strictEqual(await submenu.isVisible(), false, `${label}: leaving the row closes its submenu`);
      await trigger.click();
      assert(await submenu.isVisible(), `${label}: clicking also opens the submenu`);
      await trigger.focus();
      await page.keyboard.press("ArrowRight");
      assert(await submenu.locator("button").first().evaluate(el => el === document.activeElement),
        `${label}: keyboard navigation enters the palette`);
      await page.keyboard.press("ArrowLeft");
      assert.strictEqual(await submenu.isVisible(), false);
      assert(await trigger.evaluate(el => el === document.activeElement));
      await trigger.click();
      await menu.locator('[data-color="6036B2"]').click();
      await waitForSaved(() => storedButton(1)?.includes("card_off_color=6036B2"));
      assert(storedButton(1).includes("card_on_color=FFFFFF"), `${label}: separate active colour survives`);
      await openPicker(card(1));
      assert.strictEqual(await menu.locator('[data-color="6036B2"]').getAttribute("aria-pressed"), "true");
      const picker = menu.getByLabel("Choose custom colour");
      await picker.dispatchEvent("click");
      assert.strictEqual(await menu.count(), 1, `${label}: native picker stays attached after click`);
      await picker.fill("#123abc");
      await waitForSaved(() => storedButton(1)?.includes("card_off_color=123ABC"));
      await openPicker(card(1));
      assert.strictEqual(await menu.locator(".sp-card-color-custom").getAttribute("data-selected"), "true");
      if (process.env.ESPDESKTOP_CONTEXT_COLOUR_SCREENSHOT && native) {
        await page.screenshot({ path: process.env.ESPDESKTOP_CONTEXT_COLOUR_SCREENSHOT });
      }
      await menu.getByText("Reset Colour", { exact: true }).click();
      await waitForSaved(() => !storedButton(1)?.includes("card_off_color="));
      assert(storedButton(1).includes("card_on_color=FFFFFF"));

      await card(2).click({ modifiers: ["ControlOrMeta"] });
      await openPicker(card(1));
      assert.strictEqual(await menu.locator('.sp-card-color-preset[aria-pressed="true"]').count(), 0,
        `${label}: mixed card backgrounds leave all presets unselected`);
      await menu.locator('[data-color="64AD54"]').click();
      await waitForSaved(() => [1, 2].every(slot => storedButton(slot)?.includes("card_off_color=64AD54")));
      assert(storedButton(2).includes("shortcut.command+c"), `${label}: bulk recolour keeps card configuration`);
      await page.locator(".sp-brand").click();
      await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
      await page.locator(".sp-back-btn").waitFor();
      await openPicker(card(1));
      await menu.locator('[data-color="DA5125"]').click();
      await waitForSaved(() => storedSubpage()?.includes("card_off_color=DA5125"));
      await page.locator(".sp-brand").click();
      await openPicker(page.locator(".sp-back-btn"));
      await menu.locator('[data-color="3C64DE"]').click();
      await waitForSaved(() => storedSubpage()?.includes(":3C64DE"));
      await openPicker(page.locator(".sp-back-btn"));
      await menu.getByText("Reset Colour", { exact: true }).click();
      await waitForSaved(() => !storedSubpage()?.includes(":3C64DE"));
      await page.locator(".sp-back-btn .sp-back-hit").click();
      await card(1).click({ button: "right" });
      await menu.getByText("Card Colour", { exact: true }).click();
      await page.keyboard.press("Escape");
      assert.strictEqual(await menu.count(), 0, `${label}: Escape dismisses the picker`);
      await openPicker(card(1));
      await page.locator(".sp-brand").click();
      assert.strictEqual(await menu.count(), 0, `${label}: clicking outside dismisses the picker`);
      await card(1).evaluate((el, viewport) => el.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, cancelable: true, clientX: viewport.width - 5, clientY: viewport.height - 5,
      })), testCase.viewport);
      await trigger.hover();
      menuBounds = await menu.boundingBox();
      paletteBounds = await submenu.boundingBox();
      assert(paletteBounds.x + paletteBounds.width <= menuBounds.x + 1,
        `${label}: the submenu flips left near the right edge`);
      assert(paletteBounds.x >= 4 && paletteBounds.y >= 4 &&
        paletteBounds.x + paletteBounds.width <= testCase.viewport.width - 4 &&
        paletteBounds.y + paletteBounds.height <= testCase.viewport.height - 4,
        `${label}: the complete palette remains within the viewport`);
      await submenu.locator('[data-color="6036B2"]').hover();
      assert(await submenu.isVisible(), `${label}: moving across to the palette keeps it open`);
      await page.keyboard.press("Escape");
      const chunkCount = readManifest().devices[testCase.slug].firmware.package.subpageConfigChunks || 8;
      const subpageByteLimit = native ? fixture.maxRecordBodyBytes - 1 : chunkCount * 255;
      const subpageLimits = await page.evaluate(({ byteLimit, native }) => {
        const codec = window.__ESPDESKTOP_TEST_HOOKS__.config;
        return ["card", "back", "both"].flatMap(target => [0, 1].map(overflow => {
          const original = codec.parseSubpageConfig("~B,1|,light.kitchen,Capacity,Lightbulb,Lightbulb");
          codec.buildSubpageGrid(original);
          const proposed = { ...original, buttons: original.buttons.map(button => ({ ...button, label: "" })) };
          if (target !== "back") proposed.buttons[0].options = "card_off_color=6036B2";
          if (target !== "card") proposed.backColor = "6036B2";
          proposed.order = codec.serializeSubpageGrid(proposed);
          const labelBytes = byteLimit + overflow - new TextEncoder().encode(codec.serializeSubpageConfig(proposed)).length;
          proposed.buttons[0].label = native
            ? "é".repeat(Math.floor(labelBytes / 2)) + "L".repeat(labelBytes % 2)
            : "L".repeat(labelBytes);
          original.buttons[0].label = proposed.buttons[0].label;
          return { target, overflow, before: codec.serializeSubpageConfig(original), after: codec.serializeSubpageConfig(proposed) };
        }));
      }, { byteLimit: subpageByteLimit, native });
      async function seedSubpage(full) {
        await page.evaluate(({ full, chunkCount, names, native }) => {
          const chunks = native ? [full] : window.__ESPDESKTOP_TEST_HOOKS__.config.splitSubpageConfigChunks(full, chunkCount, 255);
          window.__seedEspState(names.map((name, index) => ({ id: "text-" + name, state: chunks[index] || "" })));
        }, { full, chunkCount, names: subpageChunkNames, native });
      }
      await seedSubpage(storedSubpage());
      for (const limit of subpageLimits) {
        assert(Buffer.byteLength(limit.before) <= subpageByteLimit);
        assert.strictEqual(Buffer.byteLength(limit.after), subpageByteLimit + limit.overflow);
        fixture.document.subpages[3] = limit.before;
        await seedSubpage(limit.before);
        await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
        const back = page.locator(".sp-back-btn");
        await back.waitFor();
        if (limit.target === "both") {
          const bounds = await back.boundingBox();
          await back.click({ position: { x: bounds.width - 12, y: 12 } });
          await card(1).click({ modifiers: ["ControlOrMeta"] });
        }
        const originals = await Promise.all([back, card(1)].map(el => el.evaluate(el => el.style.backgroundColor)));
        const writesBefore = configurationWrites.length;
        await openPicker(limit.target === "back" ? back : card(1));
        await menu.locator('[data-color="6036B2"]').click();
        if (!limit.overflow) {
          await waitForSaved(() => storedSubpage() === limit.after);
          // Acknowledge the saved chunks before seeding the next device state.
          await seedSubpage(limit.after);
        } else {
          await page.getByText("Subpage is too large to save. Shorten labels or entity IDs.", { exact: true })
            .waitFor({ state: "visible", timeout: 2000 });
          await page.waitForTimeout(500);
          assert.strictEqual(configurationWrites.length, writesBefore, `${label}: oversized ${limit.target} subpage recolouring sends no write`);
          assert.deepStrictEqual(await Promise.all([back, card(1)].map(el => el.evaluate(el => el.style.backgroundColor))), originals,
            `${label}: oversized ${limit.target} subpage recolouring leaves card and Back colours unchanged`);
          await openPicker(limit.target === "back" ? back : card(1));
          assert.strictEqual(await menu.locator('[data-color="6036B2"]').getAttribute("aria-pressed"), "false",
            `${label}: rejected subpage colours do not change local settings`);
          await page.keyboard.press("Escape");
        }
        await page.locator(".sp-brand").click();
        await page.locator(".sp-back-btn .sp-back-hit").click();
      }
      const buttonByteLimit = native ? fixture.maxRecordBodyBytes - 1 : 255;
      const limitConfigs = await page.evaluate(byteLimit => {
        const codec = window.__ESPDESKTOP_TEST_HOOKS__.config;
        return [byteLimit, byteLimit + 1].map(length => {
          const button = codec.parseButtonConfig("light.kitchen;Large;Lightbulb;Lightbulb");
          button.options = "card_off_color=6036B2";
          const labelBytes = length - new TextEncoder().encode(codec.serializeButtonConfig({ ...button, label: "" })).length;
          button.label = "é".repeat(Math.floor(labelBytes / 2)) + "L".repeat(labelBytes % 2);
          return {
            before: codec.serializeButtonConfig({ ...button, options: "" }),
            after: codec.serializeButtonConfig(button),
          };
        });
      }, buttonByteLimit);
      assert.strictEqual(Buffer.byteLength(limitConfigs[0].after), buttonByteLimit);
      assert.strictEqual(Buffer.byteLength(limitConfigs[1].after), buttonByteLimit + 1);
      for (const [index, limitConfig] of limitConfigs.entries()) {
        fixture.document.buttons[1] = limitConfig.before;
        await seedNativeDocument(page, fixture);
        await page.locator(".sp-brand").click();
        const originalBackground = await card(1).evaluate(el => el.style.backgroundColor);
        const writesBefore = configurationWrites.length;
        await openPicker(card(1));
        await menu.locator('[data-color="6036B2"]').click();
        if (index === 0) {
          await waitForSaved(() => storedButton(1) === limitConfig.after);
        } else {
          await page.getByText("Card settings are too large to save. Shorten confirmation text, labels, or entity IDs.", { exact: true })
            .waitFor({ state: "visible", timeout: 2000 });
          // Allow the normal save debounce to pass before asserting no request was queued.
          await page.waitForTimeout(500);
          assert.strictEqual(configurationWrites.length, writesBefore, `${label}: an oversized colour change sends no write`);
          assert.strictEqual(await card(1).evaluate(el => el.style.backgroundColor), originalBackground,
            `${label}: a rejected colour does not change the preview`);
          await openPicker(card(1));
          assert.strictEqual(await menu.locator('[data-color="6036B2"]').getAttribute("aria-pressed"), "false",
            `${label}: a rejected colour does not change local card settings`);
          await page.keyboard.press("Escape");
        }
      }
      // The first selected card fits; the later card would exceed the limit.
      fixture.document.buttons[1] = BUTTON_FIXTURES[0];
      fixture.document.buttons[2] = limitConfigs[1].before;
      await seedNativeDocument(page, fixture);
      await page.locator(".sp-brand").click();
      await card(1).click({ position: { x: 12, y: 12 } });
      await card(2).click({ modifiers: ["ControlOrMeta"] });
      const originalBackgrounds = await Promise.all([1, 2].map(slot => card(slot).evaluate(el => el.style.backgroundColor)));
      const writesBeforeBulk = configurationWrites.length;
      await openPicker(card(1));
      await menu.locator('[data-color="6036B2"]').click();
      await page.getByText("Card settings are too large to save. Shorten confirmation text, labels, or entity IDs.", { exact: true })
        .waitFor({ state: "visible", timeout: 2000 });
      await page.waitForTimeout(500);
      assert.strictEqual(configurationWrites.length, writesBeforeBulk, `${label}: oversized bulk recolouring sends no partial write`);
      assert.deepStrictEqual(await Promise.all([1, 2].map(slot => card(slot).evaluate(el => el.style.backgroundColor))), originalBackgrounds,
        `${label}: oversized bulk recolouring leaves every selected card unchanged`);
      await page.locator(".sp-brand").click();
      for (const type of ["image"]) {
        await page.evaluate(type => window.__seedEspState([
          { id: "text-button_1_config", state: `camera.garden;Fixed Background;Auto;Auto;;;${type}` },
        ]), type);
        await card(1).click({ button: "right" });
        assert.strictEqual(await menu.getByText("Card Colour", { exact: true }).count(), 0,
          `${label}: ${type} keeps its fixed background`);
        await page.keyboard.press("Escape");
      }
      if (native) {
        fixture.document.buttons[1] = BUTTON_FIXTURES[0];
        fixture.document.buttons[2] = COPY_SHORTCUT;
        await seedNativeDocument(page, fixture);
        await page.locator(".sp-brand").click();
        let rejectAfter = 0;
        await page.route("**/api/v1/config{,/**}", async route => {
          if (route.request().method() !== "PUT") return route.fallback();
          if (rejectAfter-- <= 0) return route.fulfill({ status: 409, body: "generation conflict" });
          return route.fallback();
        });
        const failedMessage = "Could not save the colour. Reload the configuration and try again.";
        const beforeFailure = await card(1).evaluate(el => el.style.backgroundColor);
        await openPicker(card(1));
        await menu.locator('[data-color="6036B2"]').click();
        await page.getByText(failedMessage, { exact: true }).waitFor();
        assert.strictEqual(await card(1).evaluate(el => el.style.backgroundColor), beforeFailure,
          `${label}: a native conflict restores the original preview`);
        assert(!fixture.document.buttons[1].includes("card_off_color=6036B2"));
        await page.locator(".sp-brand").click();
        await card(1).click({ position: { x: 12, y: 12 } });
        await card(2).click({ modifiers: ["ControlOrMeta"] });
        const secondBackground = await card(2).evaluate(el => el.style.backgroundColor);
        rejectAfter = 1;
        await openPicker(card(1));
        await menu.locator('[data-color="6036B2"]').click();
        await page.getByText("Some colours saved. Reload the configuration before retrying the remaining cards.", { exact: true }).waitFor();
        assert(fixture.document.buttons[1].includes("card_off_color=6036B2"));
        assert(!fixture.document.buttons[2].includes("card_off_color=6036B2"));
        assert.strictEqual(await card(2).evaluate(el => el.style.backgroundColor), secondBackground,
          `${label}: a failed later save retains only confirmed colours`);
        await page.locator(".sp-brand").click();
        await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
        const backBefore = await page.locator(".sp-back-btn").evaluate(el => el.style.backgroundColor);
        const savedSubpage = fixture.document.subpages[3];
        await openPicker(page.locator(".sp-back-btn"));
        await menu.locator('[data-color="6036B2"]').click();
        await page.getByText(failedMessage, { exact: true }).waitFor();
        assert.strictEqual(await page.locator(".sp-back-btn").evaluate(el => el.style.backgroundColor), backBefore,
          `${label}: a failed Back colour restores the subpage preview`);
        assert.strictEqual(fixture.document.subpages[3], savedSubpage);
        // A 202 has durable native data but no compatible older-firmware copy.
        // Keep the saved colour and the controller's downgrade warning.
        await page.route("**/api/v1/config{,/**}", async route => {
          if (route.request().method() !== "PUT") return route.fallback();
          fixture.document = decodePanelConfig(new Uint8Array(route.request().postDataBuffer()));
          fixture.generation++;
          await route.fulfill({ status: 202, body: "legacy mirror unavailable" });
        });
        await openPicker(page.locator(".sp-back-btn"));
        await menu.locator('[data-color="6036B2"]').click();
        await page.getByText("The configuration saved, but its older-firmware copy did not. Do not downgrade this panel yet.", { exact: true }).waitFor();
        assert(fixture.document.subpages[3].includes(":6036B2"));
        await openPicker(page.locator(".sp-back-btn"));
        assert.strictEqual(await menu.locator('[data-color="6036B2"]').getAttribute("aria-pressed"), "true",
          `${label}: durable native saves retain their colour when the legacy mirror cannot fit`);
        await page.keyboard.press("Escape");

      }
      assert.deepStrictEqual(errors, [], `${label}: colour menu has no browser errors`);
    } catch (error) {
      console.error(`${label}: browser errors`, errors);
      throw error;
    } finally { await context.close(); }
  }
}

async function assertCardActiveColourControls(page, posts, label) {
  await page.getByRole("tab", { name: "Layout" }).click();
  const card = page.locator('.sp-main [data-slot="1"]');
  await card.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Custom Colours", exact: true }).click();
  const controls = page.locator(".sp-card-color-editor");
  const tabs = controls.getByRole("group", { name: "Active state colour", exact: true });
  const background = controls.getByRole("group", { name: "Card colour presets", exact: true });
  const active = controls.getByRole("group", { name: "Active state colour presets", exact: true });
  assert.deepStrictEqual(await tabs.locator("button").allTextContents(), ["Matching", "Global", "Custom"]);
  assert.strictEqual(await active.isVisible(), false, `${label}: Matching hides the active picker`);
  const before = posts.length;
  await background.locator('[data-color="6036B2"]').click();
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#A086D1");
  await tabs.getByRole("button", { name: "Global", exact: true }).click();
  assert.strictEqual(await active.isVisible(), false, `${label}: Global hides the active picker`);
  const themePicker = page.locator('#sp-set-on-color input[type="color"]');
  const themeColor = (await themePicker.inputValue()).slice(1).toUpperCase();
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#" + themeColor);
  await tabs.getByRole("button", { name: "Custom", exact: true }).click();
  assert(await active.isVisible(), `${label}: Custom shows another picker`);
  assert.strictEqual(await active.locator('[data-color="A086D1"]').getAttribute("aria-pressed"), "true",
    `${label}: entering Custom from Global starts with Matching's shade selected`);
  await background.locator('[data-color="64AD54"]').click();
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#A2CE98",
    `${label}: Custom follows the background until an alternative is chosen`);
  assert.strictEqual(await active.locator('[data-color="A2CE98"]').getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".sp-settings-overlay.sp-visible", { state: "hidden" });
  await card.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Custom Colours", exact: true }).click();
  await background.locator('[data-color="6036B2"]').click();
  assert.strictEqual(await active.locator('[data-color="A086D1"]').getAttribute("aria-pressed"), "true",
    `${label}: automatic matching survives saving and reopening Custom`);
  const afterDefaultSave = posts.length;
  const backgroundPresets = await background.locator("button[data-color]").evaluateAll(buttons => buttons.map(button => button.dataset.color));
  const activePresets = await active.locator("button[data-color]").evaluateAll(buttons => buttons.map(button => button.dataset.color));
  assert.deepStrictEqual(activePresets, backgroundPresets.map(activeCardColor),
    `${label}: active presets use Matching's shades`);
  await active.locator('[data-color="FFBA66"]').click();
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#FFBA66",
    `${label}: selecting a matching swatch uses its displayed colour`);
  assert.strictEqual(await active.locator('[data-color="FFBA66"]').getAttribute("aria-pressed"), "true");
  assert.strictEqual(await active.locator(".sp-card-color-custom").getAttribute("data-selected"), "false");
  await active.locator('input[type="color"]').fill("#ffffff");
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#FFFFFF");
  const customSwatch = active.locator(".sp-card-color-custom");
  assert.strictEqual(await customSwatch.evaluate(el => getComputedStyle(el).borderTopStyle), "solid",
    `${label}: a picked custom colour has no dotted border`);
  await active.locator('[data-color="FFBA66"]').click();
  assert.strictEqual(await customSwatch.getAttribute("data-selected"), "false");
  assert.strictEqual(await customSwatch.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)",
    `${label}: picking a preset retains the custom swatch's colour`);
  assert.strictEqual(await active.locator('input[type="color"]').inputValue(), "#ffffff");
  assert.strictEqual(await customSwatch.evaluate(el => getComputedStyle(el).borderTopStyle), "solid");
  await active.locator('input[type="color"]').dispatchEvent("click");
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#FFFFFF",
    `${label}: the retained custom colour can be selected again`);
  await background.locator('[data-color="212121"]').click();
  assert.strictEqual(await card.evaluate(el => el.style.getPropertyValue("--card-active-color")), "#FFFFFF",
    `${label}: changing the background retains a separate active colour`);
  await tabs.getByRole("button", { name: "Matching", exact: true }).click();
  await tabs.getByRole("button", { name: "Custom", exact: true }).click();
  assert.strictEqual(await active.locator('input[type="color"]').inputValue(), "#ffffff");
  assert(posts.length > before, `${label}: saving the matching default persists the draft`);
  assert.strictEqual(posts.length, afterDefaultSave, `${label}: colour edits stay in the draft until Save`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".sp-settings-overlay.sp-visible", { state: "hidden" });
  await card.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Custom Colours", exact: true }).click();
  assert.strictEqual(await tabs.getByRole("button", { name: "Custom", exact: true }).getAttribute("aria-pressed"), "true");
  assert.strictEqual(await active.locator('input[type="color"]').inputValue(), "#ffffff");
  if (process.env.ESPDESKTOP_ACTIVE_COLOUR_SCREENSHOT) {
    await page.screenshot({ path: process.env.ESPDESKTOP_ACTIVE_COLOUR_SCREENSHOT, fullPage: true });
  }
  await page.getByRole("button", { name: "Reset colours to defaults", exact: true }).click();
  assert.strictEqual(await active.isVisible(), false);
  assert.strictEqual(await tabs.getByRole("button", { name: "Matching", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForSelector(".sp-settings-overlay.sp-visible", { state: "hidden" });
}

async function assertSliderActiveColours(page, label) {
  for (const theme of ["Dark", "Light"]) {
    for (const mode of ["matching", "theme", "custom"]) for (const renderWhileHidden of [false, true]) {
      const types = ["light_brightness", "fan_speed", "cover", "slider", "light_temperature"];
      const events = [
        { id: "text-button_order", state: "1,2,3,4,5" },
        { id: "text-button_on_color", state: "FFFFFF" },
        { id: "select-screen__theme_mode", state: theme, value: theme },
        ...types.map((type, index) => ({
          id: `text-button_${index + 1}_config`,
          state: `light.test;${type};Lightbulb;Auto;;;${type};;card_off_color=313131,card_active_color=${mode},card_on_color=FFFFFF`,
        })),
      ];
      if (renderWhileHidden) {
        await page.getByRole("tab", { name: "Screen", exact: true }).click();
        assert.strictEqual(await page.locator("#sp-screen").isVisible(), false);
      }
      await page.evaluate(events => window.__seedEspState(events), events);
      await page.getByRole("tab", { name: "Layout" }).click();
      const cards = page.locator(".sp-main > .sp-btn");
      await cards.first().locator(".sp-slider-fill").waitFor({ state: "visible" });
      const rendered = await cards.evaluateAll(cards => cards.map(card => ({
        fill: card.style.getPropertyValue("--card-slider-fill-color"),
        fillTop: card.querySelector(".sp-slider-fill").getBoundingClientRect().top,
        fillBottom: card.querySelector(".sp-slider-fill").getBoundingClientRect().bottom,
        trackTop: card.querySelector(".sp-slider-track").getBoundingClientRect().top,
        trackBottom: card.querySelector(".sp-slider-track").getBoundingClientRect().bottom,
        texts: Array.from(card.querySelectorAll(".sp-btn-icon,.sp-btn-label")).map(label => ({
          gradient: label.style.backgroundImage,
          clip: getComputedStyle(label).backgroundClip,
        })),
      })));
      for (const [index, card] of rendered.entries()) {
        assert.strictEqual(card.fill, mode === "matching" ? "#767676" : "#FFFFFF", `${label}: ${theme}/${types[index]}/${mode} fill`);
        const fromTop = types[index] === "cover";
        assert(Math.abs(fromTop ? card.fillTop - card.trackTop : card.fillBottom - card.trackBottom) < .1,
          `${label}: ${types[index]} fill grows from the ${fromTop ? "top" : "bottom"}`);
        if (mode !== "matching") {
          assert(card.texts.every(text => text.clip === "text" && text.gradient.includes("rgb(33, 33, 33)")),
            `${label}: ${theme}/${types[index]}/${mode}${renderWhileHidden ? " after returning from Settings" : ""} text contrasts with the pale fill`);
          assert(card.texts.every(text => text.gradient.startsWith(`linear-gradient(rgb(${fromTop ? "33, 33, 33" : "255, 255, 255"})`)),
            `${label}: ${types[index]} text contrast follows the fill direction`);
        }
      }
      if (mode === "custom" && theme === "Dark" && process.env.ESPDESKTOP_SLIDER_COLOUR_SCREENSHOT) {
        await page.screenshot({ path: process.env.ESPDESKTOP_SLIDER_COLOUR_SCREENSHOT, fullPage: true });
      }
    }
  }
}

async function assertCameraRefreshSettings(page, posts, label) {
  await page.getByRole("tab", { name: "Layout" }).click();
  const before = posts.length;
  await page.locator(".sp-empty-cell:not(.sp-info-only-hidden)").first().click();
  await page.waitForSelector(".sp-settings-overlay.sp-visible");
  assert.strictEqual(await page.getByRole("button", { name: "Camera Card card type", exact: true }).count(), 0,
    `${label}: retired camera cards must not appear in the picker`);
  assert.strictEqual(posts.length, before, `${label}: checking retired picker entries must not save`);
  await page.locator(".sp-settings-close").click();
  await page.waitForFunction(() => !document.querySelector(".sp-settings-overlay").classList.contains("sp-visible"));
}

function postRecord(requestUrl) {
  const url = new URL(requestUrl);
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  return {
    time: Date.now(),
    domain: parts[0] || "",
    name: parts[1] || "",
    action: parts.slice(2).join("/"),
    value: url.searchParams.get("value"),
    option: url.searchParams.get("option"),
    path: decodeURIComponent(url.pathname) + url.search,
  };
}

function postMatches(post, expected) {
  return Object.keys(expected).every((key) => post[key] === expected[key]);
}

async function waitForPost(posts, expected, label, startIndex = 0) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (posts.slice(startIndex).some((post) => postMatches(post, expected)))
      return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(
    `${label}: expected POST ${JSON.stringify(expected)}, got ${JSON.stringify(posts.slice(startIndex), null, 2)}`,
  );
}

async function waitForAnyPost(posts, expectedList, label, startIndex = 0) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (
      posts
        .slice(startIndex)
        .some((post) =>
          expectedList.some((expected) => postMatches(post, expected)),
        )
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(
    `${label}: expected one of ${JSON.stringify(expectedList)}, got ${JSON.stringify(posts.slice(startIndex), null, 2)}`,
  );
}

function backupButtons(count) {
  const buttons = Array.from({ length: count }, () => ({}));
  buttons[0] = {
    entity: "light.kitchen",
    label: "Kitchen",
    icon: "Lightbulb",
    icon_on: "Lightbulb",
  };
  buttons[1] = {
    entity: "sensor.energy",
    label: "Energy",
    icon: "Gauge",
    sensor: "sensor.energy",
    unit: "W",
    type: "sensor",
    precision: "0",
  };
  buttons[2] = { label: "Rooms", icon: "Home", type: "subpage" };
  buttons[3] = {
    entity: "media_player.living",
    label: "Media",
    type: "media",
    sensor: "play_pause",
  };
  return buttons;
}

function backupFixture(device, slots, nativeProfile = null) {
  const backup = {
    version: 2,
    format: "espdesktop.backup",
    device,
    source: { device, slots },
    exported_at: "2026-05-24T12:00:00.000Z",
    button_order: "1,2,3w,4",
    button_on_color: "AA5500",
    button_off_color: "101010",
    sensor_card_color: "202020",
    buttons: backupButtons(slots),
    subpages: {
      3: "~B,1,2,6,5,3,4,7|,switch.office_filament_heater_893b,Heater,Movie Roll,,sensor.office_filament_heater_sensor_humidity,%25,,confirm_off%2Cconfirm_on|,switch.office_3d_printer_power,Printer,Printer 3D,,sensor.centauri_carbon_percent_complete_helper,%25|,switch.battery_charger,Battery,Battery 30%25,Battery Charging|H,climate.central_heating,Heating|C,cover.office_blind,Blind,Blinds Open,Blinds,modal,,,cover_tabs=controls%257Cposition%257Ctilt|Y,alarm_control_panel.alarmo,Alarm,Security|H,climate.office_air_conditioner,Aircon",
    },
    settings: {
      indoor_temp_enable: true,
      outdoor_temp_enable: false,
      indoor_temp_entity: "sensor.indoor_temperature",
      outdoor_temp_entity: "sensor.outdoor_temperature",
      temperature_unit: "°C",
      clock_bar: true,
      clock_bar_time: true,
      network_status_icon: true,
      temperature_degree_symbol: true,
      timezone: "Europe/London (GMT+0)",
      language: "en",
      clock_format: "24h",
      ntp_server_1: "pool.ntp.org",
      ntp_server_2: "time.nist.gov",
      ntp_server_3: "time.cloudflare.com",
      screensaver_mode: "timer",
      presence_sensor_entity: "binary_sensor.office_presence",
      cover_art_screensaver: true,
      cover_art_source: "Mac Companion",
      cover_art_delay: 30,
      cover_art_track_overlay_duration: 10,
      media_player_sleep_prevention: true,
      home_assistant_artwork_protocol: "https",
      home_assistant_artwork_port: 9443,
      firmware_auto_update: false,
      firmware_update_frequency: "Weekly",
      screensaver_action: "dim",
      clock_brightness_day: 44,
      clock_brightness_night: 22,
      screensaver_dimmed_brightness: 15,
      screensaver_dimmed_brightness_day: 30,
      screensaver_dimmed_brightness_night: 5,
      screensaver_timeout: 60,
      home_screen_timeout: 120,
      screen_rotation: "90",
    },
    screen: {
      brightness_day: 88,
      brightness_night: 55,
      brightness_mode: "fixed_times",
      manual_brightness: 62,
      schedule_enabled: true,
      schedule_sensor_activation: "on",
      schedule_sensor_entity: "binary_sensor.night_schedule",
      schedule_on_hour: 7,
      schedule_off_hour: 22,
      schedule_mode: "clock",
      schedule_wake_timeout: 30,
      schedule_wake_brightness: 70,
      schedule_dimmed_brightness: 12,
      schedule_clock_brightness: 40,
    },
  };
  if (nativeProfile) {
    backup.native_config = createPanelConfigBackupPayload(
      encodePanelConfig({
        deviceProfile: nativeProfile,
        buttons: { 1: "light.kitchen;Kitchen;Lightbulb;Lightbulb" },
        subpages: {},
        settings: { button_order: "1,2,3w,4", button_on_color: "AA5500" },
      }),
    );
  }
  return backup;
}

function writeJsonFixture(name, value) {
  fs.mkdirSync(FAILURE_DIR, { recursive: true });
  const file = path.join(
    os.tmpdir(),
    `${name}-${process.pid}-${Date.now()}.json`,
  );
  fs.writeFileSync(
    file,
    typeof value === "string" ? value : JSON.stringify(value, null, 2),
  );
  return file;
}

async function openBackupControls(page) {
  await page.getByRole("tab", { name: "System" }).click();
  await page.waitForSelector("#sp-device.sp-page.active");
  if (!(await page.getByRole("button", { name: "Import" }).isVisible())) {
    await page.getByText("Backup", { exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Import" })
    .waitFor({ state: "visible" });
}

async function importBackup(page, data, name) {
  const file = writeJsonFixture(name, data);
  await openBackupControls(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

async function startBannerCapture(page) {
  await page.evaluate(() => {
    window.__bannerMessages = [];
    if (!window.__bannerTextCaptureInstalled) {
      var descriptor = Object.getOwnPropertyDescriptor(
        Node.prototype,
        "textContent",
      );
      if (descriptor && descriptor.set && descriptor.get) {
        Object.defineProperty(Node.prototype, "textContent", {
          get: function () {
            return descriptor.get.call(this);
          },
          set: function (value) {
            if (this.classList && this.classList.contains("sp-banner")) {
              window.__bannerMessages = window.__bannerMessages || [];
              window.__bannerMessages.push({
                className: this.className || "",
                text: String(value || ""),
              });
            }
            return descriptor.set.call(this, value);
          },
          configurable: true,
        });
        window.__bannerTextCaptureInstalled = true;
      }
    }
    if (window.__bannerObserver) window.__bannerObserver.disconnect();
    var banner = document.querySelector(".sp-banner");
    if (!banner) return;
    function record() {
      window.__bannerMessages.push({
        className: banner.className,
        text: banner.textContent || "",
      });
    }
    window.__bannerObserver = new MutationObserver(record);
    window.__bannerObserver.observe(banner, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    record();
  });
}

async function assertBackupImportSmoke(page, posts, testCase) {
  const before = posts.length;
  await importBackup(
    page,
    backupFixture(testCase.slug, testCase.slots),
    "same-device-backup",
  );
  await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor({ timeout: 30000 });
  assert(
    (await page.locator(".sp-banner").textContent()).includes(
      "Configuration imported successfully",
    ),
    "same-device import succeeds",
  );
  assert(!posts.slice(before).some(post => /cover_art|track_overlay_duration|media_player_sleep_prevention/.test(post.name)),
    "restoring an older backup ignores retired cover art settings");
  await waitForPost(
    posts,
    { domain: "text", name: "button_on_color", action: "set", value: "AA5500" },
    "backup color import",
    before,
  );
  await waitForPost(
    posts,
    { domain: "text", name: "button_3_config", action: "set" },
    "backup subpage button config",
    before,
  );
  await waitForPost(
    posts,
    { domain: "text", name: "Subpage 3 Config", action: "set" },
    "backup subpage config",
    before,
  );
  await waitForPost(
    posts,
    { domain: "text", name: "Subpage 3 Config Ext", action: "set" },
    "backup subpage config extension",
    before,
  );
  await waitForPost(
    posts,
    {
      domain: "select",
      name: "screen__timezone",
      action: "set",
      option: "Europe/London (GMT+0)",
    },
    "backup timezone import",
    before,
  );
  await waitForPost(
    posts,
    { domain: "select", name: "screen__language", action: "set", option: "en" },
    "backup language import",
    before,
  );
  await waitForPost(
    posts,
    { domain: "switch", name: "screen__clock_bar_time", action: "turn_on" },
    "backup clock bar time reset",
    before,
  );
  const screensaverImportPosts = [
    [
      { domain: "text", name: "screensaver_mode", action: "set", value: "timer" },
      "backup screensaver mode import",
    ],
    [
      {
        domain: "switch",
        name: "firmware__auto_update",
        action: "turn_off",
      },
      "backup firmware auto-update import",
    ],
    [
      {
        domain: "select",
        name: "firmware__update_frequency",
        action: "set",
        option: "Weekly",
      },
      "backup firmware update frequency import",
    ],
    [
      {
        domain: "select",
        name: "screen_saver__action",
        action: "set",
        option: "Screen Dimmed",
      },
      "backup screensaver action import",
    ],
    [
      { domain: "switch", name: "screen_saver__clock", action: "turn_off" },
      "backup clock screensaver switch import",
    ],
    [
      {
        domain: "number",
        name: "screen_saver__dimmed_brightness",
        action: "set",
        value: "15",
      },
      "backup dimmed screensaver brightness import",
    ],
    [
      {
        domain: "number",
        name: "screen_saver__daytime_dimmed_brightness",
        action: "set",
        value: "30",
      },
      "backup daytime dimmed screensaver brightness import",
    ],
    [
      {
        domain: "number",
        name: "screen_saver__nighttime_dimmed_brightness",
        action: "set",
        value: "5",
      },
      "backup nighttime dimmed screensaver brightness import",
    ],
    [
      { domain: "number", name: "screensaver_timeout", action: "set", value: "60" },
      "backup screensaver timeout import",
    ],
  ];
  for (const [expected, label] of screensaverImportPosts) {
    await waitForPost(posts, expected, label, before);
  }
  await waitForPost(
    posts,
    {
      domain: "number",
      name: "Screen: Daytime Brightness",
      action: "set",
      value: "88",
    },
    "backup brightness import",
    before,
  );
  await waitForPost(
    posts,
    { domain: "select", name: "screen__rotation", action: "set", option: "90" },
    "backup rotation import",
    before,
  );
  const importPosts = posts.slice(before);
  assert(!importPosts.some(post => /home_screen_timeout|Home Screen Timeout/.test(post.name)),
    "restore ignores the retired home screen timeout");
  assert(!importPosts.some(post => /home_assistant_artwork|presence_sensor|screen_schedule_sensor/.test(post.name)),
    "restore skips retired Home Assistant settings");
  assert(
    importPosts.length >= 3 && importPosts[1].time - importPosts[0].time >= 40,
    `backup import posts should be throttled for device stability: ${JSON.stringify(importPosts.slice(0, 3), null, 2)}`,
  );

  await importBackup(page, "{", "invalid-backup");
  await page.waitForSelector(".sp-banner.sp-error");
  assert(
    (await page.locator(".sp-banner").textContent()).includes(
      "could not parse JSON",
    ),
    "invalid JSON shows an error",
  );

  await startBannerCapture(page);
  await importBackup(
    page,
    backupFixture("different-panel", 3),
    "cross-device-backup",
  );
  await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor({ timeout: 30000 });
  const warnings = await page.evaluate(() => window.__bannerMessages || []);
  assert(
    warnings.some(
      (entry) =>
        entry.className.includes("sp-warning") &&
        (entry.text.includes("different panel") ||
          entry.text.includes("slots")),
    ),
    `cross-device import shows an adaptation warning: ${JSON.stringify(warnings)}`,
  );

  if (testCase.slug === "guition-esp32-p4-jc8012p4a1") {
    const expectedNativeWarning =
      "This backup was taken from guition-esp32-p4-jc8012p4a1-v2; this device is guition-esp32-p4-jc8012p4a1. Layout will be restored, but the native configuration will be skipped.";
    const expectedSlotWarning = "Backup has 19 slots, current config has 20 - adapting";
    await startBannerCapture(page);
    await page.evaluate(() => {
      window.__bannerMessages = [];
    });
    await importBackup(
      page,
      backupFixture(
        "guition-esp32-p4-jc8012p4a1-v2",
        testCase.slots - 1,
        "guition-esp32-p4-jc8012p4a1-v2",
      ),
      "cross-profile-native-backup",
    );
    await page.waitForFunction(
      (expected) =>
        (window.__bannerMessages || []).some(
          (entry) =>
            entry.className.includes("sp-warning") &&
            entry.text.includes(expected) &&
            entry.text.includes("Backup has 19 slots, current config has 20 - adapting"),
        ),
      expectedNativeWarning,
    );
    await page.waitForFunction(() =>
      (window.__bannerMessages || []).some(
        (entry) =>
          entry.text.includes("Configuration imported successfully"),
      ),
      null,
      { timeout: 30000 },
    );
    const nativeWarnings = await page.evaluate(() => window.__bannerMessages || []);
    const nativeWarningIndex = nativeWarnings.findIndex(
      (entry) =>
        entry.className.includes("sp-warning") &&
        entry.text.includes(expectedNativeWarning) &&
        entry.text.includes(expectedSlotWarning),
    );
    const successIndex = nativeWarnings.findIndex(
      (entry) =>
        entry.text.includes("Configuration imported successfully"),
    );
    assert.strictEqual(
      nativeWarnings[nativeWarningIndex]?.text.includes(expectedNativeWarning),
      true,
      `cross-profile native import shows the specific warning: ${JSON.stringify(nativeWarnings)}`,
    );
    assert(
      nativeWarnings[nativeWarningIndex]?.text.includes(expectedSlotWarning),
      `cross-profile native import retains the slot adaptation warning: ${JSON.stringify(nativeWarnings)}`,
    );
    assert(
      successIndex >= 0,
      `cross-profile native import succeeds: ${JSON.stringify(nativeWarnings)}`,
    );
    assert(
      nativeWarningIndex >= 0 && nativeWarningIndex < successIndex,
      "cross-profile native warning appears before import completion",
    );
  }
}

async function assertApplySmoke(page, posts, errors) {
  const before = posts.length;
  await page.getByRole("tab", { name: "System", exact: true }).click();
  await page.locator("#sp-device").getByRole("button", { name: "Apply Configuration" }).click();
  await waitForPost(
    posts,
    {
      domain: "button",
      name: "Apply Configuration",
      action: "press",
    },
    "apply configuration",
    before,
  );
  assert.deepStrictEqual(
    errors,
    [],
    "browser errors were reported during edit interactions",
  );
}

async function openPasteCardCodeDialog(page) {
  const emptyCell = page.locator(".sp-main .sp-empty-cell").first();
  assert(await emptyCell.isVisible(), "card transfer test requires an empty destination cell");
  const pos = await emptyCell.getAttribute("data-pos");
  await emptyCell.click({ button: "right", force: true });
  const menu = page.locator(".sp-ctx-menu");
  await menu.waitFor({ state: "visible" });
  const menuLabels = await menu.locator(":scope > .sp-ctx-item").allTextContents();
  assert.strictEqual(menuLabels[0].trim(), "Create Card", "empty-slot menu starts with Create Card");
  const createSubpageIndex = menuLabels.findIndex((text) => text.trim() === "Create Subpage");
  assert.strictEqual(createSubpageIndex, 1, "home empty-slot menu shows Create Subpage second");
  assert.strictEqual(menuLabels.at(-1).trim(), "Paste Code", "empty-slot menu ends with Paste Code");
  const trailingMenuStructure = await menu.locator(":scope > *").evaluateAll((elements) =>
    elements.slice(-2).map((element) =>
      element.classList.contains("sp-ctx-divider") ? "divider" : element.textContent.trim(),
    ),
  );
  assert.deepStrictEqual(
    trailingMenuStructure,
    ["divider", "Paste Code"],
    "empty-slot menu separates Paste Code from the actions above it",
  );
  await menu.getByText("Paste Code", { exact: true }).click();
  await page.locator(".sp-transfer-dialog").waitFor({ state: "visible" });
  const dialog = page.locator(".sp-transfer-dialog");
  assert.strictEqual(
    await dialog.getByRole("heading", { name: "Paste Code", exact: true }).count(),
    1,
    "paste dialog uses the concise title",
  );
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const paste = dialog.getByRole("button", { name: "Paste", exact: true });
  assert(
    await cancel.evaluate((button) =>
      button.classList.contains("sp-action-btn") && button.classList.contains("sp-cancel-btn"),
    ),
    "paste dialog cancel action uses the standard modal button style",
  );
  assert(
    await paste.evaluate((button) =>
      button.classList.contains("sp-action-btn") && button.classList.contains("sp-save-btn"),
    ),
    "paste dialog primary action uses the standard modal button style",
  );
  return { dialog, pos };
}

async function assertCardTransferSmoke(page, posts, label) {
  await page.getByRole("tab", { name: "Layout" }).click();
  const sourceCard = page.locator('.sp-main [data-slot="1"]');
  await sourceCard.click({ button: "right" });
  await page.locator(".sp-ctx-menu").waitFor({ state: "visible" });
  assert(
    await page.locator(".sp-ctx-menu").getByText("Copy Code", { exact: true }).isVisible(),
    `${label}: card context menu exposes transfer-code copying`,
  );
  let code;
  for (const mode of ["modern", "http", "denied", "blocked"]) {
    await page.evaluate((mode) => {
      window.__copyTestOriginalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      window.__copyTestOriginalExec = document.execCommand;
      window.__copiedCode = null;
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "http" ? undefined : {
        writeText: async (value) => {
          if (mode !== "modern") throw new Error("Clipboard permission denied");
          window.__copiedCode = value;
        },
      } });
      document.execCommand = (command) => {
        if (command !== "copy" || mode === "blocked") return false;
        const textarea = document.querySelector("textarea[readonly]");
        window.__copiedCode = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
        return true;
      };
      document.querySelector(".sp-banner").textContent = "";
    }, mode);
    if (mode !== "modern") {
      // The toast viewport check can redraw the card before the next copy.
      await sourceCard.click({ button: "right" });
      await page.locator(".sp-ctx-menu").waitFor({ state: "visible" });
    }
    await page.locator(".sp-ctx-menu").getByText("Copy Code", { exact: true }).click();
    await page.waitForFunction(() => !!document.querySelector(".sp-banner").textContent);
    assert.strictEqual(await page.locator(".sp-transfer-dialog").count(), 0,
      `${label}: Copy Code copies directly without a modal`);
    assert.strictEqual(await page.locator("textarea[readonly]").count(), 0,
      `${label}: copying cleans up its temporary field`);
    const copied = await page.evaluate(() => window.__copiedCode);
    if (mode === "blocked") {
      assert.strictEqual(copied, null, `${label}: blocked copying does not claim success`);
      assert(await page.locator(".sp-banner.sp-error").isVisible(), `${label}: blocked copying shows an error toast`);
      assert((await page.locator(".sp-banner").textContent()).includes("Could not copy card code"));
    } else {
      if (!code) code = copied;
      assert.strictEqual(copied, code, `${label}: ${mode} copies the exact card code`);
      assert(await page.locator(".sp-banner.sp-success").isVisible(), `${label}: copying shows a success toast`);
      const toast = page.locator(".sp-banner.sp-success");
      assert.strictEqual(await toast.textContent(), "Card code copied to clipboard.");
      if (mode === "modern") {
        const desktopViewport = page.viewportSize();
        for (const viewport of [desktopViewport, { width: 320, height: 640 }]) {
          await page.setViewportSize(viewport);
          const position = await toast.evaluate((node) => ({
            fixed: getComputedStyle(node).position === "fixed",
            left: node.offsetLeft,
            right: node.offsetLeft + node.offsetWidth,
            bottom: node.offsetTop + node.offsetHeight,
            supportTop: document.querySelector(".sp-support-btn").getBoundingClientRect().top,
          }));
          const lowerEdge = viewport.width === desktopViewport.width ? viewport.height : position.supportTop;
          const gap = lowerEdge - position.bottom;
          assert(position.fixed && position.left >= 10 && position.left <= 24 &&
            gap >= 10 && gap <= 24 && position.right <= viewport.width - 10,
          `${label}: the notification fits in the bottom-left corner at ${viewport.width}px`);
        }
        await page.setViewportSize(desktopViewport);
      }
    }
    await page.evaluate(() => {
      if (window.__copyTestOriginalClipboard) Object.defineProperty(navigator, "clipboard", window.__copyTestOriginalClipboard);
      else delete navigator.clipboard;
      document.execCommand = window.__copyTestOriginalExec;
      delete window.__copyTestOriginalClipboard;
      delete window.__copyTestOriginalExec;
      delete window.__copiedCode;
    });
  }
  const envelope = JSON.parse(code);
  assert.strictEqual(envelope.format, "espdesktop.cards", `${label}: copied card code has the format marker`);
  assert.strictEqual(envelope.version, 1, `${label}: copied card code uses version 1`);
  assert.strictEqual(envelope.cards.length, 1, `${label}: single-card code contains one card`);
  assert(String(envelope.cards[0].entity || "").includes("."), `${label}: copied code preserves the configured entity`);

  const beforePaste = posts.length;
  const destination = await openPasteCardCodeDialog(page);
  await destination.dialog.locator("textarea").fill(code);
  await destination.dialog.getByRole("button", { name: "Paste", exact: true }).click();
  await page.locator(`.sp-main [data-pos="${destination.pos}"][data-slot]`).waitFor({ state: "visible" });
  const pastedSlot = await page
    .locator(`.sp-main [data-pos="${destination.pos}"]`)
    .getAttribute("data-slot");
  await waitForAnyPost(
    posts,
    [
      { domain: "text", name: `button_${pastedSlot}_config`, action: "set" },
      { domain: "text", name: `Button ${pastedSlot} Config`, action: "set" },
    ],
    `${label}: transferred card is saved`,
    beforePaste,
  );
  assert(
    (await page.locator(".sp-banner").textContent()).includes("Card pasted"),
    `${label}: successful transfer is reported`,
  );

  const noRoom = JSON.parse(code);
  noRoom.cards = Array.from({ length: 20 }, () => ({ ...noRoom.cards[0] }));
  await page.waitForTimeout(500);
  const beforeNoRoom = posts.length;
  const noRoomDialog = await openPasteCardCodeDialog(page);
  await noRoomDialog.dialog.locator("textarea").fill(JSON.stringify(noRoom));
  await noRoomDialog.dialog.getByRole("button", { name: "Paste", exact: true }).click();
  await page.waitForFunction(() => {
    const error = document.querySelector(".sp-transfer-error");
    return error && /not enough room/.test(error.textContent || "");
  });
  assert.strictEqual(posts.length, beforeNoRoom, `${label}: an impossible bulk paste writes nothing`);

  const unknown = JSON.parse(code);
  unknown.cards[0].type = "not_a_real_card";
  await noRoomDialog.dialog.locator("textarea").fill(JSON.stringify(unknown));
  await noRoomDialog.dialog.getByRole("button", { name: "Paste", exact: true }).click();
  await page.waitForFunction(() => {
    const error = document.querySelector(".sp-transfer-error");
    return error && /does not support/.test(error.textContent || "");
  });
  assert.strictEqual(posts.length, beforeNoRoom, `${label}: an unknown card type writes nothing`);

  const oversized = JSON.parse(code);
  oversized.cards[0].label = "x".repeat(300);
  await noRoomDialog.dialog.locator("textarea").fill(JSON.stringify(oversized));
  await noRoomDialog.dialog.getByRole("button", { name: "Paste", exact: true }).click();
  await page.waitForFunction(() => {
    const error = document.querySelector(".sp-transfer-error");
    return error && /settings are too large/.test(error.textContent || "");
  });
  assert.strictEqual(posts.length, beforeNoRoom, `${label}: an oversized card config writes nothing`);
  await noRoomDialog.dialog.getByRole("button", { name: "Cancel" }).click();

  const local = JSON.parse(code);
  local.cards[0] = {
    ...local.cards[0],
    entity: "local_action_key",
    type: "action",
    sensor: "local",
    options: "",
  };
  const localDialog = await openPasteCardCodeDialog(page);
  await localDialog.dialog.locator("textarea").fill(JSON.stringify(local));
  await localDialog.dialog.getByRole("button", { name: "Paste", exact: true }).click();
  await localDialog.dialog.locator(".sp-transfer-error").getByText(/does not support/).waitFor();
  assert.strictEqual(posts.length, beforeNoRoom, `${label}: a retired Action paste writes nothing`);
  await localDialog.dialog.getByRole("button", { name: "Cancel" }).click();

  const subpage = JSON.parse(code);
  subpage.cards[0] = {
    entity: "",
    label: "Transferred Page",
    icon: "Folder",
    icon_on: "Auto",
    sensor: "generic",
    unit: "",
    type: "subpage",
    precision: "",
    options: "",
    size: 3,
    subpage: {
      order: ["B", "1"],
      back_label: "Return",
      buttons: [{
        entity: "switch.transferred",
        label: "Transferred Switch",
        icon: "Toggle Switch",
        icon_on: "Toggle Switch",
        sensor: "",
        unit: "",
        type: "",
        precision: "",
        options: "",
      }],
    },
  };
  const beforeSubpage = posts.length;
  const subpageDialog = await openPasteCardCodeDialog(page);
  await subpageDialog.dialog.locator("textarea").fill(JSON.stringify(subpage));
  await subpageDialog.dialog.getByRole("button", { name: "Paste", exact: true }).click();
  const transferredSubpage = page
    .locator(".sp-main [data-slot]")
    .filter({ hasText: "Transferred Page" })
    .first();
  await transferredSubpage.waitFor({ state: "visible" });
  const subpageSlot = await transferredSubpage.getAttribute("data-slot");
  await waitForPost(
    posts,
    { domain: "text", name: `Subpage ${subpageSlot} Config`, action: "set" },
    `${label}: transferred subpage configuration is saved`,
    beforeSubpage,
  );
}

async function assertClockBarEditorSmoke(page, posts, label) {
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.waitForSelector("#sp-screen.sp-page.active");

  async function openClockBarContextMenu(item, expectedAction) {
    await page
      .locator(`[data-clockbar-item="${item}"]`)
      .click({ button: "right", force: true });
    await page.locator(".sp-ctx-menu").waitFor({ state: "visible" });
    assert(
      await page
        .locator(".sp-ctx-menu")
        .getByText(expectedAction, { exact: true })
        .isVisible(),
      `${label}: right click menu for ${item} shows ${expectedAction}`,
    );
  }

  const fixedItems = [
    { selector: '[data-clockbar-item="time"]', section: "left" },
    { selector: '[data-clockbar-item="network"]', section: "right" },
  ];
  for (const item of fixedItems) {
    const selector = `${item.selector}[data-clockbar-section="${item.section}"]`;
    const box = await page.locator(selector).boundingBox();
    assert(box, `${label}: ${selector} remains visible in the fixed clock bar`);
  }

  assert.strictEqual(
    await page.locator("[data-clockbar-add]").count(),
    0,
    `${label}: clock bar add controls are removed`,
  );
  assert.strictEqual(
    await page.locator("#sp-clockbar-add-type").count(),
    0,
    `${label}: add-item selector is not present`,
  );
  assert.strictEqual(
    await page.locator("#sp-clockbar-weather-entity").count(),
    0,
    `${label}: clock bar weather editor is not present`,
  );
  assert.strictEqual(
    await page.locator("#sp-clockbar-temperature-entity-0").count(),
    0,
    `${label}: clock bar temperature editor is not present`,
  );

  const before = posts.length;
  await page
    .locator('.sp-clockbar-section[data-clockbar-section="left"]')
    .hover();
  await page.locator('[data-clockbar-item="time"]').click({ force: true });
  assert.strictEqual(
    await page
      .locator('[data-clockbar-item="time"]')
      .getAttribute("data-clockbar-section"),
    "left",
    `${label}: clock bar time remains in the fixed left section`,
  );
  assert.strictEqual(
    await page.locator(".sp-selection-bar.sp-visible").count(),
    1,
    `${label}: clicking clock bar selects an item`,
  );
  assert(
    (await page.locator(".sp-selection-bar").textContent()).includes(
      "Clock selected",
    ),
    `${label}: clock selection is labelled`,
  );
  assert.strictEqual(
    await page.getByRole("button", { name: "Edit", exact: true }).count(),
    0,
    `${label}: clock selection has no Edit button`,
  );
  assert.strictEqual(
    await page
      .getByRole("button", { name: "Clock bar actions", exact: true })
      .count(),
    0,
    `${label}: clock selection does not expose redundant actions menu button`,
  );
  const selectedClockItem = page.locator('[data-clockbar-item="time"]');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const selectedClockStyle = await selectedClockItem.evaluate((el) => {
    var style = getComputedStyle(el);
    return {
      borderColor: style.borderTopColor,
      backgroundColor: style.backgroundColor,
    };
  });
  await selectedClockItem.hover();
  await page.waitForTimeout(250);
  const hoveredSelectedClockStyle = await selectedClockItem.evaluate((el) => {
    var style = getComputedStyle(el);
    return {
      borderColor: style.borderTopColor,
      backgroundColor: style.backgroundColor,
    };
  });
  assert.notStrictEqual(
    selectedClockStyle.borderColor,
    "rgba(0, 0, 0, 0)",
    `${label}: selected clock bar item has a visible border`,
  );
  assert.deepStrictEqual(
    hoveredSelectedClockStyle,
    selectedClockStyle,
    `${label}: selected clock bar item keeps its selected styling while hovered`,
  );
  await openClockBarContextMenu("time", "Hide Clock");
  await page
    .locator(".sp-ctx-menu")
    .getByText("Hide Clock", { exact: true })
    .click();
  await waitForPost(
    posts,
    { domain: "switch", name: "screen__clock_bar_time", action: "turn_off" },
    `${label}: hiding clock posts clock switch`,
    before,
  );
  assert(
    (
      await page.locator('[data-clockbar-item="time"]').getAttribute("class")
    ).includes("sp-clockbar-hidden"),
    `${label}: hidden clock is greyed in preview`,
  );
  await openClockBarContextMenu("time", "Show Clock");
  await page
    .locator(".sp-ctx-menu")
    .getByText("Show Clock", { exact: true })
    .click();
  await waitForPost(
    posts,
    { domain: "switch", name: "screen__clock_bar_time", action: "turn_on" },
    `${label}: showing clock posts clock switch`,
    before,
  );

  await openClockBarContextMenu("network", "Hide Connectivity");
  assert(
    (await page.locator(".sp-selection-bar").textContent()).includes(
      "Connectivity selected",
    ),
    `${label}: connectivity selection is labelled`,
  );
  assert.strictEqual(
    await page.getByRole("button", { name: "Edit", exact: true }).count(),
    0,
    `${label}: connectivity selection has no Edit button`,
  );
  await page
    .locator(".sp-ctx-menu")
    .getByText("Hide Connectivity", { exact: true })
    .click();
  await waitForPost(
    posts,
    {
      domain: "switch",
      name: "screen__network_status_icon",
      action: "turn_off",
    },
    `${label}: hiding connectivity posts network switch`,
    before,
  );
  assert(
    (
      await page.locator('[data-clockbar-item="network"]').getAttribute("class")
    ).includes("sp-clockbar-hidden"),
    `${label}: hidden connectivity is greyed in preview`,
  );
  const hiddenNetworkPreview = await page
    .locator('[data-clockbar-item="network"] .sp-network-preview')
    .evaluate((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        className: el.className,
        opacity: style.opacity,
        width: rect.width,
        height: rect.height,
      };
    });
  assert(
    hiddenNetworkPreview.className.includes("sp-visible"),
    `${label}: hidden connectivity keeps the preview icon visible`,
  );
  assert.strictEqual(
    hiddenNetworkPreview.opacity,
    "1",
    `${label}: hidden connectivity icon is not faded out by its own style`,
  );
  assert(
    hiddenNetworkPreview.width > 0 && hiddenNetworkPreview.height > 0,
    `${label}: hidden connectivity icon remains measurable`,
  );
  await openClockBarContextMenu("network", "Show Connectivity");
  await page
    .locator(".sp-ctx-menu")
    .getByText("Show Connectivity", { exact: true })
    .click();
  await waitForPost(
    posts,
    {
      domain: "switch",
      name: "screen__network_status_icon",
      action: "turn_on",
    },
    `${label}: showing connectivity posts network switch`,
    before,
  );

  assert.strictEqual(
    await page.locator('[data-clockbar-item="temperature"]').count(),
    0,
    `${label}: the clock bar contains only clock and connectivity controls`,
  );
  const leftSectionBox = await page.locator('.sp-clockbar-section[data-clockbar-section="left"]').boundingBox();
  const timeBox = await page.locator('[data-clockbar-item="time"]').boundingBox();
  assert(leftSectionBox && timeBox, `${label}: left clock bar time is measurable`);
  assert(Math.abs(timeBox.x - leftSectionBox.x) <= 1,
    `${label}: clock remains aligned to the left section`);

  const topbarBox = await page.locator(".sp-topbar").boundingBox();
  const networkBox = await page
    .locator('[data-clockbar-item="network"][data-clockbar-section="right"]')
    .boundingBox();
  const firstCardBox = await page.locator(".sp-main > *").first().boundingBox();
  assert(
    topbarBox && networkBox,
    `${label}: network status has a visible bounded area`,
  );
  assert(
    networkBox.y > topbarBox.y,
    `${label}: network status does not touch the top of the clock bar`,
  );
  assert(
    networkBox.y + networkBox.height < topbarBox.y + topbarBox.height,
    `${label}: network status does not touch the bottom of the clock bar`,
  );
  assert(firstCardBox, `${label}: first card has a visible bounded area`);
  assert(
    networkBox.y + networkBox.height < firstCardBox.y,
    `${label}: network status stays clear of the first card row`,
  );

  await page.getByRole("tab", { name: "System", exact: true }).click();
  await page.waitForSelector("#sp-device.sp-page.active");
  const timeSettingsCard = page
    .locator("#sp-device .card")
    .filter({
      has: page.locator(".card-header h3", { hasText: /^Time$/ }),
    })
    .first();
  assert(await timeSettingsCard.isVisible(), `${label}: Time is visible on the System tab`);
  const timeSettingsText = await timeSettingsCard.textContent();
  assert(
    timeSettingsText.includes("Timezone"),
    `${label}: timezone remains in global time settings`,
  );
  assert(
    timeSettingsText.includes("Clock Format"),
    `${label}: clock format remains in global time settings`,
  );
  await page.getByRole("tab", { name: "Screen", exact: true }).click();
  await page.waitForSelector("#sp-settings.sp-page.active");
  const clockBarCard = page
    .locator("#sp-settings .card")
    .filter({ hasText: "Clock Bar" })
    .first();
  assert(await clockBarCard.isVisible(), `${label}: Clock Bar is visible on the Screen tab`);
  const clockBarText = await clockBarCard.textContent();
  assert(
    clockBarText.includes("Show Clock Bar"),
    `${label}: clock bar settings keep the master toggle`,
  );
  assert(
    !clockBarText.includes("Show Network Status Icon"),
    `${label}: network toggle moved out of clock bar settings`,
  );
  assert(
    !clockBarText.includes("Outdoor Temperature"),
    `${label}: outdoor controls moved out of clock bar settings`,
  );
  assert(
    !clockBarText.includes("Indoor Temperature"),
    `${label}: indoor controls moved out of clock bar settings`,
  );
  assert(
    !clockBarText.includes("Show Degree Symbol"),
    `${label}: degree-symbol control moved out of clock bar settings`,
  );
  await page.getByRole("tab", { name: "Layout" }).click();
}

function panelConfigLabel(document, slot) {
  return String(document.buttons[slot] || "").split(";")[1] || "";
}

async function waitForNativeState(nativeState, predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let stableSince = 0;
  let stablePutCount = -1;
  while (Date.now() < deadline) {
    const putCount = nativeState.puts.length;
    if (predicate()) {
      if (stablePutCount !== putCount) {
        stablePutCount = putCount;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 250) {
        return;
      }
    } else {
      stableSince = 0;
      stablePutCount = -1;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`${label}: native state did not settle (${nativeState.requests.join(", ")})`);
}

async function seedNativeDocument(page, nativeState) {
  await page.waitForFunction(() => window.__eventSources?.length > 0);
  await page.evaluate(
    (events) => window.__seedEspState(events),
    nativeDocumentEvents(nativeState.document),
  );
  await page.waitForSelector('.sp-main [data-slot="2"]');
  await page.waitForFunction(() => document.querySelector(".sp-main")?.getAttribute("aria-disabled") === "false");
}

async function assertInlineCardNames(page, nativeState, label) {
  const title = page.locator('.sp-main [data-slot="1"] .sp-editable-title');
  const input = page.getByRole("textbox", { name: "Card name", exact: true });
  const fields = value => value.startsWith("~") ? value.slice(1).split(",").map(decodeConfigField) : value.split(";");
  const original = nativeState.document.buttons[1];
  const originalLabel = panelConfigLabel(nativeState.document, 1);
  await title.click();
  assert.strictEqual(await input.inputValue(), originalLabel, `${label}: starts with the saved name`);
  assert.strictEqual(await page.locator(".sp-settings-overlay.sp-visible").count(), 0);
  await input.fill('Kitchen <&> "; café');
  assert.strictEqual(nativeState.document.buttons[1], original, `${label}: typing does not save`);
  // A device update must not discard the editor, value, focus, or text selection.
  await input.evaluate(el => el.setSelectionRange(2, 5));
  await seedNativeDocument(page, nativeState);
  await page.waitForFunction(() => {
    const el = document.querySelector(".sp-card-name-input");
    return el === document.activeElement && el.selectionStart === 2 && el.selectionEnd === 5;
  });
  assert.strictEqual(await input.inputValue(), 'Kitchen <&> "; café');
  await input.press("Enter");
  await waitForNativeState(nativeState,
    () => fields(nativeState.document.buttons[1])[1] === 'Kitchen <&> "; café', `${label}: Enter saves`);
  assert.strictEqual(await title.textContent(), 'Kitchen <&> "; café', `${label}: names render as text`);
  assert.strictEqual(await input.count(), 0);
  const renamed = nativeState.document.buttons[1];
  assert.deepStrictEqual(fields(renamed).filter((_, i) => i !== 1),
    fields(original).filter((_, i) => i !== 1), `${label}: only the label changes`);
  await title.press("Enter");
  await input.fill("Cancelled");
  await input.press("Escape");
  assert.strictEqual(nativeState.document.buttons[1], renamed, `${label}: Escape cancels`);
  await title.click();
  await input.fill("Also cancelled");
  await page.locator(".sp-brand").click();
  await page.waitForFunction(() => !document.querySelector(".sp-card-name-input"));
  assert.strictEqual(nativeState.document.buttons[1], renamed, `${label}: clicking away cancels`);
  await title.click();
  await input.fill("   ");
  await input.press("Enter");
  await waitForNativeState(nativeState, () => fields(nativeState.document.buttons[1])[1] === "", `${label}: empty name restores fallback`);
  await title.click();
  await input.fill(originalLabel);
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true, bubbles: true });
  assert.strictEqual(await input.count(), 1, `${label}: composition Enter does not save`);
  assert.strictEqual(await page.locator('.sp-main [data-slot="1"]').getAttribute("draggable"), "false");
  await input.press("Enter");
  await waitForNativeState(nativeState, () => nativeState.document.buttons[1] === original, `${label}: restore main name`);
  await title.click({ modifiers: ["Control"] });
  assert.strictEqual(await input.count(), 0, `${label}: modified clicks still select`);
  await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
  await title.click();
  await input.fill("Subpage lamp");
  await input.press("Enter");
  await waitForNativeState(nativeState, () => nativeState.document.subpages[3].includes("Subpage lamp"), `${label}: save subpage card name`);
  assert.strictEqual(nativeState.document.buttons[1], original, `${label}: subpage rename leaves main alone`);
  await title.click();
  await input.fill("Kitchen");
  await input.press("Enter");
  await waitForNativeState(nativeState, () => nativeState.document.subpages[3].includes("Kitchen") && !nativeState.document.subpages[3].includes("Subpage lamp"), `${label}: restore subpage name`);
  const back = page.locator('.sp-back-btn .sp-editable-title');
  await back.click();
  await input.fill("Return home");
  await input.press("Enter");
  await waitForNativeState(nativeState, () => nativeState.document.subpages[3].includes("Return home"), `${label}: save Back name`);
  assert.strictEqual(await back.textContent(), "Return home");
  await back.click();
  await input.fill("Back");
  await input.press("Enter");
  await waitForNativeState(nativeState, () => !nativeState.document.subpages[3].includes("Return home"), `${label}: restore Back name`);
  await page.locator(".sp-back-btn .sp-back-hit").click();
  nativeState.document.buttons[1] = "camera.garden;Garden;Auto;Auto;;;image;;image_label";
  await seedNativeDocument(page, nativeState);
  await title.click();
  await input.fill("Garden camera");
  const box = await input.boundingBox();
  assert(box.width > 20 && box.height > 10, `${label}: image name editor is visible`);
  await input.press("Enter");
  await waitForNativeState(nativeState, () => fields(nativeState.document.buttons[1])[1] === "Garden camera", `${label}: image title saves`);
  assert.strictEqual(await title.locator(".sp-image-label-main").textContent(), "Garden camera");
  for (const [type, config] of [
    ["climate status", "climate.hall;Hidden name;Thermostat;Auto;;;climate;;label_display=status"],
    ["climate actual", "climate.hall;Hidden name;Thermostat;Auto;;;climate;;label_display=actual"],
    ["climate target", "climate.hall;Hidden name;Thermostat;Auto;;;climate;;label_display=target"],
    ["climate status with icon", "climate.hall;Hidden name;Thermostat;Auto;;;climate;;label_display=status,number_display=icon"],
    ["sensor text", ";Hidden name;Cog;Auto;sensor.machine;;sensor;text"],
    ["local sensor text", "room_temp;Hidden name;Cog;Auto;local;;sensor;text"],
    ["media play status", "media_player.living;Hidden name;Auto;Auto;play_pause;;media;state"],
    ["media position status", "media_player.living;Hidden name;Auto;Auto;position;;media;state"],
    ["media controls status", "media_player.living;Hidden name;Auto;Auto;control_modal;;media;;label_display=status"],
    ["media controls default status", "media_player.living;Hidden name;Auto;Auto;control_modal;;media"],
    ["media track details", "media_player.living;Hidden name;Auto;Auto;now_playing;;media"],
    ["alarm status", "alarm_control_panel.home;Hidden name;Security;Auto;;;alarm;;label_display=status"],
    ["garage status", "cover.garage;Hidden name;Garage;Auto;;;garage;;label_display=status"],
    ["gate status", "cover.gate;Hidden name;Gate;Auto;;;gate;;label_display=status"],
    ["weather condition", "weather.home;Hidden name;Auto;Auto;;;weather"],
    ["legacy weather forecast", "weather.home;Hidden name;Auto;Auto;;;weather_forecast"],
  ]) {
    nativeState.document.buttons[1] = config;
    await seedNativeDocument(page, nativeState);
    const card = page.locator('.sp-main [data-slot="1"]');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.strictEqual(await card.locator(".sp-editable-title").count(), 0,
      `${label}: ${type} does not offer renaming for generated text`);
    const generatedLabel = card.locator(".sp-btn-label");
    if (await generatedLabel.count()) {
      assert.strictEqual(await generatedLabel.getAttribute("tabindex"), null);
      await page.locator(".sp-brand").click();
      await generatedLabel.click();
      assert(await card.evaluate(el => el.classList.contains("sp-selected")),
        `${label}: clicking ${type} text still selects its card`);
      assert.strictEqual(await input.count(), 0);
    }
  }
  // The same families must still rename and persist when they display the name.
  for (const [type, config] of [
    ["climate", "climate.hall;Custom name;Thermostat;Auto;;;climate;;label_display=label"],
    ["climate icon", "climate.hall;Custom name;Thermostat;Auto;;;climate;;label_display=label,number_display=icon"],
    ["subpage", ";Custom name;Home;Auto;;;subpage"],
    ["media controls", "media_player.living;Custom name;Auto;Auto;control_modal;;media;;label_display=label"],
    ["media playback", "media_player.living;Custom name;Auto;Auto;play_pause;;media"],
    ["media position", "media_player.living;Custom name;Auto;Auto;position;;media"],
    ["alarm", "alarm_control_panel.home;Custom name;Security;Auto;;;alarm;;label_display=name"],
    ["garage", "cover.garage;Custom name;Garage;Auto;;;garage;;label_display=label"],
    ["gate", "cover.gate;Custom name;Gate;Auto;;;gate;;label_display=label"],
  ]) {
    nativeState.document.buttons[1] = config;
    await seedNativeDocument(page, nativeState);
    await page.waitForFunction(() => document.querySelector('.sp-main [data-slot="1"] .sp-editable-title')?.textContent === "Custom name");
    await title.click();
    const renamed = "Renamed " + type;
    await input.fill(renamed);
    await input.press("Enter");
    await waitForNativeState(nativeState, () => fields(nativeState.document.buttons[1])[1] === renamed,
      `${label}: ${type} name mode persists the rename`);
    await seedNativeDocument(page, nativeState);
    await page.waitForFunction(value => document.querySelector('.sp-main [data-slot="1"] .sp-editable-title')?.textContent === value, renamed);
  }
  nativeState.document.buttons[1] = original;
  await seedNativeDocument(page, nativeState);
}

async function assertNativeProfileJourney(browser, testCase) {
  const nativeState = nativeConfigState(testCase.slug);
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, {
    nativeState,
    homeAssistantSupport: true,
    connectorsStatus: {
      onboarding_complete: true,
      home_assistant: { available: true, configured: true, connected: true, actions_confirmed: true },
      mac_companion: testCase.slug === "guition-esp32-s3-4848s040"
        ? { available: true, configured: true, paired: true, connected: true }
        : { available: false, configured: false, paired: false, connected: false },
    },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await seedNativeDocument(page, nativeState);

    await assertInlineCardNames(page, nativeState, testCase.name);
    await assertSubpageBackCard(page, testCase.name, nativeState);
    nativeState.document.buttons[1] = ";Kitchen;Folder;Auto;;;subpage";
    await seedNativeDocument(page, nativeState);

    const card = page.locator('.sp-main [data-slot="1"]');
    assert(
      (await card.textContent()).includes("Kitchen"),
      `${testCase.name}: card preview renders before editing`,
    );
    if (!(await card.evaluate(node => node.classList.contains("sp-selected")))) {
      await card.locator(".sp-btn-icon").click();
    }
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForSelector(".sp-settings-overlay.sp-visible");
    if (!(await page.locator("#sp-inp-label").isVisible())) {
      await page
        .locator(".sp-settings-modal .sp-disclosure")
        .filter({ hasText: "Card Settings" })
        .first()
        .locator(".sp-disclosure-button")
        .click();
    }
    await page.locator("#sp-inp-label").waitFor({ state: "visible" });
    const editedLabel = `Accepted ${testCase.slug}`;
    await page.locator("#sp-inp-label").fill(editedLabel);
    const beforeSave = nativeState.puts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(
      (label) => document.querySelector('.sp-main [data-slot="1"]')?.textContent?.includes(label),
      editedLabel,
    );
    await waitForNativeState(
      nativeState,
      () => nativeState.puts.length > beforeSave &&
        panelConfigLabel(nativeState.document, 1) === editedLabel,
      `${testCase.name}: native card save`,
    );
    assert.strictEqual(
      panelConfigLabel(nativeState.document, 1),
      editedLabel,
      `${testCase.name}: card edit saves through native PanelConfig ` +
        `(PUT labels: ${nativeState.puts.map((put) => panelConfigLabel(put.document, 1)).join(" -> ")})`,
    );

    const sourceCount = await page.evaluate(() => window.__eventSources.length);
    await page.evaluate(() => window.__disconnectEsp());
    await page.waitForFunction(
      (count) => window.__eventSources.length > count,
      sourceCount,
      // Production retries after five seconds; allow scheduling headroom in
      // the full nine-profile suite and poll independently of animation frames.
      { timeout: 15000, polling: 100 },
    );
    await seedNativeDocument(page, nativeState);
    assert(
      (await page.locator('.sp-main [data-slot="1"]').textContent()).includes(editedLabel),
      `${testCase.name}: reconnect reloads the saved card`,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await seedNativeDocument(page, nativeState);
    assert(
      (await page.locator('.sp-main [data-slot="1"]').textContent()).includes(editedLabel),
      `${testCase.name}: reload retains the native card edit`,
    );

    await openBackupControls(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    assert(downloadPath, `${testCase.name}: backup export creates a file`);
    const backup = JSON.parse(fs.readFileSync(downloadPath, "utf8"));
    assert.strictEqual(backup.version, 2, `${testCase.name}: backup export uses v2`);
    assert.strictEqual(
      backup.native_config.device_profile,
      testCase.slug,
      `${testCase.name}: backup includes the native device profile`,
    );

    const restoredLabel = `Restored ${testCase.slug}`;
    const restoredDocument = JSON.parse(JSON.stringify(nativeState.document));
    const restoredFields = restoredDocument.buttons[2].split(";");
    restoredFields[1] = restoredLabel;
    restoredDocument.buttons[2] = restoredFields.join(";");
    restoredDocument.settings.future_native_setting = `native-${testCase.slug}`;
    backup.buttons[1].label = `Readable ${testCase.slug}`;
    backup.native_config = createPanelConfigBackupPayload(
      encodePanelConfig(restoredDocument),
    );
    const beforeRestore = nativeState.puts.length;
    await importBackup(page, backup, `native-restore-${testCase.slug}`);
    await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor({ timeout: 15000 });
    await waitForNativeState(
      nativeState,
      () => nativeState.puts.length > beforeRestore &&
        panelConfigLabel(nativeState.document, 2) === restoredLabel,
      `${testCase.name}: native backup restore`,
    );
    assert.strictEqual(
      panelConfigLabel(nativeState.document, 2),
      restoredLabel,
      `${testCase.name}: backup restore writes the native document`,
    );
    assert.strictEqual(
      nativeState.document.settings.future_native_setting,
      `native-${testCase.slug}`,
      `${testCase.name}: backup restore retains native-only settings`,
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await seedNativeDocument(page, nativeState);
    assert(
      (await page.locator('.sp-main [data-slot="2"]').textContent()).includes(restoredLabel),
      `${testCase.name}: restored backup survives a reload`,
    );
    assert.deepStrictEqual(errors, [], `${testCase.name}: native journey has no browser errors`);
  } finally {
    await context.close();
  }
}

async function assertMacLockCard(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const nativeState = nativeConfigState(testCase.slug);
  nativeState.document.buttons = {
    1: "shortcut.command+control+q;Mac Lock;Lock;Auto;;;companion",
    2: "shortcut.command+control+q;Mac Lock;Lock;Auto;;;companion;;app_shortcut_preset=custom",
  };
  nativeState.document.settings.button_order = "1,2";
  nativeState.document.subpages = {};
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState });
  const page = await context.newPage();
  await installFakeEventSource(page);
  const modal = page.locator(".sp-settings-overlay.sp-visible .sp-settings-modal");
  const assertLockEditor = async () => {
    await modal.getByText("Mac Lock", { exact: true }).first().waitFor();
    assert.strictEqual(await modal.locator('[id$="shortcut-type"], [id$="shortcut-panel"], #sp-card-type-picker').count(), 0);
    await modal.getByRole("button", { name: "Card Settings", exact: true }).waitFor();
    await modal.getByRole("button", { name: "Custom Colours", exact: true }).waitFor();
  };
  const editCard = async slot => {
    await page.locator('.sp-main [data-slot="' + slot + '"]').click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
  };
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.getByRole("tab", { name: "Layout", exact: true }).click();
    await seedNativeDocument(page, nativeState);
    await page.locator(".sp-main .sp-empty-cell").first().click();
    await page.getByRole("button", { name: "Lock Machine card type", exact: true }).click();
    await assertLockEditor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () =>
      nativeState.document.buttons[3] === "shortcut.command+control+q;Mac Lock;Lock;Auto;;;companion_mac_lock",
    "Mac Lock saves as a dedicated card type");
    await editCard(1);
    await assertLockEditor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.reload();
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.getByRole("tab", { name: "Layout", exact: true }).click();
    await seedNativeDocument(page, nativeState);
    await page.locator('.sp-main [data-slot="3"] .sp-btn-icon.mdi-lock').waitFor();
    await editCard(3);
    await assertLockEditor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await editCard(2);
    await modal.getByRole("tablist", { name: "Shortcut type" }).waitFor();
    console.log("Mac Lock creation, legacy editing, reload and independent keyboard shortcuts passed.");
  } finally {
    await context.close();
  }
}

async function assertShortcutCatalogSettings(browser, testCase) {
  if (testCase.slug !== "guition-esp32-s3-4848s040") return;
  const nativeState = nativeConfigState(testCase.slug);
  nativeState.document.buttons[1] = "shortcut.command+a;;Shortcut Command;Auto;;;companion;;";
  nativeState.document.buttons[4] = "com.apple.Safari;Safari;Auto;Auto;;;companion;;app_shortcuts";
  nativeState.document.subpages[4] = "~B,1|companion,shortcut.command%2Bl,Address,Keyboard";
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState });
  const page = await context.newPage();
  await installFakeEventSource(page);
  const toggles = ["Shortcut", "Card Settings", "Custom Colours"].map(name => page.getByRole("button", { name, exact: true }));
  const [shortcutToggle, settingsToggle, coloursToggle] = toggles;
  const panels = toggles.map(toggle => page.locator(".sp-disclosure").filter({ has: toggle }));
  const [shortcutPanel, settingsPanel, coloursPanel] = panels;
  async function openCard() {
    await page.locator('.sp-main [data-slot="1"]').click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.waitForSelector(".sp-settings-overlay.sp-visible");
  }
  async function saveCard() {
    const before = nativeState.puts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () => nativeState.puts.length > before, "shortcut card save");
  }
  async function assertPanelSpacing() {
    const [shortcut, settings, colours] = await Promise.all(panels.map(panel => panel.boundingBox()));
    const shortcutGap = settings.y - shortcut.y - shortcut.height;
    const coloursGap = colours.y - settings.y - settings.height;
    assert.ok(Math.abs(shortcutGap - 14) < 1 && Math.abs(coloursGap - 14) < 1,
      `Expected 14px shortcut panel gaps, got ${shortcutGap}px and ${coloursGap}px`);
  }
  async function assertPanelBottomPadding(panel, control, label) {
    const [box, field] = await Promise.all([panel.boundingBox(), control.boundingBox()]);
    const gap = box.y + box.height - field.y - field.height;
    assert.ok(Math.abs(gap - 25) < 1, `${label} should have 24px of bottom padding plus the border, got ${gap}px`);
  }
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources && window.__eventSources.length > 0);
    await seedNativeDocument(page, nativeState);
    // The grid can replace the icon while loading the saved layout.
    await page.waitForFunction(expectedGlyph => {
      const icons = document.querySelectorAll('.sp-main [data-slot="1"] .mdi-apple-keyboard-command');
      return icons.length === 1 && getComputedStyle(icons[0], "::before").content.includes(expectedGlyph);
    }, String.fromCodePoint(0xF0633));
    await openCard();
    const type = page.getByRole("tablist", { name: "Shortcut type" });
    const custom = type.getByRole("tab", { name: "Custom", exact: true });
    const application = type.getByRole("tab", { name: "Application", exact: true });
    const app = page.locator('[id$="shortcut-catalog-app"]');
    const action = page.locator('[id$="shortcut-catalog-action"]');
    const search = page.getByRole("searchbox", { name: "Search by name or keys" });
    assert.strictEqual(await custom.getAttribute("aria-selected"), "true", "existing custom shortcuts open the Custom tab");
    assert.strictEqual(await page.locator('[id$="companion-shortcut"]').count(), 0, "the recording field is removed");
    await custom.press("ArrowRight");
    assert.strictEqual(await application.getAttribute("aria-selected"), "true");
    assert(await application.evaluate(tab => tab === document.activeElement), "arrow keys focus the selected tab");
    assert(await page.getByRole("tabpanel", { name: "Application" }).isVisible());
    assert.strictEqual(await shortcutPanel.locator('[id$="shortcut-catalog-app"]').count(), 1);
    assert.strictEqual(await shortcutPanel.locator('[id$="shortcut-catalog-action"]').count(), 1);
    await shortcutToggle.click();
    assert.strictEqual(await app.isVisible(), false);
    assert.strictEqual(await action.isVisible(), false);
    await assertPanelSpacing();
    await shortcutToggle.click();
    await assertPanelBottomPadding(shortcutPanel, action, "Application Shortcut field");
    await assertPanelSpacing();
    assert.strictEqual(await action.isDisabled(), true, "choose an app first");
    const appLabels = await app.locator("option").allTextContents();
    assert.strictEqual(appLabels[0], "Choose an app…");
    assert(appLabels.includes("Safari") && appLabels.includes("Slack") && appLabels.includes("Figma"),
      "the Application tab includes bundled presets for Safari and other apps");
    const names = appLabels.slice(1);
    assert.deepStrictEqual(names, [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })));
    await app.selectOption("com.apple.Safari");
    const safariTemplate = JSON.parse(fs.readFileSync(
      path.join(ROOT, "product", "v2", "app_shortcuts", "safari.json"),
      "utf8",
    ));
    const safariShortcutCount = safariTemplate.shortcuts.length + (safariTemplate.safariShortcuts?.length || 0) + (safariTemplate.moreShortcuts?.length || 0);
    assert.strictEqual(
      await action.locator("option").count(),
      safariShortcutCount + 1,
      "Safari catalog shortcuts plus placeholder",
    );
    const reloadPreset = "app_shortcut_preset=com.apple.Safari%3A2";
    for (const query of ["reload", "Cmd+R", "⌘R"]) {
      await search.fill(query);
      const results = await action.locator("option").allTextContents();
      assert(results.length < safariShortcutCount + 1);
      assert(results.includes("Reload (⌘R)"), query);
    }
    await search.fill("ctrl shift tab");
    assert((await action.locator("option").allTextContents()).includes("Previous Tab (⌃⇧Tab)"));
    await search.fill("tab");
    assert((await action.locator("option").allTextContents()).includes("Next Field (Tab)"));
    await search.fill("zzzz");
    await page.getByRole("status").filter({ hasText: "No matching shortcuts" }).waitFor();
    assert.strictEqual(await action.locator("option").count(), 1);
    const beforeInvalidSave = nativeState.puts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.strictEqual(nativeState.puts.length, beforeInvalidSave, "incomplete catalog choice cannot save");
    await search.fill("reload");
    await action.selectOption(reloadPreset);
    assert.strictEqual(await search.inputValue(), "reload", "choosing a shortcut keeps the filter");
    await search.fill("zzzz");
    assert.strictEqual(await action.inputValue(), reloadPreset, "filtering keeps the selected shortcut");
    await search.fill("");
    assert.strictEqual(await action.locator("option").count(), safariShortcutCount + 1);
    await saveCard();
    assert(String(nativeState.document.buttons[1]).includes("app_shortcut_preset=com.apple.Safari%3A2"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources && window.__eventSources.length > 0);
    await seedNativeDocument(page, nativeState);
    await openCard();
    assert.strictEqual(await application.getAttribute("aria-selected"), "true", "saved presets open the Application tab");
    await application.click();
    assert.strictEqual(await app.inputValue(), "com.apple.Safari");
    assert.strictEqual(await action.inputValue(), "app_shortcut_preset=com.apple.Safari%3A2");
    const slack = require("../product/v2/app_shortcuts/slack.json");
    const slackPreset = "app_shortcut_preset=" + slack.appId + "%3A" + slack.shortcuts[0].id;
    await app.selectOption("com.apple.FinalCut");
    assert((await action.locator("option").count()) > 350, "Final Cut Pro has a large catalog");
    await search.fill("blade at playhead");
    assert.deepStrictEqual(await action.locator("option").allTextContents(),
      ["Choose a shortcut…", "Blade at Playhead (⌘B)"]);
    await search.fill("Cmd+B");
    assert((await action.locator("option").allTextContents()).includes("Blade at Playhead (⌘B)"));
    await search.fill("reload");
    await app.selectOption(slack.appId);
    assert.strictEqual(await search.inputValue(), "", "switching apps clears the filter");
    assert.strictEqual(await application.getAttribute("aria-selected"), "true", "changing apps keeps the Application tab selected");
    await action.selectOption(slackPreset);
    await saveCard();
    assert(String(nativeState.document.buttons[1]).includes(slackPreset));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources && window.__eventSources.length > 0);
    await seedNativeDocument(page, nativeState);
    await openCard();
    assert.strictEqual(await application.getAttribute("aria-selected"), "true");
    assert.strictEqual(await app.inputValue(), slack.appId);
    assert.strictEqual(await action.inputValue(), slackPreset);
    await custom.click();
    assert(await page.getByRole("tabpanel", { name: "Custom" }).isVisible());
    await page.locator('[id$="shortcut-key"]').selectOption("a");
    await saveCard();
    await openCard();
    assert.strictEqual(await custom.getAttribute("aria-selected"), "true", "Custom tab selection survives save");
    assert.strictEqual(await page.locator('[id$="shortcut-key"]').inputValue(), "a");
    assert.strictEqual(await shortcutPanel.locator('[id$="shortcut-key"]').count(), 1, "key is inside Shortcut panel");
    assert.strictEqual(await shortcutPanel.getByRole("group", { name: "Shortcut modifiers" }).count(), 1, "modifiers are inside Shortcut panel");
    await shortcutToggle.click();
    assert.strictEqual(await shortcutPanel.locator('[id$="shortcut-key"]').isVisible(), false);
    await assertPanelSpacing();
    await shortcutToggle.click();
    const modifiers = page.getByRole("group", { name: "Shortcut modifiers" });
    const command = modifiers.getByRole("button", { name: "⌘ Command", exact: true });
    const shift = modifiers.getByRole("button", { name: "⇧ Shift", exact: true });
    const control = modifiers.getByRole("button", { name: "⌃ Control", exact: true });
    const key = page.locator('[id$="shortcut-key"]');
    await settingsToggle.click();
    const icon = settingsPanel.getByRole("textbox", { name: "Icon", exact: true });
    await coloursToggle.click();
    const activeColour = coloursPanel.getByRole("group", { name: "Active state colour", exact: true });
    const swatches = coloursPanel.getByRole("group", { name: "Active state colour presets", exact: true });
    await assertPanelBottomPadding(coloursPanel, activeColour, "Matching active colour");
    await activeColour.getByRole("button", { name: "Custom", exact: true }).click();
    for (const viewport of [testCase.viewport, { width: 360, height: 740 }]) {
      await page.setViewportSize(viewport);
      await assertPanelSpacing();
      await assertPanelBottomPadding(shortcutPanel, key, "Key field");
      await assertPanelBottomPadding(settingsPanel, icon, "Icon field");
      await assertPanelBottomPadding(coloursPanel, swatches, "Custom active colour swatches");
      const [modifierBounds, keyBounds] = await Promise.all([modifiers.boundingBox(), key.boundingBox()]);
      assert.ok(Math.abs(modifierBounds.x - keyBounds.x) < 1, "Modifier buttons and the Key field align");
    }
    await page.setViewportSize(testCase.viewport);
    await activeColour.getByRole("button", { name: "Matching", exact: true }).click();
    await coloursToggle.click();
    assert.strictEqual(await command.getAttribute("aria-pressed"), "true", "saved shortcut restores modifier buttons");
    assert.strictEqual(await key.inputValue(), "a", "saved shortcut restores key selector");
    await key.selectOption("w");
    assert.strictEqual(await key.inputValue(), "w");
    await saveCard();
    await openCard();
    assert.strictEqual(await key.inputValue(), "w", "click-built Command-W survives save");
    assert.strictEqual(await command.getAttribute("aria-pressed"), "true");
    await command.click();
    await shift.click();
    const beforeInvalidCustomSave = nativeState.puts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.strictEqual(nativeState.puts.length, beforeInvalidCustomSave, "Shift-only combinations cannot save");
    await control.click();
    await key.selectOption("tab");
    assert.strictEqual(await key.inputValue(), "tab");
    await key.selectOption("keybracketleft");
    assert.strictEqual(await key.inputValue(), "keybracketleft");
    await key.selectOption("f12");
    await saveCard();
    await openCard();
    assert.strictEqual(await key.inputValue(), "f12");
    assert.strictEqual(await control.getAttribute("aria-pressed"), "true");
    assert.strictEqual(await shift.getAttribute("aria-pressed"), "true");
    await key.selectOption("");
    const beforeMissingKeySave = nativeState.puts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    assert.strictEqual(nativeState.puts.length, beforeMissingKeySave, "a modifier without a key cannot save");

    await page.locator(".sp-settings-close").click();
    await page.getByRole("tab", { name: "Layout", exact: true }).click();
    const addShortcut = async () => {
      await page.locator(".sp-main .sp-empty-cell").first().click();
      await chooseCardType(page, "Key Shortcut");
    };
    await page.locator('.sp-main [data-slot="4"] .sp-subpage-badge').click();
    await addShortcut();
    assert.strictEqual(await application.getAttribute("aria-selected"), "true");
    assert.strictEqual(await app.inputValue(), "com.apple.Safari", "new shortcuts start with the page's app");
    assert.strictEqual(await action.inputValue(), "", "the user still chooses a shortcut");
    assert.strictEqual(await action.locator("option").count(), safariShortcutCount + 1);
    await search.fill("new tab");
    assert((await action.locator("option").allTextContents()).includes("New Tab (⌘T)"));
    await app.selectOption("");
    assert.strictEqual(await app.inputValue(), "", "the app selection can be cleared");
    await app.selectOption(slack.appId);
    await custom.click();
    assert(await page.getByRole("tabpanel", { name: "Custom" }).isVisible());
    await application.click();
    assert.strictEqual(await app.inputValue(), slack.appId, "switching tabs retains the user's app choice");
    await action.selectOption(slackPreset);
    await saveCard();
    const savedSubpage = nativeState.document.subpages[4];
    assert(decodeURIComponent(savedSubpage).includes(slackPreset), "the saved shortcut keeps the selected preset");
    await addShortcut();
    assert.strictEqual(await app.inputValue(), "com.apple.Safari", "each new card starts with the page's app");
    await page.locator(".sp-settings-close").click();
    await page.locator(".sp-back-btn .sp-back-hit").click();
    await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
    await addShortcut();
    assert.strictEqual(await custom.getAttribute("aria-selected"), "true", "generic subpages still start on Custom");

  } finally {
    await context.close();
  }
}

async function assertMacScreenControls(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const nativeState = nativeConfigState(testCase.slug);
  nativeState.document.buttons = {
    1: "system.brightness_up;Screen Brighter;Weather Sunny;Auto;;;companion",
    2: "system.brightness_down;Screen Dimmer;Weather Sunny Off;Auto;;;companion",
    4: "display.brightness;Display Brightness;Weather Sunny;Weather Sunny;;;slider",
  };
  nativeState.document.settings.button_order = "1,2,4";
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.getByRole("tab", { name: "Layout", exact: true }).click();
    await seedNativeDocument(page, nativeState);
    async function editSlot(slot) {
      await page.locator(`.sp-main [data-slot="${slot}"]`).click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const settings = page.locator(".sp-settings-modal .sp-disclosure").filter({
        has: page.locator(".sp-disclosure-button", { hasText: "Card Settings" }),
      }).first();
      if (await settings.locator(".sp-disclosure-button").first().getAttribute("aria-expanded") !== "true") {
        await settings.locator(".sp-disclosure-button").first().click();
      }
    }
    await page.locator(".sp-main .sp-empty-cell").first().click();
    await page.getByRole("button", { name: "Mac screen card type", exact: true }).click();
    assert.strictEqual(await page.getByLabel("Mac screen action", { exact: true }).inputValue(), "system.brightness_up");
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await page.locator(".sp-main .sp-empty-cell").first().click();
    await page.getByRole("button", { name: "Display brightness card type", exact: true }).click();
    assert.strictEqual(await page.locator('[id$="slider-control"]').inputValue(), "mac_brightness");
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    await editSlot(1);
    const actions = page.getByLabel("Mac screen action", { exact: true });
    assert.deepStrictEqual(await actions.locator("option").allTextContents(), ["Screen Brighter", "Screen Dimmer"]);
    assert.strictEqual(await actions.inputValue(), "system.brightness_up");
    await actions.selectOption("system.brightness_down");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () => String(nativeState.document.buttons[1]).startsWith("system.brightness_down;"), "Mac screen action saves");
    await editSlot(4);
    const slider = page.locator('[id$="slider-control"]');
    assert.strictEqual(await slider.inputValue(), "mac_brightness");
    assert.deepStrictEqual(await slider.locator("option").evaluateAll(options => options.map(option => option.value)), ["mac_brightness"]);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () => String(nativeState.document.buttons[4]).startsWith("display.brightness;"), "Mac brightness slider saves");
    await page.reload();
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.getByRole("tab", { name: "Layout", exact: true }).click();
    await seedNativeDocument(page, nativeState);
    await editSlot(1);
    assert.strictEqual(await page.getByLabel("Mac screen action", { exact: true }).inputValue(), "system.brightness_down");
    assert.deepStrictEqual(errors, []);
    console.log("Mac screen buttons and brightness slider: picker, mode switching, save and reload passed.");
  } finally { await context.close(); }
}

async function assertCompanionShortcutSettings(browser, testCase) {
  if (testCase.slug !== "guition-esp32-s3-4848s040") return;
  const nativeState = nativeConfigState(testCase.slug);
  nativeState.document.buttons[1] =
    "com.apple.Safari;Safari;Shortcut Command;Auto;;;companion;;app_shortcuts";
  nativeState.document.subpages[1] = "~B,1,2,3,4,5,6,7,8|" +
    require("../product/v2/app_shortcuts/safari.json").shortcuts.slice(0, 8).map(shortcut =>
      ["companion", "shortcut." + shortcut.shortcut, shortcut.label, shortcut.icon].join(",")
    ).join("|");
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await seedNativeDocument(page, nativeState);
    const commandIcon = page.locator('.sp-main [data-slot="1"] .mdi-apple-keyboard-command');
    await commandIcon.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const element = document.querySelector('.sp-main [data-slot="1"] .mdi-apple-keyboard-command');
      return element && getComputedStyle(element, "::before").content === '"' + String.fromCodePoint(0xF0633) + '"';
    });
    assert.strictEqual(
      await page.evaluate(() => getComputedStyle(document.querySelector('.sp-main [data-slot="1"] .mdi-apple-keyboard-command'), "::before").content),
      '"' + String.fromCodePoint(0xF0633) + '"',
      "saved Command cards render the bundled MDI glyph",
    );
    const appCard = page.locator('.sp-main [data-slot="1"]');
    await appCard.click({ button: "right" });
    const menu = page.locator(".sp-ctx-menu");
    assert.strictEqual(await menu.getByText("Shortcut List", { exact: true }).count(), 0,
      "the shortcut editor is available inside app subpages");
    await menu.getByText("Edit Card", { exact: true }).click();
    await page.waitForSelector(".sp-settings-overlay.sp-visible");

    const cardSettings = page.locator(".sp-settings-modal .sp-disclosure").filter({
      has: page.locator(".sp-disclosure-button", { hasText: "Card Settings" }),
    }).first();
    if (await cardSettings.locator(".sp-disclosure-button").first().getAttribute("aria-expanded") !== "true") {
      await cardSettings.locator(".sp-disclosure-button").first().click();
    }
    assert.strictEqual(await cardSettings.locator(".sp-icon-picker-preview").count(), 0,
      `${testCase.name}: Mac app cards use app artwork instead of an icon picker`);
    assert.strictEqual(await cardSettings.getByRole("combobox", { name: "Mac app icon size", exact: true }).count(), 0,
      `${testCase.name}: automatic app icons have no manual size control`);

    const panels = page.locator(".sp-settings-modal .sp-panel > .sp-disclosure");
    const panelLabels = await panels.locator(".sp-disclosure-button > span:first-child").allTextContents();
    assert(
      panelLabels.includes("Card Settings") && panelLabels.includes("App Subpage"),
      `${testCase.name}: App Subpage should be a separate panel beside Card Settings`,
    );
    const appSubpage = panels.filter({ hasText: "App Subpage" }).first();
    await appSubpage.locator(".sp-disclosure-button").click();
    const rows = appSubpage.locator(".sp-light-tab-row");
    const safariTemplate = JSON.parse(fs.readFileSync(
      path.join(ROOT, "product", "v2", "app_shortcuts", "safari.json"),
      "utf8",
    ));
    const safariShortcuts = [...safariTemplate.shortcuts, ...(safariTemplate.safariShortcuts ?? []), ...(safariTemplate.moreShortcuts ?? [])];
    const safariShortcutLabel = (id) =>
      safariShortcuts.find((shortcut) => shortcut.id === String(id)).label;
    const toggleList = appSubpage.getByRole("button", { name: /Show (all|fewer) shortcuts/ });
    const toggleActions = appSubpage.locator(".sp-app-subpage-shortcut-actions");
    const visibleRows = appSubpage.locator(".sp-light-tab-row:visible");
    assert.strictEqual(await visibleRows.count(), 20);
    assert.strictEqual(await toggleList.getAttribute("aria-expanded"), "false");
    const assertToggleBelowRows = async () => {
      assert.strictEqual(await visibleRows.last().evaluate(row => getComputedStyle(row).borderBottomWidth), "0px");
      assert.strictEqual(await visibleRows.first().evaluate(row => getComputedStyle(row).borderBottomWidth), "1px");
      assert.strictEqual(await toggleActions.evaluate(el => getComputedStyle(el).borderTopWidth), "1px");
      const lastRow = await visibleRows.last().boundingBox();
      const actions = await toggleActions.boundingBox();
      const toggle = await toggleList.boundingBox();
      assert(actions.y >= lastRow.y + lastRow.height && toggle.y > actions.y,
        "the divider separates the visible rows from the button");
      assert(actions.y + actions.height > toggle.y + toggle.height, "the button has space below it");
    };
    await assertToggleBelowRows();
    const filter = appSubpage.getByRole("searchbox", { name: "Find a shortcut…" });
    const lastShortcut = safariShortcuts.at(-1);
    await filter.fill(lastShortcut.label);
    assert(!(await toggleActions.isVisible()), "search hides the button and its divider");
    assert(await rows.filter({ has: page.getByText(lastShortcut.label, { exact: true }) }).last().isVisible(),
      "search includes shortcuts beyond the first 20");
    await filter.clear();
    assert.strictEqual(await visibleRows.count(), 20);
    await toggleList.click();
    assert.strictEqual(await visibleRows.count(), safariShortcuts.length);
    assert.strictEqual(await toggleList.getAttribute("aria-expanded"), "true");
    await assertToggleBelowRows();
    await toggleList.click();
    assert.strictEqual(await visibleRows.count(), 20);
    await toggleList.click();

    const modal = page.locator(".sp-settings-modal");
    const body = modal.locator(".sp-config > .sp-panel");
    const footer = modal.locator(".sp-btn-row--save");
    for (const viewport of [testCase.viewport, { width: 360, height: 640 }]) {
      await page.setViewportSize(viewport);
      await body.evaluate(el => { el.scrollTop = 0; });
      assert(await body.evaluate(el => {
        const modal = el.closest(".sp-settings-modal");
        const bounds = el.getBoundingClientRect();
        const style = getComputedStyle(modal);
        const edges = modal.getBoundingClientRect();
        return getComputedStyle(el).borderRadius === "0px" &&
          Math.abs(bounds.left - edges.left - parseFloat(style.borderLeftWidth)) < 1 &&
          Math.abs(edges.right - bounds.right - parseFloat(style.borderRightWidth)) < 1;
      }), "the square scrolling area extends to the modal's inside edges");
      const beforeScroll = await footer.boundingBox();
      await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert(await body.evaluate(el => el.scrollTop) > 0, "the settings body scrolls");
      const lastSection = body.locator(".sp-disclosure").last();
      const panelBounds = await body.boundingBox();
      const lastBounds = await lastSection.boundingBox();
      assert(panelBounds.y + panelBounds.height - (lastBounds.y + lastBounds.height) >= 11,
        "the last section scrolls fully into view with space below it");
      assert.deepStrictEqual(await footer.boundingBox(), beforeScroll, "the action row stays fixed while settings scroll");
      for (const control of [".sp-delete-btn", ".sp-edit-subpage-btn", ".sp-save-btn"]) {
        assert(await footer.locator(control).evaluate(el => {
          const bounds = el.getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight &&
            el.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }), control + " is visible and clickable while the body is scrolled");
      }
    }
    await page.setViewportSize(testCase.viewport);
    await body.evaluate(el => { el.scrollTop = 0; });

    assert.deepStrictEqual(
      await rows.locator(".sp-light-tab-label").allTextContents(),
      safariShortcuts.map((shortcut) => shortcut.label),
      `${testCase.name}: Safari should expose its reorderable shortcut list`,
    );
    await filter.fill("Reload");
    assert(await rows.filter({ hasText: safariShortcutLabel(2) }).first().isVisible());
    assert(!(await rows.filter({ hasText: safariShortcutLabel(3) }).first().isVisible()));
    assert.strictEqual(await visibleRows.last().evaluate(row => getComputedStyle(row).borderBottomWidth), "0px",
      "the last filtered shortcut has no trailing divider");
    await filter.clear();
    assert.strictEqual(await rows.locator(".sp-light-tab-move").count(), 0, "shortcuts use drag handles to reorder");
    const drag = rows.locator('[aria-label="Drag ' + safariShortcutLabel(3) + '"]').first();
    assert.strictEqual(await drag.getAttribute("tabindex"), "0", "the drag handle is keyboard accessible");
    await drag.press("ArrowUp");
    assert.strictEqual(await rows.nth(2).getAttribute("data-tab"), "3", "Arrow Up reorders the shortcut");
    assert(await drag.evaluate(handle => handle === document.activeElement), "the moved handle retains focus");
    await page.keyboard.press("ArrowDown");
    assert.strictEqual(await rows.nth(3).getAttribute("data-tab"), "3", "Arrow Down reorders the shortcut");
    await drag.dragTo(appSubpage.locator('.sp-light-tab-row[data-tab="2"]'), {
      targetPosition: { x: 16, y: 6 },
    });
    assert.strictEqual(
      await appSubpage.locator(".sp-disclosure-button").getAttribute("aria-expanded"),
      "true",
      `${testCase.name}: App subpage stays open after reordering`,
    );
    await page.locator("#sp-inp-companion-shortcut-1").evaluate((input) => input.click());
    assert.strictEqual(
      await appSubpage.locator(".sp-disclosure-button").getAttribute("aria-expanded"),
      "true",
      `${testCase.name}: App subpage stays open after toggling a shortcut`,
    );
    assert.strictEqual(await toggleList.getAttribute("aria-expanded"), "true", "expanded list stays open after edits");
    const enabledOrder = ["0", "3", "2", "4", "5", "6", "7"];
    const disabledLabels = safariShortcuts.filter(shortcut => !enabledOrder.includes(shortcut.id))
      .map(shortcut => shortcut.label);
    assert.deepStrictEqual(
      await appSubpage.locator(".sp-light-tab-label").allTextContents(),
      [...enabledOrder.map(safariShortcutLabel), ...disabledLabels],
      `${testCase.name}: disabled shortcuts should follow enabled shortcuts after rerender`,
    );
    const beforeSave = nativeState.puts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(
      nativeState,
      () => nativeState.puts.length > beforeSave &&
        String(nativeState.document.buttons[1] || "").includes("app_shortcuts_tabs=0%7C3%7C2%7C4%7C5%7C6%7C7"),
      `${testCase.name}: shortcut selection save`,
    );
    const subpage = String(nativeState.document.subpages && nativeState.document.subpages[1] || "");
    assert(
      subpage.includes("shortcut.command+keybracketleft") &&
        subpage.includes("shortcut.command+t") &&
        subpage.includes("shortcut.command+r") &&
        subpage.includes("shortcut.command+w") &&
        subpage.includes("shortcut.command+f") &&
        subpage.includes("shortcut.command+l") &&
        subpage.includes("shortcut.command+shift+keybackslash") &&
        !subpage.includes("shortcut.command+keybracketright"),
      `${testCase.name}: saving should generate only enabled shortcuts`,
    );
    const appWithoutShortcutSelection = (value) => {
      const card = parseRawButtonConfig(value);
      return { ...card, options: setConfigOptionValue(card.options, "app_shortcuts_tabs", "") };
    };
    const parentBefore = appWithoutShortcutSelection(nativeState.document.buttons[1]);
    await appCard.locator(".sp-subpage-badge").click();
    const shortcutCard = page.locator('.sp-main [data-slot="1"]');
    const dialog = page.locator(".sp-settings-modal");
    const showShortcuts = async (target = shortcutCard) => {
      await target.click({ button: "right" });
      await menu.getByText("Shortcut List", { exact: true }).click();
      await dialog.getByText("Edit App Shortcuts", { exact: true }).waitFor();
    };
    await showShortcuts();
    const dialogRows = dialog.locator(".sp-light-tab-row:visible");
    assert.strictEqual(await dialogRows.count(), safariShortcuts.length, "the standalone editor shows every shortcut");
    assert.strictEqual(await dialog.getByRole("button", { name: /Show (all|fewer) shortcuts/ }).count(), 0);
    const dialogSearch = dialog.getByRole("searchbox", { name: "Find a shortcut…" });
    await dialogSearch.fill(safariShortcutLabel(0));
    assert(await dialogRows.count() < safariShortcuts.length, "search still filters the standalone list");
    await dialogSearch.clear();
    assert.strictEqual(await dialogRows.count(), safariShortcuts.length, "clearing search restores the full list");
    assert.strictEqual(await dialog.getByText("Card Settings", { exact: true }).count(), 0);
    assert.strictEqual(await dialog.getByText("Add app subpage", { exact: true }).count(), 0);
    const back = dialog.getByRole("checkbox", { name: safariShortcutLabel(0), exact: true });
    assert(await back.isChecked(), "the shortcut editor reads the existing page selection");
    await back.evaluate(input => input.click());
    const beforeCancel = nativeState.puts.length;
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.strictEqual(nativeState.puts.length, beforeCancel, "cancelling discards shortcut changes");
    await showShortcuts();
    assert(await back.isChecked(), "reopening after cancellation restores the saved selection");
    await back.evaluate(input => input.click());
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () =>
      !nativeState.document.subpages[1].includes("shortcut.command+keybracketleft"),
    "save shortcuts from inside the app page");
    assert.deepStrictEqual(appWithoutShortcutSelection(nativeState.document.buttons[1]), parentBefore,
      "only the parent app's shortcut option changes");
    const backCard = page.locator(".sp-main .sp-back-btn");
    assert(await backCard.isVisible(), "Save stays on the app subpage");
    await showShortcuts(backCard);
    assert(!(await back.isChecked()), "reopening shows the updated selection");
  } finally {
    await context.close();
  }
}

async function assertCompanionURLOpenBehavior(browser, testCase) {
  if (!testCase.companionSupported) return;
  const nativeState = nativeConfigState(testCase.slug);
  nativeState.document.buttons[2] =
    "~system.default_browser,Bookmark,Bookmark,Auto,url.https%253A%252F%252Fexample.com%252F,,companion";
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await seedNativeDocument(page, nativeState);
    const urlMode = page.getByRole("combobox", { name: "Open in", exact: true });
    async function openURLCard() {
      await page.locator('.sp-main [data-slot="2"]').click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await urlMode.waitFor({ state: "visible" });
    }
    await openURLCard();
    assert.strictEqual(await urlMode.inputValue(), "new_tab", "existing URL cards default to a new tab");
    await urlMode.selectOption("new_window");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () => nativeState.document.buttons[2].includes("url_open_behavior=new_window"),
      "Open URL saves the new window option");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await seedNativeDocument(page, nativeState);
    await openURLCard();
    assert.strictEqual(await urlMode.inputValue(), "new_window", "the new window choice survives reload");
    await urlMode.selectOption("new_tab");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(nativeState, () => !nativeState.document.buttons[2].includes("url_open_behavior"),
      "Open URL removes the override when switching back to a new tab");
  } finally {
    await context.close();
  }
}

async function assertAppSubpageCapacity(browser, testCase) {
  if (testCase.slug !== "guition-esp32-s3-4848s040") return;
  const shortcuts = loadTypeScriptModule("src/webserver/application/companion_shortcut_folder.ts");
  const { encodeConfigField } = loadTypeScriptModule("src/webserver/model/config_primitives.ts");
  for (const native of [false, true]) {
    const fixture = nativeConfigState(testCase.slug);
    fixture.document.buttons[1] = "com.openai.codex;Codex;Auto;Auto;;;companion;;app_shortcuts,app_shortcuts_tabs=0%7C3%7C5%7C6";
    const subpage = shortcuts.createCompanionShortcutSubpage("com.openai.codex", ["0", "3", "5", "6"]);
    subpage.buttons.push({ type: "companion", entity: "shortcut.command+shift+p", label: "Custom shortcut", icon: "Application", icon_on: "Auto", options: "" });
    subpage.order.push("5", "", "", "");
    fixture.document.subpages[1] = "~" + subpage.order.join(",") + "|" + subpage.buttons.map(card =>
      [card.type, card.entity, card.label, card.icon, card.icon_on, card.sensor, card.unit, card.precision, card.options]
        .map(encodeConfigField).join(",")).join("|");
    const legacyTextState = {};
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: native ? fixture : null, legacyTextState });
    const page = await context.newPage();
    await installFakeEventSource(page);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    async function openAppSettings() {
      await page.locator('.sp-main [data-slot="1"]').click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      const app = page.locator(".sp-settings-modal .sp-app-subpage-settings");
      if (await app.locator(".sp-disclosure-button").getAttribute("aria-expanded") !== "true")
        await app.locator(".sp-disclosure-button").click();
      return app;
    }
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seedNativeDocument(page, fixture);
      await page.getByRole("tab", { name: "Layout", exact: true }).click();
      // Four managed shortcuts, one custom card and Back leave three cells.
      await page.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
      assert.strictEqual(await page.locator(".sp-main .sp-empty-cell").count(), 3);
      await page.locator(".sp-back-btn .sp-back-hit").click();
      let app = await openAppSettings();
      for (const id of ["7", "2", "4"]) {
        await page.locator("#sp-inp-companion-shortcut-" + id).evaluate(input => input.click());
        assert(await page.locator("#sp-inp-companion-shortcut-" + id).isChecked(), "available shortcut enables");
        assert.strictEqual(await app.getByText(/No free subpage space/).count(), 0, "three empty cells do not produce a full-page warning");
      }
      await page.getByRole("button", { name: "Save", exact: true }).click();
      const saved = () => native ? fixture.document.subpages[1] : Object.entries(legacyTextState)
        .filter(([key]) => key.includes("subpage_1")).map(([,value]) => value).join("");
      const deadline = Date.now() + 10000;
      while ((!saved()?.includes("shortcut.command+n") || !saved()?.includes("shortcut.option+command+b")) && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 25));
      assert(saved().includes("shortcut.command+n") && saved().includes("shortcut.command+t") && saved().includes("shortcut.option+command+b"), "all three added shortcuts are saved");
      assert(saved().includes("Custom shortcut"), "the existing custom card is retained");
      app = await openAppSettings();
      for (const id of ["7", "2", "4"])
        assert(await page.locator("#sp-inp-companion-shortcut-" + id).isChecked(), "saved shortcut remains enabled when reopened");
      assert.deepStrictEqual(errors, []);
    } finally { await context.close(); }
  }
}

async function assertCompanionStorageSettings(browser, testCase) {
  if (testCase.slug !== "guition-esp32-s3-4848s040") return;
  for (const type of ["companion", "subpage"]) {
    const nativeState = nativeConfigState(testCase.slug);
    nativeState.document.buttons[1] = type === "companion"
      ? "stat.storage;Storage;HardDrive;Auto;;%;companion;0;"
      : "stat.storage;Storage;HardDrive;Auto;indicator;%;subpage;;subpage_kind=companion_stat";
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState });
    let devices = [{ id: "external-volume", label: "External drive" }];
    await context.route("**/companion/storage", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify(devices),
    }));
    const page = await context.newPage();
    await installFakeEventSource(page);
    const openSettings = async () => {
      await page.locator('.sp-main [data-slot="1"]').click({ position: { x: 70, y: 25 } });
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.waitForSelector(".sp-settings-overlay.sp-visible");
      const field = page.locator('[id$="storage-device"]');
      if (!(await field.isVisible())) {
        await page.locator(".sp-disclosure").filter({ has: field }).last().locator(".sp-disclosure-button").first().click();
      }
    };
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#sp-app");
      await seedNativeDocument(page, nativeState);
      await openSettings();
      const selector = page.locator('[id$="storage-device"]');
      await selector.locator('option[value="external-volume"]').waitFor({ state: "attached" });
      await selector.selectOption("external-volume");
      await page.locator(type === "companion" ? '[id$="metric-display"]' : '[id$="companion-stat-display"]').selectOption("free");
      assert.strictEqual(await selector.inputValue(), "external-volume", `${type}: used/free keeps the drive`);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await waitForNativeState(nativeState, () => String(nativeState.document.buttons[1]).startsWith("stat.storage_free:external-volume;"), `${type}: saves selected drive`);
      devices = [];
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("#sp-app");
      await seedNativeDocument(page, nativeState);
      await openSettings();
      assert.strictEqual(await selector.inputValue(), "external-volume", `${type}: offline reload keeps selected drive`);
      assert.strictEqual(await selector.locator('option:checked').textContent(), "Saved device (unavailable)");
    } finally { await context.close(); }
  }
}

async function assertCompanionOnlyCardPicker(browser, testCase) {
  if (testCase.slug !== "guition-esp32-s3-4848s040") return;
  const context = await browser.newContext({ viewport: testCase.viewport });
  const connectorStatus = {
    onboarding_complete: true,
    home_assistant: {
      available: true,
      configured: true,
      connected: false,
      actions_confirmed: true,
    },
    mac_companion: {
      available: true,
      configured: true,
      paired: true,
      connected: false,
    },
  };
  await installRoutes(context, testCase.slug, {
    connectorsStatus: connectorStatus,
    homeAssistantSupport: true,
  });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await page.evaluate((events) => window.__seedEspState(events), seededEvents());
    const emptyCell = page.locator(".sp-empty-cell:not(.sp-info-only-hidden)").first();
    await emptyCell.click();
    await page.waitForSelector("#sp-card-type-picker");
    assert.strictEqual(
      await page.getByRole("tab", { name: "Home Assistant" }).count(),
      0,
      `${testCase.name}: Companion-only picker hides the Home Assistant tab`,
    );
    assert.strictEqual(
      await page.locator('[data-card-type="calendar"]').count(),
      0,
      `${testCase.name}: Date & Time is absent from the Companion picker`,
    );
    assert.strictEqual(
      await page.locator('[data-card-type="companion_webapp"]').count(),
      0,
      `${testCase.name}: Web App is unavailable when adding a new card`,
    );
    assert(await page.locator('[data-card-type="companion_url"]').isVisible(),
      `${testCase.name}: Open URL remains available`);
    assert(
      await page.locator('[data-card-type="companion_app"]').isVisible(),
      `${testCase.name}: Companion-only picker opens on Mac Companion card types`,
    );
    assert.strictEqual(
      await page.locator('[data-card-type="companion_stats"]').count(),
      0,
      `${testCase.name}: Stats is unavailable when adding a new card`,
    );
  } finally {
    await context.close();
  }
}

async function assertLegacyProfileFallback(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug);
  const page = await context.newPage();
  const posts = [];
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (request.method() === "POST" && requestUrl.hostname === "espdesktop.test") {
      posts.push(postRecord(request.url()));
    }
  });
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    const fixture = nativeConfigState(testCase.slug);
    fixture.document.buttons[1] = ";Kitchen;Folder;Auto;;;subpage";
    await seedNativeDocument(page, fixture);
    await page.waitForSelector('.sp-main [data-slot="1"]');
    await page.locator('.sp-main [data-slot="1"]').click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const cardSettings = page
      .locator(".sp-settings-modal .sp-disclosure")
      .filter({ hasText: "Card Settings" })
      .first();
    if (!(await page.locator("#sp-inp-label").isVisible())) {
      await cardSettings.locator(".sp-disclosure-button").click();
    }
    await page.locator("#sp-inp-label").fill(`Legacy ${testCase.slug}`);
    const before = posts.length;
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForAnyPost(
      posts,
      [
        { domain: "text", name: "button_1_config", action: "set" },
        { domain: "text", name: "Button 1 Config", action: "set" },
      ],
      `${testCase.name}: unsupported native API falls back to legacy save`,
      before,
    );
  } finally {
    await context.close();
  }
}

async function assertLegacyRestoreVerificationFailure(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { truncateLegacyText: "button_16_config" });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources && window.__eventSources.length > 0);
    await page.evaluate((events) => window.__seedEspState(events), seededEvents());
    await importBackup(page, backupFixture(testCase.slug, testCase.slots), "truncated-legacy-backup");
    await page.waitForSelector(".sp-banner.sp-error", { timeout: 30000 });
    const message = await page.locator(".sp-banner").textContent();
    assert(message.includes("Button 16 Config"), "legacy verification identifies a truncated slot");
    assert(!message.includes("successfully"), "legacy verification failure suppresses import success");
  } finally {
    await context.close();
  }
}

async function assertOfflineProfileFallback(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { offlineFallback: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app", { timeout: 5000 });
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await page.evaluate((events) => window.__seedEspState(events), seededEvents());
    await page.waitForSelector(".sp-main > .sp-btn");
    assert.strictEqual(
      await page.evaluate(() => globalThis.__ESPDESKTOP_USING_EMBEDDED__),
      true,
      `${testCase.name}: failed remote bundle starts the embedded editor`,
    );
    assert.deepStrictEqual(
      errors,
      [],
      `${testCase.name}: embedded offline fallback has no browser errors`,
    );
  } finally {
    await context.close();
  }
}

async function assertMediaCoverArtCompactPreview(page, label) {
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.sp-main [data-slot="4"]');
    const artist = card.querySelector(".sp-media-now-artist");
    const standardLabel = document.querySelector('.sp-main [data-slot="1"] .sp-btn-label');
    const artistStyle = getComputedStyle(artist);
    const standardStyle = getComputedStyle(standardLabel);
    const largeCard = card.cloneNode(true);
    largeCard.classList.remove("sp-media-cover-details-single");
    largeCard.classList.add("sp-btn-big");
    largeCard.style.cssText = "position:fixed;left:-1000px;top:0;width:400px;height:400px";
    // Keep container-relative typography scoped to the device preview. Moving
    // these samples to body makes cqw units use the browser viewport instead.
    card.parentElement.appendChild(largeCard);
    const largeTitleRect = largeCard.querySelector(".sp-media-cover-details-title").getBoundingClientRect();
    const largeArtistRow = largeCard.querySelector(".sp-media-cover-details-row");
    const largeArtistRect = largeArtistRow.querySelector(".sp-media-now-artist").getBoundingClientRect();
    const largeArtistMarginTop = parseFloat(getComputedStyle(largeArtistRow).marginTop);
    const extraLargeCard = card.cloneNode(true);
    extraLargeCard.classList.remove("sp-media-cover-details-single");
    extraLargeCard.classList.add("sp-btn-extra-large");
    extraLargeCard.style.cssText = "position:fixed;left:-1000px;top:0;width:600px;height:600px";
    card.parentElement.appendChild(extraLargeCard);
    const extraLargeTitleLineClamp = getComputedStyle(
      extraLargeCard.querySelector(".sp-media-cover-details-title"),
    ).webkitLineClamp;
    const extraLargeArtistFontWeight = getComputedStyle(
      extraLargeCard.querySelector(".sp-media-now-artist"),
    ).fontWeight;
    const result = {
      compactClass: card.classList.contains("sp-media-cover-details-single"),
      whiteSpace: artistStyle.whiteSpace,
      textOverflow: artistStyle.textOverflow,
      fontFamily: artistStyle.fontFamily,
      fontSize: artistStyle.fontSize,
      fontWeight: artistStyle.fontWeight,
      standardFontFamily: standardStyle.fontFamily,
      standardFontSize: standardStyle.fontSize,
      standardFontWeight: standardStyle.fontWeight,
      hasTypeBadge: Boolean(card.querySelector(".sp-type-badge")),
      largeArtistMarginTop,
      largeArtistFontSize: getComputedStyle(largeArtistRow.querySelector(".sp-media-now-artist")).fontSize,
      largeTitleArtistGap: largeArtistRect.top - largeTitleRect.bottom,
      extraLargeTitleLineClamp,
      extraLargeArtistFontWeight,
    };
    largeCard.remove();
    extraLargeCard.remove();
    return result;
  });

  assert(layout.compactClass, `${label}: 1x1 Cover Art details preview uses its compact layout`);
  assert.strictEqual(layout.whiteSpace, "nowrap", `${label}: 1x1 Cover Art artist stays on one line`);
  assert.strictEqual(layout.textOverflow, "ellipsis", `${label}: long 1x1 Cover Art artists truncate cleanly`);
  assert.strictEqual(layout.fontFamily, layout.standardFontFamily, `${label}: Cover Art artist uses the card-label font`);
  assert.strictEqual(layout.fontSize, layout.standardFontSize, `${label}: Cover Art artist uses the card-label size`);
  assert.strictEqual(layout.fontWeight, layout.standardFontWeight, `${label}: Cover Art artist uses the card-label weight`);
  assert.strictEqual(layout.hasTypeBadge, false, `${label}: 1x1 Cover Art omits the card-type icon`);
  assert.strictEqual(layout.largeArtistFontSize, layout.fontSize, `${label}: 2x2 Cover Art sample keeps device-preview text scaling`);
  assert(layout.largeArtistMarginTop > 0, `${label}: 2x2 Cover Art artist has extra top spacing`);
  assert(layout.largeTitleArtistGap >= layout.largeArtistMarginTop - 1, `${label}: 2x2 Cover Art title and artist remain separated`);
  assert.strictEqual(layout.extraLargeTitleLineClamp, "5", `${label}: 3x3 Cover Art title is limited to five lines`);
  assert.strictEqual(layout.extraLargeArtistFontWeight, "300", `${label}: 3x3 Cover Art artist uses a light font weight`);
}

async function assertCardIconsTopLeft(page, label) {
  const icons = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      ".sp-main > .sp-btn .sp-btn-icon, .sp-main > .sp-btn .sp-image-preview-icon",
    )).map((icon) => {
      const card = icon.closest(".sp-btn");
      const cardRect = card.getBoundingClientRect();
      const iconRect = icon.getBoundingClientRect();
      const iconStyle = getComputedStyle(icon);
      const sliderPreview = card.querySelector(".sp-slider-preview");
      return {
        visible: iconRect.width > 0 && iconRect.height > 0,
        leftGap: iconRect.left - cardRect.left,
        topGap: iconRect.top - cardRect.top,
        leftInset: parseFloat(iconStyle.left) || 0,
        topInset: parseFloat(iconStyle.top) || 0,
        iconZIndex: parseInt(iconStyle.zIndex, 10) || 0,
        sliderZIndex: sliderPreview
          ? (parseInt(getComputedStyle(sliderPreview).zIndex, 10) || 0)
          : null,
      };
    }).filter((measurement) => measurement.visible),
  );
  assert(icons.length > 0, `${label}: preview contains visible card icons`);
  for (const icon of icons) {
    assert(
      Math.abs(icon.leftGap - icon.leftInset) <= 3,
      `${label}: card icon is inset from the left edge by the shared card padding (${JSON.stringify(icon)})`,
    );
    assert(
      Math.abs(icon.topGap - icon.topInset) <= 3,
      `${label}: card icon is inset from the top edge by the shared card padding (${JSON.stringify(icon)})`,
    );
    if (icon.sliderZIndex !== null) {
      assert(
        icon.iconZIndex > icon.sliderZIndex,
        `${label}: slider card icon stays above its fill overlay (${JSON.stringify(icon)})`,
      );
    }
  }
}

async function runCase(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, {
    homeAssistantSupport: true,
    connectorsStatus: {
      onboarding_complete: true,
      home_assistant: { available: true, configured: true, connected: true, actions_confirmed: true },
      mac_companion: testCase.slug === "guition-esp32-s3-4848s040"
        ? { available: true, configured: true, paired: true, connected: true }
        : { available: false, configured: false, paired: false, connected: false },
    },
  });
  const page = await context.newPage();
  const errors = [];
  const posts = [];
  const thirdPartyAssetRequests = [];

  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    const url = message.location().url;
    // Legacy devices can omit these discovery endpoints. Keep unexpected browser errors.
    if (/\b404\b/.test(message.text()) &&
        /^http:\/\/espdesktop\.test\/(?:api\/v1\/identity|(?:text|text_sensor|select|number|switch|sensor|binary_sensor|button|update|light)\/)/.test(url)) return;
    errors.push(`[${message.type()}] ${message.text()} (${url})`);
  });
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (
      ["cdn.jsdelivr.net", "fonts.googleapis.com", "cdn.buymeacoffee.com"].includes(
        requestUrl.hostname,
      )
    ) {
      thirdPartyAssetRequests.push(requestUrl.href);
    }
    if (
      request.method() === "POST" &&
      requestUrl.hostname === "espdesktop.test"
    ) {
      posts.push(postRecord(request.url()));
    }
  });
  await installFakeEventSource(page);

  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(
      () => window.__eventSources && window.__eventSources.length > 0,
    );
    await page.evaluate(
      (events) => window.__seedEspState(events),
      seededEvents(),
    );
    await page.waitForSelector(".sp-main > .sp-btn");
    await page.waitForTimeout(100);

    if (process.env.ESPDESKTOP_CARD_TRANSFER_ONLY === "1") {
      await assertCardTransferSmoke(page, posts, testCase.name);
      console.log(`${testCase.name}: direct clipboard, toast, failure and Paste Code checks passed.`);
      return;
    }
    assert.deepStrictEqual(
      errors,
      [],
      `${testCase.name}: browser errors were reported`,
    );
    assert.deepStrictEqual(
      thirdPartyAssetRequests,
      [],
      `${testCase.name}: the editor should not need third-party CDN assets`,
    );
    const iconStyle = await page.evaluate(() => {
      const style = document.getElementById("espdesktop-local-web-assets");
      return style ? style.textContent || "" : "";
    });
    assert(
      iconStyle.includes(".mdi-cog::before{content:'\\F0493'}"),
      `${testCase.name}: the local icon stylesheet should use a CSS codepoint escape`,
    );
    assert(
      !iconStyle.includes("@font-face{font-family:'Inter'"),
      `${testCase.name}: the local stylesheet should omit the unused interface font`,
    );
    assert.strictEqual(
      await page.locator(".sp-support-link").textContent(),
      "Buy me a coffee",
      `${testCase.name}: the support button should retain its recognised label`,
    );
    assertNoLayoutBreaks(
      await measureCoreLayout(page),
      testCase.name,
      testCase,
    );
    await assertCardIconsTopLeft(page, testCase.name);
    await assertClockBarTypographyAndIconLayout(page, testCase.name);
    if (testCase.mediaCoverArtSupported) {
      await assertMediaCoverArtCompactPreview(page, testCase.name);
    }
    await assertConnectorsManagement(page, testCase);
    await assertSettingsPage(page, testCase.name, testCase, posts);
    assertNoLayoutBreaks(
      await measureCoreLayout(page),
      `${testCase.name} after settings`,
      testCase,
    );
    if (testCase.exerciseInteractions) {
      await assertContextColourPicker(browser, testCase);
      await assertAutomaticAppIcons(browser, testCase);
      await assertCardActiveColourControls(page, posts, testCase.name);
      await assertMobileTabLayout(page, testCase.name, testCase.viewport);
      await assertCameraRefreshSettings(page, posts, testCase.name);
    }
    await assertEmptyCellSettings(page, posts, testCase.name);
    if (testCase.exerciseInteractions) {
      await assertClockBarEditorSmoke(page, posts, testCase.name);
      await assertBackupImportSmoke(page, posts, testCase);
      await assertCardTransferSmoke(page, posts, testCase.name);
      await assertApplySmoke(page, posts, errors);
    } else if (testCase.exerciseDeviceMocks) {
      await assertBackupImportSmoke(page, posts, testCase);
    }
  } catch (error) {
    fs.mkdirSync(FAILURE_DIR, { recursive: true });
    try {
      await page.screenshot({
        path: path.join(FAILURE_DIR, `${testCase.name}-${testCase.slug}.png`),
        fullPage: true,
        timeout: 5000,
      });
    } catch (screenshotError) {
      console.error(`${testCase.name}: could not capture failure screenshot: ${screenshotError.message}`);
    }
    throw error;
  } finally {
    await context.close();
  }
}

async function assertEditorRefresh(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installRoutes(context, "esp32-p4-86");
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto("http://espdesktop.test/esp32-p4-86?events=1", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.getByRole("tab", { name: "Screen" }).click();
    assert.equal(await page.locator("#sp-set-voice-services").count(), 0, "removed voice services have no settings toggle");
    assert.equal(await page.locator("#sp-set-alarm-delay-audio").count(), 0, "removed alarm audio has no settings toggle");
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const metrics = await page.evaluate(() => {
        const app = getComputedStyle(document.querySelector("#sp-app"));
        const section = getComputedStyle(document.querySelectorAll(".sp-settings-status-header")[1]);
        return { maxWidth: app.maxWidth, font: app.fontFamily, gap: section.marginTop,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.strictEqual(metrics.maxWidth, width > 600 ? "1080px" : "100%");
      assert(!metrics.font.includes("Inter"));
      assert.strictEqual(metrics.gap, width > 600 ? "48px" : "40px");
      assert(!metrics.overflow, "editor must fit the viewport");
    }
    await page.screenshot({ path: "/tmp/espdesktop-editor-mobile.png", fullPage: true });
  } finally { await context.close(); }
}

async function assertHostedCompatibility(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-p4-jc8012p4a1-v2");
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState: nativeConfigState(testCase.slug) });
  const firmwareBody = "test firmware download";
  let releaseDownload;
  const downloadReady = new Promise(resolve => { releaseDownload = resolve; });
  await context.route("https://espdesktop.com/firmware/**/*.ota.bin", async route => {
    await downloadReady;
    return route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: firmwareBody,
    });
  });
  const uploads = [];
  context.on("request", request => {
    if (new URL(request.url()).pathname === "/update") uploads.push(request);
  });
  await context.addInitScript(() => {
    const transport = window.fetch.bind(window);
    window.__compatRequests = [];
    window.fetch = async (input, init) => {
      const request = new Request(new URL(String(input), location.href), init);
      const record = { url: request.url, credentials: request.credentials, status: 0 };
      window.__compatRequests.push(record);
      const response = await transport(input, init);
      record.status = response.status;
      return response;
    };
  });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.waitForFunction(() => ["manifest.json", "versions.json"].every(name =>
      window.__compatRequests.some(item => item.url.startsWith("https://espdesktop.com/firmware/") && item.url.endsWith(name) && item.status === 200)));
    const requests = await page.evaluate(() => window.__compatRequests);
    for (const request of requests.filter(item => item.url.startsWith("https://espdesktop.com/firmware/"))) {
      assert.equal(request.credentials, "omit", "public metadata must not include browser credentials");
    }
    assert(requests.some(item => item.url.endsWith("/espdesktop/version") && item.credentials === "include"), "device state requests retain authentication");
    await page.getByRole("tab", { name: "System" }).click();
    await page.evaluate(() => window.__seedEspState([
      { id: "select/Home Assistant Artwork Connection", state: "Manual" },
      { id: "text_sensor/Home Assistant Artwork Endpoint", state: "Manual — http://ha.test:8123" },
      { id: "text_sensor/Home Assistant Artwork Connection Health", state: "Manual connection" },
    ]));
    assert.equal(await page.locator("#sp-set-ha-artwork-endpoint-mode, #sp-ha-artwork-endpoint-status, #sp-ha-artwork-endpoint-health").count(), 0,
      "stale artwork events cannot restore removed Home Assistant settings");
    const firmwareCard = page.locator(".card").filter({ has: page.locator(".card-header h3", { hasText: /^Firmware$/ }) });
    await firmwareCard.locator(":scope > .card-header").click();
    await page.locator("#sp-fw-previous-panel .sp-disclosure-button").click();
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#sp-fw-previous-panel .sp-fw-btn").click();
    await page.waitForFunction(() => window.__compatRequests.some(item => item.url.endsWith(".ota.bin")));
    const download = await page.evaluate(() => window.__compatRequests.find(item => item.url.endsWith(".ota.bin")));
    assert.equal(download.credentials, "omit", "public firmware downloads must not include browser credentials");
    assert.equal(download.url, `https://espdesktop.com/firmware/${testCase.slug}/versions/v1.11.0/${testCase.slug}.ota.bin`,
      "rollback downloads the selected version directly from the firmware host");
    await page.evaluate(() => window.__seedEspState([
      { id: "update-firmware__update", state: "NO UPDATE", current_version: "v1.12.0", latest_version: "v1.13.0" },
    ]));
    assert.equal(await page.locator("#sp-fw-previous-panel .sp-fw-btn").innerText(), "Installing…", "routine status must not cancel a pending download");
    assert(await page.locator("#sp-fw-previous-panel .sp-fw-btn").isDisabled(), "duplicate uploads stay disabled");
    releaseDownload();
    await page.waitForFunction(() => window.__compatRequests.some(item => item.url.endsWith("/update") && item.status === 204));
    const upload = await page.evaluate(() => window.__compatRequests.find(item => item.url.endsWith("/update")));
    assert.equal(upload.credentials, "include", "firmware uploads retain device authentication");
    assert.equal(uploads.length, 1, "previous firmware is uploaded once");
    assert.equal(uploads[0].method(), "POST");
    assert(uploads[0].postData().includes(firmwareBody), "the downloaded firmware reaches the device upload");
    assert(uploads[0].postData().includes(`${testCase.slug}.ota.bin`), "the upload retains the device firmware filename");
    await page.getByText("Firmware uploaded. Waiting for device to restart…", { exact: true }).waitFor();
    await page.evaluate(() => window.__seedEspState([
      { id: "text_sensor-firmware__version", state: "v1.11.0" },
    ]));
    await firmwareCard.getByText("Firmware v1.11.0 installed.", { exact: true }).waitFor();
  } finally { await context.close(); }
}

async function assertFirmwareRetryFeedback(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-p4-jc8012p4a1-v2");
  for (const action of ["check", "install", "check_then_install"]) {
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: nativeConfigState(testCase.slug) });
    await context.route("https://espdesktop.com/firmware/**/*.ota.bin", route => route.fulfill({
      status: 503, headers: { "Access-Control-Allow-Origin": "*" }, body: "Unavailable",
    }));
    const page = await context.newPage();
    await installFakeEventSource(page);
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
      await page.waitForSelector("#sp-app");
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await page.evaluate(events => window.__seedEspState(events), seededEvents());
      await page.getByRole("tab", { name: "System" }).click();
      const card = page.locator(".card").filter({ has: page.locator(".card-header h3", { hasText: /^Firmware$/ }) });
      await card.locator(":scope > .card-header").click();
      await page.locator("#sp-fw-previous-panel .sp-disclosure-button").click();
      page.once("dialog", dialog => dialog.accept());
      await page.locator("#sp-fw-previous-panel .sp-fw-btn").click();
      const status = page.locator("#sp-fw-status");
      await page.waitForFunction(() => document.querySelector("#sp-fw-status")?.textContent.includes("Firmware update failed"));
      await page.evaluate(action => window.__seedEspState([{
        id: "update-firmware__update",
        state: action === "install" ? "UPDATE AVAILABLE" : "NO UPDATE",
        current_version: action === "check" ? "v1.13.0" : "v1.12.0",
        latest_version: "v1.13.0",
      }]), action);
      assert(await status.isVisible(), `${action}: rollback failure is visible with Firmware updates closed`);
      assert((await status.textContent()).includes("Firmware update failed"), `${action}: idle refresh preserves failure`);
      await page.locator("#sp-fw-updates-panel .sp-disclosure-button").click();
      await page.locator("#sp-fw-updates-panel .sp-fw-btn").click();
      assert(!(await status.textContent()).includes("Firmware update failed"), `${action}: new attempt clears previous failure`);
      assert.equal(await page.locator("#sp-fw-updates-panel .sp-fw-btn").innerText(), action === "check" ? "Checking…" : "Installing…");
    } finally { await context.close(); }
  }
}

async function assertResetControls(browser) {
  for (const mode of ["customization", "factory", "unsupported"]) {
    const testCase = CASES[0];
    const resetState = { epoch: 3, pending: false, requests: [] };
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: nativeConfigState(testCase.slug), resetState: mode === "unsupported" ? null : resetState });
    const page = await context.newPage();
    await installFakeEventSource(page);
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
      await page.waitForSelector("#sp-app");
      await seedNativeDocument(page, nativeConfigState(testCase.slug));
      await page.getByRole("tab", { name: "System" }).click();
      const card = page.locator(".card").filter({ has: page.locator("h3", { hasText: /^Factory Reset$/ }) });
      if (mode === "unsupported") { assert(!(await card.isVisible())); continue; }
      await card.waitFor({ state: "visible" });
      await card.locator(".card-header").click();
      assert(await card.getByRole("button", { name: "Save backup", exact: true }).isVisible());
      const download = page.waitForEvent("download");
      await card.getByRole("button", { name: "Save backup", exact: true }).click();
      await download;
      const label = mode === "factory" ? "Complete reset" : "Partial reset";
      if (mode === "factory") {
        page.on("dialog", async dialog => {
          await dialog.dismiss();
          assert.fail("Complete reset must not open a browser prompt");
        });
        const confirmation = page.getByRole("dialog", { name: "Complete reset", exact: true });
        await card.getByRole("button", { name: label, exact: true }).click();
        assert(await confirmation.isVisible());
        if (process.env.ESPDESKTOP_RESET_SCREENSHOT) {
          await page.screenshot({ path: process.env.ESPDESKTOP_RESET_SCREENSHOT });
        }
        const confirmationInput = confirmation.getByRole("textbox", { name: "Type RESET to confirm", exact: true });
        const resetButton = confirmation.getByRole("button", { name: label, exact: true });
        assert(await confirmationInput.evaluate(el => el === document.activeElement));
        assert(await resetButton.isDisabled());
        assert(await confirmation.locator(".sp-reset-warning").isVisible());
        await page.setViewportSize({ width: 320, height: 700 });
        assert(await confirmation.evaluate(el => el.scrollWidth <= el.clientWidth), "confirmation must fit a narrow phone");
        await page.setViewportSize(testCase.viewport);
        assert((await confirmation.innerText()).includes("Saved Wi-Fi credentials and Mac pairing will be erased."));
        for (const text of ["", "reset", " RESET", "RESET ", "RESE"]) {
          await confirmationInput.fill(text);
          await confirmationInput.press("Enter");
          assert(await resetButton.isDisabled());
          assert.strictEqual(resetState.requests.length, 0, "invalid typed confirmation must not reset");
        }
        assert.strictEqual(resetState.requests.length, 0, "opening confirmation must not reset");
        await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
        await confirmation.waitFor({ state: "detached" });
        assert.strictEqual(resetState.requests.length, 0, "cancel must not reset");
        await card.getByRole("button", { name: label, exact: true }).click();
        await page.keyboard.press("Escape");
        await confirmation.waitFor({ state: "detached" });
        assert.strictEqual(resetState.requests.length, 0, "Escape must not reset");
        await card.getByRole("button", { name: label, exact: true }).click();
        assert.strictEqual(await confirmationInput.inputValue(), "", "reopening must clear confirmation");
        await confirmationInput.fill("RESET");
        assert(await resetButton.isEnabled());
        await confirmationInput.fill("RESE");
        assert(await resetButton.isDisabled(), "editing confirmation must disable reset again");
        await confirmationInput.fill("RESET");
        await resetButton.click();
      } else {
        page.once("dialog", dialog => dialog.dismiss());
        await card.getByRole("button", { name: label, exact: true }).click();
        assert.strictEqual(resetState.requests.length, 0, "cancel must not reset");
        page.once("dialog", dialog => dialog.accept());
        await card.getByRole("button", { name: label, exact: true }).click();
      }
      await page.waitForFunction(() => document.querySelector(".sp-reset-dialog")?.textContent?.includes("restarting") || document.querySelector(".sp-reset-dialog")?.textContent?.includes("Restarting"));
      assert.deepStrictEqual(resetState.requests, [{ mode }]);
      assert(await page.locator(".sp-reset-dialog").isVisible());
    } finally { await context.close(); }
  }
}

async function assertNamingOfflineBackups(browser) {
  const testCase = ACTIVE_CASES[0];
  const context = await browser.newContext({ viewport: testCase.viewport });
  const identityState = { posts: [], failLoad: true, info: {} };
  await installRoutes(context, testCase.slug, { identityState });
  const page = await context.newPage();
  const restartRequests = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/button/")) restartRequests.push(request.url());
  });
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await openBackupControls(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    for (const key of ["voice_services", "alarm_delay_audio", "alarm_delay_tts",
      "alarm_delay_entry_announcement", "alarm_delay_exit_announcement",
      "alarm_delay_beep_volume", "alarm_delay_final_countdown"]) {
      assert(!Object.hasOwn(exported.settings, key), `new backup omits retired audio setting ${key}`);
    }
    assert(!Object.hasOwn(exported.settings, "home_screen_timeout"), "new backup omits the retired home screen timeout");
    assert(!Object.hasOwn(exported, "identity"), "naming outage omits optional metadata");
    assert(exported.native_config, "naming outage still exports configuration");
    await page.getByText("Backup exported without the panel name because naming is unavailable.").waitFor();
    const offlineBackup = backupFixture(testCase.slug, testCase.slots);
    offlineBackup.identity = { version: 1, name: "Other panel", hostname: "other-panel-ffffff", mac_suffix: "ffffff" };
    await importBackup(page, offlineBackup, "identity-offline-restore");
    await page.locator(".sp-banner.sp-warning").filter({ hasText: "Configuration imported successfully" }).waitFor();
    assert.match(await page.locator(".sp-banner.sp-warning").innerText(), /Home Assistant, which is unavailable/,
      "offline restore retains its unavailable-card warning in the final result");
    assert.strictEqual(identityState.posts.length, 0, "offline restore cannot rename the destination");
    assert.strictEqual(restartRequests.length, 0, "offline restore cannot restart for naming");
    assert.strictEqual(await page.locator("dialog[open]").count(), 0, "offline restore skips the optional name dialog");
  } finally { await context.close(); }
}

async function assertPanelNaming(browser) {
  const testCase = ACTIVE_CASES[0];
  const context = await browser.newContext({ viewport: testCase.viewport });
  const identityState = { posts: [], failLoad: true, failSave: false, info: {
    name: "Kitchen", friendly_name: "Kitchen", hostname: "kitchen-b2c3",
    mac_suffix: "b2c3", ip_address: "192.168.1.25", restart_required: false,
  } };
  await installRoutes(context, testCase.slug, { identityState, nativeState: nativeConfigState(testCase.slug) });
  const page = await context.newPage();
  const errors = [];
  const restartRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.method() === "POST" && request.url().includes("/button/")) restartRequests.push(request.url());
  });
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.getByRole("tab", { name: "System" }).click();
    const card = page.locator(".card").filter({ has: page.locator(".card-header", { hasText: "Device Name" }) });
    await card.locator(".card-header").click();
    await card.getByText("Could not read the panel name. Check the connection and try again.").waitFor();
    identityState.failLoad = false;
    await card.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForFunction(() => document.title === "EspDesktop - Kitchen");
    assert.strictEqual(await page.locator(".sp-brand").textContent(), "EspDesktop Kitchen");
    const save = card.getByRole("button", { name: "Save & Restart", exact: true });
    assert(await save.isDisabled(), "unchanged names cannot be saved");
    await page.locator("#sp-panel-name").fill("Office");
    assert((await card.textContent()).includes("office-b2c3.local"));
    if (process.env.ESPDESKTOP_NAMING_SCREENSHOT) await page.screenshot({ path: process.env.ESPDESKTOP_NAMING_SCREENSHOT, fullPage: true });
    identityState.failSave = true;
    await save.click();
    await card.getByRole("status").filter({ hasText: "Could not save" }).waitFor();
    assert.strictEqual(restartRequests.length, 0, "failed save must not restart");
    assert.strictEqual(await page.title(), "EspDesktop - Kitchen");
    identityState.failSave = false;
    await save.click();
    await page.waitForSelector("dialog[open]");
    await page.waitForFunction(() => document.title === "EspDesktop - Office");
    assert.strictEqual(await page.locator("dialog a").first().getAttribute("href"), "http://office-b2c3.local/");
    await page.waitForTimeout(500);
    assert.strictEqual(restartRequests.length, 1, "successful save requests one restart");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const backup = backupFixture(testCase.slug, testCase.slots, testCase.slug);
    backup.identity = { version: 1, name: "Bedroom", hostname: "espdesktop-bedroom-ffffff", mac_suffix: "ffffff" };
    // Inspect the optional import before doing any configuration writes.
    await importBackup(page, backup, "named-backup");
    await page.waitForSelector("dialog[open]");
    const choice = page.getByRole("checkbox", { name: "Also restore panel name" });
    assert(!await choice.isChecked(), "name restore defaults off");
    assert((await page.locator("dialog").textContent()).includes("bedroom-b2c3.local"), "restore uses destination MAC");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.strictEqual(identityState.posts.length, 2, "cancel import cannot rename");
    await importBackup(page, backup, "keep-destination-name");
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor();
    assert.strictEqual(identityState.posts.length, 2, "unchecked name restore preserves identity");
    await importBackup(page, backup, "restore-source-name");
    await page.getByRole("checkbox", { name: "Also restore panel name" }).check();
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    await page.waitForFunction(() => document.title === "EspDesktop - Bedroom");
    assert.strictEqual(identityState.info.hostname, "bedroom-b2c3", "selected name restore keeps destination suffix");
    assert.strictEqual(identityState.posts.length, 3, "name written once after successful restore");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "System" }).click();
    const header = card.locator(".card-header");
    if (await card.evaluate(element => element.classList.contains("collapsed"))) await header.click();
    const nameInput = page.locator("#sp-panel-name");
    await page.waitForFunction(() => {
      const input = document.querySelector("#sp-panel-name");
      return input?.value === "Bedroom" && !input.disabled;
    });
    await nameInput.fill("");
    await save.click();
    await page.waitForFunction(() => document.title === "EspDesktop - b2c3");
    assert.deepStrictEqual(errors, [], "naming journey has no browser errors");
  } finally { await context.close(); }
}

async function assertHomeAssistantConnectorLayout(browser) {
  for (const testCase of ACTIVE_CASES) {
    const context = await browser.newContext({ viewport: testCase.viewport });
    const connectorStatus = {
      onboarding_complete: true,
      home_assistant: {
        available: true,
        configured: true,
        connected: true,
        actions_confirmed: true,
      },
      mac_companion: {
        available: !!testCase.companionSupported,
        configured: !!testCase.companionSupported,
        paired: !!testCase.companionSupported,
        connected: !!testCase.companionSupported,
      },
    };
    await installRoutes(context, testCase.slug, { connectorsStatus: connectorStatus });
    const pairingState = {
      available: true, active: true, paired: false, connected: false,
      pairing_code: "ABCD",
    };
    if (testCase.companionSupported) {
      await context.route(/\/companion\/pairing(?:\?.*)?$/, route => route.fulfill({ json: pairingState }));
    }
    const page = await context.newPage();
    await installFakeEventSource(page);
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#sp-app");
      await page.getByRole("tab", { name: "System", exact: true }).click();
      const connectors = page.locator("#sp-connectors");
      assert.deepStrictEqual(await page.locator(".sp-nav [role='tab']").allTextContents(),
        ["Layout", "Screen", "System"], `${testCase.name}: separate Connectors tab is removed`);
      assert(await page.locator("#sp-device > .sp-config > :first-child").evaluate(
        element => element.id === "sp-connectors"), `${testCase.name}: connectors come first in System`);
      assert.strictEqual(await page.locator(".sp-page.active").count(), 1);
      for (const width of [testCase.viewport.width, 360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        await page.getByRole("tab", { name: "Screen", exact: true }).click();
        const screenTopGap = await page.locator("#sp-settings > .sp-config").evaluate(config =>
          config.firstElementChild.getBoundingClientRect().top - config.getBoundingClientRect().top);
        await page.getByRole("tab", { name: "System", exact: true }).click();
        const connectorsTopGap = await page.locator("#sp-device > .sp-config").evaluate(config =>
          config.querySelector(".sp-connectors-heading").getBoundingClientRect().top - config.getBoundingClientRect().top);
        assert(Math.abs(connectorsTopGap - screenTopGap) < 0.5,
          `${testCase.name}: Connectors and Screen have matching top spacing at ${width}px`);
        assert(await connectors.isVisible(), `${testCase.name}: connectors visible at ${width}px`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${testCase.name}: System fits at ${width}px`);
      }
      assert.strictEqual(
        await connectors.getByRole("heading", { name: "Home Assistant", exact: true }).count(),
        0,
        `${testCase.name}: connected Home Assistant does not expose setup or confirmation UI`,
      );
      assert.strictEqual(
        await connectors.getByRole("button", { name: "I’ve enabled actions" }).count(),
        0,
        `${testCase.name}: Home Assistant action confirmation is unavailable`,
      );
      if (testCase.companionSupported) {
        assert(
          await connectors.getByRole("heading", { name: "Mac Companion", exact: true }).count() > 0,
          `${testCase.name}: Mac Companion setup remains available`,
        );
      } else {
        assert(
          await connectors.getByText("No external connectors are available on this display.").isVisible(),
          `${testCase.name}: unsupported profiles show a useful local connector state`,
        );
      }
      for (const query of ["tab=connectors", "tab=connectors&connector=mac_companion", "tab=device&connector=mac_companion"]) {
        await page.goto(`http://espdesktop.test/${testCase.slug}?events=1&${query}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#sp-device.active #sp-connectors");
        if (testCase.companionSupported) {
          const card = connectors.locator(".card").filter({ hasText: "Mac Companion" });
          if (await card.evaluate(element => element.classList.contains("collapsed"))) {
            await card.getByRole("heading", { name: "Mac Companion", exact: true }).click();
          }
          await connectors.getByText("Choose this display in the Mac app and enter the code.", { exact: true }).waitFor();
        }
      }
      if (testCase.companionSupported) {
        const companion = connectors.locator(".card").filter({ hasText: "Mac Companion" });
        const code = companion.locator(".sp-companion-code");
        await code.waitFor({ state: "visible" });
        assert.deepEqual(await code.locator(".sp-companion-code-letter").allTextContents(), [..."ABCD"]);
        assert.equal(await code.textContent(), "ABCD", "the boxes preserve the complete code for selection");
        const copy = companion.getByRole("button", { name: "Copy pairing code" });
        await copy.waitFor({ state: "visible" });
        await page.setViewportSize({ width: 320, height: 740 });
        assert(await code.evaluate(element => {
          const codeBounds = element.getBoundingClientRect();
          const letters = [...element.querySelectorAll(".sp-companion-code-letter")];
          return codeBounds.right <= innerWidth && letters.every(letter =>
            letter.getBoundingClientRect().top === letters[0].getBoundingClientRect().top);
        }), `${testCase.name}: all code boxes fit on one line at phone width`);
        assert.equal(await companion.getByText("Ready to pair", { exact: true }).isVisible(), false);
        assert.equal(await companion.getByRole("button", { name: "Clear downloaded app icons" }).isVisible(), false);

        Object.assign(pairingState, { active: false, paired: true, pairing_code: "" });
        await companion.getByText("Mac paired, but not connected", { exact: true }).waitFor({ state: "visible" });
        pairingState.connected = true;
        await companion.locator(".card-body").waitFor({ state: "hidden" });

        await companion.getByRole("heading", { name: "Mac Companion", exact: true }).click();
        const clearIcons = companion.getByRole("button", { name: "Clear downloaded app icons" });
        const reset = companion.getByRole("button", { name: "Reset Mac Companion pairing" });
        await clearIcons.waitFor({ state: "visible" });
        await reset.waitFor({ state: "visible" });
        await page.setViewportSize(testCase.viewport);
        const [clearBox, resetBox] = await Promise.all([clearIcons.boundingBox(), reset.boundingBox()]);
        assert(resetBox.x >= clearBox.x + clearBox.width + 8,
          `${testCase.name}: maintenance buttons have a visible gap`);
        assert.strictEqual(await clearIcons.evaluate(button => getComputedStyle(button).backgroundColor),
          "rgb(46, 46, 50)", `${testCase.name}: clear icons uses the dark secondary button style`);

        await page.setViewportSize({ width: 320, height: 740 });
        await page.waitForResponse(response => new URL(response.url()).pathname === "/companion/pairing");
        assert(await clearIcons.isVisible() && await reset.isVisible(),
          `${testCase.name}: maintenance buttons remain accessible after reopening and polling`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${testCase.name}: maintenance buttons fit on a narrow screen`);
      }
    } finally {
      await context.close();
    }
  }
}

async function assertColourSwatches(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { homeAssistantSupport: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForFunction(() => window.__eventSources && window.__eventSources.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.getByRole("tab", { name: "System" }).click();
    assert.strictEqual(await page.getByRole("heading", { name: "App icon colours", exact: true }).count(), 0,
      "System settings no longer contain global app icon colour switches");
    await page.getByRole("tab", { name: "Screen" }).click();
    const primary = page.locator("#sp-set-on-color");
    if (!await primary.isVisible()) await page.getByRole("heading", { name: "Active Colour", exact: true }).click();
    await primary.waitFor({ state: "visible" });
    async function assertPalette(group, label) {
      assert.strictEqual(await group.locator("button[data-color]").count(), 19, `${label}: 19 preset buttons`);
      assert.strictEqual(await group.locator(".sp-card-color-preset").count(), 20, `${label}: presets plus one custom swatch`);
      assert.strictEqual(await group.locator("label.sp-card-color-custom").count(), 1, `${label}: native picker is label-backed`);
      assert(await group.locator("label.sp-card-color-custom").isVisible(), `${label}: custom swatch is visible`);
      assert.strictEqual(await group.getByLabel("Choose custom colour", { exact: true }).getAttribute("type"), "color");
    }
    await assertPalette(primary, "Appearance");
    const primaryCustom = primary.locator(".sp-card-color-custom");
    const primaryPicker = primary.getByLabel("Choose custom colour", { exact: true });
    assert.strictEqual(await primaryPicker.inputValue(), "#0073ff");
    assert.strictEqual(await primaryCustom.getAttribute("data-selected"), "true", "existing non-preset theme colour selects the custom swatch");
    await primaryPicker.fill("#123abc");
    assert.strictEqual(await primaryCustom.getAttribute("data-selected"), "true");
    assert.strictEqual(await primaryCustom.getAttribute("data-has-color"), "true");
    assert.strictEqual(await primaryCustom.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(18, 58, 188)");
    await primary.locator('[data-color="54B7C8"]').click();
    assert.strictEqual(await primary.locator('[data-color="54B7C8"]').getAttribute("aria-pressed"), "true");
    assert.strictEqual(await primaryCustom.getAttribute("data-selected"), "false");
    assert.strictEqual(await primaryPicker.inputValue(), "#123abc", "preset selection retains the native custom choice");
    await page.getByRole("tab", { name: "Layout" }).click();
    await page.locator('.sp-main [data-slot="1"]').click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Custom Colours", exact: true }).click();
    const colours = page.locator('.sp-settings-modal').getByRole("group", { name: "Card colour presets", exact: true });
    await assertPalette(colours, "Card background");
    const defaultPreset = await colours.locator('[aria-pressed="true"]').getAttribute("data-color");
    await colours.locator('[data-color="6036B2"]').click();
    assert.strictEqual(await colours.locator('[data-color="6036B2"]').getAttribute("aria-pressed"), "true");
    await colours.getByLabel("Choose custom colour", { exact: true }).fill("#abcdef");
    assert.strictEqual(await colours.locator('.sp-card-color-custom').getAttribute("data-selected"), "true");
    assert.strictEqual(await colours.locator('[aria-pressed="true"]').count(), 0);
    await page.getByRole("button", { name: "Reset colours to defaults", exact: true }).click();
    assert.strictEqual(await colours.locator('[aria-pressed="true"]').getAttribute("data-color"), defaultPreset,
      "reset selects the original default background swatch");
    assert.strictEqual(await colours.locator('.sp-card-color-custom').getAttribute("data-selected"), "false");
    assert.deepStrictEqual(errors, []);
  } finally { await context.close(); }
}

async function assertScreensaverPinRemoval(browser) {
  const testCase = ACTIVE_CASES[0];
  const context = await browser.newContext({ viewport: testCase.viewport });
  const pin = { enabled: true, pin: "2468", posts: [] };
  const resetState = { epoch: 3, pending: false, requests: [] };
  await installRoutes(context, testCase.slug, { screensaverPinState: pin, resetState, nativeState: nativeConfigState(testCase.slug) });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.getByRole("tab", { name: "Screen" }).click();
    await page.locator("#sp-settings .card-header").getByText("Screensaver", { exact: true }).waitFor();
    assert.strictEqual(await page.getByText("Pin Protection", { exact: true }).count(), 0);
    assert.strictEqual(await page.locator("#sp-set-screensaver-pin").count(), 0);
    assert.strictEqual(pin.posts.length, 0, "opening settings leaves old firmware untouched");

    await importBackup(page, backupFixture(testCase.slug, testCase.slots, testCase.slug), "screensaver-pin-restore");
    await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor();
    assert.deepStrictEqual(pin.posts, [{ enabled: false, pin: "" }]);
    assert.strictEqual(pin.pin, "");
    assert.strictEqual(pin.enabled, false);
  } finally { await context.close(); }
}

async function assertCardCurveSettings(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  let savedPreset = "Large";
  try {
    await installRoutes(context, testCase.slug);
    await context.route("**/select/screen__card_curve/set**", async route => {
      savedPreset = new URL(route.request().url()).searchParams.get("option");
      assert(["Small", "Medium", "Large"].includes(savedPreset));
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });
    const page = await context.newPage();
    await installFakeEventSource(page);
    const seed = async () => page.evaluate(events => window.__seedEspState(events), [
      ...seededEvents(),
      { id: "text-button_3_config", state: ";Rooms;Home;Auto;;;subpage" },
      { id: "text-subpage_3_config", state: "~B,1|,light.kitchen,Kitchen,Lightbulb,Lightbulb" },
      { id: "select-screen__rotation", state: "0", value: "0", option: ["0", "90", "180", "270"] },
      { id: "select-screen__card_curve", state: savedPreset, value: savedPreset, option: ["Small", "Medium", "Large"] },
    ]);
    const open = async () => {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seed();
      await page.getByRole("tab", { name: "Screen", exact: true }).click();
      const appearance = page.locator("#sp-settings .card").filter({ has: page.locator("#sp-set-card-curve") });
      if (!(await page.locator("#sp-set-card-curve").isVisible())) await appearance.locator(".card-header").click();
      await page.locator("#sp-set-card-curve").waitFor({ state: "visible" });
      assert.deepStrictEqual(await page.locator("#sp-settings .card-header h3").allTextContents().then(titles => titles.slice(0, 4)),
        ["Active Colour", "Card Style", "App Subpages", "Theme"], "Appearance settings include the global App Subpages panel");
      assert.strictEqual(await page.locator("#sp-set-wallpaper, #sp-set-card-transparency, #sp-set-active-card-transparency").count(), 0,
        "wallpaper controls belong exclusively to the wallpaper PR");
    };
    await open();
    const profile = readManifest().devices[testCase.slug];
    const substitutions = profile.firmware.package.substitutions;
    const width = Number(substitutions.screen_width.replaceAll('"', ""));
    const base = Number(substitutions.radius.replace("px", ""));
    const small = Number((substitutions.card_curve_small_radius || '').replace('px', '')) || Math.round(base * .6);
    const medium = Number((substitutions.card_curve_medium_radius || '').replace('px', '')) || Math.round(base * .8);
    for (const [preset, firmwareRadius] of [["Small", small], ["Medium", medium], ["Large", base]]) {
      const expected = profile.web.cardCurveRadii?.[preset] ?? firmwareRadius;
      const posted = page.waitForResponse(response => response.url().includes(`/select/screen__card_curve/set?option=${preset}`));
      await page.locator("#sp-set-card-curve").getByRole("button", { name: preset, exact: true }).click();
      await posted;
      assert.strictEqual(savedPreset, preset, "curve changes must reach the saved firmware select");
      const radius = await page.evaluate(logicalWidth => parseFloat(document.documentElement.style.getPropertyValue("--btn-r")) * logicalWidth / 100, width);
      assert(Math.abs(radius - expected) < .001, `${testCase.slug}: ${preset} must match the configured preview radius ${expected}`);
      await page.getByRole("tab", { name: "Layout", exact: true }).click();
      const checkCards = async surface => {
        await page.waitForFunction(() => [...document.querySelectorAll(".sp-main .sp-btn")].every(card => getComputedStyle(card).clipPath.startsWith("path(")));
        const shapes = await page.locator(".sp-main .sp-btn").evaluateAll(cards => cards.map(card => {
          const clip = getComputedStyle(card).clipPath;
          const path = new Path2D(clip.slice(6, -2));
          const radius = parseFloat(document.documentElement.style.getPropertyValue("--btn-r")) * document.querySelector(".sp-screen").clientWidth / 100;
          const ctx = document.createElement("canvas").getContext("2d");
          return !ctx.isPointInPath(path, radius, radius * .02) && ctx.isPointInPath(path, radius, radius * .1);
        }));
        assert(shapes.length >= 2 && shapes.every(Boolean), `${preset}: every ${surface} card must retain the gradual curve`);
      };
      await checkCards("home");
      await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
      await page.waitForSelector(".sp-back-btn");
      await checkCards("subpage, including Back");
      await page.locator(".sp-back-btn .sp-back-hit").click();
      await page.waitForSelector(".sp-back-btn", { state: "detached" });
      await page.getByRole("tab", { name: "Screen", exact: true }).click();
    }
    const posted = page.waitForResponse(response => response.url().includes("/select/screen__card_curve/set?option=Medium"));
    await page.locator("#sp-set-card-curve").getByRole("button", { name: "Medium", exact: true }).click();
    await posted;
    await open();
    assert.strictEqual(await page.locator("#sp-set-card-curve").getByRole("button", { name: "Medium", exact: true }).getAttribute("aria-pressed"), "true", "reload follows the saved curve");
    await openBackupControls(page);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = await downloadPromise;
    const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    assert.strictEqual(backup.screen.card_curve, "Medium", "export includes the saved curve");
  } finally { await context.close(); }
}

// Read the actual rasterized border so covered outlines and thin clipped
// corners fail even when the CSS reports the expected selection state.
async function assertPreviewOutlinePixels(page, selector, label, expectedWidth = 2) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Measure and capture in viewport coordinates. A full-page capture can
  // reflow the preview and leave its responsive SVG out of sync with the pixels.
  const ready = await page.waitForFunction(selector => {
    // A preview redraw replaces the card. Query the live card and its outline
    // on each frame instead of waiting for an old element to stabilize.
    const card = document.querySelector(selector);
    const outline = card?.querySelector(":scope > .sp-card-outline");
    if (!outline?.firstElementChild) return null;
    const bounds = card.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    if (bounds.left < 0 || bounds.top < 0 || bounds.right > innerWidth || bounds.bottom > innerHeight) {
      card.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      return null;
    }
    const style = getComputedStyle(card);
    const radiusName = card.classList.contains("sp-empty-cell") ? "--empty-r" : "--btn-r";
    return { width: bounds.width, height: bounds.height, left: bounds.left, top: bounds.top, scale: window.devicePixelRatio,
      radius: parseFloat(getComputedStyle(document.documentElement).getPropertyValue(radiusName)) * document.querySelector(".sp-screen").clientWidth / 100,
      continuous: style.clipPath.startsWith("path("), dashed: card.classList.contains("sp-empty-cell") };
  }, selector);
  const geometry = await ready.jsonValue();
  await ready.dispose();
  const png = await page.screenshot({ animations: "disabled", scale: "device" });

  const thicknesses = await page.evaluate(async ({ geometry: g, png }) => {
    const image = new Image(); image.src = png; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const ink = (x, y) => {
      // Interpolate pixel centers to avoid diagonal sampling bias at low DPI.
      x = (x + g.left) * g.scale - .5; y = (y + g.top) * g.scale - .5;
      const px = Math.floor(x), py = Math.floor(y), fx = x - px, fy = y - py;
      const sample = (sx, sy) => {
        if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) return 0;
        const i = (sy * image.width + sx) * 4;
        return Math.max(0, Math.min(1, (Math.min(pixels[i], pixels[i + 2]) - pixels[i + 1]) / 255));
      };
      return sample(px, py) * (1 - fx) * (1 - fy) + sample(px + 1, py) * fx * (1 - fy) +
        sample(px, py + 1) * (1 - fx) * fy + sample(px + 1, py + 1) * fx * fy;
    };
    const thickness = (x, y, nx, ny) => {
      let total = 0;
      // Include antialiased pixels immediately outside the mathematical edge.
      for (let d = -1; d < 5; d += .25) total += ink(x + nx * d, y + ny * d) * .25;
      return total;
    };
    const groups = [[], [], [], [], []];
    for (let i = 6; i <= 26; ++i) {
      const a = i * Math.PI / 64, c = Math.cos(a), s = Math.sin(a);
      const x = g.continuous ? g.radius * 2 * (1 - Math.sqrt(c)) : g.radius * (1 - c);
      const y = g.continuous ? g.radius * 2 * (1 - Math.sqrt(s)) : g.radius * (1 - s);
      const gx = g.continuous ? c ** 1.5 : c, gy = g.continuous ? s ** 1.5 : s;
      const length = Math.hypot(gx, gy), nx = gx / length, ny = gy / length;
      groups[0].push(thickness(x, y, nx, ny));
      groups[1].push(thickness(g.width - x, y, -nx, ny));
      groups[2].push(thickness(x, g.height - y, nx, -ny));
      groups[3].push(thickness(g.width - x, g.height - y, -nx, -ny));
      const edge = g.width / 2 + i - 16;
      groups[4].push(thickness(edge, 0, 0, 1), thickness(edge, g.height, 0, -1));
    }
    return groups.map(group => {
      const inked = g.dashed ? group.filter(value => value > 1) : group;
      return { samples: inked.length, width: inked.reduce((sum, value) => sum + value, 0) / inked.length };
    });
  }, { geometry, png: `data:image/png;base64,${png.toString("base64")}` });
  for (const [index, measurement] of thicknesses.entries()) {
    assert(measurement.samples >= 3 && Math.abs(measurement.width - expectedWidth) < .8,
      `${label}: ${index < 4 ? "corner " + index : "straight sides"} must show an even ${expectedWidth}px outline: ${JSON.stringify(thicknesses)}`);
  }
  // Average opposing corners to cancel pixel-phase differences when card
  // bounds land between device pixels. Each corner still has its own limit.
  const cornerWidth = thicknesses.slice(0, 4).reduce((sum, value) => sum + value.width, 0) / 4;
  assert(Math.abs(cornerWidth - thicknesses[4].width) < .65,
    `${label}: corner thickness must match the sides: ${JSON.stringify(thicknesses)}`);
}

async function assertPreviewOutlines(browser, testCase, exhaustive = false) {
  const context = await browser.newContext({ viewport: testCase.viewport, deviceScaleFactor: 2 });
  try {
    await installRoutes(context, testCase.slug);
    const page = await context.newPage();
    await installFakeEventSource(page);
    await page.addInitScript(() => { window.__ESPDESKTOP_TEST_HOOKS__ = {}; });
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.locator('.sp-main > .sp-btn[data-slot="1"]').click();
    await page.waitForSelector('.sp-main > .sp-btn[data-slot="1"].sp-selected');
    const outlineStyle = await page.addStyleTag({ content: ".sp-btn,.sp-empty-cell{transition:none!important;--accent:#ff00ff!important;--card-outline-color:#ff00ff!important}" });
    // Keep the normal smoke run bounded: cover plain, image, artwork, slider
    // and QR content. The opt-in sweep covers every card and curve preset.
    const fixtures = await page.evaluate(exhaustive => {
      const hooks = window.__ESPDESKTOP_TEST_HOOKS__.config;
      const keys = exhaustive
        ? [...new Set([...hooks.cardContractCardKeys(), ...hooks.buttonTypePickerKeysFor(false), "media_cover_art"])]
        : ["weather", "image", "media_cover_art", "light_brightness"];
      return keys.map(key => {
        const config = hooks.buttonTypeDefaultConfig(key);
        return config ? { key, config: hooks.serializeButtonConfig(config) } : null;
      }).filter(Boolean);
    }, exhaustive);
    assert(fixtures.some(fixture => fixture.key === "image"), "outline sweep must include image cards");
    if (testCase.mediaCoverArtSupported) assert(fixtures.some(fixture => fixture.key === "media_cover_art"), "outline sweep must include Cover Art");
    for (const preset of (exhaustive ? ["Small", "Medium", "Large"] : ["Medium"])) {
      await page.evaluate(preset => window.__seedEspState([{ id: "select-screen__card_curve", state: preset, value: preset }]), preset);
      for (const fixture of fixtures) {
        await page.evaluate(config => window.__seedEspState([
          { id: "text-button_order", state: "1" }, { id: "text-button_1_config", state: config },
        ]), fixture.config);
        const card = page.locator('.sp-main > .sp-btn[data-slot="1"]');
        // Info-only profiles deliberately hide unsupported cards.
        if (!(await card.count())) continue;
        await assertPreviewOutlinePixels(page, '.sp-main > .sp-btn[data-slot="1"].sp-selected', `${testCase.slug}/${preset}/${fixture.key}`);
      }
      const empty = ".sp-main > .sp-empty-cell:not(.sp-info-only-hidden)";
      await page.locator(empty).first().hover();
      await assertPreviewOutlinePixels(page, empty, `${testCase.slug}/${preset}/empty`);
    }
    if (testCase.slug === "guition-esp32-s3-4848s040") {
      await page.evaluate(() => window.__seedEspState([
        { id: "select-screen__card_curve", state: "Large", value: "Large" },
        { id: "text-button_order", state: "1,2" },
        { id: "text-button_2_config", state: "media_player.living;Speakers;Auto;Auto;speaker_group;;media" },
      ]));
      await assertPreviewOutlinePixels(page, '.sp-main > .sp-media-group-active[data-slot="2"]:not(.sp-selected)',
        `${testCase.slug}/Large/speaker group`, 3);
    }
    // A resized, large artwork card exercises mask regeneration as well as layering.
    if (testCase.mediaCoverArtSupported) {
      const art = fixtures.find(fixture => fixture.key === "media_cover_art");
      await page.evaluate(config => window.__seedEspState([
        { id: "text-button_order", state: "1b" }, { id: "text-button_1_config", state: config },
      ]), art.config);
      await page.setViewportSize({ width: 700, height: 900 });
      const card = page.locator('.sp-main > .sp-btn[data-slot="1"]');
      if (!(await card.evaluate(card => card.classList.contains("sp-selected")))) await card.click();
      await assertPreviewOutlinePixels(page, '.sp-main > .sp-btn[data-slot="1"].sp-selected', `${testCase.slug}/resized artwork`);
    }
    await outlineStyle.evaluate(style => style.remove());
    if (process.env.ESPDESKTOP_OUTLINE_SCREENSHOT) await page.locator(".sp-screen").screenshot({ path: process.env.ESPDESKTOP_OUTLINE_SCREENSHOT });
  } finally { await context.close(); }
}

async function assertContinuousPreview(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  try {
    await installRoutes(context, testCase.slug);
    const page = await context.newPage();
    await installFakeEventSource(page);
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    const checkShape = async (previousClip = "") => {
      // Resizing may replace the card node. Read its path and geometry together
      // from the live grid after the replacement has received its new outline.
      const result = await page.waitForFunction(old => {
        const card = document.querySelector(".sp-main > .sp-btn");
        const screen = document.querySelector(".sp-screen");
        if (!card || !screen) return null;
        const { clipPath: clip, width, height } = getComputedStyle(card);
        if (!clip.startsWith("path(") || clip === old || !parseFloat(width) || !parseFloat(height)) return null;
        const radius = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--btn-r")) * screen.clientWidth / 100;
        const path = new Path2D(clip.slice(6, -2));
        const ctx = document.createElement("canvas").getContext("2d");
        return { clip, radius, width, height,
          edgeClear: !ctx.isPointInPath(path, radius, radius * .02),
          interiorSolid: ctx.isPointInPath(path, radius, radius * .1),
          cornerClear: !ctx.isPointInPath(path, 0, 0),
          centerSolid: ctx.isPointInPath(path, parseFloat(width) / 2, parseFloat(height) / 2) };
      }, previousClip);
      const { clip, ...geometry } = await result.jsonValue();
      await result.dispose();
      assert(geometry.edgeClear && geometry.interiorSolid && geometry.cornerClear && geometry.centerSolid,
        `${testCase.slug}: the clip path follows the firmware curve (${JSON.stringify(geometry)})`);
      return clip;
    };
    const before = await checkShape();
    await page.setViewportSize({ width: 700, height: 900 });
    await checkShape(before);
    const gaps = await page.locator(".sp-main").evaluate(grid => ({
      row: parseFloat(getComputedStyle(grid).rowGap),
      column: parseFloat(getComputedStyle(grid).columnGap),
      expected: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--grid-gap")) * document.querySelector(".sp-screen").clientWidth / 100,
    }));
    assert(Math.abs(gaps.row - gaps.expected) < .05 && Math.abs(gaps.column - gaps.expected) < .05,
      "preview card gaps must retain the configured scale after resizing");
  } finally { await context.close(); }
}

async function assertWeatherWidthScaling(browser) {
  const { createWebStyles } = loadTypeScriptModule(path.join(ROOT, "src/webserver/application/styles.ts"));
  const layoutScript = require("esbuild").buildSync({entryPoints:[path.join(ROOT,"src/webserver/application/weather_daily_preview.ts")],bundle:true,write:false,format:"iife",globalName:"WeatherPreview"}).outputFiles[0].text;
  const page = await browser.newPage();
  try {
    await page.setContent('<style>' + createWebStyles(false) + '</style><div id="weather" class="sp-btn sp-weather-daily-card" style="position:relative;width:120px;height:120px;--btn-label:16px;--btn-icon:32px;--btn-pad:8px;--r:8px"><span class="sp-weather-days">' +
      Array.from({ length: 8 }, (_, i) => '<span class="sp-weather-day"><span class="mdi">☀</span><span>' + (i ? 'Tues' : 'Today') + '</span><span class="sp-weather-temperature-high">18°/2°</span></span>').join('') + '</span></div>');
    const firstDayRows = await page.locator('.sp-weather-day').first().evaluate(day => Array.from(day.children).map(child => child.textContent));
    assert.deepStrictEqual(firstDayRows, ['☀', 'Today', '18°/2°'], 'Daily preview matches the device order and omits a separate low temperature row.');
    await page.addScriptTag({content:layoutScript});
    await page.evaluate(() => {
      window.weatherLayout = WeatherPreview.createWeatherDailyPreviewLayout(document, { displayWidth: 480, displayHeight: 480 }, () => false);
      window.weatherLayout.observe(document.querySelector('#weather'));
    });
    const counts = [];
    for (const width of [120, 240, 420, 900]) {
      await page.locator('#weather').evaluate((card, value) => { card.style.width = value + 'px'; card.getBoundingClientRect(); }, width);
      await page.waitForFunction(value => Math.abs(document.querySelector("#weather").getBoundingClientRect().width - value) < 1, width);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      counts.push(await page.locator('.sp-weather-day').evaluateAll(days => days.filter(day => getComputedStyle(day).display !== 'none').length));
      const fill = await page.locator('.sp-weather-days').evaluate(row => {
        const columns = Array.from(row.children).filter(day => !day.hidden).map(day => day.getBoundingClientRect());
        const bounds = row.getBoundingClientRect();
        return {left: columns[0].left - bounds.left, right: bounds.right - columns[columns.length - 1].right,
          widths: columns.map(column => column.width)};
      });
      assert(Math.abs(fill.left) < 1 && Math.abs(fill.right) < 1,
        'Visible forecast days fill the row at every card width, including when all eight fit: ' + JSON.stringify(fill));
      assert(Math.max(...fill.widths) - Math.min(...fill.widths) < 1, 'Forecast panels share the remaining space equally.');

    }
    assert(counts[0] === 1 && counts[3] === 8 && counts.every((count, i) => i === 0 || count > counts[i - 1]),
      'Daily forecast preview adds complete day columns as its width increases: ' + counts.join(','));
    await page.locator('#weather').evaluate(card => { card.style.width = '420px'; card.getBoundingClientRect(); });
    const columnGap = await page.locator('.sp-weather-day').evaluateAll(days => {
      const visible = days.filter(day => getComputedStyle(day).display !== 'none');
      return visible[1].getBoundingClientRect().left - visible[0].getBoundingClientRect().right;
    });
    assert(columnGap >= 19, 'Daily forecast preview matches the wider device gap between columns: ' + columnGap);
    for (const [height, expectedRows] of [[120, 1], [160, 1], [240, 2]]) {
      await page.locator('#weather').evaluate((card, value) => { card.style.height = value + 'px'; }, height);
      await page.waitForFunction(value => Math.abs(document.querySelector('#weather').getBoundingClientRect().height - value) < 1, height);
      // ResizeObserver updates the row plan after layout. Measure the settled
      // result rather than racing the change from a single row to a grid.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.strictEqual(Number(await page.locator('#weather').getAttribute('data-weather-rows')), expectedRows,
        `Forecast height ${height}px uses ${expectedRows} row(s).`);
      const columns = await page.locator('.sp-weather-day').evaluateAll(days => days
        .filter(day => getComputedStyle(day).display !== 'none').map(day => {
          const column = day.getBoundingClientRect();
          const [icon, weekday, temperature] = Array.from(day.children).map(child => child.getBoundingClientRect());
          return { left: column.left, top: column.top, bottom: column.bottom,
            iconLeft: icon.left, iconTop: icon.top, iconBottom: icon.bottom,
            dayLeft: weekday.left, dayTop: weekday.top,
            temperatureLeft: temperature.left, temperatureBottom: temperature.bottom };
        }));
      for (const column of columns) {
        assert([column.iconLeft, column.dayLeft, column.temperatureLeft].every(left => Math.abs(left - column.left) < 1),
          'Each forecast day aligns its icon and text to the left.');
        if (expectedRows === 1) {
          assert(Math.abs(column.iconTop - column.top) < 1 && Math.abs(column.temperatureBottom - column.bottom) < 1,
            'Single-row forecasts keep icons at the top and temperatures at the bottom as the card height changes.');
          assert(column.dayTop - column.iconBottom > 10, 'Single-row forecast text has open space above it.');
        } else {
          assert(column.iconTop >= column.top && column.temperatureBottom <= column.bottom &&
            Math.abs((column.iconTop - column.top) - (column.bottom - column.temperatureBottom)) < 1,
            'Grid forecasts centre each complete icon and temperature group within its row.');
          assert(column.dayTop - column.iconBottom >= 5, 'Grid forecast text keeps its compact icon gap.');
        }
      }
    }
    console.log('Daily forecast browser scaling passed: ' + counts.join(',') + ' complete columns.');
    await page.evaluate(() => window.weatherLayout.disconnect());
    const profile = readManifest().devices['guition-esp32-s3-4848s040'].web;
    const vars = { '--screen-w': '480px', '--screen-aspect': '1/1', '--grid-cols': 'repeat(3,1fr)', '--grid-rows': 'repeat(3,1fr)' };
    for (const [key, value] of Object.entries(profile.grid)) {
      if (typeof value === 'number') vars['--grid-' + key] = value + 'cqw';
    }
    for (const [key, variable] of [['padding', '--btn-pad'], ['radius', '--btn-r'], ['labelSize', '--btn-label'], ['iconSize', '--btn-icon'], ['smallTextSize', '--btn-small-text']]) {
      vars[variable] = profile.btn[key] + 'cqw';
    }
    const roboto = fs.readFileSync(path.join(ROOT, 'common/assets/fonts/roboto-latin.woff2')).toString('base64');
    await page.setContent('<style>@font-face{font-family:Roboto;src:url(data:font/woff2;base64,' + roboto + ')}' + createWebStyles(false) + '</style>' +
      '<div class="sp-screen" style="' + Object.entries(vars).map(([key, value]) => key + ':' + value).join(';') + '"><div class="sp-main">' +
      '<div id="weather" class="sp-btn sp-weather-daily-card" style="grid-column:span 3"><span class="sp-weather-days">' +
      ['Today','Tues','Weds','Thurs','Fri','Sat','Sun','Mon'].map(day => '<span class="sp-weather-day"><span class="mdi">☀</span><span>' + day + '</span><span class="sp-weather-temperature-high">18°/2°</span></span>').join('') + '</span></div></div></div>');
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({content:layoutScript});
    await page.evaluate(() => {
      window.weatherLayout = WeatherPreview.createWeatherDailyPreviewLayout(document, { displayWidth: 480, displayHeight: 480 }, () => false);
      window.weatherLayout.observe(document.querySelector('#weather'));
    });
    for (const width of [360, 480, 960]) {
      await page.locator('.sp-screen').evaluate((screen, value) => screen.style.setProperty('--screen-w', value + 'px'), width);
      for (const [span, expected] of [[1, 1], [2, 2], [3, 4]]) {
        await page.locator('#weather').evaluate((card, value) => card.style.gridColumn = 'span ' + value, span);
        await page.waitForFunction(count => Array.from(document.querySelectorAll('.sp-weather-day')).filter(day => !day.hidden).length === count, expected, { timeout: 5000 }).catch(async error => {
          const geometry = await page.locator('#weather').evaluate(card => {
            const context = document.createElement('canvas').getContext('2d');
            context.font = getComputedStyle(card.querySelector('.sp-weather-day')).font;
            const scale = card.closest('.sp-screen').clientWidth / 480;
            return { width: card.clientWidth, screen: card.closest('.sp-screen').clientWidth,
              padding: getComputedStyle(card).paddingLeft, font: context.font,
              glyphs: Array.from('-18.8°').map(glyph => context.measureText(glyph).width / scale),
              gap: card.querySelector('.sp-weather-days').style.gap,
              days: Array.from(card.querySelectorAll('.sp-weather-day')).filter(day => !day.hidden).length };
          });
          throw new Error('S3 forecast mismatch at preview width ' + width + ', span ' + span + ': ' + JSON.stringify(geometry), { cause: error });
        });
        await page.waitForFunction(() => {
          const day = document.querySelector('.sp-weather-day');
          return getComputedStyle(day).fontSize === getComputedStyle(day.parentElement.parentElement).fontSize;
        });
        const typography = await page.locator('.sp-weather-day').first().evaluate(day => ({ day: getComputedStyle(day).fontSize, card: getComputedStyle(day.parentElement.parentElement).fontSize }));
        assert.strictEqual(typography.day, typography.card, 'Daily text keeps the device font size instead of scaling against its own card.');
        if (span === 3) {
          const spacing = await page.locator('#weather').evaluate(card => {
            const days = Array.from(card.querySelectorAll('.sp-weather-day')).filter(day => !day.hidden);
            const scale = card.closest('.sp-screen').clientWidth / 480;
            const row = card.querySelector('.sp-weather-days').getBoundingClientRect();
            const bounds = days.map(day => day.getBoundingClientRect());
            return { widths: bounds.map(day => day.width / scale),
              gap: (bounds[1].left - bounds[0].right) / scale,
              unused: (row.right - bounds[bounds.length - 1].right) / scale };
          });
          assert(Math.abs(spacing.unused) < 1 && Math.max(...spacing.widths) - Math.min(...spacing.widths) < 1,
            'S3 forecast panels stretch equally to fill the row at every preview scale: ' + JSON.stringify(spacing));
          assert(spacing.widths.every(width => width >= 80) && spacing.gap >= 24,
            'S3 forecast days retain readable minimum widths and gaps: ' + JSON.stringify(spacing));
        }
      }
    }
    for(const previewWidth of [360,480,960]) {
      await page.locator('.sp-screen').evaluate((screen,value)=>screen.style.setProperty('--screen-w',value+'px'),previewWidth);
      for(const [wide,tall,columns,rows,list] of [[1,1,1,1,false],[2,1,2,1,false],[3,1,4,1,false],
        [1,2,1,2,false],[2,2,2,2,false],[3,2,4,2,false],[1,3,1,3,false],[2,3,2,3,false],[3,3,3,3,false]]) {
        await page.locator('#weather').evaluate((card,span)=>{card.style.gridColumn='span '+span[0];card.style.gridRow='span '+span[1];},[wide,tall]);
        await page.waitForFunction(expected=>{
          const card=document.querySelector('#weather');
          const days=[...card.querySelectorAll('.sp-weather-day')].filter(day=>!day.hidden);
          return Number(card.dataset.weatherColumns)===expected[0] && Number(card.dataset.weatherRows)===expected[1]
            && days.length===Math.min(8,expected[0]*expected[1]) && card.querySelector('.sp-weather-days').classList.contains('sp-weather-list')===expected[2];
        },[columns,rows,list],{timeout:5000});
        const bounds=await page.locator('#weather').evaluate(card=>{
          const area=card.querySelector('.sp-weather-days').getBoundingClientRect();
          return [...card.querySelectorAll('.sp-weather-day:not([hidden])')].every(day=>[...day.children].every(label=>{
            const r=label.getBoundingClientRect();return r.left>=area.left-1 && r.top>=area.top-1 && r.right<=area.right+1 && r.bottom<=area.bottom+1;
          }));
        });
        assert(bounds,`${wide}w ${tall}h forecast content fits at preview width ${previewWidth}`);
        if(wide===1 && tall>1){
          assert.deepEqual(await page.locator('#weather .sp-weather-day:not([hidden])>span:nth-child(2)').allTextContents(),
            ['Today','Tues','Weds'].slice(0,rows),'Narrow stacked cards show consecutive days without skipping entries');
        }
        if(rows>1 && !list){
          const spacing=await page.locator('#weather').evaluate((card,columns)=>{
            const scale=card.closest('.sp-screen').clientWidth/480;
            const days=[...card.querySelectorAll('.sp-weather-day:not([hidden])')];
            return days.map((day,index)=>{
              const [icon,label,temperature]=[...day.children].map(child=>child.getBoundingClientRect());
              const previous=index>=columns?days[index-columns].lastElementChild.getBoundingClientRect():null;
              return {iconGap:(label.top-icon.bottom)/scale,
                rowGap:previous?(icon.top-previous.bottom)/scale:null};
            });
          },columns);
          assert(spacing.every(day=>day.iconGap>=7 && day.iconGap<=9),
            'Grid icons have a visible gap before the day at every preview scale: '+JSON.stringify(spacing));
          assert(spacing.every(day=>day.rowGap===null || day.rowGap>=13),
            'Grid rows have more separation than icon/data lines: '+JSON.stringify(spacing));
        }
      }
    }
    console.log('All nine S3 forecast spans reflow into stacked rows and grids at three preview scales; 3w2h shows eight days.');
    await page.locator('.sp-screen').screenshot({ path: '/tmp/weather-preview-s3-after.png' });
    console.log('S3 forecast preview matches device spans 1×1, 2×1, 3×1: 1,2,4 days at three preview scales.');
  } finally { await page.close(); }
}

// Check the visible layout: Chromium may serialize flex-start as flow-start.
async function assertForecastLeftAlignment(day) {
  const offsets = await day.evaluate(element => {
    const left = element.getBoundingClientRect().left;
    return Array.from(element.querySelectorAll(':scope > span'))
      .map(span => span.getBoundingClientRect().left - left);
  });
  assert(offsets.length > 0 && offsets.every(offset => Math.abs(offset) < 1),
    `Forecast icon and labels must align to the left edge: ${offsets}`);
}

async function assertS3ForecastEditorLayout(browser) {
  const slug = 'guition-esp32-s3-4848s040';
  const nativeState = nativeConfigState(slug);
  nativeState.document.buttons[1] = 'weather.home;;Auto;Auto;;;weather;daily';
  nativeState.document.settings.button_order = '1x,2,3w,4,5,6';
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  await installRoutes(context, slug, { nativeState });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto('http://espdesktop.test/' + slug + '?events=1');
    await page.waitForSelector('#sp-app');
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await seedNativeDocument(page, nativeState);
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1000, 1400]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => document.querySelectorAll('.sp-weather-daily-card .sp-weather-day:not([hidden])').length === 4);
      const day = page.locator('.sp-weather-day:not([hidden])').first();
      await assertForecastLeftAlignment(day);
    }
    await page.locator('.sp-screen').screenshot({ path: '/tmp/weather-preview-s3-editor-after.png' });
    console.log('S3 editor integration: 3×1 forecast shows four left-aligned days before and after resizing.');
    await assertRetiredWeatherEditor(page);

    for (const [mode, label] of [["today", "Today"], ["tomorrow", "Tomorrow"]]) {
      nativeState.document.buttons[1] = `weather.home;;Auto;Auto;;;weather;${mode}`;
      await page.reload();
      await seedNativeDocument(page, nativeState);
      const days = page.locator('.sp-main [data-slot="1"] .sp-weather-day:not([hidden])');
      await days.filter({ hasText: label }).waitFor();
      assert.strictEqual(await days.count(), 1);
      const geometry = await days.first().evaluate(day => {
        const spans = day.querySelectorAll(':scope > span');
        return {icon: spans[0].getBoundingClientRect().top,
          text: spans[1].getBoundingClientRect().top, high: spans[2].textContent};
      });
      await assertForecastLeftAlignment(days.first());
      assert(geometry.icon < geometry.text && /^\d+°\/\d+°$/.test(geometry.high),
        'Single-day forecasts keep the icon above the day and show the high/low pair.');
      await page.setViewportSize({width: 1000, height: 1000});
      assert.strictEqual(await days.count(), 1, 'Single-day mode stays one day on a 3×1 card after resizing.');
      await assertRetiredWeatherEditor(page);
    }
    console.log('Saved Today/Tomorrow forecasts each show one day and retain the retired editor.');

  } finally { await context.close(); }
}

async function assertCameraScreensaverDimming(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  const nativeState = nativeConfigState(testCase.slug);
  await installRoutes(context, testCase.slug, { nativeState, homeAssistantSupport: true, connectorsStatus: { onboarding_complete: true, home_assistant: { available: true, configured: true, connected: true, actions_confirmed: true }, mac_companion: { available: false, configured: false, paired: false, connected: false } } });
  const page = await context.newPage();
  const posts = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).hostname === "espdesktop.test") posts.push(postRecord(request.url()));
  });
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#sp-app");
    await seedNativeDocument(page, nativeState);
    await page.evaluate(events => window.__seedEspState(events), seededEvents());
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    const card = page.locator("#sp-settings .card").filter({ has: page.locator(".card-header h3", { hasText: /^Screensaver$/ }) }).first();
    await card.locator(".card-header").click();
    await card.getByRole("button", { name: "Timer", exact: true }).click();
    await page.evaluate(() => window.__seedEspState([
      { id: "text-screen_saver__camera_entity", state: "image.garden" },
      { id: "switch-screen_saver__clock_overlay", state: "ON", value: true },
    ]));
    const action = card.locator("#sp-set-clock-mode");
    const timer = card.locator("#sp-set-screensaver-camera-dimming");
    const sensor = card.locator("#sp-set-sensor-screensaver-camera-dimming");
    const exportBackup = async () => {
      await openBackupControls(page);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      return JSON.parse(fs.readFileSync(await (await downloadPromise).path(), "utf8"));
    };
    if (!await action.locator('option[value="camera"]').count()) {
      assert.strictEqual(await timer.isVisible(), false, "unsupported displays hide camera dimming");
      return;
    }
    await action.selectOption("camera");
    assert.strictEqual(await timer.isVisible(), false, "older camera firmware hides dimming");
    const oldFirmwareBackup = await exportBackup();
    assert.strictEqual(Object.hasOwn(oldFirmwareBackup.settings, "screensaver_camera_dimming"), false,
      "backups from unsupported firmware omit the uninitialized dimming setting");
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    await page.evaluate(() => window.__seedEspState([{ id: "number-screen_saver__camera_dimming", state: "unknown" }]));
    assert.strictEqual(await timer.isVisible(), false, "unknown state cannot enable unsupported dimming");
    await page.evaluate(() => window.__seedEspState([{ id: "number-screen_saver__camera_dimming", state: "0 %", value: "0" }]));
    await timer.waitFor({ state: "visible" });
    assert.strictEqual(await timer.inputValue(), "0", "raw zero is accepted");
    assert.strictEqual((await exportBackup()).settings.screensaver_camera_dimming, 0,
      "backups retain a supported zero-percent dimming value");
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    assert.strictEqual(await timer.getAttribute("min"), "0");
    assert.strictEqual(await timer.getAttribute("max"), "100");
    assert.strictEqual(await timer.getAttribute("step"), "1");
    assert.strictEqual(await card.getByLabel("Background Dimming", { exact: true }).first().getAttribute("id"), await timer.getAttribute("id"));
    const set = async (slider, value) => {
      const start = posts.length;
      await slider.fill(String(value));
      await slider.dispatchEvent("change");
      await waitForPost(posts, { domain: "number", name: "screen_saver__camera_dimming", action: "set", value: String(value) }, "camera dimming saves", start);
    };
    await set(timer, 50);
    await card.getByRole("button", { name: "Home Assistant", exact: true }).click();
    assert.strictEqual(await sensor.inputValue(), "50", "Sensor shares Timer dimming without a server echo");
    await set(sensor, 100);
    await card.getByRole("button", { name: "Timer", exact: true }).click();
    assert.strictEqual(await timer.inputValue(), "100", "Timer shares Sensor dimming");
    await set(timer, 0);
    await page.evaluate(() => window.__seedEspState([{ id: "number-screensaver_camera_dimming", state: "25 %" }]));
    assert.strictEqual(await timer.inputValue(), "25", "formatted percentages and entity aliases are supported");
    await page.evaluate(() => window.__seedEspState([{ id: "number-screen_saver__camera_dimming", state: "unavailable" }]));
    assert.strictEqual(await timer.inputValue(), "25", "invalid events retain the last valid dimming");
    assert.strictEqual(await card.locator("#sp-set-ss-clock-overlay").isChecked(), true, "dimming preserves the clock overlay");
    await action.selectOption("clock");
    assert.strictEqual(await timer.isVisible(), false, "other screensaver modes hide camera dimming");
    await action.selectOption("camera");
    const backup = await exportBackup();
    assert.strictEqual(backup.settings.screensaver_camera_dimming, 25, "backup exports camera dimming");
    backup.settings.screensaver_camera_dimming = 65;
    const beforeRestore = posts.length;
    await importBackup(page, backup, `camera-dimming-${testCase.slug}`);
    await page.waitForSelector(".sp-banner.sp-success", { timeout: 15000 });
    await waitForPost(posts, { domain: "number", name: "screen_saver__camera_dimming", action: "set", value: "65" }, "backup restores camera dimming", beforeRestore);
    assert.strictEqual(await timer.inputValue(), "65");
    const beforeLegacy = posts.length;
    await page.locator(".sp-banner").evaluate(node => { node.className = "sp-banner"; });
    await importBackup(page, oldFirmwareBackup, `camera-dimming-legacy-${testCase.slug}`);
    await page.waitForSelector(".sp-banner.sp-success", { timeout: 15000 });
    assert.strictEqual(await timer.inputValue(), "65", "older backups preserve the current dimming");
    assert.strictEqual(posts.slice(beforeLegacy).some(post => post.name === "screen_saver__camera_dimming"), false, "older backups do not post a default dimming");
    assert.deepStrictEqual(errors, []);
  } finally { await context.close(); }
}

async function assertInitialGlobalIconSize(browser) {
  const slug = "guition-esp32-s3-4848s040";
  for (const preset of ["Large", "Medium", "Small", null]) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    await installRoutes(context, slug);
    let releaseSize;
    let sizeRequested;
    const requested = new Promise(resolve => { sizeRequested = resolve; });
    const released = new Promise(resolve => { releaseSize = resolve; });
    await context.route("**/select/**", async route => {
      if (!decodeURIComponent(new URL(route.request().url()).pathname).includes("Default Icon Size")) return route.fallback();
      sizeRequested();
      await released;
      await route.fulfill({ status: preset ? 200 : 404, contentType: "application/json",
        body: JSON.stringify(preset ? { id: "select-screen__default_icon_size", state: preset, value: preset } : {}) });
    });
    await context.route("**/text/**", async route => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/")[2]).toLowerCase().replace(/ /g, "_");
      const slot = name.match(/^button_(\d+)_config$/);
      const value = name === "button_order" ? "1,2" : slot ? (slot[1] === "1"
        ? "com.apple.finder;Finder;Monitor;Auto;;;companion;;"
        : slot[1] === "2" ? "com.apple.Safari;Safari;Monitor;Auto;;;companion;;icon_size=small" : "") : "";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "text-" + name, value, state: value }) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__initialAppLayouts = [];
      function record() {
        const card = document.querySelector('.sp-main [data-slot="1"]:has(.sp-companion-app-icon-fallback)');
        if (card && card.getBoundingClientRect().width) window.__initialAppLayouts.push({
          size: card.getAttribute("data-icon-size"),
          labelVisible: getComputedStyle(card.querySelector(".sp-btn-label")).display !== "none",
        });
        requestAnimationFrame(record);
      }
      requestAnimationFrame(record);
    });
    try {
      await page.goto(`http://espdesktop.test/${slug}`, { waitUntil: "domcontentloaded" });
      await requested;
      await page.waitForTimeout(150);
      assert.deepStrictEqual(await page.evaluate(() => window.__initialAppLayouts), [], "pending default cannot show app cards in a provisional layout");
      releaseSize();
      await page.waitForFunction(() => window.__initialAppLayouts.length >= 3);
      const expected = preset ? preset.toLowerCase() : "small";
      const frames = await page.evaluate(() => window.__initialAppLayouts);
      assert(frames.every(frame => frame.size === expected && frame.labelVisible === (expected !== "large")),
        `${preset || "unsupported"}: every visible frame starts in the saved layout`);
      assert.strictEqual(await page.locator('.sp-main [data-slot="2"]').getAttribute("data-icon-size"), "small", "per-card override still wins");
      assert.deepStrictEqual(errors, []);
      console.log(`Initial app icon layout passed: ${preset || "unsupported setting"}`);
    } finally { releaseSize(); await context.close(); }
  }
}

async function assertGlobalIconSize(browser, testCase) {
  for (const native of [false, true]) {
    console.log(`Checking global icon size: ${testCase.slug}/${native ? "native" : "legacy"}`);
    const fixture = nativeConfigState(testCase.slug);
    fixture.document.buttons[1] = "com.apple.finder;Finder;Monitor;Auto;;;companion;;";
    fixture.document.buttons[2] = "com.apple.Safari;Safari;Monitor;Auto;;;companion;;icon_size=small";
    fixture.document.subpages[3] = "~B,1,2|companion,com.apple.finder,Finder,Monitor,Auto|companion,com.apple.Safari,Safari,Monitor,Auto,,,,icon_size=medium";
    let savedDefault = "Small";
    const legacyTextState = {};
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: native ? fixture : null, legacyTextState });
    const defaultPosts = [];
    await context.route("**/select/screen__default_icon_size/set**", async route => {
      savedDefault = new URL(route.request().url()).searchParams.get("option");
      defaultPosts.push(savedDefault);
      await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
    });
    const page = await context.newPage();
    await installFakeEventSource(page);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const card = slot => page.locator(`.sp-main [data-slot="${slot}"]`);
    const sizes = page.getByRole("group", { name: "Default app icon size", exact: true });
    async function open() {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seedNativeDocument(page, fixture);
      await page.evaluate(preset => window.__seedEspState([
        { id: "select-screen__default_icon_size", state: preset, value: preset, option: ["Small", "Medium", "Large"] },
      ]), savedDefault);
    }
    async function openStyle() {
      await page.getByRole("tab", { name: "Screen", exact: true }).click();
      if (!(await sizes.isVisible())) await page.locator("#sp-settings .card").filter({ has: page.locator("#sp-set-default-icon-size") }).locator(".card-header").click();
    }
    try {
      await open();
      const originalSmall = native ? fixture.document.buttons[2] : legacyTextState.button_2_config;
      await openStyle();
      const posted = page.waitForResponse(response => response.url().includes("/select/screen__default_icon_size/set?option=Large"));
      await sizes.getByRole("button", { name: "Large", exact: true }).click();
      await posted;
      assert.strictEqual(savedDefault, "Large", "global setting reaches the display select");
      await page.getByRole("tab", { name: "Layout", exact: true }).click();
      assert.strictEqual(await card(1).getAttribute("data-icon-size"), "large", "unconfigured cards inherit Large");
      assert(!(await card(1).locator(".sp-btn-label").isVisible()), "inherited Large hides the label");
      assert.strictEqual(await card(2).getAttribute("data-icon-size"), "small", "manual Small overrides global Large");
      assert(await card(2).locator(".sp-btn-label").isVisible());
      assert.strictEqual(native ? fixture.document.buttons[2] : legacyTextState.button_2_config, originalSmall, "global changes do not rewrite per-card choices");
      await card(2).click({ button: "right" });
      await page.locator(".sp-ctx-menu").getByRole("button", { name: "App Icon Size", exact: true }).click();
      await page.locator(".sp-ctx-submenu").getByRole("button", { name: "Use Default", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sp-main [data-slot="2"]')?.dataset.iconSize === "large");
      assert(!(native ? fixture.document.buttons[2] : legacyTextState.button_2_config).includes("icon_size="), "Use Default removes the saved override");
      await card(3).locator(".sp-subpage-badge").click();
      await page.locator(".sp-back-btn").waitFor();
      assert.strictEqual(await card(1).getAttribute("data-icon-size"), "large", "subpage cards inherit the global size");
      assert.strictEqual(await card(2).getAttribute("data-icon-size"), "medium", "subpage manual sizes stay fixed");
      await page.locator(".sp-back-btn .sp-back-hit").click();
      // Device/HA events also update inherited cards without changing overrides.
      await page.evaluate(() => window.__seedEspState([
        { id: "select-screen__default_icon_size", state: "Medium", value: "Medium" },
      ]));
      assert.strictEqual(await card(1).getAttribute("data-icon-size"), "medium");
      assert(await card(1).locator(".sp-btn-label").isVisible(), "labels return when inherited size shrinks");
      await open();
      await openStyle();
      assert.strictEqual(await sizes.getByRole("button", { name: "Large", exact: true }).getAttribute("aria-pressed"), "true", "reload follows the saved display setting");
      // Backup settings use the same queue on every profile. Exercise both
      // native and legacy restore formats on the S3 without repeating full
      // device restores for each preview geometry.
      if (testCase.slug !== "guition-esp32-s3-4848s040") {
        assert.deepStrictEqual(errors, []);
        continue;
      }
      await openBackupControls(page);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export", exact: true }).click();
      const backup = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), "utf8"));
      assert.strictEqual(backup.screen.default_icon_size, "large", "backups include the global default");
      const previousPosts = defaultPosts.length;
      await importBackup(page, backupFixture(testCase.slug, testCase.slots), "default-icon-size-legacy");
      await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor({ timeout: 30000 });
      assert.strictEqual(defaultPosts.length, previousPosts, "older backups preserve the current default");
      backup.screen.default_icon_size = "medium";
      await page.locator(".sp-banner").evaluate(node => { node.className = "sp-banner"; });
      await importBackup(page, backup, "default-icon-size-restore");
      await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor({ timeout: 30000 });
      assert.strictEqual(savedDefault, "Medium", "backup restore restores the global size");
      assert.deepStrictEqual(errors, []);
    } finally { await context.close(); }
  }
}

async function assertStandardIconSizes(browser, testCase) {
  for (const native of [true, false]) {
    console.log(`Checking fixed non-app icons: ${testCase.name}/${native ? "native" : "legacy"}`);
    const fixture = nativeConfigState(testCase.slug);
    fixture.document.buttons[1] = "light.kitchen;Kitchen;Lightbulb;Auto;;;;;icon_size=large";
    fixture.document.buttons[2] = "stats;Stats;Gauge;;;;companion;;icon_size=medium";
    fixture.document.buttons[3] = ";Monitor;Monitor;;;;subpage;;icon_size=large";
    fixture.document.subpages[3] = "~B,1|,light.kitchen,Kitchen,Lightbulb,Auto,,,,icon_size=large";
    const legacyTextState = {};
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState: native ? fixture : null, legacyTextState });
    const page = await context.newPage();
    await installFakeEventSource(page);
    async function assertFixed(slot) {
      const card = page.locator(`.sp-main [data-slot="${slot}"]`);
      assert.strictEqual(await card.getAttribute("data-icon-size"), "small", "ordinary icons ignore global and saved sizes");
      assert(await card.locator(".sp-btn-label").isVisible(), "ordinary icons retain their label");
      await card.click({ button: "right" });
      assert.strictEqual(await page.locator(".sp-ctx-menu").getByRole("button", { name: /Icon Size/ }).count(), 0,
        "ordinary icons have no size context menu");
      await page.locator(".sp-ctx-menu").getByText("Edit Card", { exact: true }).click();
      assert.strictEqual(await page.locator(".sp-settings-modal").getByRole("group", { name: /icon size/i }).count(), 0,
        "ordinary icons have no size editor");
      await page.keyboard.press("Escape");
    }
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.__eventSources?.length > 0);
      await seedNativeDocument(page, fixture);
      await page.evaluate(() => window.__seedEspState([
        { id: "select-screen__default_icon_size", state: "Large", value: "Large" },
      ]));
      await page.getByRole("tab", { name: "Layout" }).click();
      for (const slot of [1, 2, 3]) await assertFixed(slot);
      await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
      await page.locator(".sp-back-btn").waitFor();
      await assertFixed(1);
    } finally { await context.close(); }
  }
}

async function assertRetiredWeatherEditor(page) {
  await page.locator('.sp-main [data-slot="1"]').click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.locator(".sp-settings-overlay.sp-visible .sp-settings-modal");
  const notice = modal.getByText(/configuration has been kept/);
  if (!(await notice.isVisible())) {
    await modal.getByRole("button", { name: "Card Settings", exact: true }).click();
  }
  await notice.waitFor();
  assert.strictEqual(await modal.locator(
    '[id$="wind-source"], [id$="wind-direction"], [id$="wind-speed"], [id$="rainfall-source"], [id$="entity"], [id$="weather-display"]',
  ).count(), 0, "retired Weather cards have no source or mode controls");
}

async function assertSavedWeatherCard(browser, config, valueSelector, label) {
  const slug = "guition-esp32-p4-jc1060p470";
  const nativeState = nativeConfigState(slug);
  nativeState.document.buttons[1] = config;
  nativeState.document.buttons[2] = "weather.home;;Auto;Auto;;;weather;today";
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installRoutes(context, slug, { nativeState });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${slug}?events=1`);
    await seedNativeDocument(page, nativeState);
    const value = page.locator(`.sp-main [data-slot="1"] ${valueSelector}`);
    const geometry = await value.evaluate(element => {
      const card = element.closest(".sp-btn").getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return { left: rect.left - card.left, bottom: card.bottom - rect.bottom };
    });
    assert(geometry.left >= 10 && geometry.bottom >= 10, `${label} preview retains card padding`);
    const secondaryTextStyle = element => {
      const css = getComputedStyle(element);
      return ["fontFamily", "fontSize", "fontWeight", "color", "opacity"].map(key => css[key]);
    };
    const forecast = page.locator('.sp-main [data-slot="2"] .sp-weather-temperature-high');
    assert.deepStrictEqual(await value.evaluate(secondaryTextStyle), await forecast.evaluate(secondaryTextStyle),
      `${label} secondary text matches forecast temperatures`);

    await assertRetiredWeatherEditor(page);
    await page.reload();
    await seedNativeDocument(page, nativeState);
    await value.waitFor();
    await assertRetiredWeatherEditor(page);
    assert.strictEqual(nativeState.document.buttons[1], config, `${label} retains its saved sources`);
    console.log(`${label} preview and retired editor preserve its saved configuration.`);
  } finally {
    await context.close();
  }
}

async function assertWindSensorEditor(browser) {
  await assertSavedWeatherCard(browser,
    "sensor.wind_direction;;Auto;Auto;sensor.wind_speed;;weather;wind;wind_source=sensors",
    ".sp-weather-wind-speed", "Wind");
}

async function assertRainfallEditor(browser) {
  await assertSavedWeatherCard(browser,
    "sensor.rainfall_today;;Auto;Auto;;;weather;rainfall",
    ".sp-rainfall-value", "Rainfall");
}

async function assertAppSubpageOpeningPreference(browser) {
  const testCase = ACTIVE_CASES[0];
  const fixture = nativeConfigState(testCase.slug);
  const context = await browser.newContext({ viewport: testCase.viewport });
  const routes = { nativeState: fixture, nativeAppSubpagePreference: true };
  await installRoutes(context, testCase.slug, routes);
  const returnPosts = [];
  await context.route("**/switch/*return_home_on_app_switch*/**", async route => {
    returnPosts.push(new URL(route.request().url()).pathname.split("/").pop());
    await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  async function open() {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await seedNativeDocument(page, fixture);
    await page.waitForFunction(() => !document.querySelector("#sp-app").classList.contains("sp-onboarding"));
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    const card = page.locator("#sp-settings .card").filter({ has: page.locator("#sp-set-auto-open-app-subpages") });
    assert.strictEqual(await card.locator(".card-header h3").textContent(), "App Subpages");
    assert.strictEqual(await card.evaluate(element => element.previousElementSibling.querySelector(".card-header h3").textContent), "Card Style",
      "App Subpages appears directly below Card Style on the Screen tab");
    if (await card.evaluate(element => element.classList.contains("collapsed"))) await card.locator(".card-header").click();
  }
  try {
    await open();
    const toggle = page.locator("#sp-set-auto-open-app-subpages");
    assert(await toggle.isChecked(), "automatic opening remains the default");
    await toggle.locator("..").locator(".sp-toggle-track").click();
    await waitForNativeState(fixture, () => fixture.document.settings.companion_auto_open_app_subpages === "0",
      "save automatic app switching with the layout");
    await open();
    await page.evaluate(() => window.__seedEspState([
      { id: "switch-companion_auto_open_app_subpages_enabled", state: "OFF", value: false },
    ]));
    await page.waitForFunction(() => !document.querySelector("#sp-set-auto-open-app-subpages").checked);
    await toggle.locator("..").locator(".sp-toggle-track").click();
    await waitForNativeState(fixture, () => fixture.document.settings.companion_auto_open_app_subpages === "1",
      "save automatic app switching with the layout");
    const returnToggle = page.locator("#sp-set-return-home-on-app-switch");
    assert(await returnToggle.isChecked(), "returning home remains the default");
    await Promise.all([
      page.waitForResponse(response => response.url().includes("return_home_on_app_switch") && response.url().endsWith("/turn_off")),
      returnToggle.locator("..").locator(".sp-toggle-track").click(),
    ]);
    assert.deepStrictEqual(returnPosts, ["turn_off"], "staying on the page is saved to the device");
    await open();
    await page.evaluate(() => window.__seedEspState([
      { id: "switch-companion_return_home_on_app_switch_enabled", state: "OFF", value: false },
    ]));
    await page.waitForFunction(() => !document.querySelector("#sp-set-return-home-on-app-switch").checked);
    await Promise.all([
      page.waitForResponse(response => response.url().includes("return_home_on_app_switch") && response.url().endsWith("/turn_on")),
      returnToggle.locator("..").locator(".sp-toggle-track").click(),
    ]);
    assert.deepStrictEqual(returnPosts, ["turn_off", "turn_on"]);
    const backup = backupFixture(testCase.slug, testCase.slots);
    backup.settings = { auto_open_app_subpages: false };
    delete backup.screen;
    const backupLayout = structuredClone(fixture.document);
    delete backupLayout.settings.companion_auto_open_app_subpages;
    backup.native_config = createPanelConfigBackupPayload(encodePanelConfig(backupLayout));
    await importBackup(page, backup, "restore-app-switching");
    await page.locator(".sp-banner").filter({ hasText: "Configuration imported successfully" }).waitFor();
    assert.equal(fixture.document.settings.companion_auto_open_app_subpages, "0", "backup restores switching with the layout");

    routes.nativeAppSubpagePreference = false;
    await open();
    const before = fixture.puts.length;
    await importBackup(page, backup, "restore-app-switching-requires-update");
    await page.locator(".sp-banner").filter({ hasText: "Update the panel firmware before restoring the automatic app switching setting" }).waitFor();
    assert.equal(fixture.puts.length, before, "an incompatible backup leaves the saved layout alone");

    assert.deepStrictEqual(errors, [], "the setting and device events cause no browser errors");
    console.log("Global app subpage preference browser checks passed.");
  } finally { await context.close(); }
}

async function assertSubpageTitleBarSetting(browser, testCase) {
  const fixture = nativeConfigState(testCase.slug);
  fixture.document.buttons[1] = "com.apple.Safari;Safari;Auto;Auto;;;companion;;app_shortcuts";
  fixture.document.subpages[1] = "~B,1|companion,shortcut.command+r,Reload,Refresh,Auto";
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState: fixture });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  async function seed(clockOn, savedTitle) {
    await page.evaluate(({ clockOn, savedTitle }) => window.__seedEspState([
      { id: "switch-screen__clock_bar", state: clockOn ? "ON" : "OFF", value: clockOn },
      { id: "switch-subpage_title_bar_enabled", state: savedTitle ? "ON" : "OFF", value: savedTitle },
    ]), { clockOn, savedTitle });
    await page.waitForFunction(on => document.querySelector(".sp-topbar").classList.contains("sp-hidden") === !on, clockOn);
  }
  async function checkSubpage(compactTop) {
    await page.locator(".sp-back-btn").waitFor();
    assert(await page.locator(".sp-topbar").evaluate(el => el.classList.contains("sp-hidden")), "every subpage hides the entire bar");
    assert.strictEqual(await page.locator(".sp-clockbar-subpage-title,.sp-clock").count(), 0, "subpages have no title or clock");
    assert.strictEqual(await page.evaluate(() => document.documentElement.style.getPropertyValue("--grid-top")), compactTop,
      "subpages reclaim all header space even when Clock Bar is enabled");
    const bounds = await page.locator(".sp-back-btn .sp-back-hit:not([hidden])").boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.locator('.sp-main [data-slot="3"]').waitFor();
  }
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForSelector("#sp-app");
    await seedNativeDocument(page, fixture);
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    assert.strictEqual(await page.locator("#sp-set-subpage-title-bar").count(), 0, "obsolete title-bar control is removed");
    await page.getByRole("tab", { name: "Layout", exact: true }).click();
    await seed(false, true);
    const compactTop = await page.evaluate(() => document.documentElement.style.getPropertyValue("--grid-top"));
    for (const clockOn of [false, true]) {
      for (const savedTitle of [false, true]) {
        await seed(clockOn, savedTitle);
        for (const slot of [3, ...(testCase.companionSupported ? [1] : [])]) {
          await page.locator(`.sp-main [data-slot="${slot}"] .sp-subpage-badge`).dispatchEvent("click");
          await checkSubpage(compactTop);
          assert.strictEqual(await page.locator(".sp-topbar").evaluate(el => el.classList.contains("sp-hidden")), !clockOn,
            "returning home restores its own Clock Bar setting");
        }
      }
    }
    assert.deepStrictEqual(errors, []);
    console.log(`${testCase.name}: all subpages hide titles and bars, use compact spacing, and preserve the home setting.`);
  } finally { await context.close(); }
}

async function assertSubpageClockBar(browser, testCase) {
  await assertSubpageTitleBarSetting(browser, testCase);
}

async function assertRetiredCardRemoval(browser) {
  const contract = JSON.parse(fs.readFileSync(path.join(ROOT, "product/v2/card_contract.json"), "utf8"));
  const types = [...Object.keys(contract.releaseAvailability.preview), ...contract.retiredCardTypes, ...contract.retiredSubpageTypeCodes];
  const testCase = ACTIVE_CASES[0];
  const compactDateTypes = Object.entries(contract.subpageTypeCodes)
    .filter(([type]) => ["calendar", "clock", "timezone"].includes(type));
  const cases = [
    ...types.filter(type => type !== "companion_window").map(type => ({ type, subpageType: type === "companion_webapp" ? "companion" : type, nativeV2: false })),
    ...compactDateTypes.map(([type, code]) => ({ type, subpageType: code, nativeV2: true })),
    { type: "companion_webapp", subpageType: "companion", nativeV2: true },
    { type: "companion_window", subpageType: contract.subpageTypeCodes.companion, nativeV2: true },
    { type: "companion_window", subpageType: contract.subpageTypeCodes.companion, nativeV2: true, subpageOnly: true },
  ];
  for (const { type: savedType, subpageType, nativeV2, subpageOnly } of cases) {
    const isWebApp = savedType === "companion_webapp";
    const removeSavedWindow = savedType === "companion_window";
    const type = isWebApp || removeSavedWindow ? "companion" : savedType;
    const entity = removeSavedWindow ? "window.minimize" : isWebApp ? "webapp.google-docs" : "old.entity";
    const nativeState = nativeConfigState(testCase.slug);
    nativeState.document.buttons = {
      1: `${entity};Retired;Gauge;Auto;sensor.old;C;${type};1;old=value`,
      2: "light.lamp;Neighbour;Lightbulb;Auto",
      3: ";Room;Folder;Auto;;;subpage",
    };
    nativeState.document.settings.button_order = "1,2,3";
    if (subpageOnly) {
      delete nativeState.document.buttons[1];
      nativeState.document.settings.button_order = ",2,3";
    }
    nativeState.document.subpages = {
      3: `~B,1w,,2|${subpageType},${entity},Retired,Gauge,,sensor.old,C,1,old%3Dvalue|,light.lamp,Neighbour,Lightbulb`,
    };
    if (isWebApp && nativeV2) {
      nativeState.document.buttons[1] = "webapp.google-docs;Docs;Web;Auto;;;companion;;app_shortcuts";
      nativeState.document.subpages[1] = "~B,1|companion,shortcut.command%2Bb,Bold";
      nativeState.document.subpages[97] = "~B,1|companion,shortcut.command%2Bb,Bold";
    }
    const context = await browser.newContext({ viewport: testCase.viewport });
    await installRoutes(context, testCase.slug, { nativeState, nativeV2, homeAssistantSupport: true });
    const page = await context.newPage();
    await installFakeEventSource(page);
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#sp-app");
      const saved = removeSavedWindow ? page.waitForResponse(response =>
        new URL(response.url()).pathname === "/api/v1/config" &&
        response.request().method() === "PUT" && response.ok()) : null;
      await seedNativeDocument(page, nativeState);
      if (saved) {
        await saved;
        assert.equal(nativeState.document.buttons[1], undefined, "the old Window Control card is removed from storage");
        assert.equal(nativeState.document.settings.button_order, ",2,3", "the saved order frees the retired home slot");
        assert.equal(nativeState.document.subpages[3], "~B,,,2||,light.lamp,Neighbour,Lightbulb");
        assert.equal(nativeState.puts.length, 1, "one transaction cleans the home and subpage records");
      }
      assert.equal(await page.locator('.sp-main [data-slot="1"]').count(), 0, `${type}: old main tile is removed`);
      if (isWebApp) {
        await waitForNativeState(nativeState, () => nativeState.puts.length > 0 &&
          !nativeState.document.buttons[1] && !nativeState.document.subpages[3].includes("webapp."),
          "retired Web App migration saved");
        assert(!nativeState.document.buttons[1], "retired Web App is removed from saved home layout");
        assert(!nativeState.document.subpages[3].includes("webapp."), "retired Web App is removed from saved subpage");
        assert(!nativeState.document.subpages[1] && !nativeState.document.subpages[97], "Web App subpages are removed with their cards");
      }
      assert(await page.locator('.sp-main .sp-empty-cell:not(.sp-info-only-hidden)').count(), `${type}: removed space is available`);
      await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
      await page.waitForSelector('.sp-main [data-slot="-2"]');
      assert.equal(await page.locator('.sp-main [data-slot="1"]').count(), 0, `${type}: old subpage tile is removed`);
      assert.equal(await page.locator('.sp-main [data-slot="2"]').count(), 1, `${type}: neighbouring card is preserved`);
      await page.locator('.sp-back-btn .sp-back-hit').click();
      await page.locator('.sp-main [data-slot="3"] .sp-subpage-badge').click();
      await page.waitForSelector('.sp-main [data-slot="-2"]');
      assert.equal(await page.locator('.sp-main [data-slot="1"]').count(), 0, `${type}: retired span stays free after reopening`);
      assert.equal(await page.locator('.sp-main [data-slot="2"]').count(), 1, `${type}: reopening preserves the neighbouring card`);

    } finally { await context.close(); }
  }
  for (const testCase of ACTIVE_CASES) {
    const nativeState = nativeConfigState(testCase.slug);
    nativeState.document.buttons = {
      1: "https://example.test;Webhook;Web;Auto;;;webhook",
      2: "shortcut.command+c;Copy;Shortcut Command;Auto;;;companion",
    };
    nativeState.document.subpages = {};
    nativeState.document.settings.button_order = "1,2";
    const context = await browser.newContext({ viewport: testCase.viewport });
    // Even a stale device capability cannot restore the retired connector/cards.
    await installRoutes(context, testCase.slug, { nativeState, homeAssistantSupport: true });
    const page = await context.newPage();
    await installFakeEventSource(page);
    try {
      await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
      await page.waitForSelector("#sp-app");
      await seedNativeDocument(page, nativeState);
      assert.strictEqual(await page.locator('.sp-main [data-slot="1"]').count(), 0,
        `${testCase.name}: retired Webhook card is removed`);
      await page.locator(".sp-empty-cell:not(.sp-info-only-hidden)").first().click();
      await page.waitForSelector(".sp-settings-modal");
      assert.strictEqual(await page.getByRole("button", { name: "Date & Time card type", exact: true }).count(), 0);
      assert.strictEqual(await page.getByRole("button", { name: "Action card type", exact: true }).count(), 0);
      assert.strictEqual(await page.getByRole("button", { name: "Local Action card type", exact: true }).count(), 0);
      assert.strictEqual(await page.getByRole("button", { name: "Subpage card type", exact: true }).count(), 1,
        `${testCase.name}: the picker offers one shared Subpage choice`);
      assert(!/Home Assistant/i.test(await page.locator(".sp-settings-modal").innerText()),
        `${testCase.name}: new-card picker offers no HA integration or wording`);
      await page.getByRole("button", { name: "Subpage card type", exact: true }).click();
      await page.getByPlaceholder("e.g. Folder Name", { exact: true }).waitFor({ state: "attached" });
      await page.locator(".sp-settings-modal .sp-save-btn").waitFor({ state: "visible" });
    } finally { await context.close(); }
  }
  console.log(`Action/HA picker absence passed for ${ACTIVE_CASES.length} layouts.`);
  console.log(`Retired-card browser checks passed for ${cases.length} saved layouts.`);
}

async function assertRetiredSettingsStayUnavailable(browser, testCase) {
  const context = await browser.newContext({ viewport: testCase.viewport });
  const nativeState = nativeConfigState(testCase.slug);
  await installRoutes(context, testCase.slug, { nativeState });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForSelector("#sp-app");
    await seedNativeDocument(page, nativeState);
    await page.evaluate(() => window.__seedEspState([
      { id: "switch-voice_services", state: "ON", value: true },
      { id: "switch-alarm_delay__audio", state: "ON", value: true },
      { id: "switch-indoor_temp_enable", state: "ON", value: true },
      { id: "select-temperature_unit", state: "°F", value: "°F" },
    ]));
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    assert.strictEqual(await page.locator("#sp-set-voice-services,#sp-set-alarm-delay-audio,#sp-set-temperature-unit,.sp-clockbar-voice").count(), 0,
      `${testCase.name}: retired events cannot recreate HA settings or clock-bar items`);
    const headers = await page.locator("#sp-settings .card-header h3").allTextContents();
    for (const retired of ["Voice Services", "Alarm Audio", "Alarm Delay Audio", "Temperature", "Idle"]) {
      assert(!headers.includes(retired), `${testCase.name}: retired ${retired} settings are absent`);
    }
    assert(headers.includes("Clock Bar"), `${testCase.name}: local clock-bar settings remain`);
    assert.deepStrictEqual(errors, [], `${testCase.name}: browser composition and retired events raise no errors`);
    console.log(`${testCase.name}: retired settings remain unavailable; local Clock Bar is available.`);
  } finally { await context.close(); }
}

async function assertReorderAfterDelete(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const fixture = nativeConfigState(testCase.slug);
  fixture.document.buttons = { 1: COPY_SHORTCUT, 2: "shortcut.command+v;Paste;Shortcut Command;Auto;;;companion" };
  fixture.document.subpages = {};
  fixture.document.settings.button_order = "1,2";
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState: fixture, nativeV2: true });
  const page = await context.newPage();
  await installFakeEventSource(page);
  try {
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await seedNativeDocument(page, fixture);
    const grid = page.locator(".sp-main");
    const deleted = grid.locator('[data-slot="1"]');
    const remaining = grid.locator('[data-slot="2"]');
    await deleted.click({ button: "right" });
    await page.locator(".sp-ctx-menu").getByText("Delete", { exact: true }).click();
    await waitForNativeState(fixture, () => fixture.document.settings.button_order === ",2", "save the deletion");
    await deleted.waitFor({ state: "detached" });
    await page.locator('.sp-main[aria-disabled="false"]').waitFor();
    assert.strictEqual(await remaining.getAttribute("draggable"), "true",
      "the remaining card can be dragged once deletion finishes");
    const moveToFirstCell = async () => {
      const source = await remaining.boundingBox();
      const target = await grid.locator('.sp-empty-cell[data-pos="0"]').boundingBox();
      const targetX = target.x + target.width / 2;
      const targetY = target.y + target.height / 2;
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(targetX, targetY, { steps: 10 });
      await grid.locator('.sp-drop-placeholder[data-pos="0"]').waitFor();
      await page.mouse.up();
    };
    const beforeRejectedMove = fixture.puts.length;
    await page.route("**/api/v1/config", async route => {
      if (route.request().method() === "PUT") {
        return route.fulfill({ status: 413, body: "Rejected move" });
      }
      return route.fallback();
    });
    const rejected = page.waitForResponse(response => response.url().endsWith("/api/v1/config") && response.status() === 413);
    await moveToFirstCell();
    await rejected;
    await page.locator('.sp-main[aria-disabled="false"]').waitFor();
    assert.equal(await remaining.getAttribute("data-pos"), "1", "a rejected move leaves the preview unchanged");
    assert.equal(fixture.puts.length, beforeRejectedMove);
    await page.unroute("**/api/v1/config");
    await moveToFirstCell();
    await waitForNativeState(fixture, () => fixture.document.settings.button_order.split(",")[0] === "2",
      "save the new position without reloading");
    await grid.locator('[data-slot="2"][data-pos="0"]').waitFor();
    console.log("Card deletion and drag-and-drop without reloading passed.");
  } finally { await context.close(); }
}

async function assertLiveFinderPreview(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const fixture = nativeConfigState(testCase.slug);
  const [example] = require("../compatibility/fixtures/finder_folder_preview.json");
  fixture.document.buttons = { 1: "com.apple.finder;Finder;Auto;Auto;;;companion;;app_shortcuts" };
  const tiles = example.buttons.map((id, index) => `companion,${id},Saved ${index + 1},Auto,Auto`);
  fixture.document.subpages = { 1: `~${example.order}|${tiles.join("|")}` };
  fixture.document.settings = { button_order: "1", web_onboarding_complete: "1" };
  const connectorsStatus = { onboarding_complete: true, mac_companion: {
    available: true, configured: true, paired: true, connected: true,
  } };
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState: fixture, connectorsStatus, nativeV2: true });
  await context.route("**/companion/actions", route => route.fulfill({
    status: 200, json: example.catalogue.map(([id, label]) => ({ id, label })),
  }));
  try {
    const page = await context.newPage();
    await installFakeEventSource(page);
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), nativeDocumentEvents(fixture.document));
    await page.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
    const live = page.locator(".sp-main .sp-live-folder-preview");
    await live.first().waitFor();
    async function assertProjectedTiles() {
      const values = await live.evaluateAll(tiles => tiles.map(tile =>
        [Number(tile.parentElement.dataset.pos), tile.textContent, tile.parentElement.hasAttribute("data-slot")]));
      assert.deepEqual(values, example.expected.map(([position, , label]) => [position, label, false]));
      assert.equal(await page.locator('.sp-main [data-slot="1"] .sp-btn-label').textContent(), "Saved 1");
      assert.equal(await page.locator(".sp-main .sp-back-btn").count(), 1);
    }
    await assertProjectedTiles();
    connectorsStatus.mac_companion.connected = false;
    await live.first().waitFor({ state: "detached" });
    connectorsStatus.mac_companion.connected = true;
    await live.first().waitFor();
    await assertProjectedTiles();
    assert.equal(fixture.puts.length, 0, "live Finder activity never writes saved pages");
    console.log("Live Finder placement, disconnect and reconnect browser checks passed.");
  } finally { await context.close(); }
}

async function assertAppShortcutPreview(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const fixture = nativeConfigState(testCase.slug);
  fixture.document = structuredClone(require("../compatibility/fixtures/companion_nested_pages.json").document);
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState: fixture, nativeV2: true });
  const status = {
    onboarding_complete: true,
    mac_companion: { available: true, configured: true, paired: true, connected: true, shortcut_page_ready: false },
  };
  await context.route("**/connectors/status**", route => route.fulfill({ status: 200, json: status }));
  await context.route("**/companion/actions", route => route.fulfill({ status: 200, json: [] }));
  try {
    const page = await context.newPage();
    await installFakeEventSource(page);
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), nativeDocumentEvents(fixture.document));
    await page.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
    await page.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
    await page.locator('.sp-back-btn .sp-app-back-icon.mdi-monitor').waitFor();
    const shortcut = page.locator('.sp-main [data-slot="1"][data-pos="1"]');
    await shortcut.waitFor();
    async function assertEnabledAfterStatusPoll() {
      const response = await page.waitForResponse(response => new URL(response.url()).pathname === "/connectors/status");
      await response.finished();
      const [cardColor, iconColor, labelColor] = await shortcut.evaluate(card =>
        [card, card.querySelector(".sp-btn-icon"), card.querySelector(".sp-btn-label")]
          .map(element => getComputedStyle(element).color));
      assert.deepEqual([iconColor, labelColor], [cardColor, cardColor],
        "shortcut labels and icons use the regular card color");
    }
    await assertEnabledAfterStatusPoll();
    status.mac_companion.shortcut_page_ready = true;
    await assertEnabledAfterStatusPoll();
    status.mac_companion.connected = false;
    status.mac_companion.shortcut_page_ready = false;
    await assertEnabledAfterStatusPoll();
    assert.equal(await shortcut.locator(".sp-btn-label").textContent(), "Address");
    await shortcut.click();
    await page.getByRole("button", { name: "Edit", exact: true }).waitFor();
    assert.equal(await shortcut.getAttribute("draggable"), "true");
    assert.equal(fixture.puts.length, 0, "connector status changes never save or move cards");
    console.log("App shortcut preview keeps cards enabled and editable through focus and connection changes.");
  } finally { await context.close(); }
}

async function assertNestedCompanionPages(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040"), fixture = nativeConfigState(testCase.slug);
  fixture.document = JSON.parse(fs.readFileSync(path.join(ROOT, "compatibility/fixtures/companion_nested_pages.json"))).document;
  fixture.document.deviceProfile = testCase.slug;
  const context = await browser.newContext({ viewport: testCase.viewport });
  await installRoutes(context, testCase.slug, { nativeState: fixture, nativeV2: true });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  try {
    const open = async (tab = page, expectedName = "Address") => {
      await tab.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
      await tab.waitForFunction(() => window.__eventSources?.length > 0);
      await tab.evaluate(events => window.__seedEspState(events), nativeDocumentEvents(fixture.document));
      await tab.getByRole("tab", { name: "Layout", exact: true }).click();
      await tab.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
      await tab.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
      await tab.getByText(expectedName, { exact: true }).first().waitFor();
    };
    // Create a new app shortcut page while its app is already inside a folder.
    const existing = structuredClone(fixture.document);
    delete fixture.document.subpages[33];
    fixture.document.subpages[1] = fixture.document.subpages[1].replace("app_shortcuts", "");
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`);
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(events => window.__seedEspState(events), nativeDocumentEvents(fixture.document));
    await page.locator('.sp-main [data-slot="1"] .sp-subpage-badge').click();
    const folderAppCard = page.locator('.sp-main [data-slot="1"]');
    await folderAppCard.click({ button: "right" });
    assert.strictEqual(await page.locator(".sp-ctx-menu").getByText("Shortcut List", { exact: true }).count(), 0,
      "ordinary folders do not have a shortcut editor");
    await page.locator(".sp-ctx-menu").getByText("Edit Card", { exact: true }).click();
    const creation = page.locator(".sp-settings-modal .sp-app-subpage-settings");
    if (await creation.locator(".sp-disclosure-button").getAttribute("aria-expanded") !== "true") await creation.locator(".sp-disclosure-button").click();
    await page.locator('[id$="companion-app-shortcuts"]').evaluate(input => input.click());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(fixture, () => fixture.puts.length === 1 && !!fixture.document.subpages[33], "create a nested app page atomically");
    assert(fixture.document.subpages[1].includes("app_shortcuts"));
    assert(fixture.document.subpages[33].includes("shortcut."));
    // Start the independent edit/reload scenario with a custom existing card.
    fixture.document = existing; fixture.generation++; fixture.puts = [];
    await open();
    await page.locator(".sp-main .sp-empty-cell").first().click();
    await chooseCardType(page, "Key Shortcut");
    assert.strictEqual(await page.getByRole("tab", { name: "Application", exact: true }).getAttribute("aria-selected"), "true");
    assert.strictEqual(await page.locator('[id$="shortcut-catalog-app"]').inputValue(), "com.apple.Safari",
      "a nested app page uses the app that owns the inner page");
    await page.locator(".sp-settings-close").click();
    await page.locator('.sp-main [data-slot="1"]').click({ button: "right" });
    await page.locator(".sp-ctx-menu").getByText("Shortcut List", { exact: true }).click();
    await page.locator(".sp-settings-modal").getByText("Edit App Shortcuts", { exact: true }).waitFor();
    await page.locator('[id$="companion-shortcut-1"]').evaluate(input => input.click());
    let rejectNext = true;
    await page.route("**/api/v1/config", async route => {
      if (route.request().method() === "PUT" && rejectNext) {
        rejectNext = false; return route.fulfill({ status: 500, body: "Save failed" });
      }
      return route.fallback();
    });
    const beforeRetry = fixture.document.subpages[1];
    const failed = page.waitForResponse(response => response.url().endsWith("/api/v1/config") && response.status() === 500);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await failed;
    await page.waitForFunction(() => {
      const save = [...document.querySelectorAll(".sp-settings-modal button")].find(button => button.textContent === "Save");
      return save && !save.disabled;
    });
    assert.equal(fixture.puts.length, 0);
    assert.equal(fixture.document.subpages[1], beforeRetry);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await waitForNativeState(fixture, () => fixture.puts.length === 1, "one atomic nested app save");
    assert(fixture.document.subpages[33].includes("Address"), "existing shortcut survives app preset change");
    assert(fixture.document.subpages[33].includes("shortcut."), "app shortcuts persist under nested key");
    const parsed = loadTypeScriptModule("src/webserver/model/subpage.ts").parseRawSubpageConfig(fixture.document.subpages[33], code => code);
    const back = JSON.parse(fs.readFileSync(path.join(ROOT, "product/v2/app_shortcuts/safari.json"))).shortcuts.find(shortcut => shortcut.id === "1");
    assert(parsed.buttons.some(card => card.entity === "shortcut." + back.shortcut), "retry in the same dialog saves the newly selected shortcut");
    assert(await page.locator(".sp-main").getByText("Address", { exact: true }).isVisible(),
      "saving the nested shortcut list stays on that page");
    await open();

    const stale = await context.newPage();
    await installFakeEventSource(stale);
    await open(stale);
    const name = async (tab, label, slot = 1) => {
      await tab.locator(`.sp-main [data-slot="${slot}"] .sp-editable-title`).click();
      const input = tab.getByRole("textbox", { name: "Card name", exact: true });
      await input.fill(label);
      return input;
    };
    const parallelInput = await name(stale, "Address from stale tab");
    await (await name(page, "Neighbour edit", 2)).press("Enter");
    await waitForNativeState(fixture, () => fixture.puts.length === 2, "save the neighbouring card");
    await parallelInput.press("Enter");
    await waitForNativeState(fixture, () => fixture.puts.length === 3, "save the independent edit");
    assert(fixture.document.subpages[33].includes("Neighbour edit"), "a stale tab preserves its neighbour");
    assert(fixture.document.subpages[33].includes("Address from stale tab"));
    await open(page, "Address from stale tab");
    await open(stale, "Address from stale tab");

    const staleInput = await name(stale, "Second browser");
    const firstInput = await name(page, "First browser");
    await firstInput.press("Enter");
    await waitForNativeState(fixture, () => fixture.puts.length === 4, "save the first tab's edit");
    assert(fixture.document.subpages[33].includes("First browser"));
    await staleInput.press("Enter");
    await stale.getByText("Configuration changed in another browser. Reload before saving again.", { exact: true }).waitFor();
    assert.equal(fixture.puts.length, 4, "the second tab's stale edit never reaches the panel");
    assert(fixture.document.subpages[33].includes("First browser"));
    assert.deepStrictEqual(errors, []);
    console.log("Nested Companion shortcut creation, editing, failed-save retry, reload, Back and two-tab conflict checks passed.");
  } catch(error) { await page.screenshot({ path: "/tmp/nested-browser.png" }); fs.writeFileSync("/tmp/nested-browser.html", await page.content()); throw error; } finally { await context.close(); }
}

async function assertFirstRunSetup(browser) {
  const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
  const fixture = nativeConfigState(testCase.slug);
  fixture.document = { deviceProfile: testCase.slug, buttons: {}, subpages: {}, settings: {} };
  const status = {
    onboarding_complete: true,
    home_assistant: { available: false, configured: false, connected: false, actions_confirmed: false },
    mac_companion: { available: true, configured: true, paired: true, connected: true },
  };
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  await installRoutes(context, testCase.slug, {
    nativeState: fixture, connectorsStatus: status, nativeV2: true, nativeAppSubpagePreference: true,
  });
  let pairingUnavailable = false;
  const pairingState = {
    available: true, active: false, paired: true, connected: true, pairing_code: "",
  };
  let displayCodeRequests = 0;
  await context.route(/\/companion\/pairing(?:\?.*)?$/, route => {
    if (new URL(route.request().url()).searchParams.get("show_on_display") === "1") displayCodeRequests++;
    return pairingUnavailable ? route.fulfill({ status: 503, body: "" }) : route.fulfill({ json: pairingState });
  });
  const actions = [
    { id: "com.apple.Safari", label: "Safari" },
    { id: "com.apple.Notes", label: "Notes" },
    ...Array.from({ length: testCase.slots + 1 }, (_, i) => ({ id: `org.example.app${i}`, label: `App ${i}` })),
  ];
  let catalogueReady = false;
  await context.route("**/companion/actions", route => route.fulfill({ status: 200, json: catalogueReady ? actions : [] }));
  // Model readable firmware metadata instead of the generic empty HTTP response.
  await context.route("**/text_sensor/**", route => route.fulfill({ status: 200, json: { state: "" } }));
  await context.route("**/button/**", route => route.request().method() === "GET"
    ? route.fulfill({ status: 200, json: {} }) : route.fallback());
  const switches = [];
  let failLayout = false;
  await context.route(/\/api\/v1\/config(?:\/.*)?$/, route => {
    if (!failLayout || route.request().method() !== "PUT") return route.fallback();
    return route.abort("connectionreset");
  });
  await context.route("**/switch/**", route => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, json: { state: "ON", value: true } });
    if (!/auto.*open.*app.*subpages/i.test(decodeURIComponent(route.request().url()))) return route.fallback();
    switches.push(new URL(route.request().url()).pathname.split("/").pop());
    return route.fulfill({ status: 200, body: "" });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await installFakeEventSource(page);
  const open = async (search = "") => {
    await page.waitForLoadState("networkidle");
    await page.goto(`http://espdesktop.test/${testCase.slug}?events=1${search}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__eventSources?.length > 0);
    await page.evaluate(() => window.__seedEspState([{ id: "text-button_order", state: "" }]));
  };
  try {
    await open();
    const dialog = page.getByRole("dialog");
    const appLimit = 8;
    await dialog.getByText("No apps available. Check app access on your Mac.", { exact: true }).waitFor();
    assert(await dialog.getByText("Step 1 of 2", { exact: true }).isVisible(),
      "an already connected Mac starts at app selection");
    const title = dialog.getByRole("heading", { name: "Choose your apps", exact: true });
    assert(await title.evaluate(node => node === document.activeElement && getComputedStyle(node).outlineStyle === "none"),
      "the wizard heading receives focus without a visible outline");
    const close = dialog.getByRole("button", { name: "Close setup", exact: true });
    // WebKit on macOS uses Option-Tab to include buttons in the tab order.
    const macWebKit = process.platform === "darwin" && browser.browserType().name() === "webkit";
    await page.keyboard.press(macWebKit ? "Alt+Tab" : "Tab");
    assert(await close.evaluate(node => node.matches(":focus-visible") && getComputedStyle(node).boxShadow !== "none"),
      "the wizard controls retain a visible keyboard focus indicator");
    await close.click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(fixture.puts.length, 0, "closing setup leaves it available on reload");
    await open("&setup=1");
    await title.waitFor();
    assert(await dialog.getByRole("button", { name: "Skip setup", exact: true }).isVisible(),
      "the Mac setup link on an empty display opens first-time setup");
    const setChecked = async (input, checked) => {
      const track = input.locator("..").locator(".sp-toggle-track");
      await track.waitFor();
      if (await input.isChecked() !== checked) await track.click();
      assert.equal(await input.isChecked(), checked);
    };
    await dialog.getByText("No apps available. Check app access on your Mac.", { exact: true }).waitFor();
    catalogueReady = true;
    const addPages = dialog.getByRole("radio", { name: "Add shortcut pages", exact: true });
    const launchOnly = dialog.getByRole("radio", { name: "Launch apps only", exact: true });
    await setChecked(dialog.getByLabel("App 0", { exact: true }), true);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    assert(await addPages.isDisabled(), "apps without presets cannot add shortcut pages");
    assert(await launchOnly.isChecked(), "setup falls back to launch-only when no selected apps have presets");
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    await setChecked(dialog.getByLabel("App 0", { exact: true }), false);
    await setChecked(dialog.getByLabel("Safari", { exact: true }), true);
    // The selection cap disables remaining apps while allowing deselection.
    for (let i = 0; i < appLimit - 1; i++) await setChecked(dialog.getByLabel(`App ${i}`, { exact: true }), true);
    assert(await dialog.getByLabel("Notes", { exact: true }).isDisabled());
    await setChecked(dialog.getByLabel("App 0", { exact: true }), false);
    assert(await dialog.getByLabel("Notes", { exact: true }).isEnabled());
    await setChecked(dialog.getByLabel("Notes", { exact: true }), true);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(await dialog.getByRole("radio").count(), 2, "step two offers two exclusive modes");
    assert(await addPages.isChecked(), "fresh setup adds shortcut pages by default for supported apps");
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    assert(await dialog.getByLabel("Safari", { exact: true }).isChecked(), "Back keeps selected apps");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    assert(await addPages.isChecked(), "Back keeps the global shortcut choice");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await dialog.getByRole("radio", { name: "Open from the display", exact: true }).check();
    await page.setViewportSize({ width: 375, height: 650 });
    fs.mkdirSync(FAILURE_DIR, { recursive: true });
    await page.screenshot({ path: path.join(FAILURE_DIR, "first-run-mobile.png") });
    const bounds = await dialog.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= 375, "setup fits a phone viewport");
    const saveBounds = await dialog.getByRole("button", { name: "Save setup", exact: true }).boundingBox();
    assert(saveBounds.y + saveBounds.height <= 650, "save remains visible without scrolling the dialog");
    const beforeInitialSave = JSON.stringify(fixture.document);
    failLayout = true;
    await dialog.getByRole("button", { name: "Save setup", exact: true }).click();
    await dialog.getByRole("alert").waitFor({ timeout: 10000 }).catch(async error => {
      console.log("Setup diagnostic", await page.locator("body").innerText(), switches, fixture.puts);
      fs.mkdirSync(FAILURE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(FAILURE_DIR, "first-run-failure.png") });
      throw error;
    });
    assert.equal(fixture.puts.length, 0, "an interrupted save must not complete setup");
    assert.equal(JSON.stringify(fixture.document), beforeInitialSave);
    failLayout = false;
    await dialog.getByRole("button", { name: "Save setup", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByText("Setup saved.", { exact: true }).waitFor();
    assert.equal(Object.keys(fixture.document.buttons).length, appLimit);
    assert.equal(fixture.document.buttons[9], undefined, "setup leaves the ninth slot free");
    assert.equal(fixture.document.settings.web_onboarding_complete, "1");
    const { rootCards, pages } = fixture.puts[0].layout;
    const safari = rootCards.find(({ config }) => config.entity === "com.apple.Safari");
    const notes = rootCards.find(({ config }) => config.entity === "com.apple.Notes");
    assert.match(safari.config.options, /app_shortcuts/);
    assert(pages.find(page => page.key === safari.slot).cards.some(({ config }) => config.entity.startsWith("shortcut.")));
    assert(pages.find(page => page.key === notes.slot).cards.some(({ config }) => config.entity.startsWith("shortcut.")),
      "the global choice also adds a page for Notes");
    assert.equal(pages.length, 2, "unsupported apps remain launch cards");
    assert.equal(fixture.puts.length, 1);
    assert.equal(fixture.document.settings.companion_auto_open_app_subpages, "0");
    assert.deepEqual(switches, [], "setup uses only the layout PUT");
    await open();
    await page.waitForTimeout(200);
    assert.equal(await dialog.count(), 0, "completion survives page reload");
    const beforeSetupLink = JSON.stringify(fixture.document);
    await open("&setup=1");
    await title.waitFor();
    await dialog.getByText(/Saving setup replaces the current Home layout/).waitFor();
    await dialog.getByLabel("Safari", { exact: true }).waitFor({ state: "attached" });
    assert(await dialog.getByLabel("Safari", { exact: true }).isChecked(), "the Mac setup link restores existing app selections");
    assert.equal(await dialog.getByRole("button", { name: "Skip setup", exact: true }).count(), 0);
    await close.click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(JSON.stringify(fixture.document), beforeSetupLink, "opening and closing the Mac setup link preserves the layout");
    assert.equal(fixture.puts.length, 1, "the setup link never saves automatically");
    // A second browser sees the same completion marker on the display.
    const second = await context.newPage();
    await second.goto(`http://espdesktop.test/${testCase.slug}`);
    await second.waitForTimeout(200);
    assert.equal(await second.getByRole("dialog").count(), 0);
    await second.close();
    await seedNativeDocument(page, fixture);
    await page.evaluate(() => window.__seedEspState([
      { id: "switch-companion_auto_open_app_subpages_enabled", state: "OFF", value: false },
    ]));
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    const settingsCard = page.locator("#sp-settings .card").filter({ has: page.locator("#sp-set-auto-open-app-subpages") });
    if (await settingsCard.evaluate(node => node.classList.contains("collapsed"))) await settingsCard.locator(".card-header").click();
    const toggle = page.locator("#sp-set-auto-open-app-subpages");
    await setChecked(toggle, true);
    await waitForNativeState(fixture, () => fixture.document.settings.companion_auto_open_app_subpages === "1",
      "save the editor toggle through native configuration");
    await page.waitForFunction(() => !document.querySelector("#sp-set-auto-open-app-subpages").disabled);
    await setChecked(toggle, false);
    await waitForNativeState(fixture, () => fixture.document.settings.companion_auto_open_app_subpages === "0",
      "restore the editor toggle through native configuration");
    assert.deepEqual(switches, []);
    await page.getByRole("button", { name: "Setup Again", exact: true }).click();
    await dialog.getByLabel("Safari", { exact: true }).waitFor({ state: "attached" });
    assert(await dialog.getByLabel("Safari", { exact: true }).isChecked(), "settings restores home apps");
    const beforeClose = JSON.stringify(fixture.document);
    await dialog.getByRole("button", { name: "Close setup", exact: true }).click();
    assert.equal(JSON.stringify(fixture.document), beforeClose, "closing setup preserves the layout");
    await page.getByRole("button", { name: "Setup Again", exact: true }).click();
    await dialog.getByLabel("Safari", { exact: true }).waitFor({ state: "attached" });
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    assert(await addPages.isChecked(), "settings restores the global shortcut choice");
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    const followApp = dialog.getByRole("radio", { name: "Follow the active app", exact: true });
    assert.equal(await followApp.isChecked(), false);
    await followApp.check();
    failLayout = true;
    const beforeFailure = JSON.stringify(fixture.document);
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.deepEqual(switches, []);
    assert.equal(JSON.stringify(fixture.document), beforeFailure, "failed replacement keeps the saved layout");
    failLayout = false;
    fixture.writeStatus = 202;
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert(fixture.puts.length >= 2, "the committed replacement finishes setup");
    assert.equal(fixture.document.settings.companion_auto_open_app_subpages, "1");
    assert.deepEqual(switches, []);
    await page.getByText("The configuration saved, but its older-firmware copy did not. Do not downgrade this panel yet.", { exact: true }).waitFor();
    fixture.writeStatus = 204;
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    if (await settingsCard.evaluate(node => node.classList.contains("collapsed"))) await settingsCard.locator(".card-header").click();
    await page.getByRole("button", { name: "Setup Again", exact: true }).click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    await launchOnly.check();
    fixture.loseWriteResponse = true;
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    fixture.loseWriteResponse = false;
    assert.equal(fixture.document.settings.companion_auto_open_app_subpages, "0",
      "a lost response after commit leaves the entire new setup in place");
    assert.deepEqual(switches, []);
    await open();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    if (await settingsCard.evaluate(node => node.classList.contains("collapsed"))) await settingsCard.locator(".card-header").click();
    await page.getByRole("button", { name: "Setup Again", exact: true }).click();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    assert(await launchOnly.isChecked(), "setup again restores a saved launch-only layout");
    await dialog.getByRole("button", { name: "Close setup", exact: true }).click();
    assert.equal(Object.keys(fixture.document.subpages).length, 0, "Done saves launch-only cards directly from step two");
    // A fresh display offers download and pairing in the same wizard.
    fixture.document = { deviceProfile: testCase.slug, buttons: {}, subpages: {}, settings: {} };
    Object.assign(status.mac_companion, { configured: false, paired: false, connected: false });
    Object.assign(pairingState, {
      active: true, paired: false, connected: false, pairing_code: "ABCD-EFGH",
    });
    pairingUnavailable = true;
    await open();
    const pairingTitle = dialog.getByRole("heading", { name: "Connect your Mac", exact: true });
    await pairingTitle.waitFor();
    assert(await dialog.getByText("Step 1 of 3", { exact: true }).isVisible());
    const openApp = dialog.getByRole("link", { name: "Open EspDesktop", exact: true });
    assert.equal(await openApp.getAttribute("href"), "espdesktop://open");
    const download = dialog.getByRole("link", { name: "Download EspDesktop for Mac" });
    assert.equal(await download.getAttribute("href"), "https://github.com/jtenniswood/espdesktop/releases/latest");
    assert.equal(await download.getAttribute("target"), "_blank");
    const next = dialog.getByRole("button", { name: "Next", exact: true });
    assert(await next.isDisabled(), "the wizard waits for the Mac connection");
    await dialog.getByText("Could not load the pairing code. Retrying…", { exact: true }).waitFor();
    pairingUnavailable = false;
    await dialog.getByText("ABCD-EFGH", { exact: true }).waitFor();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined });
      document.execCommand = command => {
        const field = document.activeElement;
        return command === "copy" && field instanceof HTMLTextAreaElement &&
          !!field.closest("dialog[open]") &&
          field.value.slice(field.selectionStart, field.selectionEnd) === "ABCD-EFGH";
      };
    });
    await dialog.getByRole("button", { name: "Copy pairing code" }).click();
    await dialog.getByText("Copied", { exact: true }).waitFor();
    pairingState.pairing_code = "JKLM-NPQR";
    await dialog.getByText("JKLM-NPQR", { exact: true }).waitFor();
    assert.equal(await dialog.getByText("ABCD-EFGH", { exact: true }).count(), 0, "the old code is cleared");
    Object.assign(status.mac_companion, { configured: true, paired: true });
    Object.assign(pairingState, { active: false, paired: true, pairing_code: "" });
    await dialog.getByText("Open EspDesktop on your Mac to reconnect.", { exact: true }).waitFor();
    assert(await openApp.isVisible(), "the launch link stays available when reconnecting");
    assert(await download.isVisible(), "the download link stays available when reconnecting");
    assert(await next.isDisabled(), "a saved pairing still needs a live connection");
    assert.equal(await dialog.getByRole("button", { name: "Copy pairing code" }).count(), 0);
    status.mac_companion.connected = pairingState.connected = true;
    await dialog.getByText("Mac connected. Choose Next.", { exact: true }).waitFor();
    await next.click();
    await title.waitFor();
    assert(await dialog.getByText("Step 2 of 3", { exact: true }).isVisible());
    await dialog.getByLabel("Safari", { exact: true }).waitFor({ state: "attached" });
    await dialog.getByRole("button", { name: "Back", exact: true }).click();
    await pairingTitle.waitFor();

    // Pairing links remain usable before connecting; connection offers setup.
    assert.equal(displayCodeRequests, 0, "opening the normal editor and wizard does not show a code on the display");
    status.mac_companion.connected = pairingState.connected = false;
    const showCode = page.waitForResponse(response => new URL(response.url()).searchParams.get("show_on_display") === "1");
    await open("&connector=mac_companion");
    await showCode;
    await page.getByText("Confirm Reset pairing on the touchscreen.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Copy pairing code" }).count(), 0,
      "an already paired display requires confirmation before exposing a code");
    await page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === "/companion/pairing" && !url.search;
    });
    assert.equal(displayCodeRequests, 1, "the pairing link shows the code once and subsequent polling leaves the display alone");
    await page.waitForTimeout(200);
    assert.equal(await dialog.count(), 0, "pairing page must remain accessible");
    Object.assign(status.mac_companion, { configured: false, paired: false });
    Object.assign(pairingState, { active: true, paired: false, pairing_code: "STUV-WXYZ" });
    await page.getByText("STUV-WXYZ", { exact: true }).waitFor();
    Object.assign(status.mac_companion, { configured: true, paired: true });
    Object.assign(pairingState, { active: false, paired: true, pairing_code: "" });
    status.mac_companion.connected = pairingState.connected = true;
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Skip setup", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(Object.keys(fixture.document.buttons).length, 0);
    assert.equal(fixture.document.settings.web_onboarding_complete, "1");
    await page.getByRole("tab", { name: "Screen", exact: true }).click();
    if (await settingsCard.evaluate(node => node.classList.contains("collapsed"))) await settingsCard.locator(".card-header").click();
    await page.getByRole("button", { name: "Setup Again", exact: true }).click();
    await setChecked(dialog.getByLabel("Safari", { exact: true }), true);
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    assert(await addPages.isChecked(), "setup again defaults to shortcut pages when setup was skipped");
    assert.deepEqual(errors, []);
    console.log("First-run setup with interrupted and confirmed layout saves passed.");
  } finally { await context.close(); }
}

(async function main() {
  const browser = await (process.env.ESPDESKTOP_BROWSER_ENGINE === "webkit" ? webkit : chromium).launch();
  const acceptanceOnly = process.env.ESPDESKTOP_BROWSER_ACCEPTANCE_ONLY === "1";
  try {
    if (process.env.ESPDESKTOP_MAC_SCREEN_ONLY === "1") {
      await assertMacScreenControls(browser);
      return;
    }
    if (process.env.ESPDESKTOP_NAMING_ONLY === "1") {
      await assertPageTitleEvents(browser);
      await assertNamingOfflineBackups(browser);
      await assertPanelNaming(browser);
      console.log("Panel naming browser checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_CARD_REORDER_ONLY === "1") {
      await assertReorderAfterDelete(browser);
      return;
    }
    if (process.env.ESPDESKTOP_FIRST_RUN_ONLY === "1") {
      await assertFirstRunSetup(browser);
      return;
    }
    if (process.env.ESPDESKTOP_MAC_LOCK_ONLY === "1") {
      await assertMacLockCard(browser);
      return;
    }
    if (process.env.ESPDESKTOP_CARD_TRANSFER_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await runCase(browser, testCase);
      return;
    }
    await assertRetiredCardRemoval(browser);
    if (process.env.ESPDESKTOP_RETIRED_CARDS_ONLY === "1") return;
    await assertMacLockCard(browser);
    if (process.env.ESPDESKTOP_RETIRED_SETTINGS_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertRetiredSettingsStayUnavailable(browser, testCase);
      await assertNamingOfflineBackups(browser);
      console.log(`Retired HA settings and backup export checks passed for ${ACTIVE_CASES.length} layouts.`);
      return;
    }
    if (process.env.ESPDESKTOP_COMPANION_SHORTCUTS_ONLY === "1") {
      const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
      await assertCompanionURLOpenBehavior(browser, testCase);
      await assertCompanionShortcutSettings(browser, testCase);
      await assertAppSubpageCapacity(browser, testCase);
      await assertShortcutCatalogSettings(browser, testCase);
      await assertCompanionStorageSettings(browser, testCase);
      console.log("Companion shortcut, capacity, catalogue and storage browser checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_NESTED_COMPANION_ONLY === "1") {
      await assertNestedCompanionPages(browser);
      await assertLiveFinderPreview(browser);
      await assertAppShortcutPreview(browser);
      return;
    }
    if (process.env.ESPDESKTOP_SUBPAGE_TITLE_SETTING_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertSubpageTitleBarSetting(browser, testCase);
      return;
    }
    if (process.env.ESPDESKTOP_SUBPAGE_CLOCK_BAR_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertSubpageClockBar(browser, testCase);
      return;
    }
    if (process.env.ESPDESKTOP_APP_SUBPAGE_OPENING_ONLY === "1") {
      await assertAppSubpageOpeningPreference(browser);
      return;
    }
    if (process.env.ESPDESKTOP_CONNECTOR_LAYOUT_ONLY === "1") {
      await assertHomeAssistantConnectorLayout(browser);
      console.log("System connector layout and pairing link browser checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_INITIAL_ICON_SIZE_ONLY === "1") {
      await assertInitialGlobalIconSize(browser);
      return;
    }
    if (process.env.ESPDESKTOP_GLOBAL_ICON_SIZE_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertGlobalIconSize(browser, testCase);
      console.log("Global icon size inheritance, overrides, reload and backup checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_APP_SUBPAGE_CAPACITY_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertAppSubpageCapacity(browser, testCase);
      console.log("App subpage free-slot selection and persistence checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_STANDARD_ICON_SIZES_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertStandardIconSizes(browser, testCase);
      console.log("Fixed non-app icon layouts and missing size controls passed for native and legacy configurations.");
      return;
    }
    if (process.env.ESPDESKTOP_COLOURS_ONLY === "1") {
      await assertColourSwatches(browser);
      console.log("Card and Appearance colour swatch browser checks passed.");
      return;
    }
    await assertMacScreenControls(browser);
    await assertWindSensorEditor(browser);
    if (process.env.ESPDESKTOP_WIND_ONLY === "1") return;
    if (process.env.ESPDESKTOP_RAINFALL_ONLY === "1") { await assertRainfallEditor(browser); return; }
    if (process.env.ESPDESKTOP_CAMERA_DIMMING_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertCameraScreensaverDimming(browser, testCase);
      console.log(`Camera dimming browser checks passed for ${ACTIVE_CASES.length} layouts.`);
      return;
    }
    if (process.env.ESPDESKTOP_SUBPAGE_BACK_ONLY === "1" || process.env.ESPDESKTOP_CARD_NAMES_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) {
        const nativeState = nativeConfigState(testCase.slug);
        const context = await browser.newContext({ viewport: testCase.viewport });
        await installRoutes(context, testCase.slug, { nativeState });
        const page = await context.newPage();
        await installFakeEventSource(page);
        try {
          await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
          await page.waitForSelector("#sp-app");
          await seedNativeDocument(page, nativeState);
          if (process.env.ESPDESKTOP_CARD_NAMES_ONLY === "1") await assertInlineCardNames(page, nativeState, testCase.name);
          else await assertSubpageBackCard(page, testCase.name, nativeState);
        } finally { await context.close(); }
      }
      console.log(`Card title browser checks passed for ${ACTIVE_CASES.length} layouts.`);
      return;
    }
    if (process.env.ESPDESKTOP_CONTEXT_ICON_SIZE_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) {
        await assertAutomaticAppIcons(browser, testCase);
        }
      console.log("Right-click app icon sizes and chevrons passed for native and legacy configurations.");
      return;
    }
    if (process.env.ESPDESKTOP_CONTEXT_COLOUR_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertContextColourPicker(browser, testCase);
      console.log(`Context colour picker browser checks passed for ${ACTIVE_CASES.length} layouts, native and legacy saves.`);
      return;
    }
    if (process.env.ESPDESKTOP_ACTIVE_COLOUR_ONLY === "1") {
      const testCase = ACTIVE_CASES.find(item => item.exerciseInteractions) || ACTIVE_CASES[0];
      const context = await browser.newContext({ viewport: testCase.viewport });
      await installRoutes(context, testCase.slug);
      const page = await context.newPage();
      const posts = [];
      page.on("request", request => {
        if (request.method() === "POST") posts.push(postRecord(request.url()));
      });
      await installFakeEventSource(page);
      try {
        await page.goto(`http://espdesktop.test/${testCase.slug}?events=1`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#sp-app");
        await page.waitForFunction(() => window.__eventSources?.length > 0);
        await page.evaluate(events => window.__seedEspState(events), seededEvents());
        await page.waitForSelector(".sp-main > .sp-btn");
        await assertCardActiveColourControls(page, posts, testCase.name);
        await assertSliderActiveColours(page, testCase.name);
      } finally { await context.close(); }
      console.log("Card active colour browser checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_OUTLINES_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertPreviewOutlines(browser, testCase, true);
      console.log(`Preview outline pixel checks passed for ${ACTIVE_CASES.length} generated layouts.`);
      return;
    }
    if (process.env.ESPDESKTOP_CURVE_PRESETS_ONLY === "1") {
      for (const testCase of ACTIVE_CASES) await assertCardCurveSettings(browser, testCase);
      console.log(`Card curve preset checks passed for ${ACTIVE_CASES.length} generated layouts.`);
      return;
    }
    await assertCardCurveSettings(browser, ACTIVE_CASES[0]);
    for (const testCase of ACTIVE_CASES) {
      await assertContinuousPreview(browser, testCase);
      await assertPreviewOutlines(browser, testCase);
    }
    if (process.env.ESPDESKTOP_CORNERS_ONLY === "1") { console.log(`Continuous preview checks passed for ${ACTIVE_CASES.length} generated layouts.`); return; }
    await assertScreensaverPinRemoval(browser);
    if (process.env.ESPDESKTOP_PIN_ONLY === "1") { console.log("PIN removal and legacy backup restore browser checks passed."); return; }

    await assertRainfallEditor(browser);
    await assertWeatherWidthScaling(browser);
    await assertS3ForecastEditorLayout(browser);
    if (process.env.ESPDESKTOP_RESET_ONLY === "1") {
      await assertResetControls(browser);
      console.log("Factory reset confirmation browser checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_CONNECTOR_STATUS_ONLY === "1") {
      const testCase = CASES.find((candidate) => candidate.slug === "guition-esp32-s3-4848s040");
      assert(testCase, "4-inch S3 browser profile is available");
      await assertCompanionOnlyCardPicker(browser, testCase);
      console.log("Home Assistant connection transition browser checks passed.");
      return;
    }
    if (process.env.ESPDESKTOP_HA_VISIBILITY_ONLY === "1") {
      const testCase = CASES.find(item => item.slug === "guition-esp32-s3-4848s040");
      await assertCompanionOnlyCardPicker(browser, testCase);
      console.log("Home Assistant visibility browser checks passed.");
      return;
    }
    await assertReorderAfterDelete(browser);
    await assertNestedCompanionPages(browser);
    await assertLiveFinderPreview(browser);
    await assertAppShortcutPreview(browser);
    await assertFirstRunSetup(browser);
    await assertAppSubpageOpeningPreference(browser);
    await assertEditorRefresh(browser);
    if (process.env.ESPDESKTOP_EDITOR_REFRESH_ONLY === "1") { console.log("Editor refresh browser checks passed."); return; }
    await assertHomeAssistantConnectorLayout(browser);
    await assertNamingOfflineBackups(browser);
    await assertPanelNaming(browser);
    if (!acceptanceOnly) {
      await assertPageTitleEvents(browser);
      await assertRotationStartupOrdering(browser);
      await assertInitialGlobalIconSize(browser);
    }
    await assertHostedCompatibility(browser);
    await assertFirmwareRetryFeedback(browser);
    await assertResetControls(browser);
    for (const testCase of ACTIVE_CASES) {
      console.log(`Checking browser journeys: ${testCase.name}`);
      await assertCameraScreensaverDimming(browser, testCase);
      if (!acceptanceOnly) {
        await runCase(browser, testCase);
      }
      await assertNativeProfileJourney(browser, testCase);
      await assertStandardIconSizes(browser, testCase);
      await assertGlobalIconSize(browser, testCase);
      await assertCompanionURLOpenBehavior(browser, testCase);
      await assertCompanionShortcutSettings(browser, testCase);
      await assertAppSubpageCapacity(browser, testCase);
      await assertShortcutCatalogSettings(browser, testCase);
      await assertCompanionStorageSettings(browser, testCase);
      await assertCompanionOnlyCardPicker(browser, testCase);
      await assertLegacyProfileFallback(browser, testCase);
      if (testCase.exerciseInteractions) await assertLegacyRestoreVerificationFailure(browser, testCase);
      await assertOfflineProfileFallback(browser, testCase);
      if (!acceptanceOnly) await assertMobileDeviceViewport(browser, testCase);
    }
  } finally {
    await browser.close();
  }
  console.log(
    `Browser web smoke checks passed for ${ACTIVE_CASES.length} generated layouts.`,
  );
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
