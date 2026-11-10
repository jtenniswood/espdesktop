import { normalizeThemeAutoMethod, normalizeThemeMode, normalizeTimeOfDay, parseThemeSunOffset } from "./settings";

export const DISPLAY_THEME_PREFERENCES = "display_theme_preferences";

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
    1, normalizeThemeMode(settings.themeMode).toLowerCase(),
    normalizeThemeAutoMethod(settings.themeAutoMethod) === "Time" ? "time" : "sun",
    minute(settings.themeLightStart, "07:00"), minute(settings.themeDarkStart, "20:00"),
    parseThemeSunOffset(settings.themeSunriseOffset) ?? 0, parseThemeSunOffset(settings.themeSunsetOffset) ?? 0,
  ].join(",");
}

export function decodeDisplayThemePreferences(raw?: string): DisplayThemePreferences | undefined {
  const fields = raw?.split(",");
  if (!fields || fields.length !== 7) return undefined;
  const [version, mode, method, light, dark, sunrise, sunset] = fields;
  if (version !== "1" || !["dark", "light", "auto"].includes(mode!) || !["time", "sun"].includes(method!))
    return undefined;
  if (![light, dark].every(value => /^\d+$/.test(value!) && Number(value) <= 1439) ||
      ![sunrise, sunset].every(value => /^-?\d+$/.test(value!) && parseThemeSunOffset(value) !== null))
    return undefined;
  const time = (minute: number) => [Math.floor(minute / 60), minute % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
  return {
    themeMode: normalizeThemeMode(mode),
    themeAutoMethod: normalizeThemeAutoMethod(method),
    themeLightStart: time(Number(light)),
    themeDarkStart: time(Number(dark)),
    themeSunriseOffset: Number(sunrise),
    themeSunsetOffset: Number(sunset),
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
