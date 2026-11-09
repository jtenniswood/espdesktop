"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { normalizeScheduleTrigger, normalizeScreensaverMode, normalizeBackupScreenSettings } = loadTypescriptTest("src/webserver/model/settings.ts");

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

test("a legacy sensor backup cannot re-enable a time schedule during restore", () => {
    const restored = normalizeBackupScreenSettings({schedule_trigger: "sensor", schedule_enabled: true}, {});
    assert.equal(restored.scheduleTrigger, "disabled");
    assert.equal(restored.scheduleEnabled, false);
    const local = normalizeBackupScreenSettings({schedule_trigger: "time", schedule_enabled: true, schedule_on_hour: 9, schedule_off_hour: 20}, {});
    assert.equal(local.scheduleTrigger, "time");
    assert.equal(local.scheduleEnabled, true);
    assert.equal(local.scheduleOnHour, 9);
    assert.equal(local.scheduleOffHour, 20);
});
