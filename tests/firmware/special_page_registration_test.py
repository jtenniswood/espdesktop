"""Check special pages stay outside the clock-bar page registry."""
from pathlib import Path
import subprocess
import sys
import tempfile
from generate_media_lifecycle_integration import definition

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'components/espdesktop/button_grid_navigation.h').read_text()
functions = definition(source, 'navigation_register_subpage')[1]
stubs = r'''
#include <cassert>
#include <string>
#include <vector>
constexpr int LV_EVENT_SCREEN_LOADED=2, LV_EVENT_SCREEN_UNLOADED=3;
struct lv_event_t {};
struct lv_obj_t {};
void lv_obj_add_event_cb(lv_obj_t *,void (*)(lv_event_t *),int,void *) {}
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
  lv_obj_t regular, special;
  navigation_register_subpage(1,0,"subpage",&regular);
  navigation_register_subpage(2,0,"special",&special);
  assert(entries.size()==2 && clock_pages.size()==1 && clock_pages[0]==&regular);
}
'''
with tempfile.TemporaryDirectory(prefix='special-page-registration-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(stubs + functions + checks)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Ordinary pages register for the clock bar; special pages do not.')
