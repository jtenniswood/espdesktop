"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const esbuild = require("esbuild");

test("Mac artwork settings save enable, delay and overlay choices without entity setup", () => {
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    change() { this.listeners.change?.(); }
    find(id) { return this.id === id ? this : this.children.map(child => child.find(id)).find(Boolean); }
  }
  const document = { createElement: tag => new Element(tag) };
  const root = path.resolve(__dirname, "../../..");
  const source = esbuild.buildSync({ stdin: { contents: `
    export { createSettingsCoverArtSectionFeature } from "./src/webserver/application/settings_cover_art_section";
    export { initializeAppState, state } from "./src/webserver/state/app_instance";
    export { initializeDeviceConfig } from "./src/webserver/device_config";
    export { createCoverArtScreensaverController } from "./src/webserver/features/cover_art_screensaver_controller";
  `, resolveDir: root, loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false, logLevel: "silent" }).outputFiles[0].text;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, document,
    __ESPDESKTOP_DEFAULT_DEVICE_ID__: "test",
    __ESPDESKTOP_DEVICE_PROFILES__: { test: { slots: 1, cols: 1, rows: 1, features: { companion: true }, timezoneOptions: [] } },
    __ESPDESKTOP_TIMEZONE_OPTIONS__: [],
  });
  const ui = module.exports;
  ui.initializeDeviceConfig(); ui.initializeAppState();
  const state = ui.state, posts = [];
  const read = () => ({ enabled: state.coverArtScreensaverOn, delay: state.coverArtDelay,
    trackOverlayDuration: state.coverArtTrackOverlayDuration, hideExternalInput: false,
    filteringEnabled: false, attributeConditions: "" });
  const apply = next => Object.assign(state, { coverArtScreensaverOn: next.enabled,
    coverArtDelay: next.delay, coverArtTrackOverlayDuration: next.trackOverlayDuration });
  const controller = ui.createCoverArtScreensaverController({ delay: Number, trackOverlayDuration: Number });
  const api = new Proxy({
    postCoverArtScreensaver: value => posts.push(["enabled", value]),
    postCoverArtDelay: value => posts.push(["delay", value]),
    postCoverArtTrackOverlayDuration: value => posts.push(["overlay", value]),
  }, { get(target, property) { assert(property in target, `Unexpected integration setting: ${String(property)}`); return target[property]; } });
  const feature = ui.createSettingsCoverArtSectionFeature({ els: {} }, api, {
    condField: () => new Element("div"), fieldLabel: () => new Element("label"),
    makeCollapsibleCard: (_title, body) => body,
    toggleRow: (_title, id, checked) => {
      const row = new Element("div"), input = new Element("input");
      input.id = id; input.checked = checked; row.appendChild(input); return { row, input };
    },
  }, { applyCoverArtScreensaverState: apply, coverArtScreensaverState: read,
    coverArtTrackOverlayDurationSupported: () => true, statusBadge: () => new Element("span"),
    syncCoverArtScreensaverUi() {},
  }, controller);
  const card = feature.buildCoverArtSettingsCard();
  const toggle = card.find("sp-set-ss-cover-art-enable"); toggle.checked = true; toggle.change();
  const delay = card.find("sp-set-ss-cover-art-delay"); delay.value = "30"; delay.change();
  const overlay = card.find("sp-set-ss-track-overlay"); overlay.value = "-1"; overlay.change();
  assert.deepEqual(posts, [["enabled", true], ["delay", 30], ["overlay", -1]]);
  assert.equal(state.coverArtScreensaverOn, true);
  assert.equal(state.coverArtDelay, 30);
  assert.equal(state.coverArtTrackOverlayDuration, -1);
  assert.equal(card.find("sp-set-ss-cover-art-player"), undefined);
});
