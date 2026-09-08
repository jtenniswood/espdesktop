// =============================================================================
// NETWORK STATUS - Clock-bar network icon, Settings grid and pairing modal
// =============================================================================
#pragma once

#include "display_text.h"

#include <cmath>
#include <cstdlib>
#include <string>
#include "esphome/components/network/ip_address.h"
#include "esphome/components/network/util.h"
#include "i18n_generated.h"

constexpr const char *NETWORK_ICON_WIFI_OUTLINE = "\U000F092F";
constexpr const char *NETWORK_ICON_WIFI_1 = "\U000F091F";
constexpr const char *NETWORK_ICON_WIFI_2 = "\U000F0922";
constexpr const char *NETWORK_ICON_WIFI_3 = "\U000F0925";
constexpr const char *NETWORK_ICON_WIFI_4 = "\U000F0928";
constexpr const char *NETWORK_ICON_WIFI_OFF_OUTLINE = "\U000F092E";
constexpr const char *NETWORK_ICON_ETHERNET = "\U000F0200";

// A full-page grid uses the existing transient-view lifecycle. The underlying
// screen stays loaded, so Back preserves the exact originating subpage and
// display takeover never reloads an obsolete screen.
struct NetworkStatusModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *pairing_overlay = nullptr;
  lv_obj_t *pairing_code = nullptr;
  lv_obj_t *pairing_ip = nullptr;
  lv_obj_t *pairing_button = nullptr;
  const lv_font_t *text_font = nullptr;
  lv_obj_t *ip_lbl = nullptr;
  lv_obj_t *connector_lbl = nullptr;
  lv_obj_t *connector_icon = nullptr;
  lv_timer_t *refresh_timer = nullptr;
  lv_coord_t columns[5]{};
  lv_coord_t rows[5]{};
};

inline NetworkStatusModalUi &network_status_modal_ui() {
  static NetworkStatusModalUi ui;
  return ui;
}

inline const char *network_status_wifi_icon(float pct) {
  if (!std::isfinite(pct) || pct <= 0.0f) return NETWORK_ICON_WIFI_OUTLINE;
  if (pct < 25.0f) return NETWORK_ICON_WIFI_1;
  if (pct < 50.0f) return NETWORK_ICON_WIFI_2;
  if (pct < 75.0f) return NETWORK_ICON_WIFI_3;
  return NETWORK_ICON_WIFI_4;
}

inline void network_status_set_wifi_icon(lv_obj_t *label, float pct, bool connected) {
  if (!label) return;
  if (!connected) {
    lv_label_set_display_text(label, NETWORK_ICON_WIFI_OFF_OUTLINE);
    return;
  }
  lv_label_set_display_text(label, network_status_wifi_icon(pct));
}

inline void network_status_set_ethernet_icon(lv_obj_t *label) {
  if (!label) return;
  lv_label_set_display_text(label, NETWORK_ICON_ETHERNET);
}

inline void network_status_update_visibility(lv_obj_t *button, lv_obj_t *main_page_obj,
                                             bool clock_bar_enabled,
                                             bool network_status_enabled) {
  if (!button) return;
  if (clock_bar_enabled && network_status_enabled &&
      clock_bar_active_on_button_grid_page(main_page_obj)) {
    lv_obj_clear_flag(button, LV_OBJ_FLAG_HIDDEN);
  } else {
    lv_obj_add_flag(button, LV_OBJ_FLAG_HIDDEN);
  }
}

inline std::string network_status_ip_address() {
  auto ips = esphome::network::get_ip_addresses();
  if (!ips.empty()) {
    char ip_buf[esphome::network::IP_ADDRESS_BUFFER_SIZE];
    ips[0].str_to(ip_buf);
    return ip_buf;
  }
  return espdesktop_i18n(std::string("Not available"));
}

inline std::string network_status_trim_copy(const std::string &value) {
  const size_t first = value.find_first_not_of(" \t\r\n");
  if (first == std::string::npos) return "";
  const size_t last = value.find_last_not_of(" \t\r\n");
  return value.substr(first, last - first + 1);
}

inline bool network_status_is_specific_firmware_version(const std::string &version) {
  std::string trimmed = network_status_trim_copy(version);
  const size_t len = trimmed.size();
  if (len < 6 || (trimmed[0] != 'v' && trimmed[0] != 'V')) return false;

  size_t pos = 1;
  auto read_number = [&]() -> bool {
    if (pos >= len || !std::isdigit(static_cast<unsigned char>(trimmed[pos]))) return false;
    while (pos < len && std::isdigit(static_cast<unsigned char>(trimmed[pos]))) ++pos;
    return true;
  };

  if (!read_number()) return false;
  for (int part = 0; part < 2; ++part) {
    if (pos >= len || trimmed[pos] != '.') return false;
    ++pos;
    if (!read_number()) return false;
  }
  if (pos == len) return true;
  if (trimmed[pos] != '-' && trimmed[pos] != '+') return false;
  ++pos;
  if (pos == len) return false;
  while (pos < len) {
    unsigned char c = static_cast<unsigned char>(trimmed[pos]);
    if (!std::isalnum(c) && trimmed[pos] != '.' && trimmed[pos] != '-') return false;
    ++pos;
  }
  return true;
}

inline std::string network_status_firmware_label(const std::string &version) {
  std::string trimmed = network_status_trim_copy(version);
  if (trimmed.empty()) return espdesktop_i18n(std::string("Version unknown"));
  if (trimmed == "Version unknown") return espdesktop_i18n(std::string("Version unknown"));
  if (network_status_is_specific_firmware_version(trimmed)) return trimmed;
  return espdesktop_i18n(std::string("Dev build"));
}

inline void network_status_hide_modal() {
  NetworkStatusModalUi &ui = network_status_modal_ui();
  if (ui.pairing_overlay) control_modal_close_nested_menu();
  if (ui.refresh_timer) lv_timer_del(ui.refresh_timer);
  if (ui.overlay) {
    screen_lock_unregister_tree(ui.overlay);
    lv_obj_del(ui.overlay);
  }
  ui = NetworkStatusModalUi{};
  control_modal_clear_active(ControlModalKind::NETWORK_STATUS);
}

inline void network_status_close_pairing() {
  auto &ui = network_status_modal_ui();
  control_modal_delete_nested_overlay(ui.pairing_overlay);
  ui.pairing_code = nullptr;
  ui.pairing_ip = nullptr;
}

inline lv_obj_t *network_status_pairing_label(lv_obj_t *parent, const char *text) {
  auto *label = lv_label_create(parent);
  lv_obj_set_width(label, lv_pct(100));
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_text_font(label, network_status_modal_ui().text_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(DARK_TEXT_PRIMARY), LV_PART_MAIN);
  lv_label_set_display_text(label, text);
  apply_text_width_compensation(label);
  return label;
}

inline void network_status_refresh_page();

inline void network_status_open_pairing() {
  auto &ui = network_status_modal_ui();
  auto &begin = companion_runtime_service().begin_pairing;
  if (!ui.overlay || screen_lock_enabled() || !begin ||
      !companion_pairing_provider() || !companion_pairing_provider()().available) return;
  begin();
  const auto layout = control_modal_calc_layout(icon_width_compensation_percent());
  const auto shell = control_modal_open_nested_menu(
      layout.panel_w, control_modal_card_radius(nullptr), network_status_close_pairing);
  ui.pairing_overlay = shell.overlay;
  lv_obj_set_layout(shell.panel, LV_LAYOUT_FLEX);
  lv_obj_set_flex_flow(shell.panel, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(shell.panel, control_modal_scaled_px(12, layout.short_side), LV_PART_MAIN);
  network_status_pairing_label(shell.panel, espdesktop_i18n("Pairing"));
  ui.pairing_code = network_status_pairing_label(shell.panel, "");
  network_status_pairing_label(shell.panel, espdesktop_i18n("IP address"));
  ui.pairing_ip = network_status_pairing_label(shell.panel, "");
  network_status_pairing_label(shell.panel, espdesktop_i18n("Enter this code in the Mac app"));
  auto *back = control_modal_create_list_row(shell.panel, espdesktop_i18n("Back"), false,
      layout.back_size, control_modal_card_radius(nullptr), DARK_BORDER, DARK_BORDER,
      ui.text_font, icon_width_compensation_percent());
  lv_obj_add_event_cb(back, [](lv_event_t *) { control_modal_close_nested_menu(); },
                      LV_EVENT_CLICKED, nullptr);
  network_status_refresh_page();
}

inline void network_status_refresh_page() {
  auto &ui = network_status_modal_ui();
  if (!ui.overlay) return;
  lv_label_set_display_text(ui.ip_lbl, network_status_ip_address().c_str());
  const auto snapshot = companion_pairing_provider()
      ? companion_pairing_provider()() : CompanionPairingSnapshot{};
  const char *state = espdesktop_i18n("Unavailable");
  const char *icon = "\U000F0156";
  if (snapshot.available) {
    if (snapshot.connected) {
      state = espdesktop_i18n("Connected");
      icon = "\U000F0379";
    } else if (snapshot.paired) {
      state = espdesktop_i18n("Disconnected");
    } else {
      state = espdesktop_i18n("Not paired");
      icon = "\U000F0493";
    }
  }
  lv_label_set_display_text(ui.connector_lbl, state);
  lv_label_set_display_text(ui.connector_icon, icon);
  const bool can_pair = snapshot.available && companion_runtime_service().begin_pairing;
  if (can_pair && !screen_lock_enabled()) {
    lv_obj_clear_state(ui.pairing_button, LV_STATE_DISABLED);
    lv_obj_add_flag(ui.pairing_button, LV_OBJ_FLAG_CLICKABLE);
  } else {
    lv_obj_add_state(ui.pairing_button, LV_STATE_DISABLED);
    lv_obj_clear_flag(ui.pairing_button, LV_OBJ_FLAG_CLICKABLE);
  }
  if (ui.pairing_code) {
    const char *code = snapshot.active ? snapshot.pairing_code.c_str()
        : (snapshot.connected ? espdesktop_i18n("Connected") : espdesktop_i18n("Expired"));
    lv_label_set_display_text(ui.pairing_code, code);
    lv_label_set_display_text(ui.pairing_ip, network_status_ip_address().c_str());
  }
}

inline void network_status_open_modal(const std::string &device_name,
                                      const std::string &ip_address,
                                      const std::string &firmware_version,
                                      const lv_font_t *text_font,
                                      const lv_font_t *icon_font) {
  (void) device_name;
  (void) ip_address;
  control_modal_close_nested_menu();
  control_modal_force_close_active();
  network_status_hide_modal();
  auto &ui = network_status_modal_ui();
  const auto &metrics = control_modal_grid_metrics();
  lv_obj_t *page = metrics.page ? metrics.page : lv_scr_act();
  lv_obj_t *reference = metrics.first_card ? metrics.first_card : page;
  const lv_font_t *label_font = lv_obj_get_style_text_font(reference, LV_PART_MAIN);
  if (!label_font) label_font = text_font;
  ui.text_font = label_font;
  const lv_color_t text_color = lv_obj_get_style_text_color(reference, LV_PART_MAIN);

  ui.overlay = lv_obj_create(lv_layer_top());
  lv_obj_set_size(ui.overlay, lv_pct(100), lv_pct(100));
  lv_obj_set_pos(ui.overlay, 0, 0);
  lv_obj_clear_flag(ui.overlay, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_radius(ui.overlay, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.overlay, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ui.overlay, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_bg_color(ui.overlay, lv_obj_get_style_bg_color(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_top(ui.overlay, lv_obj_get_style_pad_top(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(ui.overlay, lv_obj_get_style_pad_bottom(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_left(ui.overlay, lv_obj_get_style_pad_left(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_right(ui.overlay, lv_obj_get_style_pad_right(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_row(ui.overlay, lv_obj_get_style_pad_row(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_column(ui.overlay, lv_obj_get_style_pad_column(page, LV_PART_MAIN), LV_PART_MAIN);

  // Built-in tiles use the normal column count up to four. Extra rows
  // give addresses and translated labels room to wrap.
  const int cols = std::max(2, std::min(4, metrics.cols));
  const int rows = (5 + cols - 1) / cols;
  for (int i = 0; i < cols; ++i) ui.columns[i] = LV_GRID_FR(1);
  for (int i = 0; i < rows; ++i) ui.rows[i] = LV_GRID_FR(1);
  ui.columns[cols] = LV_GRID_TEMPLATE_LAST;
  ui.rows[rows] = LV_GRID_TEMPLATE_LAST;
  lv_obj_set_layout(ui.overlay, LV_LAYOUT_GRID);
  lv_obj_set_grid_dsc_array(ui.overlay, ui.columns, ui.rows);

  const char *labels[] = {espdesktop_i18n("Back"), espdesktop_i18n("Build"),
                         espdesktop_i18n("IP address"), espdesktop_i18n("Connector"),
                         espdesktop_i18n("Pairing")};
  for (int i = 0; i < 5; ++i) {
    auto *button = create_grid_card_button(ui.overlay,
        lv_obj_get_style_radius(reference, LV_PART_MAIN),
        lv_obj_get_style_pad_top(reference, LV_PART_MAIN), label_font, text_color);
    apply_button_colors(button, false, DEFAULT_SLIDER_COLOR, true,
                        DEFAULT_OFF_COLOR);
    lv_obj_set_grid_cell(button, LV_GRID_ALIGN_STRETCH, i % cols, 1,
                         LV_GRID_ALIGN_STRETCH, i / cols, 1);
    BtnSlot slot = create_dynamic_card_slot(button, icon_font, label_font, label_font, text_color);
    apply_width_compensation(slot.icon_lbl, icon_width_compensation_percent());
    apply_text_width_compensation(slot.text_lbl);
    lv_label_set_display_text(slot.text_lbl, labels[i]);
    if (i == 0) {
      lv_label_set_display_text(slot.icon_lbl, "\U000F0141");
      lv_obj_add_event_cb(button, [](lv_event_t *) { network_status_hide_modal(); },
                          LV_EVENT_CLICKED, nullptr);
      continue;
    }
    if (i == 4) {
      lv_label_set_display_text(slot.icon_lbl, "\U000F0493");
      ui.pairing_button = button;
      lv_obj_add_event_cb(button, [](lv_event_t *) { network_status_open_pairing(); },
                          LV_EVENT_CLICKED, nullptr);
      continue;
    }
    lv_obj_clear_flag(button, LV_OBJ_FLAG_CLICKABLE);
    auto *value = lv_label_create(button);
    lv_obj_set_style_text_font(value, label_font, LV_PART_MAIN);
    lv_label_set_long_mode(value, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(value, lv_pct(100));
    apply_text_width_compensation(value);
    if (i == 3) {
      lv_obj_align(value, LV_ALIGN_LEFT_MID, 0, 0);
      ui.connector_lbl = value;
      ui.connector_icon = slot.icon_lbl;
    } else {
      lv_obj_add_flag(slot.icon_lbl, LV_OBJ_FLAG_HIDDEN);
      lv_obj_align(value, LV_ALIGN_TOP_LEFT, 0, 0);
      if (i == 1) lv_label_set_display_text(value, network_status_firmware_label(firmware_version).c_str());
      else ui.ip_lbl = value;
    }
  }
  control_modal_set_active(ControlModalKind::NETWORK_STATUS, ui.overlay,
                          network_status_hide_modal, ControlModalDismissPolicy::DISMISS);
  network_status_refresh_page();
  ui.refresh_timer = lv_timer_create([](lv_timer_t *) { network_status_refresh_page(); }, 1000, nullptr);
  lv_obj_move_foreground(ui.overlay);
}
