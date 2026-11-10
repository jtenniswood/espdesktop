const assert = require("node:assert/strict");
const test = require("node:test");
const fixtures = require("../../../compatibility/fixtures/panel_settings_records.json");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

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
