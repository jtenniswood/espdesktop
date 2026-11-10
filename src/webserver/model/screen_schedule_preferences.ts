import { normalizeHexColor, normalizeHour, normalizeScheduleClockBrightness,
  normalizeScheduleDimmedBrightness, normalizeScheduleMode, normalizeScheduleTrigger,
  normalizeScheduleWakeBrightness, normalizeScheduleWakeTimeout } from "./settings";

export const SCREEN_SCHEDULE_PREFERENCES = "screen_schedule_preferences";

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
    1, normalizeScheduleTrigger(settings.scheduleTrigger) === "time" ? 1 : 0,
    normalizeHour(settings.scheduleOnHour, 7), normalizeHour(settings.scheduleOffHour, 19),
    modes[mode], normalizeScheduleWakeTimeout(settings.scheduleWakeTimeout),
    normalizeScheduleWakeBrightness(settings.scheduleWakeBrightness),
    normalizeScheduleDimmedBrightness(settings.scheduleDimmedBrightness),
    normalizeScheduleClockBrightness(settings.scheduleClockBrightness),
    normalizeHexColor(settings.scheduleClockTextColor, "FFFFFF"),
  ].join(",");
}

export function decodeScreenSchedulePreferences(raw?: string): ScreenSchedulePreferences | undefined {
  const fields = raw?.split(",");
  if (!fields || fields.length !== 10) return undefined;
  const [version, enabled, on, off, nightMode, timeout, wake, dim, clock, color] = fields;
  const mode = Object.entries(modes).find(([, value]) => value === nightMode)?.[0];
  const number = (text: string | undefined, low: number, high: number) =>
    !!text && /^\d+$/.test(text) && Number(text) >= low && Number(text) <= high;
  if (version !== "1" || (enabled !== "0" && enabled !== "1") || !mode ||
      !number(on, 0, 23) || !number(off, 0, 23) || !number(timeout, 10, 3600) ||
      !number(wake, 10, 100) || !number(dim, 1, 100) || !number(clock, 1, 100) ||
      !color || !/^[A-F0-9]{6}$/.test(color)) return undefined;
  return {
    scheduleTrigger: enabled === "1" ? "time" : "disabled",
    scheduleOnHour: Number(on), scheduleOffHour: Number(off), scheduleMode: mode,
    scheduleWakeTimeout: Number(timeout), scheduleWakeBrightness: Number(wake),
    scheduleDimmedBrightness: Number(dim), scheduleClockBrightness: Number(clock),
    scheduleClockTextColor: color,
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
