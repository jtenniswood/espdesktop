"""Check that both Companion navigation switches use the native panel document."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
display = (ROOT / "common/config/display.yaml").read_text()
settings = json.loads((ROOT / "product/v2/panel_settings.json").read_text())["scalar_settings"]
boot = re.search(
    r"    - priority: (-?\d+)\n      then:\n        - lambda: \|-\n"
    r"((?:            [^\n]*\n)+)(?=    - priority: -100)", display,
)
assert boot is not None, "Panel settings must bind before grid initialization"
# Application setup uses AFTER_WIFI (200) and grid initialization starts at -100.
assert -100 < int(boot[1]) < 200
for key, apply in (
    ("companion_auto_open_app_subpages", "companion_set_auto_open_app_subpages"),
    ("companion_return_home_on_app_switch", "companion_set_return_home_on_app_switch"),
):
    assert settings[key] == {"default": "1", "type": "switch"}
    entity = f"{key}_enabled"
    switch = display.split(f"    id: {entity}\n", 1)[1].split("\n  - platform:", 1)[0]
    assert "restore_mode: DISABLED" in switch and "optimistic: false" in switch
    for action, value in (("turn_on_action", "1"), ("turn_off_action", "0")):
        assert f'{action}:\n      - lambda: \'id(espdesktop_app).edit_panel_scalar(' in switch
        assert f'ScalarSetting::{key.upper()}, "{value}");' in switch
    binding = boot[2].split(f"app.bind_panel_scalar(Setting::{key.upper()},", 1)[1].split("});", 1)[0]
    assert f"id({entity}).publish_state(enabled);" in binding
    assert f"{apply}(enabled);" in binding

print("Companion navigation switches edit and apply native panel settings.")
