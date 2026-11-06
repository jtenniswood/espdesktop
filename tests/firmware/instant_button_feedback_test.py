"""Check real app feedback against LVGL's inherited-transition selection contract."""
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
#include <map>
#include <vector>
using lv_style_prop_t = int;
using lv_style_selector_t = int;
using lv_state_t = int;
constexpr int LV_STYLE_PROP_INV = 0, LV_STYLE_BG_COLOR = 1, LV_STYLE_BG_OPA = 2;
constexpr int LV_PART_MAIN = 0, LV_STATE_DEFAULT = 0, LV_STATE_CHECKED = 1, LV_STATE_PRESSED = 2;
struct lv_style_transition_dsc_t {
  const lv_style_prop_t *props = nullptr;
  unsigned time = 0, delay = 0;
};
struct lv_obj_t {
  std::map<int, const lv_style_transition_dsc_t *> transitions;
  std::map<int, int> outline_width;
};
void lv_anim_path_ease_out() {}
void lv_style_transition_dsc_init(lv_style_transition_dsc_t *d, const lv_style_prop_t *props,
                                void (*)(), unsigned time, unsigned delay, void *) {
  d->props = props; d->time = time; d->delay = delay;
}
void lv_obj_set_style_transition(lv_obj_t *obj, const lv_style_transition_dsc_t *d, int selector) {
  assert(d && d->props); // LVGL reads tr->props without checking for a null descriptor.
  obj->transitions[selector] = d;
}
void lv_obj_set_style_outline_width(lv_obj_t *obj, int width, int selector) {
  obj->outline_width[selector] = width;
}
'''
source += f'\n#line {line} "button_grid_cards.h"\n{helper}\n'
source += r'''
int main() {
  apply_instant_button_feedback(nullptr);
  lv_obj_t first, second;
  apply_instant_button_feedback(&first);
  apply_instant_button_feedback(&second);
  const lv_style_prop_t theme_props[] = {LV_STYLE_BG_COLOR, LV_STYLE_BG_OPA, 0};
  const lv_style_transition_dsc_t theme_default{theme_props, 200, 70};
  const lv_style_transition_dsc_t theme_pressed{theme_props, 200, 0};
  for (unsigned change = 0; change < 2000; ++change) {
    const int state = change % 4; // Off/on, released/pressed, including pressed+checked.
    std::vector<std::pair<int, const lv_style_transition_dsc_t *>> styles;
    for (auto entry : first.transitions) styles.push_back(entry);
    styles.push_back({LV_STATE_PRESSED, &theme_pressed});
    styles.push_back({LV_STATE_DEFAULT, &theme_default});
    struct Selected { int state; unsigned time, delay; };
    std::map<int, Selected> selected;
    // LVGL gathers properties from every matching style, not just the local
    // transition. An empty descriptor leaves inherited theme fades in place.
    for (const auto &style : styles) {
      if (style.first & ~state) continue;
      const auto *transition = style.second;
      assert(transition && transition->props);
      for (unsigned j = 0; transition->props[j] != 0; ++j) {
        const int prop = transition->props[j];
        auto existing = selected.find(prop);
        if (existing != selected.end() && existing->second.state >= style.first) continue;
        selected[prop] = {style.first, transition->time, transition->delay};
      }
    }
    for (int prop : {LV_STYLE_BG_COLOR, LV_STYLE_BG_OPA}) {
      assert(selected.count(prop));
      assert(selected.at(prop).time == 0 && selected.at(prop).delay == 0);
    }
    assert(first.outline_width.at(state) == 0);
    assert(first.transitions.at(state) == second.transitions.at(state));
    apply_instant_button_feedback(&first); // Reconnect/theme setup remains safe.
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
print('Fill overrides inherited fades with zero duration/delay and no outline across 2000 state changes.')
