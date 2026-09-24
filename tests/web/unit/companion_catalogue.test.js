"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const { createCompanionCatalogue } = loadTypeScriptModule("src/webserver/api/companion_catalogue.ts");

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
