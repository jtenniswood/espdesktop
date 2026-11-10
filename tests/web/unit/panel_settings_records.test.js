const assert = require("node:assert/strict");
const test = require("node:test");
const fixtures = require("../../../compatibility/fixtures/panel_settings_records.json");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");
const { validPanelScalarSetting, read_display_brightness_preferences } = loadTypescriptTest("src/webserver/generated/panel_settings.ts");

const readers = {
  screen_schedule_preferences: loadTypescriptTest("src/webserver/model/screen_schedule_preferences.ts")
    .decodeScreenSchedulePreferences,
  display_theme_preferences: loadTypescriptTest("src/webserver/model/display_theme_preferences.ts")
    .decodeDisplayThemePreferences,
  display_brightness_preferences: read_display_brightness_preferences,
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
  assert.equal(validPanelScalarSetting("screen_clock_format", "12h"), true);
  assert.equal(validPanelScalarSetting("screen_language", "pt-br"), true);
  assert.equal(validPanelScalarSetting("screen_timezone", "Europe/London (GMT+0)"), true);
  assert.equal(validPanelScalarSetting("screen_timezone", "Europe/London"), false);
  assert.equal(validPanelScalarSetting("screen_ntp_server_1", ""), true);
  assert.equal(validPanelScalarSetting("screen_ntp_server_1", "2001:db8::1"), true);
  assert.equal(validPanelScalarSetting("screen_ntp_server_1", "invalid\nserver"), false);
  assert.equal(validPanelScalarSetting("screen_ntp_server_1", "a".repeat(101)), false);
  assert.equal(validPanelScalarSetting("screen_rotation", "270"), true);
  assert.equal(validPanelScalarSetting("screen_rotation", "45"), false);
  assert.equal(validPanelScalarSetting("firmware_auto_update", "0"), true);
  assert.equal(validPanelScalarSetting("firmware_update_frequency", "Weekly"), true);
  assert.equal(validPanelScalarSetting("firmware_update_frequency", "Yearly"), false);
  assert.equal(validPanelScalarSetting("unknown_setting", "value"), true);
});
