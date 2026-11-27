#include <cassert>
#include <cstdint>
#include <string>
#include <vector>
#include "esphome/core/string_ref.h"
struct lv_obj_t {};
inline void lv_label_set_text(lv_obj_t *, const char *) {}
#include "i18n_generated.h"
#include "button_grid_config_parser.h"
#include "card_icon_size.h"
#define ESPDESKTOP_SUBPAGE_PARSER_ONLY
#include "button_grid_subpages.h"

int main() {
  using espdesktop::card_icon_zoom;
  assert(card_icon_zoom("small", 48, 48, 200, 150) == 256);
  assert(card_icon_zoom("medium", 48, 48, 200, 150) == 384);
  assert(card_icon_zoom("large", 48, 48, 200, 150) == 800);
  assert(card_icon_zoom("large", 48, 48, 200, 72) == 384);
  assert(card_icon_zoom("large", 48, 48, 60, 150) == 320);
  assert(card_icon_zoom("large", 48, 48, 60, 0) == 1);
  for (const auto &type : {"", "sensor", "media", "subpage", "companion", "light_control"}) {
    for (const auto &size : {"small", "medium", "large"}) {
      const std::string entity = std::string(type) == "companion" ? "shortcut.command+c" : "light.kitchen";
      const auto card = parse_cfg(entity + ";Kitchen;Lightbulb;;;;" + type + ";;icon_size=" + size);
      assert(cfg_option_value(card.options, "icon_size").empty());
      assert(normalize_parsed_cfg(card).options == card.options);
      SubpageBtn nested;
      nested.type = type;
      nested.entity = "app.example";
      nested.options = std::string("icon_size=") + size;
      const auto normalized = normalize_subpage_btn(nested);
      assert(cfg_option_value(normalized.options, "icon_size") == size);
      assert(normalize_subpage_btn(normalized).options == normalized.options);
    }
  }
  for (const auto &entity : {"com.apple.finder", "shortcut.command+c", "folder.Documents",
                             "window.close", "stat.cpu"}) {
    for (const auto &size : {"small", "medium", "large"}) {
      const auto card = parse_cfg(std::string(entity) + ";App;Monitor;;;;companion;;icon_size=" + size);
      assert(cfg_option_value(card.options, "icon_size") ==
             (std::string(entity) == "com.apple.finder" ? size : ""));
    }
  }
  assert(parse_cfg("light.kitchen;Kitchen;Lightbulb;;;;;;icon_size=invalid").options.empty());

  for (const auto &align : {"left", "center", "right"}) {
    const auto card = parse_cfg(
      std::string("light.kitchen;Kitchen;Lightbulb;;;;light_brightness;;label_align=") + align);
    assert(cfg_option_value(card.options, "label_align") == (std::string(align) == "left" ? "" : align));
    assert(normalize_parsed_cfg(card).options == card.options);
  }
  const auto aligned_colour = parse_cfg(
    "light.kitchen;Kitchen;Lightbulb;;;;light_brightness;;label_align=right,card_off_color=6633B9");
  assert(cfg_option_value(aligned_colour.options, "label_align") == "right");
  assert(cfg_option_value(aligned_colour.options, "card_off_color") == "6633B9");
  assert(normalize_parsed_cfg(aligned_colour).options == aligned_colour.options);
  assert(parse_cfg("light.kitchen;Kitchen;Lightbulb;;;;light_brightness;;label_align=invalid").options.empty());

  SubpageBtn aligned_subpage;
  aligned_subpage.type = "light_brightness";
  aligned_subpage.options = "label_align=center";
  assert(cfg_option_value(normalize_subpage_btn(aligned_subpage).options, "label_align") == "center");
}
