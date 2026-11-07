"""Check swipe handles stay outside cards and special pages skip the clock bar."""
from pathlib import Path
import subprocess
import sys
import tempfile
from generate_media_lifecycle_integration import definition

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
functions = '\n'.join(definition(source, name)[1] for name in (
    'navigation_swipe_handle_padding', 'navigation_create_swipe_handle',
    'navigation_home_swipe_handle', 'navigation_update_home_swipe_handle',
    'navigation_register_subpage',
))
stubs = r'''
#include <algorithm>
#include <cassert>
#include <string>
#include <vector>
using lv_coord_t = int;
constexpr int LV_PART_MAIN=0, LV_RADIUS_CIRCLE=999, LV_OPA_COVER=255;
enum lv_obj_flag_t { LV_OBJ_FLAG_IGNORE_LAYOUT=1, LV_OBJ_FLAG_FLOATING=2,
                     LV_OBJ_FLAG_CLICKABLE=4, LV_OBJ_FLAG_SCROLLABLE=8 };
constexpr int LV_ALIGN_TOP_MID=1, LV_ALIGN_BOTTOM_MID=2;
constexpr int LV_EVENT_DELETE=1, LV_EVENT_SCREEN_LOADED=2, LV_EVENT_SCREEN_UNLOADED=3;
struct lv_event_t {};
struct lv_obj_t {
  lv_obj_t *parent=nullptr;
  int width=480, height=480, top=40, bottom=4, flags=12, y=0, children=0;
  void (*on_delete)(lv_event_t *)=nullptr;
};
int created=0, deleted=0, responsive_refreshes=0;
int lv_obj_get_width(lv_obj_t *o) { return o->width; }
void lv_obj_update_layout(lv_obj_t *) {}
lv_obj_t *lv_obj_create(lv_obj_t *p) {
  auto *o=new lv_obj_t; o->parent=p; ++p->children; ++created; return o;
}
void lv_obj_remove_style_all(lv_obj_t *) {}
void lv_obj_add_flag(lv_obj_t *o,lv_obj_flag_t f) { o->flags|=f; }
void lv_obj_clear_flag(lv_obj_t *o,lv_obj_flag_t f) { o->flags&=~f; }
void lv_obj_set_size(lv_obj_t *o,int w,int h) { o->width=w; o->height=h; }
void lv_obj_set_style_radius(lv_obj_t *,int,int) {}
void lv_obj_set_style_bg_color(lv_obj_t *,int,int) {}
void lv_obj_set_style_bg_opa(lv_obj_t *,int,int) {}
int lv_obj_get_style_pad_top(lv_obj_t *o,int) { return o->top; }
int lv_obj_get_style_pad_bottom(lv_obj_t *o,int) { return o->bottom; }
void lv_obj_set_style_pad_bottom(lv_obj_t *o,int value,int) { o->bottom=value; }
lv_obj_t *lv_obj_get_parent(lv_obj_t *o) { return o->parent; }
void lv_obj_align(lv_obj_t *o,int align,int,int offset) {
  auto *p=o->parent;
  o->y=(align==LV_ALIGN_TOP_MID ? p->top : p->height-p->bottom-o->height)+offset;
}
void lv_obj_add_event_cb(lv_obj_t *o,void (*cb)(lv_event_t *),int code,void *) {
  if(code==LV_EVENT_DELETE) o->on_delete=cb;
}
void lv_obj_del(lv_obj_t *o) {
  if(o->on_delete) { lv_event_t e; o->on_delete(&e); }
  --o->parent->children; ++deleted; delete o;
}
void clock_bar_refresh_responsive_grid_cards(lv_obj_t *) { ++responsive_refreshes; }
struct Theme { int text_muted=0; };
Theme current_theme() { return {}; }
int theme_display_color(int c) { return c; }
int lv_color_hex(int c) { return c; }
struct NavigationSubpageEntry {
  int slot=0, display_order=0; std::string kind; lv_obj_t *screen=nullptr;
};
std::vector<NavigationSubpageEntry> entries;
std::vector<NavigationSubpageEntry> &navigation_subpages() { return entries; }
std::vector<lv_obj_t *> clock_pages;
void clock_bar_register_button_grid_page(lv_obj_t *o) { clock_pages.push_back(o); }
void navigation_subpage_screen_changed(lv_event_t *) {}
std::string navigation_trim(const std::string &s) { return s; }
std::string navigation_lower(const std::string &s) { return s; }
'''
checks = r'''
int main() {
  for (int width : {480, 800, 1024, 1280}) {
    lv_obj_t home; home.width=width;
    navigation_update_home_swipe_handle(&home,true);
    auto *handle=navigation_home_swipe_handle();
    assert(handle && home.children==1);
    assert(!(handle->flags & (LV_OBJ_FLAG_CLICKABLE|LV_OBJ_FLAG_SCROLLABLE)));
    assert(handle->flags & LV_OBJ_FLAG_IGNORE_LAYOUT);
    assert(handle->y >= home.height-home.bottom);
    assert(handle->y+handle->height < home.height);
    navigation_update_home_swipe_handle(&home,true);
    assert(home.children==1); // Rebuilds replace the handle instead of leaking it.
    navigation_update_home_swipe_handle(&home,false);
    assert(!navigation_home_swipe_handle() && home.children==0 && home.bottom==4);
    lv_obj_t special; special.width=width;
    special.top=navigation_swipe_handle_padding(&special);
    auto *top=navigation_create_swipe_handle(&special,true);
    assert(top->y>=0 && top->y+top->height<special.top);
    lv_obj_del(top);
  }
  assert(created==deleted && responsive_refreshes==8);
  lv_obj_t regular, special;
  navigation_register_subpage(1,0,"subpage",&regular);
  navigation_register_subpage(2,0,"special",&special);
  assert(entries.size()==2 && clock_pages.size()==1 && clock_pages[0]==&regular);
}
'''
with tempfile.TemporaryDirectory(prefix='swipe-handle-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(stubs + functions + checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Swipe handles fit outside cards, survive rebuilds, and special pages skip the clock bar.')
