"""Check that the restored icon default is applied before cards are initialized."""
from pathlib import Path
import json
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[2]
class Loader(yaml.SafeLoader):
    pass

Loader.add_constructor("!lambda", lambda loader, node: loader.construct_scalar(node))
config = yaml.load((ROOT / "common/config/display.yaml").read_text(), Loader=Loader)
selector = next(item for item in config["select"] if item.get("id") == "default_icon_size_select")
assert selector["restore_value"] and selector["initial_option"] == "Small"
assert selector["options"] == ["Small", "Medium", "Large"]
boot = next(item for item in config["esphome"]["on_boot"]
            if "set_card_icon_default_size" in str(item))
body = boot["then"][0]["lambda"].replace("id(default_icon_size_select).current_option()", "saved")
changed = selector["on_value"]["then"][0]["lambda"]
assert "refresh_subpage_grid" in str(selector["on_value"])
for slug in json.loads((ROOT / "devices/manifest.json").read_text())["devices"]:
    device = yaml.load((ROOT / "devices" / slug / "device/sensors.yaml").read_text(), Loader=Loader)
    for phase in device.get("esphome", {}).get("on_boot", []):
        if "grid_phase1(" in str(phase):
            assert boot["priority"] > phase["priority"], slug

source = '''
#include <cassert>
#include "card_icon_size.h"
void boot(const std::string &saved) { __BOOT__ }
void changed(const std::string &x) { __CHANGED__ }
int main() {
  using namespace espdesktop;
  for (const auto &preset : {"Small", "Medium", "Large"}) {
    set_card_icon_default_size("invalid");
    boot(preset);
    const auto expected = preset == std::string("Small") ? "small" :
        preset == std::string("Medium") ? "medium" : "large";
    assert(resolved_card_icon_size("") == expected);
    for (const auto &manual : {"small", "medium", "large"})
      assert(resolved_card_icon_size(manual) == manual);
  }
  changed("Medium");
  assert(resolved_card_icon_size("") == "medium");
}
'''.replace("__BOOT__", body).replace("__CHANGED__", changed)
with tempfile.TemporaryDirectory(prefix="default-icon-size-") as directory:
    cpp, binary = Path(directory) / "test.cpp", Path(directory) / "test"
    cpp.write_text(source)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I",
                    str(ROOT / "components/espdesktop"), str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Restored icon defaults apply before every device grid; manual sizes stay fixed.")
