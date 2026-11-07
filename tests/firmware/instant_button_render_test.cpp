// Run with scripts/check_lvgl_render.py against the pinned LVGL source.
#include "lvgl.h"
#include <cassert>
#include <cstdio>
#include <cstring>
#include "src/misc/cache/instance/lv_image_cache.h"
#include "src/misc/cache/instance/lv_image_header_cache.h"
#include "instant_button_style.h"
#include "button_grid_continuous_corners.h"

static constexpr int SIDE = 240;
static uint16_t frame[SIDE * SIDE];
static uint16_t buffer[SIDE * 30];

static void flush(lv_display_t *display, const lv_area_t *area, uint8_t *pixels) {
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
  lv_obj_delete(button);
  assert(espdesktop::corners::mask_cache() == nullptr);
  lv_display_delete(display);
  lv_deinit();
  std::puts("Real LVGL: immediate pressed/checked fills retain rounded corners across 200 delayed redraws.");
}
