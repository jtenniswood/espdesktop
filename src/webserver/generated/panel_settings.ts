// Generated from product/v2/panel_settings.json. Do not edit.
import { readSettingRecord } from "../model/panel_setting_record";

export const screen_schedule_preferences_key = "screen_schedule_preferences";
export const screen_schedule_preferences_version = 1;
export const read_screen_schedule_preferences = (value?: string) =>
  readSettingRecord(value, screen_schedule_preferences_version, {
    enabled: ["0", "1"],
    on_hour: {"min": 0, "max": 23},
    off_hour: {"min": 0, "max": 23},
    night_mode: ["off", "dim", "always", "clock"],
    wake_timeout: {"min": 10, "max": 3600},
    wake_brightness: {"min": 10, "max": 100},
    dimmed_brightness: {"min": 1, "max": 100},
    clock_brightness: {"min": 1, "max": 100},
    clock_color: {"hex": 6},
  } as const);

export const display_theme_preferences_key = "display_theme_preferences";
export const display_theme_preferences_version = 1;
export const read_display_theme_preferences = (value?: string) =>
  readSettingRecord(value, display_theme_preferences_version, {
    mode: ["dark", "light", "auto"],
    auto_method: ["time", "sun"],
    light_start: {"min": 0, "max": 1439},
    dark_start: {"min": 0, "max": 1439},
    sunrise_offset: {"min": -180, "max": 180},
    sunset_offset: {"min": -180, "max": 180},
  } as const);
