const assert = require("node:assert/strict");
const test = require("node:test");
const fixtures = require("../../../compatibility/fixtures/panel_settings_records.json");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { validPanelScalarSetting } = loadTypescriptTest("src/webserver/generated/panel_settings.ts");

const readers = {
  screen_schedule_preferences: loadTypescriptTest("src/webserver/model/screen_schedule_preferences.ts")
    .decodeScreenSchedulePreferences,
  display_theme_preferences: loadTypescriptTest("src/webserver/model/display_theme_preferences.ts")
    .decodeDisplayThemePreferences,
};

for (const [name, records] of Object.entries(fixtures)) {
  test(name + " accepts and rejects the same records as firmware", () => {
    const read = readers[name];
    for (const value of records.valid) assert.ok(read(value), JSON.stringify(value));
    for (const value of records.invalid) assert.equal(read(value), undefined, JSON.stringify(value));
  });
}

test("native scalar settings enforce the authored choices", () => {
  assert.equal(validPanelScalarSetting("screen_clock_bar", "1"), true);
  assert.equal(validPanelScalarSetting("screen_clock_bar", "true"), false);
  assert.equal(validPanelScalarSetting("screen_card_curve", "Medium"), true);
  assert.equal(validPanelScalarSetting("screen_card_curve", "medium"), false);
  assert.equal(validPanelScalarSetting("screensaver_timeout", "3600"), true);
  assert.equal(validPanelScalarSetting("screensaver_timeout", "3601"), false);
  assert.equal(validPanelScalarSetting("screensaver_timeout", "1800\n"), false);
  assert.equal(validPanelScalarSetting("screensaver_mode", "sensor"), false);
  assert.equal(validPanelScalarSetting("unknown_setting", "value"), true);
});
