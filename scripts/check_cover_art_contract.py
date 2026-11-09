#!/usr/bin/env python3
"""Compile and exercise the pure cover-art policy, layout, and state helpers."""
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = r'''
#include <cassert>
#include <limits>
#include "cover_art.h"
using namespace espdesktop::cover_art;
int main() {
  assert(external_media_source("TV"));
  assert(external_media_source(" line-in "));
  assert(external_media_source("Line In"));
  assert(external_media_source("HDMI"));
  assert(external_media_source("hdmi 1"));
  assert(!external_media_source("Spotify"));
  assert(media_entity_state_usable("playing"));
  assert(media_entity_state_usable("paused"));
  assert(media_entity_state_usable(" BUFFERING "));
  assert(!media_entity_state_usable("idle"));
  assert(!media_entity_state_usable("off"));
  assert(!media_entity_state_usable(" unavailable "));
  assert(media_artwork_content_current(true, true, "playing", true));
  assert(media_artwork_content_current(true, true, "paused", true));
  assert(media_artwork_content_current(true, true, "buffering", true));
  assert(!media_artwork_content_current(true, true, "idle", true));
  assert(!media_artwork_content_current(true, true, "off", true));
  assert(!media_artwork_content_current(true, false, "playing", true));
  assert(!media_artwork_content_current(false, true, "playing", true));
  assert(!media_artwork_content_current(true, true, "playing", false));
  assert(media_state_change_invalidates_retained_content(false, "unknown", "idle"));
  assert(media_state_change_invalidates_retained_content(true, "playing", "idle"));
  assert(media_state_change_invalidates_retained_content(true, "paused", "off"));
  assert(media_state_change_invalidates_retained_content(true, "idle", "off"));
  assert(!media_state_change_invalidates_retained_content(true, "idle", "idle"));
  assert(!media_state_change_invalidates_retained_content(true, "idle", "playing"));
  assert(!media_state_change_invalidates_retained_content(true, "paused", "buffering"));
  assert(!media_card_artwork_should_clear(false, true, "unknown", false));
  assert(!media_card_artwork_should_clear(true, true, "playing", false));
  assert(!media_card_artwork_should_clear(true, true, "paused", false));
  assert(!media_card_artwork_should_clear(true, true, "buffering", false));
  assert(media_card_artwork_should_clear(true, true, "idle", false));
  assert(!media_card_artwork_should_clear(true, true, "idle", true));
  assert(media_card_artwork_should_clear(true, true, "off", false));
  assert(media_card_artwork_should_clear(true, false, "playing", true));
  assert(media_entity_content_available(true, true, true));
  assert(!media_entity_content_available(true, true, false));
  assert(!media_entity_content_available(true, false, true));
  assert(!media_entity_content_available(false, true, true));
  assert(!use_secondary_media_entity(false, true, true, true));
  assert(!use_secondary_media_entity(true, false, true, true));
  assert(!use_secondary_media_entity(true, true, false, true));
  assert(!use_secondary_media_entity(true, true, true, false));
  assert(use_secondary_media_entity(true, true, true, true));
  // Only a pause requested from this screensaver owns a retained session.
  PlaybackControl control;
  control.observe("player.a", "paused", 1);
  assert(!control.retains_pause("player.a"));
  assert(control.begin("player.a", "playing", 10) == PlaybackCommand::PAUSE);
  assert(control.begin("player.a", "playing", 11) == PlaybackCommand::NONE);
  control.observe("player.a", "playing", 20); // repeated state before acknowledgement
  control.observe("player.a", "paused", 30);
  assert(control.retains_pause("player.a") && !control.pending());
  assert(control.begin("player.a", "paused", 40) == PlaybackCommand::PLAY);
  control.observe("player.a", "paused", 50);
  assert(control.retains_pause("player.a"));
  control.observe("player.a", "buffering", 60);
  control.observe("player.a", "paused", 70); // next pause was external
  assert(!control.retains_pause("player.a"));
  // Failed/timed-out pause requests must not claim a later external pause.
  control.begin("player.a", "playing", 100);
  control.cancel_pending();
  control.observe("player.a", "paused", 101);
  assert(!control.retains_pause("player.a"));
  control.begin("player.a", "playing", 200);
  control.observe("player.a", "paused", 200 + PlaybackControl::COMMAND_TIMEOUT_MS);
  assert(!control.retains_pause("player.a"));
  control.begin("player.a", "playing", UINT32_MAX - 100);
  control.observe("player.a", "paused", 20); // millis wrap
  assert(control.retains_pause("player.a"));
  control.begin("player.a", "paused", 30);
  control.expire(30 + PlaybackControl::COMMAND_TIMEOUT_MS);
  assert(!control.pending() && control.retains_pause("player.a"));
  // Dismissal, player replacement, and stopped playback release ownership.
  control.reset();
  control.observe("player.a", "paused", 6000);
  assert(!control.retains_pause("player.a"));
  for (const auto &state : {"idle", "off", "unavailable", "unknown"}) {
    control.begin("player.a", "playing", 7000);
    control.observe("player.a", "paused", 7001);
    control.observe("player.a", state, 7002);
    assert(!control.retains_pause("player.a"));
  }
  control.begin("player.a", "playing", 8000);
  control.observe("player.b", "paused", 8001);
  assert(!control.retains_pause("player.a") && !control.retains_pause("player.b"));
  assert(control.begin("player.b", "paused", 8002) == PlaybackCommand::NONE);
  // Connection loss ends the retained session, including a pending resume.
  control.begin("player.a", "playing", 9000);
  control.observe("player.a", "paused", 9001);
  assert(!control.update_connection(true));
  assert(control.retains_pause("player.a"));
  control.begin("player.a", "paused", 9002);
  assert(control.update_connection(false));
  assert(!control.pending() && !control.retains_pause("player.a"));
  assert(!control.update_connection(false));
  assert(!control.update_connection(true));
  control.observe("player.a", "paused", 9003);
  assert(!control.retains_pause("player.a")); // reconnect cannot reclaim the pause
  control.begin("player.a", "playing", 9010);
  assert(!control.update_connection(false)); // pending pause is not a retained screen
  assert(!control.pending());
  control.observe("player.a", "paused", 9011);
  assert(!control.retains_pause("player.a"));
  // A local pause reveals faded details and prevents their timer from hiding them.
  control.reset();
  assert(track_overlay_mode(true, false, true, true, 10) == TrackOverlayMode::TIMED);
  control.begin("player.a", "playing", 10000);
  control.observe("player.a", "paused", 10001);
  for (float seconds : {-1.0f, 0.0f, 10.0f, 30.0f}) {
    assert(track_overlay_mode(false, control.retains_pause("player.a"), true, true, seconds)
           == TrackOverlayMode::PERSISTENT);
  }
  control.begin("player.a", "paused", 10002);
  assert(track_overlay_mode(false, control.retains_pause("player.a"), true, true, 10)
         == TrackOverlayMode::PERSISTENT); // wait for HA before restarting the timer
  control.observe("player.a", "playing", 10003);
  assert(track_overlay_mode(true, control.retains_pause("player.a"), true, true, 10)
         == TrackOverlayMode::TIMED);
  assert(track_overlay_mode(true, false, true, true, 0) == TrackOverlayMode::HIDDEN);
  assert(track_overlay_mode(true, false, true, true, -1) == TrackOverlayMode::PERSISTENT);
  control.observe("player.a", "paused", 10004); // external pause must not retain details
  assert(track_overlay_mode(false, control.retains_pause("player.a"), true, true, 10)
         == TrackOverlayMode::HIDDEN);
  assert(track_overlay_mode(true, false, false, true, 10) == TrackOverlayMode::PERSISTENT);
  assert(track_overlay_mode(true, false, true, false, 10) == TrackOverlayMode::PERSISTENT);
  PolicyInput p; assert(!policy_allows_display(p));
  p.enabled = p.media_playing = p.entity_configured = true; assert(policy_allows_display(p));
  p.external_input_active = p.hide_external_input = true;
  assert(!policy_allows_display(p) && !policy_allows_download(p));
  p.hide_external_input = false; p.schedule_blocks = true;
  assert(!policy_allows_display(p) && policy_allows_download(p));
  p.schedule_blocks = false; p.alarm_takeover_active = true; assert(!policy_allows_display(p));
  assert(feature_allowed(true, true, true, false, false));
  assert(!feature_allowed(true, true, true, true, true));
  assert(display_allowed(true, true, true, true, false, false, false, false));
  assert(!display_allowed(true, true, true, true, false, false, false, true));
  auto ten = cover_art_layout("guition-esp32-p4-jc8012p4a1", "0", 1280, 800, 800, 506);
  assert(ten.split && ten.art_size == 800 && ten.panel_x == 840);
  auto ten_v2 = cover_art_layout("guition-esp32-p4-jc8012p4a1-v2", "90", 800, 1280, 800, 506);
  assert(ten_v2.screen_height == 1280 && ten_v2.panel_y == 834);
  // Five full 103px title lines must leave one artist line and elapsed time
  // above the playback button. Short titles release space for longer artists.
  for (const auto &slug : {"guition-esp32-p4-jc8012p4a1",
                          "guition-esp32-p4-jc8012p4a1-v2",
                          "guition-esp32-p4-jc8012p4a1-v3"}) {
    for (const auto &rotation : {"0", "180"}) {
      const auto layout = cover_art_layout(slug, rotation, 1280, 800, 800, 506);
      const auto button = playback_button_layout(layout, 103);
      assert(layout.title_max_lines == 5 && button.title_max_height == 515);
      const int artist = artist_height_budget(button.panel_height, 515, 47, 4, 35);
      assert(artist == 51);
      assert(515 + artist + 35 <= button.panel_height);
      assert(layout.panel_y + button.panel_height <= 800 - button.margin - button.size);
      assert(artist_height_budget(button.panel_height, 103, 47, 4, 35) > artist);
      assert(artist_height_budget(button.panel_height, 515, 47, 4, 0) >= artist);
    }
    assert(cover_art_layout(slug, "90", 800, 1280, 800, 506).title_max_lines == 0);
  }
  auto seven_v2 = cover_art_layout("guition-esp32-p4-jc1060p470-v2", "0", 1024, 600, 600, 260);
  assert(seven_v2.split && seven_v2.art_size == 600 && seven_v2.panel_x == 615);
  for (const auto &rotation : {"0", "90", "180", "270"}) {
    const auto original = cover_art_layout("guition-esp32-p4-jc4880p443", rotation, 480, 800, 480, 130);
    const auto v3 = cover_art_layout("guition-esp32-p4-jc4880p443-v3", rotation, 480, 800, 480, 130);
    assert(v3.split && v3.screen_width == original.screen_width && v3.screen_height == original.screen_height);
    assert(v3.panel_x == original.panel_x && v3.panel_y == original.panel_y);
    assert(v3.title_max_height == original.title_max_height && v3.art_size == original.art_size);
    assert(rotation_is_landscape("guition-esp32-p4-jc4880p443-v3", rotation) ==
           rotation_is_landscape("guition-esp32-p4-jc4880p443", rotation));
  }
  // The 7-inch font has 89px lines with -8px spacing: four lines use 332px.
  for (const auto &slug : {"guition-esp32-p4-jc1060p470", "guition-esp32-p4-jc1060p470-v2"}) {
    for (const auto &rotation : {"0", "180"}) {
      const auto layout = cover_art_layout(slug, rotation, 1024, 600, 600, 260);
      const auto button = playback_button_layout(layout, 89, -8);
      assert(layout.title_max_lines == 4 && button.title_max_height == 332);
      const int artist = artist_height_budget(button.panel_height, 332, 47, 10, 42);
      assert(artist == 57);
      assert(332 + artist + 42 <= button.panel_height);
      assert(layout.panel_y + button.panel_height <= 600 - button.margin - button.size);
      assert(artist_height_budget(button.panel_height, 89, 47, 10, 42) > artist);
    }
    for (const auto &rotation : {"90", "270"}) {
      const auto layout = cover_art_layout(slug, rotation, 600, 1024, 600, 260);
      assert(layout.title_max_lines == 0 && layout.title_max_height == 162);
    }
  }
  auto four = cover_art_layout("guition-esp32-p4-jc4880p443", "90", 800, 480, 480, 220);
  assert(four.screen_width == 800);
  assert(playback_button_layout(four).size == 112);
  // Three 69px title lines leave room for artist and elapsed time above the
  // playback control in both landscape rotations of the 4.3-inch display.
  for (const auto &rotation : {"90", "270"}) {
    const auto layout = cover_art_layout("guition-esp32-p4-jc4880p443", rotation, 800, 480, 480, 130);
    const auto button = playback_button_layout(layout, 69);
    assert(layout.title_max_lines == 3 && button.title_max_height == 207);
    const int artist = artist_height_budget(button.panel_height, 207, 47, 10, 42);
    assert(artist >= 57);
    assert(207 + artist + 42 <= button.panel_height);
    assert(layout.panel_y + button.panel_height <= 480 - button.margin - button.size);
    assert(artist_height_budget(button.panel_height, 69, 47, 10, 42) > artist);
  }
  for (const auto &rotation : {"0", "180"}) {
    const auto layout = cover_art_layout("guition-esp32-p4-jc4880p443", rotation, 480, 800, 480, 130);
    assert(layout.title_max_lines == 0 && layout.title_max_height == 130);
  }
  auto square = cover_art_layout("esp32-p4-86", "0", 720, 720, 800, 495);
  assert(!square.split && square.art_size == 720 && square.panel_padding == 36);
  assert(playback_button_layout(square).size == 144);
  for (const auto &slug : {"guition-esp32-s3-4848s040", "esp32-p4-86"}) {
    const bool s3 = std::string(slug) == "guition-esp32-s3-4848s040";
    const int side = s3 ? 480 : 720;
    const int title_line = s3 ? 82 : 123;
    const int artist_line = s3 ? 47 : 70;
    const int artist_padding = s3 ? 6 : 9;
    const int time_height = s3 ? 35 : 53;
    for (const auto &rotation : {"0", "90", "180", "270"}) {
      const auto layout = cover_art_layout(slug, rotation, side, side, side, s3 ? 330 : 495);
      const auto button = playback_button_layout(layout, title_line);
      assert(layout.title_max_lines == 3 && button.title_max_height == 3 * title_line);
      const int content_height = button.panel_height - layout.panel_padding - button.panel_bottom_padding;
      const int artist = artist_height_budget(content_height, button.title_max_height,
                                              artist_line, artist_padding, time_height);
      assert(artist >= artist_line + artist_padding);
      assert(button.title_max_height + artist + time_height <= content_height);
      assert(layout.panel_y + button.panel_height <= side - button.margin - button.size);
      // Turning off the control restores the full panel, still capped at three title lines.
      assert(button.title_max_height + artist_line + artist_padding + time_height <=
             layout.panel_height - 2 * layout.panel_padding);
    }
  }
  for (const auto &layout : {ten, ten_v2, seven_v2, four, square,
       cover_art_layout("guition-esp32-s3-4848s040", "0", 480, 480, 480, 330),
       cover_art_layout("guition-esp32-p4-jc4880p443", "0", 480, 800, 480, 130)}) {
    const auto button = playback_button_layout(layout);
    assert(button.size >= 80 && button.size <= 144);
    assert(button.panel_width > 0 && button.panel_height > 0 && button.title_max_height > 0);
    const int button_x = layout.screen_width - button.margin - button.size;
    const int button_y = layout.screen_height - button.margin - button.size;
    assert(layout.panel_x + button.panel_width <= button_x ||
           layout.panel_y + button.panel_height <= button_y);
  }
  RuntimeState s; assert(!s.needs_download()); s.select_source("track-a"); assert(s.needs_download());
  s.begin_download("track-a?refresh=1"); s.select_source("track-b");
  assert(s.apply_download("track-a?refresh=1") && s.loaded_url == "track-a" && s.needs_download());
  s.begin_download("track-b"); assert(s.download_active());
  assert(s.apply_download("track-b") && s.current_image_loaded() && !s.needs_download());
  s.select_source("broken");
  s.record_failure(); assert(s.retry_count == 0);
  for (int i = 0; i < MAX_DOWNLOAD_RETRIES; ++i) assert(s.begin_retry());
  assert(!s.can_retry() && s.retry_count == MAX_DOWNLOAD_RETRIES);
  s.select_source("recovered"); assert(s.retry_count == 0 && s.can_retry());
  // Playback stop/disable while a retry is pending must cancel all artwork work.
  s.begin_download("recovered"); s.record_failure(); s.clear_image();
  assert(!s.download_active() && !s.needs_download() && s.retry_count == 0);
  // An entity/track change during retry starts a fresh budget and rejects stale completion.
  s.select_source("entity-a"); s.begin_download("entity-a"); s.record_failure();
  s.select_source("entity-b"); assert(s.retry_count == 0 && s.refresh_needed);
  s.begin_download("entity-b"); assert(!s.apply_download("entity-a"));
  assert(s.apply_download("entity-b") && s.current_image_loaded());
  // Rapid play/pause policy changes cannot bypass alarm, schedule, or source filtering.
  assert(display_allowed(true, true, true, true, false, false, false, false));
  assert(!display_allowed(true, false, true, true, false, false, false, false));
  assert(!display_allowed(true, true, true, false, false, false, false, false));
  assert(!display_allowed(true, true, true, true, false, false, true, false));
  // Rotations remain deterministic when events repeat or arrive after boot.
  auto portrait_again = cover_art_layout("guition-esp32-p4-jc1060p470", "90", 600, 1024, 600, 260);
  auto portrait_repeat = cover_art_layout("guition-esp32-p4-jc1060p470", "90", 600, 1024, 600, 260);
  assert(portrait_again.panel_y == portrait_repeat.panel_y && portrait_again.art_size == 600);
  const float infinity = std::numeric_limits<float>::infinity();
  const float invalid = std::numeric_limits<float>::quiet_NaN();
  assert(progress_available(120.0f));
  assert(!progress_available(0.0f) && !progress_available(-1.0f));
  assert(!progress_available(infinity) && !progress_available(invalid));
  assert(progress_percent(0, 0) == 0 && progress_percent(30, 120) == 25 && progress_percent(150, 120) == 100);
  assert(progress_percent(30, infinity) == 0 && progress_percent(30, invalid) == 0);
  assert(progress_percent(invalid, 120) == 0);
  const uint8_t red_le[] = {0x00, 0xF8};
  const uint8_t red_be[] = {0xF8, 0x00};
  auto little_red = extract_accent_color_rgb565(red_le, 1, 1, false, 0, 0, 1, 1);
  auto big_red = extract_accent_color_rgb565(red_be, 1, 1, true, 0, 0, 1, 1);
  assert(little_red.valid && little_red.red == 255 && little_red.green == 0 && little_red.blue == 0);
  assert(big_red.valid && big_red.red == 255 && big_red.green == 0 && big_red.blue == 0);
  const uint8_t red_blue_le[] = {0x00, 0xF8, 0x1F, 0x00};
  auto blue_content = extract_accent_color_rgb565(red_blue_le, 2, 1, false, 1, 0, 1, 1);
  assert(blue_content.valid && blue_content.red == 0 && blue_content.blue == 255);
  auto full_fallback = extract_accent_color_rgb565(red_blue_le, 2, 1, false, 4, 0, 1, 1);
  assert(full_fallback.valid && full_fallback.red == 127 && full_fallback.blue == 127);
  auto dark_red = darken_accent_color(little_red);
  // Keep the icon readable for pale artwork without reducing button brightness.
  assert(playback_icon_color({229,229,229,true}, {234,234,234,true}) == 0x000000);
  assert(playback_icon_color({49,49,49,true}, {88,88,88,true}) == 0xFFFFFF);
  for (int red = 0; red <= 255; red += 17) {
    for (int green = 0; green <= 255; green += 17) {
      for (int blue = 0; blue <= 255; blue += 17) {
        const AccentColor normal{static_cast<uint8_t>(red * 9 / 10),
                                 static_cast<uint8_t>(green * 9 / 10),
                                 static_cast<uint8_t>(blue * 9 / 10), true};
        const AccentColor pressed{static_cast<uint8_t>(normal.red + (255 - normal.red) * 48 / 255),
                                  static_cast<uint8_t>(normal.green + (255 - normal.green) * 48 / 255),
                                  static_cast<uint8_t>(normal.blue + (255 - normal.blue) * 48 / 255), true};
        const bool dark_icon = playback_icon_color(normal, pressed) == 0;
        for (const auto &background : {normal, pressed}) {
          const float luminance = accent_luminance(background);
          const float contrast = dark_icon ? (luminance + 0.05f) / 0.05f : 1.05f / (luminance + 0.05f);
          assert(contrast >= 3.0f);
        }
      }
    }
  }
  assert(dark_red.valid && dark_red.red == 85 && dark_red.green == 0 && dark_red.blue == 0);
  assert(!extract_accent_color_rgb565(nullptr, 1, 1, false, 0, 0, 1, 1).valid);
}
'''
with tempfile.TemporaryDirectory(prefix="cover-art-contract-") as temp_dir:
    temp = Path(temp_dir); source, binary = temp / "test.cpp", temp / "test"
    source.write_text(SOURCE, encoding="utf-8")
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    f"-I{ROOT / 'components' / 'espdesktop'}", str(source), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)

downloader = (ROOT / "components" / "artwork_image" / "artwork_image.cpp").read_text(encoding="utf-8")
for required in (
    "max_download_buffer_size_",
    "peak_download_buffer_size_",
    "Artwork download exceeded transfer limit",
    "shrink_to(0)",
    "new (std::nothrow) P4PipelineJob()",
    "P4_PIPELINE_PENDING_SLOTS",
    "P4_PIPELINE_COMPLETED_SLOTS",
    "can_use_p4_pipeline(this->url_)",
):
    if required not in downloader:
        raise SystemExit(f"Artwork downloader memory contract missing: {required}")
if """if (effective_url == this->url_) {
      if (this->update_pending_) {
        this->update_pending_ = false;
        this->pending_url_.clear();
""" not in downloader:
    raise SystemExit("Artwork downloader must cancel a stale pending URL when the source returns to the active URL")
if "std::make_shared<P4PipelineJob>" in downloader:
    raise SystemExit("P4 artwork jobs must fail cleanly instead of throwing during allocation")
if "std::vector<P4PipelineResult *> completed_" in downloader:
    raise SystemExit("P4 artwork result publication must not allocate while holding the pipeline lock")
if "header_names_" in downloader:
    raise SystemExit("P4 artwork requests must remove moved headers without retaining allocating copies")
for forbidden in (
    "job->url = url",
    "job->headers = headers",
):
    if forbidden in downloader:
        raise SystemExit(f"P4 artwork job metadata must use checked or moved storage: {forbidden}")
for required in (
    "job->url = static_cast<char *>(heap_caps_malloc(",
    "job->headers = std::move(headers)",
    "if (job->cancelled.load()) {\n      delete result;\n      this->reset_client_();",
):
    if required not in downloader:
        raise SystemExit(f"P4 artwork job safety contract missing: {required}")

jpeg_decoder = (ROOT / "components" / "artwork_image" / "jpeg_image.cpp").read_text(encoding="utf-8")
# Exercise buffer ownership on success and failure instead of requiring a
# particular spelling of manual cleanup; the decoder now uses scoped ownership.
subprocess.run(
    [sys.executable, str(ROOT / "tests/firmware/p4_jpeg_memory_test.py")], check=True
)

if 'if (err == ESP_ERR_NOT_SUPPORTED) {' not in jpeg_decoder:
    raise SystemExit("P4 JPEG unsupported-format fallback must be handled explicitly")
if 'ESP_LOGD(TAG, "ESP32-P4 JPEG format is not hardware-supported; using software decoder");' not in jpeg_decoder:
    raise SystemExit("P4 JPEG unsupported-format fallback must be debug-level")
if 'ESP_LOGW(TAG, "ESP32-P4 JPEG hardware rejected image (error %d); using software decoder", err);' not in jpeg_decoder:
    raise SystemExit("P4 JPEG unexpected hardware failures must remain warnings")

# Fullscreen artwork now arrives through the authenticated Companion stream.
# Keep the transport, generation and owned-buffer checks beside the runtime tests.
from check_companion_artwork import errors as companion_artwork_errors
failures = companion_artwork_errors(ROOT)
if failures:
    raise SystemExit("Companion artwork contract failed: " + "; ".join(failures))

image_decoder = (ROOT / "components" / "artwork_image" / "image_decoder.cpp").read_text(encoding="utf-8")
for required in (
    "if (!this->buffer_ || offset > this->size_)",
    "return nullptr;",
):
    if required not in image_decoder:
        raise SystemExit(f"Artwork download-buffer null-safety contract missing: {required}")
# Retain shared fullscreen touch, progress and track-overlay behavior after
# deleting entity subscriptions and the Home Assistant playback button.
from check_firmware_ha_bindings import yaml_script_body
screen = (ROOT / "common/device/screen_cover_art.yaml").read_text()
touch = yaml_script_body(screen, "cover_art_handle_touch") or ""
for required in (
    "!id(espdesktop_app).display().target_mode_is(espdesktop::DisplayMode::COVER_ART)",
    "lv_obj_has_flag(id(cover_art_screensaver), LV_OBJ_FLAG_HIDDEN)",
    "script.execute: cover_art_pause_after_touch",
    "script.wait: cover_art_pause_after_touch",
    "script.execute: screensaver_wake",
):
    assert required in touch, f"Missing cover-art touch routing: {required}"
progress = yaml_script_body(screen, "cover_art_refresh_progress") or ""
assert "const bool time_was_hidden = lv_obj_has_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN);" in progress
assert "if (time_was_hidden != lv_obj_has_flag(id(cover_art_time_label), LV_OBJ_FLAG_HIDDEN))" in progress
assert "id(cover_art_fit_artist_text).execute();" in progress
# Missing duration and normal playback refit only when visibility changes.
assert progress.count("refit_artist_if_needed();") == 2
assert progress.count("refit_artist_if_needed();\n            return;") == 1
assert progress.rfind("refit_artist_if_needed();") > progress.index("lv_label_set_text(id(cover_art_time_label), label);")
overlay = yaml_script_body(screen, "cover_art_show_track_overlay") or ""
assert "mode: restart" in overlay
assert "track_overlay_mode(" in overlay
assert "TrackOverlayMode::TIMED" in overlay and "TrackOverlayMode::HIDDEN" in overlay
assert "id(cover_art_track_overlay_duration).state * 1000" in overlay
delayed_hide = overlay[overlay.index("- delay:"):]
assert "id(cover_art_media_playing) &&" in delayed_hide
assert "transition_is_current(" in delayed_hide
print("Cover art policy, layout, and state contract checks passed.")
