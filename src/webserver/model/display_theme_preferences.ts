import {
  display_theme_preferences_key, display_theme_preferences_version as DISPLAY_THEME_VERSION, read_display_theme_preferences,
} from "../generated/panel_settings";
import { normalizeThemeAutoMethod, normalizeThemeMode, normalizeTimeOfDay, parseThemeSunOffset } from "./settings";

export const DISPLAY_THEME_PREFERENCES = display_theme_preferences_key;

export interface DisplayThemePreferences {
  themeMode: string;
  themeAutoMethod: string;
  themeLightStart: string;
  themeDarkStart: string;
  themeSunriseOffset: number;
  themeSunsetOffset: number;
}

export function encodeDisplayThemePreferences(settings: DisplayThemePreferences): string {
  const minute = (time: string, fallback: string) => {
    const [hours, minutes] = normalizeTimeOfDay(time, fallback).split(":").map(Number);
    return hours! * 60 + minutes!;
  };
  return [
    DISPLAY_THEME_VERSION, normalizeThemeMode(settings.themeMode).toLowerCase(),
    normalizeThemeAutoMethod(settings.themeAutoMethod) === "Time" ? "time" : "sun",
    minute(settings.themeLightStart, "07:00"), minute(settings.themeDarkStart, "20:00"),
    parseThemeSunOffset(settings.themeSunriseOffset) ?? 0, parseThemeSunOffset(settings.themeSunsetOffset) ?? 0,
  ].join(",");
}

export function decodeDisplayThemePreferences(raw?: string): DisplayThemePreferences | undefined {
  const saved = read_display_theme_preferences(raw);
  if (!saved) return;
  const time = (minute: number) => [Math.floor(minute / 60), minute % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
  return {
    themeMode: normalizeThemeMode(saved.mode),
    themeAutoMethod: normalizeThemeAutoMethod(saved.auto_method),
    themeLightStart: time(saved.light_start),
    themeDarkStart: time(saved.dark_start),
    themeSunriseOffset: saved.sunrise_offset,
    themeSunsetOffset: saved.sunset_offset,
  };
}

export function displayThemePreferencesFromState(state: DisplayThemePreferences): DisplayThemePreferences {
  return {
    themeMode: state.themeMode,
    themeAutoMethod: state.themeAutoMethod,
    themeLightStart: state.themeLightStart,
    themeDarkStart: state.themeDarkStart,
    themeSunriseOffset: state.themeSunriseOffset,
    themeSunsetOffset: state.themeSunsetOffset,
  };
}

export function legacyDisplayThemePatch(settings?: Record<string, unknown>): Partial<DisplayThemePreferences> {
  if (!settings) return {};
  const theme: Partial<DisplayThemePreferences> = {};
  if (Object.hasOwn(settings, "theme_mode")) theme.themeMode = normalizeThemeMode(settings.theme_mode);
  if (Object.hasOwn(settings, "theme_auto_method") || settings.theme_mode === "Sun" || settings.theme_mode === "Schedule")
    theme.themeAutoMethod = normalizeThemeAutoMethod(settings.theme_auto_method || settings.theme_mode);
  if (Object.hasOwn(settings, "theme_light_start")) theme.themeLightStart = normalizeTimeOfDay(settings.theme_light_start, "07:00");
  if (Object.hasOwn(settings, "theme_dark_start")) theme.themeDarkStart = normalizeTimeOfDay(settings.theme_dark_start, "20:00");
  const sunrise = parseThemeSunOffset(settings.theme_sunrise_offset);
  const sunset = parseThemeSunOffset(settings.theme_sunset_offset);
  if (sunrise !== null) theme.themeSunriseOffset = sunrise;
  if (sunset !== null) theme.themeSunsetOffset = sunset;
  return theme;
}
