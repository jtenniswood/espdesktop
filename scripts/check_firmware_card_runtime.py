#!/usr/bin/env python3
"""Guard firmware card metadata access behind button_grid_card_runtime.h."""

from __future__ import annotations

import argparse
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIRMWARE_DIR = ROOT / "components" / "espdesktop"

CARD_RUNTIME_BOUNDARY_FILES = {
    "button_grid_card_runtime.h",
    "button_grid_contract_generated.h",
}
CONTRACT_INCLUDE_ALLOWLIST = {
    "button_grid_card_runtime.h",
}

# Existing alarm UI code keeps a few local button-order arrays. The runtime
# guard still blocks direct generated-contract access in that file.
MODE_ARRAY_ALLOWLIST = CARD_RUNTIME_BOUNDARY_FILES | {
    "button_grid_alarm.h",
    # Generated from the same contract and compiled only by the parity test.
    "button_grid_saved_config_shadow_generated.h",
}

DIRECT_CONTRACT_PATTERN = re.compile(r"\b(?:card_contract_[A-Za-z0-9_]+|CARD_CONTRACT_[A-Z0-9_]+)\b")
CONTRACT_INCLUDE_PATTERN = re.compile(r'#\s*include\s+[<"]button_grid_contract_generated\.h[>"]')
MODE_ARRAY_PATTERN = re.compile(
    r"\{[^}\n]*\"(?:play_pause|previous|next|volume|position|now_playing|cover_art|"
    r"open|close|stop|set_position|tilt|toggle|lock|unlock|away|home|night|vacation|disarm)\""
)
SERVICE_MAPPING_PATTERN = re.compile(
    r"\"(?:cover\.(?:open_cover|close_cover|stop_cover|set_cover_position|"
    r"open_cover_tilt|close_cover_tilt|stop_cover_tilt|set_cover_tilt_position)|"
    r"lock\.(?:lock|unlock)|"
    r"media_player\.(?:media_play_pause|media_previous_track|media_next_track)|"
    r"alarm_control_panel\.(?:alarm_arm_away|alarm_arm_home|alarm_arm_night|alarm_arm_vacation|alarm_disarm))\""
)

LAWN_MOWER_HEADER = "button_grid_lawn_mower.h"
GRID_HEADER = "button_grid_grid.h"
ACTION_HEADER = "button_grid_actions.h"
IMAGE_HEADER = "button_grid_image.h"
STATUS_ENTITY_HEADER = "button_grid_status_entity_driver.h"
DATE_TIME_HEADER = "button_grid_date_time_driver.h"
DATE_TIME_CARDS_HEADER = "button_grid_datetime_cards.h"
WEATHER_HEADER = "button_grid_weather_driver.h"
BASIC_ACTION_HEADER = "button_grid_basic_action_driver.h"
NUMERIC_SELECTABLE_HEADER = "button_grid_numeric_selectable_driver.h"
CLEANING_HEADER = "button_grid_cleaning_driver.h"
ACCESS_COVER_HEADER = "button_grid_access_cover_driver.h"
COVER_MODAL_DRIVER_HEADER = "button_grid_cover_modal_driver.h"
MEDIA_DRIVER_HEADER = "button_grid_media_driver.h"
SUBPAGES_HEADER = "button_grid_subpages.h"
NAVIGATION_DRIVER_HEADER = "button_grid_navigation_driver.h"
IMAGE_DRIVER_HEADER = "button_grid_image_driver.h"
LIGHT_CONTROL_DRIVER_HEADER = "button_grid_light_control_driver.h"
FAN_CONTROL_DRIVER_HEADER = "button_grid_fan_control_driver.h"
CLIMATE_CONTROL_DRIVER_HEADER = "button_grid_climate_control_driver.h"
ALARM_DRIVER_HEADER = "button_grid_alarm_driver.h"
CARDS_HEADER = "button_grid_cards.h"
SLIDERS_HEADER = "button_grid_sliders.h"


def service_mapping_line_allowed(line: str) -> bool:
    if "ESP_LOGW" in line:
        return True
    if "cover." in line and "_tilt" in line:
        return True
    return False


def firmware_headers(root: Path) -> list[Path]:
    return sorted((root / "components" / "espdesktop").glob("button_grid*.h"))


def function_body(text: str, name: str) -> str | None:
    match = re.search(rf"\b{name}\s*\([^)]*\)\s*\{{", text)
    if not match:
        return None
    start = match.end() - 1
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start + 1:index]
    return None


def check_root(root: Path) -> list[str]:
    failures: list[str] = []
    for path in firmware_headers(root):
        filename = path.name
        rel = path.relative_to(root)
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if filename not in CONTRACT_INCLUDE_ALLOWLIST and CONTRACT_INCLUDE_PATTERN.search(line):
                failures.append(f"{rel}:{line_no}: include generated card contract through button_grid_card_runtime.h")
            if filename not in CARD_RUNTIME_BOUNDARY_FILES and DIRECT_CONTRACT_PATTERN.search(line):
                failures.append(f"{rel}:{line_no}: access generated card contract through button_grid_card_runtime.h")
            if filename not in MODE_ARRAY_ALLOWLIST and MODE_ARRAY_PATTERN.search(line):
                failures.append(f"{rel}:{line_no}: keep shared card mode lists in the card runtime/contract boundary")
            if (
                filename not in CARD_RUNTIME_BOUNDARY_FILES
                and SERVICE_MAPPING_PATTERN.search(line)
                and not service_mapping_line_allowed(line)
            ):
                failures.append(f"{rel}:{line_no}: keep shared card service mappings in the card runtime/contract boundary")
    runtime_header = root / "components" / "espdesktop" / "button_grid_card_runtime.h"
    if runtime_header.exists():
        text = runtime_header.read_text(encoding="utf-8")
        for raw_alias in ('type == "local"', 'type == "text_sensor"'):
            if raw_alias in text:
                failures.append(
                    "components/espdesktop/button_grid_card_runtime.h: resolve saved-config aliases before runtime dispatch"
                )
    mower_header = root / "components" / "espdesktop" / LAWN_MOWER_HEADER
    grid_header = root / "components" / "espdesktop" / GRID_HEADER
    if grid_header.exists():
        text = grid_header.read_text(encoding="utf-8")
        compact_grid = re.sub(r"\s+", " ", text)
        visual_setup = function_body(text, "setup_card_visual")
        if visual_setup is not None:
            clickable_reset = "lv_obj_add_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);"
            reset_index = visual_setup.find(clickable_reset)
            driver_index = visual_setup.find("if (espdesktop::cards::")
            if reset_index < 0 or driver_index < 0 or reset_index > driver_index:
                failures.append(
                    f"components/espdesktop/{GRID_HEADER}: restore persistent button clickability before visual driver dispatch"
                )
            unsupported_clear = "clear_unsupported_card_slot_visuals(s);"
            unsupported_clear_index = visual_setup.find(unsupported_clear)
            unsupported_warning_index = visual_setup.find(
                'ESP_LOGW("card_runtime", "Unsupported card type has no visual driver:'
            )
            if (
                unsupported_clear_index < 0
                or unsupported_warning_index < 0
                or unsupported_clear_index > unsupported_warning_index
            ):
                failures.append(
                    f"components/espdesktop/{GRID_HEADER}: clear stale slot visuals before leaving unsupported cards inert"
                )
        unsupported_clear_body = function_body(text, "clear_unsupported_card_slot_visuals")
        if unsupported_clear_body is None or any(
            f"lv_label_set_display_text(s.{label}, \"\");" not in unsupported_clear_body
            for label in ("icon_lbl", "text_lbl", "sensor_lbl", "unit_lbl")
        ):
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: clear every persistent label for unsupported cards"
            )
        if (
            "card_runtime_context(p)" not in text
            or "card_runtime_information_only(context)" not in text
            or "espdesktop::cards::Surface::SUBPAGE" not in text
        ):
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: route main and subpage setup through the shared card context"
            )
        phase2_body = function_body(text, "grid_phase2") or ""
        if "companion_forget_card(" in phase2_body:
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: preserve Phase 1 Companion card bindings during Phase 2"
            )
        setup_subpage = phase2_body.find("setup_card_visual(sub_slot")
        refresh_subpage = phase2_body.find("refresh_card_layout(sub_slot")
        bind_subpage = phase2_body.find("basic_action_driver_bind_subpage")
        if not (
            setup_subpage >= 0
            and refresh_subpage > setup_subpage
            and bind_subpage > refresh_subpage
        ):
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: refresh subpage card geometry after applying label clamps"
            )
        if (
            "date_time_driver_setup_visual( s, p, context, palette)" not in compact_grid
            or "date_time_driver_bind_data(s, p, context)" not in compact_grid
            or "basic_action_driver_setup_visual( s, p, context, palette.sensor_val)" not in compact_grid
            or "basic_action_driver_bind_main( s, p, context, cfg, card_palette, display, main_page_obj, COLS, toggle_state)" not in compact_grid
            or "basic_action_driver_bind_subpage( sub_slot, sb_cfg, context, action_environment)" not in compact_grid
            or "numeric_selectable_driver_setup_visual( s, p, context, palette, display)" not in compact_grid
            or "numeric_selectable_driver_bind_main( s, p, context, card_palette, display)" not in compact_grid
            or "numeric_selectable_driver_bind_subpage( sub_slot, sb_cfg, context, numeric_environment)" not in compact_grid
            or "numeric_environment.palette = card_palette;" not in compact_grid
            or "navigation_driver_setup_visual( s, p, context, cfg, display)" not in compact_grid
            or "navigation_driver_bind_main( s, p, context, navigation_state)" not in compact_grid
            or "navigation_driver_own_subpage( owner_slot, p, parent_context, navigation_slot, display_order, sub_scr)" not in compact_grid
            or "navigation_register_special_page(sub_scr, main_page_obj, get_subpage_title(sp_order_str))" not in compact_grid
            or "card_palette_for_config(palette, p, display)" not in compact_grid
            or "card_palette_for_config(palette, sb_cfg, display)" not in compact_grid
            or "bind_passive_card(s, p, context, card_palette)" not in compact_grid
            or "bind_passive_card(sub_slot, sb_cfg, context, card_palette)" not in compact_grid
        ):
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: route main and subpage migrated cards through shared drivers"
            )
        for direct_branch in (
            'p.type == "door_window"', 'p.type == "presence"',
            'p.type == "clock"', 'p.type == "timezone"',
            'p.type == "calendar"', 'p.type == "sensor"',
            'p.type == "local_sensor"', 'p.type == "text_sensor"',
            'p.type == "weather"', 'p.type == "weather_forecast"',
            'sb_cfg.type == "calendar"', 'sb_cfg.type == "sensor"',
            'sb_cfg.type == "local_sensor"', 'sb_cfg.type == "text_sensor"',
            'sb_cfg.type == "weather"', 'sb_cfg.type == "weather_forecast"',
            'p.type == "push"',
            'p.type == "alarm_action"',
            'p.type == "local"',
            'sb_cfg.type == "push"',
            'sb_cfg.type == "alarm_action"',
            'sb_cfg.type == "local"',
            'p.type == "slider"', 'p.type == "light_brightness"',
            'p.type == "light_temperature"', 'p.type == "fan_speed"',
            'p.type == "fan_oscillate"', 'p.type == "fan_direction"',
            'p.type == "fan_preset"', 'p.type == "option_select"',
            'sb_cfg.type == "slider"', 'sb_cfg.type == "light_brightness"',
            'sb_cfg.type == "light_temperature"', 'sb_cfg.type == "fan_speed"',
            'sb_cfg.type == "fan_oscillate"', 'sb_cfg.type == "fan_direction"',
            'sb_cfg.type == "fan_preset"', 'sb_cfg.type == "option_select"',
            'family == espdesktop::cards::Family::VACUUM',
            'family == espdesktop::cards::Family::MOWER',
            'p.type == "garage"', 'p.type == "gate"', 'p.type == "lock"',
            'sb_cfg.type == "garage"', 'sb_cfg.type == "gate"',
            'sb_cfg.type == "lock"',
            'if (p.type == "cover") {',
            'if (sb_cfg.type == "cover") {',
            'p.type == "cover" && cover_command_mode',
            'p.type == "cover" && cover_toggle_mode',
            'sb_cfg.type == "cover" && cover_command_mode',
            'sb_cfg.type == "cover" && cover_toggle_mode',
            'p.type == "cover" && cover_modal_mode',
            'sb_cfg.type == "cover" && cover_modal_mode',
            'p.type == "subpage"', 'p.type != "subpage"',
            'p.type == "image"', 'sb_cfg.type == "image"',
            'family == espdesktop::cards::Family::LIGHT_CONTROL',
            'p.type == "light_control"', 'sb_cfg.type == "light_control"',
            'p.type == "fan_control"', 'sb_cfg.type == "fan_control"',
            'family == espdesktop::cards::Family::CLIMATE',
            'family == espdesktop::cards::Family::ALARM',
            'family == espdesktop::cards::Family::MEDIA',
            'p.type == "media"', 'sb_cfg.type == "media"',
        ):
            if direct_branch in text:
                failures.append(
                    f"components/espdesktop/{GRID_HEADER}: keep migrated type overrides inside shared drivers"
                )
        for retired_fallback in (
            "Legacy setup fallback",
            "subscribe_toggle_state(s.btn, s.icon_lbl, s.sensor_container,",
            "bool switch_has_sensor = !sb_cfg.sensor.empty();",
        ):
            if retired_fallback in text:
                failures.append(
                    f"components/espdesktop/{GRID_HEADER}: broad legacy card fallback must remain retired ({retired_fallback})"
                )
        image_reset_pos = text.find("reset_image_card_pool(cfg);")
        phase_one = function_body(text, "grid_phase1") or ""
        phase_two = function_body(text, "grid_phase2") or ""
        if ("reset_image_card_pool(cfg);" not in phase_one
                or phase_one.find("reset_image_card_pool(cfg);") > phase_one.find("setup_card_visual(")
                or "reset_image_card_pool(cfg);" in phase_two):
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: initialize icon pool before phase-one visuals and preserve bindings in phase two"
            )
        subpage_release = function_body(text, "navigation_release_subpage_runtime") or ""
        if ("image_card_release_owner(card.button);" not in subpage_release
                or subpage_release.find("image_card_release_owner(card.button);") > subpage_release.find("grid_release_runtime_allocations(card.button);")):
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: detach subpage icons before releasing widget owners"
            )
        subpage_clear_pos = text.find("navigation_clear_subpages(main_page_obj);")
        if image_reset_pos < 0 or subpage_clear_pos < 0 or image_reset_pos > subpage_clear_pos:
            failures.append(
                f"components/espdesktop/{GRID_HEADER}: reset image-card contexts before deleting subpage screens"
            )
    action_header = root / "components" / "espdesktop" / ACTION_HEADER
    if action_header.exists():
        text = action_header.read_text(encoding="utf-8")
        click_body = function_body(text, "handle_button_click")
        if click_body is not None and (
            "card_runtime_context(p)" not in click_body
            or "card_runtime_passive(context)" not in click_body
            or "basic_action_driver_handle_main_click(" not in click_body
            or "numeric_selectable_driver_handle_main_click(" not in click_body
            or "navigation_driver_handle_main_click(" not in click_body
        ):
            failures.append(
                f"components/espdesktop/{ACTION_HEADER}: route passive checks through the shared card context"
            )
        if click_body is not None:
            for direct_branch in (
                'p.type == "garage"',
                'p.type == "gate"',
                'p.type == "lock"',
                'p.type == "cover" && cover_command_mode',
                'p.type == "cover" && cover_toggle_mode',
                'else if (p.type == "cover")',
                'p.type == "cover" && cover_modal_mode',
                'p.type == "subpage"',
                'p.type == "image"',
                'p.type == "light_control"',
                'p.type == "fan_control"',
                'climate_card_type(p.type)',
                'p.type == "alarm"',
                'p.type == "media"',
            ):
                if direct_branch in click_body:
                    failures.append(
                        f"components/espdesktop/{ACTION_HEADER}: keep migrated clicks inside shared drivers"
                    )
            for retired_fallback in (
                "Legacy action fallback",
                "send_toggle_action(p.entity)",
            ):
                if retired_fallback in click_body:
                    failures.append(
                        f"components/espdesktop/{ACTION_HEADER}: broad legacy action fallback must remain retired ({retired_fallback})"
                    )
    sliders_header = root / "components" / "espdesktop" / SLIDERS_HEADER
    if sliders_header.exists():
        text = sliders_header.read_text(encoding="utf-8")
        pointer_body = function_body(text, "slider_apply_vertical_pointer_value") or ""
        pointer_required = (
            "lv_indev_active()",
            "LV_INDEV_TYPE_POINTER",
            "lv_indev_get_point",
            "lv_obj_get_coords",
            "vertical_pointer_position",
            "LV_EVENT_VALUE_CHANGED",
        )
        if any(needle not in pointer_body for needle in pointer_required):
            failures.append(
                f"components/espdesktop/{SLIDERS_HEADER}: map direct vertical slider pointer input through the full safe endpoint track"
            )

        setup_body = function_body(text, "setup_slider_visual") or ""
        if (
            "LV_EVENT_PRESSED" not in setup_body
            or "LV_EVENT_PRESSING" not in setup_body
            or setup_body.count("slider_apply_vertical_pointer_value") < 3
        ):
            failures.append(
                f"components/espdesktop/{SLIDERS_HEADER}: apply direct vertical slider endpoint mapping on press, drag, and release"
            )
        final_map = setup_body.rfind("slider_apply_vertical_pointer_value")
        send_action = setup_body.rfind("send_slider_action")
        if final_map < 0 or send_action < 0 or final_map > send_action:
            failures.append(
                f"components/espdesktop/{SLIDERS_HEADER}: map the final direct slider value before sending its Mac volume command"
            )

        light_temp_body = function_body(text, "setup_light_temp_visual") or ""
        light_temp_release_event = light_temp_body.rfind("LV_EVENT_RELEASED")
        light_temp_release_callback = light_temp_body.rfind(
            "lv_obj_add_event_cb", 0, light_temp_release_event
        )
        light_temp_final_map = light_temp_body.rfind(
            "slider_apply_vertical_pointer_value", 0, light_temp_release_event
        )
        light_temp_send_action = light_temp_body.rfind(
            "send_light_temp_action", 0, light_temp_release_event
        )

        if (
            "lv_obj_set_style_pad_top(slider, 0, LV_PART_MAIN)" not in text
            or "lv_obj_set_style_pad_bottom(slider, 0, LV_PART_MAIN)" not in text
            or "lv_obj_set_style_pad_top(slider, edge_inset" in text
            or "lv_obj_set_style_pad_bottom(slider, edge_inset" in text
        ):
            failures.append(
                f"components/espdesktop/{SLIDERS_HEADER}: keep LVGL's direct slider range unpadded"
            )
    image_header = root / "components" / "espdesktop" / IMAGE_HEADER
    if image_header.exists():
        text = image_header.read_text(encoding="utf-8")
        reset_body = function_body(text, "reset_image_card_pool")
        if reset_body is None or "for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; i++)" not in reset_body:
            failures.append(
                f"components/espdesktop/{IMAGE_HEADER}: reset every image-card context, including disabled slots"
            )
        callback_body = function_body(text, "image_card_bind_callbacks")
        callback_guards = (
            "callbacks_bound_image != bound_image",
            "has_on_finished_callbacks()",
            "has_on_error_callbacks()",
            "ctx->image == bound_image",
        )
        if callback_body is None or any(guard not in callback_body for guard in callback_guards):
            failures.append(
                f"components/espdesktop/{IMAGE_HEADER}: rebind image completion callbacks after image-card lifecycle changes"
            )
    status_entity_header = root / "components" / "espdesktop" / STATUS_ENTITY_HEADER
    date_time_header = root / "components" / "espdesktop" / DATE_TIME_HEADER
    if date_time_header.exists():
        text = date_time_header.read_text(encoding="utf-8")
        required = (
            "date_time_driver_setup_visual",
            "date_time_driver_bind_data",
            "date_time_driver_attach_interaction",
            "date_time_driver_refresh_layout",
            "date_time_driver_cleanup",
            "context.runtime.type == Type::CALENDAR",
            "context.runtime.type == Type::CLOCK",
            "context.runtime.type == Type::TIMEZONE",
            "register_calendar_card",
            "register_timezone_card",
        )
        for needle in required:
            if needle not in text:
                failures.append(
                    f"components/espdesktop/{DATE_TIME_HEADER}: missing shared date-time lifecycle guard {needle}"
                )
    elif grid_header.exists():
        failures.append(
            f"components/espdesktop/{DATE_TIME_HEADER}: missing shared date-time driver"
        )
    date_time_cards_header = root / "components" / "espdesktop" / DATE_TIME_CARDS_HEADER
    if date_time_cards_header.exists():
        text = date_time_cards_header.read_text(encoding="utf-8")
        for legacy_setup in ("setup_calendar_card", "setup_clock_card", "setup_timezone_card"):
            if legacy_setup in text:
                failures.append(
                    f"components/espdesktop/{DATE_TIME_CARDS_HEADER}: keep {legacy_setup} inside the shared date-time driver"
                )
        for guard, compact, refresh, register in (
            (
                "calendar_card_ref_ready",
                "compact_calendar_card_refs",
                "refresh_calendar_cards",
                "register_calendar_card",
            ),
            (
                "timezone_card_ref_ready",
                "compact_timezone_card_refs",
                "update_timezone_cards",
                "register_timezone_card",
            ),
        ):
            guard_body = function_body(text, guard)
            compact_body = function_body(text, compact)
            refresh_body = function_body(text, refresh)
            register_body = function_body(text, register)
            if guard_body is None or "lv_obj_is_valid" not in guard_body:
                failures.append(
                    f"components/espdesktop/{DATE_TIME_CARDS_HEADER}: {guard} must reject deleted LVGL labels"
                )
            if compact_body is None or guard not in compact_body or "count = write_index;" not in compact_body:
                failures.append(
                    f"components/espdesktop/{DATE_TIME_CARDS_HEADER}: {compact} must remove deleted LVGL label references"
                )
            if refresh_body is None or compact not in refresh_body:
                failures.append(
                    f"components/espdesktop/{DATE_TIME_CARDS_HEADER}: {refresh} must compact deleted LVGL label references"
                )
            if register_body is None or compact not in register_body:
                failures.append(
                    f"components/espdesktop/{DATE_TIME_CARDS_HEADER}: {register} must reclaim deleted LVGL label references before registration"
                )
    weather_header = root / "components" / "espdesktop" / WEATHER_HEADER
    basic_action_header = root / "components" / "espdesktop" / BASIC_ACTION_HEADER
    if basic_action_header.exists():
        text = basic_action_header.read_text(encoding="utf-8")
        required = (
            "basic_action_driver_setup_visual",
            "basic_action_driver_bind_main",
            "basic_action_driver_bind_subpage",
            "basic_action_driver_attach_interaction",
            "basic_action_driver_refresh_layout",
            "basic_action_driver_cleanup",
            "basic_action_driver_handle_main_click",
        )
        for needle in required:
            if needle not in text:
                failures.append(
                    f"components/espdesktop/{BASIC_ACTION_HEADER}: missing shared basic-action lifecycle guard {needle}"
                )
    elif grid_header.exists():
        failures.append(
            f"components/espdesktop/{BASIC_ACTION_HEADER}: missing shared basic-action driver"
        )
    numeric_selectable_header = root / "components" / "espdesktop" / NUMERIC_SELECTABLE_HEADER
    if numeric_selectable_header.exists():
        text = numeric_selectable_header.read_text(encoding="utf-8")
        required = (
            "numeric_selectable_driver_setup_visual",
            "numeric_selectable_driver_bind_main",
            "numeric_selectable_driver_bind_subpage",
            "numeric_selectable_driver_attach_interaction",
            "numeric_selectable_driver_refresh_layout",
            "numeric_selectable_driver_cleanup",
            "numeric_selectable_driver_handle_main_click",
            "numeric_selectable_driver_bind_slider",
            "companion_volume_control_valid",
            "companion_track_slider",
            "send_slider_action",
            '"light_brightness"',
            '"light_temperature"',
            '"fan_speed"',
            '"fan_oscillate"',
            '"fan_direction"',
            '"fan_preset"',
            '"option_select"',
        )
        for needle in required:
            if needle not in text:
                failures.append(
                    f"components/espdesktop/{NUMERIC_SELECTABLE_HEADER}: missing shared numeric/selectable lifecycle guard {needle}"
                )
    elif grid_header.exists():
        failures.append(
            f"components/espdesktop/{NUMERIC_SELECTABLE_HEADER}: missing shared numeric/selectable driver"
        )
    cleaning_header = root / "components" / "espdesktop" / CLEANING_HEADER
    access_cover_header = root / "components" / "espdesktop" / ACCESS_COVER_HEADER
    cover_modal_driver_header = (
        root / "components" / "espdesktop" / COVER_MODAL_DRIVER_HEADER
    )
    media_driver_header = root / "components" / "espdesktop" / MEDIA_DRIVER_HEADER
    subpages_header = root / "components" / "espdesktop" / SUBPAGES_HEADER
    if subpages_header.exists():
        normalize_subpage = function_body(
            subpages_header.read_text(encoding="utf-8"), "normalize_subpage_btn"
        ) or ""
        if 'b.sensor != "speaker_group"' not in normalize_subpage:
            failures.append(
                f"components/espdesktop/{SUBPAGES_HEADER}: preserve speaker-group media cards on subpages"
            )
    navigation_driver_header = root / "components" / "espdesktop" / NAVIGATION_DRIVER_HEADER
    if navigation_driver_header.exists():
        text = navigation_driver_header.read_text(encoding="utf-8")
        required = (
            "navigation_driver_setup_visual",
            "navigation_driver_bind_main",
            "navigation_driver_attach_interaction",
            "navigation_driver_refresh_layout",
            "navigation_driver_cleanup",
            "navigation_driver_handle_main_click",
            "navigation_driver_reset_child_indicators",
            "navigation_driver_add_child_indicator",
            "navigation_driver_own_subpage",
            "navigation_register_subpage",
            '"subpage"',
        )
        for needle in required:
            if needle not in text:
                failures.append(
                    f"components/espdesktop/{NAVIGATION_DRIVER_HEADER}: missing shared navigation lifecycle guard {needle}"
                )
    elif grid_header.exists():
        failures.append(
            f"components/espdesktop/{NAVIGATION_DRIVER_HEADER}: missing shared navigation driver"
        )
    image_driver_header = root / "components" / "espdesktop" / IMAGE_DRIVER_HEADER
    light_control_driver_header = (
        root / "components" / "espdesktop" / LIGHT_CONTROL_DRIVER_HEADER
    )
    fan_control_driver_header = (
        root / "components" / "espdesktop" / FAN_CONTROL_DRIVER_HEADER
    )
    climate_control_driver_header = (
        root / "components" / "espdesktop" / CLIMATE_CONTROL_DRIVER_HEADER
    )
    alarm_driver_header = (
        root / "components" / "espdesktop" / ALARM_DRIVER_HEADER
    )
    cards_header = root / "components" / "espdesktop" / CARDS_HEADER
    if cards_header.exists():
        text = cards_header.read_text(encoding="utf-8")
        for legacy_setup in (
            "setup_sensor_card",
            "setup_text_sensor_card",
            "setup_local_sensor_card",
            "setup_weather_card",
            "setup_weather_forecast_card",
        ):
            if legacy_setup in text:
                failures.append(
                    f"components/espdesktop/{CARDS_HEADER}: keep {legacy_setup} inside its shared information driver"
                )
    return failures


def run_self_test() -> None:
    valid_slider_runtime = """
inline bool slider_apply_vertical_pointer_value() {
  lv_indev_active();
  LV_INDEV_TYPE_POINTER;
  lv_indev_get_point();
  lv_obj_get_coords();
  vertical_pointer_position();
  LV_EVENT_VALUE_CHANGED;
}
inline void slider_fit_to_button() {
  lv_obj_set_style_pad_top(slider, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(slider, 0, LV_PART_MAIN);
}
inline void setup_slider_visual() {
  slider_apply_vertical_pointer_value();
  LV_EVENT_PRESSED;
  slider_apply_vertical_pointer_value();
  LV_EVENT_PRESSING;
  slider_apply_vertical_pointer_value();
  send_slider_action();
}
inline void setup_light_temp_visual() {
  slider_apply_vertical_pointer_value();
  LV_EVENT_PRESSED;
  slider_apply_vertical_pointer_value();
  LV_EVENT_PRESSING;
  lv_obj_add_event_cb();
  slider_apply_vertical_pointer_value();
  send_light_temp_action();
  LV_EVENT_RELEASED;
}
"""
    cases: tuple[tuple[dict[str, str], tuple[str, ...]], ...] = (
        (
            {"button_grid_sliders.h": valid_slider_runtime},
            (),
        ),
        (
            {"button_grid_sliders.h": valid_slider_runtime.replace("lv_indev_get_point();", "")},
            ("map direct vertical slider pointer input",),
        ),
        (
            {"button_grid_sliders.h": valid_slider_runtime.replace("LV_EVENT_PRESSING;", "")},
            ("apply direct vertical slider endpoint mapping",),
        ),
        (
            {
                "button_grid_sliders.h": valid_slider_runtime.replace(
                    "lv_obj_set_style_pad_top(slider, 0, LV_PART_MAIN);",
                    "lv_obj_set_style_pad_top(slider, edge_inset, LV_PART_MAIN);",
                )
            },
            ("keep LVGL's direct slider range unpadded",),
        ),
        (
            {"button_grid_actions.h": "return card_contract_media_mode_valid(mode);\n"},
            ("access generated card contract through button_grid_card_runtime.h",),
        ),
        (
            {"button_grid_config.h": "return CARD_CONTRACT_MEDIA_DEFAULT_MODE;\n"},
            ("access generated card contract through button_grid_card_runtime.h",),
        ),
        (
            {"button_grid_config.h": '#include "button_grid_contract_generated.h"\n'},
            ("include generated card contract through button_grid_card_runtime.h",),
        ),
        (
            {"button_grid_cards.h": "static const char *modes[] = {\"open\", \"close\"};\n"},
            ("keep shared card mode lists in the card runtime/contract boundary",),
        ),
        (
            {"button_grid_actions.h": "if (mode == \"lock\") return \"lock.lock\";\n"},
            ("keep shared card service mappings in the card runtime/contract boundary",),
        ),
        (
            {"button_grid_alarm.h": "return \"alarm_control_panel.alarm_arm_away\";\n"},
            ("keep shared card service mappings in the card runtime/contract boundary",),
        ),
        (
            {"button_grid_card_runtime.h": "return card_contract_media_mode_valid(mode);\n"},
            (),
        ),
        (
            {"button_grid_card_runtime.h": '#include "button_grid_contract_generated.h"\n'},
            (),
        ),
        (
            {"button_grid_contract_generated.h": "inline const char *const CARD_CONTRACT_MEDIA_MODES[] = {\"play_pause\"};\n"},
            (),
        ),
        (
            {"button_grid_alarm.h": "static const char *modes[3] = {\"home\", \"away\", \"disarm\"};\n"},
            (),
        ),
        (
            {"button_grid_actions.h": "ESP_LOGW(\"cover\", \"cover.stop_cover failed\");\n"},
            (),
        ),
        (
            {"button_grid_actions.h": "cover_tilt ? \"cover.set_cover_tilt_position\" : \"cover.set_cover_position\";\n"},
            (),
        ),
        (
            {"button_grid_actions.h": "if (sensor == \"open\") return \"cover.open_cover_tilt\";\n"},
            (),
        ),
        (
            {
                "button_grid_grid.h": (
                    "inline void setup_card_visual() {\n"
                    "  if (espdesktop::cards::image_driver_setup_visual()) return;\n"
                    "}\n"
                )
            },
            ("restore persistent button clickability before visual driver dispatch",),
        ),
        (
            {
                "button_grid_grid.h": (
                    "inline void clear_unsupported_card_slot_visuals() {}\n"
                    "inline void setup_card_visual() {\n"
                    "  lv_obj_add_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);\n"
                    "  if (espdesktop::cards::image_driver_setup_visual()) return;\n"
                    "  ESP_LOGW(\"card_runtime\", \"Unsupported card type has no visual driver: type=%s\", type);\n"
                    "}\n"
                )
            },
            ("clear stale slot visuals before leaving unsupported cards inert",),
        ),
        (
            {
                "button_grid_grid.h": (
                    'if (parent_subpage_kind == "lawn_mower") { lawn_mower_state_active_ref(state); }\n'
                    'if (sb_cfg.type == "light_control") {\n'
                    '  subscribe_light_control_state(ctx);\n'
                    '  add_parent_indicator(sb_cfg.entity);\n'
                    '}\n'
                    'navigation_clear_subpages(main_page_obj);\n'
                    'reset_image_card_pool(cfg);\n'
                )
            },
            ("reset image-card contexts before deleting subpage screens",),
        ),
        (
            {"button_grid_image.h": "for (int i = 0; i < count; i++) {}\n"},
            ("reset every image-card context, including disabled slots",),
        ),
        (
            {
                "button_grid_date_time_driver.h": (
                    "inline bool date_time_driver_setup_visual() {}\n"
                    "inline bool date_time_driver_bind_data() {}\n"
                )
            },
            ("missing shared date-time lifecycle guard",),
        ),
        (
            {
                "button_grid_datetime_cards.h": (
                    "inline bool calendar_card_ref_ready() { return true; }\n"
                    "inline void compact_calendar_card_refs() {}\n"
                    "inline void refresh_calendar_cards() {}\n"
                    "inline void register_calendar_card() {}\n"
                    "inline bool timezone_card_ref_ready() { return true; }\n"
                    "inline void compact_timezone_card_refs() {}\n"
                    "inline void update_timezone_cards() {}\n"
                    "inline void register_timezone_card() {}\n"
                )
            },
            (
                "calendar_card_ref_ready must reject deleted LVGL labels",
                "compact_calendar_card_refs must remove deleted LVGL label references",
                "refresh_calendar_cards must compact deleted LVGL label references",
                "register_calendar_card must reclaim deleted LVGL label references before registration",
                "timezone_card_ref_ready must reject deleted LVGL labels",
                "compact_timezone_card_refs must remove deleted LVGL label references",
                "update_timezone_cards must compact deleted LVGL label references",
                "register_timezone_card must reclaim deleted LVGL label references before registration",
            ),
        ),
        (
            {
                "button_grid_basic_action_driver.h": (
                    "inline bool basic_action_driver_setup_visual() {}\n"
                    "inline bool basic_action_driver_bind_main() {}\n"
                )
            },
            ("missing shared basic-action lifecycle guard",),
        ),
        (
            {
                "button_grid_numeric_selectable_driver.h": (
                    "inline bool numeric_selectable_driver_setup_visual() {}\n"
                    "inline bool numeric_selectable_driver_bind_main() {}\n"
                )
            },
            ("missing shared numeric/selectable lifecycle guard",),
        ),
        (
            {
                "button_grid_navigation_driver.h": (
                    "inline bool navigation_driver_setup_visual() {}\n"
                    "inline bool navigation_driver_bind_main() {}\n"
                )
            },
            ("missing shared navigation lifecycle guard",),
        ),
        (
            {
                "button_grid_image.h": (
                    "inline void image_card_start_next_queued_download() {\n"
                    "  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; i++) {}\n"
                    "}\n"
                    "inline void reset_image_card_pool(const GridConfig &cfg) {\n"
                    "  int count = cfg.image_card_image_count;\n"
                    "  for (int i = 0; i < count; i++) {}\n"
                    "}\n"
                )
            },
            ("reset every image-card context, including disabled slots",),
        ),
        (
            {
                "button_grid_image.h": (
                    "inline void reset_image_card_pool(const GridConfig &cfg) {\n"
                    "  image_card_release_modal_cache(cfg.image_card_modal_image);\n"
                    "  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; i++) {}\n"
                    "}\n"
                )
            },
            ("rebind image completion callbacks after image-card lifecycle changes",),
        ),
        (
            {
                "button_grid_image.h": (
                    "inline void image_card_bind_callbacks(ImageCardCtx *ctx) {\n"
                    "  auto *bound_image = ctx->image;\n"
                    "  bool changed = ctx->callbacks_bound_image != bound_image;\n"
                    "  if (changed || !bound_image->has_on_finished_callbacks()) {\n"
                    "    if (ctx->image == bound_image) {}\n"
                    "  }\n"
                    "  if (changed || !bound_image->has_on_error_callbacks()) {}\n"
                    "}\n"
                    "inline void reset_image_card_pool(const GridConfig &cfg) {\n"
                    "  image_card_schedule_modal_cache_expiry(cfg.image_card_modal_image);\n"
                    "  image_card_release_modal_cache(cfg.image_card_modal_image);\n"
                    "  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; i++) {}\n"
                    "}\n"
                )
            },
            (),
        ),
    )
    for files, expected in cases:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            firmware_dir = root / "components" / "espdesktop"
            firmware_dir.mkdir(parents=True)
            for name, content in files.items():
                (firmware_dir / name).write_text(content, encoding="utf-8")
            failures = check_root(root)
            for text in expected:
                assert any(text in failure for failure in failures), (files, failures, text)
            if not expected:
                assert not failures, (files, failures)
    print("Firmware card runtime self-tests passed.")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        run_self_test()
        return 0

    failures = check_root(ROOT)
    if failures:
        print("Firmware card runtime guard failed:")
        for failure in failures:
            print(f"  {failure}")
        return 1
    print("Firmware card runtime checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
