#pragma once

#include <array>

#include "button_grid_modal.h"
#include "companion_controls.h"
#include "screen_lock_state.h"

inline constexpr size_t DEVICE_PAIRING_CODE_LENGTH = 9;  // Four letters, a dash, four letters.

struct DevicePairingUi {
  lv_obj_t *overlay = nullptr;
  lv_timer_t *refresh_timer = nullptr;
  lv_obj_t *code_row = nullptr;
  lv_obj_t *status = nullptr;
  std::array<lv_obj_t *, DEVICE_PAIRING_CODE_LENGTH> letters{};
  std::string displayed_code;
  const lv_font_t *text_font = nullptr;
  const lv_font_t *title_font = nullptr;
  std::string ip_address;
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

inline void device_pairing_refresh() {
  auto &ui = device_pairing_ui();
  if (screen_lock_enabled()) {
    control_modal_close_nested_menu();
    return;
  }
  if (!ui.code_row) return;
  const auto snapshot = device_pairing_snapshot();
  if (snapshot.paired) {
    control_modal_close_nested_menu();
    return;
  }
  if (!snapshot.active || snapshot.pairing_code.size() != ui.letters.size()) {
    if (!lv_obj_has_flag(ui.code_row, LV_OBJ_FLAG_HIDDEN)) {
      ui.displayed_code.clear();
      lv_obj_add_flag(ui.code_row, LV_OBJ_FLAG_HIDDEN);
      lv_label_set_display_text(ui.status, espdesktop_i18n("Expired"));
    }
    return;
  }
  if (snapshot.pairing_code == ui.displayed_code) return;
  ui.displayed_code = snapshot.pairing_code;
  for (size_t i = 0; i < ui.letters.size(); ++i) {
    const char glyph[] = {ui.displayed_code[i], '\0'};
    lv_label_set_text(ui.letters[i], glyph);
  }
  lv_obj_clear_flag(ui.code_row, LV_OBJ_FLAG_HIDDEN);
  lv_label_set_display_text(ui.status, espdesktop_i18n("Enter this code into the desktop app"));
}

inline void device_pairing_show(const lv_font_t *text_font, const lv_font_t *title_font,
                                 bool confirm_reset, const std::string &ip_address) {
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
  const lv_coord_t button_height = control_modal_scaled_px(48, layout.short_side);
  const lv_coord_t button_radius = control_modal_scaled_px(10, layout.short_side);
  const lv_coord_t gap = control_modal_scaled_px(6, layout.short_side);
  const auto button_fill = theme_display_color(theme.control_neutral);
  ui.refresh_timer = lv_timer_create([](lv_timer_t *) { device_pairing_refresh(); }, 500, nullptr);

  if (confirm_reset) {
    device_pairing_label(shell.panel, espdesktop_i18n_key("reset_pairing_question"), title_font, theme.text_primary);
    ui.status = device_pairing_label(shell.panel, espdesktop_i18n_key("reset_pairing_warning"),
                                      text_font, theme.text_muted);
    auto *actions = device_pairing_row(shell.panel, gap * 2);
    const lv_coord_t max_width = (content_width - gap * 2) / 2;
    auto *cancel = control_modal_create_text_button(actions, espdesktop_i18n_key("cancel"),
        max_width, button_height, button_height, button_radius, button_fill, text_font);
    auto *reset = control_modal_create_text_button(actions, espdesktop_i18n_key("reset_pairing"),
        max_width, button_height, button_height, button_radius, button_fill, text_font);
    bind_immediate_button_action(cancel, [](lv_event_t *) { control_modal_close_nested_menu(); }, nullptr);

    ui.text_font = text_font;
    ui.title_font = title_font;
    ui.ip_address = ip_address;
    bind_immediate_button_action(reset, [](lv_event_t *) {
      const auto &reset_pairing = companion_runtime_service().reset_and_begin_pairing;
      if (screen_lock_enabled() || !reset_pairing || !device_pairing_snapshot().available) return;
      if (!reset_pairing()) {
        lv_label_set_display_text(device_pairing_ui().status, espdesktop_i18n_key("reset_pairing_failed"));
        return;
      }
      const auto &ui = device_pairing_ui();
      const auto ip_address = ui.ip_address;
      device_pairing_show(ui.text_font, ui.title_font, false, ip_address);
    }, nullptr);
    return;
  }

  device_pairing_label(shell.panel, espdesktop_i18n("Pairing"), title_font, theme.text_primary);
  ui.status = device_pairing_label(shell.panel, espdesktop_i18n("Expired"), text_font, theme.text_muted);
  ui.code_row = device_pairing_row(shell.panel, gap);
  lv_obj_add_flag(ui.code_row, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_style_base_dir(ui.code_row, LV_BASE_DIR_LTR, LV_PART_MAIN);
  const lv_coord_t dash_width = control_modal_scaled_px(20, layout.short_side);
  const lv_coord_t tile_width = std::min(control_modal_scaled_px(50, layout.short_side),
                                         (content_width - dash_width - gap * 8) / 8);
  const lv_coord_t tile_height = control_modal_scaled_px(58, layout.short_side);
  // Some narrow displays use a larger heading font. Leave room for the
  // widest pairing letter and the outline on both sides of its box.
  const lv_font_t *code_font = title_font;
  if (!code_font || lv_font_get_glyph_width(code_font, 'W', 0) + 4 > tile_width ||
      lv_font_get_line_height(code_font) + 4 > tile_height) {
    code_font = text_font;
  }
  for (size_t i = 0; i < ui.letters.size(); ++i) {
    if (i == 4) {
      auto *dash = lv_label_create(ui.code_row);
      lv_obj_set_width(dash, dash_width);
      lv_obj_set_style_text_align(dash, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
      if (code_font) lv_obj_set_style_text_font(dash, code_font, LV_PART_MAIN);
      lv_obj_set_style_text_color(dash, lv_color_hex(theme.text_muted), LV_PART_MAIN);
      ui.letters[i] = dash;
      continue;
    }

    auto *tile = lv_obj_create(ui.code_row);
    lv_obj_remove_style_all(tile);
    lv_obj_clear_flag(tile, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_clear_flag(tile, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_size(tile, tile_width, tile_height);
    lv_obj_set_style_border_width(tile, 2, LV_PART_MAIN);
    lv_obj_set_style_border_color(tile, lv_color_hex(theme_display_color(theme.border)), LV_PART_MAIN);
    lv_obj_set_style_radius(tile, button_radius, LV_PART_MAIN);
    auto *letter = lv_label_create(tile);
    if (code_font) lv_obj_set_style_text_font(letter, code_font, LV_PART_MAIN);
    lv_obj_set_style_text_color(letter, lv_color_hex(theme.text_primary), LV_PART_MAIN);
    apply_text_width_compensation(letter);
    lv_obj_center(letter);
    ui.letters[i] = letter;
  }

  device_pairing_label(shell.panel, ip_address.c_str(), text_font, theme.text_muted);
  auto *done = control_modal_create_text_button(shell.panel, espdesktop_i18n("Done"),
      content_width, button_height * 2, button_height, button_radius, button_fill, text_font);
  bind_immediate_button_action(done, [](lv_event_t *) { control_modal_close_nested_menu(); }, nullptr);
  device_pairing_refresh();
}

inline void device_pairing_open(const lv_font_t *text_font, const lv_font_t *title_font,
                                 const std::string &ip_address) {
  const auto &runtime = companion_runtime_service();
  if (screen_lock_enabled() || !runtime.begin_pairing) return;
  const auto snapshot = device_pairing_snapshot();
  if (!snapshot.available) return;
  if (snapshot.paired) {
    if (runtime.reset_and_begin_pairing) device_pairing_show(text_font, title_font, true, ip_address);
    return;
  }
  runtime.begin_pairing();
  device_pairing_show(text_font, title_font, false, ip_address);
}
