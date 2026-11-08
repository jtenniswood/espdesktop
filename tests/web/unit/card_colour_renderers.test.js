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
  const fields = { cardBadgeLabelHtml() {}, cardBadgePreview() {} };
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
  loadTypescriptTest("src/webserver/cards/action.ts").registerActionCardTypes(
    registry, confirmation, { refreshEntityDatalist() {} }, fields, ui, () => true);
  const webhook = loadTypescriptTest("src/webserver/application/config_webhook_options.ts")
    .createConfigWebhookOptionsFeature();
  loadTypescriptTest("src/webserver/cards/webhook.ts").registerWebhookCardTypes(registry, webhook, fields, ui);
  const saved = {}, inputs = {}, modes = [];
  function field(value = "") { return { field: element(), input: element(value), select: element(value) }; }
  const helpers = {
    idPrefix: "test-",
    saveField(name, value) { saved[name] = value; },
    renderCardModeSelector(_panel, _button, _helpers, metadata) { modes.push(metadata.mode); return field(); },
    renderCardEntityField: () => field(), renderCardTextField: () => field(),
    renderCardNumberField: () => field("50"), renderCardIconPicker: () => element(),
    renderBasicCardFields() {}, requireField() {}, requireEntityDomain() {},
    disclosureSection: () => ({ panel: element(), section: element() }),
    textField(_label, id, value) { const result = field(value); inputs[id] = result.input; return result; },
    selectField(_label, id, _options, value) { const result = field(value); inputs[id] = result.select; return result; },
    toggleRow(_label, id, checked) { const result = { row: element(), input: element() }; result.input.checked = checked; inputs[id] = result.input; return result; },
  };
  return { registry, document, helpers, saved, inputs, modes, lightCards, webhook };
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
        assert.equal(button.options, "card_off_color=00BCD4", `${type}/${sensor}`);
      }
    }
  } finally { global.document = previousDocument; }
});

test("robot and fan mode changes retain the colour in saved options", () => {
  for (const [type, from, to] of [["vacuum", "start_stop", "dock"], ["lawn_mower", "start_mowing", "dock"], ["fan_speed", "", "fan_switch"]]) {
    const e = editor();
    const button = { type, sensor: from, options: "card_off_color=6633B9", icon: "Auto", icon_on: "Auto" };
    e.registry.definitions[type].renderSettings(element(), button, 1, e.helpers);
    e.modes[0].onChange.call({ value: to });
    assert.equal(button.options, "card_off_color=6633B9", type);
    assert.equal(e.saved.options, button.options, type);
  }
});

test("Action mode changes keep the colour while clearing obsolete mode options", () => {
  for (const target of ["input_select.select_option", "local"]) {
    const e = editor();
    const button = { type: "action", sensor: "scene.turn_on", entity: "scene.movie", icon: "Flash", options: "state_entity=sensor.old,card_off_color=00BCD4" };
    e.registry.definitions.action.renderSettingsBeforeLabel(element(), button, 1, e.helpers);
    e.modes[0].onChange.call({ value: target });
    assert.equal(button.sensor, target);
    assert.equal(button.options, "card_off_color=00BCD4", target);
    assert.equal(e.saved.options, button.options, target);
    e.registry.definitions.action.renderSettingsBeforeLabel(element(), button, 1, e.helpers);
    assert.equal(button.options, "card_off_color=00BCD4", target + " reopened");
  }
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

test("Webhook editors preserve colour when reopening and editing or clearing headers", () => {
  for (const method of ["GET", "POST", "DELETE"]) for (const headers of ["", "Content-Type: application/json; X-Test: one,two"]) {
    const e = editor();
    const button = { type: "webhook", sensor: method, entity: "http://panel.test/action", options: "obsolete,card_off_color=00BCD4" };
    e.webhook.setWebhookHeaders(button, headers);
    const definition = e.registry.definitions.webhook;
    for (let reopen = 0; reopen < 2; reopen++) {
      definition.renderSettingsBeforeLabel(element(), button, 1, e.helpers);
      definition.renderSettings(element(), button, 1, e.helpers);
      assert(button.options.includes("card_off_color=00BCD4"), `${method}/${headers}`);
      assert(!button.options.includes("obsolete"));
      assert.equal(e.webhook.webhookHeaders(button), headers);
    }
    for (const edited of ["X-Test: changed,retained", ""]) {
      e.inputs["test-webhook-headers"].value = edited;
      e.inputs["test-webhook-headers"].listeners.change();
      assert(button.options.includes("card_off_color=00BCD4"));
      assert.equal(e.webhook.webhookHeaders(button), edited);
      assert.equal(e.saved.options, button.options);
      definition.renderSettingsBeforeLabel(element(), button, 1, e.helpers);
      definition.renderSettings(element(), button, 1, e.helpers);
      assert.deepEqual(button.options.split(",").sort(), e.saved.options.split(",").sort());
    }
  }
});


test("Volume controls offer microphone and output mute as tap cards and preserve custom labels", () => {
  for (const [mode, id, label, icon] of [
    ["mac_input_mute", "media.input_mute", "Microphone Mute", "Microphone Off"],
    ["mac_output_mute", "media.output_mute", "Output Mute", "Volume Off"],
  ]) {
    for (const custom of ["", "My Audio"]) {
      const e = editor();
      const button = { type: "slider", entity: "media.output_volume", label: custom, icon: "Auto", icon_on: "Auto" };
      const definition = e.registry.definitions.slider;
      definition.renderSettings(element(), button, 1, e.helpers);
      assert(e.modes[0].options.some(option => option[0] === mode));
      e.modes[0].onChange.call({ value: mode });
      assert.equal(button.entity, id);
      assert.equal(button.label, custom || label);
      assert.equal(button.icon, icon);
      const preview = definition.renderPreview(button, e.helpers);
      assert(!JSON.stringify(preview).includes("sp-slider-track"));
      definition.renderSettings(element(), button, 1, e.helpers);
      assert.equal(e.modes.at(-1).value(), mode);
    }
  }
});
