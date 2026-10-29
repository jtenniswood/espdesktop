#include <cassert>
#include <cstdint>

#include "cover_art.h"

namespace {

void test_custom_colours_preserve_the_selected_background() {
  using namespace espdesktop::cover_art;
  for (const uint32_t colour : {0xFFFFFFu, 0xF9A825u, 0x1565C0u, 0x000000u}) {
    const auto palette = make_app_icon_custom_palette(colour);
    assert(palette.valid);
    assert(palette.default_rgb == colour);
    assert(palette.active_rgb == active_card_color(colour));
    assert(palette.active_rgb != palette.default_rgb);
  }
  const auto corrected = make_app_icon_custom_palette(0xF9A825, 90, 80, 110);
  assert(corrected.default_rgb == correct_display_color(0xF9A825, 90, 80, 110));
  assert(corrected.active_rgb == correct_display_color(active_card_color(0xF9A825), 90, 80, 110));
  assert(display_text_color_for_bg(make_app_icon_custom_palette(0xFFFFFF).default_rgb) == 0x212121);
  assert(display_text_color_for_bg(make_app_icon_custom_palette(0x1565C0).default_rgb) == 0xFFFFFF);
}

}  // namespace

int main() {
  test_custom_colours_preserve_the_selected_background();
}
