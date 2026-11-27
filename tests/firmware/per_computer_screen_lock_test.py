#!/usr/bin/env python3
"""A locked computer only gates its own Companion cards."""
from pathlib import Path
import subprocess
import sys
import tempfile
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / 'components/espdesktop'
runtime_access = (HEADERS / 'companion_runtime_access.h').read_text()
screen_lock = (HEADERS / 'companion_screen_lock.h').read_text()

harness = r'''
#include <cassert>
#include <optional>
#include <string>
#include <vector>
#include "screen_lock_state.h"

struct ParsedCfg { std::string type; };
std::string primary_computer;
std::string card_computer;
bool companion_card_type_name(const std::string &type) { return type == "companion"; }
std::string companion_card_computer(const ParsedCfg &) { return card_computer; }
std::string companion_primary_computer() { return primary_computer; }
'''

harness += definition(runtime_access, 'companion_computer_locked')[1] + '\n'
harness += definition(screen_lock, 'card_action_locked')[1] + '\n'
harness += r'''
int main() {
  std::vector<bool> changes;
  register_screen_lock_changed_handler([&](bool locked) { changes.push_back(locked); });

  const ParsedCfg companion{"companion"};
  const ParsedCfg light{"light"};
  primary_computer = "a";

  // No lock: everything is usable.
  assert(!screen_lock_display_locked() && !screen_lock_enabled());
  assert(!card_action_locked(companion) && !card_action_locked(light));

  // The second computer reports that it is unlocked. A locked first computer
  // then gates only its own cards; the panel and the second computer stay
  // usable, and no lock screen covers the controls.
  screen_lock_set_computer_locked("b", false);
  assert(!screen_lock_display_locked() && !screen_lock_enabled());
  screen_lock_set_computer_locked("a", true, false);
  assert(changes == std::vector<bool>{false});
  assert(screen_lock_computer_locked("a"));
  assert(!screen_lock_display_locked() && !screen_lock_enabled());
  assert(!screen_lock_follows_display_power(true, true));
  card_computer = "";                       // A saved card without a computer follows the primary.
  assert(card_action_locked(companion));
  assert(!card_action_locked(light));       // Home Assistant cards stay usable.
  card_computer = "b";
  assert(!card_action_locked(companion));   // The other computer is unlocked.

  // A repeated report does not churn the display listeners.
  screen_lock_set_computer_locked("a", true, false);
  assert(changes.size() == 1);

  // Locking every computer restores the display-wide lock screen.
  screen_lock_set_computer_locked("b", true, true);
  assert(screen_lock_display_locked() && screen_lock_enabled());
  assert(screen_lock_display_awake() == std::optional<bool>(true));
  assert(screen_lock_follows_display_power(true, true));
  assert(!screen_lock_follows_display_power(true, false));
  assert(changes == (std::vector<bool>{false, true}));
  screen_lock_set_computer_locked("b", false);
  assert(!screen_lock_display_locked() && !screen_lock_enabled());
  assert(screen_lock_display_awake() == std::optional<bool>(false));
  assert(!screen_lock_follows_display_power(true, true));
  assert(changes.back() == false);

  screen_lock_set_computer_locked("a", false);
  assert(!screen_lock_display_locked() && !screen_lock_enabled());
  assert(changes.back() == false);

  // A disconnected unlocked computer stops keeping the panel usable, while a
  // locked computer keeps its state for reconnect.
  screen_lock_set_computer_locked("a", true, false);
  assert(!screen_lock_display_locked());       // B is still known and unlocked.
  screen_lock_disconnect_computer("b");
  assert(screen_lock_display_locked() && screen_lock_enabled());
  screen_lock_disconnect_computer("a");
  assert(screen_lock_display_locked());
  screen_lock_set_computer_locked("a", false);
  assert(!screen_lock_display_locked());

  // A legacy display-wide lock still covers every card.
  card_computer = "b";
  screen_lock_set_mac_locked(true);
  assert(screen_lock_enabled() && screen_lock_display_locked());
  assert(card_action_locked(companion) && card_action_locked(light));
  assert(!screen_lock_follows_display_power(true, true));
  screen_lock_set_mac_locked(false);
  assert(!card_action_locked(companion) && !card_action_locked(light));

  // Stale awake reports are dropped when the last session disconnects, while
  // the lock itself is kept for reconnect. With one known computer this also
  // keeps the original one-computer lock screen.
  screen_lock_clear_computer("b");
  screen_lock_set_computer_locked("a", true, true);
  assert(screen_lock_display_locked() && screen_lock_enabled());
  assert(card_action_locked(light));
  screen_lock_discard_stale_display_awake();
  assert(screen_lock_display_awake() == std::nullopt);
  card_computer = "a";
  assert(card_action_locked(companion));
}
'''

with tempfile.TemporaryDirectory() as directory:
    source = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    source.write_text(harness)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17',
                    '-Wall', '-Wextra', '-Werror', '-I', str(HEADERS),
                    str(source), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Per-computer screen lock only gates the cards for the locked computer')
