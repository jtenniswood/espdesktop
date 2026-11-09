"""Run the production preference lambdas before and after application startup."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import textwrap

ROOT = Path(__file__).resolve().parents[2]
display = (ROOT / "common/config/display.yaml").read_text()
boot = re.search(
    r"    - priority: (-?\d+)\n      then:\n        - lambda: \|-\n"
    r"((?:            [^\n]*\n)+)(?=    - priority: -100)", display,
)
assert boot is not None, "Preference must restore before grid initialization"
# Application setup uses AFTER_WIFI (200); grid initialization starts at -100.
assert -100 < int(boot[1]) < 200
switch = display.split('    id: companion_auto_open_app_subpages_enabled\n', 1)[1].split(
    '\n  - platform:', 1,
)[0]
assert 'restore_mode: RESTORE_DEFAULT_ON' in switch
assert 'optimistic: false' in switch
app = (ROOT / "components/espdesktop/espdesktop_app.cpp").read_text()
publish_start = app.index("void EspDesktopApp::publish_app_subpage_preference")
publish_end = app.index("void EspDesktopApp::retry_configuration_compatibility", publish_start)

def callback(event: str) -> str:
    match = re.search(rf"    {event}:\n      - lambda: \|-\n((?:          [^\n]*\n?)+)", switch)
    assert match is not None
    return textwrap.dedent(match[1])

source = r'''
#include <cassert>
#include <cstdlib>
#include <initializer_list>
namespace espdesktop {
inline bool ready = false;
inline int core;
inline int *active_espdesktop_app_core() { return ready ? &core : nullptr; }
}
namespace esphome::switch_ {
struct Switch {
  bool state = true;
  // ESPHome resolves bare id() references in lambdas to pointers.
  Switch &operator*() { return *this; }
  void publish_state(bool enabled) { state = enabled; }
};
}
esphome::switch_::Switch companion_auto_open_app_subpages_enabled, companion_return_home_on_app_switch_enabled;
bool return_home = true;
void companion_set_return_home_on_app_switch(bool enabled) { return_home = enabled; }
#define id(value) value
bool applied_value = true;
int writes = 0;
void companion_set_auto_open_app_subpages(bool enabled) {
  if (!espdesktop::active_espdesktop_app_core()) std::abort();
  applied_value = enabled;
  ++writes;
}
namespace espdesktop {
struct EspDesktopApp {
  int &core_ = core;
  esphome::switch_::Switch *app_subpage_switch_ = nullptr;
  void publish_app_subpage_preference(bool);
  void bind_app_subpage_preference_switch(esphome::switch_::Switch &);
};
}
espdesktop::EspDesktopApp espdesktop_app;
'''
source += "namespace espdesktop {\n" + app[publish_start:publish_end] + "}\n"
source += "void turn_on() {\n" + callback("turn_on_action") + "}\n"
source += "void turn_off() {\n" + callback("turn_off_action") + "}\n"
source += "void restore() {\n" + textwrap.dedent(boot[2]) + "}\n"
source += r'''
int main() {
  for (bool saved : {true, false}) {
    espdesktop::ready = false;
    writes = 0;
    companion_return_home_on_app_switch_enabled.state = saved;
    companion_auto_open_app_subpages_enabled.state = !saved;
    if (saved) turn_on(); else turn_off();
    assert(writes == 0); // Early template-switch restore must not touch the core.
    espdesktop::ready = true;
    restore();
    assert(writes == 1 && applied_value == saved);
    assert(return_home == saved);
    if (saved) turn_off(); else turn_on();
    assert(writes == 1 && applied_value == saved && companion_auto_open_app_subpages_enabled.state == saved);
    espdesktop_app.publish_app_subpage_preference(!saved);
    assert(writes == 2 && applied_value != saved && companion_auto_open_app_subpages_enabled.state != saved);
  }
}
'''
with tempfile.TemporaryDirectory() as temporary:
    path = Path(temporary)
    (path / "test.cpp").write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "c++", "-std=c++17",
                    "-Wall", "-Wextra", "-Werror", str(path / "test.cpp"),
                    "-o", str(path / "test")], check=True)
    subprocess.run([str(path / "test")], check=True)
print("Companion preference early restore, saved on/off startup, and live changes passed.")
