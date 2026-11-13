// =============================================================================
// NETWORK STATUS - Clock-bar network icon, Settings grid and pairing modal
// =============================================================================
#pragma once

#include "device_pairing_ui.h"
#include "display_text.h"
#include "settings_backlight.h"
#include "network_status_layout.h"
#include "screen_lock_state.h"

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
  lv_obj_t *cards[NETWORK_STATUS_CARD_COUNT]{};
  lv_obj_t *icons[NETWORK_STATUS_CARD_COUNT]{};
  lv_obj_t *labels[NETWORK_STATUS_CARD_COUNT]{};
  int card_count = 0;
  lv_obj_t *pairing_button = nullptr;
  lv_obj_t *pairing_label = nullptr;
  lv_obj_t *wifi_label = nullptr;
  float (*wifi_quality)() = nullptr;
  const lv_font_t *text_font = nullptr;
  const lv_font_t *title_font = nullptr;
  lv_obj_t *ip_lbl = nullptr;
  lv_obj_t *connector_lbl = nullptr;
  lv_obj_t *connector_icon = nullptr;
  lv_timer_t *refresh_timer = nullptr;
  lv_coord_t columns[MAX_GRID_SLOTS + 1]{};
  lv_coord_t rows[MAX_GRID_SLOTS + 1]{};
};

inline void network_status_apply_theme(void *context, const ThemePalette &theme) {
  auto &ui = *static_cast<NetworkStatusModalUi *>(context);
  if (!ui.overlay) return;
  lv_obj_set_style_bg_color(ui.overlay, lv_color_hex(theme.background), LV_PART_MAIN);
  for (int i = 0; i < ui.card_count; ++i) {
    lv_obj_t *button = ui.cards[i];
    if (!button) continue;
    lv_obj_set_style_bg_color(button,
                              lv_color_hex(theme_display_color(theme.surface_card)),
                              LV_PART_MAIN);
    lv_obj_set_style_text_color(button, lv_color_hex(theme.text_primary), LV_PART_MAIN);
    if (ui.icons[i]) lv_obj_set_style_text_color(ui.icons[i], lv_color_hex(theme.text_primary), LV_PART_MAIN);
    if (ui.labels[i]) lv_obj_set_style_text_color(ui.labels[i], lv_color_hex(theme.text_primary), LV_PART_MAIN);
  }
}

inline const lv_font_t *&network_status_card_icon_font() {
  static const lv_font_t *font = nullptr;
  return font;
}

inline const lv_font_t *&network_status_notice_title_font() {
  static const lv_font_t *font = nullptr;
  return font;
}

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

// Defined by navigation after the built-in page helpers.
inline void navigation_subpage_screen_changed(lv_event_t *);

inline void network_status_hide_modal() {
  NetworkStatusModalUi &ui = network_status_modal_ui();
  if (ui.overlay && device_pairing_ui().overlay) control_modal_close_nested_menu();
  if (ui.refresh_timer) lv_timer_del(ui.refresh_timer);
  lv_obj_t *overlay = ui.overlay;
  if (overlay) unregister_theme_refresh(overlay);
  ui = NetworkStatusModalUi{};
  control_modal_clear_active(ControlModalKind::NETWORK_STATUS);
  if (overlay) {
    // App subpages repaint when their screen unloads. Settings is an overlay,
    // so update the title before revealing home and repaint the clock bar too.
    navigation_subpage_screen_changed(nullptr);
    lv_obj_del(overlay);
    lv_obj_invalidate(lv_layer_top());
  }
}

// Show once per compatibility failure. Settings retains the status after the
// notice is dismissed, and a successful connection clears both.
inline void network_status_sync_mac_update_notice() {
  static lv_obj_t *notice = nullptr;
  static bool shown = false;
  if (!companion_runtime_service().mac_update_required()) {
    if (notice) lv_obj_del(notice);
    shown = false;
    return;
  }
  const auto &metrics = control_modal_grid_metrics();
  if (shown || !metrics.page || control_modal_active().overlay || !lv_layer_top()) return;

  notice = lv_obj_create(lv_layer_top());
  if (!notice) return;
  shown = true;
  const auto layout = control_modal_calc_layout(icon_width_compensation_percent());
  control_modal_style_overlay(notice);
  lv_obj_set_style_radius(notice, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_color(notice, lv_color_black(), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(notice, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_pad_row(notice, control_modal_scaled_px(20, layout.short_side), LV_PART_MAIN);
  lv_obj_set_flex_flow(notice, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(notice, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_add_flag(notice, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(notice, [](lv_event_t *) { notice = nullptr; }, LV_EVENT_DELETE, nullptr);

  const auto *icon_font = network_status_card_icon_font();
  if (icon_font) {
    auto *icon = lv_label_create(notice);
    lv_obj_set_style_text_font(icon, icon_font, LV_PART_MAIN);
    lv_obj_set_style_text_color(icon, lv_color_white(), LV_PART_MAIN);
    lv_label_set_text(icon, find_icon("Sync"));
  }
  lv_obj_t *label = lv_label_create(notice);
  lv_obj_set_width(label, lv_pct(80));
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_white(), LV_PART_MAIN);
  if (const auto *font = network_status_notice_title_font())
    lv_obj_set_style_text_font(label, font, LV_PART_MAIN);
  lv_label_set_display_text(label, espdesktop_i18n_key("mac_update_reconnect"));
  apply_text_width_compensation(label);

  if (auto *close = control_modal_create_round_button(notice, layout.back_size, "\U000F0156",
          icon_font, 0, 0, icon_width_compensation_percent())) {
    lv_obj_add_flag(close, LV_OBJ_FLAG_IGNORE_LAYOUT);
    control_modal_style_chrome_button(close, layout, true);
    lv_obj_set_style_text_color(lv_obj_get_child(close, 0), lv_color_white(), LV_PART_MAIN);
    lv_obj_add_event_cb(close, [](lv_event_t *) { lv_obj_del(notice); }, LV_EVENT_CLICKED, nullptr);
  }
}

inline void network_status_refresh_page() {
  auto &ui = network_status_modal_ui();
  if (!ui.overlay) return;
  if (ui.wifi_label && ui.wifi_quality) {
    const float quality = ui.wifi_quality();
    const std::string label = std::isfinite(quality)
        ? std::to_string(static_cast<int>(std::lround(std::max(0.0f, std::min(100.0f, quality))))) + "%"
        : espdesktop_i18n("Disconnected");
    lv_label_set_display_text(ui.wifi_label, label.c_str());
  }
  lv_label_set_display_text(ui.ip_lbl, network_status_ip_address().c_str());
  const auto snapshot = companion_pairing_provider()
      ? companion_pairing_provider()() : CompanionPairingSnapshot{};
  lv_label_set_display_text(ui.pairing_label, espdesktop_i18n(snapshot.paired ? "Paired" : "Unpaired"));
  const char *state = espdesktop_i18n("Unavailable");
  const char *icon = "\U000F0319";
  if (snapshot.available) {
    if (snapshot.connected) {
      state = espdesktop_i18n("Connected");
      icon = "\U000F031A";
    } else if (snapshot.paired) {
      state = companion_runtime_service().mac_update_required()
          ? espdesktop_i18n_key("mac_update_required") : espdesktop_i18n("Disconnected");
    } else {
      state = espdesktop_i18n("Not paired");
      icon = "\U000F0D33";
    }
  }
  lv_label_set_display_text(ui.connector_lbl, state);
  lv_label_set_display_text(ui.connector_icon, icon);
  const auto &runtime = companion_runtime_service();
  const bool can_pair = snapshot.available &&
      (snapshot.paired ? static_cast<bool>(runtime.reset_and_begin_pairing)
                       : static_cast<bool>(runtime.begin_pairing));
  if (can_pair && !screen_lock_enabled()) {
    lv_obj_clear_state(ui.pairing_button, LV_STATE_DISABLED);
    lv_obj_add_flag(ui.pairing_button, LV_OBJ_FLAG_CLICKABLE);
  } else {
    lv_obj_add_state(ui.pairing_button, LV_STATE_DISABLED);
    lv_obj_clear_flag(ui.pairing_button, LV_OBJ_FLAG_CLICKABLE);
  }
}

inline void network_status_open_modal(const std::string &device_name,
                                      const std::string &ip_address,
                                      const std::string &firmware_version,
                                      const lv_font_t *text_font,
                                      const lv_font_t *icon_font,
                                      float (*wifi_quality)() = nullptr) {
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
  ui.wifi_quality = wifi_quality;
  ui.text_font = label_font;
  ui.title_font = text_font;
  const lv_color_t text_color = lv_color_hex(current_theme().text_primary);
  const lv_coord_t radius = control_modal_card_radius(reference);
  const lv_coord_t card_pad = reference ? lv_obj_get_style_pad_top(reference, LV_PART_MAIN) : 8;
  const bool continuous_corners = card_uses_continuous_corners(reference);

  ui.overlay = lv_obj_create(lv_layer_top());
  // Leave the clock bar exposed, using the same reserved space as the grid.
  lv_obj_update_layout(page);
  const lv_coord_t top = lv_obj_get_style_pad_top(page, LV_PART_MAIN);
  lv_obj_set_size(ui.overlay, lv_pct(100), lv_obj_get_height(page) - top);
  lv_obj_set_pos(ui.overlay, 0, top);
  lv_obj_clear_flag(ui.overlay, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_radius(ui.overlay, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.overlay, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ui.overlay, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_bg_color(ui.overlay, lv_obj_get_style_bg_color(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_top(ui.overlay, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(ui.overlay, lv_obj_get_style_pad_bottom(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_left(ui.overlay, lv_obj_get_style_pad_left(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_right(ui.overlay, lv_obj_get_style_pad_right(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_row(ui.overlay, lv_obj_get_style_pad_row(page, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_pad_column(ui.overlay, lv_obj_get_style_pad_column(page, LV_PART_MAIN), LV_PART_MAIN);

  const int cols = std::max(1, std::min(metrics.cols, MAX_GRID_SLOTS));
  const int card_count = NETWORK_STATUS_CARD_COUNT - (wifi_quality ? 0 : 1);
  const int rows = network_status_grid_rows(cols,
      std::max(1, std::min(metrics.rows, MAX_GRID_SLOTS)), card_count);
  for (int i = 0; i < cols; ++i) ui.columns[i] = LV_GRID_FR(1);
  for (int i = 0; i < rows; ++i) ui.rows[i] = LV_GRID_FR(1);
  ui.columns[cols] = LV_GRID_TEMPLATE_LAST;
  ui.rows[rows] = LV_GRID_TEMPLATE_LAST;
  lv_obj_set_layout(ui.overlay, LV_LAYOUT_GRID);
  lv_obj_set_grid_dsc_array(ui.overlay, ui.columns, ui.rows);

  const char *labels[] = {espdesktop_i18n("Back"), "", "", "", "", "", device_name.c_str()};
  const char *icons[] = {"\U000F0141", "\U000F0200", "\U000F0D33", "\U000F031A", "\U000F05A9", "\U000F035B", "\U000F0200"};
  const lv_font_t *card_icon_font = network_status_card_icon_font();
  if (!card_icon_font) card_icon_font = icon_font;
  int visible_index = 0;
  for (int i = 0; i < NETWORK_STATUS_CARD_COUNT; ++i) {
    if (i == NETWORK_STATUS_WIFI_CARD_INDEX && !wifi_quality) continue;
    auto *button = create_grid_card_button(ui.overlay, radius, card_pad,
        label_font, text_color, continuous_corners);
    const int card_index = ui.card_count++;
    ui.cards[card_index] = button;
    apply_button_colors(button, false, DEFAULT_ACCENT_COLOR, true,
                        theme_display_color(current_theme().surface_card));
    const auto cell = network_status_grid_cell(visible_index++, cols);
    lv_obj_set_grid_cell(button, LV_GRID_ALIGN_STRETCH, cell.column, 1,
                         LV_GRID_ALIGN_STRETCH, cell.row, 1);
    BtnSlot slot = create_dynamic_card_slot(button, card_icon_font, label_font, label_font, text_color);
    ui.icons[card_index] = slot.icon_lbl;
    ui.labels[card_index] = slot.text_lbl;
    apply_width_compensation(slot.icon_lbl, icon_width_compensation_percent());
    apply_text_width_compensation(slot.text_lbl);
    lv_label_set_display_text(slot.text_lbl, labels[i]);
    lv_label_set_display_text(slot.icon_lbl, icons[i]);
    if (i == NETWORK_STATUS_BACK_CARD_INDEX) {
      lv_label_set_display_text(slot.icon_lbl, "\U000F0141");
      bind_immediate_button_action(button, [](lv_event_t *) { network_status_hide_modal(); }, nullptr);
      continue;
    }
    if (i == NETWORK_STATUS_PAIRING_CARD_INDEX) {
      ui.pairing_button = button;
      ui.pairing_label = slot.text_lbl;
      bind_immediate_button_action(button, [](lv_event_t *) {
        const auto &ui = network_status_modal_ui();
        device_pairing_open(ui.text_font, ui.title_font, network_status_ip_address());
      }, nullptr);
      continue;
    }
    lv_obj_clear_flag(button, LV_OBJ_FLAG_CLICKABLE);
    if (i == NETWORK_STATUS_CONNECTOR_CARD_INDEX) {
      ui.connector_lbl = slot.text_lbl;
      ui.connector_icon = slot.icon_lbl;
    } else if (i == NETWORK_STATUS_WIFI_CARD_INDEX) {
      ui.wifi_label = slot.text_lbl;
    } else if (i == NETWORK_STATUS_BUILD_CARD_INDEX) {
      const std::string build_label = network_status_firmware_label(firmware_version);
      lv_label_set_display_text(slot.text_lbl, build_label.c_str());
    } else if (i == NETWORK_STATUS_IP_CARD_INDEX) {
      ui.ip_lbl = slot.text_lbl;
    }
  }
  control_modal_set_active(ControlModalKind::NETWORK_STATUS, ui.overlay,
                          network_status_hide_modal, ControlModalDismissPolicy::DISMISS);
  if (!register_theme_refresh(ui.overlay, network_status_apply_theme, &ui))
    ESP_LOGW("theme", "Refresh registry full; network status will not follow theme changes");
  lv_obj_add_event_cb(ui.overlay, [](lv_event_t *event) {
    unregister_theme_refresh(lv_event_get_target(event));
    network_status_modal_ui().overlay = nullptr;
  }, LV_EVENT_DELETE, nullptr);
  apply_current_theme();
  lv_obj_update_layout(ui.overlay);
  network_status_refresh_page();
  ui.refresh_timer = lv_timer_create([](lv_timer_t *) { network_status_refresh_page(); }, 1000, nullptr);
  lv_obj_move_foreground(ui.overlay);
  navigation_subpage_screen_changed(nullptr);
}
