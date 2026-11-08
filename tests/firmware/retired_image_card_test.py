"""Exercise the production retired-card driver without HA or downloader APIs."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "components/espdesktop/button_grid_image_driver.h").read_text()
source = source.replace('#pragma once', '').replace('#include "card_modal_target.h"', '')
harness = r'''
#include <cassert>
#include <string>
struct lv_obj_t { bool hidden=false, clickable=true, disabled=false; void *data=nullptr; std::string text; };
constexpr int LV_OBJ_FLAG_HIDDEN=1, LV_OBJ_FLAG_CLICKABLE=2;
void lv_obj_add_flag(lv_obj_t *o, int flag) { if (flag==1) o->hidden=true; else o->clickable=true; }
void lv_obj_clear_flag(lv_obj_t *o, int flag) { if (flag==1) o->hidden=false; else o->clickable=false; }
void lv_obj_set_user_data(lv_obj_t *o, void *data) { o->data=data; }
void lv_label_set_display_text(lv_obj_t *o, const char *s) { o->text=s; }
void set_wrapped_button_label_text(lv_obj_t *o, const char *s) { o->text=s; }
void set_card_disabled_state(lv_obj_t *o, bool value) { o->disabled=value; }
const char *find_icon(const char *name) { return name; }
struct ParsedCfg { std::string entity, options; };
struct BtnSlot { lv_obj_t *btn, *sensor_container, *icon_lbl, *text_lbl; };
struct GridConfig {};
struct CardPalette {};
void setup_toggle_visual(BtnSlot &, const ParsedCfg &) {}
int pool_resets=0;
void reset_image_card_pool(const GridConfig &) { ++pool_resets; }
namespace card_runtime { enum class CardDriverId { IMAGE, COMPANION }; }
namespace espdesktop::cards {
enum class Surface { MAIN_GRID, SUBPAGE };
struct Context { struct { card_runtime::CardDriverId driver; } runtime; Surface surface; };
struct ModalTarget { void *runtime=nullptr; };
}
'''
harness += source
harness += r'''
int main() {
 using namespace espdesktop::cards;
 lv_obj_t button, container, icon, label;
 BtnSlot slot{&button, &container, &icon, &label};
 GridConfig grid; CardPalette palette;
 for (auto entity : {"camera.front", "image.driveway", ""}) {
   ParsedCfg config{entity, "image_modal_refresh_mode=activity,image_modal_refresh_trigger=event.door"};
   Context context{{card_runtime::CardDriverId::IMAGE}, Surface::MAIN_GRID};
   assert(image_driver_setup_visual(slot, config, context, palette));
   assert(button.disabled && !button.clickable && container.hidden && !icon.hidden);
   assert(label.text=="--");
   assert(image_driver_attach_interaction(slot, config, context));
   assert(image_driver_refresh_layout(slot, config, context));
   assert(image_driver_bind_main(slot, config, context, grid, palette));
   assert(!image_driver_bind_subpage(slot, config, context, grid, palette));
   assert(image_driver_handle_main_click(context, config, &button));
   assert(image_driver_modal_target(context, config, &button).runtime==nullptr);
   context.surface=Surface::SUBPAGE;
   assert(image_driver_bind_subpage(slot, config, context, grid, palette));
   assert(!image_driver_bind_main(slot, config, context, grid, palette));
   button.data=&grid;
   assert(image_driver_cleanup(slot, config, context) && !button.data);
   assert(pool_resets==0);  // Retired records never allocate or reset the icon pool.
   assert(config.entity==entity && config.options.find("event.door")!=std::string::npos);
 }
 Context companion{{card_runtime::CardDriverId::COMPANION}, Surface::MAIN_GRID};
 ParsedCfg local{"webapp.mail", ""};
 button.disabled=false; button.clickable=true;
 assert(!image_driver_setup_visual(slot, local, companion, palette));
 assert(!button.disabled && button.clickable);
 assert(!image_driver_bind_main(slot, local, companion, grid, palette));
 image_driver_reset_pool(grid);  // Shared pool lifecycle still exists for Mac icons.
 assert(pool_resets==1);
}
'''
with tempfile.TemporaryDirectory() as directory:
    cpp = Path(directory) / "test.cpp"
    exe = Path(directory) / "test"
    cpp.write_text(harness)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
