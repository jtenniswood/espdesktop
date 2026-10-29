"""Exercise actual alarm environment/binding and theme refresh on subpages."""
from pathlib import Path
import subprocess, tempfile
from generate_media_lifecycle_integration import definition
root=Path(__file__).resolve().parents[2];headers=root/'components/espdesktop'
driver=(headers/'button_grid_alarm_driver.h').read_text()
struct=driver[driver.index('struct AlarmDriverEnvironment {'):driver.index('\n};',driver.index('struct AlarmDriverEnvironment {'))+3]
source=r'''
#include <cassert>
#include <cstdint>
#include <functional>
#include <string>
struct lv_obj_t {}; struct lv_font_t {}; using lv_color_t=uint32_t;
constexpr int LV_PART_MAIN=0; constexpr uint32_t DEFAULT_ACCENT_COLOR=0xFF8C00;
struct Theme {uint32_t surface_primary, surface_secondary, text_primary;} theme{0x242424,0x121212,0xFFFFFF};
const Theme &current_theme(){return theme;}
uint32_t theme_display_color(uint32_t c){return c;}
uint32_t correct_display_color(uint32_t c,int,int,int){return c;}
lv_color_t lv_color_hex(uint32_t c){return c;}
const lv_font_t *lv_obj_get_style_text_font(lv_obj_t*,int){return nullptr;}
lv_color_t lv_obj_get_style_text_color(lv_obj_t*,int){return 0xFFFFFF;}
void lv_obj_set_user_data(lv_obj_t*,void*){}
namespace espdesktop {enum class DisplayTakeoverKind {ALARM};}
namespace card_runtime {enum class CardDriverId {ALARM};}
struct AlarmDelayAudioHooks {};
struct ParsedCfg {std::string entity,options,label;};
struct BtnSlot {lv_obj_t *btn=nullptr,*text_lbl=nullptr;};
struct CardPalette {bool has_on=false,custom_background=false;uint32_t on_val=DEFAULT_ACCENT_COLOR,off_val=0x242424,sensor_val=0x121212;};
struct DisplayProfile {struct {int red_percent=100,green_percent=100,blue_percent=100;} color;};
const lv_font_t *display_icon_font(const DisplayProfile&){return nullptr;}
const lv_font_t *display_media_title_font_or(const DisplayProfile&,const lv_font_t *f){return f;}
const lv_font_t *display_sensor_font(const DisplayProfile&){return nullptr;}
const lv_font_t *display_optional_media_title_font(const DisplayProfile&){return nullptr;}
int display_main_width_percent(const DisplayProfile&){return 100;}
struct GridConfig {std::function<void(espdesktop::DisplayTakeoverKind)> begin_display_takeover,end_display_takeover;AlarmDelayAudioHooks alarm_delay_audio;};
struct AlarmCardCtx {uint32_t off_color=0;bool off_theme_owned=true;int theme_red_percent=100,theme_green_percent=100,theme_blue_percent=100;AlarmDelayAudioHooks audio_hooks;lv_obj_t *grid_page=nullptr,*status_label=nullptr;bool show_status_label=true;} alarm;
ParsedCfg bound_config;
template<typename...Rest> AlarmCardCtx *create_alarm_card_context(BtnSlot&,const ParsedCfg&config,lv_obj_t*,int,int,uint32_t,uint32_t off,Rest...){alarm={};alarm.off_color=off;bound_config=config;return &alarm;}
AlarmCardCtx *grid_delete_alarm_card_with_owner(lv_obj_t*,AlarmCardCtx *a){return a;}
AlarmCardCtx *grid_track_alarm_card_runtime(lv_obj_t*,AlarmCardCtx *a){return a;}
void alarm_delay_audio_register_context(AlarmCardCtx*){}
void subscribe_alarm_state(AlarmCardCtx*){}
void subscribe_friendly_name(lv_obj_t*,const std::string&){}
namespace espdesktop::cards {
enum class Surface {MAIN_GRID,SUBPAGE};
struct Context {struct {card_runtime::CardDriverId driver=card_runtime::CardDriverId::ALARM;}runtime;Surface surface=Surface::SUBPAGE;};
'''+struct
for name in ('alarm_driver_matches','alarm_driver_track','alarm_driver_environment','alarm_driver_effective_config','alarm_driver_bind_data'):
 source+=definition(driver,name)[1]+'\n'
source+='}\n'+definition((headers/'button_grid_alarm.h').read_text(),'alarm_theme_off_color')[1]+r'''
int main(){
 using namespace espdesktop::cards;
 lv_obj_t button,page;BtnSlot slot{&button,nullptr};DisplayProfile display;GridConfig grid;
 Context context;ParsedCfg parent{"alarm_control_panel.home","card_off_color=9D9D9D",""},child;
 CardPalette normal;
 auto env=alarm_driver_environment(normal,display,slot,grid,&page,16,4);env.parent_config=&parent;
 auto *a=alarm_driver_bind_data(slot,child,context,env);
 assert(bound_config.entity==parent.entity && bound_config.options==parent.options);
 assert(alarm_theme_off_color(a)==0x242424);
 theme.surface_primary=0xFFFFFF;
 assert(alarm_theme_off_color(a)==0xFFFFFF); // Inherited parent options do not freeze the child's palette.
 CardPalette custom;custom.custom_background=true;custom.off_val=0x6633B9;
 child.options="card_off_color=6633B9";
 env=alarm_driver_environment(custom,display,slot,grid,&page,16,4);env.parent_config=&parent;
 a=alarm_driver_bind_data(slot,child,context,env);
 assert(alarm_theme_off_color(a)==0x6633B9);
 theme.surface_primary=0x242424;
 assert(alarm_theme_off_color(a)==0x6633B9); // Actual child custom palette stays fixed.
}
'''
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp);(p/'test.cpp').write_text(source)
 subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror',str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Production alarm binding preserves child palette ownership through inherited options and theme switches.')
