"""Run real folder/QR bindings without any Home Assistant transport available."""
from pathlib import Path
import subprocess,sys,tempfile
from production_source import definition
ROOT=Path(__file__).resolve().parents[2]
HEADERS=ROOT/'components/espdesktop'
source=r'''
#include <cassert>
#include <string>
#include <vector>
#include "button_grid_contract_generated.h"
#include "wifi_qr_codec.h"
struct ParsedCfg {std::string type="subpage",entity,sensor,label,options,unit,precision;};
struct lv_obj_t {};
struct BtnSlot {lv_obj_t *btn=nullptr,*text_lbl=nullptr,*icon_lbl=nullptr,*sensor_container=nullptr;};
constexpr int LV_OBJ_FLAG_HIDDEN=1;
void lv_label_set_display_text(lv_obj_t *,const char*){}
void lv_obj_clear_flag(lv_obj_t *,int){}
void lv_obj_add_flag(lv_obj_t *,int){}
std::string trim_display_unit(const std::string &s){return s;}
std::string subpage_companion_stat_default_unit(const std::string &){return "%";}
const char *companion_metric_icon(const std::string &){return "Gauge";}
const char *find_icon(const char *s){return s;}
int parse_precision(const std::string &){return 0;}
bool cfg_option_token_present(const std::string &,const char *){return false;}
bool subpage_companion_stat_config(const ParsedCfg &c){return c.options=="subpage_kind=companion_stat";}
int metric_bindings=0;
void companion_track_metric_card(lv_obj_t *,lv_obj_t *,void*,const std::string&,const std::string&,int,bool,bool){++metric_bindings;}
namespace esphome {using StringRef=std::string;}
bool is_entity_on_ref(esphome::StringRef){return false;}
namespace espdesktop::cards {
struct Context {card_runtime::CardRuntimeSpec runtime;};
struct NavigationDriverParentState {};
struct NavigationDriverChildIndicators {};
'''
nav=(HEADERS/'button_grid_navigation_driver.h').read_text()
for name in ('navigation_driver_matches','navigation_driver_parent_companion_stat_state_enabled',
             'navigation_driver_parent_sensor_state_enabled','navigation_driver_parent_text_state_enabled',
             'navigation_driver_parent_entity_state_enabled','navigation_driver_aggregates_child_state',
             'navigation_driver_bind_main','navigation_driver_add_child_indicator'):
    source+=definition(nav,name)[1]+'\n'
qr=(HEADERS/'button_grid_wifi_qr_driver.h').read_text()
for name in ('wifi_qr_driver_matches','wifi_qr_driver_bind_main'): source+=definition(qr,name)[1]+'\n'
source+='}\n'
source+=r'''
struct WifiQrModalUi {void *overlay=nullptr;std::string qr_payload;};
WifiQrModalUi ui;
WifiQrModalUi &wifi_qr_modal_ui(){return ui;}
enum class ControlModalKind{WIFI_QR};
int overlays_deleted=0;
void control_modal_delete_overlay(ControlModalKind,void*){++overlays_deleted;}
'''
source+=definition((HEADERS/'button_grid_wifi_qr.h').read_text(),'wifi_qr_hide_modal')[1]
source+=r'''
int main(){
 using namespace espdesktop::cards;
 BtnSlot slot;
 NavigationDriverParentState state;
 NavigationDriverChildIndicators children;
 for(const char *sensor:{"sensor.room","indicator",""}){
  ParsedCfg config;config.entity="light.room";config.sensor=sensor;config.options="subpage_kind=climate";
  const auto before=config.entity+config.sensor+config.options;
  Context context{espdesktop::card_runtime::resolve_card_runtime(config)};
  assert(navigation_driver_bind_main(slot,config,context,state));
  assert(!navigation_driver_parent_sensor_state_enabled(config,context));
  assert(!navigation_driver_parent_text_state_enabled(config,context));
  assert(!navigation_driver_parent_entity_state_enabled(config,context));
  assert(!navigation_driver_aggregates_child_state(config,context));
  navigation_driver_add_child_indicator(children,slot,0,config,context,"light.child");
  assert(metric_bindings==0 && before==config.entity+config.sensor+config.options);
 }
 ParsedCfg mac;mac.entity="system.cpu_usage";mac.options="subpage_kind=companion_stat";
 Context context{espdesktop::card_runtime::resolve_card_runtime(mac)};
 assert(navigation_driver_bind_main(slot,mac,context,state));
 assert(metric_bindings==1);
 ParsedCfg network;network.type="wifi_qr";network.entity="switch.guest_wifi";network.options="wifi_tabs=guest";
 context.runtime=espdesktop::card_runtime::resolve_card_runtime(network);
 assert(wifi_qr_driver_bind_main(slot,network,context));
 assert(network.entity=="switch.guest_wifi" && network.options=="wifi_tabs=guest");
 assert(wifi_qr_tabs("guest")==std::vector<std::string>{"guest"});
 assert(wifi_qr_local_tabs("guest").empty());
 assert(wifi_qr_local_tabs("guest|credentials")==std::vector<std::string>{"credentials"});
 assert((wifi_qr_local_tabs("credentials|qr|guest")==std::vector<std::string>{"credentials","qr"}));
 ui.overlay=&slot;ui.qr_payload="private credential";
 wifi_qr_hide_modal();assert(overlays_deleted==1 && !ui.overlay && ui.qr_payload.empty());
}
'''
with tempfile.TemporaryDirectory() as directory:
 cpp=Path(directory)/'test.cpp';exe=Path(directory)/'test';cpp.write_text(source)
 subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror','-I',str(HEADERS),str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
for name in ('button_grid_wifi_qr.h','button_grid_wifi_qr_driver.h','button_grid_navigation_driver.h'):
 text=(HEADERS/name).read_text()
 assert 'ha_subscribe' not in text and 'ha_send' not in text and 'subscribe_' not in text,name

modal=(HEADERS/'button_grid_wifi_qr.h').read_text()
_,open_modal=definition(modal,'wifi_qr_open_modal')
assert open_modal.index('if (!wifi_qr_has_local_view(config)) return;') < open_modal.index('wifi_qr_payload_from_config(')
assert open_modal.index('if (!wifi_qr_has_local_view(config)) return;') < open_modal.index('control_modal_open_shell(')
