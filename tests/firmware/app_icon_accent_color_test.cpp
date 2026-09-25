#include <array>
#include <cassert>
#include <cstdint>

#include "cover_art.h"

namespace {

constexpr int SIDE = 48;
constexpr size_t PIXEL_COUNT = SIDE * SIDE;

uint16_t rgb565(uint8_t red, uint8_t green, uint8_t blue) {
  return static_cast<uint16_t>(((red >> 3) << 11) |
                               ((green >> 2) << 5) | (blue >> 3));
}

void set_pixel(std::array<uint8_t, PIXEL_COUNT * 3> &image,
               int x, int y, uint8_t red, uint8_t green, uint8_t blue,
               uint8_t alpha) {
  const size_t index = static_cast<size_t>(y) * SIDE + x;
  const uint16_t color = rgb565(red, green, blue);
  image[index * 2] = static_cast<uint8_t>(color & 0xFF);
  image[index * 2 + 1] = static_cast<uint8_t>(color >> 8);
  image[PIXEL_COUNT * 2 + index] = alpha;
}

void test_transparent_matte_is_ignored() {
  std::array<uint8_t, PIXEL_COUNT * 3> image{};
  for (int y = 0; y < SIDE; ++y) {
    for (int x = 0; x < SIDE; ++x) {
      set_pixel(image, x, y, 41, 41, 41, 0);
    }
  }
  for (int y = 12; y < 36; ++y) {
    for (int x = 12; x < 36; ++x) {
      set_pixel(image, x, y, 255, 0, 0, 255);
    }
  }
  const auto accent = espdesktop::cover_art::extract_accent_color_rgb565a8(
      image.data(), SIDE, SIDE);
  assert(accent.valid);
  assert(accent.red > 240 && accent.green < 8 && accent.blue < 8);
}

void test_partial_alpha_weights_visible_samples() {
  std::array<uint8_t, PIXEL_COUNT * 3> image{};
  for (int y = 0; y < SIDE; ++y) {
    for (int x = 0; x < SIDE; ++x) {
      if (x < SIDE / 2)
        set_pixel(image, x, y, 255, 0, 0, 255);
      else
        set_pixel(image, x, y, 0, 0, 255, 64);
    }
  }
  const auto accent = espdesktop::cover_art::extract_accent_color_rgb565a8(
      image.data(), SIDE, SIDE);
  assert(accent.valid);
  assert(accent.red > accent.blue * 2);
}

void test_fully_transparent_image_has_no_accent() {
  std::array<uint8_t, PIXEL_COUNT * 3> image{};
  const auto accent = espdesktop::cover_art::extract_accent_color_rgb565a8(
      image.data(), SIDE, SIDE);
  assert(!accent.valid);
}

void test_active_accent_preserves_hue_and_white_text_contrast() {
  using namespace espdesktop::cover_art;
  const AccentColor yellow{255, 255, 0, true};
  const auto palette = make_app_icon_accent_palette(yellow);
  assert(palette.valid && !palette.neutral);
  assert((palette.active_rgb & 0xFF) == 0);
  assert(((palette.active_rgb >> 16) & 0xFF) > 0);
  assert(((palette.active_rgb >> 8) & 0xFF) > 0);
  assert(accent_white_text_contrast(palette.default_rgb) >= WHITE_TEXT_MIN_CONTRAST);
  assert(accent_white_text_contrast(palette.active_rgb) >= WHITE_TEXT_MIN_CONTRAST);
  assert(palette.active_rgb != palette.default_rgb);
}

void test_contrast_is_checked_after_display_correction() {
  using namespace espdesktop::cover_art;
  const AccentColor blue{0, 80, 255, true};
  const auto palette = make_app_icon_accent_palette(blue, 150, 100, 200);
  assert(palette.valid);
  assert(accent_white_text_contrast(palette.default_rgb) >= WHITE_TEXT_MIN_CONTRAST);
  assert(accent_white_text_contrast(palette.active_rgb) >= WHITE_TEXT_MIN_CONTRAST);
}

void test_neutral_and_near_black_icons_get_neutral_active_color() {
  using namespace espdesktop::cover_art;
  const auto black = make_app_icon_accent_palette(AccentColor{0, 0, 0, true});
  assert(black.valid && black.neutral);
  assert(black.default_rgb != black.active_rgb);
  assert(accent_white_text_contrast(black.default_rgb) >= WHITE_TEXT_MIN_CONTRAST);
  assert(accent_white_text_contrast(black.active_rgb) >= WHITE_TEXT_MIN_CONTRAST);
  const auto gray = make_app_icon_accent_palette(AccentColor{120, 120, 120, true});
  assert(gray.valid && gray.neutral);
  assert(((gray.active_rgb >> 16) & 0xFF) == ((gray.active_rgb >> 8) & 0xFF));
  assert(((gray.active_rgb >> 8) & 0xFF) == (gray.active_rgb & 0xFF));
}

}  // namespace

int main() {
  test_transparent_matte_is_ignored();
  test_partial_alpha_weights_visible_samples();
  test_fully_transparent_image_has_no_accent();
  test_active_accent_preserves_hue_and_white_text_contrast();
  test_contrast_is_checked_after_display_correction();
  test_neutral_and_near_black_icons_get_neutral_active_color();
}
