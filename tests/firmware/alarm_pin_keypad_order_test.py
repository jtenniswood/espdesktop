"""Exercise the production alarm caller against the shared keypad's real defaults."""
from pathlib import Path
import subprocess
import sys
import tempfile

from generate_media_lifecycle_integration import definition

ROOT = Path(__file__).resolve().parents[2]
headers = ROOT / "components/espdesktop"
alarm = (headers / "button_grid_alarm.h").read_text()
keypad = (headers / "pin_keypad.h").read_text()
_, create_keypad = definition(keypad, "pin_keypad_create")
# Keep the real signature/defaults, modeling only LVGL construction. The real
# digit policy and the alarm's complete production functions run unchanged.
signature = create_keypad[:create_keypad.index("{")]
source = r'''
#include <array>
#include <cassert>
#include <cstdint>
#include <string>
#include "pin_keypad_order.h"
using lv_coord_t = int;
struct lv_font_t {};
struct lv_obj_t {};
struct lv_event_t {};
using lv_event_cb_t = void (*)(lv_event_t *);
constexpr int LV_PART_MAIN = 0;
struct ControlModalLayout {};
struct ControlModalShell {
  lv_obj_t *overlay, *panel, *close_btn;
  ControlModalLayout layout;
};
enum class ControlModalKind { ALARM_PIN };
struct AlarmCardCtx {
  bool available = true;
  lv_obj_t *btn = nullptr, *icon_lbl = nullptr;
  const lv_font_t *pin_label_font = nullptr, *key_label_font = nullptr, *icon_font = nullptr;
  int width_compensation_percent = 100;
};
struct AlarmActionCtx { AlarmCardCtx *card; bool requires_pin; };
struct AlarmPinModalUi {
  AlarmActionCtx active_action{};
  AlarmActionCtx *active = nullptr;
  std::string pin;
  lv_obj_t *overlay = nullptr, *panel = nullptr, *back_btn = nullptr, *pin_lbl = nullptr;
};
AlarmPinModalUi &alarm_pin_modal_ui() { static AlarmPinModalUi ui; return ui; }
bool alarm_action_context_valid(AlarmActionCtx *action) { return action && action->card; }
lv_font_t font;
const lv_font_t *lv_obj_get_style_text_font(lv_obj_t *, int) { return &font; }
void alarm_pin_hide_modal() {}
void alarm_pin_key_cb(lv_event_t *) {}
void alarm_pin_update_display() {}
void lv_obj_move_foreground(lv_obj_t *) {}
lv_obj_t overlay, panel, close_button, pin_label;
int opens = 0, commands = 0, random_calls = 0;
std::array<uint8_t, 10> rendered_digits{};
ControlModalShell control_modal_open_shell(ControlModalKind, lv_obj_t *, int,
                                           const lv_font_t *, void (*)()) {
  ++opens;
  return {&overlay, &panel, &close_button, {}};
}
void send_alarm_action(AlarmActionCtx *, const std::string &) { ++commands; }
'''
source += signature + r'''{
  (void)panel; (void)layout; (void)label_font; (void)key_label_font;
  (void)icon_font; (void)width_compensation_percent; (void)key_cb;
  (void)center_prompt; (void)prompt_top;
  rendered_digits = pin_keypad_digits(randomize, [] { ++random_calls; return 0u; });
  return &pin_label;
}
'''
for name in ("alarm_pin_open_modal", "alarm_action_activate"):
    line, code = definition(alarm, name)
    source += f'\n#line {line} "button_grid_alarm.h"\n{code}\n'
source += r'''
#line 1 "alarm_pin_keypad_order_test.cpp"
int main() {
  AlarmCardCtx card;
  AlarmActionCtx action{&card, true};
  alarm_action_activate(nullptr);
  card.available = false;
  alarm_action_activate(&action);
  assert(opens == 0 && commands == 0);
  card.available = true;
  action.requires_pin = false;
  alarm_action_activate(&action);
  assert(opens == 0 && commands == 1);
  action.requires_pin = true;
  const std::array<uint8_t, 10> expected{{1, 2, 3, 4, 5, 6, 7, 8, 9, 0}};
  for (int attempt = 0; attempt < 4; ++attempt) {
    alarm_pin_modal_ui().pin = "previous entry";
    alarm_action_activate(&action);
    assert(rendered_digits == expected && random_calls == 0);
    assert(alarm_pin_modal_ui().pin.empty());
    assert(alarm_pin_modal_ui().active->card == &card);
  }
  assert(opens == 4 && commands == 1);
  // Other callers can still request the shared keypad's randomized layout.
  pin_keypad_create(&panel, {}, &font, &font, &font, 100, alarm_pin_key_cb, true);
  assert(random_calls == 9);
  alarm_action_activate(&action);
  assert(rendered_digits == expected && random_calls == 9);
}
'''
with tempfile.TemporaryDirectory(prefix="espdesktop-alarm-pin-") as directory:
    cpp, binary = Path(directory) / "test.cpp", Path(directory) / "test"
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "c++", "-std=c++17",
                    "-Wall", "-Wextra", "-Werror", "-I", str(headers), str(cpp),
                    "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Alarm PIN uses fixed 1–9/0 digits; shared randomized keypads remain supported.")
