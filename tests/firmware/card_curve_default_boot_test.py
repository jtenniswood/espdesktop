"""Check that the card curve uses Large when the display has no saved choice."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


class Loader(yaml.SafeLoader):
    pass


Loader.add_constructor("!lambda", lambda loader, node: loader.construct_scalar(node))
config = yaml.load((ROOT / "common/config/display.yaml").read_text(), Loader=Loader)
selector = next(item for item in config["select"] if item.get("id") == "card_curve_select")
assert selector["initial_option"] == "Large"
assert selector["restore_value"]
# ESPHome stores the option index. Keep the order so existing choices restore correctly.
assert selector["options"] == ["Small", "Medium", "Large"]
assert all("card_curve_select" not in str(phase) for phase in config["esphome"]["on_boot"])
print("Card curve defaults to Large and restores saved choices without a boot-time override.")
