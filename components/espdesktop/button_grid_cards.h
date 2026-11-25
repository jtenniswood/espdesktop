#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#include "instant_button_style.h"
#include "companion_controls.h"
#ifdef USE_COMPANION
#include "../companion/app_icon_store.h"
#include "app_icon_layout.h"
#include "app_icon_resampler.h"
#include "cover_art.h"
#include "esphome/core/version.h"

template<typename T>
inline T *grid_track_runtime_allocation(lv_obj_t *owner, T *ptr);

namespace esphome::companion {
void request_app_icon(const std::string &application_id,
                      const std::string &computer_id);
}

struct CompanionAppIconImageData {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_image_dsc_t descriptor{};
#else
  lv_img_dsc_t descriptor{};
#endif
  esphome::RAMAllocator<uint8_t> pixel_allocator{
      esphome::RAMAllocator<uint8_t>::ALLOC_EXTERNAL};
  uint8_t *pixels = nullptr;
  uint8_t *display_pixels = nullptr;
  int display_side = 0;
  size_t display_bytes = 0;
  espdesktop::app_icon::Insets artwork_insets{};
  bool artwork_insets_ready = false;
  std::array<uint8_t, 32> loaded_hash{};
  bool loaded_hash_valid = false;
  bool rendered_online = false;
  bool refresh_pending = false;
  bool refit_pending = false;

  bool prepare_pixels(const std::string &id) {
    std::array<uint8_t, 32> hash{};
    if (!esphome::companion::app_icon_store().hash_for(id, &hash)) return false;
    if (!pixels) pixels = pixel_allocator.allocate(esphome::companion::APP_ICON_PIXEL_BYTES);
    return pixels != nullptr;
  }
  lv_obj_t *fallback_icon = nullptr;
  lv_obj_t *card_label = nullptr;
  bool compact_icon = false;
  std::string application_id;
  // The computer the card is bound to; its companion is the icon source.
  std::string computer_id;
  espdesktop::cover_art::AccentPalette accent_palette{};
  uint32_t custom_background_rgb = 0;
  std::string custom_background_option;
  uint32_t fallback_default_rgb = 0;
  uint32_t fallback_active_rgb = 0;
  int color_correction_red_percent = 100;
  int color_correction_green_percent = 100;
  int color_correction_blue_percent = 100;
  bool app_icon_mode = false;
  bool companion_online = false;
  bool custom_background = false;
  bool explicit_active = false;
  bool image_loaded = false;
  bool card_palette_ready = false;
  bool palette_applied = false;
  bool layout_updating = false;

  void release_display_pixels() {
    if (display_pixels) pixel_allocator.deallocate(display_pixels, display_bytes);
    display_pixels = nullptr;
    display_side = 0;
    display_bytes = 0;
  }

  void release_source_pixels() {
    if (pixels) pixel_allocator.deallocate(pixels, esphome::companion::APP_ICON_PIXEL_BYTES);
    pixels = nullptr;
  }

  void release_pixels() {
    release_display_pixels();
    release_source_pixels();
    descriptor.data = nullptr;
    image_loaded = false;
    loaded_hash_valid = false;
  }

  ~CompanionAppIconImageData() {
    release_display_pixels();
    if (pixels) pixel_allocator.deallocate(pixels, esphome::companion::APP_ICON_PIXEL_BYTES);
  }
};

inline bool companion_apply_cached_app_icon(CompanionAppIconImageData &source, lv_obj_t *image);
inline lv_obj_t *grid_find_companion_app_icon_image(lv_obj_t *owner);
inline void companion_refresh_cached_app_icon(const std::string &application_id);

inline void companion_apply_app_icon_card_palette(
    CompanionAppIconImageData &source, lv_obj_t *button) {
  // Default-colour cards are owned by the live theme. Reconnects and icon
  // refreshes must not restore fallback colours captured before a theme change.
  if (!button || !source.card_palette_ready) return;
  if (!source.custom_background && !source.explicit_active) return;
  const bool use_accent = !source.explicit_active && source.app_icon_mode && source.companion_online &&
                          source.image_loaded && source.accent_palette.valid;
  const uint32_t default_rgb = use_accent
      ? source.accent_palette.default_rgb : source.fallback_default_rgb;
  const uint32_t active_rgb = source.explicit_active
      ? source.fallback_active_rgb
      : (use_accent ? source.accent_palette.active_rgb : source.fallback_active_rgb);
  apply_button_colors(button, true, active_rgb, true, default_rgb);
  sync_card_checked_text_color(button);
  source.palette_applied = true;
}

inline void companion_update_app_icon_card_palette(
    CompanionAppIconImageData &source, lv_obj_t *button, bool app_icon_mode,
    uint32_t fallback_default_rgb, uint32_t fallback_active_rgb,
    int correction_red_percent, int correction_green_percent,
    int correction_blue_percent, const std::string &custom_color,
    bool companion_online, bool explicit_active = false) {
  source.app_icon_mode = app_icon_mode;
  source.companion_online = companion_online;
  source.explicit_active = explicit_active;
  source.fallback_default_rgb = fallback_default_rgb;
  source.fallback_active_rgb = fallback_active_rgb;
  source.color_correction_red_percent = correction_red_percent;
  source.color_correction_green_percent = correction_green_percent;
  source.color_correction_blue_percent = correction_blue_percent;
  source.card_palette_ready = true;
  source.custom_background_option = custom_color;
  source.custom_background = custom_color.size() == 6;
  source.custom_background_rgb = 0;
  if (source.custom_background) {
    for (const char ch : custom_color) {
      source.custom_background_rgb <<= 4;
      if (ch >= '0' && ch <= '9') source.custom_background_rgb |= ch - '0';
      else if (ch >= 'a' && ch <= 'f') source.custom_background_rgb |= ch - 'a' + 10;
      else if (ch >= 'A' && ch <= 'F') source.custom_background_rgb |= ch - 'A' + 10;
      else { source.custom_background = false; source.custom_background_rgb = 0; break; }
    }
  }
  if (!explicit_active && app_icon_mode && source.image_loaded && companion_online && source.custom_background) {
    source.accent_palette = espdesktop::cover_art::make_app_icon_custom_palette(
        source.custom_background_rgb, correction_red_percent,
        correction_green_percent, correction_blue_percent);
  } else {
    source.accent_palette = {};
  }
  companion_apply_app_icon_card_palette(source, button);
}

inline void companion_refresh_app_icon_connection_state(bool online);

inline void companion_layout_card_app_icon(CompanionAppIconImageData &source, lv_obj_t *image) {
  if (!image || !source.app_icon_mode || !source.image_loaded || (!source.pixels && !source.display_pixels) || source.layout_updating) return;
  lv_obj_t *button = lv_obj_get_parent(image);
  const int width = lv_obj_get_content_width(button);
  const int height = lv_obj_get_content_height(button);
  const lv_font_t *font = source.fallback_icon
      ? lv_obj_get_style_text_font(source.fallback_icon, LV_PART_MAIN) : nullptr;
  const int small_side = font ? font->line_height : 48;
  const int gap = std::max(3, small_side / 4);
  const int label_height = source.card_label && !lv_obj_has_flag(source.card_label, LV_OBJ_FLAG_HIDDEN)
      ? lv_obj_get_height(source.card_label) : 0;
  constexpr int canvas = esphome::companion::APP_ICON_SIDE;
  if (!source.artwork_insets_ready && source.pixels) {
    source.artwork_insets = espdesktop::app_icon::artwork_insets(
        source.pixels + canvas * canvas * 2, canvas, source.compact_icon);
    source.artwork_insets_ready = true;
  }
  const auto insets = source.artwork_insets;
  const int fitted = espdesktop::app_icon::fit_side(width, height, label_height, gap, canvas, insets);
  const int side = source.compact_icon
      ? std::min(fitted, small_side * canvas / std::max(1, canvas - static_cast<int>(insets.left + insets.right)))
      : fitted;
  source.layout_updating = true;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  if (source.display_side != side && !source.pixels) {
    // Hidden pages retain only their finished image. A real size change needs
    // the original again; unchanged layout events never read flash or rescale.
    source.layout_updating = false;
    companion_apply_cached_app_icon(source, image);
    return;
  }
  if (source.display_side != side) {
    source.release_display_pixels();
    const size_t bytes = static_cast<size_t>(side) * side * 3;
    source.display_pixels = source.pixel_allocator.allocate(bytes);
    if (source.display_pixels) {
      source.display_bytes = bytes;
      espdesktop::app_icon::resize_pixels(source.pixels, canvas, source.display_pixels, side);
      source.display_side = side;
    }
    source.descriptor.header.w = source.display_pixels ? side : canvas;
    source.descriptor.header.h = source.descriptor.header.w;
    source.descriptor.header.stride = source.descriptor.header.w * 2;
    source.descriptor.data_size = source.display_pixels ? bytes : esphome::companion::APP_ICON_PIXEL_BYTES;
    source.descriptor.data = source.display_pixels ? source.display_pixels : source.pixels;
    lv_image_set_src(image, &source.descriptor);
  }
  lv_image_set_antialias(image, true);
#endif
  const int compensation = width_compensation_scale(icon_width_compensation_percent());
  const bool vertical = width_compensation_vertical_axis();
  const int corrected_side = (side * compensation + 128) / 256;
  lv_obj_set_size(image, side, side);
  lv_obj_align(image, LV_ALIGN_TOP_LEFT,
      -(insets.left * (vertical ? side : corrected_side) + canvas / 2) / canvas,
      -(insets.top * (vertical ? corrected_side : side) + canvas / 2) / canvas);
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  if (compensation == 256) {
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CONTAIN);
  } else {
    // Scale the bitmap directly so LVGL does not allocate a transformed layer.
    const int zoom = std::max(1, side * 256 / source.descriptor.header.w);
    const int corrected_zoom = std::max(1, zoom * compensation / 256);
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_TOP_LEFT);
    lv_image_set_pivot(image, 0, 0);
    lv_image_set_scale_x(image, vertical ? zoom : corrected_zoom);
    lv_image_set_scale_y(image, vertical ? corrected_zoom : zoom);
  }
#else
  lv_img_set_zoom(image, static_cast<uint16_t>(std::min<uint32_t>(
      (static_cast<uint32_t>(side) * 256u + canvas - 1u) / canvas, UINT16_MAX)));
  apply_width_compensation(image, icon_width_compensation_percent());
#endif
  // Faint icon shadows can extend beyond the fitted artwork into the label.
  if (source.card_label) lv_obj_move_foreground(source.card_label);
  // Finished pixels are sufficient on visible pages too. Keeping every
  // 240x240 original until navigation consumes drawing headroom during boot.
  // A later size/connection change reloads the original from the icon store.
  if (source.display_pixels && source.descriptor.data == source.display_pixels) {
    source.release_source_pixels();
  }
  source.layout_updating = false;
}

inline void companion_app_icon_layout_changed(lv_event_t *event) {
  auto *image = static_cast<lv_obj_t *>(lv_event_get_user_data(event));
  auto *source = static_cast<CompanionAppIconImageData *>(lv_obj_get_user_data(image));
  if (source) companion_layout_card_app_icon(*source, image);
}

inline void companion_track_app_icon_layout(lv_obj_t *button, lv_obj_t *label, lv_obj_t *image) {
  lv_obj_add_event_cb(button, companion_app_icon_layout_changed, LV_EVENT_LAYOUT_CHANGED, image);
  lv_obj_add_event_cb(button, companion_app_icon_layout_changed, LV_EVENT_SIZE_CHANGED, image);
  // Text updates resize the label without bubbling a size event to its card.
  if (label) lv_obj_add_event_cb(label, companion_app_icon_layout_changed, LV_EVENT_SIZE_CHANGED, image);
}

inline bool companion_apply_cached_app_icon(CompanionAppIconImageData &source, lv_obj_t *image) {
  if (image && lv_obj_get_screen(image) != lv_scr_act()) {
    lv_obj_add_flag(image, LV_OBJ_FLAG_HIDDEN);
    source.release_pixels();
    source.accent_palette = {};
    if (source.fallback_icon) lv_obj_clear_flag(source.fallback_icon, LV_OBJ_FLAG_HIDDEN);
    companion_apply_app_icon_card_palette(source, lv_obj_get_parent(image));
    return false;
  }
  if (!image || source.application_id.empty() || !source.prepare_pixels(source.application_id) ||
      !esphome::companion::app_icon_store().copy_pixels(
          source.application_id, source.pixels, esphome::companion::APP_ICON_PIXEL_BYTES,
          &source.loaded_hash)) {
    if (image && !source.application_id.empty())
      esphome::companion::request_app_icon(source.application_id, source.computer_id);
    source.release_pixels();
    source.accent_palette = {};
    if (image) lv_obj_add_flag(image, LV_OBJ_FLAG_HIDDEN);
    if (source.fallback_icon) lv_obj_clear_flag(source.fallback_icon, LV_OBJ_FLAG_HIDDEN);
    companion_apply_app_icon_card_palette(source, image ? lv_obj_get_parent(image) : nullptr);
    return false;
  }
  source.image_loaded = true;
  source.loaded_hash_valid = true;
  source.rendered_online = source.companion_online;
  source.artwork_insets_ready = false;
  source.release_display_pixels();
  constexpr size_t pixel_count = esphome::companion::APP_ICON_SIDE *
                                 esphome::companion::APP_ICON_SIDE;
  for (size_t i = 0; i < pixel_count; ++i) {
    const uint16_t packed = static_cast<uint16_t>(source.pixels[i * 2]) |
                            (static_cast<uint16_t>(source.pixels[i * 2 + 1]) << 8);
    const uint8_t red5 = (packed >> 11) & 0x1F;
    const uint8_t green6 = (packed >> 5) & 0x3F;
    const uint8_t blue5 = packed & 0x1F;
    const uint8_t red = (red5 << 3) | (red5 >> 2);
    const uint8_t green = (green6 << 2) | (green6 >> 4);
    const uint8_t blue = (blue5 << 3) | (blue5 >> 2);
    if (!source.companion_online) {
      const uint8_t gray = static_cast<uint8_t>((red * 54u + green * 183u + blue * 19u) >> 8);
      const uint16_t gray565 = ((gray >> 3) << 11) | ((gray >> 2) << 5) | (gray >> 3);
      source.pixels[i * 2] = static_cast<uint8_t>(gray565 & 0xFF);
      source.pixels[i * 2 + 1] = static_cast<uint8_t>(gray565 >> 8);
    }
  }
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  source.descriptor.header.magic = LV_IMAGE_HEADER_MAGIC;
  source.descriptor.header.cf = LV_COLOR_FORMAT_RGB565A8;
  source.descriptor.header.w = esphome::companion::APP_ICON_SIDE;
  source.descriptor.header.h = esphome::companion::APP_ICON_SIDE;
  source.descriptor.header.stride = esphome::companion::APP_ICON_SIDE * 2;
  source.descriptor.data_size = esphome::companion::APP_ICON_PIXEL_BYTES;
  source.descriptor.data = source.pixels;
  lv_image_set_src(image, &source.descriptor);
#else
  source.descriptor.header.cf = LV_IMG_CF_TRUE_COLOR;
  source.descriptor.header.w = esphome::companion::APP_ICON_SIDE;
  source.descriptor.header.h = esphome::companion::APP_ICON_SIDE;
  source.descriptor.data_size = static_cast<uint32_t>(esphome::companion::APP_ICON_SIDE) *
                                esphome::companion::APP_ICON_SIDE * 2u;
  source.descriptor.data = source.pixels;
  lv_img_set_src(image, &source.descriptor);
#endif
  lv_obj_update_layout(lv_obj_get_parent(image));
  companion_layout_card_app_icon(source, image);
  lv_obj_clear_flag(image, LV_OBJ_FLAG_HIDDEN);
  if (source.fallback_icon) lv_obj_add_flag(source.fallback_icon, LV_OBJ_FLAG_HIDDEN);
  source.accent_palette = source.app_icon_mode && source.companion_online && source.custom_background
      ? espdesktop::cover_art::make_app_icon_custom_palette(
            source.custom_background_rgb, source.color_correction_red_percent,
            source.color_correction_green_percent, source.color_correction_blue_percent)
      : espdesktop::cover_art::AccentPalette{};
  companion_apply_app_icon_card_palette(source, lv_obj_get_parent(image));
  return true;
}

inline void companion_set_card_icon_image(BtnSlot &slot, const std::string &application_id,
                                          bool compact_icon = false,
                                          const std::string &computer_id = "") {
  if (!slot.btn || !slot.icon_lbl) return;
  esphome::companion::app_icon_store().begin();
  if (!slot.app_icon_img) slot.app_icon_img = grid_find_companion_app_icon_image(slot.btn);
  if (!slot.app_icon_img) {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
    slot.app_icon_img = lv_image_create(slot.btn);
#else
    slot.app_icon_img = lv_img_create(slot.btn);
#endif
    lv_obj_add_flag(slot.app_icon_img, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(slot.app_icon_img, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_clear_flag(slot.app_icon_img, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_pad_all(slot.app_icon_img, 0, LV_PART_MAIN);
    lv_obj_set_style_border_width(slot.app_icon_img, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(slot.app_icon_img, LV_OPA_TRANSP, LV_PART_MAIN);
    companion_track_app_icon_layout(slot.btn, slot.text_lbl, slot.app_icon_img);
  }
  auto *source = static_cast<CompanionAppIconImageData *>(lv_obj_get_user_data(slot.app_icon_img));
  if (!source) {
    source = grid_track_runtime_allocation(slot.btn, new CompanionAppIconImageData());
    lv_obj_set_user_data(slot.app_icon_img, source);
  }
  if (!source) return;
  source->application_id = application_id;
  source->computer_id = computer_id;
  source->fallback_icon = slot.icon_lbl;
  source->card_label = slot.text_lbl;
  source->compact_icon = compact_icon;
  source->app_icon_mode = true;
  source->companion_online = companion_connected();
  companion_apply_cached_app_icon(*source, slot.app_icon_img);
}

inline void companion_disable_card_app_icon_palette(BtnSlot &slot) {
  if (!slot.btn) return;
  if (!slot.app_icon_img) slot.app_icon_img = grid_find_companion_app_icon_image(slot.btn);
  if (!slot.app_icon_img) return;
  auto *source = static_cast<CompanionAppIconImageData *>(
      lv_obj_get_user_data(slot.app_icon_img));
  if (source) {
    source->app_icon_mode = false;
    source->accent_palette = {};
  }
}

inline void companion_reset_card_app_icon_palette(BtnSlot &slot) {
  if (!slot.btn) return;
  if (!slot.app_icon_img) slot.app_icon_img = grid_find_companion_app_icon_image(slot.btn);
  if (!slot.app_icon_img) return;
  auto *source = static_cast<CompanionAppIconImageData *>(
      lv_obj_get_user_data(slot.app_icon_img));
  if (source) {
    static const lv_state_t states[] = {
        LV_STATE_DEFAULT, LV_STATE_CHECKED, LV_STATE_PRESSED,
        static_cast<lv_state_t>(LV_STATE_CHECKED | LV_STATE_PRESSED)};
    for (const auto state : states) {
      const auto selector = static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(state);
      lv_obj_remove_local_style_prop(slot.btn, LV_STYLE_OUTLINE_WIDTH, selector);
      lv_obj_remove_local_style_prop(slot.btn, LV_STYLE_OUTLINE_PAD, selector);
      lv_obj_remove_local_style_prop(slot.btn, LV_STYLE_OUTLINE_COLOR, selector);
      lv_obj_remove_local_style_prop(slot.btn, LV_STYLE_OUTLINE_OPA, selector);
    }
    source->app_icon_mode = false;
  }
  if (!source || !source->palette_applied) return;
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_BG_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_TEXT_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_BG_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_TEXT_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_BG_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_TEXT_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
  source->palette_applied = false;
  source->app_icon_mode = false;
  source->accent_palette = {};
}
#endif

inline void apply_push_button_transition(lv_obj_t *btn);
inline void clear_push_button_transition(lv_obj_t *btn);






inline void apply_push_button_transition(lv_obj_t *btn) {
  if (!btn) return;
  static const lv_style_prop_t push_props[] = {LV_STYLE_BG_COLOR, LV_STYLE_PROP_INV};
  static lv_style_transition_dsc_t push_trans;
  static bool push_trans_inited = false;
  if (!push_trans_inited) {
    lv_style_transition_dsc_init(&push_trans, push_props, lv_anim_path_ease_out, 120, 0, NULL);
    push_trans_inited = true;
  }
  lv_obj_set_style_transition(btn, &push_trans,
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | LV_STATE_DEFAULT);
}

inline void clear_push_button_transition(lv_obj_t *btn) {
  if (!btn) return;
  lv_obj_remove_local_style_prop(btn, LV_STYLE_TRANSITION,
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | LV_STATE_DEFAULT);
}


// Set icon and label on a toggle/push button based on its config
inline void setup_toggle_visual(BtnSlot &s, const ParsedCfg &p) {
  if (!p.entity.empty()) {
    if (!p.label.empty()) {
      lv_label_set_display_text(s.text_lbl, p.label.c_str());
    }
    const char* icon_cp = "\U000F0493";
    if (p.icon.empty() || p.icon == "Auto") {
      std::string domain = p.entity.substr(0, p.entity.find('.'));
      icon_cp = domain_default_icon(domain);
    } else {
      icon_cp = find_icon(p.icon.c_str());
    }
    lv_label_set_display_text(s.icon_lbl, icon_cp);

    if (!p.sensor.empty()) {
      if (!p.unit.empty()) {
        std::string unit = trim_display_unit(p.unit);
        lv_label_set_display_text(s.unit_lbl, unit.c_str());
      }
    }
  } else {
    if (!p.label.empty()) {
      lv_label_set_display_text(s.text_lbl, p.label.c_str());
    }
    if (!p.icon.empty() && p.icon != "Auto") {
      lv_label_set_display_text(s.icon_lbl, find_icon(p.icon.c_str()));
    } else if (p.type == "push") {
      lv_label_set_display_text(s.icon_lbl, "\U000F0741");
      apply_push_button_transition(s.btn);
    }
    if (p.type == "push" && p.label.empty()) {
      lv_label_set_display_text(s.text_lbl, espdesktop_i18n("Push"));
    }
  }
}


inline void setup_companion_card(BtnSlot &s, const ParsedCfg &p,
                                 uint32_t sensor_color = theme_display_color(current_theme().surface_secondary)) {
  lv_obj_clear_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  if (companion_metric_key_valid(p.entity)) {
    lv_label_set_display_text(s.icon_lbl, find_icon(companion_metric_icon(p.entity)));
    lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_display_text(s.text_lbl, "--");
    lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_bg_color(
      s.btn, lv_color_hex(sensor_color),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
        static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
    lv_label_set_display_text(s.sensor_lbl, "--");
    const std::string unit = trim_display_unit(
      p.unit.empty() ? companion_metric_default_unit(p.entity) : p.unit);
    lv_label_set_display_text(s.unit_lbl, "");
    companion_track_metric_card(s.btn, s.text_lbl, nullptr, p.entity, unit,
                                parse_precision(p.precision), false,
                                !cfg_option_token_present(p.options, "stat_labels_off"),
                                companion_card_computer(p));
    return;
  }
  const bool obs_status = companion_obs_status_card(p.entity);
  const bool tokenized_card = companion_obs_tokenized_card(p.entity);
  const bool obs_mute = companion_obs_audio_uuid(p.entity, "obs.mute.");
  const bool direct_transition = companion_obs_transition_target(p.entity);
  const std::string obs_alias = p.entity.rfind("obs.", 0) == 0 ? p.label : "";
  const bool dynamic_label = obs_status || tokenized_card || p.entity == "obs.replay" || p.label.empty() || !obs_alias.empty();
  // Bound cards read their own computer; cards saved before multi-computer
  // pairing read the primary computer, matching where their presses go.
  const std::string card_computer = companion_card_computer(p);
  const auto obs_snapshot = companion_runtime_for(card_computer).snapshot();
  const bool url_card = !companion_encoded_url(p.sensor).empty();
  const bool available = url_card
    ? companion_url_available(p.entity, p.sensor)
    : companion_action_available(obs_snapshot, p.entity);
  const std::string label = dynamic_label
    ? companion_obs_control_label(p.entity, obs_alias,
        companion_default_action_label(p.entity, p.sensor, &obs_snapshot),
        &obs_snapshot)
    : p.label;
  if (p.type == "companion_mac_lock" && label == card_runtime_label(p.type)) {
    lv_label_set_display_text(s.text_lbl, espdesktop_i18n_key("lock_machine"));
  } else {
    lv_label_set_display_text(s.text_lbl, label.c_str());
  }
  if (companion_app_launch_card(p) &&
      (cfg_option_token_present(p.options, "app_hide_label") ||
       companion_app_icon_enabled(p))) {
    lv_obj_add_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_clear_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  }
  if (companion_app_launch_card(p)) {
    lv_label_set_long_mode(s.text_lbl, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s.text_lbl, lv_pct(100));
  }
  const std::string shortcut_app_icon = apple_shortcut_workflow_icon(p)
      ? APPLE_SHORTCUTS_APP_ID : companion_shortcut_app_icon_id(p);
  const char *icon = (p.icon.empty() || p.icon == "Auto")
    ? find_icon(companion_apple_shortcut_action(p.entity) ? "Flash" : obs_mute ? "Microphone" : p.entity == "obs.brb" ? "Coffee to Go" :
                p.entity == "obs.studio" ? "Split Vertical" : p.entity == "obs.multiview" ? "View Grid" :
                (p.entity == "obs.transition" || direct_transition) ? "Flip Horizontal" :
                p.entity == "obs.replay.buffer" ? "Repeat" :
                companion_obs_scene_card(p.entity) ? "Image Card Loading" :
                companion_shortcut_action_valid(p.entity) ? "Keyboard" : "Monitor")
    : find_icon(p.icon.c_str());
  lv_label_set_display_text(s.icon_lbl, icon);
  if (companion_app_icon_enabled(p) || !shortcut_app_icon.empty()) {
#ifdef USE_COMPANION
    const std::string id = !shortcut_app_icon.empty()
        ? shortcut_app_icon : (workflow_icon ? APPLE_SHORTCUTS_APP_ID : p.entity);
    companion_set_card_icon_image(s, id, !shortcut_app_icon.empty() || workflow_icon,
                                  companion_card_computer(p));
    esphome::companion::request_app_icon(id, companion_card_computer(p));
#endif
  } else if (s.app_icon_img) {
    lv_obj_add_flag(s.app_icon_img, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
#ifdef USE_COMPANION
    companion_disable_card_app_icon_palette(s);
#endif
  }
  companion_track_card(s.btn, p.entity, p.sensor, s.text_lbl, dynamic_label, true, obs_alias,
    obs_mute ? s.icon_lbl : nullptr, obs_mute ? icon : nullptr,
    obs_mute ? find_icon("Microphone Off") : nullptr, companion_card_computer(p));
  if (tokenized_card) companion_remember_rendered_obs(s.btn, obs_snapshot);
  set_card_disabled_state(s.btn, !available);
  if (obs_status) {
    apply_button_colors(s.btn, false, 0, true, sensor_color);
    sync_card_checked_text_color(s.btn);
    lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
    clear_push_button_transition(s.btn);
  } else if (p.entity == "obs.take") {
    // Keep the normal palette on touch-down, including custom card colours.
    remove_button_state_transitions(s.btn);
    lv_obj_remove_style(s.btn, nullptr, static_cast<lv_style_selector_t>(LV_PART_MAIN) |
      static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
    lv_obj_remove_event_cb_with_user_data(s.btn, card_text_contrast_event_cb, nullptr);
    sync_card_checked_text_color(s.btn);
  } else if (companion_app_launch_card(p) || companion_obs_momentary_action(p.entity) ||
             companion_apple_shortcut_action(p.entity)) {
    apply_instant_button_feedback(s.btn);
  } else if (available) {
    apply_push_button_transition(s.btn);
  } else {
    clear_push_button_transition(s.btn);
  }
  companion_apply_card_focus(s.btn, p.entity, p.sensor, true, &obs_snapshot);
}





inline const char *door_window_closed_icon(const ParsedCfg &p) {
  if (!p.icon.empty() && p.icon != "Auto") return find_icon(p.icon.c_str());
  return find_icon(door_window_closed_icon_name(p.precision));
}

inline const char *door_window_open_icon(const ParsedCfg &p) {
  if (!p.icon_on.empty() && p.icon_on != "Auto") return find_icon(p.icon_on.c_str());
  return find_icon(door_window_open_icon_name(p.precision));
}

inline const char *presence_clear_icon(const ParsedCfg &p) {
  if (!p.icon.empty() && p.icon != "Auto") return find_icon(p.icon.c_str());
  return find_icon("Motion Sensor Off");
}

inline const char *presence_detected_icon(const ParsedCfg &p) {
  if (!p.icon_on.empty() && p.icon_on != "Auto") return find_icon(p.icon_on.c_str());
  return find_icon("Motion Sensor");
}

inline void setup_subpage_parent_state_card(BtnSlot &s, const ParsedCfg &p,
                                            const lv_font_t *value_font,
                                            bool subpage_chevron_enabled = true,
                                            int subpage_chevron_x = 0,
                                            int subpage_chevron_y = 2,
                                            int subpage_chevron_text_width_percent = 94) {
  setup_toggle_visual(s, p);
  if (p.precision == "text") {
    lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    set_wrapped_button_label_text(s.text_lbl, "--");
    set_subpage_chevron_visible(
      s, subpage_chevron_enabled, subpage_chevron_x, subpage_chevron_y,
      subpage_chevron_text_width_percent);
    return;
  }

  lv_obj_add_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
  if (value_font) lv_obj_set_style_text_font(s.sensor_lbl, value_font, LV_PART_MAIN);
  lv_label_set_display_text(s.sensor_lbl, "--");
  std::string unit = trim_display_unit(p.unit);
  lv_label_set_display_text(s.unit_lbl, unit.c_str());
  std::string subpage_label = p.label.empty() ? espdesktop_i18n(std::string("Subpage")) : p.label;
  lv_label_set_display_text(s.text_lbl, subpage_label.c_str());
  set_subpage_chevron_visible(
    s, subpage_chevron_enabled, subpage_chevron_x, subpage_chevron_y,
    subpage_chevron_text_width_percent);
}
