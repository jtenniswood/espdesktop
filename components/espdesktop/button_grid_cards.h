#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#include "button_grid_datetime_cards.h"
#include "companion_controls.h"
#ifdef USE_COMPANION
#include "../companion/app_icon_store.h"
#include "app_icon_layout.h"
#include "cover_art.h"
#include "panel_config_text_bindings.h"
#include "esphome/core/version.h"

template<typename T>
inline T *grid_track_runtime_allocation(lv_obj_t *owner, T *ptr);

namespace esphome::companion {
void request_app_icon(const std::string &application_id);
}

struct CompanionAppIconImageData {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_image_dsc_t descriptor{};
#else
  lv_img_dsc_t descriptor{};
#endif
  esphome::RAMAllocator<uint8_t> pixel_allocator{
      esphome::RAMAllocator<uint8_t>::ALLOC_EXTERNAL};
  uint8_t *pixels = pixel_allocator.allocate(esphome::companion::APP_ICON_PIXEL_BYTES);
  lv_obj_t *fallback_icon = nullptr;
  lv_obj_t *card_label = nullptr;
  std::string application_id;
  espdesktop::cover_art::AccentPalette accent_palette{};
  espdesktop::cover_art::AccentColor accent_color{};
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
  bool image_loaded = false;
  bool card_palette_ready = false;
  bool palette_applied = false;
  bool fill_card = false;
  bool medium_icon = false;

  ~CompanionAppIconImageData() {
    if (pixels) pixel_allocator.deallocate(pixels, esphome::companion::APP_ICON_PIXEL_BYTES);
  }
};

inline lv_obj_t *grid_find_companion_app_icon_image(lv_obj_t *owner);
inline void companion_refresh_cached_app_icon(const std::string &application_id);

inline void companion_apply_app_icon_card_palette(
    CompanionAppIconImageData &source, lv_obj_t *button) {
  if (!button || !source.card_palette_ready) return;
  const bool use_accent = source.app_icon_mode && source.companion_online && source.image_loaded &&
                          source.accent_palette.valid;
  const uint32_t default_rgb = use_accent
      ? source.accent_palette.default_rgb : source.fallback_default_rgb;
  const uint32_t active_rgb = use_accent
      ? source.accent_palette.active_rgb : source.fallback_active_rgb;
  lv_obj_set_style_bg_color(
      button, lv_color_hex(default_rgb),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  lv_obj_set_style_bg_color(
      button, lv_color_hex(active_rgb),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
  lv_obj_set_style_bg_color(
      button, lv_color_hex(active_rgb),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
  source.palette_applied = true;
}

inline void companion_update_app_icon_card_palette(
    CompanionAppIconImageData &source, lv_obj_t *button, bool app_icon_mode,
    uint32_t fallback_default_rgb, uint32_t fallback_active_rgb,
    int correction_red_percent, int correction_green_percent,
    int correction_blue_percent, const std::string &custom_color,
    bool companion_online) {
  source.app_icon_mode = app_icon_mode;
  source.companion_online = companion_online;
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
  if (app_icon_mode && source.image_loaded && companion_online) {
    source.accent_palette = source.custom_background
        ? espdesktop::cover_art::make_app_icon_custom_palette(
              source.custom_background_rgb, correction_red_percent,
              correction_green_percent, correction_blue_percent)
        : espdesktop::configuration::companion_app_icon_auto_colour_generation_enabled()
            ? espdesktop::cover_art::make_app_icon_accent_palette(
              source.accent_color, correction_red_percent,
              correction_green_percent, correction_blue_percent)
            : espdesktop::cover_art::AccentPalette{};
  } else {
    source.accent_palette = {};
  }
  companion_apply_app_icon_card_palette(source, button);
}

inline void companion_refresh_app_icon_connection_state(bool online);

inline bool companion_apply_cached_app_icon(CompanionAppIconImageData &source, lv_obj_t *image) {
  if (!image || !source.pixels || source.application_id.empty() ||
      !esphome::companion::app_icon_store().copy_pixels(
          source.application_id, source.pixels, esphome::companion::APP_ICON_PIXEL_BYTES)) {
    source.image_loaded = false;
    source.accent_palette = {};
    if (image) lv_obj_add_flag(image, LV_OBJ_FLAG_HIDDEN);
    if (source.fallback_icon) lv_obj_clear_flag(source.fallback_icon, LV_OBJ_FLAG_HIDDEN);
    companion_apply_app_icon_card_palette(source, image ? lv_obj_get_parent(image) : nullptr);
    return false;
  }
  source.image_loaded = true;
  source.accent_color = espdesktop::cover_art::extract_accent_color_rgb565a8(
      source.pixels, esphome::companion::APP_ICON_SIDE,
      esphome::companion::APP_ICON_SIDE);
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
  if (source.fill_card) {
    lv_obj_t *button = lv_obj_get_parent(image);
    lv_obj_update_layout(button);
    const auto insets = espdesktop::app_icon::artwork_insets(
        source.pixels + pixel_count * 2, esphome::companion::APP_ICON_SIDE);
    const int canvas_side = esphome::companion::APP_ICON_SIDE;
    const int artwork_width = std::max(1, canvas_side - insets.left - insets.right);
    const int artwork_height = std::max(1, canvas_side - insets.top - insets.bottom);
    const int pad_top = lv_obj_get_style_pad_top(button, LV_PART_MAIN);
    const int available_width = std::max<int>(1, lv_obj_get_width(button) -
        lv_obj_get_style_pad_left(button, LV_PART_MAIN) -
        lv_obj_get_style_pad_right(button, LV_PART_MAIN));
    const int available_height = std::max<int>(1, lv_obj_get_height(button) - 2 * pad_top);
    // Size the visible artwork, not the transparent macOS canvas. Keep it
    // square, left aligned and vertically centered within equal card margins.
    const int target_side = std::max(1, std::min(
        available_width * canvas_side / artwork_width,
        available_height * canvas_side / artwork_height));
    const int artwork_left = (insets.left * target_side + canvas_side / 2) / canvas_side;
    const int artwork_top = (insets.top * target_side + canvas_side / 2) / canvas_side;
    const int visible_height = (artwork_height * target_side + canvas_side / 2) / canvas_side;
    lv_obj_set_size(image, target_side, target_side);
    lv_obj_align(image, LV_ALIGN_TOP_LEFT, -artwork_left,
                 (available_height - visible_height) / 2 - artwork_top);
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CONTAIN);
#else
    const uint16_t zoom = static_cast<uint16_t>(std::min<uint32_t>(
        (static_cast<uint32_t>(target_side) * 256u + canvas_side - 1u) / canvas_side,
        UINT16_MAX));
    lv_img_set_zoom(image, zoom);
#endif
  } else {
    const lv_font_t *icon_font = source.fallback_icon
        ? lv_obj_get_style_text_font(source.fallback_icon, LV_PART_MAIN) : nullptr;
    const lv_coord_t small_side = icon_font ? icon_font->line_height : 48;
    lv_coord_t target_side = small_side;
    if (source.medium_icon) {
      lv_obj_t *button = lv_obj_get_parent(image);
      lv_obj_update_layout(button);
      const lv_coord_t button_width = lv_obj_get_width(button);
      const lv_coord_t button_height = lv_obj_get_height(button);
      const lv_coord_t pad_left = lv_obj_get_style_pad_left(button, LV_PART_MAIN);
      const lv_coord_t pad_right = lv_obj_get_style_pad_right(button, LV_PART_MAIN);
      const lv_coord_t pad_top = lv_obj_get_style_pad_top(button, LV_PART_MAIN);
      const lv_coord_t pad_bottom = lv_obj_get_style_pad_bottom(button, LV_PART_MAIN);
      const lv_coord_t gap = std::max<lv_coord_t>(3, small_side / 8);
      lv_coord_t label_height = 0;
      if (source.card_label && !lv_obj_has_flag(source.card_label, LV_OBJ_FLAG_HIDDEN)) {
        const lv_font_t *label_font = lv_obj_get_style_text_font(source.card_label, LV_PART_MAIN);
        label_height = label_font && label_font->line_height > 0 ? label_font->line_height : 16;
      }
      const lv_coord_t max_width = std::max<lv_coord_t>(1, button_width - pad_left - pad_right);
      const lv_coord_t max_height = std::max<lv_coord_t>(1,
          button_height - pad_top - pad_bottom - label_height - (label_height > 0 ? gap : 0));
      target_side = std::max<lv_coord_t>(1,
          std::min<lv_coord_t>(small_side * 5 / 2, std::min(max_width, max_height)) * 9 / 10);
      if (source.card_label && !lv_obj_has_flag(source.card_label, LV_OBJ_FLAG_HIDDEN)) {
        lv_label_set_long_mode(source.card_label, LV_LABEL_LONG_DOT);
        lv_obj_set_width(source.card_label, lv_pct(100));
      }
    }
    lv_obj_set_size(image, target_side, target_side);
    // The card already supplies the same padding as the label. Compensate for
    // padding inside the cached image so its visible artwork shares that inset.
    const auto insets = espdesktop::app_icon::artwork_insets(
        source.pixels + pixel_count * 2, esphome::companion::APP_ICON_SIDE);
    const lv_coord_t artwork_left =
        (insets.left * target_side + esphome::companion::APP_ICON_SIDE / 2) /
        esphome::companion::APP_ICON_SIDE;
    const lv_coord_t artwork_top =
        (insets.top * target_side + esphome::companion::APP_ICON_SIDE / 2) /
        esphome::companion::APP_ICON_SIDE;
    lv_obj_align(image, LV_ALIGN_TOP_LEFT, -artwork_left, -artwork_top);
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
    lv_image_set_inner_align(image, LV_IMAGE_ALIGN_CONTAIN);
#else
    const uint16_t zoom = static_cast<uint16_t>(std::min<uint32_t>(
        (static_cast<uint32_t>(target_side) * 256u + esphome::companion::APP_ICON_SIDE - 1u) /
            esphome::companion::APP_ICON_SIDE,
        UINT16_MAX));
    lv_img_set_zoom(image, zoom);
#endif
  }
  lv_obj_clear_flag(image, LV_OBJ_FLAG_HIDDEN);
  if (source.fallback_icon) lv_obj_add_flag(source.fallback_icon, LV_OBJ_FLAG_HIDDEN);
  if (source.fill_card && source.card_label) lv_obj_move_foreground(source.card_label);
  source.accent_palette = source.app_icon_mode && source.companion_online
      ? (source.custom_background
          ? espdesktop::cover_art::make_app_icon_custom_palette(
                source.custom_background_rgb, source.color_correction_red_percent,
                source.color_correction_green_percent, source.color_correction_blue_percent)
          : espdesktop::configuration::companion_app_icon_auto_colour_generation_enabled()
              ? espdesktop::cover_art::make_app_icon_accent_palette(
                source.accent_color, source.color_correction_red_percent,
                source.color_correction_green_percent, source.color_correction_blue_percent)
              : espdesktop::cover_art::AccentPalette{})
      : espdesktop::cover_art::AccentPalette{};
  companion_apply_app_icon_card_palette(source, lv_obj_get_parent(image));
  return true;
}

inline void companion_set_card_icon_image(BtnSlot &slot, const std::string &application_id,
                                          bool fill_card = false, bool medium_icon = false) {
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
  }
  auto *source = static_cast<CompanionAppIconImageData *>(lv_obj_get_user_data(slot.app_icon_img));
  if (!source) {
    source = grid_track_runtime_allocation(slot.btn, new CompanionAppIconImageData());
    lv_obj_set_user_data(slot.app_icon_img, source);
  }
  if (!source) return;
  source->application_id = application_id;
  source->fallback_icon = slot.icon_lbl;
  source->card_label = slot.text_lbl;
  source->app_icon_mode = true;
  source->companion_online = companion_connected();
  source->fill_card = fill_card;
  source->medium_icon = medium_icon && !fill_card;
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
  if (!source || !source->palette_applied) return;
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_BG_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_BG_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
  lv_obj_remove_local_style_prop(
      slot.btn, LV_STYLE_BG_COLOR,
      static_cast<lv_style_selector_t>(LV_PART_MAIN) |
          static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
  source->palette_applied = false;
  source->app_icon_mode = false;
  source->accent_palette = {};
}
#endif

inline void apply_push_button_transition(lv_obj_t *btn);
inline void clear_push_button_transition(lv_obj_t *btn);

inline void setup_garage_card(BtnSlot &s, const ParsedCfg &p) {
  if (garage_command_mode(p.sensor)) {
    lv_label_set_display_text(s.icon_lbl, garage_command_icon(p));
    lv_label_set_display_text(s.text_lbl, garage_card_show_status(p) ? "--" : garage_card_label(p));
    apply_push_button_transition(s.btn);
    return;
  }
  lv_label_set_display_text(s.icon_lbl, garage_closed_icon(p.icon));
  lv_label_set_display_text(s.text_lbl, garage_card_show_status(p) ? "--" : garage_card_label(p));
}

inline void setup_gate_card(BtnSlot &s, const ParsedCfg &p) {
  if (gate_command_mode(p.sensor)) {
    lv_label_set_display_text(s.icon_lbl, gate_command_icon(p));
    lv_label_set_display_text(s.text_lbl, gate_card_show_status(p) ? "--" : gate_card_label(p));
    apply_push_button_transition(s.btn);
    return;
  }
  lv_label_set_display_text(s.icon_lbl, gate_closed_icon(p.icon));
  lv_label_set_display_text(s.text_lbl, gate_card_show_status(p) ? "--" : gate_card_label(p));
}

inline void setup_lock_card(BtnSlot &s, const ParsedCfg &p) {
  if (lock_command_mode(p.sensor)) {
    lv_label_set_display_text(s.icon_lbl, lock_command_icon(p));
    lv_label_set_display_text(s.text_lbl, lock_card_label(p));
    apply_push_button_transition(s.btn);
    return;
  }
  lv_label_set_display_text(s.icon_lbl, lock_locked_icon(p.icon));
  lv_label_set_display_text(s.text_lbl, lock_card_label(p));
}

inline const char *screen_lock_locked_icon(const ParsedCfg &p) {
  (void) p;
  return find_icon("Lock");
}

inline const char *screen_lock_unlocked_icon(const ParsedCfg &p) {
  (void) p;
  return find_icon("Lock Open");
}

inline std::string screen_lock_card_label() {
  return screen_lock_enabled()
    ? espdesktop_i18n(std::string("Screen Locked"))
    : espdesktop_i18n(std::string("Screen Unlocked"));
}

inline void screen_lock_register_card(const BtnSlot &s, const ParsedCfg &p) {
  ScreenLockCardRef ref;
  ref.btn = s.btn;
  ref.icon_lbl = s.icon_lbl;
  ref.text_lbl = s.text_lbl;
  ref.locked_icon = screen_lock_locked_icon(p);
  ref.unlocked_icon = screen_lock_unlocked_icon(p);
  screen_lock_card_refs().push_back(ref);
  screen_lock_register_controlled_button(s.btn);
}

inline void setup_screen_lock_card(BtnSlot &s, const ParsedCfg &p) {
  lv_label_set_display_text(s.icon_lbl,
    screen_lock_enabled() ? screen_lock_locked_icon(p) : screen_lock_unlocked_icon(p));
  std::string label = screen_lock_card_label();
  lv_label_set_display_text(s.text_lbl, label.c_str());
  screen_lock_register_card(s, p);
  apply_push_button_transition(s.btn);
}

inline void apply_push_button_transition(lv_obj_t *btn) {
  if (!btn) return;
  static const lv_style_prop_t push_props[] = {LV_STYLE_BG_COLOR, LV_STYLE_PROP_INV};
  static lv_style_transition_dsc_t push_trans;
  static bool push_trans_inited = false;
  if (!push_trans_inited) {
    lv_style_transition_dsc_init(&push_trans, push_props, lv_anim_path_ease_out, 400, 0, NULL);
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

inline void setup_internal_relay_card(BtnSlot &s, const ParsedCfg &p) {
  bool push_mode = internal_relay_push_mode(p);
  std::string label = internal_relay_label(p);
  lv_label_set_display_text(s.text_lbl, label.c_str());
  const char *icon_off = internal_relay_icon(p, push_mode);
  lv_label_set_display_text(s.icon_lbl, icon_off);
  if (push_mode) {
    apply_push_button_transition(s.btn);
    return;
  }
  bool has_icon_on = !p.icon_on.empty() && p.icon_on != "Auto";
  const char *icon_on = has_icon_on ? find_icon(p.icon_on.c_str()) : nullptr;
  apply_internal_relay_state(s.btn, s.icon_lbl, internal_relay_state(p.entity),
    has_icon_on, icon_off, icon_on);
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

inline void setup_local_action_card(BtnSlot &s, const ParsedCfg &p);

inline void setup_companion_card(BtnSlot &s, const ParsedCfg &p,
                                 uint32_t sensor_color = TERTIARY_GREY) {
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
                                !cfg_option_token_present(p.options, "stat_labels_off"));
    return;
  }
  const bool url_card = !companion_encoded_url(p.sensor).empty();
  const bool available = url_card
    ? companion_url_available(p.entity, p.sensor)
    : companion_action_available(p.entity);
  std::string label = p.label.empty()
    ? companion_default_action_label(p.entity, p.sensor) : p.label;
  lv_label_set_display_text(s.text_lbl, label.c_str());
  if (companion_app_launch_card(p) &&
      cfg_option_token_present(p.options, "app_hide_label")) {
    lv_obj_add_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_clear_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  }
  const bool medium_app_icon = companion_app_launch_card(p) &&
      companion_app_icon_enabled(p) &&
      !cfg_option_token_present(p.options, "app_icon_fill") &&
      cfg_option_token_present(p.options, "app_icon_medium");
  if (companion_app_launch_card(p)) {
    lv_label_set_long_mode(s.text_lbl, medium_app_icon ? LV_LABEL_LONG_DOT : LV_LABEL_LONG_WRAP);
    lv_obj_set_width(s.text_lbl, lv_pct(100));
  }
  const char *icon = (p.icon.empty() || p.icon == "Auto")
    ? find_icon("Monitor") : find_icon(p.icon.c_str());
  lv_label_set_display_text(s.icon_lbl, icon);
  if (companion_app_icon_enabled(p)) {
#ifdef USE_COMPANION
    companion_set_card_icon_image(
        s, p.entity, cfg_option_token_present(p.options, "app_icon_fill"),
        cfg_option_token_present(p.options, "app_icon_medium"));
    esphome::companion::request_app_icon(p.entity);
#endif
  } else if (s.app_icon_img) {
    lv_obj_add_flag(s.app_icon_img, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
#ifdef USE_COMPANION
    companion_disable_card_app_icon_palette(s);
#endif
  }
  companion_track_card(s.btn, p.entity, p.sensor, s.text_lbl, p.label.empty());
  if (available) {
    set_card_disabled_state(s.btn, false);
    apply_push_button_transition(s.btn);
  } else {
    set_card_disabled_state(s.btn, true);
    clear_push_button_transition(s.btn);
  }
  companion_apply_card_focus(s.btn, p.entity, p.sensor);
}

inline void setup_action_card(BtnSlot &s, const ParsedCfg &p) {
  if (action_card_local_action(p)) {
    setup_local_action_card(s, p);
    return;
  }
  std::string action_label = p.label.empty()
    ? (p.entity.empty() ? espdesktop_i18n(std::string("Action")) : p.entity)
    : p.label;
  lv_label_set_display_text(s.text_lbl, action_label.c_str());
  const char *icon_cp = (p.icon.empty() || p.icon == "Auto") ? find_icon("Flash") : find_icon(p.icon.c_str());
  lv_label_set_display_text(s.icon_lbl, icon_cp);
  if (action_card_state_icon_mode(p) || action_card_state_text_mode(p)) {
    lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
  } else if (action_card_state_numeric_mode(p)) {
    lv_obj_add_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_display_text(s.sensor_lbl, "--");
    std::string unit = trim_display_unit(action_card_state_unit(p));
    lv_label_set_display_text(s.unit_lbl, unit.c_str());
  }
  apply_push_button_transition(s.btn);
}

inline void setup_local_action_card(BtnSlot &s, const ParsedCfg &p) {
  std::string label = p.label.empty() ? (p.entity.empty() ? espdesktop_i18n("Local Action") : sentence_cap_text(p.entity)) : p.label;
  lv_label_set_display_text(s.text_lbl, label.c_str());
  const char *icon_cp = (p.icon.empty() || p.icon == "Auto") ? find_icon("Gesture Tap") : find_icon(p.icon.c_str());
  lv_label_set_display_text(s.icon_lbl, icon_cp);
  apply_push_button_transition(s.btn);
}

inline void send_local_sensor_update(const std::string &key, float value) {
  if (!local_sensor_apply_value(key, value)) {
    ESP_LOGW("espdesktop", "Local sensor '%s' not registered", key.c_str());
  }
}

inline void send_local_sensor_update(const std::string &key, const char *value) {
  if (!local_sensor_apply_text(key, value ? value : "--")) {
    ESP_LOGW("espdesktop", "Local sensor '%s' not registered", key.c_str());
  }
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
