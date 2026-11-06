// Run with scripts/check_lvgl_render.py against the pinned LVGL source.
#include "lvgl.h"
#include <cassert>
#include <cstdio>
#include <cstring>
#include "src/misc/cache/instance/lv_image_cache.h"
#include "src/misc/cache/instance/lv_image_header_cache.h"
#include "instant_button_style.h"
#include "button_grid_continuous_corners.h"
#include "app_card_running_style.h"
#include "running_app_controller_under_test.h"

static constexpr int SIDE = 240;
static uint16_t frame[SIDE * SIDE];
static uint16_t buffer[SIDE * 30];
static unsigned flush_count = 0;

// Compositing an alpha-masked layer can round down one RGB565 step per channel.
static bool same_rgb565_colour(uint16_t actual, uint16_t expected) {
  for (auto channel : {std::pair{11, 31}, std::pair{5, 63}, std::pair{0, 31}}) {
    const int delta = int((actual >> channel.first) & channel.second) -
                      int((expected >> channel.first) & channel.second);
    if (delta < -1 || delta > 1) return false;
  }
  return true;
}

static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pixels) {
  ++flush_count;
  const auto row_bytes = (area->x2 - area->x1 + 1) * sizeof(uint16_t);
  for (int y = area->y1; y <= area->y2; ++y) {
    std::memcpy(frame + y * SIDE + area->x1, pixels, row_bytes);
    pixels += row_bytes;
  }
  lv_display_flush_ready(display);
}

static void save(const char *name) {
  FILE *file = std::fopen(name, "wb");
  assert(file);
  std::fprintf(file, "P6\n240 240\n255\n");
  for (auto pixel : frame) {
    const unsigned char rgb[] = {
        static_cast<unsigned char>(((pixel >> 11) & 31) * 255 / 31),
        static_cast<unsigned char>(((pixel >> 5) & 63) * 255 / 63),
        static_cast<unsigned char>((pixel & 31) * 255 / 31)};
    std::fwrite(rgb, 1, sizeof(rgb), file);
  }
  std::fclose(file);
}

int main() {
  lv_init();
  auto *display = lv_display_create(SIDE, SIDE);
  lv_display_set_color_format(display, LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(display, buffer, nullptr, sizeof(buffer), LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display, flush);
  lv_obj_set_style_bg_color(lv_screen_active(), lv_color_hex(0x181818), LV_PART_MAIN);

  auto *button = lv_button_create(lv_screen_active());
  lv_obj_set_pos(button, 20, 20);
  lv_obj_set_size(button, 145, 140);
  lv_obj_set_style_bg_color(button, lv_color_hex(0x333333), LV_PART_MAIN);
  lv_obj_set_style_bg_color(button, lv_color_hex(0xFF8C00), LV_STATE_CHECKED);
  lv_obj_set_style_bg_color(button, lv_color_hex(0xFF8C00), LV_STATE_PRESSED);
  lv_obj_set_style_shadow_width(button, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(button, 0, LV_PART_MAIN);
  apply_grid_card_corners(button, 26, true);
  apply_instant_button_feedback(button);
  lv_refr_now(display);
  save("default.ppm");
  const auto inactive = frame[60 * SIDE + 60];
  const auto background = frame[0];

  for (int press = 0; press < 10; ++press) {
    lv_obj_add_state(button, LV_STATE_PRESSED);
    lv_refr_now(display);
    save("pressed.ppm");
    assert(frame[60 * SIDE + 60] != inactive);
    assert(frame[20 * SIDE + 20] == background);

    lv_obj_remove_state(button, LV_STATE_PRESSED);
    lv_obj_add_state(button, LV_STATE_CHECKED);
    lv_refr_now(display);
    save("checked.ppm");
    // No animation timer or delay is needed to paint the new state.
    assert(frame[60 * SIDE + 60] != inactive);
    assert(frame[20 * SIDE + 20] == background);
    const auto active = frame[60 * SIDE + 60];
    for (int redraw = 0; redraw < 20; ++redraw) {
      lv_tick_inc(50);
      lv_timer_handler();
      lv_obj_invalidate(button);
      lv_refr_now(display);
      assert(frame[60 * SIDE + 60] == active);
      assert(frame[20 * SIDE + 20] == background);
    }
    lv_obj_remove_state(button, LV_STATE_CHECKED);
    lv_refr_now(display);
    assert(frame[60 * SIDE + 60] == inactive);
  }
  CompanionRuntimeSnapshot state;
  state.connected = true;
  state.application_highlight_known = true;
  state.application_highlight_id = "com.example.Other";
  state.running_applications_known = true;
  state.running_application_ids.clear();
  for (const auto *theme : {&DARK_THEME, &LIGHT_THEME}) {
    set_active_theme_palette(*theme);
    const auto neutral = theme_display_color(theme->surface_card);
    const auto accent = current_button_primary_color();
    lv_obj_set_style_bg_color(lv_screen_active(), lv_color_hex(theme_display_color(theme->background)), LV_PART_MAIN);
    lv_obj_set_style_bg_color(button, lv_color_hex(neutral), LV_PART_MAIN);
    lv_obj_set_style_bg_color(button, lv_color_hex(accent), LV_STATE_CHECKED);
    companion_apply_card_running_state(button, "com.example.App", "", true, state);
    lv_refr_now(display);
    assert(lv_obj_has_state(button, LV_STATE_USER_1));
    save(theme == &DARK_THEME ? "closed-dark.ppm" : "closed-light.ppm");
    const auto shaded = frame[60 * SIDE + 60];
    const auto page_pixel = frame[0];
    assert(same_rgb565_colour(shaded, page_pixel));
    assert(lv_obj_get_style_bg_opa(button, LV_PART_MAIN) == LV_OPA_TRANSP);
    assert(lv_obj_get_style_outline_width(button, LV_PART_MAIN) == 2);
    assert(lv_obj_get_style_outline_pad(button, LV_PART_MAIN) == -2);
    assert((lv_color_to_u32(lv_obj_get_style_outline_color(button, LV_PART_MAIN)) & 0xFFFFFF) == app_card_closed_colour(neutral));
    assert(same_rgb565_colour(frame[90 * SIDE + 20], lv_color_to_u16(lv_color_hex(app_card_closed_colour(neutral)))));
    assert(shaded != lv_color_to_u16(lv_color_hex(neutral)));
    assert(shaded != lv_color_to_u16(lv_color_hex(accent)));
    assert(frame[20 * SIDE + 20] == page_pixel);
    lv_obj_add_state(button, LV_STATE_PRESSED);
    lv_refr_now(display);
    assert(lv_obj_get_style_outline_width(button, LV_PART_MAIN) == 0);
    assert(lv_obj_get_style_bg_opa(button, LV_PART_MAIN) == LV_OPA_COVER);
    assert((lv_color_to_u32(lv_obj_get_style_bg_color(button, LV_PART_MAIN)) & 0xFFFFFF) == accent);
    // The native pressed recolour may tint the accent; it must still paint a
    // filled centre immediately, rather than leave the closed outline visible.
    assert(frame[60 * SIDE + 60] != page_pixel);
    assert(!same_rgb565_colour(frame[60 * SIDE + 60], lv_color_to_u16(lv_color_hex(neutral))));
    lv_obj_remove_state(button, LV_STATE_PRESSED);
    lv_refr_now(display);
    assert(lv_obj_get_style_outline_width(button, LV_PART_MAIN) == 2);
    assert(same_rgb565_colour(frame[60 * SIDE + 60], page_pixel));
    const auto flushes = flush_count;
    for (int repeat = 0; repeat < 100; ++repeat) {
      companion_apply_card_running_state(button, "com.example.App", "", true, state);
      lv_refr_now(display);
    }
    assert(flush_count == flushes); // Repeated snapshots do not redraw cards.

    state.running_application_ids = {"com.example.App"};
    companion_apply_card_running_state(button, "com.example.App", "", true, state);
    lv_refr_now(display);
    assert(!lv_obj_has_state(button, LV_STATE_USER_1));
    assert(lv_obj_get_style_outline_width(button, LV_PART_MAIN) == 0);
    assert(same_rgb565_colour(frame[60 * SIDE + 60], lv_color_to_u16(lv_color_hex(neutral))));

    state.application_highlight_id = "com.example.App";
    companion_apply_card_running_state(button, "com.example.App", "", true, state);
    set_card_checked_state(button, companion_action_focused(state, "com.example.App", true));
    lv_refr_now(display);
    assert(!lv_obj_has_state(button, LV_STATE_USER_1));
    assert(lv_obj_get_style_outline_width(button, LV_PART_MAIN) == 0);
    assert(same_rgb565_colour(frame[60 * SIDE + 60], lv_color_to_u16(lv_color_hex(accent))));
    assert(frame[20 * SIDE + 20] == page_pixel);

    state.application_highlight_id = "com.example.Other";
    state.running_application_ids.clear();
    companion_apply_card_running_state(button, "com.example.App", "", true, state);
    set_card_checked_state(button, false);
    lv_refr_now(display);
    assert(lv_obj_has_state(button, LV_STATE_USER_1));
    assert(same_rgb565_colour(frame[60 * SIDE + 60], page_pixel));
    state.running_application_ids = {"com.example.App"};
    // URL cards represent pages, not whole applications.
    companion_apply_card_running_state(button, "com.example.App", "url.page", true, state);
    assert(!lv_obj_has_state(button, LV_STATE_USER_1));
    state.connected = false;
    companion_apply_card_running_state(button, "com.example.App", "", true, state);
    assert(!lv_obj_has_state(button, LV_STATE_USER_1));
    state.connected = true;
    state.running_application_ids.clear();
  }
  std::puts("Running/background/focused/closed app fills, both themes and unchanged-refresh performance passed.");
  lv_obj_delete(button);
  assert(espdesktop::corners::mask_cache() == nullptr);
  lv_display_delete(display);
  lv_deinit();
  std::puts("Real LVGL: immediate pressed/checked fills retain rounded corners across 200 delayed redraws.");
}
