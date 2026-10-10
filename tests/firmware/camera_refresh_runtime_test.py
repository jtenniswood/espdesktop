"""Run the production camera picture handler and maintenance loop with simulated I/O."""
from pathlib import Path
import os
import re
import shlex
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / "components/espdesktop/button_grid_image.h").read_text()
functions = []
for name in (
    "image_card_preempt_active_tile_for_modal", "image_card_finish_scheduled_tile_request", "image_card_cancel_scheduled_tile_request",
    "image_card_scheduled_tile_request_allowed", "image_card_request_source_url",
    "image_card_handle_download_error", "image_card_handle_picture", "image_card_apply_downloaded",
    "image_card_begin_refresh_schedule", "image_card_refresh_due", "image_card_handle_activity_state",
):
    match = re.search(rf"^inline (?:void|bool) {name}\([^;{{]*\) \{{\n.*?^\}}", source, re.M | re.S)
    if match is None:
        raise AssertionError(f"Missing production function: {name}")
    functions.append(match.group())
# Exercise the actual expanded-entry statement without unrelated LVGL I/O.
entry = re.search(r"ctx->refresh_schedule\.enter_expanded\([^;]+;", source)
assert entry is not None
functions.append("inline void image_card_test_enter_expanded(ImageCardCtx *ctx) {" + entry.group() + "}")
with tempfile.TemporaryDirectory(prefix="camera-refresh-runtime-") as temp:
    directory = Path(temp)
    (directory / "camera_refresh_runtime_functions.h").write_text("\n\n".join(functions))
    executable = directory / "test"
    subprocess.run(shlex.split(os.environ.get("CXX", "c++")) + [
        "-std=c++17", "-Wall", "-Wextra", "-Werror", "-I", str(directory),
        "-I", str(ROOT / "components/espdesktop"),
        str(ROOT / "tests/firmware/camera_refresh_runtime_test.cpp"), "-o", str(executable),
    ], check=True)
    subprocess.run([str(executable)], check=True)
