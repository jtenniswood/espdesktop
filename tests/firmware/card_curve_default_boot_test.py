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
assert not selector["restore_value"] and not selector["optimistic"]
assert selector["options"] == ["Small", "Medium", "Large"]
assert "edit_panel_scalar" in selector["set_action"][0]["lambda"]
assert any("bind_panel_scalar(Setting::SCREEN_CARD_CURVE" in str(phase)
           for phase in config["esphome"]["on_boot"])
print("Card curve defaults to Large and restores its native value when activated.")
