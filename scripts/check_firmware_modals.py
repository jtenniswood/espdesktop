#!/usr/bin/env python3
"""Guard firmware modal code against repeated row allocation and ad hoc shells."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
FIRMWARE_DIR = ROOT / "components" / "espdesktop"
FORBIDDEN_ALLOCATIONS = (
    "ClimateOptionClick",
    "FanPresetClick",
    "OptionSelectOptionClick",
)
LAYER_TOP_ALLOWLIST = {
    "button_grid_modal.h",
}
MANUAL_OVERLAY_DELETE_ALLOWLIST = {
    "button_grid_modal.h",
}


def yaml_script_body(text: str, script_id: str) -> str | None:
    marker = re.search(rf"(?m)^  - id: {re.escape(script_id)}\n", text)
    if marker is None:
        return None
    start = marker.end()
    next_marker = re.search(r"(?m)^  - id: ", text[start:])
    end = start + next_marker.start() if next_marker else len(text)
    return text[start:end]


def firmware_modal_errors(firmware_dir: Path, root: Path) -> list[str]:
    allocation_pattern = re.compile(r"\bnew\s+(" + "|".join(FORBIDDEN_ALLOCATIONS) + r")\b")
    layer_top_pattern = re.compile(r"\blv_layer_top\s*\(\s*\)")
    manual_overlay_delete_pattern = re.compile(r"\blv_obj_del\s*\(\s*(?:ui\.)?(?:menu_)?overlay\s*\)")
    errors: list[str] = []

    for path in sorted(firmware_dir.glob("button_grid*.h")):
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            match = allocation_pattern.search(line)
            if match:
                rel = path.relative_to(root)
                errors.append(
                    f"{rel}:{line_no}: avoid per-row heap allocation for {match.group(1)}"
                )
            if path.name not in LAYER_TOP_ALLOWLIST and layer_top_pattern.search(line):
                rel = path.relative_to(root)
                errors.append(
                    f"{rel}:{line_no}: route modal top-layer access through button_grid_modal.h helpers"
                )
            if path.name not in MANUAL_OVERLAY_DELETE_ALLOWLIST and manual_overlay_delete_pattern.search(line):
                rel = path.relative_to(root)
                errors.append(
                    f"{rel}:{line_no}: delete modal overlays through button_grid_modal.h lifecycle helpers"
                )
    return errors


def firmware_modal_sleep_takeover_errors(root: Path) -> list[str]:
    firmware_dir = root / "components" / "espdesktop"
    backlight_header_path = firmware_dir / "backlight.h"
    modal_path = firmware_dir / "button_grid_modal.h"
    modal_service_path = firmware_dir / "control_modal_service.h"
    navigation_path = firmware_dir / "button_grid_navigation.h"
    grid_path = firmware_dir / "button_grid_grid.h"
    image_path = firmware_dir / "button_grid_image.h"
    backlight_path = root / "common" / "addon" / "backlight.yaml"
    schedule_path = root / "common" / "addon" / "backlight_schedule.yaml"
    generator_path = root / "scripts" / "generate_device_slots.py"
    errors: list[str] = []

    if not backlight_header_path.exists():
        errors.append("components/espdesktop/backlight.h: provide early display-takeover hook")
    else:
        text = backlight_header_path.read_text(encoding="utf-8")
        if (
            "backlight_close_modals_for_display_takeover" not in text
            or "set_backlight_display_takeover_callback" not in text
        ):
            errors.append("components/espdesktop/backlight.h: expose an early display-takeover modal hook")

    if not modal_path.exists():
        errors.append("components/espdesktop/button_grid_modal.h: provide shared modal lifecycle helpers")
    else:
        text = modal_path.read_text(encoding="utf-8")
        modal_state_text = (
            modal_service_path.read_text(encoding="utf-8")
            if modal_service_path.exists()
            else text
        )
        if (
            "enum class ControlModalDismissPolicy" not in modal_state_text
            or "control_modal_force_close_active" not in text
            or "control_modal_close_active_internal(false)" not in text
            or "control_modal_close_for_display_takeover" not in text
            or "PRESERVE_DURING_DISPLAY_TAKEOVER" not in modal_state_text
        ):
            errors.append(
                "components/espdesktop/button_grid_modal.h: centralize modal dismissal policy for display takeover"
            )
        kind_enum = re.search(
            r"enum class ControlModalKind\s*\{(?P<body>.*?)\};", modal_state_text, re.S
        )
        definition = re.search(
            r"inline\s+ControlModalDefinition\s+control_modal_definition\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
            text,
            re.S,
        )
        if kind_enum is None or definition is None:
            errors.append("components/espdesktop/button_grid_modal.h: define every modal type through the shared registry")
        else:
            kinds = re.findall(r"\b([A-Z][A-Z0-9_]*)\b", kind_enum.group("body"))
            missing = [
                kind for kind in kinds
                if kind != "NONE" and f"ControlModalKind::{kind}" not in definition.group("body")
            ]
            if missing:
                errors.append(
                    "components/espdesktop/button_grid_modal.h: register modal definitions for "
                    + ", ".join(missing)
                )

    if not navigation_path.exists():
        errors.append("components/espdesktop/button_grid_navigation.h: close modals before display takeover")
    else:
        text = navigation_path.read_text(encoding="utf-8")
        hide_modals = re.search(
            r"inline\s+void\s+navigation_hide_modals\s*\(\s*\)\s*\{(?P<body>.*?)\n\}",
            text,
            re.S,
        )
        return_home = re.search(
            r"inline\s+bool\s+navigation_return_home\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
            text,
            re.S,
        )
        if hide_modals is None or "control_modal_force_close_active();" not in hide_modals.group("body"):
            errors.append(
                "components/espdesktop/button_grid_navigation.h: return-home navigation must close active shared modals"
            )
        elif re.search(r"\b[A-Za-z0-9_]+_hide_modal\s*\(\s*\)\s*;", hide_modals.group("body")):
            errors.append(
                "components/espdesktop/button_grid_navigation.h: keep modal-type cleanup out of navigation"
            )
        if return_home is None or "navigation_hide_modals();" not in return_home.group("body"):
            errors.append(
                "components/espdesktop/button_grid_navigation.h: return-home navigation must use the shared modal close path"
            )
        takeover_close = re.search(
            r"inline\s+void\s+navigation_close_modals_for_display_takeover\s*\(\s*\)\s*\{(?P<body>.*?)\n\}",
            text, re.S,
        )
        if takeover_close is None or "control_modal_force_close_active();" not in takeover_close.group("body"):
            errors.append(
                "components/espdesktop/button_grid_navigation.h: close active shared controls during display takeover"
            )

    if not grid_path.exists():
        errors.append("components/espdesktop/button_grid_grid.h: register the display-takeover modal hook")
    else:
        text = grid_path.read_text(encoding="utf-8")
        if "set_backlight_display_takeover_callback(navigation_close_modals_for_display_takeover)" not in text:
            errors.append("components/espdesktop/button_grid_grid.h: register the display-takeover modal hook")

    if not backlight_path.exists():
        errors.append("common/addon/backlight.yaml: keep display-off modal guards")
    else:
        text = backlight_path.read_text(encoding="utf-8")
        home_idle_body = yaml_script_body(text, "home_screen_idle_check")
        if "home_screen_idle_suspended" in text:
            errors.append(
                "common/addon/backlight.yaml: keep display-takeover suspension separate from home-return idle"
            )
        if "display_takeover_suspended" in text:
            errors.append("common/addon/backlight.yaml: remove the compatibility takeover boolean")
        begin_body = yaml_script_body(text, "display_takeover_begin")
        end_body = yaml_script_body(text, "display_takeover_end")
        if (
            begin_body is None
            or "begin_takeover" not in begin_body
            or "script.execute: display_mode_reconcile" not in begin_body
            or "script.stop:" in begin_body
        ):
            errors.append("common/addon/backlight.yaml: begin typed takeovers through the controller")
        if (
            end_body is None
            or "end_takeover" not in end_body
            or "script.execute: display_mode_reconcile" not in end_body
            or "display_takeover_resume_restore" in text
        ):
            errors.append("common/addon/backlight.yaml: resolve current requests when a takeover ends")
        sleep_timer_body = yaml_script_body(text, "screensaver_sleep_timer")
        if sleep_timer_body is None:
            errors.append("common/addon/backlight.yaml: keep the screensaver sleep timer script")
        elif (
            "DisplayTakeoverKind::INTERACTIVE" not in sleep_timer_body
            or "display_mode_request_automatic" not in sleep_timer_body
        ):
            errors.append(
                "common/addon/backlight.yaml: record automatic requests beneath interactive takeovers"
            )
        if home_idle_body is None:
            errors.append("common/addon/backlight.yaml: keep the home-screen idle return script")
        else:
            if (
                "display_takeover_suspended" in home_idle_body
                or "home_screen_idle_suspended" in home_idle_body
            ):
                errors.append(
                    "common/addon/backlight.yaml: do not gate home-return idle on display-takeover suspension"
                )
            if "navigation_return_home(id(main_page)->obj);" not in home_idle_body:
                errors.append("common/addon/backlight.yaml: home-return idle must use navigation_return_home")
        controller_off_body = yaml_script_body(text, "display_mode_effect_off")
        controller_owns_automatic_off = (
            controller_off_body is not None
            and "DisplayRequestSource::IDLE_TIMER" in controller_off_body
            and "DisplayRequestSource::PRESENCE_SENSOR" in controller_off_body
            and "backlight_close_modals_for_display_takeover();" in controller_off_body
        )
        if (
            "Skipping automatic display-off while image modal is active" not in text
            and not controller_owns_automatic_off
        ):
            errors.append("common/addon/backlight.yaml: keep automatic idle display-off blocked by image modals")
        if "backlight_close_modals_for_display_takeover();" not in text:
            errors.append("common/addon/backlight.yaml: close modals before manual or scheduled display-off")

    if not generator_path.exists():
        errors.append("scripts/generate_device_slots.py: generate display-takeover modal guards")
    else:
        text = generator_path.read_text(encoding="utf-8")
        if (
            "cfg.pause_home_idle" in text
            or "home_screen_idle_suspended" in text
            or "id(home_screen_idle_check).stop();" in text
        ):
            errors.append(
                "scripts/generate_device_slots.py: image modal display guard must not stop the home-return timer"
            )
        if (
            "cfg.begin_display_takeover" not in text
            or "cfg.end_display_takeover" not in text
            or "id(display_takeover_begin).execute(static_cast<int>(kind));" not in text
            or "id(display_takeover_end).execute(static_cast<int>(kind));" not in text
        ):
            errors.append("scripts/generate_device_slots.py: generate typed display-takeover hooks")
        backlight_text = backlight_path.read_text(encoding="utf-8") if backlight_path.exists() else ""
        if (
            "id: display_takeover_begin" not in backlight_text
            or "id: display_takeover_end" not in backlight_text
            or "id(espdesktop_app).display()" not in backlight_text
            or "cover_art_screensaver_active" in backlight_text
        ):
            errors.append("common/addon/backlight.yaml: centralize typed display-takeover lifecycle")

    if not schedule_path.exists():
        errors.append("common/addon/backlight_schedule.yaml: close modals before scheduled takeover")
    else:
        text = schedule_path.read_text(encoding="utf-8")
        backlight_text = backlight_path.read_text(encoding="utf-8") if backlight_path.exists() else ""
        controller_closes_scheduled_takeover = (
            "id: display_mode_effect_off" in backlight_text
            and "DisplayRequestSource::SCREEN_SCHEDULE" in backlight_text
            and "backlight_close_modals_for_display_takeover();" in backlight_text
        )
        controller_closes_clock_takeover = (
            "id: display_mode_apply_transition" in backlight_text
            and "schedule_owned" in backlight_text
        )
        if (
            text.count("backlight_close_modals_for_display_takeover();") < 2
            and not (controller_closes_scheduled_takeover and controller_closes_clock_takeover)
        ):
            errors.append(
                "common/addon/backlight_schedule.yaml: close modals before scheduled sleep and clock takeover"
            )

    return errors












def firmware_modal_tab_layout_errors(root: Path) -> list[str]:
    firmware_dir = root / "components" / "espdesktop"
    modal_path = firmware_dir / "button_grid_modal.h"
    geometry_path = firmware_dir / "button_grid_modal_layout.h"
    errors: list[str] = []

    if not geometry_path.exists():
        errors.append("components/espdesktop/button_grid_modal_layout.h: provide a testable modal tab layout recipe")
    else:
        geometry_text = geometry_path.read_text(encoding="utf-8")
        if (
            "struct TabLayout" not in geometry_text
            or "constexpr TabLayout calculate_tabs" not in geometry_text
            or "struct ContentLayout" not in geometry_text
            or "constexpr ContentLayout calculate_content" not in geometry_text
        ):
            errors.append("components/espdesktop/button_grid_modal_layout.h: keep modal tab and content geometry in shared recipes")

    if not modal_path.exists():
        errors.append("components/espdesktop/button_grid_modal.h: provide shared modal tab layout helpers")
    else:
        text = modal_path.read_text(encoding="utf-8")
        required = (
            "struct ControlModalTabLayout",
            "inline ControlModalTabLayout control_modal_calc_tab_layout",
            "inline void control_modal_apply_tab_row",
            "inline lv_obj_t *control_modal_create_tab_row",
            "inline void control_modal_layout_tab_button",
            "inline lv_coord_t control_modal_shared_tab_content_gap",
            "control_modal_calc_content_layout",
            "espdesktop::modal::calculate_tabs",
        )
        for needle in required:
            if needle not in text:
                errors.append("components/espdesktop/button_grid_modal.h: keep shared modal tab layout helpers")
                break

    forbidden_tab_math = (
        "lv_coord_t selected_tab_size =",
        "lv_coord_t tab_frame_pad =",
        "lv_coord_t tabs_total_w =",
        "lv_coord_t first_tab_x =",
        "lv_coord_t centered_left =",
        "lv_coord_t tab_safe_left =",
        "lv_coord_t max_tab_frame_w =",
    )
    for filename in (
        "button_grid_wifi_qr.h",
    ):
        path = firmware_dir / filename
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for needle in forbidden_tab_math:
            if needle in text:
                errors.append(f"components/espdesktop/{filename}: keep modal tab sizing in button_grid_modal_layout.h")
                break

    return errors








def firmware_network_status_version_errors(root: Path) -> list[str]:
    path = root / "components" / "espdesktop" / "network_status.h"
    errors: list[str] = []
    if not path.exists():
        errors.append("components/espdesktop/network_status.h: keep network status version labeling")
        return errors

    text = path.read_text(encoding="utf-8")
    if "network_status_is_specific_firmware_version" not in text:
        errors.append("components/espdesktop/network_status.h: classify release versions before labeling firmware")

    label_match = re.search(
        r"inline\s+std::string\s+network_status_firmware_label\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
        text,
        re.S,
    )
    if label_match is None:
        errors.append("components/espdesktop/network_status.h: keep network_status_firmware_label helper")
        return errors

    body = label_match.group("body")
    if "network_status_is_specific_firmware_version(trimmed)" not in body:
        errors.append("components/espdesktop/network_status.h: show only release versions as installed versions")
    if 'espdesktop_i18n(std::string("Dev build"))' not in body:
        errors.append("components/espdesktop/network_status.h: label local ESPHome builds as Dev build")
    if 'espdesktop_i18n(std::string("Version unknown"))' not in body:
        errors.append("components/espdesktop/network_status.h: keep empty firmware versions readable")

    return errors


















def run_scan() -> int:
    errors = firmware_modal_errors(FIRMWARE_DIR, ROOT)
    errors.extend(firmware_modal_sleep_takeover_errors(ROOT))
    errors.extend(firmware_modal_tab_layout_errors(ROOT))
    errors.extend(firmware_network_status_version_errors(ROOT))

    if errors:
        print("Firmware modal allocation check failed:")
        for error in errors:
            print(f"  {error}")
        return 1

    print("Firmware modal allocation checks passed.")
    return 0


def expect_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        for filename, text in files.items():
            (firmware_dir / filename).write_text(text, encoding="utf-8")
        sliders_path = firmware_dir / "button_grid_sliders.h"
        if not sliders_path.exists():
            sliders_path.write_text(
                "inline void cover_control_layout_modal(CoverControlCtx *ctx) {\n"
                "  lv_obj_move_foreground(ui.back_btn);\n"
                "}\n",
                encoding="utf-8",
            )

        errors = firmware_modal_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_sleep_takeover_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        for filename, text in files.items():
            path = root / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

        errors = firmware_modal_sleep_takeover_errors(root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"








def expect_network_status_version_errors(name: str, header_text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "components" / "espdesktop" / "network_status.h"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(header_text, encoding="utf-8")

        errors = firmware_network_status_version_errors(root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def valid_modal_tab_layout_files() -> dict[str, str]:
    return {
        "components/espdesktop/button_grid_wifi_qr.h": "control_modal_calc_tab_layout(layout, tab_count, show_tab_bar); control_modal_layout_tab_button();\n",
        "components/espdesktop/button_grid_modal_layout.h": (
            "struct TabLayout {};\n"
            "constexpr TabLayout calculate_tabs() {}\n"
            "struct ContentLayout {};\n"
            "constexpr ContentLayout calculate_content() {}\n"
        ),
        "components/espdesktop/button_grid_modal.h": (
            "struct ControlModalTabLayout {};\n"
            "inline lv_coord_t control_modal_shared_tab_content_gap(const ControlModalLayout &layout) { return 0; }\n"
            "inline ControlModalTabLayout control_modal_calc_tab_layout(const ControlModalLayout &layout, int tab_count, bool show_tab_bar) { return espdesktop::modal::calculate_tabs(); }\n"
            "inline ContentLayout control_modal_calc_content_layout() {}\n"
            "inline void control_modal_apply_tab_row(lv_obj_t *tab_row, const ControlModalLayout &layout, const ControlModalTabLayout &tabs_layout, int width_compensation_percent) {}\n"
            "inline lv_obj_t *control_modal_create_tab_row(lv_obj_t *panel) {}\n"
            "inline void control_modal_layout_tab_button(lv_obj_t *tab_btn, const ControlModalLayout &layout, const ControlModalTabLayout &tabs_layout, int index, bool active) {}\n"
        ),
        "components/espdesktop/button_grid_climate.h": (
            "return control_modal_calc_tab_layout(layout, tab_count, show_tab_bar);\n"
            "return control_modal_shared_tab_content_gap(layout);\n"
            "control_modal_apply_tab_row(\nui.tab_row, layout, tabs_layout, ctx->width_compensation_percent);\n"
            "control_modal_layout_tab_button(tab_btn, layout, tabs_layout, i, active);\n"
            "ui.tab_row = control_modal_create_tab_row(ui.panel);\n"
        ),
        "components/espdesktop/button_grid_fan.h": (
            "ControlModalTabLayout tabs_layout = control_modal_calc_tab_layout(layout, tab_count, show_tab_bar);\n"
            "control_modal_apply_tab_row(\nui.tab_row, layout, tabs_layout, ctx->width_compensation_percent);\n"
            "control_modal_layout_tab_button(tab_btn, layout, tabs_layout, i, active);\n"
            "control_modal_calc_content_layout(\n"
            "ui.tab_row = control_modal_create_tab_row(ui.panel);\n"
        ),
        "components/espdesktop/button_grid_media.h": (
            "control_modal_calc_tab_layout(layout, media_control_tab_count, true)\n"
            "control_modal_apply_tab_row(\nui.tab_row, layout, tabs_layout, ctx->width_compensation_percent);\n"
            "control_modal_layout_tab_button(tabs[i].btn, layout, tabs_layout, i, active);\n"
            "control_modal_calc_content_layout(\n"
            "ui.tab_row = control_modal_create_tab_row(ui.panel);\n"
        ),
        "components/espdesktop/button_grid_sliders.h": (
            "ControlModalTabLayout tabs_layout = control_modal_calc_tab_layout(layout, tab_count, show_tab_bar);\n"
            "control_modal_apply_tab_row(\nui.tab_row, layout, tabs_layout, ctx->width_compensation_percent);\n"
            "control_modal_layout_tab_button(\n"
            "control_modal_calc_content_layout(\n"
            "ui.tab_row = control_modal_create_tab_row(ui.panel);\n"
            "ControlModalTabLayout tabs_layout = control_modal_calc_tab_layout(layout, tab_count, show_tab_bar);\n"
            "control_modal_apply_tab_row(\nui.tab_row, layout, tabs_layout, ctx->width_compensation_percent);\n"
            "control_modal_layout_tab_button(\n"
            "control_modal_calc_content_layout(\n"
            "ui.tab_row = control_modal_create_tab_row(ui.panel);\n"
        ),
    }


def expect_modal_tab_layout_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        for filename, text in files.items():
            path = root / filename
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")

        errors = firmware_modal_tab_layout_errors(root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"














def valid_sleep_takeover_files() -> dict[str, str]:
    return {
        "components/espdesktop/backlight.h": (
            "inline void set_backlight_display_takeover_callback(BacklightDisplayTakeoverCallback callback) {}\n"
            "inline void backlight_close_modals_for_display_takeover() {}\n"
        ),
        "components/espdesktop/button_grid_modal.h": (
            "enum class ControlModalKind { NONE };\n"
            "enum class ControlModalDismissPolicy { PRESERVE_DURING_DISPLAY_TAKEOVER };\n"
            "struct ControlModalDefinition {};\n"
            "inline ControlModalDefinition control_modal_definition(ControlModalKind kind) {\n"
            "  return {};\n"
            "}\n"
            "inline void control_modal_close_active_internal(bool honor_close_guard) {}\n"
            "inline void control_modal_force_close_active() { control_modal_close_active_internal(false); }\n"
            "inline void control_modal_close_for_display_takeover(bool preserve_policy_active) {}\n"
        ),
        "components/espdesktop/button_grid_navigation.h": (
            "inline void navigation_hide_modals() {\n"
            "  control_modal_force_close_active();\n"
            "}\n"
            "inline bool navigation_return_home(lv_obj_t *main_page_obj) {\n"
            "  navigation_hide_modals();\n"
            "  return true;\n"
            "}\n"
            "inline void navigation_close_modals_for_display_takeover() {\n"
            "  control_modal_force_close_active();\n"
            "}\n"
        ),
        "components/espdesktop/button_grid_grid.h": (
            "set_backlight_display_takeover_callback(navigation_close_modals_for_display_takeover);\n"
        ),
        "components/espdesktop/button_grid_image.h": (
            "std::function<void(espdesktop::DisplayTakeoverKind)> begin_display_takeover;\n"
            "std::function<void(espdesktop::DisplayTakeoverKind)> end_display_takeover;\n"
            "ctx->begin_display_takeover(espdesktop::DisplayTakeoverKind::INTERACTIVE);\n"
            "ctx->end_display_takeover(espdesktop::DisplayTakeoverKind::INTERACTIVE);\n"
        ),
        "common/addon/backlight.yaml": (
            "globals:\n"
            "  - id: screensaver_sensor_sleep_pending\n"
            "  - id: espdesktop_app\n"
            "script:\n"
            "  - id: display_takeover_begin\n"
            "    then:\n"
            "      - lambda: 'id(espdesktop_app).display().begin_takeover(static_cast<espdesktop::DisplayTakeoverKind>(takeover_kind));'\n"
            "      - script.execute: display_mode_reconcile\n"
            "  - id: display_takeover_end\n"
            "    then:\n"
            "      - lambda: 'id(espdesktop_app).display().end_takeover(static_cast<espdesktop::DisplayTakeoverKind>(takeover_kind));'\n"
            "      - script.execute: display_mode_reconcile\n"
            "  - id: screensaver_sleep_timer\n"
            "    then:\n"
            "      - lambda: 'id(espdesktop_app).display().takeover_active(espdesktop::DisplayTakeoverKind::INTERACTIVE);'\n"
            "      - script.execute: display_mode_request_automatic\n"
            "  - id: home_screen_idle_check\n"
            "    then:\n"
            "      - lambda: |-\n"
            "          navigation_return_home(id(main_page)->obj);\n"
            "Skipping automatic display-off while image modal is active\n"
            "backlight_close_modals_for_display_takeover();\n"
        ),
        "common/addon/backlight_schedule.yaml": (
            "backlight_close_modals_for_display_takeover();\n"
            "backlight_close_modals_for_display_takeover();\n"
        ),
        "scripts/generate_device_slots.py": (
            "cfg.begin_display_takeover = [](espdesktop::DisplayTakeoverKind kind) {\n"
            "  id(display_takeover_begin).execute(static_cast<int>(kind));\n"
            "};\n"
            "cfg.end_display_takeover = [](espdesktop::DisplayTakeoverKind kind) {\n"
            "  id(display_takeover_end).execute(static_cast<int>(kind));\n"
            "};\n"
        ),
    }














def run_self_test() -> int:
    expect_errors(
        "forbidden click allocation",
        {"button_grid_climate.h": "auto *click = new ClimateOptionClick();\n"},
        ("avoid per-row heap allocation for ClimateOptionClick",),
    )
    expect_errors(
        "ad hoc top layer",
        {"button_grid_climate.h": "lv_obj_t *overlay = lv_obj_create(lv_layer_top());\n"},
        ("route modal top-layer access through button_grid_modal.h helpers",),
    )
    expect_errors(
        "ad hoc top layer reference",
        {"button_grid_alarm.h": "lv_obj_move_foreground(lv_layer_top());\n"},
        ("route modal top-layer access through button_grid_modal.h helpers",),
    )
    expect_errors(
        "shared helpers",
        {"button_grid_modal.h": "lv_obj_t *overlay = lv_obj_create(lv_layer_top());\n"},
        (),
    )
    expect_errors(
        "manual overlay delete",
        {"button_grid_media.h": "if (ui.overlay) lv_obj_del(ui.overlay);\n"},
        ("delete modal overlays through button_grid_modal.h lifecycle helpers",),
    )
    expect_errors(
        "shared delete helper",
        {"button_grid_media.h": "control_modal_delete_overlay(ControlModalKind::MEDIA_VOLUME, ui.overlay);\n"},
        (),
    )
    valid_fan_cleanup = (
        "inline void fan_close_modals_for_context(FanCardCtx *ctx) {\n"
        "  if (fan_control_modal_ui().active == ctx) fan_control_hide_modal();\n"
        "  if (fan_preset_ui().active == ctx) fan_preset_close();\n"
        "}\n"
    )
    valid_grid_cleanup = (
        "fan_close_modals_for_context(fan);\n"
        "fan_close_modals_for_context(ctx);\n"
    )
    valid_fan_light_fallback = (
        "inline bool fan_control_supported(FanCardCtx *ctx) {\n"
        "  if (ctx->type == \"fan_control\" && fan_light_supported(ctx)) return true;\n"
        "}\n"
        "inline bool fan_control_can_open_modal(FanCardCtx *ctx) {\n"
        "  return ctx && (ctx->available || fan_light_supported(ctx)) &&\n"
        "         fan_control_visible_tabs(ctx).count > 0;\n"
        "}\n"
        "inline void fan_control_open_modal(FanCardCtx *ctx) {\n"
        "  if (!fan_control_can_open_modal(ctx)) return;\n"
        "}\n"
        "inline void subscribe_fan_card_state(FanCardCtx *ctx) {\n"
        "  ctx->light_available = !ha_state_unavailable_ref(state);\n"
        "  ctx->light_on = ctx->light_available && is_entity_on_ref(state);\n"
        "  refresh();\n"
        "  FanControlModalUi &ui = fan_control_modal_ui();\n"
        "  if (ui.active == ctx && fan_control_visible_tabs(ctx).count == 0) fan_control_hide_modal();\n"
        "}\n"
    )
    valid_climate_cleanup = (
        "inline void delete_climate_control_context(ClimateControlCtx *ctx) {\n"
        "  if (climate_control_modal_ui().active == ctx) climate_control_hide_modal();\n"
        "  lv_timer_del(ctx->debounce_timer);\n"
        "  ClimateControlCtx **refs = climate_control_refs();\n"
        "  int &count = climate_control_ref_count();\n"
        "}\n"
    )
    valid_climate_grid_cleanup = (
        "inline void grid_delete_climate_control_runtime_ptr() {\n"
        "  delete_climate_control_context(ctx);\n"
        "}\n"
        "inline void grid_track_climate_control_runtime() {}\n"
        "inline void grid_delete_climate_control_with_owner() {\n"
        "  delete_climate_control_context(ctx);\n"
        "}\n"
    )
    valid_cover_cleanup = (
        "inline void delete_cover_control_context(CoverControlCtx *ctx) {\n"
        "  if (cover_control_modal_ui().active == ctx) cover_control_hide_modal();\n"
        "}\n"
    )
    valid_cover_grid_cleanup = (
        "inline void grid_delete_cover_control_runtime_ptr() {\n"
        "  delete_cover_control_context(ctx);\n"
        "}\n"
        "inline void grid_track_cover_control_runtime() {}\n"
        "inline void grid_delete_cover_control_with_owner() {\n"
        "  delete_cover_control_context(ctx);\n"
        "}\n"
    )
    valid_media_cleanup = (
        "inline void delete_media_control_context(MediaControlCtx *ctx) {\n"
        "  MediaControlModalUi &ui = media_control_modal_ui();\n"
        "  media_control_hide_modal();\n"
        "  media_playback_detach_control(ctx);\n"
        "}\n"
        "inline void delete_media_volume_context(MediaVolumeCtx *ctx) {\n"
        "  if (media_volume_modal_ui().active == ctx) media_volume_hide_modal();\n"
        "  media_playback_detach_volume(ctx);\n"
        "}\n"
        "inline void delete_media_playlist_context(MediaPlaylistCtx *ctx) {\n"
        "  media_playback_detach_playlist(ctx);\n"
        "}\n"
        "inline void delete_media_now_playing_context(MediaNowPlayingCtx *ctx) {\n"
        "  media_playback_detach_now_playing(ctx);\n"
        "}\n"
        "inline void delete_media_slider_context(SliderCtx *ctx) {\n"
        "  media_playback_detach_slider(ctx);\n"
        "  slider_detach_runtime(ctx);\n"
        "}\n"
    )
    valid_media_grid_cleanup = "\n".join((
        "grid_track_media_control_runtime",
        "grid_delete_media_control_with_owner",
        "grid_track_media_volume_runtime",
        "grid_delete_media_volume_with_owner",
        "grid_track_media_playlist_runtime",
        "grid_delete_media_playlist_with_owner",
        "grid_track_media_now_playing_runtime",
        "grid_delete_media_now_playing_with_owner",
        "grid_track_media_slider_runtime",
        "grid_delete_media_slider_with_owner",
    ))
    expect_sleep_takeover_errors(
        "missing display takeover close",
        {
            "components/espdesktop/backlight.h": "inline void backlight_close_modals_for_display_takeover() {}\n",
            "components/espdesktop/button_grid_modal.h": "inline void control_modal_close_active() {}\n",
            "components/espdesktop/button_grid_navigation.h": "inline void navigation_hide_modals() {}\n",
            "components/espdesktop/button_grid_grid.h": "inline void grid_phase1() {}\n",
            "common/addon/backlight.yaml": "Skipping automatic display-off while image modal is active\n",
            "common/addon/backlight_schedule.yaml": "script:\n",
        },
        (
            "expose an early display-takeover modal hook",
            "centralize modal dismissal policy for display takeover",
            "close active shared controls during display takeover",
            "register the display-takeover modal hook",
            "close modals before manual or scheduled display-off",
            "close modals before scheduled sleep and clock takeover",
        ),
    )
    expect_sleep_takeover_errors(
        "display takeover close",
        valid_sleep_takeover_files(),
        (),
    )
    missing_takeover_close = valid_sleep_takeover_files()
    navigation_path = "components/espdesktop/button_grid_navigation.h"
    missing_takeover_close[navigation_path] = missing_takeover_close[navigation_path].replace(
        "inline void navigation_close_modals_for_display_takeover() {\n"
        "  control_modal_force_close_active();\n"
        "}",
        "inline void navigation_close_modals_for_display_takeover() {}",
    )
    expect_sleep_takeover_errors(
        "missing shared modal close on display takeover",
        missing_takeover_close,
        ("close active shared controls during display takeover",),
    )
    expect_network_status_version_errors(
        "raw local firmware version leaks",
        (
            "inline std::string network_status_firmware_label(const std::string &version) {\n"
            "  std::string trimmed = version;\n"
            "  if (trimmed.empty()) return espdesktop_i18n(std::string(\"Version unknown\"));\n"
            "  if (trimmed == \"dev\" || trimmed == \"0.0.0\") return espdesktop_i18n(std::string(\"Dev build\"));\n"
            "  return trimmed;\n"
            "}\n"
        ),
        (
            "classify release versions before labeling firmware",
            "show only release versions as installed versions",
        ),
    )
    expect_network_status_version_errors(
        "release-only firmware version label",
        (
            "inline bool network_status_is_specific_firmware_version(const std::string &version) { return true; }\n"
            "inline std::string network_status_firmware_label(const std::string &version) {\n"
            "  std::string trimmed = version;\n"
            "  if (trimmed.empty()) return espdesktop_i18n(std::string(\"Version unknown\"));\n"
            "  if (network_status_is_specific_firmware_version(trimmed)) return trimmed;\n"
            "  return espdesktop_i18n(std::string(\"Dev build\"));\n"
            "}\n"
        ),
        (),
    )
    expect_modal_tab_layout_errors(
        "shared modal tab layout",
        valid_modal_tab_layout_files(),
        (),
    )
    old_tab_layout = valid_modal_tab_layout_files()
    old_tab_layout["components/espdesktop/button_grid_wifi_qr.h"] = (
        old_tab_layout["components/espdesktop/button_grid_wifi_qr.h"]
        + "lv_coord_t selected_tab_size = tab_size + tab_size / 8;\n"
    )
    expect_modal_tab_layout_errors(
        "modal tab layout drifts back to local sizing",
        old_tab_layout,
        ("keep modal tab sizing in button_grid_modal_layout.h",),
    )
    home_idle_gated = valid_sleep_takeover_files()
    home_idle_gated["common/addon/backlight.yaml"] = home_idle_gated[
        "common/addon/backlight.yaml"
    ].replace(
        "          navigation_return_home(id(main_page)->obj);\n",
        "          if (id(display_takeover_suspended)) return;\n"
        "          navigation_return_home(id(main_page)->obj);\n",
    )
    expect_sleep_takeover_errors(
        "home return gated by display takeover",
        home_idle_gated,
        ("do not gate home-return idle",),
    )
    image_guard_stops_home_idle = valid_sleep_takeover_files()
    image_guard_stops_home_idle["scripts/generate_device_slots.py"] = (
        "cfg.begin_display_takeover = [](espdesktop::DisplayTakeoverKind kind) {\n"
        "  id(display_takeover_begin).execute(static_cast<int>(kind));\n"
        "  id(home_screen_idle_check).stop();\n"
        "};\n"
        "cfg.end_display_takeover = [](espdesktop::DisplayTakeoverKind kind) {\n"
        "  id(display_takeover_end).execute(static_cast<int>(kind));\n"
        "};\n"
    )
    expect_sleep_takeover_errors(
        "image modal display guard stops home return",
        image_guard_stops_home_idle,
        ("must not stop the home-return timer",),
    )
    missing_takeover_reconcile = valid_sleep_takeover_files()
    missing_takeover_reconcile["common/addon/backlight.yaml"] = (
        missing_takeover_reconcile["common/addon/backlight.yaml"].replace(
            "      - script.execute: display_mode_reconcile\n"
            "  - id: screensaver_sleep_timer\n",
            "  - id: screensaver_sleep_timer\n",
        )
    )
    expect_sleep_takeover_errors(
        "takeover end misses request resolution",
        missing_takeover_reconcile,
        ("resolve current requests when a takeover ends",),
    )
    print("Firmware modal allocation self-tests passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run guardrail self-tests")
    args = parser.parse_args()
    return run_self_test() if args.self_test else run_scan()


if __name__ == "__main__":
    raise SystemExit(main())
