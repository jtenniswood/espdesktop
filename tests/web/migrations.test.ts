import { cloneCardConfig, parseRawButtonConfig } from "../../src/webserver/model";
import { migrateSavedConfigVacuumLegacy } from "../../src/webserver/generated/saved_config_vacuum";
import { migrateSavedConfigWeatherLegacy } from "../../src/webserver/generated/saved_config_weather";

interface LegacyFixture {
  readonly input: string;
  readonly expected: Record<string, string>;
}

type LegacyFixtures = Readonly<Record<string, LegacyFixture>>;

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

export function runMigrationTests(fixtures: LegacyFixtures): void {
  const generatedCases = [
    {
      name: "weather forecast",
      fixture: fixtures.weather_forecast_alias,
      migrate: migrateSavedConfigWeatherLegacy,
      fields: ["type", "precision"] as const,
    },
  ];
  for (const migration of generatedCases) {
    if (!migration.fixture) throw new Error(`${migration.name}: shared compatibility fixture is missing`);
    const config = parseRawButtonConfig(migration.fixture.input);
    equal(migration.migrate(config), true, `${migration.name} alias is detected`);
    for (const field of migration.fields) {
      equal(config[field], migration.fixture.expected[field], `${migration.name} ${field}`);
    }
  }

  const vacuumCases = [
    { action: "vacuum.start", mode: "start_stop" },
    { action: "vacuum.return_to_base", mode: "dock" },
  ];
  for (const migration of vacuumCases) {
    const config = cloneCardConfig({ type: "action", sensor: migration.action, options: "stale" });
    equal(migrateSavedConfigVacuumLegacy(config), true, `${migration.action} alias is detected`);
    equal(config.type, "vacuum", `${migration.action} canonical type`);
    equal(config.sensor, migration.mode, `${migration.action} canonical mode`);
    equal(config.options, "", `${migration.action} stale options are retired`);
  }

}
