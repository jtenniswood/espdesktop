#ifndef ESPDESKTOP_COVER_ART_H
#define ESPDESKTOP_COVER_ART_H
#pragma once

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <initializer_list>
#include <string>

#include "artwork_controller.h"

// Defined by the firmware Home Assistant transport. Keeping this declaration
// lightweight lets host-side Cover Art tests use the controller without
// pulling in ESPHome's generated API types.
inline void ha_schedule_metadata_refresh(
    const std::string &entity_id,
    std::initializer_list<const char *> attributes, uint32_t scope);
inline void ha_cancel_metadata_refresh(uint32_t scope);

namespace espdesktop::cover_art {

constexpr int MAX_DOWNLOAD_RETRIES = 5;
constexpr uint32_t DEFERRED_DOWNLOAD_MS = 100;
constexpr uint32_t CACHED_ARTWORK_DEBOUNCE_MS = 300;
constexpr uint32_t ARTWORK_TRIGGER_DEBOUNCE_MS = 75;
constexpr uint32_t ARTWORK_ATTRIBUTE_RETRY_MS = 1500;
constexpr uint32_t SUBSCRIPTION_RECONCILE_MS = 5000;
constexpr size_t MAX_ARTWORK_URL_LENGTH = 4096;
constexpr int ACCENT_SAMPLE_GRID = 20;

inline std::string normalized_media_source(std::string source) {
  while (!source.empty() && std::isspace(static_cast<unsigned char>(source.front()))) {
    source.erase(source.begin());
  }
  while (!source.empty() && std::isspace(static_cast<unsigned char>(source.back()))) {
    source.pop_back();
  }
  for (char &ch : source) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return source;
}

inline bool external_media_source(const std::string &source) {
  const std::string normalized = normalized_media_source(source);
  return normalized == "tv" || normalized == "line-in" ||
         normalized == "line in" || normalized.rfind("hdmi", 0) == 0;
}

inline bool media_card_artwork_suppressed(bool source_known,
                                          bool external_source) {
  return source_known && external_source;
}

inline bool media_now_playing_artist_visible(bool artist_present,
                                             bool external_source,
                                             bool show_track_details,
                                             bool external_source_fallback) {
  return (show_track_details || external_source_fallback) &&
         (artist_present || external_source);
}

inline bool media_external_source_stale_for_current_content(
    bool external_source, bool source_observed_for_state,
    bool current_content_present) {
  return external_source && !source_observed_for_state &&
         current_content_present;
}

inline bool media_entity_state_usable(const std::string &state) {
  const std::string normalized = normalized_media_source(state);
  return normalized == "playing" || normalized == "paused" ||
         normalized == "buffering";
}

inline bool media_artwork_content_current(bool state_known, bool available,
                                          const std::string &state,
                                          bool artwork_present) {
  return artwork_present && state_known && available &&
         media_entity_state_usable(state);
}

inline bool media_state_change_invalidates_retained_content(
    bool previous_state_known, const std::string &previous_state,
    const std::string &next_state) {
  const std::string normalized_next = normalized_media_source(next_state);
  if (media_entity_state_usable(normalized_next)) return false;
  return !previous_state_known ||
         normalized_media_source(previous_state) != normalized_next;
}

inline bool media_state_change_needs_content_resync(
    bool previous_state_known, const std::string &previous_state,
    const std::string &next_state, bool has_content) {
  return previous_state_known &&
         !media_entity_state_usable(previous_state) &&
         media_entity_state_usable(next_state) && !has_content;
}

inline bool media_card_artwork_should_clear(bool state_known, bool available,
                                            const std::string &state,
                                            bool has_content) {
  return state_known &&
         (!available || (!media_entity_state_usable(state) && !has_content));
}

inline bool media_entity_content_available(bool state_known, bool available,
                                           bool has_content) {
  return state_known && available && has_content;
}

inline bool media_cover_art_idle_placeholder_visible(
    bool state_known, bool available, const std::string &state,
    bool has_content, bool external_source_fallback) {
  return state_known && available && !media_entity_state_usable(state) &&
         !has_content && !external_source_fallback;
}

inline bool use_secondary_media_entity(bool primary_external,
                                       bool secondary_configured,
                                       bool secondary_playback_active,
                                       bool secondary_has_content) {
  return primary_external && secondary_configured && secondary_playback_active &&
         secondary_has_content;
}

struct AccentColor {
  uint8_t red{0};
  uint8_t green{0};
  uint8_t blue{0};
  bool valid{false};
};

inline AccentColor extract_accent_color_rgb565_weighted(
    const uint8_t *data, const uint8_t *alpha, int image_width,
    int image_height, bool big_endian, int content_x, int content_y,
    int content_width, int content_height);

inline AccentColor extract_accent_color_rgb565(
    const uint8_t *data, int image_width, int image_height, bool big_endian,
    int content_x, int content_y, int content_width, int content_height) {
  return extract_accent_color_rgb565_weighted(
      data, nullptr, image_width, image_height, big_endian,
      content_x, content_y, content_width, content_height);
}

inline AccentColor extract_accent_color_rgb565_weighted(
    const uint8_t *data, const uint8_t *alpha, int image_width,
    int image_height, bool big_endian, int content_x, int content_y,
    int content_width, int content_height) {
  if (!data || image_width <= 0 || image_height <= 0) return {};
  if (content_width <= 0 || content_height <= 0 || content_x < 0 || content_y < 0 ||
      content_x > image_width - content_width ||
      content_y > image_height - content_height) {
    content_x = 0;
    content_y = 0;
    content_width = image_width;
    content_height = image_height;
  }

  const int step_x = std::max(1, content_width / ACCENT_SAMPLE_GRID);
  const int step_y = std::max(1, content_height / ACCENT_SAMPLE_GRID);
  int64_t red_weighted = 0;
  int64_t green_weighted = 0;
  int64_t blue_weighted = 0;
  int64_t total_weight = 0;

  for (int y = content_y + step_y / 2; y < content_y + content_height; y += step_y) {
    for (int x = content_x + step_x / 2; x < content_x + content_width; x += step_x) {
      const size_t pixel_index = static_cast<size_t>(y) * image_width + x;
      const uint8_t pixel_alpha = alpha ? alpha[pixel_index] : 255;
      if (pixel_alpha == 0) continue;
      const size_t offset = (static_cast<size_t>(y) * image_width + x) * 2u;
      const uint16_t pixel = big_endian
        ? (static_cast<uint16_t>(data[offset]) << 8) | data[offset + 1]
        : data[offset] | (static_cast<uint16_t>(data[offset + 1]) << 8);
      int red = (pixel >> 11) & 0x1F;
      int green = (pixel >> 5) & 0x3F;
      int blue = pixel & 0x1F;
      red = (red << 3) | (red >> 2);
      green = (green << 2) | (green >> 4);
      blue = (blue << 3) | (blue >> 2);
      const int maximum = std::max(red, std::max(green, blue));
      const int minimum = std::min(red, std::min(green, blue));
      const int saturation = maximum - minimum;
      const int64_t weight =
          static_cast<int64_t>(saturation * saturation + 1) * pixel_alpha;
      red_weighted += static_cast<int64_t>(red) * weight;
      green_weighted += static_cast<int64_t>(green) * weight;
      blue_weighted += static_cast<int64_t>(blue) * weight;
      total_weight += weight;
    }
  }
  if (total_weight <= 0) return {};
  return {
    static_cast<uint8_t>(red_weighted / total_weight),
    static_cast<uint8_t>(green_weighted / total_weight),
    static_cast<uint8_t>(blue_weighted / total_weight),
    true,
  };
}

inline AccentColor extract_accent_color_rgb565a8(
    const uint8_t *data, int image_width, int image_height,
    bool big_endian = false) {
  if (image_width <= 0 || image_height <= 0) return {};
  const uint8_t *alpha = data
      ? data + static_cast<size_t>(image_width) * image_height * 2u
      : nullptr;
  return extract_accent_color_rgb565_weighted(
      data, alpha, image_width, image_height, big_endian,
      0, 0, image_width, image_height);
}

inline AccentColor darken_accent_color(AccentColor color) {
  if (!color.valid) return {};
  color.red = static_cast<uint8_t>(color.red / 3);
  color.green = static_cast<uint8_t>(color.green / 3);
  color.blue = static_cast<uint8_t>(color.blue / 3);
  return color;
}

struct AccentPalette {
  uint32_t default_rgb{0};
  uint32_t active_rgb{0};
  bool neutral{false};
  bool valid{false};
};

constexpr double WHITE_TEXT_MIN_CONTRAST = 4.5;
constexpr int APP_ICON_NEAR_BLACK_MAX = 32;
constexpr int APP_ICON_NEUTRAL_SPREAD_MAX = 24;

inline uint32_t accent_rgb(const AccentColor &color) {
  return (static_cast<uint32_t>(color.red) << 16) |
         (static_cast<uint32_t>(color.green) << 8) | color.blue;
}

inline uint32_t accent_display_corrected_rgb(uint32_t rgb, int red_percent,
                                              int green_percent,
                                              int blue_percent) {
  const auto corrected = [](uint8_t channel, int percent) {
    const int clamped_percent = std::max(0, std::min(percent, 400));
    return static_cast<uint8_t>(std::min(255, channel * clamped_percent / 100));
  };
  return (static_cast<uint32_t>(corrected((rgb >> 16) & 0xFF, red_percent) << 16)) |
         (static_cast<uint32_t>(corrected((rgb >> 8) & 0xFF, green_percent) << 8)) |
         corrected(rgb & 0xFF, blue_percent);
}

inline double accent_srgb_linear_channel(uint8_t channel) {
  const double value = channel / 255.0;
  return value <= 0.04045 ? value / 12.92
                          : std::pow((value + 0.055) / 1.055, 2.4);
}

inline double accent_white_text_contrast(uint32_t corrected_rgb) {
  const double red = accent_srgb_linear_channel((corrected_rgb >> 16) & 0xFF);
  const double green = accent_srgb_linear_channel((corrected_rgb >> 8) & 0xFF);
  const double blue = accent_srgb_linear_channel(corrected_rgb & 0xFF);
  const double luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05);
}

inline uint32_t scale_accent_rgb(uint32_t rgb, int scale_percent) {
  const int clamped_scale = std::max(0, std::min(scale_percent, 100));
  const auto scale = [clamped_scale](uint8_t channel) {
    return static_cast<uint8_t>(channel * clamped_scale / 100);
  };
  return (static_cast<uint32_t>(scale((rgb >> 16) & 0xFF) << 16)) |
         (static_cast<uint32_t>(scale((rgb >> 8) & 0xFF) << 8)) |
         scale(rgb & 0xFF);
}

inline uint32_t accent_darkest_readable_rgb(uint32_t candidate_rgb,
                                           int red_percent,
                                           int green_percent,
                                           int blue_percent) {
  int low = 0;
  int high = 100;
  while (low < high) {
    const int middle = (low + high + 1) / 2;
    const uint32_t corrected = accent_display_corrected_rgb(
        scale_accent_rgb(candidate_rgb, middle), red_percent, green_percent,
        blue_percent);
    if (accent_white_text_contrast(corrected) >= WHITE_TEXT_MIN_CONTRAST)
      low = middle;
    else
      high = middle - 1;
  }
  return accent_display_corrected_rgb(
      scale_accent_rgb(candidate_rgb, low), red_percent, green_percent,
      blue_percent);
}

inline uint32_t accent_brightest_readable_neutral_rgb(int red_percent,
                                                      int green_percent,
                                                      int blue_percent) {
  int low = 0;
  int high = 255;
  while (low < high) {
    const int middle = (low + high + 1) / 2;
    const uint32_t neutral = (middle << 16) | (middle << 8) | middle;
    const uint32_t corrected = accent_display_corrected_rgb(
        neutral, red_percent, green_percent, blue_percent);
    if (accent_white_text_contrast(corrected) >= WHITE_TEXT_MIN_CONTRAST)
      low = middle;
    else
      high = middle - 1;
  }
  const uint32_t neutral = (low << 16) | (low << 8) | low;
  return accent_display_corrected_rgb(neutral, red_percent, green_percent,
                                      blue_percent);
}

inline AccentPalette make_app_icon_accent_palette(
    const AccentColor &accent, int red_percent = 100, int green_percent = 100,
    int blue_percent = 100) {
  if (!accent.valid) return {};
  const int maximum = std::max(accent.red, std::max(accent.green, accent.blue));
  const int minimum = std::min(accent.red, std::min(accent.green, accent.blue));
  const bool neutral = maximum <= APP_ICON_NEAR_BLACK_MAX ||
                       maximum - minimum <= APP_ICON_NEUTRAL_SPREAD_MAX;
  const uint32_t active_rgb = neutral
      ? accent_brightest_readable_neutral_rgb(red_percent, green_percent,
                                              blue_percent)
      : accent_darkest_readable_rgb(accent_rgb(accent), red_percent,
                                    green_percent, blue_percent);
  // Keep the normal card state vivid too. The active color has already been
  // corrected and checked against white text, so scaling it down preserves
  // its hue and contrast while leaving a clear, brighter focused state.
  constexpr int DEFAULT_APP_ICON_COLOR_SCALE_PERCENT = 82;
  const uint32_t default_rgb =
      scale_accent_rgb(active_rgb, DEFAULT_APP_ICON_COLOR_SCALE_PERCENT);
  return {default_rgb, active_rgb, neutral, true};
}

inline AccentPalette make_app_icon_custom_palette(
    uint32_t color_rgb, int red_percent = 100, int green_percent = 100,
    int blue_percent = 100) {
  constexpr int DEFAULT_APP_ICON_COLOR_SCALE_PERCENT = 82;
  const int maximum = std::max((color_rgb >> 16) & 0xFF,
      std::max((color_rgb >> 8) & 0xFF, color_rgb & 0xFF));
  const int minimum = std::min((color_rgb >> 16) & 0xFF,
      std::min((color_rgb >> 8) & 0xFF, color_rgb & 0xFF));
  const uint32_t active_rgb = accent_darkest_readable_rgb(
      color_rgb, red_percent, green_percent, blue_percent);
  const uint32_t default_rgb = scale_accent_rgb(
      active_rgb, DEFAULT_APP_ICON_COLOR_SCALE_PERCENT);
  return {default_rgb, active_rgb,
          maximum <= APP_ICON_NEAR_BLACK_MAX ||
              maximum - minimum <= APP_ICON_NEUTRAL_SPREAD_MAX,
          true};
}

struct RuntimeState {
  espdesktop::artwork::SourceCandidates sources;
  espdesktop::artwork::RefreshBatch artwork_refresh;
  std::string source_url, effective_download_url, active_download_source_url;
  std::string loaded_url, last_good_url, retry_url, fallback_url;
  int retry_count{0};
  bool image_available{false};
  bool refresh_needed{false};

  bool download_active() const { return !active_download_source_url.empty() && !effective_download_url.empty(); }
  bool current_image_loaded() const { return image_available && !source_url.empty() && source_url == loaded_url; }
  bool needs_download() const { return !source_url.empty() && (!image_available || refresh_needed || source_url != loaded_url); }
  void select_source(const std::string &url) {
    if (url == source_url) return;
    source_url = url; refresh_needed = !url.empty(); retry_url.clear(); retry_count = 0;
    if (loaded_url.empty()) image_available = false;
  }
  void begin_download(const std::string &effective_url) {
    active_download_source_url = source_url; effective_download_url = effective_url;
  }
  bool apply_download(const std::string &completed_effective_url) {
    if (completed_effective_url != effective_download_url) return false;
    const std::string completed_source = active_download_source_url;
    effective_download_url.clear(); active_download_source_url.clear();
    if (completed_source.empty()) return false;
    loaded_url = completed_source; last_good_url = completed_source;
    image_available = true; retry_count = 0; retry_url = completed_source;
    refresh_needed = completed_source != source_url; return true;
  }
  bool can_retry() const { return retry_count < MAX_DOWNLOAD_RETRIES; }
  void record_failure() {
    effective_download_url.clear(); active_download_source_url.clear();
    if (retry_url != source_url) { retry_url = source_url; retry_count = 0; }
  }
  bool begin_retry() { if (!can_retry()) return false; ++retry_count; return true; }
  void clear_image() {
    sources.clear();
    artwork_refresh.reset();
    source_url.clear(); effective_download_url.clear(); active_download_source_url.clear(); loaded_url.clear();
    last_good_url.clear();
    retry_url.clear(); fallback_url.clear(); retry_count = 0; image_available = false; refresh_needed = false;
  }
};

struct PolicyInput {
  bool enabled{false}, media_playing{false}, entity_configured{false};
  bool attribute_conditions_match{true}, hide_external_input{false}, external_input_active{false};
  bool schedule_blocks{false}, alarm_takeover_active{false}, voice_interaction_active{false};
};
inline bool policy_allows_feature(const PolicyInput &i) {
  return i.enabled && i.entity_configured && i.attribute_conditions_match && !(i.hide_external_input && i.external_input_active);
}
inline bool policy_allows_download(const PolicyInput &i) { return policy_allows_feature(i); }
inline bool policy_allows_display(const PolicyInput &i) {
  return policy_allows_feature(i) && i.media_playing && !i.schedule_blocks && !i.alarm_takeover_active && !i.voice_interaction_active;
}
inline bool feature_allowed(bool enabled, bool entity_configured, bool conditions_match,
                            bool hide_external_input, bool external_input_active) {
  PolicyInput input;
  input.enabled = enabled;
  input.entity_configured = entity_configured;
  input.attribute_conditions_match = conditions_match;
  input.hide_external_input = hide_external_input;
  input.external_input_active = external_input_active;
  return policy_allows_feature(input);
}
inline bool display_allowed(bool enabled, bool media_playing, bool entity_configured,
                            bool conditions_match, bool hide_external_input,
                            bool external_input_active, bool schedule_blocks,
                            bool alarm_active, bool voice_active) {
  PolicyInput input;
  input.enabled = enabled;
  input.media_playing = media_playing;
  input.entity_configured = entity_configured;
  input.attribute_conditions_match = conditions_match;
  input.hide_external_input = hide_external_input;
  input.external_input_active = external_input_active;
  input.schedule_blocks = schedule_blocks;
  input.alarm_takeover_active = alarm_active;
  input.voice_interaction_active = voice_active;
  return policy_allows_display(input);
}

struct Layout {
  int screen_width, screen_height, art_x, art_y, art_size;
  int accent_x, accent_y, accent_width, accent_height;
  int panel_x, panel_y, panel_width, panel_height, title_max_height, panel_padding;
  bool split;
};
inline bool rotation_is_landscape(const std::string &slug, const std::string &rotation) {
  return slug == "guition-esp32-p4-jc4880p443" ? rotation == "90" || rotation == "270"
                                                : rotation == "0" || rotation == "180";
}
inline Layout cover_art_layout(const std::string &slug, const std::string &rotation,
                               int screen_width, int screen_height, int art_size, int title_height) {
  const bool landscape = rotation_is_landscape(slug, rotation);
  if (slug == "guition-esp32-p4-jc1060p470" || slug == "guition-esp32-p4-jc1060p470-v2") return landscape
    ? Layout{1024,600,0,0,600,585,0,439,600,615,34,377,430,260,0,true}
    : Layout{600,1024,0,0,600,0,600,600,424,30,634,540,360,162,0,true};
  if (slug == "guition-esp32-p4-jc4880p443") return landscape
    ? Layout{800,480,0,0,480,480,0,320,480,504,34,272,330,210,0,true}
    : Layout{480,800,0,0,480,0,480,480,320,24,514,324,262,130,0,true};
  if (slug == "guition-esp32-p4-jc8012p4a1" || slug == "guition-esp32-p4-jc8012p4a1-v2" ||
      slug == "guition-esp32-p4-jc8012p4a1-v3") return landscape
    ? Layout{1280,800,0,0,800,800,0,480,800,840,40,400,720,506,0,true}
    : Layout{800,1280,0,0,800,0,800,800,480,40,834,720,422,216,0,true};
  art_size = std::max(1, std::min(art_size, std::min(screen_width, screen_height)));
  int x = std::max(0, (screen_width - art_size) / 2), y = std::max(0, (screen_height - art_size) / 2);
  return Layout{screen_width,screen_height,x,y,art_size,x,y,art_size,art_size,x,y,art_size,art_size,
                title_height,art_size >= 700 ? 36 : 24,false};
}
inline bool progress_available(float duration) {
  return std::isfinite(duration) && duration > 0.0f;
}
inline int progress_percent(float position, float duration) {
  if (!progress_available(duration) || !std::isfinite(position)) return 0;
  return std::max(0, std::min(100, static_cast<int>((position / duration) * 100.0f + 0.5f)));
}

}  // namespace espdesktop::cover_art
#endif
