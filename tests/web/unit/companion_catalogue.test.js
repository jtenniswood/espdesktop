"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const { createCompanionCatalogue, createCompanionCatalogueMonitor } = loadTypeScriptModule("src/webserver/api/companion_catalogue.ts");

test("catalogue caches are isolated, retries empty results, and preserves identities after failures", async () => {
  let calls = 0, fail = false, empty = false;
  const first = createCompanionCatalogue(async (path, options) => {
    assert.equal(path, "/companion/actions");
    assert.equal(options.cache, "no-store");
    ++calls;
    if (fail) throw new Error("offline");
    if (empty) return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [{ id: "first", label: "First" }, null, { id: 3 }] };
  });
  const second = createCompanionCatalogue(async () => ({ ok: true, json: async () => [{ id: "second", label: "Second" }] }));
  const pending = first.load();
  assert.equal(first.load(), pending);
  assert.deepEqual(await pending, [{ id: "first", label: "First" }]);
  assert.deepEqual(await second.load(), [{ id: "second", label: "Second" }]);
  fail = true;
  await assert.rejects(first.load(true), /offline/);
  assert.deepEqual(await first.load(), [{ id: "first", label: "First" }]);
  assert.equal(calls, 2);

  const retrying = createCompanionCatalogue(async () => {
    ++calls;
    return { ok: true, json: async () => empty ? [] : [{ id: "ready", label: "Ready" }] };
  });
  empty = true;
  assert.deepEqual(await retrying.load(), []);
  empty = false;
  assert.deepEqual(await retrying.load(), [{ id: "ready", label: "Ready" }]);
  assert.equal(calls, 4);

  let releaseInitial;
  let queuedCalls = 0;
  const queued = createCompanionCatalogue(async () => {
    ++queuedCalls;
    if (queuedCalls === 1) {
      return await new Promise((resolve) => { releaseInitial = resolve; });
    }
    return { ok: true, json: async () => [{ id: "reconnected", label: "Reconnected" }] };
  });
  const startup = queued.load();
  const reconnect = queued.load(true);
  releaseInitial({ ok: true, json: async () => [] });
  assert.deepEqual(await startup, []);
  assert.deepEqual(await reconnect, [{ id: "reconnected", label: "Reconnected" }]);
  assert.equal(queuedCalls, 2);
});

test("connected catalogue retries empty results until friendly app names are available", async () => {
  let calls = 0;
  let nextTimer = 0;
  const scheduled = new Map();
  const delays = [];
  const shown = [];
  const monitor = createCompanionCatalogueMonitor(
    async () => ++calls < 3 ? [] : [{ id: "com.example.app", label: "Example App" }],
    (actions) => shown.push(actions),
    (callback, delayMs) => {
      const id = ++nextTimer;
      scheduled.set(id, callback);
      delays.push(delayMs);
      return id;
    },
    (id) => scheduled.delete(id),
  );
  async function runNextRetry() {
    const [id, callback] = scheduled.entries().next().value;
    scheduled.delete(id);
    callback();
    await new Promise((resolve) => setImmediate(resolve));
  }

  monitor.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  await runNextRetry();
  assert.equal(calls, 2);
  await runNextRetry();
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000, 30000]);
  assert.deepEqual(shown.at(-1), [{ id: "com.example.app", label: "Example App" }]);
  assert.equal(scheduled.size, 1);
  monitor.stop();
  assert.equal(scheduled.size, 0);
});

test("connected catalogue refreshes app names that change without reconnecting", async () => {
  let calls = 0;
  let nextTimer = 0;
  const scheduled = new Map();
  const delays = [];
  const shown = [];
  const monitor = createCompanionCatalogueMonitor(
    async () => ++calls < 3
      ? [{ id: "com.example.app", label: "Old Name" }]
      : [{ id: "com.example.app", label: "New Name" }],
    (actions) => shown.push(actions),
    (callback, delayMs) => {
      const id = ++nextTimer;
      scheduled.set(id, callback);
      delays.push(delayMs);
      return id;
    },
    (id) => scheduled.delete(id),
  );
  async function runNextRefresh() {
    const [id, callback] = scheduled.entries().next().value;
    scheduled.delete(id);
    callback();
    await new Promise((resolve) => setImmediate(resolve));
  }

  monitor.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.deepEqual(delays, [30000]);
  await runNextRefresh();
  assert.equal(calls, 2);
  assert.equal(shown.length, 1);
  await runNextRefresh();
  assert.equal(calls, 3);
  assert.deepEqual(shown, [
    [{ id: "com.example.app", label: "Old Name" }],
    [{ id: "com.example.app", label: "New Name" }],
  ]);
  assert.deepEqual(delays, [30000, 30000, 30000]);
  monitor.stop();
  assert.equal(scheduled.size, 0);
});

test("disconnect stops catalogue refreshes and ignores an in-flight response", async () => {
  let calls = 0;
  let nextTimer = 0;
  const scheduled = new Map();
  const shown = [];
  let resolveLoad;
  const monitor = createCompanionCatalogueMonitor(
    () => {
      ++calls;
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
    (actions) => shown.push(actions),
    (callback) => {
      const id = ++nextTimer;
      scheduled.set(id, callback);
      return id;
    },
    (id) => scheduled.delete(id),
  );
  monitor.start();
  monitor.stop();
  resolveLoad([]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(shown.length, 0);
  assert.equal(scheduled.size, 0);
});


test("connected catalogue refreshes changed icon hashes and shortcut colours without label changes", async () => {
  const scheduled = new Map();
  let timerID = 0;
  let hash = "a".repeat(64);
  let shortcutColor = 0xFF6363;
  const updates = [];
  const catalogue = createCompanionCatalogue(async () => ({
    ok: true,
    json: async () => [
      { id: "com.example.app", label: "Example", ...(hash ? { iconHash: hash } : {}) },
      { id: "appleshortcut.pomodoro", label: "Start Pomodoro", shortcutColor },
    ],
  }));
  const monitor = createCompanionCatalogueMonitor(
    () => catalogue.load(true),
    (actions) => updates.push(actions),
    (callback) => { scheduled.set(++timerID, callback); return timerID; },
    (id) => scheduled.delete(id),
  );
  const refresh = async () => {
    const [id, callback] = scheduled.entries().next().value;
    scheduled.delete(id);
    callback();
    await new Promise((resolve) => setImmediate(resolve));
  };
  monitor.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updates.length, 1);
  assert.equal(updates[0][0].iconHash, hash);
  await refresh();
  assert.equal(updates.length, 1, "unchanged icons do not rerender or redownload");
  hash = "b".repeat(64);
  await refresh();
  assert.equal(updates.length, 2);
  assert.equal(updates[1][0].iconHash, hash);
  hash = "";
  await refresh();
  assert.equal(updates.length, 3, "evicted icons also invalidate the previous preview");
  assert.equal(updates[2][0].iconHash, undefined);
  shortcutColor = 0;
  await refresh();
  assert.equal(updates.length, 4, "changing only the shortcut colour refreshes the preview");
  assert.equal(updates[3][1].shortcutColor, 0);
  monitor.stop();
});

test("the Windows shortcut index stays on Windows even when no apps are approved", async () => {
  const windowsApps = [{ appId: "windows.example", label: "Example" }];
  for (const entries of [[], windowsApps]) {
    const calls = [];
    const catalogue = createCompanionCatalogue(async (url) => {
      calls.push(url);
      return Response.json({
        catalogueVersion: 4, page: 0, complete: true,
        application: { shortcutPlatform: "windows", applications: entries },
      });
    });
    const definitions = await catalogue.loadDefinitions();
    assert.equal(definitions.shortcutPlatform, "windows");
    assert.deepEqual(definitions.applications.map(app => app.appId), entries.map(app => app.appId));
    assert.deepEqual(calls, ["/companion/shortcut-page?appId=index&page=0"]);
  }
});

test("app shortcut picker fetches only the selected app, deduplicates requests, and caches the full reply", async () => {
  const appId = "com.brave.Browser";
  const calls = [];
  const starter = { appId, label: "Brave Browser", shortcuts: [{ id: "0" }] };
  const expanded = { appId, shortcuts: [], moreShortcuts: [{ id: "77" }] };
  const catalogue = createCompanionCatalogue(async (url) => {
    calls.push(url);
    if (calls.length === 1) return new Response(null, { status: 202 });
    const page = Number(new URL(url, "http://display.local").searchParams.get("page"));
    return Response.json({
      catalogueVersion: 24, page, complete: page === 1, application: page === 0 ? starter : expanded,
    });
  });
  const request = catalogue.loadShortcutApplication(appId);
  assert.equal(catalogue.loadShortcutApplication(appId), request);
  const definition = await request;
  assert.equal(definition.label, "Brave Browser");
  assert.deepEqual(definition.moreShortcuts, [{ id: "77" }]);
  assert.equal(await catalogue.loadShortcutApplication(appId), definition);
  assert.deepEqual(calls, [0, 0, 1].map(page => `/companion/shortcut-page?appId=${appId}&page=${page}`));
});

test("a disconnect or catalogue change during an app transfer never publishes a partial definition", async () => {
  const appId = "com.brave.Browser";
  for (const interrupted of [new Response(null, { status: 404 }), Response.json({
    catalogueVersion: 25, page: 1, complete: true,
    application: { appId, shortcuts: [], moreShortcuts: [{ id: "77" }] },
  })]) {
    const catalogue = createCompanionCatalogue(async (url) => url.endsWith("page=1") ? interrupted : Response.json({
      catalogueVersion: 24, page: 0, complete: false,
      application: { appId, label: "Brave Browser", shortcuts: [{ id: "0" }] },
    }));
    assert.equal(await catalogue.loadShortcutApplication(appId), null);
  }
});

test("picker discovers apps beyond 256 without downloading their shortcut definitions", async () => {
  const catalogue = createCompanionCatalogue(async (url) => {
    const params = new URL(url, "http://display.local").searchParams;
    assert.equal(params.get("appId"), "index");
    const page = Number(params.get("page"));
    return Response.json({ page, catalogueVersion: 30, complete: page === 9, application: {
      applications: Array.from({ length: 32 }, (_, index) => ({
        appId: `com.example.App${page * 32 + index}`, label: `App ${page * 32 + index}`,
      })),
    } });
  });
  const { applications } = await catalogue.loadDefinitions();
  assert.equal(applications.length, 320);
  assert.equal(applications.at(-1).appId, "com.example.App319");
  assert(applications.every(app => app.shortcuts.length === 0));
});
