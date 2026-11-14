#ifndef ESPDESKTOP_COVER_ART_H
#define ESPDESKTOP_COVER_ART_H
#pragma once

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <string>

#include "display_color.h"

namespace espdesktop::cover_art {

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

struct AccentPalette {
  uint32_t default_rgb{0};
  uint32_t active_rgb{0};
  bool valid{false};
};

inline AccentPalette make_app_icon_custom_palette(
    uint32_t color_rgb, int red_percent = 100, int green_percent = 100,
    int blue_percent = 100) {
  // User-selected colours are literal. Adapt the foreground instead of
  // darkening the background to keep white text.
  const uint32_t default_rgb = correct_display_color(
      color_rgb, red_percent, green_percent, blue_percent);
  const uint32_t active_rgb = correct_display_color(
      active_card_color(color_rgb), red_percent, green_percent, blue_percent);
  return {default_rgb, active_rgb, true};
}

}  // namespace espdesktop::cover_art
#endif
