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
COVER_ART_PATH = ROOT / "common" / "device" / "screen_cover_art.yaml"
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
    return weather_path if weather_path.exists() else firmware_dir / "button_grid_config.h"


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






def firmware_local_sensor_binding_order_errors(firmware_dir: Path, root: Path) -> list[str]:
    grid_path = firmware_dir / "button_grid_grid.h"
    driver_path = firmware_dir / "button_grid_sensor_driver.h"
    if not grid_path.exists():
        return []
    grid_rel = grid_path.relative_to(root)
    grid_text = grid_path.read_text(encoding="utf-8")
    errors: list[str] = []

    if not driver_path.exists():
        errors.append(f"{grid_rel}: bind local sensor subtypes through the shared sensor driver")
        return errors

    driver_rel = driver_path.relative_to(root)
    driver_text = driver_path.read_text(encoding="utf-8")
    bind_match = re.search(
        r"inline\s+bool\s+sensor_driver_bind_data\s*\([^)]*\)\s*\{(?P<body>.*?)\n\}",
        driver_text,
        re.DOTALL,
    )
    if bind_match is None:
        errors.append(f"{driver_rel}: keep local sensor binding in sensor_driver_bind_data")
    else:
        bind_body = bind_match.group("body")
        local_start = bind_body.find("if (sensor_driver_is_local(config, context))")
        ha_text_start = bind_body.find("if (is_text_sensor_card(config))")
        ha_sensor_start = bind_body.find("if (!config.sensor.empty())")
        if local_start < 0 or "sensor_driver_register_local_value(slot, config)" not in bind_body:
            errors.append(f"{driver_rel}: bind local sensor values through the local registry")
        elif any(start >= 0 and local_start > start for start in (ha_text_start, ha_sensor_start)):
            errors.append(f"{driver_rel}: bind local sensor values before Home Assistant sensor subscriptions")

    if "sensor_driver_bind_data(" not in grid_text:
        errors.append(f"{grid_rel}: bind sensor cards through the shared sensor driver")

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
        errors.append(f"{rel}: missing send_cover_command_action helper")
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


def firmware_cover_art_external_input_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    if "cover_art_hide_external_input_enabled" not in text:
        errors.append(f"{rel}: expose a cover art external-input hide setting")
    if ('std::string("source")' not in text or
            "handle_media_source" not in text or
            "HA_SUBSCRIPTION_SCOPE_COVER_ART" not in text):
        errors.append(f"{rel}: subscribe to the media player source attribute")
    if "ha_reset_subscription_callbacks(HA_SUBSCRIPTION_SCOPE_COVER_ART)" not in text:
        errors.append(f"{rel}: release retired cover art Home Assistant subscriptions")
    resubscribe_body = yaml_script_body(text, "cover_art_resubscribe") or ""
    if "ha_get_" in resubscribe_body:
        errors.append(f"{rel}: avoid retained one-shot reads in the cover art subscription lifecycle")
    if resubscribe_body and (
        "primary_entity != id(cover_art_subscribed_primary_entity)" not in resubscribe_body
        or "secondary_entity != id(cover_art_subscribed_secondary_entity)" not in resubscribe_body
        or "id(cover_art_primary_external_input_active) = false" not in resubscribe_body
    ):
        errors.append(f"{rel}: reset cached route probes when configured cover art entities change")
    if ("espdesktop::cover_art::external_media_source" not in text or
            "espdesktop::cover_art::use_secondary_media_entity" not in text):
        errors.append(f"{rel}: use the shared TV, line-in, and HDMI media-entity router")
    if "cover_art_apply_external_input_policy" not in text:
        errors.append(f"{rel}: centralize cover art external-input behavior")
    if "script.stop: cover_art_request_artwork" not in text:
        errors.append(f"{rel}: stop pending artwork requests while an external input is active")
    if "id(cover_art_hide_external_input_enabled).state &&" not in text:
        errors.append(f"{rel}: guard cover art start/download paths when external input hiding is enabled")
    return errors


def firmware_cover_art_stale_image_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    script_match = re.search(
        r"(?ms)^  - id: cover_art_show_black_screen\n(?P<body>.*?)(?=^  - id: |\Z)",
        text,
    )
    if not script_match:
        errors.append(f"{rel}: keep a black fallback for cover art with no current image")
        return errors

    body = script_match.group("body")
    if "lvgl.widget.hide: cover_art_image_widget" not in body:
        errors.append(f"{rel}: hide stale cover art image when the black fallback is shown")
    if "id(cover_art_runtime).loaded_url.empty()" in body:
        errors.append(f"{rel}: hide stale cover art image even after previous artwork loaded")
    if "cover_art_error_label" in text or 'text: "Artwork unavailable"' in text:
        errors.append(f"{rel}: do not show an unavailable cover art message")
    return errors


def firmware_cover_art_refresh_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    if re.search(r"\bha_get_(?:state|attribute)\s*\(", text):
        errors.append(f"{rel}: use retained Home Assistant reads instead of one-shot helpers")

    required_state = (
        ("cover_art_runtime).refresh_needed", "track/source metadata changes as stale artwork"),
        ("cover_art_runtime).effective_download_url", "keep source artwork URLs separate from downloader URLs"),
        ("espdesktop::cover_art::RuntimeState", "own cover art lifecycle state in one controller"),
        ("cover_art_album", "track album names for artwork refresh decisions"),
    )
    for token, message in required_state:
        if token not in text:
            errors.append(f"{rel}: {message}")

    download_body = yaml_script_body(text, "cover_art_download")
    if not download_body:
        errors.append(f"{rel}: missing cover_art_download script")
    else:
        if "/api/media_player_proxy/" not in download_body:
            errors.append(f"{rel}: only cache-bust Home Assistant media proxy artwork URLs")
        if "?time=" not in download_body or "&time=" not in download_body:
            errors.append(f"{rel}: add a refresh marker that preserves existing artwork query strings")
        if "request_update_url(id(cover_art_runtime).effective_download_url)" not in download_body:
            errors.append(f"{rel}: download through the refresh-aware artwork URL")
        if (
            "const bool replacing_active_download = id(cover_art_runtime).download_active();" not in download_body
            or 'replacing_active_download ? "Re-queuing" : "Downloading"' not in download_body
        ):
            errors.append(f"{rel}: coalesce changed cover art URLs into the queued image request")
        if (
            "needs_artwork_refresh" not in download_body
            or "id(cover_art_runtime).refresh_needed || !id(cover_art_runtime).image_available" not in download_body
        ):
            errors.append(f"{rel}: refresh Home Assistant media proxy artwork when no image is currently available")
        replacement_match = re.search(
            r"(?ms)target_mode_is\(espdesktop::DisplayMode::COVER_ART\).*?"
            r"id\(cover_art_runtime\)\.image_available.*?"
            r"id\(cover_art_runtime\)\.refresh_needed.*?"
            r"!\$\{cover_art_live_image_updates\}.*?"
            r"then:\n(?P<body>.*?)(?=^\s+- lambda: |\Z)",
            download_body,
        )
        if not replacement_match:
            errors.append(f"{rel}: keep a dedicated replacement artwork transition path")
        else:
            replacement_body = replacement_match.group("body")
            if "script.execute: cover_art_show_track_overlay" not in replacement_body:
                errors.append(f"{rel}: keep the current artwork visible with updated track text during replacement downloads")
            if "script.execute: cover_art_show_black_screen" in replacement_body:
                errors.append(f"{rel}: do not use the full black fallback for replacement artwork downloads")
            if "script.execute: cover_art_clear_image_source" in replacement_body:
                errors.append(f"{rel}: do not detach visible artwork before replacement artwork is ready")
            if "artwork_image.release: cover_art_downloaded_image" in replacement_body:
                errors.append(f"{rel}: do not release visible artwork before replacement artwork is ready")
            if "id(cover_art_runtime).loaded_url.clear()" in replacement_body:
                errors.append(f"{rel}: keep the previous loaded artwork marker until replacement artwork applies")

    for script_id in ("cover_art_deferred_download", "cover_art_prepare_download"):
        body = yaml_script_body(text, script_id)
        if not body:
            errors.append(f"{rel}: missing {script_id} script")
        elif "id(cover_art_runtime).refresh_needed" not in body:
            errors.append(f"{rel}: let {script_id} refresh unchanged artwork URLs after metadata changes")

    for script_id in ("cover_art_use_cached_artwork", "cover_art_request_artwork"):
        body = yaml_script_body(text, script_id)
        if not body:
            errors.append(f"{rel}: missing {script_id} script")
        elif (
            "chosen == id(cover_art_runtime).source_url" not in body
            or "!id(cover_art_runtime).image_available || id(cover_art_runtime).refresh_needed" not in body
        ):
            errors.append(f"{rel}: do not exit early from {script_id} when stale artwork needs refresh")

    cached_body = yaml_script_body(text, "cover_art_use_cached_artwork")
    if cached_body and "id(cover_art_runtime).select_source(chosen);" not in cached_body:
        errors.append(f"{rel}: mark changed cached artwork URLs as stale before downloading")
    resubscribe_body = yaml_script_body(text, "cover_art_resubscribe") or ""
    for attribute in ("entity_picture", "entity_picture_local"):
        retained_subscription = re.search(
            rf'ha_subscribe_attribute\(\s*cover_entity,\s*std::string\("{attribute}"\),'
            rf'[\s\S]{{0,700}}?HA_SUBSCRIPTION_SCOPE_COVER_ART,\s*true\s*\)',
            resubscribe_body,
        )
        if not retained_subscription:
            errors.append(
                f"{rel}: retain {attribute} so artwork refreshes never register one-shot callbacks"
            )
    artwork_refresh_body = (
        resubscribe_body +
        (yaml_script_body(text, "cover_art_request_paired_artwork") or "")
    )
    if artwork_refresh_body and "if (!url.empty() && url != id(cover_art_runtime).source_url)" not in artwork_refresh_body:
        errors.append(f"{rel}: mark changed Home Assistant artwork attributes as stale")

    base_url_body = yaml_script_body(text, "cover_art_resolve_home_assistant_base_url") or ""
    if (
        "rebuild_relative_artwork_url" not in base_url_body
        or "id(cover_art_runtime).sources.remote_url" not in base_url_body
        or "id(cover_art_runtime).sources.local_url" not in base_url_body
        or "id(cover_art_remote_source_relative)" not in base_url_body
        or "id(cover_art_local_source_relative)" not in base_url_body
        or "id(cover_art_process_cached_artwork).execute();" not in base_url_body
    ):
        errors.append(f"{rel}: rebuild cached full-screen artwork URLs when the Home Assistant base URL changes")

    apply_body = yaml_script_body(text, "cover_art_apply_downloaded_image")
    if not apply_body:
        errors.append(f"{rel}: missing cover_art_apply_downloaded_image script")
    else:
        if "expected_url" not in apply_body or "id(cover_art_runtime).effective_download_url" not in apply_body:
            errors.append(f"{rel}: accept the refresh-aware downloader URL when artwork finishes")
        if "id(cover_art_runtime).apply_download(completed_url)" not in apply_body:
            errors.append(f"{rel}: remember the clean source artwork URL after a download")
        if "id(cover_art_runtime).apply_download(completed_url)" not in apply_body:
            errors.append(f"{rel}: clear stale artwork state only after a replacement image applies")
        if (
            "script.execute: cover_art_clear_image_source" not in apply_body
            or "script.wait: cover_art_clear_image_source" not in apply_body
        ):
            errors.append(f"{rel}: detach the previous LVGL artwork source before showing a replacement image")

    if text.count("mark_artwork_refresh_needed();") < 4:
        errors.append(f"{rel}: mark title, artist, album, and source changes as artwork refresh triggers")
    if ('std::string("media_album_name")' not in resubscribe_body or
            "handle_media_album" not in resubscribe_body):
        errors.append(f"{rel}: subscribe to the media_album_name attribute")
    if "id(cover_art_runtime).refresh_needed = true" not in text:
        errors.append(f"{rel}: set stale artwork state when track/source metadata changes")
    playback_started_body = yaml_script_body(text, "cover_art_playback_started")
    if not playback_started_body:
        errors.append(f"{rel}: missing cover_art_playback_started script")
    elif (
        "!id(cover_art_runtime).image_available" not in playback_started_body
        or "id(cover_art_runtime).retry_count = 0" not in playback_started_body
        or "id(cover_art_runtime).retry_url.clear()" not in playback_started_body
    ):
        errors.append(f"{rel}: reset artwork retry state when playback resumes without a visible image")
    if playback_started_body and "espdesktop::cover_art::display_allowed(" in playback_started_body:
        errors.append(f"{rel}: let the playback-start event activate cover art before mirrored playback state settles")
    sync_text_body = yaml_script_body(text, "cover_art_sync_track_text")
    source_display_normalized = sync_text_body is not None and re.search(
        r"const std::string title\s*=\s*espdesktop::media::normalize_media_display_text\(\s*"
        r"id\(cover_art_external_input_active\) && !id\(cover_art_media_source\)\.empty\(\)\s*"
        r"\? decode_html_entities\(id\(cover_art_media_source\)\)\s*"
        r": id\(cover_art_title\)\);",
        sync_text_body,
    )
    title_display_normalized = source_display_normalized and "normalize_display_text(title)" in sync_text_body
    artist_display_normalized = sync_text_body is not None and re.search(
        r"const std::string artist\s*=\s*espdesktop::media::normalize_media_display_text\(\s*"
        r"id\(cover_art_artist\)\);",
        sync_text_body,
    ) and "normalize_display_text(artist)" in sync_text_body
    if sync_text_body is not None and (
        not title_display_normalized
        or not artist_display_normalized
        or source_display_normalized is None
    ):
        errors.append(f"{rel}: normalize decoded cover art metadata only at the label boundary")
    pause_body = yaml_script_body(text, "cover_art_pause_after_touch")
    if pause_body is not None and (
        "target_mode_is(espdesktop::DisplayMode::COVER_ART)" not in pause_body
        or "id(cover_art_manual_pause_until_ms) != 0" not in pause_body
        or "id(cover_art_manual_pause_until_ms) = 1;" not in pause_body
    ):
        errors.append(
            f"{rel}: arm cover art return after dismissal and restart its countdown after every touch"
        )
    return errors


def firmware_cover_art_playback_grace_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []

    delayed_body = yaml_script_body(text, "cover_art_delayed_playback_stopped")
    if not delayed_body:
        errors.append(f"{rel}: buffer brief non-playing states between tracks")
    else:
        if "delay: 2s" not in delayed_body:
            errors.append(f"{rel}: keep the cover art stop grace period at two seconds")
        if "script.execute: cover_art_playback_stopped" not in delayed_body:
            errors.append(f"{rel}: apply a sustained playback stop after the grace period")
        if (
            'state != "playing"' not in delayed_body
            or 'state != "buffering"' not in delayed_body
            or 'state != "paused"' not in delayed_body
        ):
            errors.append(f"{rel}: recheck playback before applying a delayed stop")

    if "id(cover_art_delayed_playback_stopped).execute(" not in text:
        errors.append(f"{rel}: delay non-playing playback transitions")
    if not re.search(
        r"id\(cover_art_delay_interrupted_by_transition\)\s*=\s*"
        r"id\(cover_art_delay_interrupted_by_transition\)\s*\|\|\s*"
        r"id\(cover_art_delay_timer\)\.is_running\(\);\s+"
        r"id\(cover_art_delay_timer\)\.stop\(\);\s+"
        r"id\(cover_art_delayed_playback_stopped\)\.execute\([^;]*\);",
        text,
    ):
        errors.append(f"{rel}: remember and cancel a pending cover art opening when playback stops")
    if (
        "bool restart_cover_art_delay = id(cover_art_delay_interrupted_by_transition);" not in text
        or "if (!was_playing || restart_cover_art_delay) id(cover_art_playback_started).execute();" not in text
    ):
        errors.append(f"{rel}: restart an interrupted cover art opening when playback resumes")
    if text.count("id(cover_art_delayed_playback_stopped).stop();") < 2:
        errors.append(f"{rel}: cancel a pending stop when playback resumes or pauses")
    if "url.empty() && id(cover_art_delayed_playback_stopped).is_running()" not in text:
        errors.append(f"{rel}: keep cached artwork when Home Assistant clears it during a brief playback transition")
    else:
        cached_guard = text.find(
            "url.empty() && id(cover_art_delayed_playback_stopped).is_running()"
        )
        relative_markers = (
            text.find("id(cover_art_local_source_relative) = relative;"),
            text.find("id(cover_art_remote_source_relative) = relative;"),
        )
        if any(marker < 0 or marker < cached_guard for marker in relative_markers):
            errors.append(
                f"{rel}: retain cached artwork's relative marker during a brief playback transition"
            )

    stopped_body = yaml_script_body(text, "cover_art_playback_stopped")
    if not stopped_body or "script.stop: cover_art_delayed_playback_stopped" not in stopped_body:
        errors.append(f"{rel}: cancel pending playback grace during an immediate stop")
    return errors


def firmware_cover_art_disable_errors(path: Path, root: Path) -> list[str]:
    if not path.exists():
        return []
    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    body = yaml_script_body(text, "cover_art_disable")
    if not body:
        errors.append(f"{rel}: missing cover_art_disable script")
    elif "switch.turn_off: media_player_sleep_prevention_enabled" in body:
        errors.append(f"{rel}: keep media sleep prevention independent when cover art is disabled")
    return errors


def firmware_cover_art_lifecycle_controller_errors(
    backlight_path: Path, cover_art_path: Path, root: Path
) -> list[str]:
    if not backlight_path.exists() or not cover_art_path.exists():
        return []
    backlight_rel = backlight_path.relative_to(root)
    cover_art_rel = cover_art_path.relative_to(root)
    backlight_text = backlight_path.read_text(encoding="utf-8")
    cover_art_text = cover_art_path.read_text(encoding="utf-8")
    errors: list[str] = []

    adapter = yaml_script_body(backlight_text, "display_mode_apply_transition") or ""
    request = yaml_script_body(backlight_text, "display_mode_request_cover_art") or ""
    clear = yaml_script_body(backlight_text, "display_mode_clear_cover_art") or ""
    reconcile = yaml_script_body(backlight_text, "display_mode_reconcile") or ""
    effect = yaml_script_body(cover_art_text, "display_mode_effect_cover_art") or ""
    hide_effect = yaml_script_body(cover_art_text, "cover_art_hide_effect") or ""
    hide_adapter = yaml_script_body(cover_art_text, "hide_cover_art_view") or ""
    disable = yaml_script_body(cover_art_text, "cover_art_disable") or ""
    playback_restore = yaml_script_body(
        cover_art_text, "cover_art_return_home_after_playback"
    ) or ""

    adapter_markers = (
        "target_mode == static_cast<int>(espdesktop::DisplayMode::COVER_ART)",
        "id: display_mode_effect_cover_art",
        "id: cover_art_hide_effect",
    )
    if (
        any(marker not in adapter for marker in adapter_markers)
        or "complete_transition(" not in adapter
        or "espdesktop::DisplayMode::COVER_ART);" not in adapter
    ):
        errors.append(f"{backlight_rel}: route cover art presentation exclusively through the display adapter")
    if (
        "DisplayRequestSource::MEDIA_PLAYBACK" not in request
        or "DisplayMode::COVER_ART" not in request
        or "script.execute: display_mode_reconcile" not in request
        or "script.wait: display_mode_reconcile" not in request
        or "script.wait: display_mode_apply_transition" not in request
    ):
        errors.append(f"{backlight_rel}: create cover art through a controller media request")
    if (
        "DisplayRequestSource::MEDIA_PLAYBACK" not in clear
        or ".clear(" not in clear
        or "script.execute: display_mode_reconcile" not in clear
        or "script.wait: display_mode_reconcile" not in clear
        or "script.wait: display_mode_apply_transition" not in clear
    ):
        errors.append(f"{backlight_rel}: dismiss cover art by clearing its controller media request")
    if (
        "script.execute: display_mode_clear_cover_art" not in hide_adapter
        or "script.wait: display_mode_clear_cover_art" not in hide_adapter
    ):
        errors.append(
            f"{cover_art_rel}: keep hide_cover_art_view synchronous for compatibility callers"
        )
    if "script.wait: display_mode_clear_cover_art" not in disable:
        errors.append(f"{cover_art_rel}: wait for controller dismissal before releasing cover art resources")
    if "script.wait: display_mode_clear_cover_art" not in playback_restore:
        errors.append(f"{cover_art_rel}: wait for controller dismissal before restoring playback UI")
    if re.search(r"(?:set_request|controller\.request)\(\s*espdesktop::DisplayRequestSource::MEDIA_PLAYBACK", reconcile):
        errors.append(f"{backlight_rel}: do not rebuild media requests from the compatibility cover art flag")
    if (
        "previous_cover_generation" not in reconcile
        or "id(cover_art_transition_generation) = transition.generation" not in reconcile
        or "id(cover_art_download_generation) = transition.generation" not in reconcile
        or "!transition_required" not in reconcile
    ):
        errors.append(
            f"{backlight_rel}: preserve active cover art across lower-priority generation changes"
        )

    transition_lifecycle_markers = (
        "controller.transition_in_progress(transition)",
        "id(display_mode_apply_transition).is_running()",
        "controller.transition_warning_due(millis(), 2000)",
        "controller.cancel_transition()",
        "controller.presentation_incomplete()",
        "controller.start_transition(transition, millis())",
    )
    if any(marker not in reconcile for marker in transition_lifecycle_markers):
        errors.append(
            f"{backlight_rel}: track in-flight display effects so periodic reconciliation cannot restart them"
        )

    if "cover_art_screensaver_active" in cover_art_text or "cover_art_screensaver_active" in backlight_text:
        errors.append(f"{cover_art_rel}: use controller mode ownership instead of a compatibility cover art flag")

    if (
        "transition_is_current(" not in effect
        or "espdesktop::DisplayMode::COVER_ART" not in effect
        or "lv_obj_move_foreground(id(cover_art_screensaver))" not in effect
    ):
        errors.append(f"{cover_art_rel}: guard the controller-owned cover art effect by transition generation")
    if "transition_is_current(" not in hide_effect:
        errors.append(f"{cover_art_rel}: guard cover art hide by the current transition generation")

    guarded_scripts = {
        "cover_art_delay_timer": "generation_is_current(",
        "cover_art_apply_downloaded_image": "cover_art_download_generation",
        "cover_art_deferred_download": "transition_is_current(",
        "cover_art_retry_download": "cover_art_download_generation",
        "cover_art_refresh_progress": "transition_is_current(",
        "cover_art_delayed_playback_stopped": "generation_is_current(",
    }
    if "cover_art_refresh_source" in cover_art_text:
        guarded_scripts = {
            "cover_art_delay_timer": "generation_is_current(",
            "cover_art_prepare_activation": "source_generation",
            "cover_art_request_artwork": "transition_is_current(",
            "cover_art_refresh_progress": "transition_is_current(",
        }
    for script_id, marker in guarded_scripts.items():
        body = yaml_script_body(cover_art_text, script_id) or ""
        if marker not in body:
            errors.append(f"{cover_art_rel}: guard {script_id} against obsolete display generations")
    stopped_body = yaml_script_body(cover_art_text, "cover_art_delayed_playback_stopped") or ""
    if (
        "id: cover_art_media_playing" not in stopped_body
        or "id: cover_art_delay_interrupted_by_transition" not in stopped_body
        or "script.execute: display_mode_clear_cover_art" not in stopped_body
        or "script.wait: display_mode_clear_cover_art" not in stopped_body
    ):
        errors.append(
            f"{cover_art_rel}: retire stopped playback state before clearing an obsolete cover art request"
        )
    return errors


def firmware_media_sleep_prevention_errors(
    backlight_path: Path, display_path: Path, cover_art_path: Path, root: Path
) -> list[str]:
    errors: list[str] = []

    if backlight_path.exists():
        rel = backlight_path.relative_to(root)
        text = backlight_path.read_text(encoding="utf-8")
        idle_body = yaml_script_body(text, "screensaver_idle_check")
        if idle_body is None:
            errors.append(f"{rel}: missing screensaver_idle_check script")
        else:
            if (
                "id(cover_art_screensaver_enabled).state &&" not in idle_body
                or "id(media_player_sleep_prevention_enabled).state &&" not in idle_body
                or "id(cover_art_media_playing)" not in idle_body
            ):
                errors.append(
                    f"{rel}: keep media playback awake only while cover art and media sleep prevention are enabled"
                )
            if re.search(
                r"\(id\(media_player_sleep_prevention_enabled\)\.state\s*\|\|\s*"
                r"id\(cover_art_screensaver_enabled\)\.state\)\s*&&\s*"
                r"id\(cover_art_media_playing\)",
                idle_body,
            ):
                errors.append(f"{rel}: require both cover art and media sleep prevention to keep the idle timer awake")
        sleep_body = yaml_script_body(text, "screensaver_sleep_timer")
        if sleep_body is not None:
            if "id(cover_art_media_playing)" in sleep_body and not re.search(
                r"id\(cover_art_last_playback_state\)[\s\S]{0,360}"
                r'state != "playing"[\s\S]{0,120}'
                r'state != "buffering"[\s\S]{0,120}'
                r'state != "paused"[\s\S]{0,240}'
                r"script\.execute:\s*screensaver_idle_check",
                sleep_body,
            ):
                errors.append(f"{rel}: keep the normal screensaver idle during cover art stop grace")
            cover_art_sleep_match = re.search(
                r"id\(cover_art_screensaver_enabled\)\.state[\s\S]{0,360}?"
                r"id\(cover_art_media_playing\)[\s\S]{0,360}?"
                r"then:\s*\n\s*-\s*script\.execute:\s*([a-zA-Z0-9_]+)",
                sleep_body,
            )
            if cover_art_sleep_match and cover_art_sleep_match.group(1) != "show_cover_art_view":
                errors.append(f"{rel}: start cover art directly after the normal screensaver timeout")
        if "const bool cover_art_immediate_return" in text:
            errors.append(f"{rel}: remove the retired immediate cover art return path")
        if "const bool cover_art_disabled_mode_delay" in text and (
            'id(screensaver_mode).state != "timer"' not in text
            or 'id(screensaver_mode).state != "sensor"' not in text
            or "show_after_seconds > 0.0f" not in text
            or "if (show_after_seconds < 3.0f) show_after_seconds = 3.0f;" not in text
        ):
            errors.append(f"{rel}: restart positive Show After delay after touches in disabled screensaver mode")

        takeover_restore_body = yaml_script_body(text, "display_takeover_resume_restore")
        if takeover_restore_body is not None and "script.execute: show_cover_art_view" in takeover_restore_body:
            if (
                "id(cover_art_last_playback_state)" not in takeover_restore_body
                or 'state == "playing"' not in takeover_restore_body
                or 'state == "buffering"' not in takeover_restore_body
            ):
                errors.append(f"{rel}: keep takeover restore from showing cover art during stop grace")

    if display_path.exists():
        rel = display_path.relative_to(root)
        text = display_path.read_text(encoding="utf-8")
        if "switch.turn_on: media_player_sleep_prevention_enabled" in text:
            errors.append(f"{rel}: do not turn on media sleep prevention when cover art is enabled")
        if re.search(r"(?m)^\s+id: media_player_sleep_prevention_enabled\s*$", text):
            sleep_prevention_index = text.find("id: media_player_sleep_prevention_enabled")
            sleep_prevention_end = text.find("\n  - platform:", sleep_prevention_index + 1)
            sleep_prevention_body = text[sleep_prevention_index:sleep_prevention_end]
            if "restore_mode: RESTORE_DEFAULT_ON" not in sleep_prevention_body:
                errors.append(f"{rel}: default media sleep prevention on")
            migration_tokens = (
                "id: media_player_sleep_prevention_default_on_migrated",
                "if (!id(media_player_sleep_prevention_default_on_migrated))",
                "id(media_player_sleep_prevention_enabled).turn_on();",
                "id(media_player_sleep_prevention_default_on_migrated) = true;",
            )
            if any(token not in text for token in migration_tokens):
                errors.append(f"{rel}: migrate media sleep prevention on exactly once")
        if re.search(r"(?m)^\s+id: cover_art_delay\s*$", text):
            cover_art_delay_index = text.find("id: cover_art_delay")
            cover_art_delay_end = text.find("\n  - platform:", cover_art_delay_index + 1)
            cover_art_delay_body = text[cover_art_delay_index:cover_art_delay_end]
            if "min_value: 3" not in cover_art_delay_body:
                errors.append(f"{rel}: keep the cover art Show After minimum at three seconds")

    if cover_art_path.exists():
        rel = cover_art_path.relative_to(root)
        text = cover_art_path.read_text(encoding="utf-8")
        playback_started_body = yaml_script_body(text, "cover_art_playback_started")
        if playback_started_body is None:
            errors.append(f"{rel}: missing cover_art_playback_started script")
        elif (
            "script.execute: cover_art_start_delay" in playback_started_body
            and (
                "id(media_player_sleep_prevention_enabled).state" not in playback_started_body
                or 'id(screensaver_mode).state != "timer"' not in playback_started_body
                or 'id(screensaver_mode).state != "sensor"' not in playback_started_body
                or "script.execute: screensaver_idle_check" not in playback_started_body
            )
        ):
            errors.append(f"{rel}: let cover art use its own delay when the normal screensaver is disabled")

    return errors


def firmware_touch_cover_art_delay_errors(paths: tuple[Path, ...], root: Path) -> list[str]:
    errors: list[str] = []
    required_sequence = "on_touch:\n      - script.execute: cover_art_handle_touch"
    for path in paths:
        text = path.read_text(encoding="utf-8")
        if "on_touch:" not in text:
            continue
        if required_sequence not in text:
            errors.append(
                f"{path.relative_to(root)}: route touches through cover art before waking the screen"
            )
    return errors











def firmware_cover_art_low_heap_progress_errors(
    firmware_dir: Path, cover_art_path: Path, root: Path
) -> list[str]:
    media_path = firmware_dir / "button_grid_media.h"
    ha_path = firmware_dir / "button_grid_ha.h"
    errors: list[str] = []

    if media_path.exists():
        rel = media_path.relative_to(root)
        media_text = media_path.read_text(encoding="utf-8")
        for token in (
            "struct MediaPlaybackState",
            "media_playback_ensure_state(entity_id)",
            "media_playback_attach_slider(state, ctx)",
            "media_playback_subscribe_state(state)",
            "media_playback_prepare_cover_art_progress",
            "media_playback_set_playing_hint(state, playing)",
            "media_playback_subscribe_progress(state)",
            "media_playback_state_snapshot",
            "media_playback_state_has_progress",
        ):
            if token not in media_text:
                errors.append(f"{rel}: let S3 cover art initialise shared media playback progress")
                break

        prepare_match = re.search(
            r"inline\s+MediaPlaybackState\s*\*media_playback_prepare_cover_art_progress\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        prepare_body = prepare_match.group("body") if prepare_match else ""
        if any(
            token not in prepare_body
            for token in (
                "media_playback_ensure_state(entity_id)",
                "media_playback_set_playing_hint(state, playing)",
                "media_playback_subscribe_progress(",
                "HA_SUBSCRIPTION_SCOPE_COVER_ART",
                "HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS",
            )
        ) or "media_playback_subscribe_playback_state" in prepare_body:
            errors.append(f"{rel}: prepare S3 progress idempotently without another playback-state subscription")

        progress_match = re.search(
            r"inline\s+void\s+media_playback_subscribe_progress\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        progress_body = progress_match.group("body") if progress_match else ""
        if (
            "state->progress_subscribed" not in progress_body
            or "state->progress_subscription_scope = scope" not in progress_body
            or progress_body.count("scope") < 4
        ):
            errors.append(f"{rel}: subscribe to shared progress only once per dashboard generation")
        for attr in ("media_duration", "media_position", "media_position_updated_at"):
            if f'std::string("{attr}")' not in progress_body:
                errors.append(f"{rel}: subscribe shared progress to {attr}")

        for token in (
            "state->generation != ha_subscription_generation()",
            "media_playback_reset_state(state, entity_id)",
        ):
            if token not in media_text:
                errors.append(f"{rel}: rebuild shared progress after dashboard subscription changes")
                break

        snapshot_match = re.search(
            r"inline\s+bool\s+media_playback_state_snapshot\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        snapshot_body = snapshot_match.group("body") if snapshot_match else ""
        if (
            "!state->has_duration" not in snapshot_body
            or "!state->has_position" in snapshot_body
            or "state->has_position ? media_playback_current_position_seconds(state) : 0.0f" not in snapshot_body
        ):
            errors.append(f"{rel}: expose valid duration immediately and start delayed position at zero")

        progress_support_match = re.search(
            r"inline\s+bool\s+media_control_progress_supported\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        progress_support_body = progress_support_match.group("body") if progress_support_match else ""
        if (
            "#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL" not in progress_support_body
            or "ctx && media_playback_state_has_progress(ctx->entity_id)" not in progress_support_body
        ):
            errors.append(f"{rel}: give only matching S3 media controls a shared Progress tab")

        timer_match = re.search(
            r"inline\s+void\s+media_playback_refresh_progress_timer\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        timer_body = timer_match.group("body") if timer_match else ""
        consumer_guard = timer_body.find("has_timer_consumer")
        timer_create = timer_body.find("lv_timer_create")
        if consumer_guard < 0 or timer_create < 0 or consumer_guard > timer_create:
            errors.append(f"{rel}: create the one-second progress timer only for card or modal consumers")

        invalidation_match = re.search(
            r"inline\s+void\s+media_playback_invalidate_stale_progress\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        invalidation_body = invalidation_match.group("body") if invalidation_match else ""
        if any(
            token not in invalidation_body
            for token in (
                "last_duration_callback_ms",
                "state->duration = 0.0f",
                "state->has_duration = false",
                "state->position_seconds = 0.0f",
                "state->position_updated_ms = 0",
                "state->position_updated_at_known = false",
                "state->position_updated_at_ms = 0",
                "state->has_position = false",
                "media_playback_apply_progress_consumers(state)",
            )
        ):
            errors.append(f"{rel}: hide stale shared progress while preserving fresh track callbacks")

        cover_cleanup_match = re.search(
            r"inline\s+void\s+media_playback_reset_cover_art_progress_subscriptions\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            media_text,
            re.DOTALL,
        )
        cover_cleanup_body = cover_cleanup_match.group("body") if cover_cleanup_match else ""
        if any(
            token not in cover_cleanup_body
            for token in (
                "ha_reset_subscription_callbacks(HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS)",
                "HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS",
                "state->progress_subscribed = false",
                "state->progress_subscription_scope = 0",
                "state->has_position = false",
                "media_playback_subscribe_progress(state)",
            )
        ):
            errors.append(f"{rel}: release cover-art-owned progress and preserve active card consumers")
        elif cover_cleanup_body.find(
            "ha_reset_subscription_callbacks(HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS)"
        ) > cover_cleanup_body.find("state->progress_subscribed = false"):
            errors.append(f"{rel}: release cover-art progress callbacks before clearing local state")
    else:
        errors.append(f"{media_path.relative_to(root)}: missing media card helpers")

    if ha_path.exists():
        ha_rel = ha_path.relative_to(root)
        ha_text = ha_path.read_text(encoding="utf-8")
        bump_match = re.search(
            r"inline\s+void\s+bump_ha_subscription_generation\s*\([^)]*\)\s*\{"
            r"(?P<body>.*?)\n\}",
            ha_text,
            re.DOTALL,
        )
        bump_body = bump_match.group("body") if bump_match else ""
        if (
            "HA_SUBSCRIPTION_SCOPE_DEFAULT" not in bump_body
            or "HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS" not in bump_body
        ):
            errors.append(f"{ha_rel}: release cover-art progress subscriptions on generation bumps")

    if not cover_art_path.exists():
        return errors

    rel = cover_art_path.relative_to(root)
    text = cover_art_path.read_text(encoding="utf-8")
    stripped_low_heap = re.sub(
        r"#ifndef ESPDESKTOP_LOW_HEAP_COVER_ART.*?#endif",
        "",
        text,
        flags=re.DOTALL,
    )
    for attr in ("media_duration", "media_position", "media_position_updated_at"):
        if f'std::string("{attr}")' in stripped_low_heap:
            errors.append(f"{rel}: keep {attr} out of the S3 low-heap cover art path")
        if f'std::string("{attr}")' not in text:
            errors.append(f"{rel}: full cover art builds should still subscribe {attr}")

    refresh_body = yaml_script_body(text, "cover_art_refresh_progress")
    if not refresh_body:
        errors.append(f"{rel}: missing cover_art_refresh_progress script")
    elif (
        "#ifdef ESPDESKTOP_LOW_HEAP_COVER_ART" not in refresh_body
        or "media_playback_prepare_cover_art_progress" not in refresh_body
        or "media_playback_state_snapshot" not in refresh_body
        or "lv_obj_clear_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN)" not in refresh_body
    ):
        errors.append(f"{rel}: let S3 cover art initialise and consume shared progress")

    resubscribe_body = yaml_script_body(text, "cover_art_resubscribe")
    if not resubscribe_body or any(
        token not in resubscribe_body
        for token in (
            "#ifdef ESPDESKTOP_LOW_HEAP_COVER_ART",
            "media_playback_prepare_cover_art_progress",
            "media_playback_invalidate_stale_progress(cover_entity)",
            "media_playback_reset_cover_art_progress_subscriptions()",
        )
    ):
        errors.append(f"{rel}: prepare and invalidate S3 shared cover art progress")
    elif not re.search(
        r"if \(id\(cover_art_screensaver_enabled\)\.state\) \{\s*"
        r"media_playback_prepare_cover_art_progress\(.*?\}\s*else \{\s*"
        r"media_playback_reset_cover_art_progress_subscriptions\(\);",
        resubscribe_body,
        re.DOTALL,
    ):
        errors.append(f"{rel}: keep S3 progress unsubscribed when cover art is disabled")

    disable_body = yaml_script_body(text, "cover_art_disable")
    if not disable_body or "script.execute: cover_art_resubscribe" not in disable_body:
        errors.append(f"{rel}: release cover art subscriptions when the feature is disabled")

    prepared_visibility = re.search(
        r"media_playback_prepare_cover_art_progress\(.*?"
        r"return media_playback_state_has_progress\(id\(cover_art_(?:active_)?media_player_entity\)(?:\.state)?\);",
        text,
        re.DOTALL,
    )
    if not prepared_visibility:
        errors.append(f"{rel}: prepare S3 progress before checking cover art visibility")

    low_heap_refresh = re.search(
        r"- interval: 1s.*?#ifdef ESPDESKTOP_LOW_HEAP_COVER_ART(.*?)#else",
        text,
        re.DOTALL,
    )
    if not low_heap_refresh:
        errors.append(f"{rel}: missing S3 cover art refresh condition")
    else:
        condition_body = low_heap_refresh.group(1)
        active_guard = condition_body.find(
            "if (!id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART))"
        )
        prepare_progress = condition_body.find("media_playback_prepare_cover_art_progress")
        if active_guard < 0 or prepare_progress < 0 or active_guard > prepare_progress:
            errors.append(f"{rel}: prepare S3 progress only while cover art is active")

    return errors


def firmware_cover_art_progress_visibility_errors(path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    if not path.exists():
        return errors

    rel = path.relative_to(root)
    text = path.read_text(encoding="utf-8")
    time_widget = re.search(
        r"(?ms)^\s+- label:\n\s+id: cover_art_time_label\n(?P<body>.*?)(?=^\s+- bar:)",
        text,
    )
    if time_widget is None or "hidden: true" not in time_widget.group("body"):
        errors.append(f"{rel}: initialize cover art playback time hidden")

    full_build_guard = (
        "return espdesktop::cover_art::progress_available("
        "id(cover_art_media_duration));"
    )
    for script_id in ("cover_art_show_black_screen", "cover_art_show_track_overlay"):
        body = yaml_script_body(text, script_id)
        if body is None or full_build_guard not in body:
            errors.append(f"{rel}: guard every cover art progress reveal with usable duration")

    sync_body = yaml_script_body(text, "cover_art_sync_track_text")
    if sync_body is None or any(
        token not in sync_body
        for token in (
            "espdesktop::cover_art::progress_available(id(cover_art_media_duration))",
            "lv_obj_add_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN)",
            "lv_obj_add_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN)",
        )
    ):
        errors.append(f"{rel}: hide cover art playback time when duration is unavailable")

    refresh_body = yaml_script_body(text, "cover_art_refresh_progress")
    if refresh_body is None or any(
        token not in refresh_body
        for token in (
            "espdesktop::cover_art::progress_available(duration)",
            "lv_bar_set_value(id(cover_art_progress_bar), 0, LV_ANIM_OFF)",
            'lv_label_set_text(id(cover_art_time_label), "0:00  /  0:00")',
            "lv_obj_add_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN)",
            "lv_obj_add_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN)",
            "lv_obj_clear_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN)",
            "lv_obj_clear_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN)",
        )
    ):
        errors.append(f"{rel}: hide and reset unavailable cover art progress")

    duration_handler_match = re.search(
        r"handle_media_duration\s*=\s*.*?\{(?P<body>.*?)\n\s*\};\n\s*if\s*\(!already_subscribed\)",
        text,
        re.DOTALL,
    )
    duration_handler = duration_handler_match.group("body") if duration_handler_match else ""
    if (
        "const bool next_progress_available =" not in duration_handler
        or "if (!next_progress_available)" not in duration_handler
        or "next_duration = 0.0f" not in duration_handler
    ):
        errors.append(f"{rel}: normalize invalid cover art durations")
    if any(
        token not in duration_handler
        for token in (
            "id(cover_art_media_position) = 0.0f",
            "id(cover_art_position_anchor) = 0.0f",
            "id(cover_art_position_anchor_epoch) = 0",
            "id(cover_art_last_position_timestamp) = 0",
        )
    ):
        errors.append(f"{rel}: reset cover art position when duration becomes unavailable")
    if "current_progress_available" in duration_handler:
        errors.append(f"{rel}: preserve fresh cover art position when duration arrives late")
    if "id(cover_art_last_duration_callback_ms) = millis()" not in duration_handler:
        errors.append(f"{rel}: track cover art duration callback freshness")

    duration_invalidator_match = re.search(
        r"invalidate_stale_media_duration\s*=\s*\[[^\]]*\]\(\)\s*\{(?P<body>.*?)\n\s*\};",
        text,
        re.DOTALL,
    )
    duration_invalidator = (
        duration_invalidator_match.group("body") if duration_invalidator_match else ""
    )
    if any(
        token not in duration_invalidator
        for token in (
            "id(cover_art_last_duration_callback_ms)",
            "millis() - last_duration_ms",
            "duration_callback_is_fresh",
            "if (!duration_callback_is_fresh)",
            "id(cover_art_media_duration) = 0.0f",
        )
    ):
        errors.append(f"{rel}: preserve fresh cover art duration when metadata arrives late")
    if any(
        token in duration_invalidator
        for token in (
            "id(cover_art_media_position) = 0.0f",
            "id(cover_art_position_anchor) = 0.0f",
            "id(cover_art_position_anchor_epoch) = 0",
            "id(cover_art_last_position_timestamp) = 0",
        )
    ):
        errors.append(f"{rel}: preserve fresh cover art position while invalidating stale metadata")

    for metadata_name, assignment in (
        ("title", "id(cover_art_title) = next"),
        ("artist", "id(cover_art_artist) = next"),
        ("album", "id(cover_art_album) = next"),
        ("source", "id(cover_art_media_source) = next"),
    ):
        handler_match = re.search(
            rf"handle_media_{metadata_name}\s*=\s*.*?\{{(?P<body>.*?)\n\s*\}};\n\s*if\s*\(!already_subscribed\)",
            text,
            re.DOTALL,
        )
        handler = handler_match.group("body") if handler_match else ""
        metadata_assignment = handler.find(assignment)
        duration_invalidation = handler.find("invalidate_stale_media_duration()")
        if metadata_name in ("artist", "album"):
            if duration_invalidation >= 0:
                errors.append(f"{rel}: preserve duration when restoring media {metadata_name}")
        elif (
            metadata_assignment < 0
            or duration_invalidation < 0
            or duration_invalidation > metadata_assignment
        ):
            errors.append(
                f"{rel}: mark stale cover art duration unavailable when media {metadata_name} changes"
            )
        if any(
            token in handler
            for token in (
                "id(cover_art_media_position) = 0.0f",
                "id(cover_art_position_anchor) = 0.0f",
                "id(cover_art_position_anchor_epoch) = 0",
                "id(cover_art_last_position_timestamp) = 0",
            )
        ):
            errors.append(
                f"{rel}: preserve fresh cover art position when {metadata_name} metadata arrives late"
            )
        if metadata_name == "album":
            progress_refresh = handler.find("id(cover_art_sync_track_text).execute()")
            if progress_refresh < 0 or progress_refresh < duration_invalidation:
                errors.append(
                    f"{rel}: refresh cover art progress immediately when media album changes"
                )

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
    cover_art_path: Path,
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
                "script.stop: cover_art_hide_effect",
                "script.stop: display_mode_effect_active",
                "script.stop: display_mode_effect_setup_dimmed",
                "script.stop: display_mode_effect_off",
                "script.stop: display_mode_effect_cover_art",
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
                    errors.append(f"{rel}: consume stale cover art wake guard state during screensaver wake")
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
                or "espdesktop::DisplayMode::COVER_ART" not in pre_clear_body
                or "espdesktop::DisplayMode::DISPLAY_OFF" not in pre_clear_body
            ):
                errors.append(
                    f"{rel}: arm the shared wake guard from the pre-wake Cover Art and Display Off modes"
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

    if cover_art_path.exists():
        rel = cover_art_path.relative_to(root)
        text = cover_art_path.read_text(encoding="utf-8")
        if "cover_art_wake_touch_guard" in text or "cover_art_wake_touch_block" in text:
            errors.append(f"{rel}: use the shared screensaver wake guard for Cover Art")
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
        "      - script.execute: cover_art_pause_after_touch\n"
        "      - script.wait: cover_art_pause_after_touch\n"
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
            "script.execute: home_screen_idle_check",
        )
        indexes = [finalize_body.find(token) for token in ordered_tokens]
        if any(index == -1 for index in indexes) or indexes != sorted(indexes):
            errors.append(
                f"{backlight_rel}: finalize active display after page settle with clock bar, "
                "configured brightness, and idle timers"
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
                f"{connectivity_rel}: finalize brightness, clock bar, and idle timers after main-page navigation"
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


def firmware_screen_schedule_screensaver_overlay_errors(cover_art_path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    if not cover_art_path.exists():
        return errors

    rel = cover_art_path.relative_to(root)
    text = cover_art_path.read_text(encoding="utf-8")
    show_body = yaml_script_body(text, "show_cover_art_view")
    effect_body = yaml_script_body(text, "display_mode_effect_cover_art")

    if show_body is None:
        errors.append(f"{rel}: missing show_cover_art_view script")
    else:
        if "screen_schedule_blocks_cover_art(" not in show_body:
            errors.append(f"{rel}: prevent cover art from overriding active screen schedule night mode")
    if effect_body is None:
        errors.append(f"{rel}: missing display_mode_effect_cover_art script")
    elif "lv_obj_move_foreground(id(cover_art_screensaver))" not in effect_body:
        errors.append(f"{rel}: raise the cover art screensaver above any existing top-layer elements")

    delay_body = yaml_script_body(text, "cover_art_delay_timer")
    if delay_body is None:
        errors.append(f"{rel}: missing cover_art_delay_timer script")
    elif "screen_schedule_blocks_cover_art(" not in delay_body:
        errors.append(f"{rel}: keep delayed cover art from starting during screen schedule night mode")

    playback_started_body = yaml_script_body(text, "cover_art_playback_started")
    if playback_started_body is None:
        errors.append(f"{rel}: missing cover_art_playback_started script")
    elif "screen_schedule_blocks_cover_art(" not in playback_started_body:
        errors.append(f"{rel}: keep playback-start cover art from overriding screen schedule night mode")

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
    controller_off_body = yaml_script_body(text, "display_mode_effect_off")
    adapter_body = yaml_script_body(text, "display_mode_apply_transition")
    reconcile_body = yaml_script_body(text, "display_mode_reconcile")
    if schedule_off_body is None:
        errors.append(f"{rel}: missing backlight_schedule_display_off script")
    elif not (
        adapter_body is not None
        and "target_mode != static_cast<int>(espdesktop::DisplayMode::COVER_ART)" in adapter_body
        and "id: cover_art_hide_effect" in adapter_body
        and controller_off_body is not None
        and "script.stop: cover_art_delay_timer" in controller_off_body
    ) and (
        "script.stop: cover_art_delay_timer" not in schedule_off_body
        or "script.execute: hide_cover_art_view" not in schedule_off_body
    ):
        errors.append(f"{rel}: screen schedule display-off should clear cover art before forcing the screen off")

    if reconcile_body is not None and "DisplayRequestSource::SCREEN_SCHEDULE" in reconcile_body:
        controller_owns_cover_art = (
            adapter_body is not None
            and "espdesktop::DisplayMode::COVER_ART" in adapter_body
            and "id: cover_art_hide_effect" in adapter_body
            and (
                "DisplayRequestSource::MEDIA_PLAYBACK" not in reconcile_body
                or (
                    "if (!controller.target_mode_is(espdesktop::DisplayMode::COVER_ART))" in reconcile_body
                    and "if (id(cover_art_playback_control).retains_pause(id(cover_art_active_media_player_entity)))" in reconcile_body
                    and "controller.request(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK" not in reconcile_body
                )
            )
        )
        legacy_clears_cover_art = (
            "if (schedule_night && id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART))" in reconcile_body
            or (
                "if (id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART))" in reconcile_body
                and "id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) = false;" in reconcile_body
                and "id(hide_cover_art_view).execute();" in reconcile_body
            )
        )
        if not controller_owns_cover_art and not legacy_clears_cover_art:
            errors.append(f"{rel}: scheduled night modes should clear active cover art before resolving")

    schedule_path = backlight_path.with_name("backlight_schedule.yaml")
    if schedule_path.exists():
        schedule_rel = schedule_path.relative_to(root)
        schedule_text = schedule_path.read_text(encoding="utf-8")
        brightness_body = yaml_script_body(schedule_text, "backlight_apply_brightness")
        if brightness_body is not None:
            active_target = brightness_body.find(
                "target_mode_is(\n                espdesktop::DisplayMode::ACTIVE)"
            )
            cover_art_target = brightness_body.find(
                "target_mode_is(\n                espdesktop::DisplayMode::COVER_ART)"
            )
            if active_target == -1 or cover_art_target == -1:
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
    backlight_path: Path, display_path: Path, cover_art_path: Path,
    grid_header_path: Path, sensor_paths: tuple[Path, ...], root: Path,
) -> list[str]:
    """Local display policies must not reconnect retired HA sensor bindings."""
    errors: list[str] = []
    for path in (backlight_path, display_path, cover_art_path, grid_header_path,
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
                      "espdesktop_open_modal(entity_id,", "script.execute: screensaver_idle_check",
                      "script.execute: home_screen_idle_check")
    api_positions = [api_text.find(value) for value in api_required]
    script_positions = [modal_script.find(value) for value in script_required]
    if (modal_script_start < 0 or -1 in api_positions or api_positions != sorted(api_positions)
            or -1 in script_positions or script_positions != sorted(script_positions)
            or modal_script.count("grid_phase2_complete()") < 2):
        errors.append("common/device/api_open_modal.yaml: validate, wake, revalidate, open, then reset idle timers")
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
    errors.extend(firmware_local_sensor_binding_order_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_time_reconnect_errors(TIME_ADDON_PATH, ROOT))
    errors.extend(firmware_ntp_startup_errors(TIME_ADDON_PATH, SUN_CALC_PATH, CONNECTIVITY_PATHS, ROOT))
    errors.extend(firmware_weather_request_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_weather_disconnect_errors(FIRMWARE_DIR, CORE_INFRA_PATH, ROOT))
    errors.extend(firmware_weather_reconnect_errors(CORE_INFRA_PATH, ROOT))
    errors.extend(firmware_unavailable_retry_errors(FIRMWARE_DIR, CORE_INFRA_PATH, ROOT))
    errors.extend(firmware_cover_request_errors(FIRMWARE_DIR, CORE_INFRA_PATH, ROOT))
    from check_companion_artwork import errors as companion_artwork_errors
    errors.extend(companion_artwork_errors(ROOT))
    errors.extend(firmware_cover_art_disable_errors(COVER_ART_PATH, ROOT))
    errors.extend(firmware_cover_art_lifecycle_controller_errors(BACKLIGHT_PATH, COVER_ART_PATH, ROOT))
    errors.extend(firmware_media_sleep_prevention_errors(BACKLIGHT_PATH, DISPLAY_CONFIG_PATH, COVER_ART_PATH, ROOT))
    errors.extend(firmware_touch_cover_art_delay_errors(DEVICE_TOUCH_PATHS, ROOT))
    errors.extend(firmware_image_card_base_url_errors(FIRMWARE_DIR, ROOT))
    errors.extend(firmware_camera_refresh_action_errors(ROOT))
    errors.extend(firmware_artwork_image_auth_errors(ARTWORK_IMAGE_PATH, ROOT))
    errors.extend(
        firmware_screensaver_wake_guard_errors(
            BACKLIGHT_PATH, SCREEN_CLOCK_PATH, COVER_ART_PATH, ROOT
        )
    )
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
    errors.extend(firmware_screen_schedule_screensaver_overlay_errors(COVER_ART_PATH, ROOT))
    errors.extend(firmware_screen_schedule_screensaver_override_errors(BACKLIGHT_PATH, ROOT))
    errors.extend(
        firmware_local_display_sensor_retirement_errors(
            BACKLIGHT_PATH,
            DISPLAY_CONFIG_PATH,
            COVER_ART_PATH,
            FIRMWARE_DIR / "button_grid_grid.h",
            DEVICE_SENSOR_PATHS,
            ROOT,
        )
    )
    errors.extend(
        firmware_s3_api_errors(
            S3_DEVICE_PATH,
            S3_PACKAGES_PATH,
            CORE_INFRA_PATH,
            API_NAVIGATE_PATH,
            DEVICE_PACKAGE_PATHS,
            ROOT,
        )
    )
    errors.extend(firmware_open_modal_api_errors(ROOT, DEVICE_PACKAGE_PATHS))
    errors.extend(firmware_navigation_target_errors(FIRMWARE_DIR, API_NAVIGATE_PATH, DEVICE_PACKAGE_PATHS, ROOT))
    errors.extend(firmware_connectivity_api_errors(CONNECTIVITY_PATHS, ROOT))
    errors.extend(firmware_connector_endpoint_auth_errors(CONNECTOR_STATE_PATH, ROOT))
    errors.extend(
        firmware_wifi_setup_display_text_errors(
            SCREEN_LOADING_PATH,
            SCREEN_WIFI_SETUP_PATH,
            CONNECTIVITY_PATHS[0],
            ROOT,
        )
    )
    errors.extend(firmware_ha_connection_screen_errors(CORE_INFRA_PATH, ROOT))
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






def expect_local_sensor_binding_order_errors(
    name: str, files: dict[str, str], expected: tuple[str, ...]
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        firmware_dir.mkdir(parents=True)
        for filename, text in files.items():
            (firmware_dir / filename).write_text(text, encoding="utf-8")

        errors = firmware_local_sensor_binding_order_errors(firmware_dir, root)
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
        (firmware_dir / "button_grid_config.h").write_text(text, encoding="utf-8")

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
        (firmware_dir / "button_grid_config.h").write_text(config_text, encoding="utf-8")
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


def expect_cover_art_external_input_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "screen_cover_art.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_cover_art_external_input_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_art_stale_image_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "screen_cover_art.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_cover_art_stale_image_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_art_refresh_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "screen_cover_art.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_cover_art_refresh_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_art_playback_grace_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "screen_cover_art.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_cover_art_playback_grace_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_art_disable_errors(name: str, text: str, expected: tuple[str, ...]) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "screen_cover_art.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_cover_art_disable_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_art_lifecycle_controller_errors(
    name: str,
    backlight_text: str,
    cover_art_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        backlight_path = root / "common" / "addon" / "backlight.yaml"
        cover_art_path = root / "common" / "device" / "screen_cover_art.yaml"
        backlight_path.parent.mkdir(parents=True)
        cover_art_path.parent.mkdir(parents=True)
        backlight_path.write_text(backlight_text, encoding="utf-8")
        cover_art_path.write_text(cover_art_text, encoding="utf-8")

        errors = firmware_cover_art_lifecycle_controller_errors(
            backlight_path, cover_art_path, root
        )
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_media_sleep_prevention_errors(
    name: str,
    backlight_text: str,
    display_text: str,
    cover_art_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        backlight_path = root / "common" / "addon" / "backlight.yaml"
        display_path = root / "common" / "config" / "display.yaml"
        cover_art_path = root / "common" / "device" / "screen_cover_art.yaml"
        backlight_path.parent.mkdir(parents=True)
        display_path.parent.mkdir(parents=True)
        cover_art_path.parent.mkdir(parents=True)
        backlight_path.write_text(backlight_text, encoding="utf-8")
        display_path.write_text(display_text, encoding="utf-8")
        cover_art_path.write_text(cover_art_text, encoding="utf-8")

        errors = firmware_media_sleep_prevention_errors(backlight_path, display_path, cover_art_path, root)
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






def expect_cover_art_low_heap_progress_errors(
    name: str,
    media_text: str,
    cover_art_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        firmware_dir = root / "components" / "espdesktop"
        cover_art_path = root / "common" / "device" / "screen_cover_art.yaml"
        firmware_dir.mkdir(parents=True)
        cover_art_path.parent.mkdir(parents=True)
        (firmware_dir / "button_grid_media.h").write_text(media_text, encoding="utf-8")
        cover_art_path.write_text(cover_art_text, encoding="utf-8")

        errors = firmware_cover_art_low_heap_progress_errors(firmware_dir, cover_art_path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"


def expect_cover_art_progress_visibility_errors(
    name: str, text: str, expected: tuple[str, ...]
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        path = root / "common" / "device" / "screen_cover_art.yaml"
        path.parent.mkdir(parents=True)
        path.write_text(text, encoding="utf-8")

        errors = firmware_cover_art_progress_visibility_errors(path, root)
        for item in expected:
            assert any(item in error for error in errors), f"{name}: missing {item!r} in {errors!r}"
        if not expected:
            assert not errors, f"{name}: expected no errors, got {errors!r}"




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
    cover_art_text: str,
    expected: tuple[str, ...],
) -> None:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        backlight_path = root / "common" / "addon" / "backlight.yaml"
        screen_clock_path = root / "common" / "device" / "screen_clock.yaml"
        cover_art_path = root / "common" / "device" / "screen_cover_art.yaml"
        backlight_path.parent.mkdir(parents=True)
        screen_clock_path.parent.mkdir(parents=True)
        cover_art_path.parent.mkdir(parents=True, exist_ok=True)
        backlight_path.write_text(backlight_text, encoding="utf-8")
        screen_clock_path.write_text(screen_clock_text, encoding="utf-8")
        cover_art_path.write_text(cover_art_text, encoding="utf-8")

        errors = firmware_screensaver_wake_guard_errors(
            backlight_path, screen_clock_path, cover_art_path, root
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
        "      - script.execute: screensaver_wake\n",
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
        "      - script.execute: cover_art_pause_after_touch\n"
        "      - script.wait: cover_art_pause_after_touch\n"
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
    expect_local_sensor_binding_order_errors(
        "local sensor subtype reaches HA subscription first",
        {
            "button_grid_grid.h":
                "if (image_driver_bind_main(s, p, context, cfg)) continue;\n"
                "if (sensor_driver_bind_data(s, p, context, palette)) return true;\n"
                "if (bind_basic_sensor_card(s, p, context, palette)) continue;\n",
            "button_grid_sensor_driver.h":
                "inline bool sensor_driver_bind_data(BtnSlot &slot, const ParsedCfg &config, const Context &context) {\n"
                "  if (!config.sensor.empty()) subscribe_sensor_value();\n"
                "  if (sensor_driver_is_local(config, context)) {\n"
                "    sensor_driver_register_local_value(slot, config);\n"
                "    return true;\n"
                "  }\n"
                "}\n",
        },
        ("bind local sensor values before Home Assistant sensor subscriptions",),
    )
    expect_local_sensor_binding_order_errors(
        "local sensor subtype binds through shared driver",
        {
            "button_grid_grid.h":
                "if (image_driver_bind_main(s, p, context, cfg)) continue;\n"
                "if (sensor_driver_bind_data(s, p, context, palette)) return true;\n"
                "if (bind_basic_sensor_card(s, p, context, palette)) continue;\n",
            "button_grid_sensor_driver.h":
                "inline bool sensor_driver_bind_data(BtnSlot &slot, const ParsedCfg &config, const Context &context) {\n"
                "  if (sensor_driver_is_local(config, context)) {\n"
                "    sensor_driver_register_local_value(slot, config);\n"
                "    return true;\n"
                "  }\n"
                "  if (!config.sensor.empty()) subscribe_sensor_value();\n"
                "}\n",
        },
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
    expect_cover_art_external_input_errors(
        "missing cover art source handling",
        "script:\n"
        "  - id: cover_art_request_artwork\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_hide_external_input_enabled).state && id(cover_art_external_input_active);\n",
        (
            "subscribe to the media player source attribute",
            "use the shared TV, line-in, and HDMI media-entity router",
            "stop pending artwork requests",
        ),
    )
    expect_cover_art_external_input_errors(
        "cover art source handling present",
        "switch:\n"
        "  - platform: template\n"
        "    id: cover_art_hide_external_input_enabled\n"
        "script:\n"
        "  - id: cover_art_apply_external_input_policy\n"
        "    then:\n"
        "      - script.stop: cover_art_request_artwork\n"
        "      - lambda: |-\n"
        "          id(cover_art_hide_external_input_enabled).state && id(cover_art_external_input_active);\n"
        "          bool external = espdesktop::cover_art::external_media_source(next);\n"
        "          bool use_secondary = espdesktop::cover_art::use_secondary_media_entity(\n"
        "            external, true, true, true);\n"
        "          ha_reset_subscription_callbacks(HA_SUBSCRIPTION_SCOPE_COVER_ART);\n"
        "          ha_subscribe_attribute(\n"
        "            cover_entity,\n"
        "            std::string(\"source\"),\n"
        "            handle_media_source,\n"
        "            HA_SUBSCRIPTION_SCOPE_COVER_ART\n"
        "          );\n"
        "          // Live subscriptions supply both initial values and updates.\n",
        (),
    )
    expect_cover_art_stale_image_errors(
        "missing black fallback image hide",
        "script:\n"
        "  - id: cover_art_show_black_screen\n"
        "    then:\n"
        "      - globals.set:\n"
        "          id: cover_art_image_available\n"
        "          value: 'false'\n",
        ("hide stale cover art image when the black fallback is shown",),
    )
    expect_cover_art_stale_image_errors(
        "conditional black fallback image hide",
        "script:\n"
        "  - id: cover_art_show_black_screen\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return id(cover_art_runtime).loaded_url.empty();'\n"
        "          then:\n"
        "            - lvgl.widget.hide: cover_art_image_widget\n",
        ("hide stale cover art image even after previous artwork loaded",),
    )
    expect_cover_art_stale_image_errors(
        "unconditional black fallback image hide",
        "script:\n"
        "  - id: cover_art_show_black_screen\n"
        "    then:\n"
        "      - lvgl.widget.hide: cover_art_image_widget\n",
        (),
    )
    expect_cover_art_stale_image_errors(
        "visible unavailable cover art message",
        "lvgl:\n"
        "  top_layer:\n"
        "    widgets:\n"
        "      - label:\n"
        "          id: cover_art_error_label\n"
        "          text: \"Artwork unavailable\"\n"
        "script:\n"
        "  - id: cover_art_show_black_screen\n"
        "    then:\n"
        "      - lvgl.widget.hide: cover_art_image_widget\n",
        ("do not show an unavailable cover art message",),
    )
    expect_cover_art_refresh_errors(
        "missing stale cover refresh guard",
        "script:\n"
        "  - id: cover_art_download\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_runtime).source_url;\n",
        (
            "track/source metadata changes as stale artwork",
            "subscribe to the media_album_name attribute",
        ),
    )
    expect_cover_art_refresh_errors(
        "queued cover art changes are not coalesced",
        "script:\n"
        "  - id: cover_art_download\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_runtime).effective_download_url = id(cover_art_downloaded_image)->request_update_url(id(cover_art_runtime).effective_download_url);\n",
        ("coalesce changed cover art URLs into the queued image request",),
    )
    expect_cover_art_refresh_errors(
        "cover art touch delay ignores later touches",
        "script:\n"
        "  - id: cover_art_pause_after_touch\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART);'\n"
        "          then:\n"
        "            - lambda: 'id(cover_art_manual_pause_until_ms) = 1;'\n",
        ("restart its countdown after every touch",),
    )
    expect_cover_art_refresh_errors(
        "cover art metadata bypasses display normalization",
        "script:\n"
        "  - id: cover_art_sync_track_text\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          return id(cover_art_title);\n"
        "          return id(cover_art_artist);\n"
        "          return id(cover_art_media_source);\n",
        ("normalize decoded cover art metadata only at the label boundary",),
    )
    expect_cover_art_refresh_errors(
        "cover art metadata bypasses media unicode cleanup",
        "script:\n"
        "  - id: cover_art_sync_track_text\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          return normalize_display_text(id(cover_art_title));\n"
        "          return normalize_display_text(id(cover_art_artist));\n"
        "          return normalize_display_text(decode_html_entities(id(cover_art_media_source)));\n",
        ("normalize decoded cover art metadata only at the label boundary",),
    )
    expect_cover_art_refresh_errors(
        "stale cover refresh guard present",
        "globals:\n"
        "  - id: cover_art_runtime\n"
        "    type: espdesktop::cover_art::RuntimeState\n"
        "# cover_art_runtime).refresh_needed\n"
        "# cover_art_runtime).effective_download_url\n"
        "  - id: cover_art_album\n"
        "script:\n"
        "  - id: cover_art_sync_track_text\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          const std::string title = espdesktop::media::normalize_media_display_text(\n"
        "            id(cover_art_external_input_active) && !id(cover_art_media_source).empty()\n"
        "              ? decode_html_entities(id(cover_art_media_source)) : id(cover_art_title));\n"
        "          return normalize_display_text(title);\n"
        "          const std::string artist = espdesktop::media::normalize_media_display_text(id(cover_art_artist));\n"
        "          return normalize_display_text(artist);\n"
        "  - id: cover_art_resolve_home_assistant_base_url\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          auto rebuild_relative_artwork_url = [](std::string &url) { return !url.empty(); };\n"
        "          id(cover_art_remote_source_relative);\n"
        "          id(cover_art_local_source_relative);\n"
        "          id(cover_art_runtime).sources.remote_url.clear();\n"
        "          id(cover_art_runtime).sources.local_url.clear();\n"
        "          id(cover_art_process_cached_artwork).execute();\n"
        "  - id: cover_art_download\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) &&\n"
        "                     id(cover_art_runtime).image_available &&\n"
        "                     id(cover_art_runtime).refresh_needed &&\n"
        "                     !${cover_art_live_image_updates};\n"
        "          then:\n"
        "            - script.execute: cover_art_show_track_overlay\n"
        "      - lambda: |-\n"
        "          const bool replacing_active_download = id(cover_art_runtime).download_active();\n"
        "          if (url.find(\"/api/media_player_proxy/\") != std::string::npos) {\n"
        "            url += url.find('?') == std::string::npos ? \"?time=\" : \"&time=\";\n"
        "          }\n"
        "          const bool needs_artwork_refresh = id(cover_art_runtime).refresh_needed || !id(cover_art_runtime).image_available;\n"
        "          ESP_LOGI(\"cover_art\", \"%s\", replacing_active_download ? \"Re-queuing\" : \"Downloading\");\n"
        "          id(cover_art_runtime).effective_download_url = id(cover_art_downloaded_image)->request_update_url(id(cover_art_runtime).effective_download_url);\n"
        "  - id: cover_art_deferred_download\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_runtime).refresh_needed;\n"
        "  - id: cover_art_prepare_download\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_runtime).refresh_needed;\n"
        "  - id: cover_art_use_cached_artwork\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_runtime).select_source(chosen);\n"
        "          if (chosen == id(cover_art_runtime).source_url) {\n"
        "            if (!id(cover_art_runtime).image_available || id(cover_art_runtime).refresh_needed) {}\n"
        "          }\n"
        "          id(cover_art_runtime).source_url = chosen;\n"
        "          id(cover_art_runtime).refresh_needed = true;\n"
        "  - id: cover_art_request_artwork\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (chosen == id(cover_art_runtime).source_url) {\n"
        "            if (!id(cover_art_runtime).image_available || id(cover_art_runtime).refresh_needed) {}\n"
        "          }\n"
        "  - id: cover_art_apply_downloaded_image\n"
        "    then:\n"
        "      - script.execute: cover_art_clear_image_source\n"
        "      - script.wait: cover_art_clear_image_source\n"
        "      - lambda: |-\n"
        "          std::string expected_url = id(cover_art_runtime).effective_download_url;\n"
        "          std::string completed_url;\n"
        "          id(cover_art_runtime).apply_download(completed_url);\n"
        "  - id: cover_art_playback_started\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          if (!id(cover_art_runtime).image_available) {\n"
        "            id(cover_art_runtime).retry_url.clear();\n"
        "            id(cover_art_runtime).retry_count = 0;\n"
        "          }\n"
        "  - id: cover_art_resubscribe\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          id(cover_art_runtime).refresh_needed = true;\n"
        "          mark_artwork_refresh_needed();\n"
        "          mark_artwork_refresh_needed();\n"
        "          mark_artwork_refresh_needed();\n"
        "          mark_artwork_refresh_needed();\n"
        "          if (!url.empty() && url != id(cover_art_runtime).source_url) {\n"
        "            id(cover_art_runtime).refresh_needed = true;\n"
        "          }\n"
        "          ha_subscribe_attribute(cover_entity, std::string(\"entity_picture\"), callback, HA_SUBSCRIPTION_SCOPE_COVER_ART, true);\n"
        "          ha_subscribe_attribute(cover_entity, std::string(\"entity_picture_local\"), callback, HA_SUBSCRIPTION_SCOPE_COVER_ART, true);\n"
        "          ha_subscribe_attribute(cover_entity, std::string(\"media_album_name\"), handle_media_album);\n"
        "          // Live subscriptions supply both initial values and updates.\n",
        (),
    )
    expect_cover_art_playback_grace_errors(
        "missing cover art playback grace",
        "script:\n"
        "  - id: cover_art_playback_stopped\n"
        "    then:\n"
        "      - lambda: id(cover_art_media_playing) = false;\n",
        (
            "buffer brief non-playing states between tracks",
            "delay non-playing playback transitions",
            "remember and cancel a pending cover art opening when playback stops",
            "restart an interrupted cover art opening when playback resumes",
            "cancel a pending stop when playback resumes or pauses",
            "keep cached artwork when Home Assistant clears it during a brief playback transition",
            "cancel pending playback grace during an immediate stop",
        ),
    )
    valid_cover_art_playback_grace = (
        "script:\n"
        "  - id: cover_art_resubscribe\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          bool restart_cover_art_delay = id(cover_art_delay_interrupted_by_transition);\n"
        "          if (!was_playing || restart_cover_art_delay) id(cover_art_playback_started).execute();\n"
        "          id(cover_art_delayed_playback_stopped).stop();\n"
        "          id(cover_art_delayed_playback_stopped).stop();\n"
        "          id(cover_art_delay_interrupted_by_transition) =\n"
        "            id(cover_art_delay_interrupted_by_transition) || id(cover_art_delay_timer).is_running();\n"
        "          id(cover_art_delay_timer).stop();\n"
        "          id(cover_art_delayed_playback_stopped).execute();\n"
        "          if (url.empty() && id(cover_art_delayed_playback_stopped).is_running()) return;\n"
        "          id(cover_art_local_source_relative) = relative;\n"
        "          id(cover_art_remote_source_relative) = relative;\n"
        "  - id: cover_art_delayed_playback_stopped\n"
        "    mode: restart\n"
        "    then:\n"
        "      - delay: 2s\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return state != \"playing\" && state != \"buffering\" && state != \"paused\";\n"
        "          then:\n"
        "            - script.execute: cover_art_playback_stopped\n"
        "  - id: cover_art_playback_stopped\n"
        "    then:\n"
        "      - script.stop: cover_art_delayed_playback_stopped\n"
    )
    expect_cover_art_playback_grace_errors(
        "cover art playback grace present",
        valid_cover_art_playback_grace,
        (),
    )
    expect_cover_art_playback_grace_errors(
        "cover art playback grace missing local relative marker",
        valid_cover_art_playback_grace.replace(
            "          id(cover_art_local_source_relative) = relative;\n", ""
        ),
        ("retain cached artwork's relative marker",),
    )
    expect_cover_art_playback_grace_errors(
        "cover art playback grace missing remote relative marker",
        valid_cover_art_playback_grace.replace(
            "          id(cover_art_remote_source_relative) = relative;\n", ""
        ),
        ("retain cached artwork's relative marker",),
    )
    expect_cover_art_disable_errors(
        "independent media sleep prevention when cover art is disabled",
        "script:\n"
        "  - id: cover_art_disable\n"
        "    then:\n"
        "      - script.stop: cover_art_delay_timer\n",
        (),
    )
    expect_cover_art_disable_errors(
        "coupled media sleep prevention when cover art is disabled",
        "script:\n"
        "  - id: cover_art_disable\n"
        "    then:\n"
        "      - switch.turn_off: media_player_sleep_prevention_enabled\n",
        ("keep media sleep prevention independent",),
    )
    valid_cover_art_adapter = (
        "script:\n"
        "  - id: display_mode_apply_transition\n"
        "    then:\n"
        "      - lambda: 'return target_mode == static_cast<int>(espdesktop::DisplayMode::COVER_ART);'\n"
        "      - script.execute:\n"
        "          id: display_mode_effect_cover_art\n"
        "      - script.execute:\n"
        "          id: cover_art_hide_effect\n"
        "      - lambda: 'id(espdesktop_app).display().complete_transition(generation, espdesktop::DisplayMode::COVER_ART);'\n"
        "  - id: display_mode_request_cover_art\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().request(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK, espdesktop::DisplayMode::COVER_ART);'\n"
        "      - script.execute: display_mode_reconcile\n"
        "      - script.wait: display_mode_reconcile\n"
        "      - script.wait: display_mode_apply_transition\n"
        "  - id: display_mode_clear_cover_art\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().clear(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK);'\n"
        "      - script.execute: display_mode_reconcile\n"
        "      - script.wait: display_mode_reconcile\n"
        "      - script.wait: display_mode_apply_transition\n"
        "  - id: display_mode_reconcile\n"
        "    then:\n"
        "      - lambda: 'auto transition = controller.resolve(); if (controller.transition_in_progress(transition) && id(display_mode_apply_transition).is_running()) { controller.transition_warning_due(millis(), 2000); return; } controller.cancel_transition(); bool transition_required = controller.transition_required(transition) || controller.presentation_incomplete(); if (!transition_required) { auto previous_cover_generation = id(cover_art_transition_generation); id(cover_art_transition_generation) = transition.generation; if (id(cover_art_download_generation) == previous_cover_generation) id(cover_art_download_generation) = transition.generation; } controller.start_transition(transition, millis());'\n"
    )
    valid_cover_art_effects = (
        "globals:\n"
        "  - id: cover_art_transition_generation\n"
        "script:\n"
        "  - id: display_mode_effect_cover_art\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().transition_is_current(generation, espdesktop::DisplayMode::COVER_ART); lv_obj_move_foreground(id(cover_art_screensaver));'\n"
        "  - id: cover_art_hide_effect\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().transition_is_current(generation, target); return std::string(\"${device_slug}\") == \"guition-esp32-s3-4848s040\";'\n"
        "      - artwork_image.release: cover_art_downloaded_image\n"
        "  - id: hide_cover_art_view\n"
        "    then:\n"
        "      - script.execute: display_mode_clear_cover_art\n"
        "      - script.wait: display_mode_clear_cover_art\n"
        "  - id: cover_art_disable\n"
        "    then:\n"
        "      - script.wait: display_mode_clear_cover_art\n"
        "  - id: cover_art_return_home_after_playback\n"
        "    then:\n"
        "      - script.wait: display_mode_clear_cover_art\n"
        "  - id: cover_art_delay_timer\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().generation_is_current(generation);'\n"
        "  - id: cover_art_apply_downloaded_image\n"
        "    then:\n"
        "      - lambda: 'return id(cover_art_download_generation);'\n"
        "  - id: cover_art_deferred_download\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().transition_is_current(generation, mode);'\n"
        "  - id: cover_art_retry_download\n"
        "    then:\n"
        "      - lambda: 'return id(cover_art_download_generation);'\n"
        "  - id: cover_art_refresh_progress\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().transition_is_current(generation, mode);'\n"
        "  - id: cover_art_delayed_playback_stopped\n"
        "    then:\n"
        "      - lambda: 'id(espdesktop_app).display().generation_is_current(generation);'\n"
        "      - globals.set: { id: cover_art_delay_interrupted_by_transition, value: 'false' }\n"
        "      - globals.set: { id: cover_art_media_playing, value: 'false' }\n"
        "      - script.execute: display_mode_clear_cover_art\n"
        "      - script.wait: display_mode_clear_cover_art\n"
    )
    expect_cover_art_lifecycle_controller_errors(
        "controller-owned cover art lifecycle",
        valid_cover_art_adapter,
        valid_cover_art_effects,
        (),
    )
    expect_cover_art_lifecycle_controller_errors(
        "legacy cover art lifecycle",
        "script:\n  - id: display_mode_reconcile\n    then: []\n",
        "script:\n  - id: show_cover_art_view\n    then: []\n",
        (
            "route cover art presentation exclusively through the display adapter",
            "create cover art through a controller media request",
            "dismiss cover art by clearing its controller media request",
            "guard the controller-owned cover art effect",
            "guard cover art hide by the current transition generation",
            "guard cover_art_delay_timer",
        ),
    )
    expect_media_sleep_prevention_errors(
        "cover art alone keeps media awake",
        "script:\n"
        "  - id: screensaver_idle_check\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "                     ((id(media_player_sleep_prevention_enabled).state ||\n"
        "                       id(cover_art_screensaver_enabled).state) &&\n"
        "                      id(cover_art_media_playing));\n",
        "switch:\n"
        "  - platform: template\n"
        "    id: cover_art_screensaver_enabled\n"
        "    on_turn_on:\n"
        "      - switch.turn_on: media_player_sleep_prevention_enabled\n",
        "script:\n"
        "  - id: cover_art_playback_started\n"
        "    then:\n"
        "      - script.execute: cover_art_start_delay\n",
        (
            "require both cover art and media sleep prevention to keep the idle timer awake",
            "do not turn on media sleep prevention",
            "let cover art use its own delay",
        ),
    )
    expect_media_sleep_prevention_errors(
        "playback cannot block sleep while cover art is disabled",
        "script:\n"
        "  - id: screensaver_idle_check\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "                     (id(media_player_sleep_prevention_enabled).state &&\n"
        "                      id(cover_art_media_playing));\n",
        "",
        "",
        ("keep media playback awake only while cover art and media sleep prevention are enabled",),
    )
    expect_media_sleep_prevention_errors(
        "media sleep prevention applies while cover art is enabled",
        "script:\n"
        "  - id: screensaver_idle_check\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "                     (id(cover_art_screensaver_enabled).state &&\n"
        "                      id(media_player_sleep_prevention_enabled).state &&\n"
        "                      id(cover_art_media_playing));\n"
        "  - id: screensaver_wake\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              float show_after_seconds = id(cover_art_delay).state;\n"
        "              if (show_after_seconds < 3.0f) show_after_seconds = 3.0f;\n"
        "              const bool cover_art_disabled_mode_delay =\n"
        "                id(screensaver_mode).state != \"timer\" &&\n"
        "                id(screensaver_mode).state != \"sensor\" &&\n"
        "                show_after_seconds > 0.0f;\n",
        "switch:\n"
        "  - platform: template\n"
        "    id: cover_art_screensaver_enabled\n"
        "    on_turn_on:\n"
        "      - script.execute: cover_art_resubscribe\n",
        "script:\n"
        "  - id: cover_art_playback_started\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(media_player_sleep_prevention_enabled).state ||\n"
        "                     (id(screensaver_mode).state != \"timer\" &&\n"
        "                      id(screensaver_mode).state != \"sensor\") ||\n"
        "                     id(display_asleep);\n"
        "          then:\n"
        "            - script.execute: cover_art_start_delay\n"
        "          else:\n"
        "            - script.execute: screensaver_idle_check\n",
        (),
    )
    expect_media_sleep_prevention_errors(
        "normal screensaver timeout starts cover art directly",
        "script:\n"
        "  - id: screensaver_idle_check\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "                     (id(cover_art_screensaver_enabled).state &&\n"
        "                      id(media_player_sleep_prevention_enabled).state &&\n"
        "                      id(cover_art_media_playing));\n"
        "  - id: screensaver_sleep_timer\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              const std::string &state = id(cover_art_last_playback_state);\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "                     (id(cover_art_media_playing) &&\n"
        "                      state != \"playing\" && state != \"buffering\" && state != \"paused\");\n"
        "          then:\n"
        "            - script.execute: screensaver_idle_check\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(cover_art_screensaver_enabled).state &&\n"
        "                     id(cover_art_media_playing) &&\n"
        "                     !id(cover_art_media_player_entity).state.empty();\n"
        "          then:\n"
        "            - script.execute: show_cover_art_view\n",
        "switch:\n"
        "  - platform: template\n"
        "    id: cover_art_screensaver_enabled\n",
        "script:\n"
        "  - id: cover_art_playback_started\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(media_player_sleep_prevention_enabled).state ||\n"
        "                     (id(screensaver_mode).state != \"timer\" &&\n"
        "                      id(screensaver_mode).state != \"sensor\") ||\n"
        "                     id(display_asleep);\n"
        "          then:\n"
        "            - script.execute: cover_art_delay_timer\n"
        "          else:\n"
        "            - script.execute: screensaver_idle_check\n",
        (),
    )
    expect_media_sleep_prevention_errors(
        "normal screensaver timeout does not add cover art delay",
        "script:\n"
        "  - id: screensaver_idle_check\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "                     (id(cover_art_screensaver_enabled).state &&\n"
        "                      id(media_player_sleep_prevention_enabled).state &&\n"
        "                      id(cover_art_media_playing));\n"
        "  - id: screensaver_sleep_timer\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(cover_art_screensaver_enabled).state &&\n"
        "                     id(cover_art_media_playing) &&\n"
        "                     !id(cover_art_media_player_entity).state.empty();\n"
        "          then:\n"
        "            - script.execute: cover_art_delay_timer\n",
        "switch:\n"
        "  - platform: template\n"
        "    id: cover_art_screensaver_enabled\n",
        "script:\n"
        "  - id: cover_art_playback_started\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              return id(media_player_sleep_prevention_enabled).state ||\n"
        "                     (id(screensaver_mode).state != \"timer\" &&\n"
        "                      id(screensaver_mode).state != \"sensor\") ||\n"
        "                     id(display_asleep);\n"
        "          then:\n"
        "            - script.execute: cover_art_delay_timer\n"
        "          else:\n"
        "            - script.execute: screensaver_idle_check\n",
        (
            "start cover art directly after the normal screensaver timeout",
            "keep the normal screensaver idle during cover art stop grace",
        ),
    )
    expect_media_sleep_prevention_errors(
        "takeover restore trusts delayed playing flag",
        "script:\n"
        "  - id: display_takeover_resume_restore\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: 'return id(cover_art_media_playing);'\n"
        "          then:\n"
        "            - script.execute: show_cover_art_view\n",
        "",
        "",
        ("keep takeover restore from showing cover art during stop grace",),
    )
    valid_media_power, valid_media_power_capability = valid_media_power_binding_text()
    cover_art_shared_media = (
        "struct MediaPlaybackState {};\n"
        "inline MediaPlaybackState *media_playback_find_state(const std::string &entity_id) {\n"
        "  if (state->generation != ha_subscription_generation()) media_playback_reset_state(state, entity_id);\n"
        "  return state;\n"
        "}\n"
        "inline void media_playback_subscribe_progress(MediaPlaybackState *state, uint32_t scope) {\n"
        "  if (!state || state->progress_subscribed) return;\n"
        "  state->progress_subscription_scope = scope;\n"
        "  ha_subscribe_attribute(entity_id, std::string(\"media_duration\"), cb, scope);\n"
        "  ha_subscribe_attribute(entity_id, std::string(\"media_position\"), cb, scope);\n"
        "  ha_subscribe_attribute(entity_id, std::string(\"media_position_updated_at\"), cb, scope);\n"
        "}\n"
        "inline bool media_control_progress_supported(MediaControlCtx *ctx) {\n"
        "  #ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL\n"
        "  return ctx && media_playback_state_has_progress(ctx->entity_id);\n"
        "  #endif\n"
        "}\n"
        "inline void media_playback_refresh_progress_timer(MediaPlaybackState *state) {\n"
        "  bool has_timer_consumer = !state->sliders.empty() || !state->controls.empty();\n"
        "  if (!has_timer_consumer) return;\n"
        "  state->progress_timer = lv_timer_create(cb, 1000, state);\n"
        "}\n"
        "inline void media_playback_invalidate_stale_progress(const std::string &entity_id) {\n"
        "  uint32_t last_duration_callback_ms = state->last_duration_callback_ms;\n"
        "  state->duration = 0.0f;\n"
        "  state->has_duration = false;\n"
        "  state->position_seconds = 0.0f;\n"
        "  state->position_updated_ms = 0;\n"
        "  state->position_updated_at_known = false;\n"
        "  state->position_updated_at_ms = 0;\n"
        "  state->has_position = false;\n"
        "  media_playback_apply_progress_consumers(state);\n"
        "}\n"
        "inline void media_playback_reset_cover_art_progress_subscriptions() {\n"
        "  ha_reset_subscription_callbacks(HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS);\n"
        "  if ((state->progress_subscription_scope & HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS) == 0) return;\n"
        "  state->progress_subscribed = false;\n"
        "  state->progress_subscription_scope = 0;\n"
        "  state->has_position = false;\n"
        "  media_playback_subscribe_progress(state);\n"
        "}\n"
        "inline MediaPlaybackState *media_playback_prepare_cover_art_progress(const std::string &entity_id, bool playing) {\n"
        "  MediaPlaybackState *state = media_playback_ensure_state(entity_id);\n"
        "  media_playback_set_playing_hint(state, playing);\n"
        "  media_playback_subscribe_progress(\n"
        "    state, HA_SUBSCRIPTION_SCOPE_COVER_ART | HA_SUBSCRIPTION_SCOPE_COVER_ART_PROGRESS);\n"
        "  return state;\n"
        "}\n"
        "inline void subscribe_media_slider_state(lv_obj_t *btn_ptr, lv_obj_t *slider, const std::string &entity_id) {\n"
        "  MediaPlaybackState *state = media_playback_ensure_state(entity_id);\n"
        "  media_playback_attach_slider(state, ctx);\n"
        "  media_playback_subscribe_state(state);\n"
        "}\n"
        "inline bool media_playback_state_snapshot(const std::string &entity_id) {\n"
        "  if (!state || !state->has_duration) return false;\n"
        "  position = state->has_position ? media_playback_current_position_seconds(state) : 0.0f;\n"
        "  return true;\n"
        "}\n"
        "inline bool media_playback_state_has_progress() { return true; }\n"
    )
    expect_cover_art_low_heap_progress_errors(
        "low heap cover art reuses shared progress",
        cover_art_shared_media,
        "script:\n"
        "  - id: cover_art_refresh_progress\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          #ifdef ESPDESKTOP_LOW_HEAP_COVER_ART\n"
        "          media_playback_prepare_cover_art_progress(id(cover_art_media_player_entity).state, id(cover_art_media_playing));\n"
        "          media_playback_state_snapshot(id(cover_art_media_player_entity).state, playing, duration, position);\n"
        "          lv_obj_clear_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN);\n"
        "          #endif\n"
        "          media_playback_prepare_cover_art_progress(id(cover_art_media_player_entity).state, id(cover_art_media_playing));\n"
        "          return media_playback_state_has_progress(id(cover_art_media_player_entity).state);\n"
        "interval:\n"
        "  - interval: 1s\n"
        "    then:\n"
        "      - if:\n"
        "          condition:\n"
        "            lambda: |-\n"
        "              #ifdef ESPDESKTOP_LOW_HEAP_COVER_ART\n"
        "              if (!id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART)) return false;\n"
        "              media_playback_prepare_cover_art_progress(id(cover_art_media_player_entity).state, id(cover_art_media_playing));\n"
        "              return true;\n"
        "              #else\n"
        "              return id(cover_art_media_playing);\n"
        "              #endif\n"
        "  - id: cover_art_resubscribe\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          #ifdef ESPDESKTOP_LOW_HEAP_COVER_ART\n"
        "          if (id(cover_art_screensaver_enabled).state) {\n"
        "            media_playback_prepare_cover_art_progress(cover_entity, id(cover_art_media_playing));\n"
        "          } else {\n"
        "            media_playback_reset_cover_art_progress_subscriptions();\n"
        "          }\n"
        "          media_playback_invalidate_stale_progress(cover_entity);\n"
        "          #endif\n"
        "  - id: cover_art_disable\n"
        "    then:\n"
        "      - script.execute: cover_art_resubscribe\n"
        "#ifndef ESPDESKTOP_LOW_HEAP_COVER_ART\n"
        "ha_subscribe_attribute(cover_entity, std::string(\"media_duration\"), cb);\n"
        "ha_subscribe_attribute(cover_entity, std::string(\"media_position\"), cb);\n"
        "ha_subscribe_attribute(cover_entity, std::string(\"media_position_updated_at\"), cb);\n"
        "#endif\n",
        (),
    )
    expect_cover_art_low_heap_progress_errors(
        "low heap cover art direct progress subscriptions",
        cover_art_shared_media,
        "script:\n"
        "  - id: cover_art_refresh_progress\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          return false;\n"
        "ha_subscribe_attribute(cover_entity, std::string(\"media_duration\"), cb);\n"
        "ha_subscribe_attribute(cover_entity, std::string(\"media_position\"), cb);\n"
        "ha_subscribe_attribute(cover_entity, std::string(\"media_position_updated_at\"), cb);\n",
        (
            "keep media_duration out of the S3 low-heap cover art path",
            "keep media_position out of the S3 low-heap cover art path",
            "keep media_position_updated_at out of the S3 low-heap cover art path",
            "let S3 cover art initialise and consume shared progress",
            "prepare and invalidate S3 shared cover art progress",
            "prepare S3 progress before checking cover art visibility",
        ),
    )
    cover_art_progress_visibility = (
        "lvgl:\n"
        "  widgets:\n"
        "    - label:\n"
        "        id: cover_art_time_label\n"
        "        hidden: true\n"
        "    - bar:\n"
        "        id: cover_art_progress_bar\n"
        "script:\n"
        "  - id: cover_art_sync_track_text\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          bool available = espdesktop::cover_art::progress_available(id(cover_art_media_duration));\n"
        "          lv_obj_add_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN);\n"
        "          lv_obj_add_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN);\n"
        "  - id: cover_art_refresh_progress\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          bool available = espdesktop::cover_art::progress_available(duration);\n"
        "          lv_bar_set_value(id(cover_art_progress_bar), 0, LV_ANIM_OFF);\n"
        "          lv_label_set_text(id(cover_art_time_label), \"0:00  /  0:00\");\n"
        "          lv_obj_add_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN);\n"
        "          lv_obj_add_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN);\n"
        "          lv_obj_clear_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN);\n"
        "          lv_obj_clear_flag(id(cover_art_progress_bar), LV_OBJ_FLAG_HIDDEN);\n"
        "  - id: cover_art_show_black_screen\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          return espdesktop::cover_art::progress_available(id(cover_art_media_duration));\n"
        "  - id: cover_art_show_track_overlay\n"
        "    then:\n"
        "      - lambda: |-\n"
        "          return espdesktop::cover_art::progress_available(id(cover_art_media_duration));\n"
        "std::function<void()> invalidate_stale_media_duration = []() {\n"
        "  const uint32_t last_duration_ms = id(cover_art_last_duration_callback_ms);\n"
        "  const bool duration_callback_is_fresh = last_duration_ms != 0 &&\n"
        "    (uint32_t)(millis() - last_duration_ms) <= 250;\n"
        "  if (!duration_callback_is_fresh) {\n"
        "    id(cover_art_media_duration) = 0.0f;\n"
        "  }\n"
        "};\n"
        "# title callback\n"
        "std::function<void(esphome::StringRef)> handle_media_title = [](esphome::StringRef title) {\n"
        "  invalidate_stale_media_duration();\n"
        "  id(cover_art_title) = next;\n"
        "};\n"
        "if (!already_subscribed) {}\n"
        "# artist callback\n"
        "std::function<void(esphome::StringRef)> handle_media_artist = [](esphome::StringRef artist) {\n"
        "  id(cover_art_artist) = next;\n"
        "};\n"
        "if (!already_subscribed) {}\n"
        "# album callback\n"
        "std::function<void(esphome::StringRef)> handle_media_album = [](esphome::StringRef album) {\n"
        "  id(cover_art_album) = next;\n"
        "  id(cover_art_sync_track_text).execute();\n"
        "};\n"
        "if (!already_subscribed) {}\n"
        "# source callback\n"
        "std::function<void(esphome::StringRef)> handle_media_source = [](esphome::StringRef source) {\n"
        "  invalidate_stale_media_duration();\n"
        "  id(cover_art_media_source) = next;\n"
        "};\n"
        "if (!already_subscribed) {}\n"
        "# duration callback\n"
        "std::function<void(esphome::StringRef)> handle_media_duration = [](esphome::StringRef duration) {\n"
        "  id(cover_art_last_duration_callback_ms) = millis();\n"
        "  const bool next_progress_available = espdesktop::cover_art::progress_available(next_duration);\n"
        "  if (!next_progress_available) {\n"
        "    next_duration = 0.0f;\n"
        "    id(cover_art_media_position) = 0.0f;\n"
        "    id(cover_art_position_anchor) = 0.0f;\n"
        "    id(cover_art_position_anchor_epoch) = 0;\n"
        "    id(cover_art_last_position_timestamp) = 0;\n"
        "  }\n"
        "};\n"
        "if (!already_subscribed) {}\n"
    )
    expect_cover_art_progress_visibility_errors(
        "cover art progress hides without duration",
        cover_art_progress_visibility,
        (),
    )
    expect_cover_art_progress_visibility_errors(
        "unguarded cover art progress",
        cover_art_progress_visibility
        .replace("        hidden: true\n", "")
        .replace(
            "return espdesktop::cover_art::progress_available(id(cover_art_media_duration));",
            "return true;",
        )
        .replace(
            "bool available = espdesktop::cover_art::progress_available(id(cover_art_media_duration));\n",
            "",
        )
        .replace(
            "bool available = espdesktop::cover_art::progress_available(duration);\n",
            "",
        )
        .replace(
            "  if (!next_progress_available) {\n",
            "  if (true) {\n",
        ),
        (
            "initialize cover art playback time hidden",
            "guard every cover art progress reveal",
            "hide cover art playback time",
            "hide and reset unavailable cover art progress",
            "normalize invalid cover art durations",
        ),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art progress keeps stale position state",
        cover_art_progress_visibility.replace(
            "    id(cover_art_media_position) = 0.0f;\n",
            "",
        ),
        ("reset cover art position when duration becomes unavailable",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art progress discards fresh position before late duration",
        cover_art_progress_visibility.replace(
            "  const bool next_progress_available = espdesktop::cover_art::progress_available(next_duration);\n",
            "  const bool current_progress_available = espdesktop::cover_art::progress_available(id(cover_art_media_duration));\n"
            "  const bool next_progress_available = espdesktop::cover_art::progress_available(next_duration);\n",
        ),
        ("preserve fresh cover art position when duration arrives late",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art track change keeps stale duration",
        cover_art_progress_visibility.replace(
            "  invalidate_stale_media_duration();\n",
            "",
            1,
        ),
        ("mark stale cover art duration unavailable when media title changes",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art title change discards a fresh position",
        cover_art_progress_visibility.replace(
            "  invalidate_stale_media_duration();\n",
            "  invalidate_stale_media_duration();\n"
            "  id(cover_art_media_position) = 0.0f;\n",
            1,
        ),
        ("preserve fresh cover art position when title metadata arrives late",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art artist restoration discards duration",
        cover_art_progress_visibility.replace(
            "handle_media_artist = [](esphome::StringRef artist) {\n",
            "handle_media_artist = [](esphome::StringRef artist) {\n"
            "  invalidate_stale_media_duration();\n",
            1,
        ),
        ("preserve duration when restoring media artist",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art album restoration discards duration",
        cover_art_progress_visibility.replace(
            "handle_media_album = [](esphome::StringRef album) {\n",
            "handle_media_album = [](esphome::StringRef album) {\n"
            "  invalidate_stale_media_duration();\n",
            1,
        ),
        ("preserve duration when restoring media album",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art album change delays progress refresh",
        cover_art_progress_visibility.replace(
            "  id(cover_art_sync_track_text).execute();\n",
            "",
            1,
        ),
        ("refresh cover art progress immediately when media album changes",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art source change keeps stale duration",
        cover_art_progress_visibility.replace(
            "handle_media_source = [](esphome::StringRef source) {\n"
            "  invalidate_stale_media_duration();\n",
            "handle_media_source = [](esphome::StringRef source) {\n",
            1,
        ),
        ("mark stale cover art duration unavailable when media source changes",),
    )
    expect_cover_art_progress_visibility_errors(
        "cover art metadata discards a fresh duration",
        cover_art_progress_visibility.replace(
            "  if (!duration_callback_is_fresh) {\n",
            "  if (true) {\n",
            1,
        ),
        ("preserve fresh cover art duration when metadata arrives late",),
    )
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
        "              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
        "              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::DISPLAY_OFF);\n"
        "      - script.stop: display_mode_apply_transition\n"
        "      - script.stop: cover_art_hide_effect\n"
        "      - script.stop: display_mode_effect_active\n"
        "      - script.stop: display_mode_effect_setup_dimmed\n"
        "      - script.stop: display_mode_effect_off\n"
        "      - script.stop: display_mode_effect_cover_art\n"
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
        "              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART) ||\n"
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
        "",
        (
            "do not block the first button tap after normal screensaver wake",
            "do not arm a delayed wake guard clear for normal screensaver wake",
            "missing shared screensaver_wake_touch_block script",
        ),
    )
    expect_screensaver_wake_guard_errors(
        "shared release guard covers Display Off and Cover Art",
        valid_shared_wake_flow,
        valid_shared_wake_guard_widget,
        "script:\n  - id: cover_art_apply_responsive_layout\n",
        (),
    )
    expect_screensaver_wake_guard_errors(
        "Cover Art-only guard does not cover Display Off",
        valid_shared_wake_flow.replace(
            " ||\n              id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::DISPLAY_OFF)",
            "",
        ),
        valid_shared_wake_guard_widget,
        "",
        ("pre-wake Cover Art and Display Off modes",),
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
        "",
        (
            "accept the first deliberate tap after wake-touch release",
            "hide the shared wake guard after touch release",
        ),
    )
    expect_screensaver_wake_guard_errors(
        "stuck touch retains a bounded fallback",
        valid_shared_wake_flow.replace("          timeout: 2s\n", ""),
        valid_shared_wake_guard_widget,
        "",
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
        "            - script.execute: home_screen_idle_check\n"
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
        "migrated schedule leaves active cover art visible",
        migrated_schedule_reconcile.replace(
            "              id(hide_cover_art_view).execute();\n", "", 1
        ),
        ("scheduled night modes should clear active cover art",),
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
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        api = root / "common/device/api_open_modal.yaml"
        api.parent.mkdir(parents=True)
        original = (ROOT / "common/device/api_open_modal.yaml").read_text()
        scripts = root / "common/device/api_remote_actions.yaml"
        scripts.write_text((ROOT / "common/device/api_remote_actions.yaml").read_text())
        package = root / "packages.yaml"
        package.write_text(
            "packages:\n"
            "  api_remote_actions: !include common/device/api_remote_actions.yaml\n"
            "  api_open_modal: !include common/device/api_open_modal.yaml\n"
        )
        api.write_text(original)
        assert not firmware_open_modal_api_errors(root, (package,))
        for token in ("mode: restart", "espdesktop_can_prepare_modal", "script.wait: screensaver_wake",
                      "espdesktop_open_modal", "script.execute: home_screen_idle_check"):
            source_path = api if token in original else scripts
            source_text = original if source_path == api else scripts.read_text(encoding="utf-8")
            source_path.write_text(source_text.replace(token, "removed"))
            assert firmware_open_modal_api_errors(root, (package,)), token
            source_path.write_text(source_text)
        manifest = root / "devices/manifest.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps({"devices": {"constrained": {"firmware": {"package": {"apiOpenModalAction": False}}}}}),
            encoding="utf-8",
        )
        disabled_package = root / "devices/constrained/packages.yaml"
        disabled_package.parent.mkdir(parents=True)
        disabled_package.write_text("packages: {}\n", encoding="utf-8")
        # Navigation remains independently enabled, so its package includes the
        # shared scripts while omitting the modal API package.
        manifest.write_text(
            json.dumps({"devices": {"constrained": {"firmware": {"package": {
                "apiOpenModalAction": False, "apiNavigateAction": True
            }}}}}),
            encoding="utf-8",
        )
        disabled_package.write_text(
            "packages:\n"
            "  api_remote_actions: !include common/device/api_remote_actions.yaml\n"
            "  api_navigate: !include common/device/api_navigate.yaml\n",
            encoding="utf-8",
        )
        assert not firmware_open_modal_api_errors(root, (disabled_package,))
        # The inverse selection keeps the modal actions and shared scripts but
        # omits navigation.
        manifest.write_text(
            json.dumps({"devices": {"constrained": {"firmware": {"package": {
                "apiOpenModalAction": True, "apiNavigateAction": False
            }}}}}),
            encoding="utf-8",
        )
        disabled_package.write_text(
            "packages:\n"
            "  api_remote_actions: !include common/device/api_remote_actions.yaml\n"
            "  api_open_modal: !include common/device/api_open_modal.yaml\n",
            encoding="utf-8",
        )
        assert not firmware_open_modal_api_errors(root, (disabled_package,))
        package.write_text("packages: {}\n")
        assert firmware_open_modal_api_errors(root, (package,))
        api.unlink()
        assert firmware_open_modal_api_errors(root, (package,))
    print("Firmware Home Assistant binding self-tests passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", help="run guardrail self-tests")
    args = parser.parse_args()
    return run_self_test() if args.self_test else run_scan()


if __name__ == "__main__":
    raise SystemExit(main())
