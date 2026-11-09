"""Bind dynamic nested folders to Mac metrics without any HA transport."""
import os
from pathlib import Path
import subprocess
import tempfile
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'components/espdesktop/button_grid_navigation_driver.h').read_text()
code = r'''
#include <cassert>
#include <string>
#include <vector>
namespace card_runtime { enum class CardDriverId { SUBPAGE, OTHER }; }
struct Context { struct { card_runtime::CardDriverId driver; } runtime; };
struct ParsedCfg { std::string entity, sensor, precision, unit, label, icon, icon_on, options; };
struct lv_obj_t {};
struct BtnSlot { lv_obj_t *btn, *icon_lbl, *sensor_container, *text_lbl, *sensor_lbl, *unit_lbl; };
struct NavigationDriverParentState {};
bool subpage_companion_stat_config(const ParsedCfg &config) { return config.options == "companion_stat"; }
std::string trim_display_unit(std::string value) { return value; }
std::string subpage_companion_stat_default_unit(std::string) { return "%"; }
const char *companion_metric_icon(std::string) { return "metric"; }
const char *find_icon(const char *value) { return value; }
int parse_precision(std::string value) { return value.empty() ? 0 : std::stoi(value); }
void lv_label_set_display_text(lv_obj_t *, const char *) {}
constexpr int LV_OBJ_FLAG_HIDDEN = 1;
void lv_obj_clear_flag(lv_obj_t *, int) {}
void lv_obj_add_flag(lv_obj_t *, int) {}
bool cfg_option_token_present(std::string, std::string) { return false; }
struct Binding { lv_obj_t *owner, *label; std::string metric, unit; int precision; };
std::vector<Binding> bindings;
void companion_track_metric_card(lv_obj_t *owner, lv_obj_t *label, void *,
    const std::string &metric, const std::string &unit, int precision, bool, bool) {
  bindings.push_back({owner, label, metric, unit, precision});
}
'''
for name in ('navigation_driver_matches', 'navigation_driver_parent_companion_stat_state_enabled',
             'navigation_driver_bind_main', 'navigation_driver_bind_subpage'):
    code += definition(source, name)[1] + '\n'
code += r'''
int main() {
  Context folder{{card_runtime::CardDriverId::SUBPAGE}};
  lv_obj_t button, second, icon, container, label, sensor, unit;
  BtnSlot slot{&button, &icon, &container, &label, &sensor, &unit};
  ParsedCfg metric; metric.options = "companion_stat"; metric.entity = "cpu.usage";
  metric.precision = "1";
  assert(navigation_driver_bind_subpage(slot, metric, folder));
  assert(bindings.size() == 1 && bindings[0].owner == &button && bindings[0].label == &label);
  assert(bindings[0].metric == "cpu.usage" && bindings[0].unit == "%" && bindings[0].precision == 1);
  slot.btn = &second; metric.unit = "custom";
  assert(navigation_driver_bind_subpage(slot, metric, folder));
  assert(bindings.size() == 2 && bindings[1].owner == &second && bindings[1].unit == "custom");
  ParsedCfg legacy; legacy.sensor = "sensor.temperature"; legacy.entity = "light.office";
  assert(navigation_driver_bind_subpage(slot, legacy, folder));
  assert(bindings.size() == 2 && legacy.sensor == "sensor.temperature" && legacy.entity == "light.office");
  Context other{{card_runtime::CardDriverId::OTHER}};
  assert(!navigation_driver_bind_subpage(slot, metric, other));
  assert(bindings.size() == 2);
}
'''
with tempfile.TemporaryDirectory(prefix='nested-folder-local-') as temporary:
    path = Path(temporary)
    (path / 'test.cpp').write_text(code)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-Wall', '-Wextra', '-Werror',
                    str(path / 'test.cpp'), '-o', str(path / 'test')], check=True)
    subprocess.run([str(path / 'test')], check=True)
print('Nested Mac metric owners bind independently; saved HA fields remain inert and unchanged.')
