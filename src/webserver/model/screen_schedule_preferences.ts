import {
  screen_schedule_preferences_key, screen_schedule_preferences_version as SCREEN_SCHEDULE_VERSION, read_screen_schedule_preferences,
} from "../generated/panel_settings";
import { normalizeHexColor, normalizeHour, normalizeScheduleClockBrightness,
  normalizeScheduleDimmedBrightness, normalizeScheduleMode, normalizeScheduleTrigger,
  normalizeScheduleWakeBrightness, normalizeScheduleWakeTimeout } from "./settings";

export const SCREEN_SCHEDULE_PREFERENCES = screen_schedule_preferences_key;

export interface ScreenSchedulePreferences {
  scheduleTrigger: string;
  scheduleOnHour: number;
  scheduleOffHour: number;
  scheduleMode: string;
  scheduleWakeTimeout: number;
  scheduleWakeBrightness: number;
  scheduleDimmedBrightness: number;
  scheduleClockBrightness: number;
  scheduleClockTextColor: string;
}

const modes = { screen_off: "off", screen_dimmed: "dim", always_on: "always", clock: "clock" } as const;

export function encodeScreenSchedulePreferences(settings: ScreenSchedulePreferences): string {
  const mode = normalizeScheduleMode(settings.scheduleMode) as keyof typeof modes;
  return [
    SCREEN_SCHEDULE_VERSION, normalizeScheduleTrigger(settings.scheduleTrigger) === "time" ? 1 : 0,
    normalizeHour(settings.scheduleOnHour, 7), normalizeHour(settings.scheduleOffHour, 19),
    modes[mode], normalizeScheduleWakeTimeout(settings.scheduleWakeTimeout),
    normalizeScheduleWakeBrightness(settings.scheduleWakeBrightness),
    normalizeScheduleDimmedBrightness(settings.scheduleDimmedBrightness),
    normalizeScheduleClockBrightness(settings.scheduleClockBrightness),
    normalizeHexColor(settings.scheduleClockTextColor, "FFFFFF"),
  ].join(",");
}

export function decodeScreenSchedulePreferences(raw?: string): ScreenSchedulePreferences | undefined {
  const saved = read_screen_schedule_preferences(raw);
  if (!saved) return;
  const mode = Object.entries(modes).find(([, value]) => value === saved.night_mode)?.[0];
  if (!mode) return;
  return {
    scheduleTrigger: saved.enabled === "1" ? "time" : "disabled",
    scheduleOnHour: saved.on_hour, scheduleOffHour: saved.off_hour, scheduleMode: mode,
    scheduleWakeTimeout: saved.wake_timeout, scheduleWakeBrightness: saved.wake_brightness,
    scheduleDimmedBrightness: saved.dimmed_brightness, scheduleClockBrightness: saved.clock_brightness,
    scheduleClockTextColor: saved.clock_color,
  };
}

export function screenSchedulePreferencesFromState(state: ScreenSchedulePreferences): ScreenSchedulePreferences {
  return {
    scheduleTrigger: state.scheduleTrigger, scheduleOnHour: state.scheduleOnHour,
    scheduleOffHour: state.scheduleOffHour, scheduleMode: state.scheduleMode,
    scheduleWakeTimeout: state.scheduleWakeTimeout, scheduleWakeBrightness: state.scheduleWakeBrightness,
    scheduleDimmedBrightness: state.scheduleDimmedBrightness,
    scheduleClockBrightness: state.scheduleClockBrightness, scheduleClockTextColor: state.scheduleClockTextColor,
  };
}
