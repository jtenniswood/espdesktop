// Generated from product/v2/panel_settings.json. Do not edit.
#pragma once

#include <cstdint>
#include "panel_setting_record.h"

namespace espdesktop::panel_settings {

enum class ScalarSetting : uint8_t {
  SCREEN_CLOCK_BAR,
  SCREEN_CLOCK_BAR_TIME,
  SCREEN_CLOCK_BAR_NIGHT_MODE,
  SCREEN_NETWORK_STATUS_ICON,
  SCREEN_BATTERY_STATUS,
  SCREEN_SUBPAGE_TITLE_BAR,
  SCREEN_SUBPAGE_CHEVRON,
  COMPANION_AUTO_OPEN_APP_SUBPAGES,
  COMPANION_RETURN_HOME_ON_APP_SWITCH,
  SCREEN_DEFAULT_ICON_SIZE,
  SCREEN_CARD_CURVE,
  SCREENSAVER_MODE,
  SCREEN_SAVER_ACTION,
  SCREEN_SAVER_SHOW_DATE,
  SCREENSAVER_TIMEOUT,
  SCREEN_SAVER_DIMMED_BRIGHTNESS,
  SCREEN_SAVER_DAYTIME_DIMMED_BRIGHTNESS,
  SCREEN_SAVER_NIGHTTIME_DIMMED_BRIGHTNESS,
  SCREEN_SAVER_DAYTIME_CLOCK_BRIGHTNESS,
  SCREEN_SAVER_NIGHTTIME_CLOCK_BRIGHTNESS,
  SCREEN_CLOCK_FORMAT,
  SCREEN_LANGUAGE,
  SCREEN_TIMEZONE,
  SCREEN_NTP_SERVER_1,
  SCREEN_NTP_SERVER_2,
  SCREEN_NTP_SERVER_3,
  COUNT
};
struct ScalarRule {
  std::string_view key;
  std::string_view default_value;
  bool (*valid)(std::string_view);
};
inline bool valid_ascii_text(std::string_view value, size_t max_length) {
  if (value.size() > max_length) return false;
  for (const unsigned char ch : value)
    if (ch < 0x20 || ch > 0x7e) return false;
  return true;
}
inline constexpr std::string_view screen_clock_format_choices[] = {
  "12h",
  "24h",
};
inline constexpr std::string_view screen_language_choices[] = {
  "en",
  "cs",
  "da",
  "de",
  "es",
  "fi",
  "fr",
  "he",
  "hu",
  "it",
  "nb",
  "nl",
  "pl",
  "pt",
  "pt-br",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "tr",
  "uk",
};
inline constexpr std::string_view screen_timezone_choices[] = {
  "Pacific/Midway (GMT-11)",
  "Pacific/Pago_Pago (GMT-11)",
  "Pacific/Honolulu (GMT-10)",
  "America/Adak (GMT-10)",
  "America/Anchorage (GMT-9)",
  "America/Juneau (GMT-9)",
  "America/Los_Angeles (GMT-8)",
  "America/Vancouver (GMT-8)",
  "America/Tijuana (GMT-8)",
  "America/Denver (GMT-7)",
  "America/Phoenix (GMT-7)",
  "America/Edmonton (GMT-7)",
  "America/Boise (GMT-7)",
  "America/Chicago (GMT-6)",
  "America/Mexico_City (GMT-6)",
  "America/Winnipeg (GMT-6)",
  "America/Guatemala (GMT-6)",
  "America/Costa_Rica (GMT-6)",
  "America/New_York (GMT-5)",
  "America/Toronto (GMT-5)",
  "America/Detroit (GMT-5)",
  "America/Havana (GMT-5)",
  "America/Bogota (GMT-5)",
  "America/Lima (GMT-5)",
  "America/Jamaica (GMT-5)",
  "America/Panama (GMT-5)",
  "America/Halifax (GMT-4)",
  "America/Caracas (GMT-4)",
  "America/Santiago (GMT-4)",
  "America/La_Paz (GMT-4)",
  "America/Manaus (GMT-4)",
  "America/Barbados (GMT-4)",
  "America/Puerto_Rico (GMT-4)",
  "America/Santo_Domingo (GMT-4)",
  "America/St_Johns (GMT-3:30)",
  "America/Sao_Paulo (GMT-3)",
  "America/Argentina/Buenos_Aires (GMT-3)",
  "America/Montevideo (GMT-3)",
  "America/Paramaribo (GMT-3)",
  "Atlantic/South_Georgia (GMT-2)",
  "Atlantic/Azores (GMT-1)",
  "Atlantic/Cape_Verde (GMT-1)",
  "UTC (GMT+0)",
  "Europe/London (GMT+0)",
  "Europe/Dublin (GMT+0)",
  "Europe/Lisbon (GMT+0)",
  "Africa/Casablanca (GMT+1)",
  "Africa/Accra (GMT+0)",
  "Atlantic/Reykjavik (GMT+0)",
  "Europe/Paris (GMT+1)",
  "Europe/Berlin (GMT+1)",
  "Europe/Rome (GMT+1)",
  "Europe/Madrid (GMT+1)",
  "Europe/Amsterdam (GMT+1)",
  "Europe/Brussels (GMT+1)",
  "Europe/Vienna (GMT+1)",
  "Europe/Zurich (GMT+1)",
  "Europe/Stockholm (GMT+1)",
  "Europe/Oslo (GMT+1)",
  "Europe/Copenhagen (GMT+1)",
  "Europe/Warsaw (GMT+1)",
  "Europe/Prague (GMT+1)",
  "Europe/Budapest (GMT+1)",
  "Europe/Belgrade (GMT+1)",
  "Africa/Lagos (GMT+1)",
  "Africa/Tunis (GMT+1)",
  "Africa/Cairo (GMT+2)",
  "Europe/Athens (GMT+2)",
  "Europe/Bucharest (GMT+2)",
  "Europe/Helsinki (GMT+2)",
  "Europe/Kyiv (GMT+2)",
  "Europe/Istanbul (GMT+3)",
  "Africa/Johannesburg (GMT+2)",
  "Africa/Nairobi (GMT+3)",
  "Asia/Jerusalem (GMT+2)",
  "Asia/Amman (GMT+3)",
  "Asia/Beirut (GMT+2)",
  "Europe/Moscow (GMT+3)",
  "Asia/Baghdad (GMT+3)",
  "Asia/Riyadh (GMT+3)",
  "Asia/Kuwait (GMT+3)",
  "Asia/Qatar (GMT+3)",
  "Africa/Addis_Ababa (GMT+3)",
  "Asia/Tehran (GMT+3:30)",
  "Asia/Dubai (GMT+4)",
  "Asia/Muscat (GMT+4)",
  "Asia/Baku (GMT+4)",
  "Asia/Tbilisi (GMT+4)",
  "Indian/Mauritius (GMT+4)",
  "Asia/Kabul (GMT+4:30)",
  "Asia/Karachi (GMT+5)",
  "Asia/Tashkent (GMT+5)",
  "Asia/Yekaterinburg (GMT+5)",
  "Asia/Kolkata (GMT+5:30)",
  "Asia/Colombo (GMT+5:30)",
  "Asia/Kathmandu (GMT+5:45)",
  "Asia/Dhaka (GMT+6)",
  "Asia/Almaty (GMT+6)",
  "Asia/Rangoon (GMT+6:30)",
  "Asia/Bangkok (GMT+7)",
  "Asia/Jakarta (GMT+7)",
  "Asia/Ho_Chi_Minh (GMT+7)",
  "Asia/Singapore (GMT+8)",
  "Asia/Kuala_Lumpur (GMT+8)",
  "Asia/Shanghai (GMT+8)",
  "Asia/Hong_Kong (GMT+8)",
  "Asia/Taipei (GMT+8)",
  "Asia/Manila (GMT+8)",
  "Australia/Perth (GMT+8)",
  "Asia/Tokyo (GMT+9)",
  "Asia/Seoul (GMT+9)",
  "Asia/Pyongyang (GMT+9)",
  "Australia/Adelaide (GMT+9:30)",
  "Australia/Darwin (GMT+9:30)",
  "Australia/Sydney (GMT+10)",
  "Australia/Melbourne (GMT+10)",
  "Australia/Brisbane (GMT+10)",
  "Australia/Hobart (GMT+10)",
  "Pacific/Guam (GMT+10)",
  "Pacific/Port_Moresby (GMT+10)",
  "Asia/Vladivostok (GMT+10)",
  "Pacific/Noumea (GMT+11)",
  "Pacific/Norfolk (GMT+11)",
  "Asia/Magadan (GMT+11)",
  "Pacific/Auckland (GMT+12)",
  "Pacific/Fiji (GMT+12)",
  "Pacific/Chatham (GMT+12:45)",
  "Pacific/Tongatapu (GMT+13)",
  "Pacific/Apia (GMT+13)",
  "Pacific/Kiritimati (GMT+14)",
  "Auto (Mac Companion)",
};
inline constexpr std::array<ScalarRule, size_t(ScalarSetting::COUNT)> SCALAR_RULES{{
  {"screen_clock_bar", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_clock_bar_time", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_clock_bar_night_mode", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_network_status_icon", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_battery_status", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_subpage_title_bar", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_subpage_chevron", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"companion_auto_open_app_subpages", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"companion_return_home_on_app_switch", "1", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screen_default_icon_size", "Large", [](std::string_view value) { return value == "Small" || value == "Medium" || value == "Large"; }},
  {"screen_card_curve", "Large", [](std::string_view value) { return value == "Small" || value == "Medium" || value == "Large"; }},
  {"screensaver_mode", "disabled", [](std::string_view value) { return value == "disabled" || value == "timer" || value == "companion"; }},
  {"screen_saver_action", "Display Off", [](std::string_view value) { return value == "Display Off" || value == "Screen Dimmed" || value == "Clock"; }},
  {"screen_saver_show_date", "0", [](std::string_view value) { return value == "0" || value == "1"; }},
  {"screensaver_timeout", "1800", [](std::string_view value) { int parsed; return read_integer(value, parsed, 10, 3600); }},
  {"screen_saver_dimmed_brightness", "10", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_daytime_dimmed_brightness", "10", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_nighttime_dimmed_brightness", "10", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_daytime_clock_brightness", "35", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_saver_nighttime_clock_brightness", "35", [](std::string_view value) { int parsed; return read_integer(value, parsed, 1, 100); }},
  {"screen_clock_format", "24h", [](std::string_view value) { for (const auto choice : screen_clock_format_choices) if (value == choice) return true; return false; }},
  {"screen_language", "en", [](std::string_view value) { for (const auto choice : screen_language_choices) if (value == choice) return true; return false; }},
  {"screen_timezone", "Auto (Mac Companion)", [](std::string_view value) { for (const auto choice : screen_timezone_choices) if (value == choice) return true; return false; }},
  {"screen_ntp_server_1", "0.pool.ntp.org", [](std::string_view value) { return valid_ascii_text(value, 100); }},
  {"screen_ntp_server_2", "1.pool.ntp.org", [](std::string_view value) { return valid_ascii_text(value, 100); }},
  {"screen_ntp_server_3", "2.pool.ntp.org", [](std::string_view value) { return valid_ascii_text(value, 100); }},
}};

inline size_t scalar_setting_index(std::string_view key) {
  for (size_t i = 0; i < SCALAR_RULES.size(); ++i)
    if (SCALAR_RULES[i].key == key) return i;
  return SCALAR_RULES.size();
}

inline constexpr std::string_view screen_schedule_preferences_key = "screen_schedule_preferences";
inline constexpr int screen_schedule_preferences_version = 1;

struct ScreenSchedulePreferencesRecord {
  std::string_view enabled{};
  int on_hour{};
  int off_hour{};
  std::string_view night_mode{};
  int wake_timeout{};
  int wake_brightness{};
  int dimmed_brightness{};
  int clock_brightness{};
  std::string_view clock_color{};
};

inline std::optional<ScreenSchedulePreferencesRecord> read_screen_schedule_preferences(std::string_view value) {
  const auto fields = split_fields<10>(value);
  if (!fields || (*fields)[0] != "1") return {};
  ScreenSchedulePreferencesRecord result;
  const auto enabled = (*fields)[1];
  const auto on_hour = (*fields)[2];
  const auto off_hour = (*fields)[3];
  const auto night_mode = (*fields)[4];
  const auto wake_timeout = (*fields)[5];
  const auto wake_brightness = (*fields)[6];
  const auto dimmed_brightness = (*fields)[7];
  const auto clock_brightness = (*fields)[8];
  const auto clock_color = (*fields)[9];
  if ((enabled != "0" && enabled != "1")) return {};
  result.enabled = enabled;
  if (!read_integer(on_hour, result.on_hour, 0, 23)) return {};
  if (!read_integer(off_hour, result.off_hour, 0, 23)) return {};
  if ((night_mode != "off" && night_mode != "dim" && night_mode != "always" && night_mode != "clock")) return {};
  result.night_mode = night_mode;
  if (!read_integer(wake_timeout, result.wake_timeout, 10, 3600)) return {};
  if (!read_integer(wake_brightness, result.wake_brightness, 10, 100)) return {};
  if (!read_integer(dimmed_brightness, result.dimmed_brightness, 1, 100)) return {};
  if (!read_integer(clock_brightness, result.clock_brightness, 1, 100)) return {};
  if (!is_hex(clock_color, 6)) return {};
  result.clock_color = clock_color;
  return result;
}

inline constexpr std::string_view display_theme_preferences_key = "display_theme_preferences";
inline constexpr int display_theme_preferences_version = 1;

struct DisplayThemePreferencesRecord {
  std::string_view mode{};
  std::string_view auto_method{};
  int light_start{};
  int dark_start{};
  int sunrise_offset{};
  int sunset_offset{};
};

inline std::optional<DisplayThemePreferencesRecord> read_display_theme_preferences(std::string_view value) {
  const auto fields = split_fields<7>(value);
  if (!fields || (*fields)[0] != "1") return {};
  DisplayThemePreferencesRecord result;
  const auto mode = (*fields)[1];
  const auto auto_method = (*fields)[2];
  const auto light_start = (*fields)[3];
  const auto dark_start = (*fields)[4];
  const auto sunrise_offset = (*fields)[5];
  const auto sunset_offset = (*fields)[6];
  if ((mode != "dark" && mode != "light" && mode != "auto")) return {};
  result.mode = mode;
  if ((auto_method != "time" && auto_method != "sun")) return {};
  result.auto_method = auto_method;
  if (!read_integer(light_start, result.light_start, 0, 1439)) return {};
  if (!read_integer(dark_start, result.dark_start, 0, 1439)) return {};
  if (!read_integer(sunrise_offset, result.sunrise_offset, -180, 180)) return {};
  if (!read_integer(sunset_offset, result.sunset_offset, -180, 180)) return {};
  return result;
}

}  // namespace espdesktop::panel_settings
