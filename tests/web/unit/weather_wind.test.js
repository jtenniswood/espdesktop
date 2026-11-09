"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const { loadTypeScriptModule } = require("../../../scripts/load_typescript_module");
const root = path.resolve(__dirname, "../../..");
const { createConfigWeatherOptionsFeature } = loadTypeScriptModule(path.join(root, "src/webserver/application/config_weather_options.ts"));
const { registerWeatherCardTypes } = loadTypeScriptModule(path.join(root, "src/webserver/cards/weather.ts"));
test("wind is selectable and retained with or without forecast support", () => {
  for (const disabledCardTypes of [[], ["weather_forecast"]]) {
    const options = createConfigWeatherOptionsFeature({ disabledCardTypes });
    assert.equal(options.normalizeWeatherCardMode("wind"), "wind");
    assert(options.weatherModeOptions().some(([value]) => value === "wind"));
    assert.equal(options.weatherCardIsForecastMode({ precision: "wind" }), false);
    let weather;
    registerWeatherCardTypes({ register: (_, definition) => weather = definition }, options, {}, {}, {});
    const config = { precision: "wind", entity: "weather.home" };
    assert.equal(weather.onSelect, null, "retired weather has no new-selection action");
    assert.equal(config.precision, "wind");
    assert.equal(weather.cardMetadata.mode.value(config), "wind");
    const preview = weather.renderPreview(config);
    assert.match(preview.iconHtml, /arrow-top-right/);
    assert.match(preview.labelHtml, /North East.*12.5 km\/h/);
    assert.equal(preview.labelEditable, false);
  }
});

test("retired wind editors preserve sensor sources without offering controls", () => {
  const options=createConfigWeatherOptionsFeature({});
  const config={precision:"wind",options:"wind_source=sensors",entity:"sensor.direction",sensor:"sensor.speed"};
  assert.equal(options.weatherWindUsesSensors(config),true);
  let weather; registerWeatherCardTypes({register:(_,value)=>weather=value},options,{},{},{});
  const previous=global.document; global.document={createElement:()=>({})};
  try {
    const before=JSON.stringify(config), children=[];
    weather.renderSettings({appendChild:child=>children.push(child)},config,1,{});
    assert.equal(JSON.stringify(config),before);
    assert.match(children[0].textContent,/configuration has been kept/);
  } finally {global.document=previous;}
});
