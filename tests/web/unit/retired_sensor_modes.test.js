"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { normalizeScheduleTrigger, normalizeScreensaverMode } = loadTypescriptTest("src/webserver/model/settings.ts");

test("retired sensor settings restore as disabled while local modes remain available", () => {
    for (const enabled of [false, true]) {
        assert.equal(normalizeScheduleTrigger("sensor", enabled), "disabled");
        assert.equal(normalizeScheduleTrigger("Sensor", enabled), "disabled");
        assert.equal(normalizeScheduleTrigger("time", enabled), "time");
        assert.equal(normalizeScheduleTrigger("timer", enabled), "time");
        assert.equal(normalizeScheduleTrigger("disabled", enabled), "disabled");
    }
    assert.equal(normalizeScreensaverMode("sensor"), "disabled");
    for (const mode of ["disabled", "timer", "companion"]) {
        assert.equal(normalizeScreensaverMode(mode), mode);
    }
});
