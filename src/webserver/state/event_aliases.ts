import type { EntityEvent } from "./types";

export type SseHandler = (value: string, event: EntityEvent, matchedKey: string) => void;
export type SseHandlers = Record<string, SseHandler>;

export const SSE_ALIAS_GROUPS = {
  clockBar: ["switch-screen__clock_bar", "switch-screen_clock_bar", "switch-clock_bar_enabled"],
  clockBarTime: ["switch-screen__clock_bar_time", "switch-screen_clock_bar_time", "switch-clock_bar_time_enabled"],
  clockBarNightMode: ["switch-screen__clock_bar_night_mode_icon", "switch-screen_clock_bar_night_mode_icon", "switch-clock_bar_night_mode_enabled"],
  networkStatus: ["switch-screen__network_status_icon", "switch-screen_network_status_icon", "switch-network_status_enabled"],
  batteryStatus: ["switch-screen__battery_status", "switch-screen_battery_status", "switch-battery_status_enabled"],
  swipeUpPage: ["switch-screen__swipe_up_page", "switch-screen_swipe_up_page", "switch-swipe_up_page_enabled"],
  subpageTitleBar: ["switch-screen__subpage_title_bar", "switch-screen_subpage_title_bar", "switch-subpage_title_bar_enabled"],
  autoOpenAppSubpages: ["switch-companion__auto_open_app_subpages", "switch-companion_auto_open_app_subpages", "switch-companion_auto_open_app_subpages_enabled"],
  returnHomeOnAppSwitch: ["switch-companion__return_home_on_app_switch", "switch-companion_return_home_on_app_switch", "switch-companion_return_home_on_app_switch_enabled"],
  subpageChevron: ["switch-screen__subpage_chevron", "switch-screen_subpage_chevron", "switch-subpage_chevrons_enabled"],
  screensaverTimeout: ["number-screensaver_timeout", "number-screen_saver__timeout", "number-screen_saver_timeout"],
  clockScreensaver: ["switch-screen_saver__clock", "switch-screen_saver_clock", "switch-clock_screensaver_enabled"],

  cameraDimming: ["number-screen_saver__camera_dimming", "number-screen_saver_camera_dimming", "number-screensaver_camera_dimming"],
  clockDate: ["switch-screen_saver__show_date", "switch-screen_saver_show_date", "switch-clock_screensaver_show_date"],
  clockOverlay: ["switch-screen_saver__clock_overlay", "switch-screen_saver_clock_overlay", "switch-clock_overlay_enabled"],
  metadataOverlay: ["switch-screen_saver__metadata_overlay", "switch-screen_saver_metadata_overlay", "switch-metadata_overlay_enabled"],
  scheduleTrigger: ["text-screen__schedule_trigger", "text-screen_schedule_trigger", "text-schedule_trigger"],
  scheduleSensorActivation: ["select-screen__schedule_sensor_activation", "select-screen_schedule_sensor_activation", "select-schedule_sensor_activation"],
  scheduleWakeTimeout: ["number-screen__schedule_wake_timeout", "number-screen_schedule_wake_timeout", "number-schedule_wake_timeout"],
  scheduleWakeBrightness: ["number-screen__schedule_wake_brightness", "number-screen_schedule_wake_brightness", "number-schedule_wake_brightness"],
  scheduleDimmedBrightness: ["number-screen__schedule_dimmed_brightness", "number-screen_schedule_dimmed_brightness", "number-schedule_dimmed_brightness"],
  scheduleClockBrightness: ["number-screen__schedule_clock_brightness", "number-screen_schedule_clock_brightness", "number-schedule_clock_brightness"],
  scheduleClockTextColor: ["text-screen__schedule_clock_text_color", "text-screen_schedule_clock_text_color", "text-schedule_clock_text_color"],
  screenActiveTimezone: ["text_sensor-screen__active_timezone", "text_sensor-screen_active_timezone", "text_sensor:Screen: Active Timezone"],
  screenLanguage: ["select-screen__language", "select-screen_language"],
  ntpServer1: ["text-screen__ntp_server_1", "text-ntp_server_1"],
  ntpServer2: ["text-screen__ntp_server_2", "text-ntp_server_2"],
  ntpServer3: ["text-screen__ntp_server_3", "text-ntp_server_3"],
  firmwareAutoUpdate: ["switch-firmware__auto_update", "switch-firmware_auto_update", "switch-auto_update_switch"],
  firmwareUpdateFrequency: ["select-firmware__update_frequency", "select-firmware_update_frequency", "select-update_frequency_select"],
  c6FirmwareAutoUpdate: ["switch-wifi_firmware__auto_update", "switch-wifi_firmware_auto_update", "switch-c6_auto_update_switch"],
} as const;

function addSseAliases(handlers: SseHandlers, names: readonly string[], canonical: string): void {
  const handler = handlers[canonical];
  if (!handler) throw new Error(`Missing canonical SSE handler: ${canonical}`);
  for (const name of names) handlers[name] = handler;
}

export function applySseHandlerAliases(handlers: SseHandlers): void {
  addSseAliases(handlers, SSE_ALIAS_GROUPS.clockBar, "switch-screen__clock_bar");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.clockBarTime, "switch-screen__clock_bar_time");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.clockBarNightMode, "switch-screen__clock_bar_night_mode_icon");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.networkStatus, "switch-screen__network_status_icon");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.batteryStatus, "switch-screen__battery_status");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.swipeUpPage, "switch-screen__swipe_up_page");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.subpageTitleBar, "switch-screen__subpage_title_bar");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.autoOpenAppSubpages, "switch-companion__auto_open_app_subpages");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.returnHomeOnAppSwitch, "switch-companion__return_home_on_app_switch");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.subpageChevron, "switch-screen__subpage_chevron");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.screensaverTimeout, "number-screensaver_timeout");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.clockScreensaver, "switch-screen_saver__clock");

  addSseAliases(handlers, SSE_ALIAS_GROUPS.cameraDimming, "number-screen_saver__camera_dimming");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.clockDate, "switch-screen_saver__show_date");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.clockOverlay, "switch-screen_saver__clock_overlay");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.metadataOverlay, "switch-screen_saver__metadata_overlay");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleTrigger, "text-screen__schedule_trigger");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleSensorActivation, "select-screen__schedule_sensor_activation");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleWakeTimeout, "number-screen__schedule_wake_timeout");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleWakeBrightness, "number-screen__schedule_wake_brightness");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleDimmedBrightness, "number-screen__schedule_dimmed_brightness");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleClockBrightness, "number-screen__schedule_clock_brightness");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.scheduleClockTextColor, "text-screen__schedule_clock_text_color");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.screenActiveTimezone, "text_sensor-screen__active_timezone");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.screenLanguage, "select-screen__language");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.ntpServer1, "text-screen__ntp_server_1");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.ntpServer2, "text-screen__ntp_server_2");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.ntpServer3, "text-screen__ntp_server_3");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.firmwareAutoUpdate, "switch-firmware__auto_update");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.firmwareUpdateFrequency, "select-firmware__update_frequency");
  addSseAliases(handlers, SSE_ALIAS_GROUPS.c6FirmwareAutoUpdate, "switch-wifi_firmware__auto_update");
}
