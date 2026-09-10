#!/usr/bin/env python3
"""Exercise Companion startup and connection sleep predicates."""
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
text = (root / 'common/addon/backlight.yaml').read_text()
# ESPHome merges packages before normalizing on_boot to a list. A mapping
# here is silently replaced by the later loading-screen package's list.
boot = text.split('  on_boot:\n', 1)[1].split('\nscript:', 1)[0]
assert re.search(r'^    - priority: -240$', boot, re.M), 'Screensaver boot handler must survive package merging'
assert 'register_companion_connection_changed_handler' in boot
assert 'register_screen_lock_changed_handler' in boot
assert 'id(screensaver_companion_ready) = true;' in boot
assert '- script.execute: screensaver_companion_reconcile' in boot
reconcile = text.split('- id: screensaver_companion_reconcile\n', 1)[1].split('\n- id:', 1)[0]
predicates = re.findall(r'lambda: \|-\n\s*(return .*?;)', reconcile)
assert len(predicates) == 2
source = r'''
#include <cassert>
#include <string>
struct Text { std::string state; } screensaver_mode;
bool screensaver_companion_ready = false;
bool connected = false, locked = false;
bool companion_connected() { return connected; }
bool screen_lock_enabled() { return locked; }
#define id(x) x
bool can_reconcile() {
''' + predicates[0] + r'''
}
bool should_wake() {
''' + predicates[1] + r'''
}
int main() {
  for (const auto *mode : {"companion", "timer", "disabled"}) {
    screensaver_mode.state = mode;
    screensaver_companion_ready = false;
    assert(!can_reconcile());
    screensaver_companion_ready = true;
    assert(can_reconcile() == (screensaver_mode.state == "companion"));
    for (bool is_connected : {false, true}) {
      connected = is_connected;
      for (bool is_locked : {false, true}) {
        locked = is_locked;
        assert(should_wake() == (connected && !locked));
      }
    }
  }
}
'''
with tempfile.TemporaryDirectory() as temp:
    cpp = Path(temp) / 'test.cpp'
    exe = Path(temp) / 'test'
    cpp.write_text(source)
    subprocess.run(['c++', '-std=c++17', '-Wall', '-Wextra', '-Werror',
                    '-I', str(root / 'components/espdesktop'), str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('Companion screensaver regression checks passed')
