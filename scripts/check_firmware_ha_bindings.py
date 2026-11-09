#!/usr/bin/env python3
"""Guard firmware Home Assistant access behind button_grid_ha.h helpers."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory


ROOT = Path(__file__).resolve().parents[1]
FIRMWARE_DIR = ROOT / "components" / "espdesktop"
CORE_INFRA_PATH = ROOT / "common" / "device" / "core_infra.yaml"
SCREEN_LOADING_PATH = ROOT / "common" / "device" / "screen_loading.yaml"
SCREEN_WIFI_SETUP_PATH = ROOT / "common" / "device" / "screen_wifi_setup.yaml"
API_NAVIGATE_PATH = ROOT / "common" / "device" / "api_navigate.yaml"
C6_FIRMWARE_UPDATE_PATH = ROOT / "common" / "device" / "esp32_c6_firmware_update.yaml"
SCREEN_CLOCK_PATH = ROOT / "common" / "device" / "screen_clock.yaml"
ARTWORK_IMAGE_PATH = ROOT / "components" / "artwork_image" / "artwork_image.cpp"
BACKLIGHT_PATH = ROOT / "common" / "addon" / "backlight.yaml"
BACKLIGHT_SCHEDULE_PATH = ROOT / "common" / "addon" / "backlight_schedule.yaml"
DISPLAY_CONFIG_PATH = ROOT / "common" / "config" / "display.yaml"
TIME_ADDON_PATH = ROOT / "common" / "addon" / "time.yaml"
SUN_CALC_PATH = ROOT / "components" / "espdesktop" / "sun_calc.h"
CONNECTOR_STATE_PATH = ROOT / "components" / "espdesktop" / "connector_state.h"
S3_DEVICE_PATH = ROOT / "devices" / "guition-esp32-s3-4848s040" / "device" / "device.yaml"
S3_PACKAGES_PATH = ROOT / "devices" / "guition-esp32-s3-4848s040" / "packages.yaml"
DEVICE_DEVICE_PATHS = tuple(sorted((ROOT / "devices").glob("*/device/device.yaml")))
DEVICE_SENSOR_PATHS = tuple(sorted((ROOT / "devices").glob("*/device/sensors.yaml")))
DEVICE_PACKAGE_PATHS = tuple(sorted((ROOT / "devices").glob("*/packages.yaml")))
DEVICE_TOUCH_PATHS = tuple(sorted((ROOT / "devices").glob("*/device/*.yaml")))
DISPLAY_TAKEOVER_BACKLIGHT_DEVICE_SLUGS = frozenset(
    {
        "guition-esp32-p4-jc8012p4a1",
        "guition-esp32-p4-jc8012p4a1-v2",
    }
)
CONNECTIVITY_PATHS = (
    ROOT / "common" / "addon" / "connectivity.yaml",
    ROOT / "common" / "addon" / "connectivity_deployed.yaml",
    ROOT / "common" / "addon" / "connectivity_ethernet.yaml",
)
DISPLAY_LIFECYCLE_ROOTS = (
    ROOT / "common",
    ROOT / "devices",
    ROOT / "components" / "espdesktop",
)
REMOVED_DISPLAY_LIFECYCLE_SYMBOLS = (
    "display_asleep",
    "screen_schedule_asleep",
    "backlight_manual_off",
    "screensaver_display_off_active",
    "screensaver_dimmed_active",
    "is_clock_showing",
    "cover_art_screensaver_active",
    "setup_screen_dimmed_shadow_active",
    "display_mode_shadow_observer",
    "LegacyDisplayState",
    "LegacyModeResult",
    "DisplayShadowObservation",
    "DisplayModeShadowObserver",
)


def firmware_weather_header_path(firmware_dir: Path) -> Path:
    weather_path = firmware_dir / "button_grid_weather_forecast.h"
    return weather_path


def firmware_display_controller_ownership_errors(
    roots: tuple[Path, ...], root: Path
) -> list[str]:
    errors: list[str] = []
    for scan_root in roots:
        if not scan_root.exists():
            continue
        for path in scan_root.rglob("*"):
            if path.suffix not in {".yaml", ".h", ".cpp"}:
                continue
            text = path.read_text(encoding="utf-8")
            removed = [symbol for symbol in REMOVED_DISPLAY_LIFECYCLE_SYMBOLS if symbol in text]
            if removed:
                errors.append(
                    f"{path.relative_to(root)}: use display_mode_controller ownership; "
                    f"removed compatibility state remains ({', '.join(removed)})"
                )
    return errors


def package_api_navigate_enabled(package_path: Path, root: Path) -> bool:
    manifest_path = root / "devices" / "manifest.json"
    if not manifest_path.exists():
        return True
    try:
        slug = package_path.relative_to(root / "devices").parts[0]
    except (ValueError, IndexError):
        return True
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return True
    device = manifest.get("devices", {}).get(slug, {})
    package = device.get("firmware", {}).get("package", {})
    return bool(package.get("apiNavigateAction", True))


def package_api_open_modal_enabled(package_path: Path, root: Path) -> bool:
    manifest_path = root / "devices" / "manifest.json"
    if not manifest_path.exists():
        return True
    try:
        slug = package_path.relative_to(root / "devices").parts[0]
    except (ValueError, IndexError):
        return True
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return True
    device = manifest.get("devices", {}).get(slug, {})
    package = device.get("firmware", {}).get("package", {})
    return bool(package.get("apiOpenModalAction", True))


HA_BOUNDARY_ALLOWLIST = {
    "button_grid_ha.h",
}
DIRECT_HA_PATTERNS = (
    (re.compile(r"\bha_get_(?:state|attribute)\s*\("), "use retained Home Assistant reads instead of one-shot helpers"),
    (re.compile(r"\bglobal_api_server\b"), "access Home Assistant API through button_grid_ha.h helpers"),
    (re.compile(r"(?:->|\.)send_homeassistant_action\s*\("), "send Home Assistant actions through button_grid_ha.h helpers"),
    (re.compile(r"(?:->|\.)subscribe_home_assistant_state\s*\("), "subscribe to Home Assistant state through button_grid_ha.h helpers"),
    (re.compile(r"(?:->|\.)get_home_assistant_state\s*\("), "get Home Assistant state through button_grid_ha.h helpers"),
    (re.compile(r"(?:->|\.)register_action_response_callback\s*\("), "register action callbacks through button_grid_ha.h helpers"),
    (re.compile(r"(?:->|\.)handle_action_response\s*\("), "cancel action callbacks through button_grid_ha.h helpers"),
)
STATE_HELPER_PATTERN = re.compile(
    r"inline\s+bool\s+ha_subscribe_state\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
ATTRIBUTE_HELPER_PATTERN = re.compile(
    r"inline\s+bool\s+ha_subscribe_attribute\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
SUBSCRIPTION_TRACKING_PATTERN = re.compile(
    r"subscriptions_\.push_back\(\s*\{\s*callback_ref\s*,\s*scope(?:\s*,\s*owner)?"
    r"(?:\s*,\s*channel)?(?:\s*,\s*retain_latest)?\s*\}\s*\)"
)
DEFERRED_CALLBACK_FANOUT_PATTERN = re.compile(
    r"for\s*\(\s*const\s+auto\s*&\s*callback(?:_ref)?\s*:\s*\*callback_refs\s*\)"
)
WEATHER_FORECAST_REQUEST_PATTERN = re.compile(
    r"inline\s+void\s+request_weather_forecast_entity\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
MEDIA_CONTROL_STATE_PATTERN = re.compile(
    r"inline\s+void\s+subscribe_media_control_state\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}\n\ninline\s+bool\s+media_seek_pending_active",
    re.DOTALL,
)
COVER_COMMAND_REQUEST_PATTERN = re.compile(
    r"inline\s+void\s+send_cover_command_action\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
    re.DOTALL,
)
YAML_SCRIPT_PATTERN_TEMPLATE = r"(?ms)^  - id: {script_id}\n(?P<body>.*?)(?=^  - id: |\Z)"


def accumulating_ha_read_call(text: str) -> bool:
    # Preserve quoted strings while removing comments, so URLs cannot hide code
    # after them and explanatory API names do not count as calls.
    code = re.sub(
        r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*.*?\*/',
        lambda match: " " if match.group().startswith(("//", "/*")) else match.group(),
        text,
        flags=re.DOTALL,
    )
    return bool(re.search(
        r"\bget_home_assistant_state\s*\(|\btransport_\s*(?:\.|->)\s*get\s*\(",
        code,
    ))


def yaml_script_body(text: str, script_id: str) -> str | None:
    match = re.search(YAML_SCRIPT_PATTERN_TEMPLATE.format(script_id=re.escape(script_id)), text)
    return match.group("body") if match else None


def firmware_ha_binding_errors(firmware_dir: Path, root: Path) -> list[str]:
    errors: list[str] = []
    for path in sorted(firmware_dir.glob("button_grid*.h")):
        if path.name in HA_BOUNDARY_ALLOWLIST:
            continue
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            for pattern, message in DIRECT_HA_PATTERNS:
                if pattern.search(line):
                    rel = path.relative_to(root)
                    errors.append(f"{rel}:{line_no}: {message}")
                    break
    return errors


def firmware_ha_boundary_errors(firmware_dir: Path, root: Path) -> list[str]:
    path = firmware_dir / "button_grid_ha.h"
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    coordinator_path = firmware_dir / "ha_read_coordinator.h"
    coordinator_text = coordinator_path.read_text(encoding="utf-8") if coordinator_path.exists() else ""
    read_boundary_text = text + "\n" + coordinator_text
    errors: list[str] = []

    state_helper = STATE_HELPER_PATTERN.search(text)
    if not state_helper:
        errors.append(f"{rel}: missing ha_subscribe_state helper")
    elif "heap_available" in state_helper.group("body"):
        errors.append(f"{rel}: keep core HA state subscriptions off the low-heap guard")

    retry_symbols = (
        "HaUnavailableStateRetryRef",
        "ha_unavailable_state_retry_refs",
        "ha_note_state_retry_result",
        "ha_retry_unavailable_states",
        "ha_reset_unavailable_state_retries",
        "HA_UNAVAILABLE_STATE_RETRY",
    )
    if any(symbol in text for symbol in retry_symbols):
        errors.append(f"{rel}: do not reintroduce unavailable HA state retry polling")

    attribute_helper = ATTRIBUTE_HELPER_PATTERN.search(text)
    if not attribute_helper:
        errors.append(f"{rel}: missing ha_subscribe_attribute helper")
    elif "heap_available" in attribute_helper.group("body"):
        errors.append(f"{rel}: keep HA metadata attribute subscriptions off the low-heap guard")

    if "ha_cancel_action_response_callback" not in text or "handle_action_response" not in text:
        errors.append(f"{rel}: expose a helper to cancel stale HA action response callbacks")
    action_send_match = re.search(
        r"inline\s+bool\s+ha_action_send\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
        text,
        re.DOTALL,
    )
    if not action_send_match:
        errors.append(f"{rel}: missing ha_action_send helper")
    elif "ha_api_state_connected()" not in action_send_match.group("body"):
        errors.append(f"{rel}: send Home Assistant actions only after state subscription is ready")
    elif "HA_ACTION_INTERNAL_FREE_MIN_BYTES" not in action_send_match.group("body"):
        errors.append(f"{rel}: defer Home Assistant actions when S3 internal heap is critically low")
    if (
        "ha_read_coordinator().read_retained(" not in text
        or "HA_READ_INTERNAL_FREE_MIN_BYTES" not in text
        or 'heap_probe_.available("Home Assistant state request"' not in coordinator_text
    ):
        errors.append(f"{rel}: guard retained Home Assistant reads under low internal heap")
    if "transport_.request(" not in coordinator_text or "request_fresh(" not in coordinator_text:
        errors.append(f"{rel}: route fresh Home Assistant reads through the bounded coordinator helper")
    if accumulating_ha_read_call(read_boundary_text):
        errors.append(f"{rel}: fresh metadata reads must reuse subscriptions, not append native callbacks or borrow temporary strings")
    if (
        "find_subscription_channel(entity_id, attribute, has_attribute)" not in coordinator_text
        or "!channel_reuses_reads(channel)" not in coordinator_text
    ):
        errors.append(f"{rel}: fail retained reads closed without an active retained subscription")
    if (
        "if (callback_depth_ != 0)" not in coordinator_text
        or "queue_callback_ref(request.callbacks, std::move(callback))" not in coordinator_text
        or "request.channel == channel" not in coordinator_text
        or "queue_on_subscription_channel(channel, std::move(callback_ref))" not in coordinator_text
        or "for (const auto &callback_ref : callbacks)" not in coordinator_text
    ):
        errors.append(f"{rel}: queue and fan out bounded reentrant retained reads")
    if not SUBSCRIPTION_TRACKING_PATTERN.search(coordinator_text):
        errors.append(f"{rel}: track Home Assistant subscription callbacks for generation cleanup")
    if "release_subscriptions" not in coordinator_text or "*ref.callback = nullptr" not in coordinator_text:
        errors.append(f"{rel}: release retired Home Assistant subscription callback bodies")
    if (
        "subscription_channels_" not in coordinator_text
        or "invoke_subscription_channel" not in coordinator_text
        or "size_t channel = find_subscription_channel(entity_id, attribute, true);" not in coordinator_text
        or "transport_.subscribe(" not in coordinator_text
    ):
        errors.append(f"{rel}: reuse one Home Assistant transport subscription across grid rebuilds")
    if (
        "inline void ha_reannounce_state_subscriptions()" not in text
        or "client->get_name()" not in text
        or "client->on_subscribe_home_assistant_states_request();" not in text
    ):
        errors.append(f"{rel}: re-announce runtime card subscriptions to the connected Home Assistant client")
    if (
        "ha_log_subscription_diagnostics" not in text
        or "get_state_subs().size()" not in text
        or "pending_read_count()" not in text
        or "subscription_channel_count()" not in text
        or "retained_channel_count()" not in text
    ):
        errors.append(f"{rel}: expose count-only Home Assistant subscription diagnostics")
    grid_path = firmware_dir / "button_grid_grid.h"
    if grid_path.exists() and "ha_reannounce_state_subscriptions();" not in grid_path.read_text(encoding="utf-8"):
        errors.append(f"{grid_path.relative_to(root)}: re-announce subscriptions after runtime grid rebuilds")

    return errors


def firmware_unavailable_retry_errors(
    firmware_dir: Path,
    core_infra_path: Path,
    root: Path,
) -> list[str]:
    config_path = firmware_dir / "button_grid_config.h"
    errors: list[str] = []
    if config_path.exists():
        config_rel = config_path.relative_to(root)
        config_text = config_path.read_text(encoding="utf-8")
        bump_match = re.search(
            r"inline\s+void\s+bump_ha_subscription_generation\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
            config_text,
            re.DOTALL,
        )
        if bump_match and "ha_reset_unavailable_state_retries" in bump_match.group("body"):
            errors.append(f"{config_rel}: do not reset removed unavailable HA state retries")
        if bump_match and "ha_reset_subscription_callbacks(HA_SUBSCRIPTION_SCOPE_DEFAULT)" not in bump_match.group("body"):
            errors.append(f"{config_rel}: release retired default Home Assistant subscription callbacks on generation bumps")
        if "ha_reset_unavailable_state_retries" in config_text:
            errors.append(f"{config_rel}: do not keep removed unavailable HA state retry helpers")

    if core_infra_path.exists():
        core_rel = core_infra_path.relative_to(root)
        core_text = core_infra_path.read_text(encoding="utf-8")
        if "ha_retry_unavailable_states" in core_text:
            errors.append(f"{core_rel}: do not retry unavailable HA states after reconnects or during maintenance")
    return errors


def firmware_card_disabled_state_errors(firmware_dir: Path, root: Path) -> list[str]:
    errors: list[str] = []
    config_path = firmware_dir / "button_grid_config.h"
    actions_path = firmware_dir / "button_grid_actions.h"
    grid_path = firmware_dir / "button_grid_grid.h"

    if config_path.exists():
        rel = config_path.relative_to(root)
        text = config_path.read_text(encoding="utf-8")
        if "apply_control_availability" in text:
            errors.append(f"{rel}: do not keep a generic helper that dims or disables card controls")

    for path in (actions_path, grid_path):
        if not path.exists():
            continue
        rel = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        if re.search(r"lv_obj_has_state\s*\([^;\n]*LV_STATE_DISABLED", text):
            errors.append(f"{rel}: card tap handlers must not ignore taps because a card is disabled")

    return errors


def firmware_media_card_availability_errors(firmware_dir: Path, root: Path) -> list[str]:
    path = firmware_dir / "button_grid_media.h"
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    if "media_control_apply_availability(ctx->btn, ctx->btn" in text:
        errors.append(f"{rel}: do not dim or disable media cards for unavailable entity states")
    if "media_control_apply_availability(ui.panel, ui.panel" in text:
        errors.append(f"{rel}: do not dim the media control panel for unavailable entity states")

    return errors


def firmware_time_reconnect_errors(time_path: Path, root: Path) -> list[str]:
    if not time_path.exists():
        return []
    rel = time_path.relative_to(root)
    text = time_path.read_text(encoding="utf-8")
    errors: list[str] = []

    if "id(homeassistant_time).update();" in text.replace(
        "if (ha_api_state_connected()) id(homeassistant_time).update();", ""
    ):
        errors.append(f"{rel}: guard Home Assistant time updates until state subscription is ready")
    if "on_client_connected:" in text and "ha_api_state_connected()" not in text:
        errors.append(f"{rel}: wait for Home Assistant state readiness before reconnect time sync")
    if "on_client_connected:" in text and "delay: 2s" not in text:
        errors.append(f"{rel}: defer Home Assistant time sync after API reconnect")
    api_connect_match = re.search(
        r"(?ms)^api:\n\s+on_client_connected:\n(?P<body>.*?)(?:^#|^select:|^text:|^text_sensor:|^time:|^script:|\Z)",
        text,
    )
    if api_connect_match:
        api_connect_body = api_connect_match.group("body")
        if "script.execute: backlight_recalc_sunrise_sunset" not in api_connect_body:
            errors.append(f"{rel}: recalculate sunrise and sunset after reconnect time sync")
        if "script.execute: screen_schedule_check" not in api_connect_body:
            errors.append(f"{rel}: recheck the screen schedule after reconnect time sync")
    return errors


def firmware_ntp_startup_errors(
    time_path: Path,
    sun_calc_path: Path,
    connectivity_paths: tuple[Path, ...],
    root: Path,
) -> list[str]:
    errors: list[str] = []
    if time_path.exists():
        rel = time_path.relative_to(root)
        text = time_path.read_text(encoding="utf-8")
        boot_match = re.search(
            r"(?ms)^esphome:\n(?P<body>.*?)(?=^[A-Za-z_][A-Za-z_0-9]*:|\Z)", text,
        )
        boot_section = boot_match.group("body") if boot_match else ""
        if re.search(r"(?m)^\s*- script.execute: ntp_servers_apply\s*$", boot_section):
            errors.append(f"{rel}: defer custom NTP server apply until networking has an IP address")
        if "# NTP server settings" in text:
            ntp_text_section = text.split("# NTP server settings", 1)[1].split("text_sensor:", 1)[0]
            if "- script.execute: ntp_servers_apply\n" in ntp_text_section:
                errors.append(f"{rel}: debounce restored NTP text values before applying SNTP settings")
            if "id: ntp_servers_apply_after_network" not in text:
                errors.append(f"{rel}: route NTP server changes through delayed network-ready apply script")
    if sun_calc_path.exists():
        rel = sun_calc_path.relative_to(root)
        text = sun_calc_path.read_text(encoding="utf-8")
        if "apply_ntp_servers" in text and "App.is_setup_complete()" not in text:
            errors.append(f"{rel}: skip SNTP reconfiguration until application setup has completed")
        if (
            "apply_ntp_servers" in text
            and "get_ip_addresses().empty()" not in text
        ):
            errors.append(f"{rel}: skip SNTP reconfiguration until networking has an IP address")
    for path in connectivity_paths:
        if not path.exists():
            continue
        rel = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        if "on_connect:" in text and "- script.execute: ntp_servers_apply_after_network" not in text:
            errors.append(f"{rel}: apply configured NTP servers after network connect")
    return errors


def firmware_weather_request_errors(firmware_dir: Path, root: Path) -> list[str]:
    path = firmware_weather_header_path(firmware_dir)
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    request = WEATHER_FORECAST_REQUEST_PATTERN.search(text)
    if not request:
        errors.append(f"{rel}: missing request_weather_forecast_entity helper")
        return errors
    body = request.group("body")
    if "ha_api_state_connected()" not in body:
        errors.append(f"{rel}: wait for Home Assistant state subscription before automatic forecast requests")
    if "low internal heap" not in body:
        errors.append(f"{rel}: retry automatic forecast requests instead of sending during critically low internal heap")
    if "ha_cancel_action_response_callback(req.call_id" not in text:
        errors.append(f"{rel}: cancel forecast response callbacks when sends fail")
    if (
        'ha_cancel_action_response_callback(req.call_id, "send failed");' in body
        and 'weather_forecast_schedule_retry(entity_id, day, "send failed");' not in body
    ):
        errors.append(f"{rel}: retry weather forecast sends that fail after callback registration")
    if "WEATHER_FORECAST_PENDING_MAX" not in text or "weather_forecast_track_pending" not in text:
        errors.append(f"{rel}: bound pending forecast response callbacks")
    if "weather_forecast_cancel_pending_requests" not in text:
        errors.append(f"{rel}: expose a helper to cancel pending forecast callbacks")
    if (
        "uint32_t generation = ha_subscription_generation();" not in body
        or "generation != ha_subscription_generation()" not in body
    ):
        errors.append(f"{rel}: ignore stale forecast action responses after dashboard reconfiguration")
    if "WEATHER_FORECAST_RETRY_DELAY_MS" not in text or "weather_forecast_schedule_retry" not in text:
        errors.append(f"{rel}: retry failed weather forecast requests later")
    if (
        "response if response is defined and response is not none else {}" not in text
        or "'forecast' in response_data" not in text
        or "response_data[entity] if entity in response_data else {}" not in text
    ):
        errors.append(f"{rel}: accept both direct and entity-keyed Home Assistant forecast response shapes")
    if (
        "today_date = now().date()" not in text
        or "tomorrow_date = (now() + timedelta(days=1)).date()" not in text
        or "as_datetime(item['datetime'])" not in text
        or "as_local(item_dt).date()" not in text
        or "as_datetime(item['date']).date()" not in text
        or "ns.today if ns.today is not none else (forecasts[0]" not in text
        or "ns.tomorrow if ns.tomorrow is not none else (forecasts[1]" not in text
    ):
        errors.append(f"{rel}: select today/tomorrow weather forecasts by date/datetime before falling back to list order")
    if (
        "unit_keys = ['temperature_unit','native_temperature_unit','unit_of_measurement','native_unit_of_measurement','unit']" not in text
        or "key in entity_response" not in text
        or "state_attr(entity, 'temperature_unit')" not in text
        or "state_attr(entity, 'unit_of_measurement')" not in text
    ):
        errors.append(f"{rel}: preserve forecast temperature units from response data or weather entity attributes")
    if (
        "native_temperature" not in text
        or "native_templow" not in text
        or "native_temperature_unit" not in text
    ):
        errors.append(f"{rel}: accept native Home Assistant forecast temperature fields and units")
    if (
        "max_temperature" not in text
        or "temperature_max" not in text
        or "max_temp" not in text
        or "min_temperature" not in text
        or "temperature_min" not in text
        or "min_temp" not in text
    ):
        errors.append(f"{rel}: accept max/min weather forecast temperature field aliases")
    if (
        "unit_keys" not in text
        or "today is not none and key in today" not in text
        or "tomorrow is not none and key in tomorrow" not in text
    ):
        errors.append(f"{rel}: preserve forecast temperature units from individual forecast items")
    if "parse_weather_forecast_temp" in text and "std::isfinite(parsed)" not in text:
        errors.append(f"{rel}: reject non-finite weather forecast temperatures before rendering")
    if (
        "No usable forecast temperatures" in body
        and 'weather_forecast_schedule_retry(entity_id, day, "no usable forecast temperatures");' not in body
    ):
        errors.append(f"{rel}: retry weather forecasts when Home Assistant returns no usable temperatures")
    if (
        "weather_forecast_error_is_timeout" not in text
        or 'find("timed out")' not in text
        or "apply_weather_forecast_actions_required_for_entity" not in body
    ):
        errors.append(f"{rel}: detect Home Assistant forecast timeout errors robustly")
    return errors


def firmware_weather_disconnect_errors(firmware_dir: Path, core_infra_path: Path, root: Path) -> list[str]:
    config_path = firmware_weather_header_path(firmware_dir)
    if not config_path.exists() or not core_infra_path.exists():
        return []
    core_rel = core_infra_path.relative_to(root)
    config_text = config_path.read_text(encoding="utf-8")
    core_text = core_infra_path.read_text(encoding="utf-8")
    errors: list[str] = []

    if "weather_forecast_cancel_pending_requests" in config_text and (
        "on_client_disconnected:" not in core_text or "weather_forecast_cancel_pending_requests" not in core_text
    ):
        errors.append(f"{core_rel}: cancel pending forecast callbacks when the HA API disconnects")
    return errors


def firmware_weather_reconnect_errors(core_infra_path: Path, root: Path) -> list[str]:
    if not core_infra_path.exists():
        return []
    core_rel = core_infra_path.relative_to(root)
    core_text = core_infra_path.read_text(encoding="utf-8")
    errors: list[str] = []

    connected_match = re.search(
        r"(?ms)^  on_client_connected:\n(?P<body>.*?)(?:^  on_client_disconnected:|^interval:|\Z)",
        core_text,
    )
    if not connected_match:
        errors.append(f"{core_rel}: refresh weather forecasts after Home Assistant reconnects")
        return errors

    body = connected_match.group("body")
    if "id(ha_refresh_after_connect).execute(" in body:
        body = yaml_script_body(core_text, "ha_refresh_after_connect") or ""
        body = re.split(r"(?m)^[a-z_]+:", body, maxsplit=1)[0]
    for match in re.finditer(r"refresh_weather_forecast_cards\(\);", body):
        guard_window = body[max(0, match.start() - 220) : match.end()]
        if "ha_api_state_connected()" not in guard_window:
            errors.append(f"{core_rel}: wait for Home Assistant state readiness before forecast reconnect refreshes")
            break
    if "refresh_weather_forecast_cards();" in body and ("delay: 20s" not in body or "delay: 25s" not in body):
        errors.append(f"{core_rel}: retry weather forecast refresh after slow S3 reconnects")
    return errors


def firmware_cover_request_errors(firmware_dir: Path, core_infra_path: Path, root: Path) -> list[str]:
    path = firmware_dir / "button_grid_actions.h"
    if not path.exists() or not core_infra_path.exists():
        return []
    rel = path.relative_to(root)
    core_rel = core_infra_path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    core_text = core_infra_path.read_text(encoding="utf-8")
    errors: list[str] = []

    request = COVER_COMMAND_REQUEST_PATTERN.search(text)
    if not request:
        return errors
    body = request.group("body")
    if "cover_stop_track_pending" not in text or "cover_stop_clear_pending" not in text:
        errors.append(f"{rel}: track pending cover stop callbacks")
    if "cover_stop_cancel_pending_request" not in text:
        errors.append(f"{rel}: expose a helper to cancel pending cover stop callbacks")
    if "cover_stop_tracked" not in body or "ha_cancel_action_response_callback(req.call_id" not in body:
        errors.append(f"{rel}: cancel cover stop callbacks when sends fail")
    if "on_client_disconnected:" not in core_text or "cover_stop_cancel_pending_request" not in core_text:
        errors.append(f"{core_rel}: cancel pending cover stop callbacks when the HA API disconnects")
    return errors


def firmware_image_card_base_url_errors(firmware_dir: Path, root: Path) -> list[str]:
    path = firmware_dir / "button_grid_image.h"
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    if "base_url_provider" not in text:
        errors.append(f"{rel}: keep image card Home Assistant base URL lookup live")
    if ("image_card_join_url(image_card_base_url(ctx), raw)" not in text and
        ("std::string base_url = image_card_base_url(ctx)" not in text or
         "image_card_join_url(base_url, raw)" not in text)):
        errors.append(f"{rel}: resolve image card base URL when entity_picture is handled")
    if 'ctx->base_url = cfg.home_assistant_base_url ? cfg.home_assistant_base_url() : "";' in text:
        if "ctx->base_url_provider = cfg.home_assistant_base_url" not in text:
            errors.append(f"{rel}: do not rely only on the startup-time image card base URL")
    return errors


def firmware_camera_refresh_action_errors(root: Path) -> list[str]:
    errors: list[str] = []
    image_header = root / "components" / "espdesktop" / "button_grid_image.h"
    p4_package = root / "common" / "device" / "image_cards_6.yaml"
    s3_package = root / "common" / "device" / "image_cards_2.yaml"
    if not image_header.exists() or not p4_package.exists() or not s3_package.exists():
        return errors

    image_text = image_header.read_text(encoding="utf-8")
    p4_text = p4_package.read_text(encoding="utf-8")
    s3_text = s3_package.read_text(encoding="utf-8")
    camera_refresh_contract = (
        "inline void refresh_visible_camera_cards()",
        "image_card_context_on_active_screen(ctx)",
        "ctx->media_artwork",
        "const ControlModalActive &active_modal = control_modal_active()",
        "active_modal.kind != ControlModalKind::NONE",
        "active_modal.kind != ControlModalKind::IMAGE_CARD",
        "!image_card_modal_active_for(ctx)",
        "screen == lv_scr_act()",
        'std::string("access_token")',
        'std::string("entity_picture")',
        "ctx->camera_refresh_pending",
        "image_card_handle_picture(ctx, picture)",
        "IMAGE_CARD_MIN_REPEAT_REFRESH_MS",
        "ctx->image->request_update_url(ctx->url, max_source_dim)",
        "image_card_modal_active_for(ctx)",
    )
    if any(token not in image_text for token in camera_refresh_contract):
        errors.append(
            "components/espdesktop/button_grid_image.h: keep the Home Assistant camera "
            "refresh action visible-only, camera-only, serialized, and throttled"
        )
    if (
        "action: refresh_camera_cards" not in p4_text
        or "refresh_visible_camera_cards();" not in p4_text
        or "display.current_mode_is(espdesktop::DisplayMode::ACTIVE)" not in p4_text
        or "display.current_mode_is(espdesktop::DisplayMode::DIMMED)" not in p4_text
        or "display.target_mode_is(espdesktop::DisplayMode::ACTIVE)" not in p4_text
        or "display.target_mode_is(espdesktop::DisplayMode::DIMMED)" not in p4_text
        or "if (!page_visible) return;" not in p4_text
    ):
        errors.append(
            "common/device/image_cards_6.yaml: expose the camera refresh action on P4 profiles "
            "and keep it disabled behind full-screen display modes"
        )
    if "refresh_camera_cards" in s3_text or "refresh_visible_camera_cards" in s3_text:
        errors.append(
            "common/device/image_cards_2.yaml: keep the unsupported S3 camera refresh action disabled"
        )

    manifest_path = root / "devices" / "manifest.json"
    if not manifest_path.exists():
        errors.append("devices/manifest.json: declare the MCU family for each device profile")
        return errors
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        errors.append("devices/manifest.json: parse device MCU families")
        return errors
    profiles = manifest.get("devices")
    if not isinstance(profiles, dict):
        errors.append("devices/manifest.json: declare device profiles with MCU families")
        return errors

    package_by_mcu = {
        "ESP32-S3": "image_cards_2.yaml",
        "ESP32-P4": "image_cards_6.yaml",
    }
    for package_path in sorted((root / "devices").glob("*/packages.yaml")):
        slug = package_path.parent.name
        package_text = package_path.read_text(encoding="utf-8")
        profile = profiles.get(slug)
        firmware = profile.get("firmware") if isinstance(profile, dict) else None
        build = firmware.get("build") if isinstance(firmware, dict) else None
        mcu = build.get("chip") if isinstance(build, dict) else None
        expected = package_by_mcu.get(mcu) if isinstance(mcu, str) else None
        if expected is None:
            errors.append(
                f"{package_path.relative_to(root)}: declare a supported MCU family "
                "in devices/manifest.json"
            )
            continue

        include_match = re.search(
            r"(?m)^[ \t]*image_cards:[ \t]*!include[ \t]+"
            r"../../common/device/(image_cards(?:_\d+)?\.yaml)[ \t]*$",
            package_text,
        )
        included = include_match.group(1) if include_match else None
        if included != expected:
            errors.append(
                f"{package_path.relative_to(root)}: include {expected} for the "
                f"manifest's {mcu} MCU"
            )
    return errors


def firmware_artwork_image_auth_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    if "HTTP_AUTH_TYPE_BASIC" in text:
        errors.append(
            f"{rel}: keep local Home Assistant image proxy requests off HTTP Basic auth"
        )
    if "config.auth_type = HTTP_AUTH_TYPE_NONE;" not in text:
        errors.append(f"{rel}: explicitly disable HTTP auth for local artwork requests")
    if (
        'container->status_code <= 0 && is_ha_media_proxy_url(url)' not in text
        or "trying artwork bytes anyway" not in text
        or "container->status_code = HTTP_CODE_OK;" not in text
    ):
        errors.append(f"{rel}: allow Home Assistant media proxy artwork to fall back to image-byte detection")
    if "download_buffer_.shrink_to(0)" not in text:
        errors.append(f"{rel}: fully release artwork download buffers after image requests")
    return errors


def firmware_screensaver_wake_guard_errors(
    backlight_path: Path,
    screen_clock_path: Path,
    root: Path,
) -> list[str]:
    errors: list[str] = []
    if backlight_path.exists():
        rel = backlight_path.relative_to(root)
        text = backlight_path.read_text(encoding="utf-8")
        body = yaml_script_body(text, "screensaver_wake")
        if body is None:
            errors.append(f"{rel}: missing screensaver_wake script")
        else:
            interrupted_transition_tokens = (
                "controller.has_transition_in_progress()",
                "controller.cancel_transition()",
                "controller.require_presentation_cleanup()",
                "script.stop: display_mode_apply_transition",
                "script.stop: display_mode_effect_active",
                "script.stop: display_mode_effect_setup_dimmed",
                "script.stop: display_mode_effect_off",
                "lv_obj_has_flag(id(clock_screensaver), LV_OBJ_FLAG_HIDDEN)",
            )
            if any(token not in body for token in interrupted_transition_tokens):
                errors.append(
                    f"{rel}: cancel interrupted display effects and force visible clock cleanup during wake"
                )
            pending_restore_tokens = (
                "id: screensaver_wake_restore_pending",
                "id(screensaver_wake_restore_pending) =",
                "!id(espdesktop_app).display().target_mode_is(",
                "const bool restore_pending = id(screensaver_wake_restore_pending);",
                "id(screensaver_wake_restore_pending) = false;",
                "return restore_pending ||",
            )
            if any(token not in text for token in pending_restore_tokens):
                errors.append(f"{rel}: restore ACTIVE when touch cancels a pending sleep transition")
            marker = "const bool restore_pending = id(screensaver_wake_restore_pending);"
            if marker not in body:
                errors.append(f"{rel}: keep the normal screensaver wake branch explicit")
            else:
                normal_wake_body = body.split(marker, 1)[1]
                if re.search(
                    r"id:\s*screensaver_wake_touch_guard_active\s*\n\s*value:\s*'true'",
                    normal_wake_body,
                ):
                    errors.append(f"{rel}: do not block the first button tap after normal screensaver wake")
                if "script.execute: screensaver_wake_touch_guard_clear" in normal_wake_body:
                    errors.append(f"{rel}: do not arm a delayed wake guard clear for normal screensaver wake")
                if "id(screensaver_wake_touch_guard_skip_once) = false" not in normal_wake_body:
                    errors.append(f"{rel}: consume stale wake guard state during screensaver wake")
                if not re.search(
                    r"id:\s*screensaver_wake_touch_guard_active\s*\n\s*value:\s*'false'",
                    normal_wake_body,
                ):
                    errors.append(f"{rel}: clear stale wake guard state during normal screensaver wake")
                if "bool keep_wake_guard = id(screensaver_wake_touch_guard_skip_once);" not in normal_wake_body:
                    errors.append(f"{rel}: preserve the shared wake guard while screensaver state is restored")

            clear_marker = (
                "id(espdesktop_app).display().clear("
                "espdesktop::DisplayRequestSource::IDLE_TIMER);"
            )
            clear_index = body.find(clear_marker)
            guard_execute_index = body.find("script.execute: screensaver_wake_touch_block")
            pre_clear_body = body[:clear_index] if clear_index >= 0 else ""
            if (
                "id(screensaver_wake_touch_guard_skip_once) =" not in pre_clear_body
                or "espdesktop::DisplayMode::DISPLAY_OFF" not in pre_clear_body
            ):
                errors.append(
                    f"{rel}: arm the shared wake guard from the pre-wake Display Off mode"
                )
            if (
                clear_index < 0
                or guard_execute_index < 0
                or guard_execute_index > clear_index
            ):
                errors.append(f"{rel}: raise the shared wake guard before clearing screensaver state")

        guard_body = yaml_script_body(text, "screensaver_wake_touch_block")
        if guard_body is None:
            errors.append(f"{rel}: missing shared screensaver_wake_touch_block script")
        else:
            if not re.search(
                r"id:\s*screensaver_wake_touch_guard_active\s*\n\s*value:\s*'true'",
                guard_body,
            ):
                errors.append(f"{rel}: keep screensaver wake taps guarded")
            if "LV_INDEV_STATE_PRESSED" not in guard_body:
                errors.append(f"{rel}: keep the shared wake guard until the wake touch is released")
            if "timeout: 2s" not in guard_body:
                errors.append(f"{rel}: clear the shared wake guard after a stuck touch timeout")
            if "delay: 50ms" not in guard_body:
                errors.append(f"{rel}: retain a short shared wake guard while touch input settles")
            if "screensaver_fill_screen(id(screensaver_wake_touch_guard))" not in guard_body:
                errors.append(f"{rel}: resize the shared wake guard for every display layout")
            if "lv_obj_move_foreground(id(screensaver_wake_touch_guard))" not in guard_body:
                errors.append(f"{rel}: raise the shared wake guard above active controls")
            if "lvgl.widget.show: screensaver_wake_touch_guard" not in guard_body:
                errors.append(f"{rel}: show the shared full-screen wake guard")
            if not re.search(
                r"id:\s*screensaver_wake_touch_guard_active\s*\n\s*value:\s*'false'",
                guard_body,
            ):
                errors.append(f"{rel}: accept the first deliberate tap after wake-touch release")
            if "lvgl.widget.hide: screensaver_wake_touch_guard" not in guard_body:
                errors.append(f"{rel}: hide the shared wake guard after touch release")

    if screen_clock_path.exists():
        rel = screen_clock_path.relative_to(root)
        text = screen_clock_path.read_text(encoding="utf-8")
        widget_marker = "id: screensaver_wake_touch_guard"
        widget_index = text.find(widget_marker)
        widget_body = text[widget_index:] if widget_index >= 0 else ""
        if widget_index < 0:
            errors.append(f"{rel}: define the shared screensaver wake touch guard")
        elif not all(
            token in widget_body
            for token in ("width: 100%", "height: 100%", "clickable: true", "hidden: true")
        ):
            errors.append(f"{rel}: keep the shared wake guard full-screen, clickable, and hidden by default")

    return errors


def firmware_screen_wake_button_errors(backlight_path: Path, root: Path) -> list[str]:
    if not backlight_path.exists():
        return []

    rel = backlight_path.relative_to(root)
    text = backlight_path.read_text(encoding="utf-8")
    errors: list[str] = []
    match = re.search(
        r'(?ms)^button:\s*\n(?P<section>.*?)(?=^[a-zA-Z_][\w-]*:\s*(?:#.*)?$|\Z)',
        text,
    )
    button_block: str | None = None
    if match:
        for item in re.finditer(
            r'(?ms)^  - platform:\s*template\s*\n(?P<body>.*?)(?=^  - platform:|\Z)',
            match.group("section"),
        ):
            candidate = item.group(0)
            if re.search(r'^\s+name:\s*["\']?\$\{entity_screen_wake\}["\']?\s*$', candidate, re.MULTILINE):
                button_block = candidate
                break

    if button_block is None:
        return [f"{rel}: expose Screen: Wake as a template button"]

    if re.search(r'^\s+internal:\s*true\s*$', button_block, re.MULTILINE):
        errors.append(f"{rel}: keep Screen: Wake exposed to Home Assistant")
    if re.search(r'^\s+disabled_by_default:\s*true\s*$', button_block, re.MULTILINE):
        errors.append(f"{rel}: enable Screen: Wake by default")
    if re.search(r'^\s+entity_category:', button_block, re.MULTILINE):
        errors.append(f"{rel}: keep Screen: Wake operational rather than a configuration entity")
    if not re.search(r'^\s+icon:\s*["\']?mdi:monitor-shimmer["\']?\s*$', button_block, re.MULTILINE):
        errors.append(f"{rel}: use mdi:monitor-shimmer for Screen: Wake")

    required_sequence = (
        "      - script.execute: screensaver_wake"
    )
    if "on_press:" not in button_block or required_sequence not in button_block:
        errors.append(f"{rel}: run the complete touch-equivalent Screen: Wake sequence")
    return errors


def firmware_display_backlight_manual_sleep_errors(
    backlight_path: Path,
    device_paths: tuple[Path, ...],
    root: Path,
) -> list[str]:
    errors: list[str] = []
    if not backlight_path.exists():
        return errors

    backlight_rel = backlight_path.relative_to(root)
    backlight_text = backlight_path.read_text(encoding="utf-8")
    handler_body = yaml_script_body(backlight_text, "display_backlight_handle_off")
    if handler_body is None:
        errors.append(f"{backlight_rel}: missing shared display_backlight_handle_off script")
    else:
        if (
            "!id(espdesktop_app).display().target_mode_is(" not in handler_body
            or "espdesktop::DisplayMode::DISPLAY_OFF" not in handler_body
        ):
            errors.append(
                f"{backlight_rel}: ignore only controller-owned DISPLAY_OFF backlight events"
            )
        if "script.execute: screen_schedule_manual_sleep" not in handler_body:
            errors.append(
                f"{backlight_rel}: route visible display modes into persistent manual sleep"
            )
        if "espdesktop::DisplayMode::ACTIVE" in handler_body:
            errors.append(
                f"{backlight_rel}: do not limit Home Assistant manual sleep to ACTIVE mode"
            )

    for path in device_paths:
        if not path.exists():
            continue
        rel = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        light_match = re.search(
            r"(?ms)^light:\s*\n(?P<section>.*?)(?=^[a-zA-Z_][\w-]*:\s*(?:#.*)?$|\Z)",
            text,
        )
        backlight_block: str | None = None
        if light_match:
            for item in re.finditer(
                r"(?ms)^  - platform:\s*[^\n]+\n(?P<body>.*?)(?=^  - platform:|\Z)",
                light_match.group("section"),
            ):
                candidate = item.group(0)
                if re.search(
                    r"^\s+id:\s*display_backlight\s*$", candidate, re.MULTILINE
                ):
                    backlight_block = candidate
                    break

        if backlight_block is None:
            errors.append(f"{rel}: missing display_backlight light definition")
            continue

        off_match = re.search(
            r"(?ms)^    on_turn_off:\s*\n(?P<body>.*?)(?=^    [a-zA-Z_][\w-]*:\s*|\Z)",
            backlight_block,
        )
        if off_match is None:
            errors.append(f"{rel}: route Display Backlight OFF into manual sleep")
            continue

        off_body = off_match.group("body")
        handler_index = off_body.find("script.execute: display_backlight_handle_off")
        if handler_index == -1:
            errors.append(
                f"{rel}: route Display Backlight OFF through display_backlight_handle_off"
            )
        if "espdesktop::DisplayMode::ACTIVE" in off_body:
            errors.append(f"{rel}: do not gate manual sleep on ACTIVE display mode")
        if "script.execute: screen_schedule_manual_sleep" in off_body:
            errors.append(f"{rel}: use the shared display backlight OFF handler")

        slug = rel.parts[1] if len(rel.parts) > 1 else ""
        if slug in DISPLAY_TAKEOVER_BACKLIGHT_DEVICE_SLUGS:
            interactive_index = off_body.find("DisplayTakeoverKind::INTERACTIVE")
            critical_index = off_body.find("DisplayTakeoverKind::CRITICAL")
            restore_index = off_body.find("script.execute: backlight_apply_brightness")
            else_index = off_body.find("            else:", restore_index)
            if not (
                interactive_index != -1
                and critical_index > interactive_index
                and restore_index > critical_index
                and else_index > restore_index
                and handler_index > else_index
            ):
                errors.append(
                    f"{rel}: preserve display takeover recovery before manual sleep handling"
                )

    return errors


def firmware_display_backlight_mode_restore_errors(
    schedule_path: Path,
    root: Path,
) -> list[str]:
    errors: list[str] = []
    if not schedule_path.exists():
        return errors

    rel = schedule_path.relative_to(root)
    text = schedule_path.read_text(encoding="utf-8")
    handler_body = yaml_script_body(text, "display_backlight_handle_state")
    if handler_body is None:
        errors.append(f"{rel}: missing shared display_backlight_handle_state script")
        return errors

    setup_guard = "!App.is_setup_complete()"
    mode_guard = "!id(brightness_mode_runtime_ready)"
    marker_clear = "id(backlight_expected_internal_level_valid) = false;"
    state_read = "id(display_backlight).remote_values.is_on()"
    guard_index = handler_body.find(setup_guard)
    mode_index = handler_body.find(mode_guard)
    state_index = handler_body.find(state_read)
    if (
        guard_index == -1
        or mode_index == -1
        or marker_clear not in handler_body
        or state_index == -1
        or guard_index > state_index
        or mode_index > state_index
    ):
        errors.append(
            f"{rel}: ignore restored Display Backlight state until startup and brightness mode setup complete"
        )
    return errors


def firmware_clock_bar_pending_wake_errors(display_path: Path, root: Path) -> list[str]:
    if not display_path.exists():
        return []
    rel = display_path.relative_to(root)
    text = display_path.read_text(encoding="utf-8")
    body = yaml_script_body(text, "clock_bar_apply")
    if body is None:
        return [f"{rel}: missing clock_bar_apply script"]
    if "id(espdesktop_app).display().target_mode()" not in body:
        return [f"{rel}: resolve clock bar visibility from the pending display target"]
    return []


def firmware_clock_bar_navigation_errors(
    connectivity_paths: tuple[Path, ...], root: Path
) -> list[str]:
    errors: list[str] = []
    for path in connectivity_paths:
        if not path.exists():
            continue
        rel = path.relative_to(root)
        body = yaml_script_body(path.read_text(encoding="utf-8"), "navigate_after_api")
        if body is None:
            errors.append(f"{rel}: missing navigate_after_api script")
            continue
        active_guard = body.find("target_mode_is(")
        active_mode = body.find("DisplayMode::ACTIVE", active_guard)
        page_show = body.find("lvgl.page.show: main_page")
        if (
            active_guard == -1
            or active_mode == -1
            or page_show == -1
            or active_guard > page_show
        ):
            errors.append(
                f"{rel}: guard late home-page navigation behind the active display mode"
            )
    return errors


def firmware_display_active_finalization_errors(
    backlight_path: Path,
    schedule_path: Path,
    connectivity_paths: tuple[Path, ...],
    root: Path,
) -> list[str]:
    errors: list[str] = []

    backlight_rel = backlight_path.relative_to(root)
    backlight_text = backlight_path.read_text(encoding="utf-8")
    finalize_body = yaml_script_body(backlight_text, "display_active_finalize")
    if finalize_body is None:
        errors.append(f"{backlight_rel}: missing shared active-display finalizer")
    else:
        ordered_tokens = (
            "delay: 50ms",
            "espdesktop::DisplayMode::ACTIVE",
            "lv_scr_act() == id(main_page)->obj",
            "script.execute: clock_bar_apply",
            "script.wait: clock_bar_apply",
            "script.execute: backlight_apply_brightness",
            "script.wait: backlight_apply_brightness",
            "script.execute: screensaver_idle_check",
        )
        indexes = [finalize_body.find(token) for token in ordered_tokens]
        if any(index == -1 for index in indexes) or indexes != sorted(indexes):
            errors.append(
                f"{backlight_rel}: finalize active display after page settle with clock bar, "
                "configured brightness, and the screensaver timer"
            )

    schedule_rel = schedule_path.relative_to(root)
    schedule_text = schedule_path.read_text(encoding="utf-8")
    wake_body = yaml_script_body(schedule_text, "screen_schedule_wake")
    if wake_body is None:
        errors.append(f"{schedule_rel}: missing screen_schedule_wake script")
    else:
        reconcile_index = wake_body.find("script.execute: display_mode_reconcile")
        transition_index = wake_body.find("script.wait: display_mode_apply_transition")
        finalize_index = wake_body.find("script.execute: display_active_finalize")
        if not (0 <= reconcile_index < transition_index < finalize_index):
            errors.append(
                f"{schedule_rel}: wait for scheduled wake transition before finalizing the active display"
            )
        if "espdesktop::DisplayRequestSource::MANUAL_SLEEP" in wake_body:
            errors.append(
                f"{schedule_rel}: preserve manual sleep across automatic scheduled wake"
            )

    transition_body = yaml_script_body(backlight_text, "display_mode_apply_transition") or ""
    completion_index = transition_body.find("complete_transition(")
    finalize_index = transition_body.find("script.execute: display_active_finalize")
    if not (0 <= completion_index < finalize_index):
        errors.append(
            f"{backlight_rel}: finalize every completed active transition in the shared adapter"
        )

    for connectivity_path in connectivity_paths:
        if not connectivity_path.exists():
            continue
        connectivity_rel = connectivity_path.relative_to(root)
        navigation_body = yaml_script_body(
            connectivity_path.read_text(encoding="utf-8"), "navigate_after_api"
        )
        if navigation_body is None:
            continue
        page_index = navigation_body.find("lvgl.page.show: main_page")
        finalize_index = navigation_body.find("script.execute: display_active_finalize")
        if not (0 <= page_index < finalize_index):
            errors.append(
                f"{connectivity_rel}: finalize brightness, clock bar, and the screensaver timer after main-page navigation"
            )

    return errors


def firmware_clock_screensaver_overlay_errors(backlight_path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    if not backlight_path.exists():
        return errors

    rel = backlight_path.relative_to(root)
    text = backlight_path.read_text(encoding="utf-8")
    sleep_body = yaml_script_body(text, "screensaver_sleep_timer")
    adapter_body = yaml_script_body(text, "display_mode_apply_transition")
    show_body = yaml_script_body(text, "show_clock_view")
    keep_on_top_body = yaml_script_body(text, "clock_screensaver_keep_on_top")

    if sleep_body is None:
        errors.append(f"{rel}: missing screensaver_sleep_timer script")
    else:
        activation_markers = (
            "script.execute: show_clock_view",
            "espdesktop::DisplayMode::CLOCK",
        )
        activation_indexes = [
            sleep_body.find(marker) for marker in activation_markers
            if sleep_body.find(marker) != -1
        ]
        show_index = min(activation_indexes) if activation_indexes else -1
        if show_index == -1:
            errors.append(f"{rel}: keep clock screensaver activation explicit")
        else:
            pre_clock_show = sleep_body[:show_index]
            cleanup_tokens = (
                "media_volume_hide_modal();",
                "climate_control_hide_modal();",
                "option_select_hide_modal();",
                "switch_confirmation_hide_modal();",
                "alarm_pin_hide_modal();",
                "network_status_hide_modal();",
                "script.execute: hide_cover_art_view",
            )
            if any(token in pre_clock_show for token in cleanup_tokens):
                errors.append(f"{rel}: let the clock screensaver overlay the existing UI without closing it")

        if "espdesktop::DisplayMode::CLOCK" in sleep_body and (
            adapter_body is None or "id: show_clock_view" not in adapter_body
        ):
            errors.append(f"{rel}: route controller clock decisions through show_clock_view")

    if show_body is None:
        errors.append(f"{rel}: missing show_clock_view script")
    elif (
        "hide_clock_bar_top_layer_widgets(" not in show_body
        or "lv_obj_clear_flag(id(clock_screensaver), LV_OBJ_FLAG_HIDDEN);" not in show_body
        or "lv_obj_move_foreground(id(clock_screensaver));" not in show_body
    ):
        errors.append(f"{rel}: raise the clock screensaver above existing top-layer UI")

    if keep_on_top_body is None:
        errors.append(f"{rel}: missing clock screensaver keep-on-top script")
    else:
        required_keep_on_top_tokens = (
            "current_mode_is(",
            "hide_clock_bar_top_layer_widgets(",
            "refresh_screensaver_fullscreen(id(clock_screensaver), id(dim_screensaver_touch_guard));",
            "lv_obj_move_foreground(id(clock_screensaver));",
        )
        if any(token not in keep_on_top_body for token in required_keep_on_top_tokens):
            errors.append(f"{rel}: keep hiding clock-bar widgets and re-raising the active clock screensaver above overlays")
        if "lv_obj_clear_flag(id(clock_screensaver), LV_OBJ_FLAG_HIDDEN)" in keep_on_top_body:
            errors.append(
                f"{rel}: do not un-hide the clock screensaver in keep-on-top; "
                "show_clock_view owns widget visibility to avoid premature display during the fade"
            )

    if (
        "interval: 1s" not in text
        or "script.execute: clock_screensaver_keep_on_top" not in text.split("interval:", 1)[-1]
    ):
        errors.append(f"{rel}: keep the active clock screensaver above overlays after it starts")

    dimmed_body = yaml_script_body(text, "show_dimmed_view")
    if dimmed_body is None:
        errors.append(f"{rel}: missing show_dimmed_view script")
    else:
        if "lv_obj_move_foreground(id(dim_screensaver_touch_guard))" not in dimmed_body:
            errors.append(f"{rel}: raise the dim screensaver touch guard above any existing top-layer elements")
        if "script.execute: clock_bar_hide" in dimmed_body or "script.wait: clock_bar_hide" in dimmed_body:
            errors.append(f"{rel}: keep the complete clock bar visible over the dimmed home screen")
        if "script.execute: clock_bar_apply" not in dimmed_body:
            errors.append(f"{rel}: reapply the clock bar after raising the dim screensaver touch guard")

    return errors


def firmware_screen_schedule_screensaver_override_errors(backlight_path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    if not backlight_path.exists():
        return errors

    rel = backlight_path.relative_to(root)
    text = backlight_path.read_text(encoding="utf-8")

    idle_body = yaml_script_body(text, "screensaver_idle_check")
    if idle_body is None:
        errors.append(f"{rel}: missing screensaver_idle_check script")
    else:
        night_index = idle_body.find("screen_schedule_night_active(")
        mode_index = idle_body.find("return id(screensaver_mode).state")
        schedule_index = idle_body.find("id(screen_schedule_check).execute();", night_index)
        if night_index == -1 or schedule_index == -1 or (
            mode_index != -1 and schedule_index > mode_index
        ):
            errors.append(f"{rel}: let the night screen schedule override timer screensaver actions")

    schedule_off_body = yaml_script_body(text, "backlight_schedule_display_off")
    reconcile_body = yaml_script_body(text, "display_mode_reconcile")
    schedule_path = backlight_path.with_name("backlight_schedule.yaml")
    if schedule_path.exists():
        schedule_rel = schedule_path.relative_to(root)
        schedule_text = schedule_path.read_text(encoding="utf-8")
        brightness_body = yaml_script_body(schedule_text, "backlight_apply_brightness")
        if brightness_body is not None:
            active_target = brightness_body.find(
                "target_mode_is(\n                espdesktop::DisplayMode::ACTIVE)"
            )
            if active_target == -1:
                errors.append(
                    f"{schedule_rel}: apply brightness from the pending active display target during wake transitions"
                )

            schedule_source = brightness_body.find(
                "DisplayRequestSource::SCREEN_SCHEDULE"
            )
            schedule_off = brightness_body.find(
                "target_mode_is(\n                  espdesktop::DisplayMode::DISPLAY_OFF)",
                schedule_source,
            )
            force_off = brightness_body.find(
                "id(backlight_force_display_off).execute();", schedule_off
            )
            always_on = brightness_body.find("id(schedule_mode_always_on)")
            if not (
                schedule_source != -1
                and schedule_off != -1
                and force_off != -1
                and always_on != -1
            ):
                errors.append(
                    f"{schedule_rel}: only blank display-off schedules so Always On can apply its configured brightness"
                )
        migrated_live_schedule = (
            reconcile_body is not None
            and "schedule_was_active" in reconcile_body
            and "DisplayRequestSource::BOOT_GUARD" in reconcile_body
            and "DisplayRequestSource::SCREEN_SCHEDULE" in reconcile_body
        )
        if migrated_live_schedule:
            boot_guard_index = schedule_text.find("script.execute: screen_schedule_boot_guard")
            boot_guard_prefix = schedule_text[:boot_guard_index] if boot_guard_index != -1 else ""
            if (
                "priority: -190" not in boot_guard_prefix
                or "screen_schedule_waiting_for_time(" not in boot_guard_prefix
                or "screen_schedule_night_active(" not in boot_guard_prefix
                or "script.execute: screen_schedule_boot_guard" not in schedule_text
            ):
                errors.append(
                    f"{schedule_rel}: publish the live fail-dark schedule before the loading screen can light the panel"
                )

            if brightness_body is None or (
                "const bool onboarding" not in brightness_body
                or "DisplayRequestSource::ONBOARDING" not in brightness_body
                or "if (!onboarding && screen_schedule_waiting_for_time(" not in brightness_body
                or "if (onboarding) {" not in brightness_body
                or "pct = 90;" not in brightness_body
            ):
                errors.append(
                    f"{schedule_rel}: keep onboarding visible at full setup brightness despite restored schedule policy"
                )
            if (
                "return !id(espdesktop_app).display().target_source_is(\n"
                "                         espdesktop::DisplayRequestSource::ONBOARDING)" not in schedule_text
            ):
                errors.append(
                    f"{schedule_rel}: bypass the periodic fail-dark check while onboarding owns the display"
                )

            loading_path = backlight_path.parent.parent / "device" / "screen_loading.yaml"
            if loading_path.exists():
                loading_rel = loading_path.relative_to(root)
                loading_text = loading_path.read_text(encoding="utf-8")
                setup_index = loading_text.find("id: connectivity_setup_display_active")
                setup_true_index = loading_text.find("value: 'true'", setup_index)
                reconcile_index = loading_text.find("script.execute: display_mode_reconcile", setup_true_index)
                if not (0 <= setup_index < setup_true_index < reconcile_index):
                    errors.append(
                        f"{loading_rel}: bypass the boot guard before showing WiFi setup"
                    )
                if "script.execute: wifi_show_hotspot_setup" in loading_text:
                    errors.append(
                        f"{loading_rel}: keep the visible first-boot WiFi instructions active until setup connects"
                    )
                if (
                    'text: $icon_wifi_startup' not in loading_text
                    or 'lv_label_set_text(id(loading_status_icon), "${icon_wifi_startup}");'
                    not in loading_text
                ):
                    errors.append(
                        f"{loading_rel}: keep the standard mdi-wifi icon on the first-boot setup screen"
                    )
                for setup_text_path in (
                    loading_path,
                    root / "common" / "device" / "screen_wifi_setup.yaml",
                    root / "common" / "addon" / "connectivity.yaml",
                ):
                    setup_copy = setup_text_path.read_text(encoding="utf-8")
                    if (
                        r'''hotspot_ssid + "'\n" +''' in setup_copy
                        or r'''hotspot_ssid + "' " +''' not in setup_copy
                    ):
                        errors.append(
                            f"{setup_text_path.relative_to(root)}: let WiFi setup instructions wrap to the screen width"
                        )
                if reconcile_body is None or (
                    "id(connectivity_setup_display_active)" not in reconcile_body
                    or "id(button_order).state.empty()" not in reconcile_body
                    or "setup_page_active" not in reconcile_body
                    or "(id(button_order).state.empty() && setup_page_active)" not in reconcile_body
                    or "lv_scr_act() == id(loading_page)->obj" in reconcile_body
                    or "!onboarding" not in reconcile_body
                    or "DisplayRequestSource::ONBOARDING" not in reconcile_body
                    or "controller.clear(espdesktop::DisplayRequestSource::SETUP_TIMEOUT)" not in reconcile_body
                ):
                    errors.append(
                        f"{rel}: keep first-time onboarding fully visible over dimming, boot guard, and scheduled night requests"
                    )

                button_order_path = root / "common" / "config" / "button_order.yaml"
                if button_order_path.exists():
                    button_order_text = button_order_path.read_text(encoding="utf-8")
                    if (
                        "lv_scr_act() == id(button_setup_page)->obj" not in button_order_text
                        or """            then:
              - delay: 750ms
              - script.execute: refresh_button_grid
              - script.wait: refresh_button_grid
              - script.execute: navigate_after_api
              - script.wait: navigate_after_api
              - script.execute: display_mode_reconcile
            else:
              - script.execute: display_mode_reconcile
""" not in button_order_text
                    ):
                        errors.append(
                            f"{button_order_path.relative_to(root)}: keep onboarding active until the first configured grid is visible"
                        )
        sleep_body = yaml_script_body(schedule_text, "screen_schedule_sleep")
        if sleep_body is None:
            errors.append(f"{schedule_rel}: missing screen_schedule_sleep script")
        else:
            asleep_index = sleep_body.find("id: screen_schedule_asleep")
            asleep_true_index = sleep_body.find("value: 'true'", asleep_index)
            request_index = sleep_body.find("DisplayRequestSource::SCREEN_SCHEDULE")
            reconcile_index = sleep_body.find("script.execute: display_mode_reconcile")
            controller_reconciles_live_schedule = (
                "screen_schedule_night_active(" in text
                and "controller.request(espdesktop::DisplayRequestSource::SCREEN_SCHEDULE" in text
                and "schedule_was_active" in text
                and "controller.clear(espdesktop::DisplayRequestSource::IDLE_TIMER)" in text
                and "controller.clear(espdesktop::DisplayRequestSource::PRESENCE_SENSOR)" in text
                and "restore_value: true" not in text[text.find("id: screen_schedule_asleep"):text.find("id: backlight_manual_off")]
                and "id: screen_schedule_asleep" not in sleep_body
                and reconcile_index != -1
            )
            if not controller_reconciles_live_schedule and not (
                0 <= asleep_index <= asleep_true_index < request_index < reconcile_index
            ):
                errors.append(
                    f"{schedule_rel}: set the schedule-asleep marker before reconciling display-off"
                )

    presence_update_body = yaml_script_body(text, "screensaver_presence_update")
    wake_body = yaml_script_body(text, "screensaver_presence_wake")
    if wake_body is not None:
        if (
            presence_update_body is not None
            and "script.execute: screensaver_presence_update" in wake_body
        ):
            wake_body += presence_update_body
        typed_presence_wake = (
            "presence_can_wake_display(" in wake_body
            and "script.execute: screensaver_wake" in wake_body
        )
        controller_presence_wake = (
            not typed_presence_wake
            and "script.execute: display_mode_clear_automatic" in wake_body
            and "screen_schedule_night_active(" in text
            and "DisplayRequestSource::SCREEN_SCHEDULE" in text
        )
        if typed_presence_wake and "script.execute: display_mode_clear_automatic" not in wake_body:
            errors.append(
                f"{rel}: clear stale automatic sleep when presence leaves the visible mode unchanged"
            )
        if typed_presence_wake and "id(cover_art_screensaver_active)" in wake_body:
            errors.append(f"{rel}: leave active cover art unchanged on presence detection")
        if typed_presence_wake:
            reconcile_index = wake_body.find("script.execute: screen_schedule_check")
            sensor_guard_index = wake_body.find("screen_schedule_sensor_trigger(")
            wake_action_index = wake_body.find("script.execute: screensaver_wake")
            separate_schedule_sensor = "id(schedule_presence_detected)" in text
            if separate_schedule_sensor and (
                reconcile_index != -1 or sensor_guard_index != -1
            ):
                errors.append(
                    f"{rel}: keep the Screensaver sensor independent from the Night Schedule sensor"
                )
            elif not separate_schedule_sensor and not (
                0 <= reconcile_index < sensor_guard_index < wake_action_index
            ):
                errors.append(
                    f"{rel}: reconcile sensor-triggered night schedule before presence wake behavior"
                )
        if controller_presence_wake and (
            "target_mode_is(\n                          espdesktop::DisplayMode::COVER_ART)" not in wake_body
            or "script.execute: screensaver_wake" not in wake_body
        ):
            errors.append(f"{rel}: clear cover art when presence wakes the screensaver")
        wake_index = wake_body.find("script.execute: screensaver_wake")
        pre_wake_body = wake_body[:wake_index] if wake_index != -1 else wake_body
        required_tokens = (
            "screen_schedule_waiting_for_time(",
            "screen_schedule_night_active(",
            "id(screen_schedule_check).execute();",
        )
        if not typed_presence_wake and not controller_presence_wake and (
            wake_index == -1 or any(token not in pre_wake_body for token in required_tokens)
        ):
            errors.append(f"{rel}: let the night screen schedule override sensor screensaver wake")
        disabled_wake_index = pre_wake_body.rfind("if (!id(schedule_enabled).state) return true;")
        schedule_check_index = pre_wake_body.find("id(screen_schedule_check).execute();")
        if not typed_presence_wake and not controller_presence_wake and (disabled_wake_index == -1 or (
            schedule_check_index != -1 and disabled_wake_index < schedule_check_index
        )):
            errors.append(f"{rel}: let sensor screensaver wake when the screen schedule is disabled")

    presence_sleep_body = yaml_script_body(text, "screensaver_presence_sleep")
    if presence_sleep_body is not None:
        if (
            presence_update_body is not None
            and "script.execute: screensaver_presence_update" in presence_sleep_body
        ):
            presence_sleep_body += presence_update_body
        reconcile_index = presence_sleep_body.find("script.execute: screen_schedule_check")
        sensor_guard_index = presence_sleep_body.find("screen_schedule_sensor_trigger(")
        sleep_action_index = presence_sleep_body.find("script.execute: screensaver_sleep_sensor")
        separate_schedule_sensor = "id(schedule_presence_detected)" in text
        if separate_schedule_sensor and (
            reconcile_index != -1 or sensor_guard_index != -1
        ):
            errors.append(
                f"{rel}: keep the Screensaver sleep sensor independent from the Night Schedule sensor"
            )
        elif not separate_schedule_sensor and not (
            0 <= reconcile_index < sensor_guard_index < sleep_action_index
        ):
            errors.append(
                f"{rel}: reconcile sensor-triggered night schedule before presence sleep behavior"
            )

    return errors


def firmware_local_display_sensor_retirement_errors(
    backlight_path: Path, display_path: Path,
    grid_header_path: Path, sensor_paths: tuple[Path, ...], root: Path,
) -> list[str]:
    """Local display policies must not reconnect retired HA sensor bindings."""
    errors: list[str] = []
    for path in (backlight_path, display_path, grid_header_path,
                 backlight_path.with_name("backlight_schedule.yaml"), *sensor_paths):
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for marker in ("id(presence_detected)", "id(schedule_presence_detected)",
                       "id(media_player_playing)", "id: presence_sensor_entity",
                       "id: screen_schedule_sensor_entity", "grid_phase3(",
                       "screensaver_presence_wake", "screensaver_presence_sleep"):
            if marker in text:
                errors.append(f"{path.relative_to(root)}: remove retired display sensor binding {marker}")
    for path in sensor_paths:
        if "grid_refresh_local_header(" not in path.read_text(encoding="utf-8"):
            errors.append(f"{path.relative_to(root)}: preserve the shared local header registration")
    return errors


def firmware_s3_api_errors(
    device_path: Path,
    s3_packages_path: Path,
    core_infra_path: Path,
    api_navigate_path: Path,
    package_paths: tuple[Path, ...],
    root: Path,
) -> list[str]:
    if not device_path.exists():
        return []
    rel = device_path.relative_to(root)
    text = device_path.read_text(encoding="utf-8")
    errors: list[str] = []

    queue_match = re.search(r"(?m)^\s*max_send_queue:\s*(\d+)\s*$", text)
    if not queue_match:
        errors.append(f"{rel}: set an explicit S3 native API send queue")
    elif int(queue_match.group(1)) < 12:
        errors.append(f"{rel}: keep the S3 native API send queue high enough for HA reconnect bursts")
    connections_match = re.search(r"(?m)^\s*max_connections:\s*(\d+)\s*$", text)
    if not connections_match:
        errors.append(f"{rel}: set an explicit S3 native API connection pool")
    elif int(connections_match.group(1)) < 3:
        errors.append(f"{rel}: keep enough S3 native API slots for HA reconnects after OTA")
    if api_navigate_path.exists():
        api_rel = api_navigate_path.relative_to(root)
        api_text = api_navigate_path.read_text(encoding="utf-8")
        if "action: navigate" not in api_text:
            errors.append(f"{api_rel}: keep the Home Assistant navigate action in the dedicated API package")
    else:
        errors.append(f"{api_navigate_path.relative_to(root)}: missing dedicated Home Assistant navigate API package")

    if core_infra_path.exists():
        core_rel = core_infra_path.relative_to(root)
        core_text = core_infra_path.read_text(encoding="utf-8")
        if "action: navigate" in core_text:
            errors.append(f"{core_rel}: keep the navigate action out of core_infra so S3 can omit it")

    if s3_packages_path.exists():
        s3_rel = s3_packages_path.relative_to(root)
        s3_packages = s3_packages_path.read_text(encoding="utf-8")
        has_navigate_package = "api_navigate" in s3_packages or "api_navigate.yaml" in s3_packages
        if package_api_navigate_enabled(s3_packages_path, root) and not has_navigate_package:
            errors.append(f"{s3_rel}: include the Home Assistant navigate API action on S3")
        elif not package_api_navigate_enabled(s3_packages_path, root) and has_navigate_package:
            errors.append(f"{s3_rel}: omit the Home Assistant navigate API action when disabled")

    for package_path in package_paths:
        if package_path == s3_packages_path or not package_path.exists():
            continue
        if not package_api_navigate_enabled(package_path, root):
            continue
        package_rel = package_path.relative_to(root)
        package_text = package_path.read_text(encoding="utf-8")
        if "api_navigate" not in package_text or "api_navigate.yaml" not in package_text:
            errors.append(f"{package_rel}: include the dedicated Home Assistant navigate API package")
    return errors


def firmware_open_modal_api_errors(root: Path, package_paths: tuple[Path, ...]) -> list[str]:
    errors: list[str] = []
    api_path = root / "common/device/api_open_modal.yaml"
    scripts_path = root / "common/device/api_remote_actions.yaml"
    if not api_path.exists():
        return ["common/device/api_open_modal.yaml: missing entity modal API action"]
    if not scripts_path.exists():
        return ["common/device/api_remote_actions.yaml: missing shared remote action scripts"]
    api_text = api_path.read_text(encoding="utf-8")
    scripts_text = scripts_path.read_text(encoding="utf-8")
    modal_script_start = scripts_text.find("  - id: open_entity_modal")
    modal_script_end = scripts_text.find("  - id: open_remote_subpage", modal_script_start)
    modal_script = scripts_text[modal_script_start:modal_script_end if modal_script_end >= 0 else None]
    api_required = ("action: open_modal", "entity_id: string", "id: open_entity_modal")
    script_required = ("mode: restart", "espdesktop_can_prepare_modal(entity_id,",
                      "script.execute: screensaver_wake", "script.wait: screensaver_wake",
                      "espdesktop_open_modal(entity_id,", "script.execute: screensaver_idle_check")
    api_positions = [api_text.find(value) for value in api_required]
    script_positions = [modal_script.find(value) for value in script_required]
    if (modal_script_start < 0 or -1 in api_positions or api_positions != sorted(api_positions)
            or -1 in script_positions or script_positions != sorted(script_positions)
            or modal_script.count("grid_phase2_complete()") < 2):
        errors.append("common/device/api_open_modal.yaml: validate, wake, revalidate, open, then reset the screensaver timer")
    for path in package_paths:
        has_modal = package_api_open_modal_enabled(path, root)
        has_navigate = package_api_navigate_enabled(path, root)
        package_text = path.read_text(encoding="utf-8") if path.exists() else ""
        if not has_modal and "api_open_modal.yaml" in package_text:
            errors.append(f"{path.relative_to(root)}: omit the entity modal action when disabled")
        if not has_navigate and "api_navigate.yaml" in package_text:
            errors.append(f"{path.relative_to(root)}: omit the navigate action when disabled")
        has_remote_scripts = "api_remote_actions.yaml" in package_text
        if (has_modal or has_navigate) and not has_remote_scripts:
            errors.append(f"{path.relative_to(root)}: include shared remote scripts when either API action is enabled")
        if not (has_modal or has_navigate) and has_remote_scripts:
            errors.append(f"{path.relative_to(root)}: omit shared remote scripts when both API actions are disabled")
        if not has_modal:
            continue
        if "api_open_modal.yaml" not in package_text:
            errors.append(f"{path.relative_to(root)}: include the entity modal action on P4 and S3")
    return errors


def firmware_navigation_target_errors(
    firmware_dir: Path,
    api_navigate_path: Path,
    package_paths: tuple[Path, ...],
    root: Path,
) -> list[str]:
    errors: list[str] = []
    navigation_path = firmware_dir / "button_grid_navigation.h"
    navigation_driver_path = firmware_dir / "button_grid_navigation_driver.h"
    grid_path = firmware_dir / "button_grid_grid.h"

    if not navigation_path.exists():
        errors.append("components/espdesktop/button_grid_navigation.h: keep Home Assistant navigation targets available")
        return errors
    navigation_rel = navigation_path.relative_to(root)
    navigation_text = navigation_path.read_text(encoding="utf-8")
    if "NavigationHomeTargetEntry" not in navigation_text or "navigation_home_targets()" not in navigation_text:
        errors.append(f"{navigation_rel}: register general home-screen navigation targets")
    if "navigation_find_label_target" not in navigation_text or "navigation_home_targets()" not in navigation_text:
        errors.append(f"{navigation_rel}: resolve navigate labels against home-screen cards")
    if "entry.display_order < best->display_order" not in navigation_text:
        errors.append(f"{navigation_rel}: choose the first displayed card when labels are duplicated")
    if "navigation_find_slot_target" not in navigation_text or "entry.slot == slot" not in navigation_text:
        errors.append(f"{navigation_rel}: resolve slot:n against home-screen card slots")
    if "navigation_return_home(main_page_obj)" not in navigation_text or "handle_button_click(target->config, target->slot, target->button)" not in navigation_text:
        errors.append(f"{navigation_rel}: activate navigated home-screen cards through the normal tap handler")
    if "normalized == \"home\" || normalized == \"main\"" not in navigation_text:
        errors.append(f"{navigation_rel}: preserve home/main navigation targets")

    if not grid_path.exists():
        errors.append("components/espdesktop/button_grid_grid.h: register home-screen navigation targets during grid refresh")
    else:
        grid_rel = grid_path.relative_to(root)
        grid_text = grid_path.read_text(encoding="utf-8")
        if grid_text.count("navigation_clear_home_targets();") < 2:
            errors.append(f"{grid_rel}: refresh home-screen navigation targets when the displayed grid order changes")
        if "navigation_register_home_target(idx, pos, p.label, scfg, s.btn);" not in grid_text:
            errors.append(f"{grid_rel}: register every displayed home-screen card for Home Assistant navigation")
        if "navigation_register_home_target(idx, pos, p.label, s.config->state, s.btn);" not in grid_text:
            errors.append(f"{grid_rel}: refresh displayed home-screen card targets during layout-only updates")
    if not navigation_driver_path.exists():
        errors.append("components/espdesktop/button_grid_navigation_driver.h: preserve subpage navigation registration")
    else:
        navigation_driver_rel = navigation_driver_path.relative_to(root)
        navigation_driver_text = navigation_driver_path.read_text(encoding="utf-8")
        if (
            "navigation_driver_own_subpage(" not in navigation_driver_text
            or "navigation_register_subpage(" not in navigation_driver_text
        ):
            errors.append(f"{navigation_driver_rel}: preserve subpage navigation registration")

    if not api_navigate_path.exists():
        errors.append("common/device/api_navigate.yaml: route navigation targets through the navigate action")
    else:
        api_rel = api_navigate_path.relative_to(root)
        api_text = api_navigate_path.read_text(encoding="utf-8")
        shared_actions_path = root / "common/device/api_remote_actions.yaml"
        if shared_actions_path.exists():
            api_text += "\n" + shared_actions_path.read_text(encoding="utf-8")
        if "espdesktop_navigate(target, id(main_page)->obj);" not in api_text:
            errors.append(f"{api_rel}: route navigation targets through espdesktop_navigate")
    return errors


def firmware_connectivity_api_errors(paths: tuple[Path, ...], root: Path) -> list[str]:
    errors: list[str] = []
    for path in paths:
        if not path.exists():
            continue
        rel = path.relative_to(root)
        text = path.read_text(encoding="utf-8")
        if re.search(r"(?m)^\s*api\.connected:\s*$", text):
            errors.append(f"{rel}: wait for Home Assistant state subscription, not any API client")
        if "on_client_connected:" in text and "ha_api_state_connected()" not in text:
            errors.append(f"{rel}: only navigate after a Home Assistant state connection is ready")
        if "on_client_connected:" in text:
            errors.append(f"{rel}: keep API connection recovery centralised in core_infra.yaml")
        restore_body = yaml_script_body(text, "ha_restore_after_api")
        if restore_body is None:
            errors.append(f"{rel}: define the connector setup continuation script")
        elif (
            "connector_onboarding_complete()" not in restore_body
            or restore_body.count("script.execute: navigate_after_api") != 1
        ):
            errors.append(f"{rel}: continue setup only after at least one connector is configured")
        body = yaml_script_body(text, "ha_reconnect_flow")
        if body is not None or "Connecting to\\nHome Assistant" in text:
            errors.append(f"{rel}: keep the current display visible when Home Assistant disconnects")
    return errors


def firmware_connector_endpoint_auth_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return [f"{path.relative_to(root)}: define connector status endpoints"]
    text = path.read_text(encoding="utf-8")
    required = (
        "#ifdef USE_WEBSERVER_AUTH",
        "request->authenticate(service.web_auth_username(),",
        "request->requestAuthentication();",
    )
    if all(token in text for token in required):
        return []
    return [
        f"{path.relative_to(root)}: authenticate connector endpoints when web authentication is enabled"
    ]


def firmware_wifi_setup_display_text_errors(
    loading_path: Path,
    wifi_setup_path: Path,
    connectivity_path: Path,
    root: Path,
) -> list[str]:
    errors: list[str] = []
    expected_calls = (
        (
            loading_path,
            "lv_label_set_display_text(id(loading_status_label), msg.c_str());",
        ),
        (
            connectivity_path,
            "lv_label_set_display_text(id(wifi_setup_instructions), msg.c_str());",
        ),
        (
            wifi_setup_path,
            "lv_label_set_display_text(id(wifi_setup_instructions), msg.c_str());",
        ),
    )
    for path, expected_call in expected_calls:
        if not path.exists():
            continue
        if expected_call not in path.read_text(encoding="utf-8"):
            errors.append(
                f"{path.relative_to(root)}: normalize user-controlled WiFi setup names before display"
            )
    return errors


def firmware_ha_connection_screen_errors(core_infra_path: Path, root: Path) -> list[str]:
    if not core_infra_path.exists():
        return []
    rel = core_infra_path.relative_to(root)
    text = core_infra_path.read_text(encoding="utf-8")
    errors: list[str] = []
    if "ha_reconnect_flow" in text:
        errors.append(f"{rel}: do not start a display flow when Home Assistant disconnects")
    if "on_client_connected:" not in text or "id(ha_restore_after_api).execute();" not in text:
        errors.append(f"{rel}: continue initial setup when Home Assistant connects")
    if "- delay: 1s" not in text:
        errors.append(f"{rel}: yield before API connection recovery work")
    if "apply_registered_ha_control_availability" in text:
        errors.append(f"{rel}: do not dim registered cards when HA disconnects")
    return errors


def firmware_c6_update_status_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    if "UPDATE_STATE_UNKNOWN" not in text:
        errors.append(f"{rel}: keep the C6 update status unknown until ESPHome checks for updates")
    if (
        'name: "${entity_esp32_c6_auto_update}"' not in text
        or "id: c6_auto_update_switch" not in text
        or "restore_mode: RESTORE_DEFAULT_ON" not in text
    ):
        errors.append(f"{rel}: expose a persistent default-on C6 automatic update switch")
    automatic_script = re.search(
        r"(?ms)^script:\s*.*?id:\s*c6_check_and_install_update\b(?P<body>.*?)(?:^update:|\Z)",
        text,
    )
    if not automatic_script:
        errors.append(f"{rel}: define the C6 automatic check/install script")
    else:
        automatic_body = automatic_script.group("body")
        required_steps = (
            r"update\.check:\s*\n\s*id:\s*esp32_c6_update",
            r"wait_until:\s*\n\s*condition:\s*\n\s*update\.is_available:\s*esp32_c6_update"
            r"\s*\n\s*timeout:\s*30s",
            r"switch\.is_on:\s*c6_auto_update_switch",
            r"update\.is_available:\s*esp32_c6_update",
            r"update\.perform:\s*\n\s*id:\s*esp32_c6_update",
        )
        if any(not re.search(pattern, automatic_body) for pattern in required_steps):
            errors.append(
                f"{rel}: check C6 firmware before conditionally installing an available update"
            )
    if "on_update_available:" in text:
        errors.append(f"{rel}: do not rely on ESPHome's unfired C6 update-available trigger")
    if "update_interval: never" not in text:
        errors.append(f"{rel}: let EspDesktop own C6 update scheduling")
    if not re.search(
        r"(?ms)on_turn_on:.*?script\.execute:\s*c6_check_and_install_update", text
    ):
        errors.append(f"{rel}: check C6 firmware immediately when automatic updates are enabled")
    if not re.search(
        r"(?ms)^interval:\s*.*?interval:\s*24h.*?startup_delay:\s*1min"
        r".*?script\.execute:\s*c6_check_and_install_update",
        text,
    ):
        errors.append(f"{rel}: check C6 firmware one minute after boot and every 24 hours")
    if not re.search(
        r"(?ms)^wifi:\s*.*?on_connect:.*?millis\(\)\s*>=\s*60000"
        r".*?script\.wait:\s*c6_check_and_install_update"
        r".*?script\.execute:\s*c6_check_and_install_update",
        text,
    ):
        errors.append(
            f"{rel}: queue a C6 firmware retry after late or recovered WiFi"
        )
    latest_match = re.search(
        r"(?ms)id:\s*c6_update_latest_firmware\b(?P<body>.*?)(?:^button:|\Z)",
        text,
    )
    if not latest_match:
        errors.append(f"{rel}: define the C6 latest firmware sensor")
    else:
        latest_body = latest_match.group("body")
        if (
            "UPDATE_STATE_NO_UPDATE" not in latest_body
            or "upd->update_info.current_version" not in latest_body
        ):
            errors.append(f"{rel}: report the current C6 firmware as available when no update exists")
    return errors


def run_scan() -> int:
    errors = firmware_ha_binding_errors(FIRMWARE_DIR, ROOT)
    errors.extend(firmware_display_controller_ownership_errors(DISPLAY_LIFECYCLE_ROOTS, ROOT))
    errors.extend(firmware_ha_boundary_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_card_disabled_state_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_media_card_availability_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_time_reconnect_errors(TIME_ADDON_PATH, ROOT))
    errors.extend(firmware_ntp_startup_errors(TIME_ADDON_PATH, SUN_CALC_PATH, CONNECTIVITY_PATHS, ROOT))
    errors.extend(firmware_artwork_image_auth_errors(ARTWORK_IMAGE_PATH, ROOT))
    errors.extend(firmware_screensaver_wake_guard_errors(BACKLIGHT_PATH, SCREEN_CLOCK_PATH, ROOT))
    errors.extend(firmware_screen_wake_button_errors(BACKLIGHT_PATH, ROOT))
    errors.extend(
        firmware_display_backlight_manual_sleep_errors(
            BACKLIGHT_PATH, DEVICE_DEVICE_PATHS, ROOT
        )
    )
    errors.extend(
        firmware_display_backlight_mode_restore_errors(
            BACKLIGHT_SCHEDULE_PATH, ROOT
        )
    )
    errors.extend(firmware_clock_bar_pending_wake_errors(DISPLAY_CONFIG_PATH, ROOT))
    errors.extend(firmware_clock_bar_navigation_errors(CONNECTIVITY_PATHS, ROOT))
    errors.extend(
        firmware_display_active_finalization_errors(
            BACKLIGHT_PATH, BACKLIGHT_SCHEDULE_PATH, CONNECTIVITY_PATHS, ROOT
        )
    )
    errors.extend(firmware_clock_screensaver_overlay_errors(BACKLIGHT_PATH, ROOT))
    errors.extend(firmware_screen_schedule_screensaver_override_errors(BACKLIGHT_PATH, ROOT))
    errors.extend(firmware_local_display_sensor_retirement_errors(
        BACKLIGHT_PATH, DISPLAY_CONFIG_PATH, FIRMWARE_DIR / "button_grid_grid.h",
        DEVICE_SENSOR_PATHS, ROOT,
    ))
    errors.extend(firmware_connector_endpoint_auth_errors(CONNECTOR_STATE_PATH, ROOT))
    errors.extend(
        firmware_wifi_setup_display_text_errors(
            SCREEN_LOADING_PATH,
            SCREEN_WIFI_SETUP_PATH,
            CONNECTIVITY_PATHS[0],
            ROOT,
        )
    )
    errors.extend(firmware_c6_update_status_errors(C6_FIRMWARE_UPDATE_PATH, ROOT))
    if errors:
        print("Firmware Home Assistant binding check failed:")
        for error in errors:
            print(f"  {error}")
        return 1
    print("Firmware Home Assistant binding checks passed.")
    return 0


def expect_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        for filename, text in files.items():
            (firmware_dir / filename).write_text(text, encoding="utf-8")

        errors = firmware_ha_binding_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_ha_boundary_errors(name: str, files: dict[str, str], expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        for filename, text in files.items():
            (firmware_dir / filename).write_text(text, encoding="utf-8")

        errors = firmware_ha_boundary_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_unavailable_retry_errors(
    name: str,
    config_text: str,
    core_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        core_path = root / "common" / "device" / "core_infra.yaml"
        firmware_dir.mkdir(parents=True)
        core_path.parent.mkdir(parents=True)
        (firmware_dir / "button_grid_config.h").write_text(config_text, encoding="utf-8")
        core_path.write_text(core_text, encoding="utf-8")

        errors = firmware_unavailable_retry_errors(firmware_dir, core_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_media_card_availability_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_media.h").write_text(text, encoding="utf-8")

        errors = firmware_media_card_availability_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_time_reconnect_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        time_path = root / "common" / "addon" / "time.yaml"
        time_path.parent.mkdir(parents=True)
        time_path.write_text(text, encoding="utf-8")

        errors = firmware_time_reconnect_errors(time_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_ntp_startup_errors(
    name: str,
    time_text: str,
    sun_calc_text: str,
    connectivity_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        time_path = root / "common" / "addon" / "time.yaml"
        sun_calc_path = root / "components" / "espdesktop" / "sun_calc.h"
        connectivity_path = root / "common" / "addon" / "connectivity.yaml"
        time_path.parent.mkdir(parents=True, exist_ok=True)
        sun_calc_path.parent.mkdir(parents=True, exist_ok=True)
        connectivity_path.parent.mkdir(parents=True, exist_ok=True)
        time_path.write_text(time_text, encoding="utf-8")
        sun_calc_path.write_text(sun_calc_text, encoding="utf-8")
        connectivity_path.write_text(connectivity_text, encoding="utf-8")

        errors = firmware_ntp_startup_errors(
            time_path,
            sun_calc_path,
            (connectivity_path,),
            root,
        )
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_weather_request_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_weather_forecast.h").write_text(text, encoding="utf-8")

        errors = firmware_weather_request_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_weather_disconnect_errors(
    name: str,
    config_text: str,
    core_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        core_path = root / "common" / "device" / "core_infra.yaml"
        firmware_dir.mkdir(parents=True)
        core_path.parent.mkdir(parents=True)
        (firmware_dir / "button_grid_weather_forecast.h").write_text(config_text, encoding="utf-8")
        core_path.write_text(core_text, encoding="utf-8")

        errors = firmware_weather_disconnect_errors(firmware_dir, core_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_weather_reconnect_errors(name: str, core_text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        core_path = root / "common" / "device" / "core_infra.yaml"
        core_path.parent.mkdir(parents=True)
        core_path.write_text(core_text, encoding="utf-8")

        errors = firmware_weather_reconnect_errors(core_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_request_errors(
    name: str,
    action_text: str,
    core_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        core_path = root / "common" / "device" / "core_infra.yaml"
        firmware_dir.mkdir(parents=True)
        core_path.parent.mkdir(parents=True)
        (firmware_dir / "button_grid_actions.h").write_text(action_text, encoding="utf-8")
        core_path.write_text(core_text, encoding="utf-8")

        errors = firmware_cover_request_errors(firmware_dir, core_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def valid_media_power_binding_text() -> tuple[str, str]:
    media_text = (
        "inline void media_playback_subscribe_volume(MediaPlaybackState *state) {\n"
        "  ha_subscribe_attribute(entity_id, std::string(\"supported_features\"), cb);\n"
        "}\n"
        "inline void subscribe_media_control_state(MediaControlCtx *ctx) {\n"
        "  media_playback_subscribe_volume(state);\n"
        "#ifndef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL\n"
        "#endif\n"
        "}\n\n"
        "inline bool media_seek_pending_active() { return false; }\n"
        "inline bool media_control_power_supported() { return ctx && !ctx->power_entity.empty(); }\n"
        "inline void media_control_send_power_action(MediaControlCtx *ctx) {\n"
        "  send_media_player_action(ctx->power_entity, \"homeassistant.turn_on\");\n"
        "  send_media_player_action(ctx->power_entity, \"homeassistant.turn_off\");\n"
        "}\n"
    )
    capability_text = (
        "constexpr int SUPPORT_TURN_ON = 128;\n"
        "constexpr int SUPPORT_TURN_OFF = 256;\n"
        "inline bool power_toggle_supported() {}\n"
        "inline PowerCommand power_command() {\n"
        "  return state == \"off\" ? PowerCommand::TURN_ON : PowerCommand::TURN_OFF;\n"
        "}\n"
    )
    return media_text, capability_text


def expect_image_card_base_url_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_image.h").write_text(text, encoding="utf-8")

        errors = firmware_image_card_base_url_errors(firmware_dir, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_screensaver_wake_guard_errors(
    name: str,
    backlight_text: str,
    screen_clock_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        backlight_path = root / "common" / "addon" / "backlight.yaml"
        screen_clock_path = root / "common" / "device" / "screen_clock.yaml"
        backlight_path.parent.mkdir(parents=True)
        screen_clock_path.parent.mkdir(parents=True)
        backlight_path.write_text(backlight_text, encoding="utf-8")
        screen_clock_path.write_text(screen_clock_text, encoding="utf-8")

        errors = firmware_screensaver_wake_guard_errors(
            backlight_path, screen_clock_path, root
        )
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_screen_wake_button_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "addon" / "backlight.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")
        errors = firmware_screen_wake_button_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_display_backlight_manual_sleep_errors(
    name: str,
    backlight_text: str,
    device_texts: dict[str, str],
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        backlight_path = root / "common" / "addon" / "backlight.yaml"
        backlight_path.parent.mkdir(parents=True)
        backlight_path.write_text(backlight_text, encoding="utf-8")
        device_paths: list[Path] = []
        for slug, text in device_texts.items():
            path = root / "devices" / slug / "device" / "device.yaml"
            path.parent.mkdir(parents=True)
            path.write_text(text, encoding="utf-8")
            device_paths.append(path)

        errors = firmware_display_backlight_manual_sleep_errors(
            backlight_path, tuple(device_paths), root
        )
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_display_backlight_mode_restore_errors(
    name: str,
    schedule_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "addon" / "backlight_schedule.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(schedule_text, encoding="utf-8")
        errors = firmware_display_backlight_mode_restore_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_clock_bar_navigation_errors(
    name: str, text: str, expected: tuple[str, ...]
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "addon" / "connectivity.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")
        errors = firmware_clock_bar_navigation_errors((path,), root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_display_active_finalization_errors(
    name: str,
    backlight_text: str,
    schedule_text: str,
    connectivity_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        addon_dir = root / "common" / "addon"
        addon_dir.mkdir(parents=True)
        backlight_path = addon_dir / "backlight.yaml"
        schedule_path = addon_dir / "backlight_schedule.yaml"
        connectivity_path = addon_dir / "connectivity.yaml"
        backlight_path.write_text(backlight_text, encoding="utf-8")
        schedule_path.write_text(schedule_text, encoding="utf-8")
        connectivity_path.write_text(connectivity_text, encoding="utf-8")
        errors = firmware_display_active_finalization_errors(
            backlight_path, schedule_path, (connectivity_path,), root
        )
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_clock_screensaver_overlay_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "addon" / "backlight.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")
        errors = firmware_clock_screensaver_overlay_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_screen_schedule_screensaver_override_errors(
    name: str,
    text: str,
    expected: tuple[str, ...],
    schedule_text: str | None = None,
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "addon" / "backlight.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")
        if schedule_text is not None:
            path.with_name("backlight_schedule.yaml").write_text(
                schedule_text, encoding="utf-8"
            )
        errors = firmware_screen_schedule_screensaver_override_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_artwork_image_auth_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "components" / "artwork_image" / "artwork_image.cpp"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_artwork_image_auth_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_s3_api_errors(
    name: str,
    text: str,
    expected: tuple[str, ...],
    s3_packages_text: str = "packages:\n  device: !include device/device.yaml\n",
    core_text: str = "api:\n  reboot_timeout: 0s\n",
    api_navigate_text: str = "api:\n  actions:\n    - action: navigate\n",
    extra_packages: dict[str, str] | None = None,
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        device_path = root / "devices" / "guition-esp32-s3-4848s040" / "device" / "device.yaml"
        s3_packages_path = root / "devices" / "guition-esp32-s3-4848s040" / "packages.yaml"
        core_path = root / "common" / "device" / "core_infra.yaml"
        api_navigate_path = root / "common" / "device" / "api_navigate.yaml"
        device_path.parent.mkdir(parents=True)
        core_path.parent.mkdir(parents=True)
        device_path.write_text(text, encoding="utf-8")
        s3_packages_path.write_text(s3_packages_text, encoding="utf-8")
        core_path.write_text(core_text, encoding="utf-8")
        api_navigate_path.write_text(api_navigate_text, encoding="utf-8")
        package_paths = [s3_packages_path]
        for filename, package_text in (extra_packages or {}).items():
            package_path = root / "devices" / filename / "packages.yaml"
            package_path.parent.mkdir(parents=True)
            package_path.write_text(package_text, encoding="utf-8")
            package_paths.append(package_path)

        errors = firmware_s3_api_errors(
            device_path,
            s3_packages_path,
            core_path,
            api_navigate_path,
            tuple(package_paths),
            root,
        )
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_navigation_target_errors(
    name: str,
    navigation_text: str,
    grid_text: str,
    navigation_driver_text: str,
    api_text: str,
    package_texts: dict[str, str],
    local_voice_slugs: tuple[str, ...],
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        api_path = root / "common" / "device" / "api_navigate.yaml"
        firmware_dir.mkdir(parents=True)
        api_path.parent.mkdir(parents=True)
        (firmware_dir / "button_grid_navigation.h").write_text(navigation_text, encoding="utf-8")
        (firmware_dir / "button_grid_grid.h").write_text(grid_text, encoding="utf-8")
        (firmware_dir / "button_grid_navigation_driver.h").write_text(
            navigation_driver_text, encoding="utf-8")
        api_path.write_text(api_text, encoding="utf-8")
        manifest_path = root / "devices" / "manifest.json"
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            json.dumps(
                {
                    "devices": {
                        slug: {"firmware": {"package": {"localVoiceServices": slug in local_voice_slugs}}}
                        for slug in package_texts
                    }
                }
            ),
            encoding="utf-8",
        )
        package_paths: list[Path] = []
        for slug, package_text in package_texts.items():
            package_path = root / "devices" / slug / "packages.yaml"
            package_path.parent.mkdir(parents=True)
            package_path.write_text(package_text, encoding="utf-8")
            package_paths.append(package_path)

        errors = firmware_navigation_target_errors(firmware_dir, api_path, tuple(package_paths), root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_connectivity_api_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "addon" / "connectivity.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_connectivity_api_errors((path,), root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_wifi_setup_display_text_errors(
    name: str,
    loading_text: str,
    wifi_setup_text: str,
    connectivity_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        loading_path = root / "common" / "device" / "screen_loading.yaml"
        wifi_setup_path = root / "common" / "device" / "screen_wifi_setup.yaml"
        connectivity_path = root / "common" / "addon" / "connectivity.yaml"
        loading_path.parent.mkdir(parents=True)
        connectivity_path.parent.mkdir(parents=True)
        loading_path.write_text(loading_text, encoding="utf-8")
        wifi_setup_path.write_text(wifi_setup_text, encoding="utf-8")
        connectivity_path.write_text(connectivity_text, encoding="utf-8")

        errors = firmware_wifi_setup_display_text_errors(
            loading_path, wifi_setup_path, connectivity_path, root
        )
        errors = [error.replace("\\", "/") for error in errors]
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_c6_update_status_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "esp32_c6_firmware_update.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_c6_update_status_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def test_camera_refresh_package_mcu_errors() -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        (firmware_dir / "button_grid_image.h").write_text("", encoding="utf-8")
        common_device = root / "common" / "device"
        common_device.mkdir(parents=True)
        for package in ("image_cards_6.yaml", "image_cards_2.yaml"):
            (common_device / package).write_text("", encoding="utf-8")

        devices = root / "devices"
        devices.mkdir()
        profile_mcus = {
            "p4": "ESP32-P4",
            "guition-esp32-s3-4848s040": "ESP32-S3",
            "waveshare-esp32-s3-touch-lcd-4": "ESP32-S3",
        }
        (devices / "manifest.json").write_text(
            json.dumps(
                {
                    "devices": {
                        slug: {"firmware": {"build": {"chip": mcu}}}
                        for slug, mcu in profile_mcus.items()
                    }
                }
            ),
            encoding="utf-8",
        )
        package_includes = {
            "p4": "image_cards_6.yaml",
            "guition-esp32-s3-4848s040": "image_cards_2.yaml",
            "waveshare-esp32-s3-touch-lcd-4": "image_cards_2.yaml",
        }
        for slug, include in package_includes.items():
            package_dir = devices / slug
            package_dir.mkdir()
            package_text = f"  image_cards: !include ../../common/device/{include}\n"
            (package_dir / "packages.yaml").write_text(package_text, encoding="utf-8")

        errors = firmware_camera_refresh_action_errors(root)
        package_errors = [error for error in errors if error.endswith("MCU")]
        assert not package_errors, f"expected MCU-matched packages, got {package_errors!r}"

        waveshare_packages = devices / "waveshare-esp32-s3-touch-lcd-4" / "packages.yaml"
        waveshare_packages.write_text(
            "  image_cards: !include ../../common/device/image_cards_6.yaml\n",
            encoding="utf-8",
        )
        errors = firmware_camera_refresh_action_errors(root)
        package_errors = [error for error in errors if "packages.yaml:" in error]
        assert package_errors == [
            "devices/waveshare-esp32-s3-touch-lcd-4/packages.yaml: "
            "include image_cards_2.yaml for the manifest's ESP32-S3 MCU"
        ], f"expected an S3 image-card package error for Waveshare, got {package_errors!r}"


def run_self_test() -> int:
    test_camera_refresh_package_mcu_errors()
    for call in (
        "api->get_home_assistant_state(entity, callback);",
        "api.get_home_assistant_state(entity, callback);",
        "get_home_assistant_state (entity, callback);",
        "api . get_home_assistant_state\n(entity, callback);",
        "transport_.get(entity, callback);",
        "transport_ -> get (entity, callback);",
        "api./* boundary */get_home_assistant_state(entity, callback);",
    ):
        for filename in ("button_grid_ha.h", "ha_read_coordinator.h"):
            expect_ha_boundary_errors(
                f"accumulating call in {filename}: {call}",
                {"button_grid_ha.h": "", filename: call},
                ("fresh metadata reads must reuse subscriptions",),
            )
    assert not accumulating_ha_read_call(
        "// get_home_assistant_state(entity, callback);\n"
        "/* transport_.get(entity, callback); */\n"
        "transport_.request(entity, attribute);"
    )
    assert accumulating_ha_read_call(
        'const char *url = "https://example.test"; api.get_home_assistant_state(entity, cb);'
    )
    valid_option_select_state = (
        "inline void subscribe_option_select_state(OptionSelectCtx *ctx) {\n"
        "  ha_subscribe_state(ctx->entity_id, callback);\n"
        "  bool unavailable = ha_entity_state_unavailable_ref(ctx->entity_id, state);\n"
        "  bool no_current_option = normalized_state_text(state) == \"unknown\";\n"
        "  ctx->current_option = unavailable || no_current_option ? \"\" : state_text;\n"
        "  option_select_refresh_modal_rows(ctx);\n"
        "}\n"
        "inline void subscribe_option_select_friendly_name(OptionSelectCtx *ctx) {}\n"
        "  ui.option_rows[i] = btn;\n"
    )
    valid_camera_screensaver = (
        'text: !lambda \'return std::string(espdesktop_i18n_key("unavailable"));\'\n'
        'ha_release_callbacks_for_owner(&id(camera_screensaver_subscribed_entity));\n'
        'id(camera_screensaver_downloaded_image)->cancel_update();\n'
        'void *const camera_owner = &id(camera_screensaver_subscribed_entity);\n'
        'ha_release_callbacks_for_owner(camera_owner);\n'
        'HaCallbackOwnerScope camera_subscription_owner(camera_owner);\n'
        'ha_subscribe_attribute(entity, std::string("access_token"), callback,\n'
        '  HA_SUBSCRIPTION_SCOPE_DEFAULT, true);\n'
        'ha_reannounce_state_subscriptions();\n'
        'ha_read_retained_attribute(entity, std::string("access_token"),\n'
        '  std::function<void(esphome::StringRef)>([](esphome::StringRef) {}), camera_owner);\n'
        'lv_image_set_src(id(camera_screensaver_image), static_cast<const void *>(nullptr));\n'
        'lvgl.image.update:\n'
        '  id: camera_screensaver_image\n'
        '  src: camera_screensaver_downloaded_image\n'
        'id(screensaver_camera_image_mode).current_option() == "Fill"\n'
        'esphome::artwork_image::ImageResizeMode::COVER\n'
        'esphome::artwork_image::ImageResizeMode::FIT\n'
    )
    valid_backlight_off_handler = (
        "script:\n"
        "  - id: display_backlight_handle_off\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return !id(espdesktop_app).display().target_mode_is(\n"
        "                  espdesktop::DisplayMode::DISPLAY_OFF);\n"
        "          then:\n"
        "            - script.execute: screen_schedule_manual_sleep\n"
    )
    valid_simple_backlight = (
        "light:\n"
        "  - platform: monochromatic\n"
        "    id: display_backlight\n"
        "    on_turn_off:\n"
        "      then:\n"
        "        - script.execute: display_backlight_handle_off\n"
    )
    valid_takeover_backlight = (
        "light:\n"
        "  - platform: monochromatic\n"
        "    id: display_backlight\n"
        "    on_turn_off:\n"
        "      then:\n"
        "        - if:\n"
        "            condition:\n"
        "              lambda: |-\n"
        "                return controller.takeover_active(DisplayTakeoverKind::INTERACTIVE) ||\n"
        "                       controller.takeover_active(DisplayTakeoverKind::CRITICAL);\n"
        "            then:\n"
        "              - script.execute: backlight_apply_brightness\n"
        "            else:\n"
        "              - script.execute: display_backlight_handle_off\n"
    )
    expect_display_backlight_manual_sleep_errors(
        "all visible modes use shared manual sleep handler",
        valid_backlight_off_handler,
        {
            "simple-display": valid_simple_backlight,
            "guition-esp32-p4-jc8012p4a1": valid_takeover_backlight,
        },
        (),
    )
    expect_display_backlight_manual_sleep_errors(
        "ACTIVE-only manual sleep is rejected",
        valid_backlight_off_handler,
        {
            "simple-display": valid_simple_backlight.replace(
                "        - script.execute: display_backlight_handle_off\n",
                "        - if:\n"
                "            condition:\n"
                "              lambda: 'return controller.target_mode_is(espdesktop::DisplayMode::ACTIVE);'\n"
                "            then:\n"
                "              - script.execute: screen_schedule_manual_sleep\n",
            )
        },
        (
            "route Display Backlight OFF through display_backlight_handle_off",
            "do not gate manual sleep on ACTIVE display mode",
            "use the shared display backlight OFF handler",
        ),
    )
    expect_display_backlight_manual_sleep_errors(
        "takeover recovery remains ahead of manual sleep",
        valid_backlight_off_handler,
        {"guition-esp32-p4-jc8012p4a1-v2": valid_simple_backlight},
        ("preserve display takeover recovery before manual sleep handling",),
    )
    valid_backlight_state_handler = (
        "script:\n"
        "  - id: display_backlight_handle_state\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (!App.is_setup_complete() || !id(brightness_mode_runtime_ready)) {\n"
        "            id(backlight_expected_internal_level_valid) = false;\n"
        "            return;\n"
        "          }\n"
        "          if (!id(display_backlight).remote_values.is_on()) return;\n"
    )
    expect_display_backlight_mode_restore_errors(
        "restored backlight state waits for startup",
        valid_backlight_state_handler,
        (),
    )
    expect_display_backlight_mode_restore_errors(
        "restored backlight state requires ESPHome setup",
        valid_backlight_state_handler.replace("!App.is_setup_complete() || ", ""),
        ("ignore restored Display Backlight state",),
    )
    expect_display_backlight_mode_restore_errors(
        "restored backlight state requires brightness mode setup",
        valid_backlight_state_handler.replace(" || !id(brightness_mode_runtime_ready)", ""),
        ("ignore restored Display Backlight state",),
    )
    expect_display_backlight_mode_restore_errors(
        "restored backlight state clears pending internal marker",
        valid_backlight_state_handler.replace(
            "            id(backlight_expected_internal_level_valid) = false;\n", ""
        ),
        ("ignore restored Display Backlight state",),
    )
    expect_screen_wake_button_errors(
        "missing Screen: Wake button",
        "script:\n  - id: screensaver_wake\n",
        ("expose Screen: Wake as a template button",),
    )
    expect_screen_wake_button_errors(
        "hidden incomplete Screen: Wake button",
        "button:\n"
        "  - platform: template\n"
        "    name: \"${entity_screen_wake}\"\n"
        "    icon: mdi:power\n"
        "    internal: true\n"
        "    disabled_by_default: true\n"
        "    entity_category: config\n"
        "    on_press:\n"
        "      - script.execute: screen_schedule_check\n",
        (
            "keep Screen: Wake exposed to Home Assistant",
            "enable Screen: Wake by default",
            "keep Screen: Wake operational",
            "use mdi:monitor-shimmer",
            "complete touch-equivalent Screen: Wake sequence",
        ),
    )
    expect_screen_wake_button_errors(
        "complete Screen: Wake button",
        "button:\n"
        "  - platform: template\n"
        "    name: \"${entity_screen_wake}\"\n"
        "    icon: mdi:monitor-shimmer\n"
        "    disabled_by_default: false\n"
        "    on_press:\n"
        "      - script.execute: screensaver_wake\n"
        "script:\n"
        "  - id: screensaver_wake\n",
        (),
    )
    expect_c6_update_status_errors(
        "missing c6 no-update fallback",
        'text_sensor:\n'
        '  - platform: template\n'
        '    id: c6_update_available\n'
        '    lambda: |-\n'
        '      if (upd->state == esphome::update::UpdateState::UPDATE_STATE_UNKNOWN) return "Unknown";\n'
        '  - platform: template\n'
        '    id: c6_update_latest_firmware\n'
        '    lambda: |-\n'
        '      auto &lat = upd->update_info.latest_version;\n'
        '      if (lat.empty()) return "Unknown";\n'
        'button:\n',
        ("report the current C6 firmware as available when no update exists",),
    )
    expect_c6_update_status_errors(
        "missing c6 unknown status",
        'text_sensor:\n'
        '  - platform: template\n'
        '    id: c6_update_available\n'
        '    lambda: |-\n'
        '      return "Up-to-date";\n'
        '  - platform: template\n'
        '    id: c6_update_latest_firmware\n'
        '    lambda: |-\n'
        '      if (upd->state == esphome::update::UpdateState::UPDATE_STATE_NO_UPDATE) {\n'
        '        auto &cur = upd->update_info.current_version;\n'
        '        if (!cur.empty()) return cur;\n'
        '      }\n'
        'button:\n',
        ("keep the C6 update status unknown until ESPHome checks for updates",),
    )
    expect_errors(
        "direct action send",
        {"button_grid_actions.h": "esphome::api::global_api_server->send_homeassistant_action(req);\n"},
        ("access Home Assistant API through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct action send through reference",
        {"button_grid_actions.h": "api.send_homeassistant_action(req);\n"},
        ("send Home Assistant actions through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct state subscription",
        {"button_grid_media.h": "api->subscribe_home_assistant_state(entity, {}, cb);\n"},
        ("subscribe to Home Assistant state through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct state subscription through reference",
        {"button_grid_media.h": "api.subscribe_home_assistant_state(entity, {}, cb);\n"},
        ("subscribe to Home Assistant state through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct state get",
        {"button_grid_media.h": "api->get_home_assistant_state(entity, {}, cb);\n"},
        ("get Home Assistant state through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct state get through reference",
        {"button_grid_media.h": "api.get_home_assistant_state(entity, {}, cb);\n"},
        ("get Home Assistant state through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct callback registration",
        {"button_grid_alarm.h": "api->register_action_response_callback(id, cb);\n"},
        ("register action callbacks through button_grid_ha.h helpers",),
    )
    expect_errors(
        "direct callback cancellation",
        {"button_grid_alarm.h": "api.handle_action_response(id, false, error);\n"},
        ("cancel action callbacks through button_grid_ha.h helpers",),
    )
    expect_errors(
        "helper boundary",
        {"button_grid_ha.h": "esphome::api::global_api_server->send_homeassistant_action(req);\n"},
        (),
    )
    expect_errors(
        "helper use",
        {"button_grid_media.h": "ha_subscribe_state(entity, cb);\n"},
        (),
    )
    expect_ha_boundary_errors(
        "missing callback cancel helper",
        {
            "button_grid_ha.h": (
                "inline bool ha_subscribe_state() {\n  return true;\n}\n"
                "inline bool ha_subscribe_attribute() {\n  return true;\n}\n"
                "inline bool ha_action_send() {\n  return ha_api_state_connected() && HA_ACTION_INTERNAL_FREE_MIN_BYTES;\n}\n"
            )
        },
        ("expose a helper to cancel stale HA action response callbacks",),
    )
    expect_ha_boundary_errors(
        "action send only checks socket",
        {
            "button_grid_ha.h": (
                "inline bool ha_subscribe_state() {\n  return true;\n}\n"
                "inline bool ha_subscribe_attribute() {\n  return true;\n}\n"
                "inline bool ha_cancel_action_response_callback() {\n  handle_action_response(); return true;\n}\n"
                "inline bool ha_action_send() {\n  return ha_api_connected();\n}\n"
            )
        },
        ("send Home Assistant actions only after state subscription is ready",),
    )
    expect_ha_boundary_errors(
        "retained state read without channel validation",
        {
            "button_grid_ha.h": (
                "inline bool ha_subscribe_state() {\n  return true;\n}\n"
                "inline bool ha_subscribe_attribute() {\n  return true;\n}\n"
                "inline bool ha_cancel_action_response_callback() {\n  handle_action_response(); return true;\n}\n"
                "inline bool ha_action_send() {\n"
                "  return ha_api_state_connected() && HA_ACTION_INTERNAL_FREE_MIN_BYTES;\n"
                "}\n"
                "inline bool ha_read_retained_attribute() {\n"
                "  ha_internal_heap_available(\"Home Assistant attribute request\");\n"
                "  if (ha_state_callback_depth() != 0) return true;\n"
                "  return true;\n"
                "}\n"
            )
        },
        ("fail retained reads closed without an active retained subscription",),
    )
    expect_ha_boundary_errors(
        "unbounded reentrant retained reads",
        {
            "button_grid_ha.h": (
                "inline bool ha_subscribe_state() {\n  return true;\n}\n"
                "inline bool ha_subscribe_attribute() {\n  return true;\n}\n"
                "inline bool ha_cancel_action_response_callback() {\n  handle_action_response(); return true;\n}\n"
                "inline bool ha_action_send() {\n"
                "  return ha_api_state_connected() && HA_ACTION_INTERNAL_FREE_MIN_BYTES;\n"
                "}\n"
                "inline bool ha_read_retained_state() {\n"
                "  ha_internal_heap_available(\"Home Assistant attribute request\");\n"
                "  if (ha_state_callback_depth() != 0 || !ha_api_state_connected()) return true;\n"
                "  return true;\n"
                "}\n"
                "inline bool ha_read_retained_attribute() {\n"
                "  if (ha_state_callback_depth() != 0 || !ha_api_state_connected()) return true;\n"
                "  return true;\n"
                "}\n"
            )
        },
        ("queue and fan out bounded reentrant retained reads",),
    )
    expect_ha_boundary_errors(
        "subscription callback bodies retained",
        {
            "button_grid_ha.h": (
                "inline bool ha_subscribe_state() {\n"
                "  ha_track_subscription_callback(callback_ref);\n"
                "  return true;\n"
                "}\n"
                "inline bool ha_subscribe_attribute() {\n"
                "  ha_track_subscription_callback(callback_ref);\n"
                "  return true;\n"
                "}\n"
                "inline bool ha_cancel_action_response_callback() {\n  handle_action_response(); return true;\n}\n"
                "inline bool ha_action_send() {\n"
                "  return ha_api_state_connected() && HA_ACTION_INTERNAL_FREE_MIN_BYTES;\n"
                "}\n"
                "inline bool ha_read_retained_state() {\n"
                "  ha_internal_heap_available(\"Home Assistant attribute request\");\n"
                "  if (ha_state_callback_depth() != 0 || !ha_api_state_connected()) return true;\n"
                "  request.callback = std::move(callback);\n"
                "  request.entity_id == entity_id;\n"
                "  return true;\n"
                "}\n"
                "inline bool ha_read_retained_attribute() {\n"
                "  if (ha_state_callback_depth() != 0 || !ha_api_state_connected()) return true;\n"
                "  return true;\n"
                "}\n"
            )
        },
        ("release retired Home Assistant subscription callback bodies",),
    )
    expect_ha_boundary_errors(
        "unavailable retry helper symbols",
        {
            "button_grid_ha.h": (
                "struct HaUnavailableStateRetryRef {};\n"
                "inline bool ha_subscribe_state() {\n  return true;\n}\n"
                "inline bool ha_subscribe_attribute() {\n  return true;\n}\n"
                "inline bool ha_cancel_action_response_callback() {\n  handle_action_response(); return true;\n}\n"
                "inline bool ha_action_send() {\n"
                "  return ha_api_state_connected() && HA_ACTION_INTERNAL_FREE_MIN_BYTES;\n"
                "}\n"
            )
        },
        ("do not reintroduce unavailable HA state retry polling",),
    )
    expect_unavailable_retry_errors(
        "unavailable retry reset and interval",
        "inline void bump_ha_subscription_generation() {\n"
        "  ha_reset_unavailable_state_retries();\n"
        "  ha_reset_deferred_state_requests();\n"
        "}\n",
        "interval:\n"
        "  - interval: 5s\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          ha_retry_unavailable_states();\n",
        (
            "do not reset removed unavailable HA state retries",
            "do not keep removed unavailable HA state retry helpers",
            "do not retry unavailable HA states",
        ),
    )
    expect_media_card_availability_errors(
        "unavailable entity dims media card",
        "inline void media_playback_apply_state_to_control(MediaPlaybackState *state, MediaControlCtx *ctx) {\n"
        "  media_control_apply_availability(ctx->btn, ctx->btn, ctx->available);\n"
        "}\n",
        ("do not dim or disable media cards",),
    )
    expect_media_card_availability_errors(
        "unavailable entity dims media panel",
        "inline void media_control_refresh_modal(MediaControlCtx *ctx) {\n"
        "  media_control_apply_availability(ui.panel, ui.panel, ctx->available, false);\n"
        "}\n",
        ("do not dim the media control panel",),
    )
    expect_media_card_availability_errors(
        "media progress remains guarded",
        "inline void media_control_refresh_progress(MediaControlCtx *ctx) {\n"
        "  media_control_apply_availability(ui.progress_slider, ui.progress_slider, has_duration);\n"
        "}\n",
        (),
    )
    expect_time_reconnect_errors(
        "home assistant time sync runs on raw api connect",
        "api:\n"
        "  on_client_connected:\n"
        "    - lambda: |-\n"
        "        id(homeassistant_time).update();\n",
        (
            "guard Home Assistant time updates",
            "wait for Home Assistant state readiness",
            "defer Home Assistant time sync",
            "recalculate sunrise and sunset",
            "recheck the screen schedule",
        ),
    )
    expect_time_reconnect_errors(
        "home assistant time sync waits for state readiness",
        "api:\n"
        "  on_client_connected:\n"
        "    - delay: 2s\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) id(homeassistant_time).update();\n"
        "    - delay: 1s\n"
        "    - script.execute: time_update\n"
        "    - script.execute: backlight_recalc_sunrise_sunset\n"
        "    - script.execute: screen_schedule_check\n"
        "script:\n"
        "  - id: time_update\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (ha_api_state_connected()) id(homeassistant_time).update();\n",
        (),
    )
    expect_ntp_startup_errors(
        "custom ntp apply runs during boot",
        "esphome:\n"
        "  on_boot:\n"
        "    then:\n"
        "      - script.execute: ntp_servers_apply\n",
        "inline void apply_ntp_servers() {\n"
        "  esp_sntp_init();\n"
        "}\n",
        "wifi:\n"
        "  on_connect:\n"
        "    - script.execute: network_status_refresh\n",
        (
            "defer custom NTP server apply",
            "skip SNTP reconfiguration until application setup",
            "skip SNTP reconfiguration",
            "apply configured NTP servers after network connect",
        ),
    )
    expect_ntp_startup_errors(
        "custom ntp apply waits for network",
        "esphome:\n"
        "  on_boot:\n"
        "    then:\n"
        "      - lambda: apply_timezone();\n"
        "# NTP server settings\n"
        "text:\n"
        "  - platform: template\n"
        "    on_value:\n"
        "      then:\n"
        "        - script.execute: ntp_servers_apply_after_network\n"
        "text_sensor:\n"
        "script:\n"
        "  - id: ntp_servers_apply_after_network\n"
        "    then:\n"
        "      - delay: 2s\n"
        "      - script.execute: ntp_servers_apply\n",
        "inline void apply_ntp_servers() {\n"
        "  if (!esphome::App.is_setup_complete()) return;\n"
        "  if (esphome::network::get_ip_addresses().empty()) return;\n"
        "  esp_sntp_init();\n"
        "}\n",
        "wifi:\n"
        "  on_connect:\n"
        "    - script.execute: ntp_servers_apply_after_network\n",
        (),
    )
    expect_weather_request_errors(
        "weather request during reconnect",
        "inline void request_weather_forecast_entity() {\n"
        "  constexpr int WEATHER_FORECAST_PENDING_MAX = 8;\n"
        "  constexpr uint32_t WEATHER_FORECAST_RETRY_DELAY_MS = 300000;\n"
        "  weather_forecast_track_pending(req.call_id);\n"
        "  weather_forecast_cancel_pending_requests();\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"failed\");\n"
        "  if (!ha_api_available()) return;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "  ha_action_send(req);\n"
        "}\n",
        ("wait for Home Assistant state subscription",),
    )
    expect_weather_request_errors(
        "weather callback leak on send failure",
        "inline void request_weather_forecast_entity() {\n"
        "  constexpr int WEATHER_FORECAST_PENDING_MAX = 8;\n"
        "  constexpr uint32_t WEATHER_FORECAST_RETRY_DELAY_MS = 300000;\n"
        "  weather_forecast_track_pending(req.call_id);\n"
        "  weather_forecast_cancel_pending_requests();\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"failed\");\n"
        "  if (!ha_api_state_connected()) return;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "  if (!ha_action_send(req)) return;\n"
        "}\n",
        ("cancel forecast response callbacks",),
    )
    expect_weather_request_errors(
        "weather send failure missing retry",
        "inline void request_weather_forecast_entity() {\n"
        "  constexpr int WEATHER_FORECAST_PENDING_MAX = 8;\n"
        "  constexpr uint32_t WEATHER_FORECAST_RETRY_DELAY_MS = 300000;\n"
        "  weather_forecast_track_pending(req.call_id);\n"
        "  weather_forecast_cancel_pending_requests();\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"setup failed\");\n"
        "  if (!ha_api_state_connected()) return;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "  if (!ha_action_send(req)) {\n"
        "    weather_forecast_clear_pending(req.call_id);\n"
        "    ha_cancel_action_response_callback(req.call_id, \"send failed\");\n"
        "    weather_forecast_send_next_queued();\n"
        "  }\n"
        "}\n",
        ("retry weather forecast sends that fail after callback registration",),
    )
    expect_weather_request_errors(
        "weather payload without temperatures missing retry",
        "inline void request_weather_forecast_entity() {\n"
        "  constexpr int WEATHER_FORECAST_PENDING_MAX = 8;\n"
        "  constexpr uint32_t WEATHER_FORECAST_RETRY_DELAY_MS = 300000;\n"
        "  weather_forecast_track_pending(req.call_id);\n"
        "  weather_forecast_cancel_pending_requests();\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"setup failed\");\n"
        "  if (!ha_api_state_connected()) return;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "  bool valid = false;\n"
        "  if (!valid) {\n"
        "    ESP_LOGW(\"weather_forecast\", \"No usable forecast temperatures for %s\", entity_id.c_str());\n"
        "  }\n"
        "}\n",
        ("retry weather forecasts when Home Assistant returns no usable temperatures",),
    )
    expect_weather_request_errors(
        "unbounded weather callbacks",
        "inline void request_weather_forecast_entity() {\n"
        "  constexpr uint32_t WEATHER_FORECAST_RETRY_DELAY_MS = 300000;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"failed\");\n"
        "  if (!ha_api_state_connected()) return;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "  ha_cancel_action_response_callback(req.call_id, \"send failed\");\n"
        "}\n",
        ("bound pending forecast response callbacks",),
    )
    expect_weather_request_errors(
        "missing delayed weather request retry",
        "inline void request_weather_forecast_entity() {\n"
        "  constexpr int WEATHER_FORECAST_PENDING_MAX = 8;\n"
        "  weather_forecast_track_pending(req.call_id);\n"
        "  weather_forecast_cancel_pending_requests();\n"
        "  if (!ha_api_state_connected()) return;\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "  ha_cancel_action_response_callback(req.call_id, \"send failed\");\n"
        "  ha_action_send(req);\n"
        "}\n",
        ("retry failed weather forecast requests later",),
    )
    expect_weather_request_errors(
        "missing robust weather timeout detection",
        "inline void request_weather_forecast_entity() {\n"
        "  if (!weather_forecast_actions_ready()) return;\n"
        "  weather_forecast_track_pending(req.call_id);\n"
        "  weather_forecast_cancel_pending_requests();\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"low internal heap\");\n"
        "  weather_forecast_schedule_retry(entity_id, day, \"failed\");\n"
        "}\n",
        ("detect Home Assistant forecast timeout errors robustly",),
    )
    expect_weather_disconnect_errors(
        "missing weather disconnect cleanup",
        "inline void weather_forecast_cancel_pending_requests() {}\n",
        "api:\n  on_client_connected:\n    - lambda: refresh_weather_forecast_cards();\n",
        ("cancel pending forecast callbacks when the HA API disconnects",),
    )
    expect_weather_reconnect_errors(
        "unguarded weather reconnect refresh",
        "api:\n"
        "  on_client_connected:\n"
        "    - lambda: |-\n"
        "        refresh_weather_forecast_cards();\n"
        "    - delay: 20s\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n",
        ("wait for Home Assistant state readiness",),
    )
    expect_weather_reconnect_errors(
        "missing delayed weather reconnect retry",
        "api:\n"
        "  on_client_connected:\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n",
        ("retry weather forecast refresh",),
    )
    expect_weather_reconnect_errors(
        "guarded weather reconnect refresh missing late retry",
        "api:\n"
        "  on_client_connected:\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n"
        "    - delay: 20s\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n",
        ("retry weather forecast refresh",),
    )
    expect_weather_reconnect_errors(
        "guarded weather reconnect refresh with delayed retries",
        "api:\n"
        "  on_client_connected:\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n"
        "    - delay: 20s\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n"
        "    - delay: 25s\n"
        "    - lambda: |-\n"
        "        if (ha_api_state_connected()) refresh_weather_forecast_cards();\n",
        (),
    )
    expect_cover_request_errors(
        "missing cover callback tracking",
        "inline void cover_stop_cancel_pending_request() {}\n"
        "inline void send_cover_command_action() {\n"
        "  ha_register_action_response_callback(req.call_id, cb);\n"
        "}\n",
        "api:\n"
        "  on_client_disconnected:\n"
        "    - lambda: cover_stop_cancel_pending_request();\n",
        ("track pending cover stop callbacks",),
    )
    expect_cover_request_errors(
        "missing cover disconnect cleanup",
        "inline void cover_stop_track_pending() {}\n"
        "inline void cover_stop_clear_pending() {}\n"
        "inline void cover_stop_cancel_pending_request() {}\n"
        "inline void send_cover_command_action() {\n"
        "  bool cover_stop_tracked = true;\n"
        "  ha_cancel_action_response_callback(req.call_id, \"send failed\");\n"
        "}\n",
        "api:\n  on_client_connected:\n    - lambda: refresh_weather_forecast_cards();\n",
        ("cancel pending cover stop callbacks when the HA API disconnects",),
    )
    valid_media_power, valid_media_power_capability = valid_media_power_binding_text()
    expect_image_card_base_url_errors(
        "image card uses stale startup base URL",
        "std::string base_url;\n"
        "inline void image_card_handle_picture(ImageCardCtx *ctx, esphome::StringRef picture) {\n"
        "  std::string raw = string_ref_limited(picture, 4096);\n"
        "  std::string url = image_card_join_url(ctx->base_url, raw);\n"
        "}\n"
        "ctx->base_url = cfg.home_assistant_base_url ? cfg.home_assistant_base_url() : \"\";\n",
        (
            "keep image card Home Assistant base URL lookup live",
            "resolve image card base URL when entity_picture is handled",
            "do not rely only on the startup-time image card base URL",
        ),
    )
    expect_image_card_base_url_errors(
        "image card resolves live base URL",
        "std::function<std::string()> base_url_provider;\n"
        "std::string base_url;\n"
        "inline std::string image_card_base_url(ImageCardCtx *ctx) {\n"
        "  return ctx->base_url_provider ? ctx->base_url_provider() : ctx->base_url;\n"
        "}\n"
        "inline void image_card_handle_picture(ImageCardCtx *ctx, esphome::StringRef picture) {\n"
        "  std::string raw = string_ref_limited(picture, 4096);\n"
        "  std::string url = image_card_join_url(image_card_base_url(ctx), raw);\n"
        "}\n"
        "ctx->base_url = cfg.home_assistant_base_url ? cfg.home_assistant_base_url() : \"\";\n"
        "ctx->base_url_provider = cfg.home_assistant_base_url;\n",
        (),
    )
    valid_shared_wake_guard_widget = (
        "lvgl:\n"
        "  top_layer:\n"
        "    widgets:\n"
        "      - obj:\n"
        "          id: screensaver_wake_touch_guard\n"
        "          width: 100%\n"
        "          height: 100%\n"
        "          clickable: true\n"
        "          hidden: true\n"
    )
    valid_shared_wake_guard_script = (
        "  - id: screensaver_wake_touch_block\n"
        "    then:\n"
        "      - globals.set:\n"
        "          id: screensaver_wake_touch_guard_active\n"
        "          value: 'true'\n"
        "      - lambda: 'screensaver_fill_screen(id(screensaver_wake_touch_guard));'\n"
        "      - lvgl.widget.show: screensaver_wake_touch_guard\n"
        "      - lambda: 'lv_obj_move_foreground(id(screensaver_wake_touch_guard));'\n"
        "      - wait_until:\n"
        "          condition:\n"
        "            lambda: 'return lv_indev_get_state(indev) == LV_INDEV_STATE_PRESSED;'\n"
        "          timeout: 150ms\n"
        "      - wait_until:\n"
        "          condition:\n"
        "            lambda: 'return lv_indev_get_state(indev) != LV_INDEV_STATE_PRESSED;'\n"
        "          timeout: 2s\n"
        "      - delay: 50ms\n"
        "      - globals.set:\n"
        "          id: screensaver_wake_touch_guard_active\n"
        "          value: 'false'\n"
        "      - lvgl.widget.hide: screensaver_wake_touch_guard\n"
    )
    valid_shared_wake_flow = (
        "globals:\n"
        "  - id: screensaver_wake_restore_pending\n"
        "    type: bool\n"
        "    initial_value: 'false'\n"
        "script:\n"
        "  - id: screensaver_wake\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          auto &controller = id(espdesktop_app).display();\n"
        "          bool clock_visible = !lv_obj_has_flag(id(clock_screensaver), LV_OBJ_FLAG_HIDDEN);\n"
        "          if (controller.has_transition_in_progress()) controller.cancel_transition();\n"
        "          controller.require_presentation_cleanup();\n"
        "          id(screensaver_wake_restore_pending) =\n"
        "              !id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::ACTIVE);\n"
        "          id(screensaver_wake_touch_guard_skip_once) =\n"
        "              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::DISPLAY_OFF);\n"
        "      - script.stop: display_mode_apply_transition\n"
        "      - script.stop: display_mode_effect_active\n"
        "      - script.stop: display_mode_effect_setup_dimmed\n"
        "      - script.stop: display_mode_effect_off\n"
        "      - script.execute: screensaver_wake_touch_block\n"
        "      - lambda: |-\n"
        "          id(espdesktop_app).display().clear(espdesktop::DisplayRequestSource::IDLE_TIMER);\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              const bool restore_pending = id(screensaver_wake_restore_pending);\n"
        "              id(screensaver_wake_restore_pending) = false;\n"
        "              return restore_pending ||\n"
        "                  !id(espdesktop_app).display().current_mode_is(espdesktop::DisplayMode::ACTIVE);\n"
        "          then:\n"
        "            - if:\n"
        "                condition:\n"
        "                  lambda: |-\n"
        "                    bool keep_wake_guard = id(screensaver_wake_touch_guard_skip_once);\n"
        "                    id(screensaver_wake_touch_guard_skip_once) = false;\n"
        "                    return keep_wake_guard;\n"
        "                else:\n"
        "                  - globals.set:\n"
        "                      id: screensaver_wake_touch_guard_active\n"
        "                      value: 'false'\n"
        + valid_shared_wake_guard_script
    )
    expect_screensaver_wake_guard_errors(
        "simple timed global guard is rejected",
        "globals:\n"
        "  - id: screensaver_wake_restore_pending\n"
        "    type: bool\n"
        "    initial_value: 'false'\n"
        "script:\n"
        "  - id: screensaver_wake\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(screensaver_wake_restore_pending) =\n"
        "              !id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::ACTIVE);\n"
        "          id(screensaver_wake_touch_guard_skip_once) =\n"
        "              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::DISPLAY_OFF);\n"
        "      - script.execute: screensaver_wake_touch_block\n"
        "      - lambda: |-\n"
        "          id(espdesktop_app).display().clear(espdesktop::DisplayRequestSource::IDLE_TIMER);\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              const bool restore_pending = id(screensaver_wake_restore_pending);\n"
        "              id(screensaver_wake_restore_pending) = false;\n"
        "              return restore_pending ||\n"
        "                  !id(espdesktop_app).display().current_mode_is(espdesktop::DisplayMode::ACTIVE);\n"
        "          then:\n"
        "            - globals.set:\n"
        "                id: screensaver_wake_touch_guard_active\n"
        "                value: 'true'\n"
        "            - script.execute: screensaver_wake_touch_guard_clear\n",
        valid_shared_wake_guard_widget,
        (
            "do not block the first button tap after normal screensaver wake",
            "do not arm a delayed wake guard clear for normal screensaver wake",
            "missing shared screensaver_wake_touch_block script",
        ),
    )
    expect_screensaver_wake_guard_errors(
        "shared release guard covers Display Off",
        valid_shared_wake_flow,
        valid_shared_wake_guard_widget,
        (),
    )
    expect_screensaver_wake_guard_errors(
        "guard does not cover Display Off",
        valid_shared_wake_flow.replace(
            "espdesktop::DisplayMode::DISPLAY_OFF",
            "espdesktop::DisplayMode::DIMMED",
        ),
        valid_shared_wake_guard_widget,
        ("pre-wake Display Off mode",),
    )
    expect_screensaver_wake_guard_errors(
        "release guard accepts the next deliberate tap",
        valid_shared_wake_flow.replace(
            "      - globals.set:\n"
            "          id: screensaver_wake_touch_guard_active\n"
            "          value: 'false'\n"
            "      - lvgl.widget.hide: screensaver_wake_touch_guard\n",
            "",
        ),
        valid_shared_wake_guard_widget,
        (
            "accept the first deliberate tap after wake-touch release",
            "hide the shared wake guard after touch release",
        ),
    )
    expect_screensaver_wake_guard_errors(
        "stuck touch retains a bounded fallback",
        valid_shared_wake_flow.replace("          timeout: 2s\n", ""),
        valid_shared_wake_guard_widget,
        ("clear the shared wake guard after a stuck touch timeout",),
    )
    valid_active_finalizer = (
        "script:\n"
        "  - id: display_mode_apply_transition\n"
        "    then:\n"
        "      - lambda: 'controller.complete_transition();'\n"
        "      - script.execute: display_active_finalize\n"
        "  - id: display_active_finalize\n"
        "    then:\n"
        "      - delay: 50ms\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::ACTIVE);'\n"
        "          then:\n"
        "            - if:\n"
        "                condition:\n"
        "                  lambda: 'return lv_scr_act() == id(main_page)->obj;'\n"
        "                then:\n"
        "                  - script.execute: clock_bar_apply\n"
        "                  - script.wait: clock_bar_apply\n"
        "                  - script.execute: backlight_apply_brightness\n"
        "                  - script.wait: backlight_apply_brightness\n"
        "            - script.execute: screensaver_idle_check\n"
    )
    valid_schedule_wake = (
        "script:\n"
        "  - id: screen_schedule_wake\n"
        "    then:\n"
        "      - script.execute: display_mode_reconcile\n"
        "      - script.wait: display_mode_apply_transition\n"
        "      - script.execute: display_active_finalize\n"
    )
    valid_active_navigation = (
        "script:\n"
        "  - id: navigate_after_api\n"
        "    then:\n"
        "      - lvgl.page.show: main_page\n"
        "      - script.execute: display_active_finalize\n"
    )
    expect_display_active_finalization_errors(
        "active display finalization remains complete",
        valid_active_finalizer,
        valid_schedule_wake,
        valid_active_navigation,
        (),
    )
    expect_display_active_finalization_errors(
        "active-state check precedes the page-specific guard",
        valid_active_finalizer.replace(
            "return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::ACTIVE);",
            "return lv_scr_act() == id(main_page)->obj && "
            "id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::ACTIVE);",
        ),
        valid_schedule_wake,
        valid_active_navigation,
        ("finalize active display",),
    )
    expect_display_active_finalization_errors(
        "scheduled wake waits for its display transition",
        valid_active_finalizer,
        valid_schedule_wake.replace(
            "      - script.wait: display_mode_apply_transition\n", "", 1
        ),
        valid_active_navigation,
        ("wait for scheduled wake transition",),
    )
    expect_display_active_finalization_errors(
        "automatic scheduled wake preserves manual sleep",
        valid_active_finalizer,
        valid_schedule_wake.replace(
            "    then:\n",
            "    then:\n"
            "      - lambda: 'id(espdesktop_app).display().clear(espdesktop::DisplayRequestSource::MANUAL_SLEEP);'\n",
            1,
        ),
        valid_active_navigation,
        ("preserve manual sleep",),
    )
    expect_display_active_finalization_errors(
        "completed active transitions restart idle handling",
        valid_active_finalizer.replace(
            "      - script.execute: display_active_finalize\n", "", 1
        ),
        valid_schedule_wake,
        valid_active_navigation,
        ("finalize every completed active transition",),
    )
    expect_display_active_finalization_errors(
        "active finalizer restores configured brightness",
        valid_active_finalizer.replace(
            "            - script.execute: backlight_apply_brightness\n", "", 1
        ),
        valid_schedule_wake,
        valid_active_navigation,
        ("configured brightness",),
    )
    expect_display_active_finalization_errors(
        "main-page navigation uses the active finalizer",
        valid_active_finalizer,
        valid_schedule_wake,
        valid_active_navigation.replace(
            "      - script.execute: display_active_finalize\n", "", 1
        ),
        ("after main-page navigation",),
    )
    expect_clock_bar_navigation_errors(
        "late navigation requires active display mode",
        "script:\n"
        "  - id: navigate_after_api\n"
        "    then:\n"
        "      - lvgl.page.show: main_page\n",
        ("guard late home-page navigation",),
    )
    expect_clock_bar_navigation_errors(
        "active navigation remains available",
        "script:\n"
        "  - id: navigate_after_api\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(\n"
        "                  espdesktop::DisplayMode::ACTIVE);\n"
        "          then:\n"
        "            - lvgl.page.show: main_page\n",
        (),
    )
    expect_clock_screensaver_overlay_errors(
        "clock screensaver closes active UI before showing",
        "script:\n"
        "  - id: screensaver_sleep_timer\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          media_volume_hide_modal();\n"
        "          climate_control_hide_modal();\n"
        "      - script.execute: hide_cover_art_view\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return screensaver_action_clock_mode(id(screensaver_action).current_option());'\n"
        "          then:\n"
        "            - script.execute: show_clock_view\n"
        "  - id: show_clock_view\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          hide_clock_bar_top_layer_widgets(nullptr, 0, nullptr, nullptr);\n"
        "          lv_obj_clear_flag(id(clock_screensaver), LV_OBJ_FLAG_HIDDEN);\n"
        "          lv_obj_move_foreground(id(clock_screensaver));\n"
        "  - id: clock_screensaver_keep_on_top\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (!id(espdesktop_app).display().current_mode_is(espdesktop::DisplayMode::CLOCK)) return;\n"
        "          hide_clock_bar_top_layer_widgets(nullptr, 0, nullptr, nullptr);\n"
        "          refresh_screensaver_fullscreen(id(clock_screensaver), id(dim_screensaver_touch_guard));\n"
        "          lv_obj_move_foreground(id(clock_screensaver));\n"
        "  - id: show_dimmed_view\n"
        "    then:\n"
        "      - script.execute: clock_bar_hide\n"
        "      - lambda: 'lv_obj_move_foreground(id(dim_screensaver_touch_guard));'\n"
        "      - script.execute: clock_bar_apply\n"
        "interval:\n"
        "  - interval: 1s\n"
        "    then:\n"
        "      - script.execute: clock_screensaver_keep_on_top\n",
        (
            "overlay the existing UI without closing it",
            "keep the complete clock bar visible over the dimmed home screen",
        ),
    )
    expect_clock_screensaver_overlay_errors(
        "clock screensaver overlays active UI",
        "script:\n"
        "  - id: screensaver_sleep_timer\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return screensaver_action_clock_mode(id(screensaver_action).current_option());'\n"
        "          then:\n"
        "            - script.execute: show_clock_view\n"
        "          else:\n"
        "            - lambda: |-\n"
        "                media_volume_hide_modal();\n"
        "            - script.execute: hide_cover_art_view\n"
        "  - id: show_clock_view\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          hide_clock_bar_top_layer_widgets(nullptr, 0, nullptr, nullptr);\n"
        "          lv_obj_clear_flag(id(clock_screensaver), LV_OBJ_FLAG_HIDDEN);\n"
        "          lv_obj_move_foreground(id(clock_screensaver));\n"
        "  - id: clock_screensaver_keep_on_top\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (!id(espdesktop_app).display().current_mode_is(espdesktop::DisplayMode::CLOCK)) return;\n"
        "          hide_clock_bar_top_layer_widgets(nullptr, 0, nullptr, nullptr);\n"
        "          refresh_screensaver_fullscreen(id(clock_screensaver), id(dim_screensaver_touch_guard));\n"
        "          lv_obj_move_foreground(id(clock_screensaver));\n"
        "  - id: show_dimmed_view\n"
        "    then:\n"
        "      - lambda: 'lv_obj_move_foreground(id(dim_screensaver_touch_guard));'\n"
        "      - script.execute: clock_bar_apply\n"
        "interval:\n"
        "  - interval: 1s\n"
        "    then:\n"
        "      - script.execute: clock_screensaver_keep_on_top\n",
        (),
    )
    expect_clock_screensaver_overlay_errors(
        "clock screensaver stays behind top layer UI",
        "script:\n"
        "  - id: screensaver_sleep_timer\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return screensaver_action_clock_mode(id(screensaver_action).current_option());'\n"
        "          then:\n"
        "            - script.execute: show_clock_view\n"
        "  - id: show_clock_view\n"
        "    then:\n"
        "      - lvgl.widget.show: clock_screensaver\n",
        ("raise the clock screensaver above existing top-layer UI",),
    )
    valid_schedule_screensaver_override = (
        "script:\n"
        "  - id: screensaver_idle_check\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              if (screen_schedule_night_active(\n"
        "                    id(screen_schedule_trigger).state,\n"
        "                    id(schedule_enabled).state,\n"
        "                    id(presence_detected),\n"
        "                    now.is_valid(),\n"
        "                    now.is_valid() ? now.hour : 0,\n"
        "                    (int) id(schedule_on_hour).state,\n"
        "                    (int) id(schedule_off_hour).state)) {\n"
        "                id(screen_schedule_check).execute();\n"
        "                return false;\n"
        "              }\n"
        "              return id(screensaver_mode).state == \"timer\";\n"
        "  - id: screensaver_presence_wake\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              if (screen_schedule_waiting_for_time(\n"
        "                    id(screen_schedule_trigger).state,\n"
        "                    id(schedule_enabled).state,\n"
        "                    now.is_valid()) ||\n"
        "                  screen_schedule_night_active(\n"
        "                    id(screen_schedule_trigger).state,\n"
        "                    id(schedule_enabled).state,\n"
        "                    id(presence_detected),\n"
        "                    now.is_valid(),\n"
        "                    now.is_valid() ? now.hour : 0,\n"
        "                    (int) id(schedule_on_hour).state,\n"
        "                    (int) id(schedule_off_hour).state)) {\n"
        "                id(screen_schedule_check).execute();\n"
        "                return false;\n"
        "              }\n"
        "              return id(screensaver_mode).state == \"sensor\";\n"
        "          then:\n"
        "            - if:\n"
        "                condition:\n"
        "                  lambda: |-\n"
        "                    if (!id(schedule_enabled).state) return true;\n"
        "                    return screen_schedule_normal_active(\n"
        "                      id(screen_schedule_trigger).state,\n"
        "                      id(schedule_enabled).state,\n"
        "                      id(presence_detected),\n"
        "                      now.is_valid(),\n"
        "                      now.is_valid() ? now.hour : 0,\n"
        "                      (int) id(schedule_on_hour).state,\n"
        "                      (int) id(schedule_off_hour).state);\n"
        "                then:\n"
        "            - script.execute: screensaver_wake\n"
        "  - id: screensaver_presence_sleep\n"
        "    then:\n"
        "      - script.execute: screen_schedule_check\n"
        "      - script.wait: screen_schedule_check\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(screensaver_mode).state == \"sensor\" &&\n"
        "                     !screen_schedule_sensor_trigger(\n"
        "                         id(screen_schedule_trigger).state);\n"
        "          then:\n"
        "            - script.execute: screensaver_sleep_sensor\n"
        "  - id: backlight_schedule_display_off\n"
        "    then:\n"
        "      - script.stop: cover_art_delay_timer\n"
        "      - script.execute: hide_cover_art_view\n"
    )
    valid_schedule_sleep_order = (
        "script:\n"
        "  - id: screen_schedule_sleep\n"
        "    then:\n"
        "      - globals.set:\n"
        "          id: screen_schedule_asleep\n"
        "          value: 'true'\n"
        "      - lambda: |-\n"
        "          id(espdesktop_app).display().request(\n"
        "              espdesktop::DisplayRequestSource::SCREEN_SCHEDULE,\n"
        "              espdesktop::DisplayMode::DISPLAY_OFF);\n"
        "      - script.execute: display_mode_reconcile\n"
    )
    expect_screen_schedule_screensaver_override_errors(
        "night schedule overrides timer and sensor screensaver",
        valid_schedule_screensaver_override,
        (),
        valid_schedule_sleep_order,
    )
    typed_presence_wake = valid_schedule_screensaver_override.replace(
        "            - script.execute: screensaver_wake\n",
        "            - script.execute: screen_schedule_check\n"
        "            - lambda: 'return !screen_schedule_sensor_trigger(id(screen_schedule_trigger).state);'\n"
        "            - lambda: 'return espdesktop::presence_can_wake_display(transition);'\n"
        "            - script.execute: screensaver_wake\n"
        "            - script.execute: display_mode_clear_automatic\n",
        1,
    )
    expect_screen_schedule_screensaver_override_errors(
        "typed presence wake clears hidden automatic sleep",
        typed_presence_wake,
        (),
        valid_schedule_sleep_order,
    )
    expect_screen_schedule_screensaver_override_errors(
        "typed presence wake leaves hidden automatic sleep stale",
        typed_presence_wake.replace(
            "            - script.execute: display_mode_clear_automatic\n", "", 1
        ),
        ("clear stale automatic sleep",),
        valid_schedule_sleep_order,
    )
    migrated_schedule_reconcile = (
        valid_schedule_screensaver_override
        + "  - id: display_mode_reconcile\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (schedule_night) {\n"
        "            controller.request(espdesktop::DisplayRequestSource::SCREEN_SCHEDULE,\n"
        "                               espdesktop::DisplayMode::CLOCK);\n"
        "            if (id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART)) {\n"
        "              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) = false;\n"
        "              id(hide_cover_art_view).execute();\n"
        "            }\n"
        "          }\n"
    )
    expect_screen_schedule_screensaver_override_errors(
        "migrated schedule clears active cover art",
        migrated_schedule_reconcile,
        (),
        valid_schedule_sleep_order,
    )
    expect_screen_schedule_screensaver_override_errors(
        "schedule display-off reconciles before publishing its marker",
        valid_schedule_screensaver_override,
        ("set the schedule-asleep marker before reconciling display-off",),
        valid_schedule_sleep_order.replace(
            "      - globals.set:\n"
            "          id: screen_schedule_asleep\n"
            "          value: 'true'\n",
            "",
            1,
        ),
    )
    expect_screen_schedule_screensaver_override_errors(
        "timer screensaver bypasses night schedule",
        valid_schedule_screensaver_override.replace(
            "                id(screen_schedule_check).execute();\n"
            "                return false;\n"
            "              }\n"
            "              return id(screensaver_mode).state == \"timer\";\n",
            "                std::string mode = id(schedule_mode).current_option();\n"
            "                if (screen_schedule_clock_mode(mode)) return false;\n"
            "              }\n"
            "              return id(screensaver_mode).state == \"timer\";\n",
            1,
        ),
        ("override timer screensaver actions",),
    )
    expect_screen_schedule_screensaver_override_errors(
        "sensor screensaver wake bypasses night schedule",
        valid_schedule_screensaver_override.replace(
            "              if (screen_schedule_waiting_for_time(\n"
            "                    id(screen_schedule_trigger).state,\n"
            "                    id(schedule_enabled).state,\n"
            "                    now.is_valid()) ||\n"
            "                  screen_schedule_night_active(\n"
            "                    id(screen_schedule_trigger).state,\n"
            "                    id(schedule_enabled).state,\n"
            "                    id(presence_detected),\n"
            "                    now.is_valid(),\n"
            "                    now.is_valid() ? now.hour : 0,\n"
            "                    (int) id(schedule_on_hour).state,\n"
            "                    (int) id(schedule_off_hour).state)) {\n"
            "                id(screen_schedule_check).execute();\n"
            "                return false;\n"
            "              }\n",
            "",
            1,
        ),
        ("override sensor screensaver wake",),
    )
    expect_screen_schedule_screensaver_override_errors(
        "sensor screensaver wake ignores disabled schedule",
        valid_schedule_screensaver_override.replace(
            "                    if (!id(schedule_enabled).state) return true;\n",
            "",
            1,
        ),
        ("wake when the screen schedule is disabled",),
    )
    expect_artwork_image_auth_errors(
        "local artwork image request uses Basic auth",
        "std::shared_ptr<http_request::HttpContainer> ArtworkImage::get_local_idf_(\n"
        "    const std::string &url, const std::vector<http_request::Header> &headers) {\n"
        "  esp_http_client_config_t config = {};\n"
        "  config.auth_type = HTTP_AUTH_TYPE_BASIC;\n"
        "  if (container->status_code <= 0 && is_ha_media_proxy_url(url)) {\n"
        "    ESP_LOGW(TAG, \"Home Assistant media proxy returned an unknown HTTP status; trying artwork bytes anyway\");\n"
        "    container->status_code = HTTP_CODE_OK;\n"
        "  }\n"
        "}\n",
        (
            "keep local Home Assistant image proxy requests off HTTP Basic auth",
            "explicitly disable HTTP auth for local artwork requests",
        ),
    )
    expect_artwork_image_auth_errors(
        "local artwork image request disables HTTP auth",
        "std::shared_ptr<http_request::HttpContainer> ArtworkImage::get_local_idf_(\n"
        "    const std::string &url, const std::vector<http_request::Header> &headers) {\n"
        "  esp_http_client_config_t config = {};\n"
        "  config.auth_type = HTTP_AUTH_TYPE_NONE;\n"
        "  if (container->status_code <= 0 && is_ha_media_proxy_url(url)) {\n"
        "    ESP_LOGW(TAG, \"Home Assistant media proxy returned an unknown HTTP status; trying artwork bytes anyway\");\n"
        "    container->status_code = HTTP_CODE_OK;\n"
        "  }\n"
        "}\n"
        "void ArtworkImage::end_connection_() {\n"
        "  this->download_buffer_.shrink_to(0);\n"
        "}\n",
        (),
    )
    expect_artwork_image_auth_errors(
        "local artwork image request rejects unknown HA media proxy status",
        "std::shared_ptr<http_request::HttpContainer> ArtworkImage::get_local_idf_(\n"
        "    const std::string &url, const std::vector<http_request::Header> &headers) {\n"
        "  esp_http_client_config_t config = {};\n"
        "  config.auth_type = HTTP_AUTH_TYPE_NONE;\n"
        "}\n",
        ("allow Home Assistant media proxy artwork to fall back to image-byte detection",),
    )
    expect_s3_api_errors(
        "low S3 API queue",
        "api:\n  max_connections: 3\n  max_send_queue: 8\n",
        ("keep the S3 native API send queue high enough",),
    )
    expect_s3_api_errors(
        "low S3 API connections",
        "api:\n  max_connections: 2\n  max_send_queue: 12\n",
        ("keep enough S3 native API slots",),
    )
    expect_s3_api_errors(
        "S3 includes navigate API package",
        "api:\n  max_connections: 3\n  max_send_queue: 12\n",
        (),
        s3_packages_text="packages:\n  api_navigate: !include ../../common/device/api_navigate.yaml\n",
    )
    expect_s3_api_errors(
        "S3 missing navigate API package",
        "api:\n  max_connections: 3\n  max_send_queue: 12\n",
        ("include the Home Assistant navigate API action on S3",),
    )
    expect_s3_api_errors(
        "navigate action left in shared core",
        "api:\n  max_connections: 3\n  max_send_queue: 12\n",
        ("keep the navigate action out of core_infra",),
        core_text="api:\n  actions:\n    - action: navigate\n",
    )
    expect_s3_api_errors(
        "P4 package missing navigate API package",
        "api:\n  max_connections: 3\n  max_send_queue: 12\n",
        ("include the dedicated Home Assistant navigate API package",),
        extra_packages={"esp32-p4-86": "packages:\n  device: !include device/device.yaml\n"},
    )
    expect_navigation_target_errors(
        "home card navigation targets",
        "struct NavigationHomeTargetEntry {};\n"
        "inline auto navigation_home_targets() {}\n"
        "inline void navigation_find_label_target() { navigation_home_targets(); entry.display_order < best->display_order; }\n"
        "inline void navigation_find_slot_target() { entry.slot == slot; }\n"
        "inline void navigation_activate_home_target() { navigation_return_home(main_page_obj); handle_button_click(target->config, target->slot, target->button); }\n"
        "inline void espdesktop_navigate() { normalized == \"home\" || normalized == \"main\"; }\n",
        "navigation_clear_home_targets();\n"
        "navigation_register_home_target(idx, pos, p.label, scfg, s.btn);\n"
        "navigation_clear_home_targets();\n"
        "navigation_register_home_target(idx, pos, p.label, s.config->state, s.btn);\n",
        "inline bool navigation_driver_own_subpage() { navigation_register_subpage( }\n",
        "espdesktop_navigate(target, id(main_page)->obj);\n",
        {},
        (),
        (),
    )
    expect_connectivity_api_errors(
        "raw api connected navigation",
        "wifi:\n"
        "  on_connect:\n"
        "    - if:\n"
        "        condition:\n"
        "          api.connected:\n"
        "api:\n"
        "  on_client_connected:\n"
        "    - script.execute: navigate_after_api\n",
        ("wait for Home Assistant state subscription", "only navigate after a Home Assistant state connection"),
    )
    expect_wifi_setup_display_text_errors(
        "raw WiFi setup display names",
        "lv_label_set_text(id(loading_status_label), msg.c_str());\n",
        "lv_label_set_text(id(wifi_setup_instructions), msg.c_str());\n",
        "lv_label_set_text(id(wifi_setup_instructions), msg.c_str());\n",
        (
            "common/device/screen_loading.yaml: normalize user-controlled WiFi setup names",
            "common/device/screen_wifi_setup.yaml: normalize user-controlled WiFi setup names",
            "common/addon/connectivity.yaml: normalize user-controlled WiFi setup names",
        ),
    )
    expect_wifi_setup_display_text_errors(
        "normalized WiFi setup display names",
        "lv_label_set_display_text(id(loading_status_label), msg.c_str());\n",
        "lv_label_set_display_text(id(wifi_setup_instructions), msg.c_str());\n",
        "lv_label_set_display_text(id(wifi_setup_instructions), msg.c_str());\n",
        (),
    )
    expect_connectivity_api_errors(
        "home assistant state connected navigation",
        "wifi:\n"
        "  on_connect:\n"
        "    - if:\n"
        "        condition:\n"
        "          lambda: 'return ha_api_state_connected();'\n"
        "script:\n"
        "  - id: ha_restore_after_api\n"
        "    mode: restart\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return id(espdesktop_app).connector_onboarding_complete();'\n"
        "          then:\n"
        "            - script.execute: navigate_after_api\n",
        (),
    )
    expect_connectivity_api_errors(
        "removed home assistant reconnect screen",
        "wifi:\n"
        "  on_connect:\n"
        "    - if:\n"
        "        condition:\n"
        "          lambda: 'return ha_api_state_connected();'\n"
        "api:\n"
        "  on_client_connected:\n"
        "    - script.stop: ha_reconnect_flow\n"
        "    - script.execute: ha_restore_after_api\n"
        "script:\n"
        "  - id: ha_restore_after_api\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return ha_api_connected();'\n"
        "          then:\n"
        "            - if:\n"
        "                condition:\n"
        "                  lambda: 'return lv_scr_act() == id(ha_setup_page)->obj;'\n"
        "                then:\n"
        "                  - script.execute: navigate_after_api\n"
        "  - id: ha_reconnect_flow\n"
        "    then:\n"
        "      - lambda: 'lv_label_set_text(id(ha_setup_title), espdesktop_i18n(\"Connecting to\\nHome Assistant\"));'\n"
        "      - lvgl.page.show: ha_setup_page\n",
        ("keep the current display visible",),
    )
    print("Firmware Home Assistant binding self-tests passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run guardrail self-tests")
    args = parser.parse_args()
    return run_self_test() if args.self_test else run_scan()


if __name__ == "__main__":
    raise SystemExit(main())
