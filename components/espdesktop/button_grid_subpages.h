#pragma once

#include "button_grid_order_parser.h"
#include "page_store.h"

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// ── Subpage helpers ───────────────────────────────────────────────────

// Button definition parsed from a subpage config (pipe+colon delimited)
struct SubpageBtn {
  std::string entity;
  std::string label;
  std::string icon;
  std::string icon_on;
  std::string sensor;     // sensor entity, cover/internal mode, or action name
  std::string unit;
  std::string type;       // button type: "" (toggle), action, door_window, presence, weather_forecast, slider, light_brightness, light_switch, fan_*, cover, garage, gate, lock, alarm, alarm_action, media, push, internal, subpage
  std::string precision;  // decimal places for sensor display; "text" = text sensor mode
  std::string options;    // comma-delimited card options
};

inline bool subpage_btn_same_definition(const SubpageBtn &left,
                                        const SubpageBtn &right) {
  return left.entity == right.entity && left.label == right.label &&
         left.icon == right.icon && left.icon_on == right.icon_on &&
         left.sensor == right.sensor && left.unit == right.unit &&
         left.type == right.type && left.precision == right.precision &&
         left.options == right.options;
}

inline std::vector<std::string> split_subpage_fields(const std::string &value, char delim) {
  std::vector<std::string> out;
  size_t start = 0;
  while (start <= value.length()) {
    size_t end = value.find(delim, start);
    if (end == std::string::npos) end = value.length();
    out.push_back(value.substr(start, end - start));
    start = end + 1;
  }
  return out;
}

inline std::string compact_subpage_type(const std::string &code) {
  return card_runtime_subpage_type_from_code(code);
}

inline std::string decode_compact_subpage_field(const std::string &value) {
  return decode_compact_field(value);
}

inline std::string decode_compact_subpage_field(const std::string &value, size_t start, size_t len) {
  return decode_compact_field(value, start, len);
}

inline SubpageBtn normalize_subpage_btn(SubpageBtn b) {
  const std::string retired_type = retired_saved_card_type(b.type, b.entity);
  if (retired_type == "companion_webapp" || retired_type == "companion_audio" ||
      retired_type == "companion_window") {
    b = SubpageBtn{};
    b.type = retired_type;
    b.icon = "Auto";
    b.icon_on = "Auto";
    return b;
  }
  // Shared appearance options must survive the same cleanup as main cards.
  const std::string icon_size = cfg_option_value(b.options, "icon_size");
  std::string type_options;
  for (const auto &token : split_subpage_fields(b.options, ',')) {
    if (token.empty() || token.compare(0, 10, "icon_size=") == 0) continue;
    if (!type_options.empty()) type_options += ",";
    type_options += token;
  }
  b.options = type_options;
  // Shared colours must survive the card-specific option cleanup below.
  const std::string card_colors = card_color_options_normalized(b.options);
  b.options = options_without_card_colors(b.options);
  if (brightness_slider_type(b.type) && !b.sensor.empty()) b.sensor.clear();
  if (fan_card_type(b.type)) {
    b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    b.options = b.type == "fan_control" ? fan_control_card_options_normalized(b.options) : "";
    if (b.icon.empty() || b.icon == "Auto") b.icon = fan_card_default_icon_name(b.type);
    if (b.type == "fan_switch") {
      if (b.icon_on.empty() || b.icon_on == "Auto") b.icon_on = "Fan";
    } else {
      b.icon_on.clear();
    }
  }
  if (b.type == "weather_forecast") {
    b.type = "weather";
    b.precision = "tomorrow";
    if (b.label == "Weather") b.label.clear();
  }
  if (b.type == "weather" && b.precision != "wind" && b.precision != "rainfall" && !card_runtime_weather_forecast_precision(b.precision)) {
    b.precision.clear();
  }
  if (b.type == "media") {
    if (b.sensor == "controls") {
      if (b.icon.empty() || b.icon == "Speaker") b.icon = "Auto";
      b.sensor = "play_pause";
    } else if (b.sensor.empty()) {
      b.sensor = "play_pause";
    } else if (b.sensor != "play_pause" && b.sensor != "previous" &&
               b.sensor != "next" && b.sensor != "volume" &&
               b.sensor != "position" && b.sensor != "now_playing" &&
               b.sensor != "cover_art" &&
               b.sensor != "control_modal" && b.sensor != "speaker_group" &&
               b.sensor != "playlist") {
      b.sensor = "play_pause";
    }
    if (b.sensor == "previous" && b.label == "Skip Previous") b.label = espdesktop_i18n("Previous");
    if (b.sensor == "next" && b.label == "Skip Next") b.label = espdesktop_i18n("Next");
    if (b.sensor == "volume") {
      if (b.label.empty() || b.label == "Media") b.label = espdesktop_i18n("Volume");
      b.icon = "Auto";
    }
    if (b.sensor == "playlist") {
      if (b.label.empty() || b.label == "Media") b.label = espdesktop_i18n("Playlist");
      if (b.icon.empty() || b.icon == "Auto") b.icon = "Music";
    }
    if (b.sensor == "position" && (b.label.empty() || b.label == "Track")) b.label = espdesktop_i18n("Position");
    if (b.sensor == "now_playing") {
      b.precision = (b.precision == "progress" || b.precision == "play_pause") ? b.precision : "";
    } else if (b.sensor == "cover_art") {
      b.precision.clear();
    } else if ((b.sensor == "play_pause" || b.sensor == "position") && b.precision == "state") {
      b.precision = "state";
    } else {
      b.precision.clear();
    }
    b.options = media_card_options_normalized(b.options, b.sensor);
  }
  if (climate_card_type(b.type)) {
    b.sensor.clear();
    b.unit.clear();
    b.options = climate_card_options_normalized(b.options);
  }
  if (b.type == "garage") {
    if (b.sensor != "open" && b.sensor != "close") b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    if (!b.sensor.empty()) b.icon_on.clear();
    b.options = garage_card_options_normalized(b.options, b.sensor);
  }
  if (b.type == "gate") {
    if (b.sensor != "open" && b.sensor != "close" && b.sensor != "stop") b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    if (!b.sensor.empty()) b.icon_on.clear();
    b.options = gate_card_options_normalized(b.options, b.sensor);
  }
  if (b.type == "cover") {
    if (!card_runtime_cover_mode_valid(b.sensor)) b.sensor.clear();
    b.precision.clear();
    if (b.sensor != "set_position") b.unit.clear();
    b.options = cover_card_options_normalized(b.options, b.sensor);
  }
  if (b.type == "alarm") {
    b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    b.icon_on.clear();
    b.options = alarm_card_options_normalized(b.options);
    if (b.icon.empty() || b.icon == "Auto") b.icon = "Security";
  }
  if (b.type == "alarm_action") {
    if (!alarm_action_mode_valid(b.sensor)) b.sensor = "away";
    b.unit.clear();
    b.precision.clear();
    b.icon_on.clear();
    b.options = alarm_card_options_normalized(b.options);
    const char *label_key = b.sensor == "home" ? "arm_home"
      : b.sensor == "night" ? "arm_night"
      : b.sensor == "vacation" ? "arm_vacation"
      : b.sensor == "disarm" ? "disarm" : "arm_away";
    if (b.label.empty() || b.label == espdesktop_i18n_key_en(label_key)) {
      b.label = espdesktop_i18n_key(label_key);
    }
    if (b.icon.empty() || b.icon == "Auto" || alarm_action_legacy_icon_name(b.sensor, b.icon)) {
      b.icon = alarm_action_icon_name(b.sensor);
    }
  }
  if (b.type == "image") {
    b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    b.options = image_card_options_normalized(b.options);
    normalize_image_card_overlay_fields(b.icon, b.options);
    b.icon_on = "Auto";
  }
  if (b.type == "light_switch") {
    b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    b.options.clear();
  }
  if (b.type == "light_control") {
    b.sensor.clear();
    b.unit.clear();
    b.precision.clear();
    b.options = light_control_card_options_normalized(b.options);
  }
  if (b.type == "subpage") {
    b.options = subpage_card_options_normalized(b.options, b.sensor, b.precision);
  }
  if (b.type == "option_select") {
    b.type = "action";
    b.sensor = "input_select.select_option";
    b.unit.clear();
    b.precision.clear();
    b.options.clear();
    b.icon_on.clear();
    if (b.icon.empty() || b.icon == "Auto" || b.icon == "Chevron Down") b.icon = "Flash";
  }
  if (b.type == "door_window") {
    b.entity.clear();
    b.unit.clear();
    b.precision = normalize_door_window_subtype(b.precision);
    if (b.icon.empty() || b.icon == "Auto") b.icon = door_window_closed_icon_name(b.precision);
    if (b.icon_on.empty() || b.icon_on == "Auto") b.icon_on = door_window_open_icon_name(b.precision);
    b.options = door_window_card_options_normalized(b.options);
  }
  if (b.type == "presence") {
    b.entity.clear();
    b.unit.clear();
    b.precision.clear();
    if (b.icon.empty() || b.icon == "Auto") b.icon = "Motion Sensor Off";
    if (b.icon_on.empty() || b.icon_on == "Auto") b.icon_on = "Motion Sensor";
    b.options = presence_card_options_normalized(b.options);
  }
  ParsedCfg p;
  p.type = b.type;
  p.precision = b.precision;
  if (!b.type.empty() && b.type != "action" && b.type != "alarm" &&
      b.type != "alarm_action" &&
      !climate_card_type(b.type) && b.type != "cover" && b.type != "garage" && b.type != "gate" &&
      b.type != "sensor" && b.type != "door_window" && b.type != "presence" &&
      b.type != "subpage" && b.type != "light_control" && b.type != "media" &&
      b.type != "image" && b.type != "weather" &&
      !fan_card_type(b.type) && !card_large_numbers_supported(p)) {
    b.options.clear();
  }
  if (!card_colors.empty()) {
    if (!b.options.empty()) b.options += ",";
    b.options += card_colors;
  }
  if (icon_size == "small" || icon_size == "medium" || icon_size == "large") {
    if (!b.options.empty()) b.options += ",";
    b.options += "icon_size=" + icon_size;
  }
  return b;
}

inline ParsedCfg parsed_cfg_from_subpage_btn(const SubpageBtn &b) {
  ParsedCfg p;
  p.entity = b.entity;
  p.label = b.label;
  p.icon = b.icon;
  p.icon_on = b.icon_on;
  p.sensor = b.sensor;
  p.unit = b.unit;
  p.type = b.type;
  p.precision = b.precision;
  p.options = b.options;
  return normalize_parsed_cfg(p);
}

// Parse "order|entity:label:icon:...|entity:label:..." into subpage buttons.
inline std::vector<SubpageBtn> parse_subpage_config(const std::string &sp_cfg) {
  std::vector<SubpageBtn> btns;
  if (sp_cfg.empty()) return btns;

  bool compact = sp_cfg[0] == '~';
  std::vector<std::string> pipes = split_subpage_fields(compact ? sp_cfg.substr(1) : sp_cfg, '|');
  if (pipes.size() < 2) return btns;

  for (size_t pi = 1; pi < pipes.size(); pi++) {
    if (compact) {
      std::vector<std::string> flds = split_subpage_fields(pipes[pi], ',');
      std::string tp = flds.size() > 0 ? compact_subpage_type(flds[0]) : "";
      std::string e = flds.size() > 1 ? decode_compact_subpage_field(flds[1]) : "";
      std::string l = flds.size() > 2 ? decode_compact_subpage_field(flds[2]) : "";
      std::string ic = flds.size() > 3 ? decode_compact_subpage_field(flds[3]) : "Auto";
      if (ic.empty()) ic = "Auto";
      std::string io = flds.size() > 4 ? decode_compact_subpage_field(flds[4]) : "Auto";
      if (io.empty()) io = "Auto";
      std::string sn = flds.size() > 5 ? decode_compact_subpage_field(flds[5]) : "";
      std::string un = flds.size() > 6 ? decode_compact_subpage_field(flds[6]) : "";
      std::string pr = flds.size() > 7 ? decode_compact_subpage_field(flds[7]) : "";
      std::string op = flds.size() > 8 ? decode_compact_subpage_field(flds[8]) : "";
      btns.push_back(normalize_subpage_btn({e, l, ic, io, sn, un, tp, pr, op}));
      continue;
    }
    std::vector<std::string> flds = split_subpage_fields(pipes[pi], ':');
    std::string e = flds.size() > 0 ? flds[0] : "";
    std::string l = flds.size() > 1 ? flds[1] : "";
    std::string ic = flds.size() > 2 ? flds[2] : "Auto";
    if (ic.empty()) ic = "Auto";
    std::string io = flds.size() > 3 ? flds[3] : "Auto";
    if (io.empty()) io = "Auto";
    std::string sn = flds.size() > 4 ? flds[4] : "";
    std::string un = flds.size() > 5 ? flds[5] : "";
    std::string tp = flds.size() > 6 ? flds[6] : "";
    std::string pr = flds.size() > 7 ? flds[7] : "";
    std::string op = flds.size() > 8 ? flds[8] : "";
    btns.push_back(normalize_subpage_btn({e, l, ic, io, sn, un, tp, pr, op}));
  }
  return btns;
}

// Keep the existing renderer's normalization while taking field values
// directly from the active native page instead of round-tripping through text.
inline std::vector<SubpageBtn> native_subpage_buttons(
    const espdesktop::pages::PageStore &store, const espdesktop::pages::PageDefinition &page) {
  using espdesktop::pages::CardField;
  std::vector<SubpageBtn> buttons;
  buttons.reserve(page.card_count);
  for (size_t i = 0; i < page.card_count; ++i) {
    const auto &card = *store.card(page.first_card + i);
    auto field = [&](CardField name) { return std::string(store.field(card, name)); };
    auto icon = field(CardField::ICON);
    auto icon_on = field(CardField::ICON_ON);
    buttons.push_back(normalize_subpage_btn({
        field(CardField::ENTITY), field(CardField::LABEL),
        icon.empty() ? "Auto" : std::move(icon), icon_on.empty() ? "Auto" : std::move(icon_on),
        field(CardField::SENSOR), field(CardField::UNIT), compact_subpage_type(field(CardField::TYPE)),
        field(CardField::PRECISION), field(CardField::OPTIONS)}));
  }
  return buttons;
}

// Extract the order string (everything before the first pipe) from subpage config
inline std::string get_subpage_order(const std::string &sp_cfg) {
  if (sp_cfg.empty()) return "";
  size_t start = sp_cfg[0] == '~' ? 1 : 0;
  size_t pe = sp_cfg.find('|', start);
  if (pe == std::string::npos) return sp_cfg.substr(start);
  return sp_cfg.substr(start, pe - start);
}

inline bool subpage_back_token_span(const std::string &order_str, size_t start, size_t end, char &suffix,
                                    size_t *label_start = nullptr) {
  while (start < end && std::isspace(static_cast<unsigned char>(order_str[start]))) start++;
  while (end > start && std::isspace(static_cast<unsigned char>(order_str[end - 1]))) end--;
  size_t eq = order_str.find('=', start);
  size_t base_end = (eq == std::string::npos || eq > end) ? end : eq;
  while (base_end > start && std::isspace(static_cast<unsigned char>(order_str[base_end - 1]))) base_end--;
  size_t len = base_end - start;
  if (len < 1 || len > 2 || order_str[start] != 'B') return false;
  suffix = len == 2 ? order_str[start + 1] : '\0';
  if (suffix != '\0' && !grid_token_has_span_suffix(suffix)) return false;
  if (label_start) *label_start = (eq == std::string::npos || eq >= end) ? std::string::npos : eq + 1;
  return true;
}

inline std::string get_subpage_back_custom_label(const std::string &order_str) {
  if (order_str.empty()) return std::string{};
  size_t st = 0;
  while (st <= order_str.length()) {
    size_t cm = order_str.find(',', st);
    if (cm == std::string::npos) cm = order_str.length();
    if (cm > st) {
      char suffix = '\0';
      size_t label_start = std::string::npos;
      if (subpage_back_token_span(order_str, st, cm, suffix, &label_start)) {
        if (label_start != std::string::npos) {
          size_t label_end = order_str.find(':', label_start);
          if (label_end == std::string::npos || label_end > cm) label_end = cm;
          std::string label = decode_compact_subpage_field(order_str, label_start, label_end - label_start);
          return label.empty() ? std::string{} : label;
        }
        return std::string{};
      }
    }
    st = cm + 1;
  }
  return std::string{};
}

inline std::string get_subpage_back_label(const std::string &order_str) {
  const std::string default_label = espdesktop_i18n(std::string("Back"));
  if (order_str.empty()) return default_label;
  size_t st = 0;
  while (st <= order_str.length()) {
    size_t cm = order_str.find(',', st);
    if (cm == std::string::npos) cm = order_str.length();
    if (cm > st) {
      char suffix = '\0';
      size_t label_start = std::string::npos;
      if (subpage_back_token_span(order_str, st, cm, suffix, &label_start)) {
        if (label_start != std::string::npos) {
          size_t label_end = order_str.find(':', label_start);
          if (label_end == std::string::npos || label_end > cm) label_end = cm;
          std::string label = decode_compact_subpage_field(order_str, label_start, label_end - label_start);
          return label.empty() ? default_label : label;
        }
        return default_label;
      }
    }
    st = cm + 1;
  }
  return default_label;
}

// A colour suffix follows the encoded label: B=Return%3AHome:FF8C00.
inline std::string get_subpage_back_color(const std::string &order_str) {
  size_t start = 0;
  while (start < order_str.size()) {
    size_t end = order_str.find(',', start);
    if (end == std::string::npos) end = order_str.size();
    char suffix = '\0';
    size_t label_start = std::string::npos;
    if (subpage_back_token_span(order_str, start, end, suffix, &label_start)) {
      if (label_start == std::string::npos) return "";
      const size_t separator = order_str.find(':', label_start);
      if (separator == std::string::npos || separator >= end) return "";
      const size_t metadata_separator = order_str.find(':', separator + 1);
      const size_t color_end = metadata_separator < end ? metadata_separator : end;
      return normalize_card_color_value(order_str.substr(separator + 1, color_end - separator - 1));
    }
    start = end + 1;
  }
  return "";
}

// Subpage grid layout with support for a back button token ("B")
struct SubpageOrder {
  int positions[MAX_GRID_SLOTS] = {};
  int row_span[MAX_GRID_SLOTS] = {};
  int col_span[MAX_GRID_SLOTS] = {};
  int back_pos = 0;
  int back_row_span = 1;
  int back_col_span = 1;
  bool has_back_token = false;
  bool compacted_portrait = false;
};

inline void parse_subpage_order(const std::string &order_str, int num_slots, int num_btns,
                                SubpageOrder &result, int configured_slots = 0) {
  int slot_limit = bounded_grid_slots(configured_slots > 0 ? configured_slots : num_slots);
  int btn_limit = bounded_grid_slots(num_btns);
  for (int i = 0; i < MAX_GRID_SLOTS; i++) {
    result.row_span[i] = 1;
    result.col_span[i] = 1;
  }
  if (order_str.empty()) return;
  size_t gp2 = 0, st2 = 0;
  while (st2 <= order_str.length() && gp2 < (size_t)slot_limit) {
    size_t cm = order_str.find(',', st2);
    if (cm == std::string::npos) cm = order_str.length();
    if (cm > st2) {
      char back_suffix = '\0';
      if (subpage_back_token_span(order_str, st2, cm, back_suffix)) {
        result.back_pos = gp2;
        grid_token_spans(back_suffix, result.back_row_span, result.back_col_span);
        result.has_back_token = true;
      } else {
        size_t token_end = cm;
        int row_span = 1, col_span = 1;
        while (token_end > st2 && std::isspace(static_cast<unsigned char>(order_str[token_end - 1]))) {
          token_end--;
        }
        if (token_end > st2 && grid_token_has_span_suffix(order_str[token_end - 1])) {
          grid_token_spans(order_str[token_end - 1], row_span, col_span);
          token_end--;
        }
        int v = parse_positive_int_span(order_str, st2, token_end);
        if (v >= 1 && v <= btn_limit) {
          result.positions[gp2] = v;
          result.row_span[v - 1] = row_span;
          result.col_span[v - 1] = col_span;
        }
      }
    }
    gp2++;
    st2 = cm + 1;
  }
  const int active = bounded_grid_slots(num_slots);
  if (active >= slot_limit) return;
  bool compact = result.has_back_token && result.back_pos >= active;
  for (int i = active; i < slot_limit; ++i) compact |= result.positions[i] > 0;
  if (!compact) return;
  result.compacted_portrait = true;
  int positions[MAX_GRID_SLOTS] = {};
  int count = 0;
  bool back_placed = false;
  for (int i = 0; i < slot_limit; ++i) {
    if (result.has_back_token && i == result.back_pos) {
      result.back_pos = count;
      ++count;
      back_placed = true;
    } else if (result.positions[i] > 0) {
      // Reserve a visible cell for the explicit or implicit Back control.
      const int limit = active - ((!result.has_back_token || !back_placed) ? 1 : 0);
      if (count < limit) positions[count++] = result.positions[i];
    }
  }
  memcpy(result.positions, positions, sizeof(positions));
}

inline void normalize_subpage_order_spans(SubpageOrder &order, int num_slots,
                                          int cols) {
  int slot_limit = bounded_grid_slots(num_slots);
  if (order.has_back_token) {
    normalize_grid_span_for_position(order.back_pos, slot_limit, cols,
                                     order.back_row_span,
                                     order.back_col_span);
  }
  if (order.compacted_portrait && order.has_back_token &&
      grid_span_overlaps_anchor(order.positions, order.back_pos, slot_limit, cols,
                                order.back_row_span, order.back_col_span)) {
    order.back_row_span = order.back_col_span = 1;
  }
  for (int position = 0; position < slot_limit; position++) {
    int button_index = order.positions[position];
    if (button_index < 1 || button_index > MAX_GRID_SLOTS) continue;
    int rendered_position = order.has_back_token ? position : position + 1;
    if (rendered_position >= slot_limit) {
      order.positions[position] = 0;
      continue;
    }
    int &row_span = order.row_span[button_index - 1];
    int &col_span = order.col_span[button_index - 1];
    normalize_grid_span_for_position(rendered_position, slot_limit, cols,
                                     row_span, col_span);
    if (order.compacted_portrait &&
        grid_span_overlaps_anchor(order.positions, rendered_position, slot_limit, cols,
                                  row_span, col_span, order.back_pos,
                                  order.has_back_token ? 0 : 1)) {
      row_span = col_span = 1;
    }
  }
}


#ifndef ESPDESKTOP_SUBPAGE_PARSER_ONLY

inline lv_obj_t *create_grid_card_button(lv_obj_t *parent, lv_coord_t radius,
                                         lv_coord_t pad,
                                         const lv_font_t *label_font,
                                         lv_color_t text_color,
                                         bool continuous_corners = false) {
  lv_obj_t *btn = lv_btn_create(parent);
  apply_grid_card_corners(btn, radius, continuous_corners);
  lv_obj_set_style_pad_all(btn, pad, LV_PART_MAIN);
  if (label_font) lv_obj_set_style_text_font(btn, label_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(btn, text_color, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(btn, 0, LV_PART_MAIN);
  return btn;
}

inline lv_obj_t *create_card_sensor_container(lv_obj_t *parent,
                                              const lv_font_t *value_font,
                                              const lv_font_t *unit_font,
                                              lv_color_t text_color,
                                              lv_obj_t **value_lbl,
                                              lv_obj_t **unit_lbl) {
  lv_obj_t *container = lv_obj_create(parent);
  lv_obj_set_align(container, LV_ALIGN_TOP_LEFT);
  lv_obj_set_size(container, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
  lv_obj_clear_flag(container, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(container, LV_OBJ_FLAG_HIDDEN);
  lv_obj_set_style_bg_opa(container, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(container, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(container, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_column(container, 0, LV_PART_MAIN);
  lv_obj_set_layout(container, LV_LAYOUT_FLEX);
  lv_obj_set_style_flex_flow(container, LV_FLEX_FLOW_ROW, LV_PART_MAIN);
  lv_obj_set_style_flex_cross_place(container, LV_FLEX_ALIGN_END, LV_PART_MAIN);

  lv_obj_t *value = lv_label_create(container);
  if (value_font) lv_obj_set_style_text_font(value, value_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(value, text_color, LV_PART_MAIN);
  lv_label_set_display_text(value, "--");

  lv_obj_t *unit = lv_label_create(container);
  if (unit_font) lv_obj_set_style_text_font(unit, unit_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(unit, text_color, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(unit, 6, LV_PART_MAIN);
  lv_label_set_display_text(unit, "");

  if (value_lbl) *value_lbl = value;
  if (unit_lbl) *unit_lbl = unit;
  return container;
}

inline BtnSlot create_dynamic_card_slot(lv_obj_t *btn,
                                        const lv_font_t *icon_font,
                                        const lv_font_t *value_font,
                                        const lv_font_t *label_font,
                                        lv_color_t text_color,
                                        const lv_font_t *subpage_icon_font = nullptr) {
  BtnSlot slot{};
  slot.config = nullptr;
  slot.btn = btn;
  slot.icon_lbl = lv_label_create(btn);
  if (icon_font) lv_obj_set_style_text_font(slot.icon_lbl, icon_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(slot.icon_lbl, text_color, LV_PART_MAIN);
  lv_label_set_display_text(slot.icon_lbl, "\U000F0493");
  lv_obj_align(slot.icon_lbl, LV_ALIGN_TOP_LEFT, 0, 0);

  slot.sensor_container = create_card_sensor_container(
    btn, value_font, label_font, text_color, &slot.sensor_lbl, &slot.unit_lbl);

  slot.text_lbl = lv_label_create(btn);
  if (label_font) lv_obj_set_style_text_font(slot.text_lbl, label_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(slot.text_lbl, text_color, LV_PART_MAIN);
  lv_label_set_display_text(slot.text_lbl, espdesktop_i18n("Configure"));
  lv_obj_align(slot.text_lbl, LV_ALIGN_BOTTOM_LEFT, 0, 0);
  configure_button_label_wrap(slot.text_lbl);

  slot.subpage_lbl = lv_label_create(btn);
  const lv_font_t *chevron_font = subpage_icon_font ? subpage_icon_font : icon_font;
  if (chevron_font) lv_obj_set_style_text_font(slot.subpage_lbl, chevron_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(slot.subpage_lbl, text_color, LV_PART_MAIN);
  lv_obj_set_style_text_opa(slot.subpage_lbl, LV_OPA_50, LV_PART_MAIN);
  lv_label_set_display_text(slot.subpage_lbl, "\U000F0142");
  lv_obj_align(slot.subpage_lbl, LV_ALIGN_BOTTOM_RIGHT, 0, 2);
  lv_obj_add_flag(slot.subpage_lbl, LV_OBJ_FLAG_HIDDEN);
  return slot;
}

#endif  // ESPDESKTOP_SUBPAGE_PARSER_ONLY
