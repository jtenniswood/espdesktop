"""Exercise the production no-animation descriptor using LVGL's state-change contract."""
from pathlib import Path
import subprocess
import sys
import tempfile

from generate_media_lifecycle_integration import definition

root = Path(__file__).resolve().parents[2]
header = (root / 'components/espdesktop/button_grid_cards.h').read_text()
line, helper = definition(header, 'apply_instant_button_feedback')
source = r'''
#include <cassert>
#include <cstdint>
using lv_style_prop_t = int;
using lv_style_selector_t = int;
constexpr int LV_STYLE_PROP_INV = 0, LV_PART_MAIN = 0, LV_STATE_DEFAULT = 0;
struct lv_style_transition_dsc_t {
  const lv_style_prop_t *props = nullptr;
  unsigned time = 0, delay = 0;
};
struct lv_obj_t { const lv_style_transition_dsc_t *transition = nullptr; };
void lv_anim_path_ease_out() {}
void lv_style_transition_dsc_init(lv_style_transition_dsc_t *d, const lv_style_prop_t *props,
                                void (*)(), unsigned time, unsigned delay, void *) {
  d->props = props; d->time = time; d->delay = delay;
}
void lv_obj_set_style_transition(lv_obj_t *obj, const lv_style_transition_dsc_t *d, int) {
  // LVGL's lv_obj.c reads tr->props without a null-descriptor check.
  assert(d && d->props);
  obj->transition = d;
}
'''
source += f'\n#line {line} "button_grid_cards.h"\n{helper}\n'
source += r'''
int main() {
  apply_instant_button_feedback(nullptr);
  lv_obj_t first, second;
  apply_instant_button_feedback(&first);
  apply_instant_button_feedback(&second);
  assert(first.transition == second.transition);
  for (unsigned state_change = 0; state_change < 2000; ++state_change) {
    // Same property-list traversal used by LVGL for presses, releases and focus changes.
    unsigned animations = 0;
    for (unsigned j = 0; first.transition->props[j] != 0; ++j) ++animations;
    assert(animations == 0);
    assert(first.transition->time == 0 && first.transition->delay == 0);
    apply_instant_button_feedback(&first); // Reconnect/theme setup keeps a valid descriptor.
  }
}
'''
with tempfile.TemporaryDirectory(prefix='instant-button-feedback-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall',
                    '-Wextra', '-Werror', '-fsanitize=address,undefined', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Instant feedback retains a valid empty transition across 2000 state changes.')
