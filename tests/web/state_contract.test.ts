import { createInitialState } from "../../src/webserver/state/app_state";
import { SSE_ALIAS_GROUPS, applySseHandlerAliases, type SseHandlers } from "../../src/webserver/state/event_aliases";
import {
  applyClockBarStateValue,
  entityStateKeys,
  isRemovedLegacyStateEvent,
  parseEntityEventData,
  resetStateForConnection,
} from "../../src/webserver/state/event_state";
import { normalizeBackupPanelSettings } from "../../src/webserver/model";
import {
  isC6FirmwareInstallButtonEvent,
  isFirmwareUpdateEvent,
  isFirmwareVersionEvent,
} from "../../src/webserver/state/firmware_events";
import type { DeviceConfig } from "../../src/webserver/state/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function deviceConfig(overrides: Partial<DeviceConfig> = {}): DeviceConfig {
  return {
    slots: 4,
    cols: 2,
    rows: 2,
    screenSize: "test",
    dragMode: "swap",
    dragAnimation: true,
    imageSlotCapacity: 4,
    screen: { width: "100%", aspect: "1/1" },
    ...overrides,
  };
}

export function runStateContractTests(): void {
  const first = createInitialState(deviceConfig({
    timezoneOptions: ["UTC (GMT+0)", "Auto (Home Assistant)"],
    features: { screenRotation: true, screenRotationDefault: "180", screenRotationOptions: ["0", "180"] },
  }));
  const second = createInitialState(deviceConfig());
  equal(first.grid.length, 4, "startup creates one grid slot per device slot");
  equal(first.buttons.length, 4, "startup creates one card per device slot");
  equal(first.buttons[0]?.icon, "Auto", "startup card defaults remain compatible");
  equal(first.screenRotation, "180", "startup uses the device rotation default");
  equal(first.screenRotationInitialReady, false, "rotation-capable devices wait for the initial event");
  equal(first.timezoneOptions.length, 2, "startup copies embedded timezone options");
  equal(first.autoOpenAppSubpages, true, "app subpages open on focus by default");
  equal(first.scheduleEnabled, true, "the night schedule starts enabled");
  equal(first.scheduleTrigger, "time", "the night schedule uses local hours by default");
  equal(first.scheduleOnHour, 7, "daytime starts at 7 AM");
  equal(first.scheduleOffHour, 19, "night time starts at 7 PM");
  equal(first.scheduleMode, "screen_dimmed", "the screen dims overnight by default");
  equal(first.scheduleDimmedBrightness, 15, "default overnight brightness is 15 percent");
  equal(first.returnHomeOnAppSwitch, true, "app switching returns home by default");
  const backupCurrent = {
    timezone: "UTC",
    language: "en",
    clockFormat: "12",
    clockFormatOptions: ["12"],
    ntpDefaults: ["", "", ""],
    ntpServer1: "",
    ntpServer2: "",
    ntpServer3: "",
    autoUpdate: false,
    updateFrequency: "daily",
    updateFrequencyOptions: ["daily"],
    screenRotationOptions: ["0"],
  };
  const restoredCompanionSettings = normalizeBackupPanelSettings({
    auto_open_app_subpages: false,
    return_home_on_app_switch: false,
    subpage_title_bar: false,
    screensaver_mode: "companion",
    cover_art_source: "Mac Companion",
  }, backupCurrent);
  equal(restoredCompanionSettings.autoOpenAppSubpages, false, "backup restore preserves manual app subpages");
  equal(restoredCompanionSettings.returnHomeOnAppSwitch, false, "backup restore preserves staying on an app page");
  equal(normalizeBackupPanelSettings({}, backupCurrent).returnHomeOnAppSwitch, true, "older backups default to returning home");
  equal(restoredCompanionSettings.subpageTitleBar, false, "backup restore preserves hidden subpage title bars");
  equal(normalizeBackupPanelSettings({}, backupCurrent).subpageTitleBar, true, "older backups show subpage title bars by default");
  equal(normalizeBackupPanelSettings({}, backupCurrent).autoOpenAppSubpages, true, "older backups retain automatic app subpages");
  equal(restoredCompanionSettings.screensaverMode, "companion",
    "backup restore preserves Companion screensaver mode");
  assert(!Object.hasOwn(restoredCompanionSettings, "coverArtSource"), "retired cover art settings are ignored");
  first.grid[0] = 9;
  first.buttons[0]!.label = "Changed";
  equal(second.grid[0], 0, "state factories do not share grid arrays");
  equal(second.buttons[0]?.label, "", "state factories do not share card objects");

  equal(SSE_ALIAS_GROUPS.clockBar.join("|"), [
    "switch-screen__clock_bar", "switch-screen_clock_bar", "switch-clock_bar_enabled",
  ].join("|"), "clock-bar aliases retain their compatibility order");
  first.selectedSlots = [1, 2];
  first.lastClickedSlot = 2;
  first.editingSubpage = 3;
  first.subpageSelectedSlots = [4];
  first.subpageLastClicked = 4;
  first.onColor = "ABCDEF";
  resetStateForConnection(first);
  equal(first.selectedSlots.length, 0, "reconnect clears selected main-grid slots");
  equal(first.lastClickedSlot, -1, "reconnect clears the last main-grid slot");
  equal(first.editingSubpage, null, "reconnect exits subpage editing");
  equal(first.subpageSelectedSlots.length, 0, "reconnect clears selected subpage slots");
  equal(first.subpageLastClicked, -1, "reconnect clears the last subpage slot");
  equal(first.onColor, "ABCDEF", "reconnect preserves loaded configuration values");

  const calls: string[] = [];
  const handlers: SseHandlers = {};
  const canonicals: Readonly<Record<keyof typeof SSE_ALIAS_GROUPS, string>> = {
    clockBar: "switch-screen__clock_bar",
    clockBarTime: "switch-screen__clock_bar_time",
    clockBarNightMode: "switch-screen__clock_bar_night_mode_icon",
    networkStatus: "switch-screen__network_status_icon",
    batteryStatus: "switch-screen__battery_status",
    subpageChevron: "switch-screen__subpage_chevron",
    autoOpenAppSubpages: "switch-companion__auto_open_app_subpages",
    returnHomeOnAppSwitch: "switch-companion__return_home_on_app_switch",
    subpageTitleBar: "switch-screen__subpage_title_bar",
    screensaverTimeout: "number-screensaver_timeout",
    clockScreensaver: "switch-screen_saver__clock",

    cameraDimming: "number-screen_saver__camera_dimming",
    clockDate: "switch-screen_saver__show_date",
    clockOverlay: "switch-screen_saver__clock_overlay",
    metadataOverlay: "switch-screen_saver__metadata_overlay",
    scheduleTrigger: "text-screen__schedule_trigger",
    scheduleSensorActivation: "select-screen__schedule_sensor_activation",
    scheduleWakeTimeout: "number-screen__schedule_wake_timeout",
    scheduleWakeBrightness: "number-screen__schedule_wake_brightness",
    scheduleDimmedBrightness: "number-screen__schedule_dimmed_brightness",
    scheduleClockBrightness: "number-screen__schedule_clock_brightness",
    scheduleClockTextColor: "text-screen__schedule_clock_text_color",
    screenActiveTimezone: "text_sensor-screen__active_timezone",
    screenLanguage: "select-screen__language",
    ntpServer1: "text-screen__ntp_server_1",
    ntpServer2: "text-screen__ntp_server_2",
    ntpServer3: "text-screen__ntp_server_3",
    firmwareAutoUpdate: "switch-firmware__auto_update",
    firmwareUpdateFrequency: "select-firmware__update_frequency",
    c6FirmwareAutoUpdate: "switch-wifi_firmware__auto_update",
  };
  for (const [group, canonical] of Object.entries(canonicals)) {
    handlers[canonical] = () => calls.push(group);
  }
  applySseHandlerAliases(handlers);
  handlers["switch-clock_bar_enabled"]?.("ON", {}, "switch-clock_bar_enabled");
  handlers["text-ntp_server_1"]?.("time.example", {}, "text-ntp_server_1");
  equal(calls.join(","), "clockBar,ntpServer1", "legacy aliases dispatch to their canonical handlers");

  for (const [id, state, group] of [
    ["select/Home Assistant Artwork Connection", "Automatic", "homeAssistantArtworkEndpointMode"],
    ["text_sensor/Home Assistant Artwork Endpoint", "Automatic — http://172.16.20.40:8123", "homeAssistantArtworkEndpointStatus"],
    ["text/Home Assistant Artwork Host", "ha.example.test", "homeAssistantArtworkHost"],
  ] as const) {
    const event = { id, state };
    const key = entityStateKeys(event).find(key => handlers[key]);
    assert(!key, "retired artwork endpoints have no live event handler");
  }

  const clockState = createInitialState(deviceConfig());
  applyClockBarStateValue(clockState, "ON", { id: "switch-screen__clock_bar", value: true }, "switch-screen__clock_bar");
  applyClockBarStateValue(clockState, "OFF", { id: "switch-clock_bar_enabled", value: false }, "switch-clock_bar_enabled");
  equal(clockState.clockBarOn, true, "a stale alias cannot turn off an active canonical clock-bar source");
  applyClockBarStateValue(clockState, "OFF", { id: "switch-screen__clock_bar", value: false }, "switch-screen__clock_bar");
  equal(clockState.clockBarOn, false, "the active clock-bar source can turn itself off");

  const nameKeys = entityStateKeys({ name_id: "text_sensor/Screen: Active Timezone" });
  assert(nameKeys.includes("text_sensor-screen__active_timezone"), "slash-form entity events include their object-id alias");
  assert(nameKeys.includes("text_sensor:Screen: Active Timezone"), "slash-form entity events retain their name alias");
  assert(isRemovedLegacyStateEvent("", { id: "text-cover_art_fallback_server" }), "removed fallback-server events remain ignored");

  equal(parseEntityEventData("not json"), null, "malformed event payloads are ignored");
  equal(parseEntityEventData("[]"), null, "array event payloads are ignored");
  equal(parseEntityEventData("null"), null, "null event payloads are ignored");
  const missing = parseEntityEventData("{}");
  assert(missing !== null, "missing optional event fields remain safe to process");
  equal(missing.state, undefined, "missing state remains undefined");

  assert(isFirmwareVersionEvent("", { name_id: "text_sensor/Firmware: Version" }), "firmware version name aliases are recognized");
  assert(isFirmwareUpdateEvent("update-firmware__update", {}), "firmware update object ids are recognized");
  assert(isC6FirmwareInstallButtonEvent("button-firmware_esp32_c6__install_update", {}), "C6 install event aliases are recognized");
}
