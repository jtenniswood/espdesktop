"""Exercise the production persisted-select migration without resetting local modes."""
from pathlib import Path
import subprocess
import sys
import tempfile
ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "common/config/display.yaml").read_text()
a = source.index("            size_t legacy_action_index = 0;")
b = source.index("              preferences_changed = true;\n            }", a) + len("              preferences_changed = true;\n            }")
harness = r'''
#include <cassert>
#include <cstddef>
#include <string>
struct Preference { size_t *stored; bool present; bool load(size_t *out) { if (present) *out = *stored; return present; } };
struct Select {
 size_t stored = 0; bool present = true; int calls = 0;
 template<typename T> Preference make_entity_preference() { return {&stored, present}; }
 struct Call { Select *select; std::string option;
  void set_option(const char *value) { option = value; }
  void perform() { assert(option == "Display Off"); select->stored = 0; ++select->calls; }
 };
 Call make_call() { return {this, ""}; }
} screensaver_action;
#define id(x) x
bool migrate() { bool preferences_changed = false;
'''+source[a:b]+r'''
 return preferences_changed;
}
int main() {
 for (size_t previous : {0, 1, 2, 3}) {
  screensaver_action = Select{previous, true, 0};
  assert(migrate() == (previous == 3));
  assert(screensaver_action.calls == (previous == 3 ? 1 : 0));
  assert(screensaver_action.stored == (previous == 3 ? 0 : previous));
  assert(!migrate()); // The persisted replacement is stable on the next boot.
 }
 screensaver_action = Select{3, false, 0};
 assert(!migrate() && screensaver_action.calls == 0);
}
'''
with tempfile.TemporaryDirectory() as d:
 cpp, exe = Path(d)/"migration.cpp", Path(d)/"migration"
 cpp.write_text(harness)
 subprocess.run([sys.argv[1] if len(sys.argv)>1 else "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
