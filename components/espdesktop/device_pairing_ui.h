#pragma once

#include <array>

#include "button_grid_modal.h"
#include "companion_controls.h"
#include "home_assistant_cards.h"
#include "screen_lock_state.h"

struct DevicePairingButtonColors {
  uint32_t fill;
  uint32_t pressed;
};

// Match the website's dark-mode button blue.
inline constexpr DevicePairingButtonColors DEVICE_PAIRING_BUTTON_BLUE{0x3E63DD, 0x3451B2};
inline constexpr DevicePairingButtonColors DEVICE_PAIRING_BUTTON_GREY{0x6C6C6C, 0x555555};
// A mid-grey outline stays visible against both the dark and light panels.
inline constexpr uint32_t DEVICE_PAIRING_TILE_BORDER = 0x6C6C6C;

struct DevicePairingUi {
  lv_obj_t *overlay = nullptr;
  lv_timer_t *refresh_timer = nullptr;
  lv_obj_t *code_row = nullptr;
  lv_obj_t *status = nullptr;
  std::array<lv_obj_t *, COMPANION_PAIRING_CODE_LENGTH> letters{};
  std::string displayed_code;
  const lv_font_t *text_font = nullptr;
  const lv_font_t *title_font = nullptr;
};

inline DevicePairingUi &device_pairing_ui() {
  static DevicePairingUi ui;
  return ui;
}

inline void device_pairing_close() {
  auto &ui = device_pairing_ui();
  if (ui.refresh_timer) lv_timer_del(ui.refresh_timer);
  control_modal_delete_nested_overlay(ui.overlay);
  ui = {};
}

inline CompanionPairingSnapshot device_pairing_snapshot() {
  const auto &provider = companion_pairing_provider();
  return provider ? provider() : CompanionPairingSnapshot{};
}

inline lv_obj_t *device_pairing_label(lv_obj_t *parent, const char *text,
                                      const lv_font_t *font, uint32_t color) {
  auto *label = lv_label_create(parent);
  lv_obj_set_width(label, lv_pct(100));
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (font) lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(color), LV_PART_MAIN);
  lv_label_set_display_text(label, text);
  apply_text_width_compensation(label);
  return label;
}

inline lv_obj_t *device_pairing_row(lv_obj_t *parent, lv_coord_t gap) {
  auto *row = lv_obj_create(parent);
  lv_obj_remove_style_all(row);
  lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(row, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_size(row, lv_pct(100), LV_SIZE_CONTENT);
  lv_obj_set_style_pad_column(row, gap, LV_PART_MAIN);
  lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(row, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  return row;
}

inline void device_pairing_style_button(lv_obj_t *button,
                                        DevicePairingButtonColors colors = DEVICE_PAIRING_BUTTON_BLUE) {
  lv_obj_set_style_radius(button, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_bg_color(button, lv_color_hex(theme_display_color(colors.fill)), LV_PART_MAIN);
  control_modal_apply_pressed_fill_color(button, theme_display_color(colors.pressed));
  auto *label = lv_obj_get_child(button, 0);
  theme_set_content_foreground(label);
  lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
}

inline lv_obj_t *device_pairing_button(lv_obj_t *parent, const char *text, lv_coord_t max_width,
                                      lv_coord_t min_width, lv_coord_t height, const lv_font_t *font,
                                      DevicePairingButtonColors colors = DEVICE_PAIRING_BUTTON_BLUE) {
  auto *button = control_modal_create_text_button(parent, text, max_width, min_width, height,
      LV_RADIUS_CIRCLE, theme_display_color(colors.fill), font);
  device_pairing_style_button(button, colors);
  return button;
}

inline void device_pairing_show(const lv_font_t *text_font, const lv_font_t *title_font,
                                bool confirm_reset);

inline void device_pairing_refresh() {
  auto &ui = device_pairing_ui();
  if (screen_lock_enabled()) {
    control_modal_close_nested_menu();
    return;
  }
  const auto snapshot = device_pairing_snapshot();
  if (!ui.code_row) {
    if (!snapshot.paired && snapshot.active) device_pairing_show(ui.text_font, ui.title_font, false);
    return;
  }
  if (snapshot.paired) {
    control_modal_close_nested_menu();
    return;
  }
  if (!snapshot.active || snapshot.pairing_code.size() != ui.letters.size()) {
    control_modal_close_nested_menu();
    return;
  }
  if (snapshot.pairing_code == ui.displayed_code) return;
  ui.displayed_code = snapshot.pairing_code;
  for (size_t i = 0; i < ui.letters.size(); ++i) {
    const char glyph[] = {ui.displayed_code[i], '\0'};
    lv_label_set_text(ui.letters[i], glyph);
  }
  lv_obj_clear_flag(ui.code_row, LV_OBJ_FLAG_HIDDEN);
}

inline void device_pairing_show(const lv_font_t *text_font, const lv_font_t *title_font,
                                bool confirm_reset) {
  const auto &theme = current_theme();
  const auto layout = control_modal_calc_layout(icon_width_compensation_percent());
  const lv_coord_t radius = control_modal_card_radius(nullptr);
  const auto shell = control_modal_open_nested_menu(layout.panel_w, radius, device_pairing_close);
  auto &ui = device_pairing_ui();
  ui.overlay = shell.overlay;

  control_modal_style_overlay(shell.overlay);
  control_modal_style_panel(shell.panel, radius);
  lv_obj_set_align(shell.panel, LV_ALIGN_TOP_LEFT);
  control_modal_apply_panel_layout(shell.overlay, shell.panel, layout, radius);
  lv_obj_set_style_pad_left(shell.panel, layout.inset, LV_PART_MAIN);
  lv_obj_set_style_pad_right(shell.panel, layout.inset, LV_PART_MAIN);
  lv_obj_set_style_pad_row(shell.panel, control_modal_scaled_px(14, layout.short_side), LV_PART_MAIN);
  lv_obj_set_flex_flow(shell.panel, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(shell.panel, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  const lv_coord_t content_width = layout.panel_w - layout.inset * 2;
  const lv_coord_t button_height = std::max<lv_coord_t>(layout.profile.base_touch_target,
      control_modal_scaled_px(60, layout.short_side));
  const lv_coord_t tile_radius = control_modal_scaled_px(10, layout.short_side);
  const lv_coord_t gap = control_modal_scaled_px(6, layout.short_side);
  ui.refresh_timer = lv_timer_create([](lv_timer_t *) { device_pairing_refresh(); }, 500, nullptr);

  if (confirm_reset) {
    device_pairing_label(shell.panel, espdesktop_i18n_key("reset_pairing_question"), title_font, theme.text_primary);
    ui.status = device_pairing_label(shell.panel, espdesktop_i18n_key("reset_pairing_warning"),
                                      text_font, theme.text_muted);
    auto *actions = device_pairing_row(shell.panel, gap * 2);
    lv_obj_set_style_pad_top(actions, control_modal_scaled_px(16, layout.short_side), LV_PART_MAIN);
    const lv_coord_t width = std::min<lv_coord_t>((content_width - gap * 2) / 2,
        control_modal_scaled_px(192, layout.short_side));
    auto *cancel = device_pairing_button(actions, espdesktop_i18n_key("cancel"),
        width, width, button_height, text_font);
    auto *reset = device_pairing_button(actions, espdesktop_i18n_key("reset_pairing"),
        width, width, button_height, text_font, DEVICE_PAIRING_BUTTON_GREY);
    bind_immediate_button_action(cancel, [](lv_event_t *) { control_modal_close_nested_menu(); }, nullptr);

    ui.text_font = text_font;
    ui.title_font = title_font;
    bind_immediate_button_action(reset, [](lv_event_t *) {
      const auto &reset_pairing = companion_runtime_service().reset_and_begin_pairing;
      if (screen_lock_enabled() || !reset_pairing || !device_pairing_snapshot().available) return;
      if (!reset_pairing()) {
        lv_label_set_display_text(device_pairing_ui().status, espdesktop_i18n_key("reset_pairing_failed"));
        return;
      }
      const auto &ui = device_pairing_ui();
      device_pairing_show(ui.text_font, ui.title_font, false);
    }, nullptr);
    return;
  }

  device_pairing_label(shell.panel, espdesktop_i18n_key("pairing"), title_font, theme.text_primary);
  device_pairing_label(shell.panel, espdesktop_i18n_key("pairing_instructions"), text_font, theme.text_muted);
  ui.code_row = device_pairing_row(shell.panel, gap);
  const lv_coord_t code_row_padding = control_modal_scaled_px(12, layout.short_side);
  lv_obj_set_style_pad_top(ui.code_row, code_row_padding, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(ui.code_row, code_row_padding, LV_PART_MAIN);
  lv_obj_add_flag(ui.code_row, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_style_base_dir(ui.code_row, LV_BASE_DIR_LTR, LV_PART_MAIN);
  const auto letter_count = static_cast<lv_coord_t>(ui.letters.size());
  const lv_coord_t tile_width = std::min<lv_coord_t>(control_modal_scaled_px(80, layout.short_side),
      (content_width - gap * (letter_count - 1)) / letter_count);
  const lv_coord_t tile_height = control_modal_scaled_px(104, layout.short_side);
  // Allow room for the outline and the display's text width compensation.
  const int text_scale = width_compensation_scale(text_width_compensation_percent());
  const bool scale_height = width_compensation_vertical_axis();
  const auto font_fits = [&](const lv_font_t *font) {
    if (!font) return false;
    const auto width = lv_font_get_glyph_width(font, 'W', 0);
    const auto height = lv_font_get_line_height(font);
    return width > 0 &&
        width * (scale_height ? 256 : text_scale) <= (tile_width - 4) * 256 &&
        height * (scale_height ? text_scale : 256) <= (tile_height - 4) * 256;
  };
  const lv_font_t *code_font = display_active_pairing_code_font();
  if (!font_fits(code_font)) {
    code_font = font_fits(title_font) ? title_font : text_font;
  }
  for (size_t i = 0; i < ui.letters.size(); ++i) {
    auto *tile = lv_obj_create(ui.code_row);
    lv_obj_remove_style_all(tile);
    lv_obj_clear_flag(tile, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(tile, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(tile, tile_width, tile_height);
    lv_obj_set_style_border_width(tile, 2, LV_PART_MAIN);
    lv_obj_set_style_border_color(tile, lv_color_hex(theme_display_color(DEVICE_PAIRING_TILE_BORDER)), LV_PART_MAIN);
    lv_obj_set_style_radius(tile, tile_radius, LV_PART_MAIN);
    auto *letter = lv_label_create(tile);
    if (code_font) lv_obj_set_style_text_font(letter, code_font, LV_PART_MAIN);
    lv_obj_set_style_text_color(letter, lv_color_hex(theme.text_primary), LV_PART_MAIN);
    apply_text_width_compensation(letter);
    lv_obj_center(letter);
    ui.letters[i] = letter;
  }

  auto *done = device_pairing_button(shell.panel, espdesktop_i18n("Done"),
      content_width, button_height * 3, button_height, text_font);
  bind_immediate_button_action(done, [](lv_event_t *) { control_modal_close_nested_menu(); }, nullptr);
  device_pairing_refresh();
}

inline void device_pairing_open(const lv_font_t *text_font, const lv_font_t *title_font) {
  const auto &runtime = companion_runtime_service();
  if (screen_lock_enabled() || !runtime.begin_pairing) return;
  const auto snapshot = device_pairing_snapshot();
  if (!snapshot.available) return;
  if (snapshot.paired) {
    if (runtime.reset_and_begin_pairing) device_pairing_show(text_font, title_font, true);
    return;
  }
  runtime.begin_pairing();
  device_pairing_show(text_font, title_font, false);
}

inline void device_show_home_assistant_pairing(const std::string &code, const lv_font_t *font) {
  if (screen_lock_enabled() || device_pairing_ui().overlay) return;
  const auto layout = control_modal_calc_layout(icon_width_compensation_percent());
  const auto radius = control_modal_card_radius(nullptr);
  const auto shell = control_modal_open_nested_menu(layout.panel_w, radius, device_pairing_close);
  auto &ui = device_pairing_ui();
  ui.overlay = shell.overlay;
  control_modal_style_overlay(shell.overlay);
  control_modal_style_panel(shell.panel, radius);
  control_modal_apply_panel_layout(shell.overlay, shell.panel, layout, radius);
  lv_obj_set_style_pad_all(shell.panel, layout.inset, LV_PART_MAIN);
  lv_obj_set_style_pad_row(shell.panel, 8, LV_PART_MAIN);
  lv_obj_set_flex_flow(shell.panel, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(shell.panel, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  const auto &theme = current_theme();
  device_pairing_label(shell.panel, "Home Assistant", font, theme.text_primary);
  auto label = [&](const std::string &value) {
    auto *object = device_pairing_label(shell.panel, value.c_str(), font, theme.text_primary);
    lv_obj_set_style_base_dir(object, LV_BASE_DIR_LTR, LV_PART_MAIN);
  };
  label(code.substr(0, 32) + "\n" + code.substr(32, 32) + "\n\n" + code.substr(65));
  const auto width = layout.panel_w - layout.inset * 2;
  auto *done = device_pairing_button(shell.panel, espdesktop_i18n("Done"), width, width,
                                     layout.profile.base_touch_target, font);
  bind_immediate_button_action(done, [](lv_event_t *) { control_modal_close_nested_menu(); }, nullptr);
  ui.refresh_timer = lv_timer_create([](lv_timer_t *) { control_modal_close_nested_menu(); }, 120000, nullptr);
}
