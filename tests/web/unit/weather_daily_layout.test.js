"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");

const root = path.resolve(__dirname, "../../..");
const { planWeatherCardLayout } = loadTypeScriptModule(path.join(root, "src/webserver/application/weather_daily_layout.ts"));
const metrics = [84, 96, 26, 13];

test("S3 card spans choose readable rows and grids with stacked narrow tiles", () => {
  const spans = [
    [1, 1, 1, 1], [2, 1, 2, 1], [3, 1, 4, 1],
    [1, 2, 1, 2], [2, 2, 2, 2], [3, 2, 4, 2],
    [1, 3, 1, 3], [2, 3, 2, 3], [3, 3, 3, 3],
  ];
  for (const [wide, tall, columns, rows] of spans) {
    const width = 150 * wide + 10 * (wide - 1) - 28;
    const height = 138 * tall + 10 * (tall - 1) - 28;
    assert.deepEqual(planWeatherCardLayout(width, height, ...metrics, 8),
      { count: Math.min(8, columns * rows), columns, rows }, `${wide}w ${tall}h`);
  }
  assert.deepEqual(planWeatherCardLayout(442, 258, ...metrics, 6),
    { count: 6, columns: 3, rows: 2 }, "shorter provider forecasts rebalance the grid");
  assert.deepEqual(planWeatherCardLayout(122, 82, ...metrics, 8),
    { count: 1, columns: 1, rows: 1 }, "short cards retain stacked tiles");
});

test("saved weather preview stays bounded across sizes and provider limits", () => {
  for (const width of [100, 122, 194, 282, 442, 900]) {
    for (const height of [82, 110, 205, 258, 406, 700]) {
      for (const available of [0, 1, 2, 5, 6, 7, 8, 9]) {
        const plan = planWeatherCardLayout(width, height, ...metrics, available);
        assert(plan.count <= Math.min(available, 8));
        assert(plan.count <= plan.columns * plan.rows);
      }
    }
  }
});
