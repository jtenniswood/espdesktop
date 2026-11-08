"""Run the retired media driver with actual generated dispatch and no HA APIs."""
from pathlib import Path
import subprocess
import sys
import tempfile
ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "components/espdesktop/button_grid_media_driver.h").read_text().replace('#pragma once', '').replace('#include "card_modal_target.h"', '')
harness = r'''
#include <cassert>
#include <functional>
#include <string>
#include "button_grid_contract_generated.h"
struct lv_obj_t { bool hidden=false, clickable=true, disabled=false; void *data=nullptr; std::string text; };
constexpr int LV_OBJ_FLAG_HIDDEN=1, LV_OBJ_FLAG_CLICKABLE=2;
void lv_obj_add_flag(lv_obj_t *o, int flag) { if (flag==1) o->hidden=true; else o->clickable=true; }
void lv_obj_clear_flag(lv_obj_t *o, int flag) { if (flag==1) o->hidden=false; else o->clickable=false; }
void lv_obj_set_user_data(lv_obj_t *o, void *data) { o->data=data; }
void lv_label_set_display_text(lv_obj_t *o, const char *s) { o->text=s; }
void set_wrapped_button_label_text(lv_obj_t *o, const char *s) { o->text=s; }
void set_card_disabled_state(lv_obj_t *o, bool value) { o->disabled=value; }
const char *find_icon(const char *name) { return name; }
struct ParsedCfg { std::string type, entity, sensor, options; };
struct BtnSlot { lv_obj_t *btn, *sensor_container, *icon_lbl, *text_lbl; };
struct GridConfig {}; struct CardPalette {}; struct DisplayProfile {};
void setup_toggle_visual(BtnSlot &, const ParsedCfg &) {}
namespace espdesktop::cards {
enum class Surface { MAIN_GRID, SUBPAGE };
struct Context { card_runtime::CardRuntimeSpec runtime; Surface surface; };
struct ModalTarget { bool available=false; };
}
'''
harness += source
harness += r'''
int main() {
 using namespace espdesktop::cards;
 lv_obj_t button, container, icon, label;
 BtnSlot slot{&button, &container, &icon, &label};
 GridConfig grid; CardPalette palette; DisplayProfile display;
 auto environment=media_driver_environment(palette, display, slot, grid);
 unsigned indicators=0;
 environment.add_parent_indicator=[&](const std::string &) { ++indicators; };
 for (const char *mode : {"", "control_modal", "speaker_group", "play_pause", "previous", "next", "volume", "position", "now_playing", "cover_art", "playlist"}) {
   ParsedCfg config{"media", "media_player.office", mode, "media_secondary_entity=media_player.other"};
   Context context{espdesktop::card_runtime::resolve_card_runtime(config), Surface::MAIN_GRID};
   assert(media_driver_setup_visual(slot, config, context, palette, display));
   assert(button.disabled && !button.clickable && container.hidden && !icon.hidden);
   assert(label.text=="--");
   assert(media_driver_attach_interaction(slot, config, context));
   assert(media_driver_refresh_layout(slot, config, context, grid));
   assert(media_driver_bind_main(slot, config, context, environment));
   assert(!media_driver_bind_subpage(slot, config, context, environment));
   assert(media_driver_handle_main_click(context, config, &button));
   assert(!media_driver_modal_target(context, config, &button).available);
   context.surface=Surface::SUBPAGE;
   assert(media_driver_bind_subpage(slot, config, context, environment));
   assert(!media_driver_bind_main(slot, config, context, environment));
   assert(indicators==0);
   assert(config.entity=="media_player.office" && config.options=="media_secondary_entity=media_player.other");
 }
 for (const char *entity : {"media.output_volume", "media.input_volume"}) {
   ParsedCfg config{"slider", entity, "", ""};
   Context context{espdesktop::card_runtime::resolve_card_runtime(config), Surface::MAIN_GRID};
   button.disabled=false; button.clickable=true;
   assert(!media_driver_setup_visual(slot, config, context, palette, display));
   assert(!button.disabled && button.clickable);
   assert(!media_driver_bind_main(slot, config, context, environment));
 }
}
'''
with tempfile.TemporaryDirectory() as directory:
    cpp=Path(directory)/"test.cpp"; exe=Path(directory)/"test"
    cpp.write_text(harness)
    subprocess.run([sys.argv[1] if len(sys.argv)>1 else "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(ROOT/"components/espdesktop"), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
# No hidden firmware discovery service, probe, socket reservation, or config wire remains.
for directory in (ROOT/"common", ROOT/"devices", ROOT/"components/espdesktop"):
    for path in directory.rglob("*"):
        if path.is_file() and ".esphome" not in path.parts and path.suffix in {".h", ".cpp", ".yaml", ".py"}:
            text=path.read_text()
            for retired in ("home_assistant_endpoint", "HomeAssistantEndpoint", "ha_endpoint_probe", "cover_art_resolve_home_assistant_base_url"):
                assert retired not in text, f"{path}: retired endpoint remains: {retired}"

