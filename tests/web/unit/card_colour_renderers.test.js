"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { loadTypescriptTest } = require("./helpers/load_typescript_test");

function element(value = "") {
  return {
    value, checked: false, style: {}, children: [], listeners: {},
    classList: { add() {}, remove() {} },
    appendChild(child) { this.children.push(child); },
    querySelector() { return null; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setCustomValidity() {},
  };
}

function editor() {
  const document = { createElement: () => element() };
  const registry = { definitions: {}, register(type, definition) { this.definitions[type] = definition; } };
  const ui = { renderButtonSettings() {} };
  const fields = { cardBadgeLabelHtml(_helpers, label) { return label; }, cardBadgePreview() {} };
  const robot = loadTypescriptTest("src/webserver/application/config_robot_card_options.ts")
    .createConfigRobotCardOptionsFeature();
  const tabs = loadTypescriptTest("src/webserver/application/config_modal_tab_options.ts")
    .createConfigModalTabOptionsFeature({ document, ...ui });
  // Layout is simulated; real option normalizers and card renderers run below.
  tabs.renderModalTabSettings = () => {};
  loadTypescriptTest("src/webserver/cards/vacuum.ts").registerVacuumCardTypes(registry, robot, fields, ui);
  loadTypescriptTest("src/webserver/cards/lawn_mower.ts").registerLawnMowerCardTypes(registry, robot, fields, ui);
  loadTypescriptTest("src/webserver/cards/fan.ts").registerFanCardTypes(registry, tabs, fields, ui);
  const access = loadTypescriptTest("src/webserver/application/config_access_climate_alarm_options.ts")
    .createConfigAccessClimateAlarmOptionsFeature(tabs);
  const confirmation = loadTypescriptTest("src/webserver/application/config_confirmation_options.ts")
    .createConfigConfirmationOptionsFeature(access);
  const lightCards = loadTypescriptTest("src/webserver/cards/light_temperature.ts")
    .registerLightTemperatureCardTypes(registry, tabs, fields, ui);
  loadTypescriptTest("src/webserver/cards/switch.ts").registerSwitchCardTypes(registry, confirmation, lightCards, fields);
  loadTypescriptTest("src/webserver/cards/slider.ts").registerSliderCardTypes(
    registry, tabs, lightCards, fields, { inlineDisclosure: () => element() }, true, ui);
  const saved = {}, inputs = {}, modes = [], icons = [];
  function field(value = "") { return { field: element(), input: element(value), select: element(value) }; }
  const helpers = {
    idPrefix: "test-",
    saveField(name, value) { saved[name] = value; },
    renderCardModeSelector(_panel, _button, _helpers, metadata) { modes.push(metadata.mode); return field(); },
    renderCardEntityField: () => field(), renderCardTextField: () => field(),
    renderCardNumberField: () => field("50"), renderCardIconPicker(_panel, _button, _helpers, metadata) {
      const result = element();
      icons.push({ metadata, element: result });
      return result;
    },
    renderBasicCardFields() {}, requireField() {}, requireEntityDomain() {},
    disclosureSection: () => ({ panel: element(), section: element() }),
    textField(_label, id, value) { const result = field(value); inputs[id] = result.input; return result; },
    selectField(_label, id, _options, value) { const result = field(value); inputs[id] = result.select; return result; },
    toggleRow(_label, id, checked) { const result = { row: element(), input: element() }; result.input.checked = checked; inputs[id] = result.input; return result; },
  };
  return { registry, document, helpers, saved, inputs, modes, icons, lightCards };
}

test("reopening robot, fan and cover editors keeps the chosen colour", () => {
  const e = editor();
  const previousDocument = global.document;
  global.document = e.document;
  try {
    for (const [type, sensor] of [
      ["vacuum", "start_stop"], ["lawn_mower", "start_mowing"],
      ...["fan_switch", "fan_speed", "fan_oscillate", "fan_direction", "fan_preset"].map(type => [type, ""]),
      ...["", "tilt", "toggle", "open", "close", "stop", "set_position"].map(mode => ["cover", mode]),
    ]) {
      const button = { type, sensor, entity: "test.entity", icon: "Auto", icon_on: "Auto", options: "old_mode,card_off_color=00BCD4" };
      for (let reopen = 0; reopen < 2; reopen++) {
        e.registry.definitions[type].renderSettings(element(), button, 1, e.helpers);
        assert.equal(button.options, "old_mode,card_off_color=00BCD4", `${type}/${sensor}`);
      }
    }
  } finally { global.document = previousDocument; }
});

test("retired robot and fan editors keep their saved mode and colour", () => {
  const previous=global.document;
  try {
    for (const type of ["vacuum", "lawn_mower", "fan_speed"]) {
      const e=editor(); global.document=e.document;
      const button={type, sensor:"legacy", options:"card_off_color=6633B9"};
      const before=JSON.stringify(button);
      e.registry.definitions[type].renderSettings(element(),button,1,e.helpers);
      assert.equal(JSON.stringify(button),before);
      assert.equal(e.modes.length,0);
    }
  } finally {global.document=previous;}
});




test("Light mode initializers retain the colour across every supported mode", () => {
  const types = ["light_control", "light_switch", "light_brightness", "light_temperature"];
  for (const from of types) for (const target of types) {
    if (from === target) continue;
    const e = editor();
    const button = { type: from, entity: "light.living_room", icon: "Auto", options: "card_off_color=FFEC16" };
    e.lightCards.renderControlTypeField(element(), button, e.helpers);
    e.modes[0].onChange.call({ value: target }, button, e.helpers);
    assert.equal(button.type, target);
    assert.equal(button.options, "card_off_color=FFEC16", from + " -> " + target);
    assert.equal(e.saved.options, button.options);
  }
});


test("Volume controls offer microphone and output mute as tap cards and preserve custom labels", () => {
  for (const [mode, id, previousLabel, icon] of [
    ["mac_input_mute", "media.input_mute", "Microphone Mute", "Microphone"],
    ["mac_output_mute", "media.output_mute", "Output Mute", "Volume High"],
  ]) {
    for (const custom of ["", "My Audio"]) {
      const e = editor();
      const button = { type: "slider", entity: "media.output_volume", label: custom, icon: "Auto", icon_on: "Auto" };
      const definition = e.registry.definitions.slider;
      definition.renderSettings(element(), button, 1, e.helpers);
      assert(e.modes[0].options.some(option => option[0] === mode));
      e.modes[0].onChange.call({ value: mode });
      assert.equal(button.entity, id);
      assert.equal(button.label, custom || "Mute");
      assert.equal(button.icon, icon);
      const preview = definition.renderPreview(button, e.helpers);
      assert(!JSON.stringify(preview).includes("sp-slider-track"));
      assert.equal(preview.labelHtml, custom || "Mute");
      assert.equal(definition.renderPreview({ ...button, label: previousLabel }, e.helpers).labelHtml, "Mute");
      definition.renderSettings(element(), button, 1, e.helpers);
      assert.equal(e.modes.at(-1).value(), mode);
    }
  }
});


test("Mac volume and mute cards have one icon picker matching the display default", () => {
  for (const [entity, expected] of [
    ["media.output_volume", "Volume High"], ["media.input_volume", "Microphone"],
    ["media.output_mute", "Volume High"], ["media.input_mute", "Microphone"],
  ]) for (const icon of ["", "Auto", "Apple"]) {
    const e = editor();
    const card = { type: "slider", entity, icon, icon_on: "Bell" };
    const definition = e.registry.definitions.slider;
    definition.renderSettings(element(), card, 1, e.helpers);
    assert.equal(e.icons.length, 1, entity);
    assert.equal(e.icons[0].metadata.label, "Icon");
    assert.equal(e.icons[0].metadata.field, "icon");
    assert.equal(e.icons[0].metadata.value, icon === "Apple" ? icon : expected);
    assert.equal(e.icons[0].metadata.fallback, expected);
    const preview = definition.renderPreview(card, e.helpers);
    const slug = (icon === "Apple" ? icon : expected).toLowerCase().replaceAll(" ", "-");
    assert(preview.iconHtml.includes("mdi-" + slug));
    assert(!preview.iconHtml.includes("mdi-bell"));
  }

});


test("existing mute cards use normal speaker and mic icons when their saved defaults were muted glyphs", () => {
  for (const [entity, icon, expected] of [
    ["media.output_mute", "Volume Off", "Volume High"],
    ["media.input_mute", "Microphone Off", "Microphone"],
  ]) {
    const e = editor(), card = { type: "slider", entity, icon };
    const definition = e.registry.definitions.slider;
    definition.renderSettings(element(), card, 1, e.helpers);
    assert.equal(e.icons[0].metadata.value, expected);
    assert(definition.renderPreview(card, e.helpers).iconHtml.includes("mdi-" + expected.toLowerCase().replaceAll(" ", "-")));
  }
});


test("Mic replaces the input volume default label while preserving custom names", () => {
  for (const label of ["", "Input Volume", "Input volume", "Mic", "Desk microphone"]) {
    const e = editor();
    const card = { type: "slider", entity: "media.input_volume", label };
    const definition = e.registry.definitions.slider;
    const preview = definition.renderPreview(card, e.helpers);
    const expected = label === "Desk microphone" ? label : "Mic";
    assert.equal(preview.labelHtml, expected);
    definition.renderSettings(element(), card, 1, e.helpers);
    assert(e.modes[0].options.some(option => option[0] === "mac_input" && option[1] === "Mic"));
    e.modes[0].onChange.call({ value: "mac_input" });
    assert.equal(card.label, expected);
    e.modes[0].onChange.call({ value: "mac_output" });
    assert.equal(card.label, label === "Desk microphone" ? label : "Volume");
  }
});
