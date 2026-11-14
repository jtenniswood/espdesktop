import { PANEL_SCALAR_SETTINGS } from "../generated/panel_settings";

export const APP_SUBPAGE_PREFERENCE = "companion_auto_open_app_subpages";

export function nativeAppSubpagePreference(settings?: Readonly<Record<string, string>>): boolean | undefined {
  const saved = settings?.[APP_SUBPAGE_PREFERENCE];
  return saved === "1" ? true : saved === "0" ? false : undefined;
}

export function normalizeLanguage(value: unknown): string {
  const language = String(value == null ? "" : value).trim().toLowerCase();
  return language || "en";
}

export function normalizeHour(value: unknown, fallback: number): number {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 23) return 23;
  return n;
}

export function normalizeTimeOfDay(value: unknown, fallback: string): string {
  const text = String(value == null ? "" : value).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return fallback;
  const hour = parseInt(match[1] || "", 10);
  const minute = parseInt(match[2] || "", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
}

export function normalizeThemeMode(value: unknown): string {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "light") return "Light";
  if (mode === "auto" || mode === "schedule" || mode === "sun") return "Auto";
  return "Dark";
}

export function normalizeCardCurve(value: unknown): string {
  const preset = String(value || "").trim().toLowerCase();
  const rule = PANEL_SCALAR_SETTINGS.screen_card_curve;
  return rule.choices.find(choice => choice.toLowerCase() === preset) ?? rule.defaultValue;
}

export function cardCurveRadius(baseRadius: number, preset: unknown, radii?: Readonly<Record<string, number>>): number {
  const curve = normalizeCardCurve(preset);
  if (radii?.[curve] !== undefined) return radii[curve];
  return Math.round(baseRadius * (curve === "Small" ? .6 : curve === "Medium" ? .8 : 1));
}

export function normalizeThemeAutoMethod(value: unknown): string {
  const method = String(value || "").trim().toLowerCase();
  return method === "sun" || method === "sunrise / sunset" || method === "sunrise_sunset"
    ? "Sunrise / Sunset" : "Time";
}

export function parseThemeSunOffset(value: unknown): number | null {
  const text = String(value == null ? "" : value).trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const offset = Number(text);
  return Number.isSafeInteger(offset) && offset >= -180 && offset <= 180 ? offset : null;
}

export function normalizeBrightnessMode(value: unknown): string {
  const mode = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (mode === "manual") return "manual";
  if (mode === "fixed" || mode === "fixed_time" || mode === "fixed_times") return "fixed_times";
  return "sunrise_sunset";
}

export function brightnessModeOption(value: unknown): string {
  const mode = normalizeBrightnessMode(value);
  if (mode === "manual") return "Manual";
  if (mode === "fixed_times") return "Fixed times";
  return "Sunrise and sunset";
}

export function normalizeScheduleWakeTimeout(value: unknown): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return 60;
  if (n < 10) return 10;
  if (n > 3600) return 3600;
  return Math.round(n);
}

export function normalizeScheduleWakeBrightness(value: unknown): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return 10;
  if (n < 10) return 10;
  if (n > 100) return 100;
  return Math.round(n);
}

export function normalizeScheduleClockBrightness(value: unknown): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return 10;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return Math.round(n);
}

export function normalizeHexColor(value: unknown, fallback: string): string {
  const color = String(value == null ? "" : value).replace(/^#/, "").trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(color) ? color : fallback;
}

export function normalizeScheduleDimmedBrightness(value: unknown): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return 10;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return Math.round(n);
}

export function normalizeScheduleMode(value: unknown): string {
  const mode = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (mode === "screen_dimmed" || mode === "dimmed" || mode === "always_on" || mode === "always") {
    return "screen_dimmed";
  }
  if (mode === "clock") return "clock";
  return "screen_off";
}

export function normalizeScheduleTrigger(value: unknown, scheduleEnabled = false): string {
  const trigger = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (trigger === "sensor") return "disabled";
  if (trigger === "time" || trigger === "timer") return "time";
  if (trigger === "disabled" || trigger === "off") return "disabled";
  return scheduleEnabled ? "time" : "disabled";
}

export function normalizeScheduleSensorActivation(value: unknown): string {
  const activation = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  return activation === "on" || activation === "sensor_on" ? "on" : "off";
}

export function scheduleSensorActivationOption(value: unknown): string {
  return normalizeScheduleSensorActivation(value) === "on" ? "Sensor On" : "Sensor Off";
}

export function normalizeScreensaverAction(value: unknown): string {
  const action = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (action === "screen_dimmed" || action === "dimmed" || action === "dim") return "dim";
  if (action === "clock") return "clock";
  return "off";
}

export function screensaverActionOption(value: unknown): string {
  const action = normalizeScreensaverAction(value);
  if (action === "dim") return "Screen Dimmed";
  if (action === "clock") return "Clock";
  return "Display Off";
}

export function normalizeScreensaverCameraDimming(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

export function normalizeScreensaverCameraImageMode(value: unknown): string {
  return String(value || "").trim().toLowerCase() === "fill" ? "Fill" : "Fit";
}

export function scheduleModeOption(value: unknown): string {
  const mode = normalizeScheduleMode(value);
  if (mode === "screen_dimmed") return "Screen Dimmed";
  if (mode === "clock") return "Clock";
  return "Screen off";
}

export function normalizeClockBrightness(value: unknown, fallback: number): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return Math.round(n);
}

export function normalizeScreensaverDimmedBrightness(value: unknown): number {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return 10;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return Math.round(n);
}

export function normalizeHomeAssistantArtworkPort(value: unknown): number {
  const port = parseInt(String(value), 10);
  if (!Number.isFinite(port)) return 8123;
  if (port < 1) return 1;
  if (port > 65535) return 65535;
  return port;
}

export function normalizeHomeAssistantArtworkProtocol(value: unknown): string {
  return String(value || "").trim().toLowerCase() === "https" ? "https" : "http";
}

export function normalizeHomeAssistantArtworkHost(value: unknown): string {
  return String(value == null ? "" : value).trim().slice(0, 253);
}

export function normalizeHomeAssistantArtworkEndpointMode(
  value: unknown,
  protocol: unknown = "http",
  port: unknown = 8123,
): string {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "automatic") return "Automatic";
  if (mode === "manual") return "Manual";
  return normalizeHomeAssistantArtworkProtocol(protocol) === "http" &&
    normalizeHomeAssistantArtworkPort(port) === 8123
    ? "Automatic"
    : "Manual";
}

export function normalizeNtpServer(value: unknown, fallback: string): string {
  const server = String(value == null ? "" : value).trim();
  return server || fallback;
}

export interface BackupScreenSettingsState {
  brightnessDayVal: number;
  brightnessNightVal: number;
  brightnessMode: string;
  manualBrightnessVal: number;
  brightnessDawnTime: string;
  brightnessDuskTime: string;
  scheduleTrigger: string;
  scheduleEnabled: boolean;
  scheduleSensorActivation: string;
  scheduleSensorEntity: string;
  scheduleOnHour: number;
  scheduleOffHour: number;
  scheduleMode: string;
  scheduleWakeTimeout: number;
  scheduleWakeBrightness: number;
  scheduleDimmedBrightness: number;
  scheduleClockBrightness: number;
  scheduleClockTextColor: string;
}

function numberOrFallback(value: unknown, fallback: number): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function objectValue(source: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
}

export function normalizeBackupScreenSettings(
  screenSettings: Record<string, unknown>,
  current: Partial<BackupScreenSettingsState>,
  legacyPresenceSensorEntity = "",
): BackupScreenSettingsState {
  const legacyScheduleEnabled = !!screenSettings.schedule_enabled;
  const scheduleTrigger = normalizeScheduleTrigger(screenSettings.schedule_trigger, legacyScheduleEnabled);
  const brightnessMode = objectValue(screenSettings, "brightness_mode") != null
    ? normalizeBrightnessMode(screenSettings.brightness_mode)
    : objectValue(screenSettings, "automatic_brightness") != null && !screenSettings.automatic_brightness
      ? "fixed_times"
      : "sunrise_sunset";
  return {
    brightnessDayVal: numberOrFallback(screenSettings.brightness_day, 100),
    brightnessNightVal: numberOrFallback(screenSettings.brightness_night, 75),
    brightnessMode,
    manualBrightnessVal: numberOrFallback(
      screenSettings.manual_brightness,
      numberOrFallback(current.manualBrightnessVal, 100),
    ),
    brightnessDawnTime: normalizeTimeOfDay(screenSettings.brightness_dawn_time, "06:00"),
    brightnessDuskTime: normalizeTimeOfDay(screenSettings.brightness_dusk_time, "18:00"),
    scheduleTrigger,
    scheduleEnabled: scheduleTrigger !== "disabled",
    scheduleSensorActivation: normalizeScheduleSensorActivation(
      objectValue(screenSettings, "schedule_sensor_activation") != null
        ? screenSettings.schedule_sensor_activation
        : current.scheduleSensorActivation,
    ),
    scheduleSensorEntity: objectValue(screenSettings, "schedule_sensor_entity") !== undefined
      ? String(screenSettings.schedule_sensor_entity || "")
      : legacyPresenceSensorEntity,
    scheduleOnHour: normalizeHour(screenSettings.schedule_on_hour, 6),
    scheduleOffHour: normalizeHour(screenSettings.schedule_off_hour, 23),
    scheduleMode: normalizeScheduleMode(screenSettings.schedule_mode),
    scheduleWakeTimeout: normalizeScheduleWakeTimeout(screenSettings.schedule_wake_timeout),
    scheduleWakeBrightness: normalizeScheduleWakeBrightness(
      objectValue(screenSettings, "schedule_wake_brightness") != null
        ? screenSettings.schedule_wake_brightness
        : current.scheduleWakeBrightness,
    ),
    scheduleDimmedBrightness: normalizeScheduleDimmedBrightness(
      objectValue(screenSettings, "schedule_dimmed_brightness") != null
        ? screenSettings.schedule_dimmed_brightness
        : current.scheduleDimmedBrightness,
    ),
    scheduleClockBrightness: normalizeScheduleClockBrightness(
      objectValue(screenSettings, "schedule_clock_brightness") != null
        ? screenSettings.schedule_clock_brightness
        : current.scheduleClockBrightness,
    ),
    scheduleClockTextColor: normalizeHexColor(
      objectValue(screenSettings, "schedule_clock_text_color") != null
        ? screenSettings.schedule_clock_text_color
        : current.scheduleClockTextColor,
      "FFFFFF",
    ),
  };
}

export interface BackupPanelSettingsCurrent {
  timezone: string;
  language: string;
  clockFormat: string;
  clockFormatOptions: readonly string[];
  ntpDefaults: readonly string[];
  ntpServer1: string;
  ntpServer2: string;
  ntpServer3: string;
  autoUpdate: boolean;
  updateFrequency: string;
  updateFrequencyOptions: readonly string[];
  screenRotationOptions: readonly string[];
}

export interface BackupPanelSettingsState {
  clockBar: boolean;
  clockBarTime: boolean;
  clockBarNightMode: boolean;
  networkStatusIcon: boolean;

  subpageChevron: boolean;
  autoOpenAppSubpages: boolean;
  returnHomeOnAppSwitch: boolean;
  subpageTitleBar: boolean;
  timezone: string;
  language: string;
  clockFormat: string;
  hasNtpServer1: boolean;
  hasNtpServer2: boolean;
  hasNtpServer3: boolean;
  ntpServer1: string;
  ntpServer2: string;
  ntpServer3: string;
  screensaverMode: string;
  presenceSensorEntity: string;
  screensaverCameraEntity: string;
  screensaverMetadataEntity: string;
  metadataOverlay: boolean;
  screensaverCameraImageMode: string;
  screensaverCameraDimming: number;
  clockDate: boolean;
  clockOverlay: boolean;
  autoUpdate: boolean;
  updateFrequency: string;
  screensaverAction: string;
  clockScreensaver: boolean;
  clockBrightnessDay: number;
  clockBrightnessNight: number;
  screensaverDimmedBrightness: number;
  screensaverDimmedBrightnessDay: number;
  screensaverDimmedBrightnessNight: number;
  screensaverTimeout: unknown;
  screenRotation: string;
}

export function normalizeScreensaverMode(value: unknown): string {
  const mode = String(value || "disabled");
  return mode === "timer" || mode === "companion" || mode === "disabled" ? mode : "disabled";
}

function normalizeScreenRotationValue(value: unknown, options: readonly string[]): string {
  const rotation = String(value == null ? "" : value);
  return options.indexOf(rotation) !== -1 ? rotation : "0";
}

function normalizeUpdateFrequency(value: unknown, options: readonly string[], fallback: string): string {
  const frequency = String(value == null ? "" : value);
  return options.indexOf(frequency) !== -1 ? frequency : fallback;
}

export function normalizeTimezoneOption(value: unknown, fallback: string): string {
  return value === "Auto (Home Assistant)" ? "Auto (Mac Companion)" : String(value || fallback);
}

export function normalizeBackupPanelSettings(
  settings: Record<string, unknown>,
  current: BackupPanelSettingsCurrent,
): BackupPanelSettingsState {
  const hasNtpServer1 = objectValue(settings, "ntp_server_1") !== undefined;
  const hasNtpServer2 = objectValue(settings, "ntp_server_2") !== undefined;
  const hasNtpServer3 = objectValue(settings, "ntp_server_3") !== undefined;
  const clockFormat = current.clockFormatOptions.indexOf(String(settings.clock_format || "")) !== -1
    ? String(settings.clock_format)
    : current.clockFormat;
  const screensaverAction = normalizeScreensaverAction(
    objectValue(settings, "screensaver_action") != null
      ? settings.screensaver_action
      : (settings.clock_screensaver ? "clock" : "off"),
  );
  const clockBrightnessDay = normalizeClockBrightness(
    objectValue(settings, "clock_brightness_day") != null ? settings.clock_brightness_day : settings.clock_brightness,
    35,
  );
  const clockBrightnessNight = normalizeClockBrightness(
    objectValue(settings, "clock_brightness_night") != null ? settings.clock_brightness_night : settings.clock_brightness,
    clockBrightnessDay,
  );
  const screensaverDimmedBrightness = normalizeScreensaverDimmedBrightness(
    settings.screensaver_dimmed_brightness,
  );
  const screensaverDimmedBrightnessDay = normalizeScreensaverDimmedBrightness(
    objectValue(settings, "screensaver_dimmed_brightness_day") != null
      ? settings.screensaver_dimmed_brightness_day
      : screensaverDimmedBrightness,
  );
  const screensaverDimmedBrightnessNight = normalizeScreensaverDimmedBrightness(
    objectValue(settings, "screensaver_dimmed_brightness_night") != null
      ? settings.screensaver_dimmed_brightness_night
      : screensaverDimmedBrightnessDay,
  );
  return {
    clockBar: objectValue(settings, "clock_bar") != null ? !!settings.clock_bar : false,
    clockBarTime: objectValue(settings, "clock_bar_time") != null ? !!settings.clock_bar_time : true,
    clockBarNightMode: objectValue(settings, "clock_bar_night_mode") != null ? !!settings.clock_bar_night_mode : false,
    networkStatusIcon: objectValue(settings, "network_status_icon") != null ? !!settings.network_status_icon : true,

    subpageTitleBar: objectValue(settings, "subpage_title_bar") != null ? !!settings.subpage_title_bar : true,
    autoOpenAppSubpages: objectValue(settings, "auto_open_app_subpages") != null
      ? !!settings.auto_open_app_subpages
      : true,
    returnHomeOnAppSwitch: objectValue(settings, "return_home_on_app_switch") != null
      ? !!settings.return_home_on_app_switch
      : true,
    subpageChevron: objectValue(settings, "subpage_chevron") != null
      ? !!settings.subpage_chevron
      : true,
    timezone: normalizeTimezoneOption(settings.timezone, current.timezone),
    language: normalizeLanguage(settings.language || current.language),
    clockFormat,
    hasNtpServer1,
    hasNtpServer2,
    hasNtpServer3,
    ntpServer1: hasNtpServer1
      ? normalizeNtpServer(settings.ntp_server_1, current.ntpDefaults[0] || "")
      : current.ntpServer1,
    ntpServer2: hasNtpServer2
      ? normalizeNtpServer(settings.ntp_server_2, current.ntpDefaults[1] || "")
      : current.ntpServer2,
    ntpServer3: hasNtpServer3
      ? normalizeNtpServer(settings.ntp_server_3, current.ntpDefaults[2] || "")
      : current.ntpServer3,
    screensaverMode: normalizeScreensaverMode(settings.screensaver_mode),
    presenceSensorEntity: String(settings.presence_sensor_entity || ""),
    screensaverCameraEntity: String(settings.screensaver_camera_entity || ""),
    screensaverCameraDimming: normalizeScreensaverCameraDimming(settings.screensaver_camera_dimming),
    screensaverMetadataEntity: String(settings.screensaver_metadata_entity || ""),
    metadataOverlay: objectValue(settings, "metadata_overlay") != null
      ? !!settings.metadata_overlay
      : String(settings.screensaver_metadata_entity || "").startsWith("sensor."),
    screensaverCameraImageMode: normalizeScreensaverCameraImageMode(
      settings.screensaver_camera_image_mode,
    ),
    clockDate: !!settings.clock_date,
    clockOverlay: objectValue(settings, "clock_overlay") != null
      ? !!settings.clock_overlay
      : false,
    autoUpdate: objectValue(settings, "firmware_auto_update") != null
      ? !!settings.firmware_auto_update
      : current.autoUpdate,
    updateFrequency: objectValue(settings, "firmware_update_frequency") != null
      ? normalizeUpdateFrequency(
        settings.firmware_update_frequency,
        current.updateFrequencyOptions,
        current.updateFrequency,
      )
      : current.updateFrequency,
    screensaverAction,
    clockScreensaver: screensaverAction === "clock",
    clockBrightnessDay,
    clockBrightnessNight,
    screensaverDimmedBrightness,
    screensaverDimmedBrightnessDay,
    screensaverDimmedBrightnessNight,
    screensaverTimeout: settings.screensaver_timeout || 300,
    screenRotation: normalizeScreenRotationValue(settings.screen_rotation, current.screenRotationOptions),
  };
}
