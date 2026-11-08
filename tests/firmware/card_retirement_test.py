"""Exercise the production classifier and actual main-click dispatch without HA."""
from pathlib import Path
import json,re,subprocess,sys,tempfile
from production_source import definition
ROOT=Path(__file__).resolve().parents[2]
fixtures=json.loads((ROOT/"common/config/card_retirement_fixtures.json").read_text())
_,click=definition((ROOT/"components/espdesktop/button_grid_actions.h").read_text(),"handle_button_click")
harness=r'''
#include <cassert>
#include <string>
#include "retired_home_assistant_cards.h"
#define ESP_LOGI(...) ((void)0)
#define ESP_LOGE(...) ((void)0)
struct ParsedCfg { std::string type,entity,sensor,label,options; } current;
struct lv_obj_t {};
ParsedCfg parse_cfg(const std::string &) {return current;}
int card_runtime_context(const ParsedCfg &) {return 0;}
bool card_runtime_passive(int) {return false;}
namespace espdesktop {
struct Pin {bool locked(){return false;}};
Pin &screensaver_pin(){static Pin pin; return pin;}
namespace cards {
'''
for name in set(re.findall(r'espdesktop::cards::(\w+_handle_main_click)',click)):
    harness+='template<typename... T> bool '+name+'(T&&...) {assert(false && "retired card reached a live action driver"); return false;}\n'
harness+='}}\n'+click+'\nint main(){\n'
for fixture in fixtures:
    c=fixture['card']; fields=','.join(json.dumps(c.get(k,'')) for k in ('type','entity','sensor','label','options'))
    harness+='current={'+fields+'}; assert(retired_home_assistant_card(current)=='+str(fixture['retired']).lower()+');\n'
    if fixture['retired']: harness+='handle_button_click("saved",1,nullptr);\n'
harness+='}\n'
with tempfile.TemporaryDirectory() as directory:
    cpp=Path(directory)/'test.cpp'; exe=Path(directory)/'test'; cpp.write_text(harness)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++','-std=c++17','-Wall','-Wextra','-Werror','-I',str(ROOT/'components/espdesktop'),str(cpp),'-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
grid=(ROOT/'components/espdesktop/button_grid_grid.h').read_text()
main=grid.index('navigation_register_home_target(idx, pos, p.label, scfg, s.btn);')
assert grid.index('if (retired_home_assistant_card(p)) continue;',main)<grid.index('basic_action_driver_bind_main(',main)
child=grid.index('refresh_card_layout(sub_slot, sb_cfg, cfg, rs, cs);')
assert grid.index('if (retired_home_assistant_card(sb_cfg)) continue;',child)<grid.index('basic_action_driver_bind_subpage(',child)
