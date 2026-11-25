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
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <string>
#include <string_view>
#include <vector>
namespace card_runtime { enum class CardDriverId { ACTION, INTERNAL, COMPANION, SCREEN_LOCK, SCREENSAVER, TOGGLE, PUSH, ALARM_ACTION, FAN, SENSOR }; enum class CardTypeId { SENSOR, LOCAL_SENSOR }; }
struct Context { struct { card_runtime::CardDriverId driver; card_runtime::CardTypeId type = card_runtime::CardTypeId::SENSOR; } runtime; };
struct ParsedCfg { std::string type, entity, sensor, icon, icon_on, label; };
struct lv_obj_t { void *data = nullptr; std::string text; };
struct lv_event_t { void *data; };
struct SliderCtx { lv_obj_t *fill = nullptr; };
struct BtnSlot { lv_obj_t *btn, *sensor_container, *icon_lbl, *text_lbl; };
struct CardPalette { uint32_t on_val = 0x64AD54; };
struct DisplayProfile { struct { const void *icon = nullptr; } fonts; };
const void *display_small_text_font(const DisplayProfile &) { return nullptr; }
const void *display_switch_confirmation_message_font(const DisplayProfile &) { return nullptr; }
std::string card_hold_action(const ParsedCfg &) { return ""; }
bool companion_computer_locked(const std::string &) { return false; }
struct MicHoldFonts { const void *message = nullptr; const void *icon = nullptr; };
MicHoldFonts &mic_hold_fonts() { static MicHoldFonts fonts; return fonts; }
void companion_setup_mic_mute_detail(lv_obj_t *, const void *) {}
struct ModalTarget {};
constexpr int LV_EVENT_DELETE = 1;
constexpr int LV_EVENT_PRESSED = 2;
constexpr int LV_EVENT_LONG_PRESSED = 3;
constexpr int LV_EVENT_SHORT_CLICKED = 4;
void *lv_obj_get_user_data(lv_obj_t *obj) { return obj->data; }
void *lv_event_get_user_data(lv_event_t *event) { return event->data; }
std::vector<std::function<void()>> callbacks;
void lv_obj_add_event_cb(lv_obj_t *, void(*cb)(lv_event_t *), int code, void *p) {
  if (code == LV_EVENT_SHORT_CLICKED) callbacks.push_back([=] { lv_event_t e{p}; cb(&e); });
}
void lv_label_set_display_text(lv_obj_t *obj, const char *text) { obj->text = text; }
int layouts = 0, setups = 0, bindings = 0, local_bindings = 0;
int mute_setups = 0, mute_bindings = 0;
void setup_slider_visual(BtnSlot &, const ParsedCfg &, uint32_t fill, bool) {
  assert(fill == CardPalette{}.on_val);
  ++setups;
}
void refresh_slider_card_layout(BtnSlot &) { ++layouts; }
void setup_toggle_visual(BtnSlot &, const ParsedCfg &) { ++mute_setups; }
int transitions_removed = 0;
void remove_button_state_transitions(lv_obj_t *) { ++transitions_removed; }

bool companion_mute_control_valid(const std::string &key);
bool companion_volume_control_valid(const std::string &key);
const char *companion_volume_control_label(const std::string &key) { return key == "media.input_mute" ? "Input State" : companion_mute_control_valid(key) ? "Mute" : key == "media.output_volume" ? "Lautstärke" : "Mic"; }
void unbind_cough_button(lv_obj_t *) {}
constexpr char COMPANION_COUGH_ID[] = "media.cough";
bool companion_obs_cough_control(const std::string &id) { return id.rfind("obs.cough.", 0) == 0; }
void bind_cough_button(lv_obj_t *, lv_obj_t *, lv_obj_t *, const char *, const char *, const std::string &, bool,
                       const std::string & = "") {}
std::string companion_card_computer(const ParsedCfg &) { return ""; }
bool companion_forget_mute(lv_obj_t *) { return false; }
void set_card_checked_state(lv_obj_t *, bool) {}
void set_card_disabled_state(lv_obj_t *, bool) {}
const char *find_icon(const char *name) { return name; }
void companion_track_mute(lv_obj_t *, const std::string &key, lv_obj_t *, const char *, const char *, lv_obj_t *,
                          const std::string & = "") { assert(companion_mute_control_valid(key)); ++mute_bindings; }
const char *slider_icon_off(const std::string &, const std::string &, const std::string &) { return "volume"; }
const char *slider_icon_on(const std::string &, const std::string &, const std::string &, const std::string &) { return "volume-on"; }
bool companion_obs_level_control(const std::string &) { return false; }
bool companion_obs_meter_control(const std::string &) { return false; }
bool companion_audio_control_id(const std::string &key) {
    return key == "media.output_volume" || key == "media.input_volume" || companion_mute_control_valid(key);
}
void companion_track_slider(lv_obj_t *, const std::string &key, lv_obj_t *, bool, const char *, const char *,
                            lv_obj_t *, const std::string &, const std::string & = {}) { assert(companion_volume_control_valid(key)); ++bindings; }
std::vector<std::pair<std::string,int>> commands;
bool companion_toggle_mute(const std::string &key, const std::string & = "") { commands.emplace_back(key,100); return true; }
unsigned companion_next_request_number() { return 1; }
bool invoke_companion_value(const std::string &key, int value, const char *, const std::string & = "") { commands.emplace_back(key,value); return true; }
template<class T> T *grid_delete_with_owner(lv_obj_t *, T *p) { return p; }
std::vector<void *> allocations;
void bind_immediate_button_action(lv_obj_t *, void(*cb)(lv_event_t *), void *p) { allocations.push_back(p); callbacks.push_back([=] { lv_event_t e{p}; cb(&e); }); }
namespace espdesktop::cards {
void sensor_driver_register_local_value(BtnSlot &, const ParsedCfg &) { ++local_bindings; }
bool card_hold_end_call(lv_obj_t *, const std::string &) { return false; }
}
'''
parser = (firmware/'button_grid_config_parser.h').read_text()
controls = (firmware/'companion_controls.h').read_text()
production = '\n'.join(definition(controls, name)[1] for name in (
    'companion_mute_control_valid', 'companion_app_volume_control_valid',
    'companion_input_device_control_valid', 'companion_volume_control_valid',
)) + '\n'
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
 c.runtime.driver = Driver::COMPANION;
 assert(basic_action_driver_matches(c,config));
 lv_obj_t button, container, slider, icon, label; container.data = &slider;
 BtnSlot slot{&button,&container,&icon,&label}; CardPalette palette; DisplayProfile display;
 for (const char *key : {"media.output_volume","media.input_volume"}) {
  config = {"slider",key,"","","",std::string(key) == "media.output_volume" ? "Volume" : "Mic"};
  assert(numeric_selectable_driver_setup_visual(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_main(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_subpage(slot,config,c,{}));
  assert(label.text == companion_volume_control_label(key));
  assert(numeric_selectable_driver_refresh_layout(slot,config,c,display));
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
  assert(label.text == companion_volume_control_label(key));
  assert(numeric_selectable_driver_refresh_layout(slot,config,c,display));
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
 config = {"companion_app_volume","app.volume.com.example.Player","","","","Player"};
 assert(numeric_selectable_driver_setup_visual(slot,config,c,palette,display));
 assert(numeric_selectable_driver_bind_main(slot,config,c,palette,display));
 assert(numeric_selectable_driver_bind_subpage(slot,config,c,{}));
 assert(send_slider_action(config.entity,35));
 assert(commands.back() == std::make_pair(config.entity,35));
 config.entity = "media.output_volume";
 assert(!numeric_selectable_driver_matches(c, config));
 config.entity = "app.volume.";
 assert(!numeric_selectable_driver_matches(c, config));
 for (const std::string control : {"output_volume", "input_volume", "output_mute", "input_mute"}) {
  const std::string entity = "media." + control;
  config = {"companion_" + control, entity, "", "", "", "Custom label"};
  label.text = config.label;
  assert(numeric_selectable_driver_setup_visual(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_main(slot,config,c,palette,display));
  assert(numeric_selectable_driver_bind_subpage(slot,config,c,{}));
  assert(label.text == "Custom label");
  if (companion_mute_control_valid(entity)) {
   assert(numeric_selectable_driver_handle_main_click(c,config,&button));
   assert(commands.back() == std::make_pair(entity,100));
   callbacks.back()();
   assert(commands.back() == std::make_pair(entity,100));
  } else {
   assert(send_slider_action(entity,35));
   assert(commands.back() == std::make_pair(entity,35));
  }
  config.entity = "media.cough";
  assert(!numeric_selectable_driver_matches(c, config));
 }
 assert(transitions_removed == mute_setups);
 for (auto *p : allocations) delete static_cast<std::string *>(p);
}
'''
with tempfile.TemporaryDirectory() as tmp:
    cpp, exe = Path(tmp)/'drivers.cpp', Path(tmp)/'drivers'
    cpp.write_text(prelude + production + checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror',str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
