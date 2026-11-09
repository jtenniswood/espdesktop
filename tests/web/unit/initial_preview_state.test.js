"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const { createStateLoaderFeature } = loadTypeScriptModule(require("node:path").resolve(__dirname, "../../../src/webserver/application/state_loader_api.ts"));
const { ENTITY_CATALOG } = loadTypeScriptModule(require("node:path").resolve(__dirname, "../../../src/webserver/generated/entity_catalog.ts"));

for (const outcome of ["Large", "Medium", "Small", "missing", "rejected"]) {
  test(`initial cards wait for the saved icon size: ${outcome}`, async () => {
    const requests = [];
    const applied = [];
    const timers = [];
    let resolveSize;
    let rejectSize;
    let finish;
    const completed = new Promise(resolve => { finish = resolve; });
    let defaultSize = "Small";
    let connected = false;
    const runtime = {};
    const items = keys => keys.map(key => [ENTITY_CATALOG.entities[key].domain, key]);
    const loader = createStateLoaderFeature(runtime, { config: { features: {} } }, {}, {}, {}, {}, {
      entityStateItems: items,
      entityStateItemsForSlots: keys => keys.length ? [["text", keys[0]]] : [],
    }, {
      setConfigLocked() { throw new Error("working card responses must connect"); }, showBanner() {},
    }, {
      entityDetailPath: (_domain, name) => name,
      entityInitialDetail: () => "all",
      getJsonQuietly: name => {
        requests.push(name);
        if (name === "screen_default_icon_size") return new Promise((resolve, reject) => { resolveSize = resolve; rejectSize = reject; });
        return Promise.resolve({ id: name });
      },
    }, { schedule() {} }, {
      subpageEntityKeys: () => [], connectEvents() {},
      publishCompanionURLTargets: () => finish(),
    });
    try {
      loader.loadInitialState(data => {
        if (data.id === "screen_default_icon_size") defaultSize = data.value;
        else applied.push({ id: data.id, size: defaultSize });
      }, () => { connected = true; });
      assert.deepEqual(requests, ["screen_default_icon_size"]);
      await Promise.resolve();
      assert.equal(connected, false);
      assert.equal(applied.length, 0, "no provisional card layout while the setting is pending");
      if (outcome === "rejected") rejectSize(new Error("offline optional setting"));
      else resolveSize(outcome === "missing" ? null : { id: "screen_default_icon_size", value: outcome });
      await completed;
      timers.push(runtime.migrationTimer, runtime.sliderMigrationTimer);
      assert.equal(connected, true);
      const cards = applied.filter(item => ENTITY_CATALOG.groups.card.includes(item.id) || item.id === "button_config");
      assert(cards.length > 0);
      assert(cards.every(card => card.size === (["missing", "rejected"].includes(outcome) ? "Small" : outcome)), "every card uses the resolved default on its first update");
      assert.equal(requests.filter(name => name === "screen_default_icon_size").length, 1, "the initial setting is not fetched again later");
      assert(requests.includes("screen_theme_mode"), "unrelated settings still load afterward");
    } finally {
      timers.forEach(clearTimeout);
      clearTimeout(runtime.migrationTimer);
    }
  });
}
