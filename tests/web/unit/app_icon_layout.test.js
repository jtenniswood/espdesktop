"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const { appIconArtworkInsets, appIconFitSide } = loadTypeScriptModule("src/webserver/model/app_icon_layout.ts");

test("app artwork aligns past transparent margins and shadows without moving tightly bounded icons", () => {
  const alpha = new Uint8Array(64);
  assert.deepEqual(appIconArtworkInsets(alpha, 8), { left: 0, top: 0 });
  alpha.fill(255);
  assert.deepEqual(appIconArtworkInsets(alpha, 8), { left: 0, top: 0 });
  alpha.fill(0);
  alpha[1] = 20;
  for (let y = 3; y < 7; y++)
    for (let x = 2; x < 6; x++) alpha[y * 8 + x] = 255;
  assert.deepEqual(appIconArtworkInsets(alpha, 8), { left: 2, top: 3 });
  assert.deepEqual(appIconArtworkInsets(alpha.map(value => value / 4), 8), { left: 2, top: 3 });
});

test("icons fit above zero, one and two label lines, without overlapping the label", () => {
  for (const [labelHeight, expected] of [[0, 100], [20, 75], [40, 55]])
    assert.equal(appIconFitSide(100, 100, labelHeight, 5, 1, 1), expected);
  assert.equal(appIconFitSide(200, 100, 40, 5, 1, 1), 55);
  assert.equal(appIconFitSide(100, 200, 40, 5, 1, 1), 100);
  assert.equal(appIconFitSide(100, 100, 40, 5, 0.5, 0.5), 110);
  assert.equal(appIconFitSide(100, 40, 40, 5, 1, 1), 1);
});
