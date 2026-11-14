"""Compile the production mixed-driver paths without any HA transport or SDK types."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from production_source import definition
ROOT = Path(__file__).resolve().parents[2]
firmware = ROOT / 'components/espdesktop'
numeric = (firmware/'button_grid_numeric_selectable_driver.h').read_text()
numeric = re.sub(r'^#(?:include[^\n]*|pragma once)\n', '', numeric, flags=re.M)
actions = (firmware/'button_grid_actions.h').read_text()
basic = (firmware/'button_grid_basic_action_driver.h').read_text()
prelude = r'''
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>
namespace card_runtime { enum class CardDriverId { ACTION, INTERNAL, COMPANION, SCREEN_LOCK, SCREENSAVER, WEBHOOK, TOGGLE, PUSH, ALARM_ACTION, FAN, SENSOR }; enum class CardTypeId { SENSOR, LOCAL_SENSOR }; }
struct Context { struct { card_runtime::CardDriverId driver; card_runtime::CardTypeId type = card_runtime::CardTypeId::SENSOR; } runtime; };
struct ParsedCfg { std::string type, entity, sensor, icon, icon_on, label; };
struct lv_obj_t { void *data = nullptr; std::string text; };
struct lv_event_t { void *data; };
struct SliderCtx {};
struct BtnSlot { lv_obj_t *btn, *sensor_container, *icon_lbl, *text_lbl; };
struct CardPalette {};
struct DisplayProfile {};
struct ModalTarget {};
constexpr int LV_EVENT_DELETE = 1;
void *lv_obj_get_user_data(lv_obj_t *obj) { return obj->data; }
void *lv_event_get_user_data(lv_event_t *event) { return event->data; }
void lv_obj_add_event_cb(lv_obj_t *, void(*)(lv_event_t *), int, void *) {}
void lv_label_set_display_text(lv_obj_t *obj, const char *text) { obj->text = text; }
uint32_t card_slider_fill_color(const CardPalette &) { return 0; }
int layouts = 0, setups = 0, bindings = 0, local_bindings = 0;
int mute_setups = 0, mute_bindings = 0;
void setup_slider_visual(BtnSlot &, const ParsedCfg &, uint32_t) { ++setups; }
void refresh_slider_card_layout(BtnSlot &) { ++layouts; }
void setup_toggle_visual(BtnSlot &, const ParsedCfg &) { ++mute_setups; }
bool companion_mute_control_valid(const std::string &key) { return key == "media.output_mute" || key == "media.input_mute"; }
bool companion_volume_control_valid(const std::string &key) { return key == "media.output_volume" || key == "media.input_volume" || companion_mute_control_valid(key); }
const char *companion_volume_control_label(const std::string &key) { return companion_mute_control_valid(key) ? "Mute" : key == "media.output_volume" ? "Lautstärke" : "Mic"; }
bool companion_forget_mute(lv_obj_t *) { return false; }
void set_card_checked_state(lv_obj_t *, bool) {}
void set_card_disabled_state(lv_obj_t *, bool) {}
const char *find_icon(const char *name) { return name; }
void companion_track_mute(lv_obj_t *, const std::string &key, lv_obj_t *, const char *, const char *) { assert(companion_mute_control_valid(key)); ++mute_bindings; }
const char *slider_icon_off(const std::string &, const std::string &, const std::string &) { return "volume"; }
const char *slider_icon_on(const std::string &, const std::string &, const std::string &, const std::string &) { return "volume-on"; }
void companion_track_slider(lv_obj_t *, const std::string &key, lv_obj_t *, bool, const char *, const char *) { assert(companion_volume_control_valid(key)); ++bindings; }
std::vector<std::pair<std::string,int>> commands;
bool companion_toggle_mute(const std::string &key) { commands.emplace_back(key,100); return true; }
unsigned companion_next_request_number() { return 1; }
bool invoke_companion_value(const std::string &key, int value, const char *) { commands.emplace_back(key,value); return true; }
std::vector<std::function<void()>> callbacks;
template<class T> T *grid_delete_with_owner(lv_obj_t *, T *p) { return p; }
std::vector<void *> allocations;
void bind_immediate_button_action(lv_obj_t *, void(*cb)(lv_event_t *), std::string *p) { allocations.push_back(p); callbacks.push_back([=] { lv_event_t e{p}; cb(&e); }); }
namespace espdesktop::cards {
void sensor_driver_register_local_value(BtnSlot &, const ParsedCfg &) { ++local_bindings; }
}
'''
parser = (firmware/'button_grid_config_parser.h').read_text()
production = ''
production += definition(actions, 'send_slider_action')[1] + numeric
production += '\nnamespace espdesktop::cards {\n'
production += definition(basic, 'basic_action_driver_matches')[1]
production += '\n}\n'
checks = r'''
int main() {
 using namespace espdesktop::cards;
 using Driver = card_runtime::CardDriverId;
 Context c{{Driver::COMPANION}};
 ParsedCfg config;
 for (Driver retired : {Driver::ACTION,Driver::TOGGLE,Driver::PUSH,Driver::ALARM_ACTION,Driver::FAN,Driver::INTERNAL,Driver::SCREEN_LOCK,Driver::SCREENSAVER}) { c.runtime.driver = retired; assert(!basic_action_driver_matches(c,config)); }
 for (Driver local : {Driver::COMPANION,Driver::WEBHOOK}) { c.runtime.driver = local; assert(basic_action_driver_matches(c,config)); }
 lv_obj_t button, container, slider, icon, label; container.data = &slider;
 BtnSlot slot{&button,&container,&icon,&label}; CardPalette palette; DisplayProfile display;
 for (const char *key : {"media.output_volume","media.input_volume"}) {
  config = {"slider",key,"","","",std::string(key) == "media.output_volume" ? "Volume" : "Mic"};
  assert(numeric_selectable_driver_setup_visual(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_main(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_subpage(slot,config,c,{}));
  assert(label.text == companion_volume_control_label(key));
  assert(numeric_selectable_driver_refresh_layout(slot,config,c));
  assert(numeric_selectable_driver_handle_main_click(c,config,&button));
  assert(callbacks.empty());
  assert(send_slider_action(key,42));
 }
 assert(setups == 2 && bindings == 4 && layouts == 2 && commands.size() == 2);
 for (const char *key : {"media.output_mute","media.input_mute"}) {
  config = {"slider",key,"","","",""};
  assert(numeric_selectable_driver_setup_visual(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_main(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_subpage(slot,config,c,{}));
  assert(label.text == "Mute");
  assert(numeric_selectable_driver_refresh_layout(slot,config,c));
  assert(numeric_selectable_driver_handle_main_click(c,config,&button));
  callbacks.back()();
  assert(commands.back() == std::make_pair(std::string(key),100));
 }
 assert(mute_setups == 2 && mute_bindings == 4 && layouts == 2 && commands.size() == 6);
 for (const char *key : {"light.room","fan.room","cover.room","number.room","media_player.room","input_number.room"}) {
  config.entity = key;
  assert(!numeric_selectable_driver_setup_visual(slot,config,c,palette,display));
  assert(!numeric_selectable_driver_bind_main(slot,config,c,palette,display));
  assert(!numeric_selectable_driver_bind_subpage(slot,config,c,{}));
  assert(!numeric_selectable_driver_handle_main_click(c,config,&button));
  assert(!send_slider_action(key,50)); assert(!send_slider_action(key,-1));
 }
 assert(commands.size() == 6 && setups == 2 && bindings == 4);
 for (auto *p : allocations) delete static_cast<std::string *>(p);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    cpp, exe = Path(tmp)/'drivers.cpp', Path(tmp)/'drivers'
    cpp.write_text(prelude + production + checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror',str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
