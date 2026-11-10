#!/usr/bin/env python3
"""Exercise the real sleep predicates and Companion readiness."""
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
assert 'id(screensaver_mac_lock_delay).execute(locked);' in boot
assert "locked: !lambda 'return screen_lock_enabled();'" in boot
reconcile = text.split('  - id: screensaver_companion_reconcile\n', 1)[1].split('\n  - id:', 1)[0]
ready_predicate = re.search(r"lambda: '(return .*?;)'", reconcile).group(1)


source = r'''
#include <cassert>
#include <string>
struct Text { std::string state; } screensaver_mode;
#define id(x) x
bool screensaver_companion_ready = false;
bool can_reconcile() {
''' + ready_predicate + r'''
}
int main() {
  for (const auto *mode : {"companion", "timer", "sensor"}) {
    screensaver_mode.state = mode;
    const bool companion = screensaver_mode.state == "companion";
    screensaver_companion_ready = false;
    assert(!can_reconcile());  // Restored text publishes before the app runtime exists.
    screensaver_companion_ready = true;
    assert(can_reconcile() == companion);
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
