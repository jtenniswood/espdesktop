#!/usr/bin/env python3
"""Guard the Companion-only fullscreen artwork transport and ownership boundary."""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]


def script_body(text: str, name: str) -> str:
    match = re.search(rf"(?ms)^  - id: {re.escape(name)}\n.*?(?=^  - id: |\Z)", text)
    return match[0] if match else ""


def check_sources(artwork: str, device: str) -> list[str]:
    errors: list[str] = []
    if re.search(r"\bha_(?:subscribe|read|send|schedule|cancel|release|reset)_|artwork_image\.update|request_update_url", artwork):
        errors.append("fullscreen artwork must not subscribe to Home Assistant or download entity artwork")
    required = {
        "cover_art_refresh_source": ("#ifdef USE_COMPANION", "companion_now_playing_handler()", "request_companion_now_playing_artwork()"),
        "cover_art_prepare_activation": ("delay: 1ms", "transition_is_current(", "source_generation", "id(cover_art_content_fingerprint)", "!id(cover_art_screensaver_enabled).state", "!id(cover_art_media_playing)"),
        "cover_art_request_artwork": ("transition_is_current(", "has_image()", "get_lv_image_dsc()", "request_companion_now_playing_artwork()"),
        "cover_art_extract_accent_color": ("transition_is_current(", "id(cover_art_transition_generation)", "extract_accent_color_rgb565("),
        "cover_art_release_stopped_artwork": ("id(cover_art_media_playing)", "DisplayMode::COVER_ART", "script.wait: cover_art_clear_image_source", "artwork_image.release: cover_art_downloaded_image"),
        "cover_art_refresh_progress": ("transition_is_current(", "progress_available(duration)", "lv_obj_add_flag(id(cover_art_time_label)", "progress_percent(position, duration)"),
    }
    for name, tokens in required.items():
        body = script_body(artwork, name)
        if any(token not in body for token in tokens):
            errors.append(f"{name}: preserve Companion activation, visibility and pixel ownership guards")
    release = script_body(artwork, "cover_art_release_stopped_artwork")
    if release.find("script.wait: cover_art_clear_image_source") > release.find("artwork_image.release:"):
        errors.append("detach artwork pixels before releasing their buffer")
    for token in ("generation != runtime.now_playing.generation", "load_owned_buffer(data, size, &decoded)", "if (!owned) return false;", "id(cover_art_runtime).image_available = decoded"):
        if token not in device:
            errors.append("Companion image callback must reject stale generations and transfer ownership only once")
            break
    if device.count("!id(cover_art_screensaver_enabled).state") < 2:
        errors.append("disabled artwork must not consume Mac metadata or decode incoming image bytes")
    if "cover_art_toggle_playback" in artwork or "cover_art_playback_button" in artwork:
        errors.append("retired Home Assistant playback controls must not remain in fullscreen artwork")
    return errors


def errors(root: Path = ROOT) -> list[str]:
    return check_sources(
        (root / "common/device/screen_cover_art.yaml").read_text(),
        (root / "devices/guition-esp32-s3-4848s040/device/device.yaml").read_text(),
    )


def self_test() -> None:
    art = (ROOT / "common/device/screen_cover_art.yaml").read_text()
    device = (ROOT / "devices/guition-esp32-s3-4848s040/device/device.yaml").read_text()
    assert not check_sources(art, device)
    assert check_sources(art + "\nha_subscribe_state(entity);\n", device)
    assert check_sources(art.replace("source_generation) != id(cover_art_content_fingerprint)", "source_generation) != 0"), device)
    assert check_sources(art.replace("script.wait: cover_art_clear_image_source", "script.stop: cover_art_clear_image_source"), device)
    assert check_sources(art, device.replace("if (!owned) return false;", ""))
    assert check_sources(art, device.replace("!id(cover_art_screensaver_enabled).state", "false"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("Companion artwork guard self-tests passed.")
        return 0
    failures = errors()
    if failures:
        print("Companion artwork check failed:\n  " + "\n  ".join(failures))
        return 1
    print("Companion artwork transport and ownership checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
