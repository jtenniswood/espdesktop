"""Compile actual Action dispatch without any Home Assistant transport available."""
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "components/espdesktop/button_grid_actions.h").read_text()
start = source.index("inline void send_action_card_action(")
end = source.index("\n}", start) + 2
harness = r'''
#include <cassert>
#include <string>
#include <vector>
struct ParsedCfg { std::string type, entity, sensor; };
std::vector<std::string> calls;
bool action_card_local_action(const ParsedCfg &c) { return c.type == "action" && c.sensor == "local"; }
void send_local_action(const std::string &key) { if (key == "zoom_mute") calls.push_back(key); }
'''
harness += source[start:end]
harness += r'''
int main() {
  send_action_card_action({"action", "zoom_mute", "local"});
  assert(calls == std::vector<std::string>{"zoom_mute"});
  send_action_card_action({"action", "", "local"});
  send_action_card_action({"action", "unknown", "local"});
  for (const auto *service : {"script.turn_on", "scene.turn_on", "automation.trigger",
       "number.set_value", "input_select.select_option", "select.select_option"}) {
    send_action_card_action({"action", "zoom_mute", service});
  }
  send_action_card_action({"switch", "zoom_mute", "local"});
  assert(calls.size() == 1);
}
'''
with tempfile.TemporaryDirectory() as directory:
    cpp = Path(directory) / "test.cpp"
    exe = Path(directory) / "test"
    cpp.write_text(harness)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
