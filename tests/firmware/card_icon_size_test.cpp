#include <cassert>
#include <cstdint>
#include <string>
#include <vector>
#include "esphome/core/string_ref.h"
struct lv_obj_t {};
inline void lv_label_set_text(lv_obj_t *, const char *) {}
inline const char *espdesktop_i18n(const char *text) { return text ? text : ""; }
inline std::string espdesktop_i18n(const std::string &text) { return text; }
#include "button_grid_config_parser.h"
#include "card_icon_size.h"

int main() {
  using espdesktop::card_icon_zoom;
  assert(card_icon_zoom("small", 48, 48, 200, 150) == 256);
  assert(card_icon_zoom("medium", 48, 48, 200, 150) == 384);
  assert(card_icon_zoom("large", 48, 48, 200, 150) == 512);
  assert(card_icon_zoom("large", 48, 48, 200, 72) == 384);
  assert(card_icon_zoom("large", 48, 48, 60, 150) == 320);
  assert(card_icon_zoom("large", 48, 48, 60, 0) == 1);
  for (const auto &type : {"", "sensor", "media", "subpage", "companion", "light_control"}) {
    for (const auto &size : {"medium", "large"}) {
      const auto card = parse_cfg(std::string("light.kitchen;Kitchen;Lightbulb;;;;") + type + ";;icon_size=" + size);
      assert(cfg_option_value(card.options, "icon_size") == size);
      assert(normalize_parsed_cfg(card).options == card.options);
    }
  }
  assert(parse_cfg("light.kitchen;Kitchen;Lightbulb;;;;;;icon_size=invalid").options.empty());
}
