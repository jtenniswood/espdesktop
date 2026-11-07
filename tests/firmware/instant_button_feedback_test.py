"""Check real app feedback against LVGL's inherited-transition selection contract."""
from pathlib import Path
import subprocess
import sys
import tempfile

from generate_media_lifecycle_integration import definition

root = Path(__file__).resolve().parents[2]
header = (root / 'components/espdesktop/instant_button_style.h').read_text()
line, helper = definition(header, 'apply_instant_button_feedback')
source = r'''
#include <cassert>
#include <cstdint>
#include <map>
#include <vector>
using lv_style_prop_t = int;
using lv_style_selector_t = int;
enum lv_state_t { LV_STATE_DEFAULT=0, LV_STATE_CHECKED=1, LV_STATE_PRESSED=2 };
constexpr int LV_STYLE_TRANSITION=1, LV_STYLE_BG_COLOR=2, LV_STYLE_OUTLINE_WIDTH=3;
constexpr int LV_STYLE_RES_FOUND=1, LV_PART_MAIN=0;
struct lv_style_value_t { int num=0; };
struct lv_style_t { std::map<int,int> props; uint32_t prop_cnt; };
struct Entry { lv_style_t *style; unsigned selector; bool is_trans=false,is_local=false; };
struct lv_obj_t {
 std::vector<Entry> entries; Entry *styles=nullptr; uint32_t style_cnt=0;
 std::map<int,int> outline_width;
 void sync() { styles=entries.data();style_cnt=entries.size(); }
};
int lv_style_get_prop(const lv_style_t *s,int p,lv_style_value_t*) { return s->props.count(p); }
void lv_obj_remove_local_style_prop(lv_obj_t *o,int p,unsigned selector) {
 for(auto &e:o->entries) if(e.is_local&&e.selector==selector) { e.style->props.erase(p);e.style->prop_cnt=e.style->props.size(); }
}
void lv_obj_remove_style(lv_obj_t *o,const lv_style_t *s,unsigned selector) {
 for(auto i=o->entries.begin();i!=o->entries.end();) {
  if(i->style==s&&i->selector==selector)i=o->entries.erase(i);else ++i;
 }o->sync();
}
void lv_obj_set_style_outline_width(lv_obj_t *o,int width,int selector) { o->outline_width[selector]=width; }
'''
_, removal = definition((root / 'components/espdesktop/instant_button_style.h').read_text(), 'remove_button_state_transitions')
source += removal + '\n' + helper
source += r'''
int main() {
 remove_button_state_transitions(nullptr);apply_instant_button_feedback(nullptr);
 lv_style_t base{{{LV_STYLE_BG_COLOR,42}},1};
 lv_style_t normal{{{LV_STYLE_TRANSITION,200}},1},pressed{{{LV_STYLE_TRANSITION,100}},1};
 lv_style_t local{{{LV_STYLE_TRANSITION,0},{LV_STYLE_OUTLINE_WIDTH,0}},2};
 lv_obj_t first,second;
 first.entries={{&base,0},{&normal,0},{&pressed,LV_STATE_PRESSED},{&local,0,false,true}};first.sync();
 second.entries={{&base,0},{&normal,0},{&pressed,LV_STATE_PRESSED}};second.sync();
 apply_instant_button_feedback(&first);
 assert(normal.props.count(LV_STYLE_TRANSITION)); // Shared theme is unchanged.
 assert(second.style_cnt==3);
 assert(first.style_cnt==2&&local.props.count(LV_STYLE_OUTLINE_WIDTH));
 assert(!local.props.count(LV_STYLE_TRANSITION));
 assert(first.entries[0].style==&base&&base.props.at(LV_STYLE_BG_COLOR)==42);
 for(unsigned i=0;i<2000;++i) {
  apply_instant_button_feedback(&first);
  const unsigned state=i%4;
  for(const auto&e:first.entries) {
   if(e.selector&~state)continue;
   assert(!e.style->props.count(LV_STYLE_TRANSITION));
  }
  assert(first.outline_width.at(state)==0);
 }
 apply_instant_button_feedback(&second);assert(second.style_cnt==1);
}
'''
with tempfile.TemporaryDirectory(prefix='instant-button-feedback-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall',
                    '-Wextra', '-Werror', '-fsanitize=address,undefined', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Instant feedback removes native animation styles, preserves shared colours and disables outlines across 2000 state changes.")
