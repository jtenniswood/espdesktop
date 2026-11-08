"""Exercise production folder data binding on dynamic nested card owners."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'components/espdesktop/button_grid_navigation_driver.h').read_text()
def function(signature):
    start = source.index(signature)
    return source[start:source.index('\n}', start) + 2]

code = r'''
#include <cassert>
#include <functional>
#include <string>
#include <string_view>
#include <vector>
namespace card_runtime { enum class CardDriverId { SUBPAGE, OTHER }; }
struct Context { struct { card_runtime::CardDriverId driver; } runtime; };
struct ParsedCfg { std::string entity, sensor, precision, unit, label, icon, icon_on, options; };
struct lv_obj_t { std::string text; bool active{false}; };
struct BtnSlot { lv_obj_t *btn, *icon_lbl, *sensor_container, *text_lbl, *sensor_lbl, *unit_lbl; };
struct NavigationDriverParentState {
  bool *has_sensor=nullptr, *sensor_text_mode=nullptr, *has_icon_on=nullptr;
  const char **icon_off=nullptr, **icon_on=nullptr;
};
std::vector<std::function<void()>> cleanup;
std::function<void(std::string)> numeric_update, text_update, indicator_update;
std::string numeric_entity, text_entity, indicator_entity;
template<class T> T *grid_delete_with_owner(lv_obj_t *, T *state) {
  cleanup.emplace_back([state] { delete state; }); return state;
}
bool subpage_companion_stat_config(const ParsedCfg &) { return false; }
std::string trim_display_unit(std::string s) { return s; }
std::string subpage_companion_stat_default_unit(std::string) { return ""; }
const char *companion_metric_icon(std::string) { return "metric"; }
const char *find_icon(const char *s) { return s; }
const char *domain_default_icon(std::string) { return "off"; }
int parse_precision(std::string s) { return s.empty() ? 0 : std::stoi(s); }
void lv_label_set_display_text(lv_obj_t *, const char *) {}
constexpr int LV_OBJ_FLAG_HIDDEN = 1;
void lv_obj_clear_flag(lv_obj_t *, int) {}
void lv_obj_add_flag(lv_obj_t *, int) {}
bool cfg_option_token_present(std::string, std::string) { return false; }
template<class... T> void companion_track_metric_card(T...) {}
void subscribe_friendly_name(lv_obj_t *, std::string) {}
void subscribe_text_sensor_value(lv_obj_t *label, std::string entity) {
  text_entity = entity; text_update = [label](std::string value) { label->text = value; };
}
void subscribe_sensor_value(lv_obj_t *label, std::string entity, int precision, lv_obj_t *unit, std::string symbol) {
  assert(precision == 1); unit->text = symbol; numeric_entity = entity;
  numeric_update = [label](std::string value) { label->text = value; };
}
std::string normalize_subpage_kind(std::string s) { return s; }
std::string cfg_option_value(std::string, std::string) { return ""; }
bool lawn_mower_state_active_ref(std::string_view) { return false; }
template<class... T> void subscribe_climate_subpage_parent_indicator(T...) {}
void subscribe_toggle_state(lv_obj_t *button, lv_obj_t *icon, lv_obj_t *, lv_obj_t *,
    bool *, bool *, bool *has_on, const char **off, const char **on, void *,
    std::string entity, bool, bool (*)(std::string_view) = nullptr) {
  indicator_entity = entity;
  indicator_update = [=](std::string value) { button->active = value == "on";
    icon->text = button->active && *has_on ? *on : *off; };
}
'''
for signature in [
    'inline bool navigation_driver_matches(',
    'inline bool navigation_driver_parent_sensor_state_enabled(',
    'inline bool navigation_driver_parent_companion_stat_state_enabled(',
    'inline bool navigation_driver_parent_text_state_enabled(',
    'inline bool navigation_driver_parent_entity_state_enabled(',
    'inline bool navigation_driver_bind_main(',
    'inline bool navigation_driver_bind_subpage(',
]:
    code += function(signature)
code += r'''
int main() {
  Context folder{{card_runtime::CardDriverId::SUBPAGE}};
  lv_obj_t button, icon, container, label, sensor, unit;
  BtnSlot slot{&button, &icon, &container, &label, &sensor, &unit};
  ParsedCfg numeric; numeric.sensor = "sensor.temperature"; numeric.precision = "1"; numeric.unit = "C";
  assert(navigation_driver_bind_subpage(slot, numeric, folder));
  assert(numeric_entity == "sensor.temperature" && unit.text == "C");
  numeric_update("23.5"); assert(sensor.text == "23.5");
  ParsedCfg text; text.sensor = "sensor.status"; text.precision = "text";
  assert(navigation_driver_bind_subpage(slot, text, folder));
  assert(text_entity == "sensor.status"); text_update("Ready"); assert(label.text == "Ready");
  ParsedCfg indicator; indicator.sensor = "indicator"; indicator.entity = "light.office";
  indicator.icon = "off"; indicator.icon_on = "on";
  assert(navigation_driver_bind_subpage(slot, indicator, folder));
  assert(indicator_entity == "light.office" && cleanup.size() == 1);
  indicator_update("on"); assert(button.active && icon.text == "on");
  indicator_update("off"); assert(!button.active && icon.text == "off");
  for (auto &release : cleanup) release();
}
'''
with tempfile.TemporaryDirectory() as temporary:
    path = Path(temporary)
    (path / 'test.cpp').write_text(code)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-Wall', '-Wextra', '-Werror', '-Wno-unused-parameter', str(path / 'test.cpp'), '-o', str(path / 'test')], check=True)
    subprocess.run([str(path / 'test')], check=True)
print('Nested folder numeric, text and explicit entity indicators retain their state subscriptions.')
