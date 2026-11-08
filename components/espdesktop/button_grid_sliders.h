#pragma once

#include "button_grid_slider_geometry.h"
#include "button_grid_slider_contrast.h"
#include "clock_bar.h"
#include "media_volume_capability.h"
#include "number_slider_policy.h"

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

struct ImageCardCtx;
inline void image_card_set_media_artwork_suppressed(ImageCardCtx *ctx,
                                                     bool suppressed);
inline void image_card_refresh_media_artwork_on_metadata_change(ImageCardCtx *ctx);
inline void image_card_clear_media_artwork(ImageCardCtx *ctx);

struct CardPadding {
  lv_coord_t left = 0;
  lv_coord_t top = 0;
  lv_coord_t right = 0;
  lv_coord_t bottom = 0;
};

inline CardPadding capture_card_padding(lv_obj_t *btn) {
  CardPadding padding;
  if (!btn) return padding;
  padding.left = lv_obj_get_style_pad_left(btn, LV_PART_MAIN);
  padding.top = lv_obj_get_style_pad_top(btn, LV_PART_MAIN);
  padding.right = lv_obj_get_style_pad_right(btn, LV_PART_MAIN);
  padding.bottom = lv_obj_get_style_pad_bottom(btn, LV_PART_MAIN);
  // Preserve an intentional local inset, such as a subpage's calculated
  // padding. A reused slider button leaves a local zero override behind;
  // only in that all-zero case remove the stale override and read the theme.
  if (padding.left == 0 && padding.top == 0 &&
      padding.right == 0 && padding.bottom == 0) {
    lv_obj_remove_local_style_prop(btn, LV_STYLE_PAD_LEFT, LV_PART_MAIN);
    lv_obj_remove_local_style_prop(btn, LV_STYLE_PAD_TOP, LV_PART_MAIN);
    lv_obj_remove_local_style_prop(btn, LV_STYLE_PAD_RIGHT, LV_PART_MAIN);
    lv_obj_remove_local_style_prop(btn, LV_STYLE_PAD_BOTTOM, LV_PART_MAIN);
    padding.left = lv_obj_get_style_pad_left(btn, LV_PART_MAIN);
    padding.top = lv_obj_get_style_pad_top(btn, LV_PART_MAIN);
    padding.right = lv_obj_get_style_pad_right(btn, LV_PART_MAIN);
    padding.bottom = lv_obj_get_style_pad_bottom(btn, LV_PART_MAIN);
  }
  return padding;
}

// ── Slider widgets ───────────────────────────────────────────────────

// Context attached to each LVGL slider via user_data
struct SliderCtx {
  std::string entity_id;
  lv_obj_t *fill = nullptr;
  bool horizontal = false;
  bool cover_tilt = false;
  bool inverted = false;
  lv_coord_t radius = 0;
  bool logged_state = false;
  bool logged_level = false;
  bool media_position = false;
  float media_duration = 0.0f;
  float media_position_seconds = 0.0f;
  uint32_t media_position_updated_ms = 0;
  bool media_position_updated_at_known = false;
  uint32_t media_position_updated_at_ms = 0;
  bool media_seek_pending = false;
  float media_seek_target_seconds = 0.0f;
  uint32_t media_seek_pending_ms = 0;
  bool media_playing = false;
  lv_obj_t *media_slider = nullptr;
  lv_timer_t *media_timer = nullptr;
  uint8_t media_position_refresh_remaining = 0;
  lv_obj_t *media_track_bg = nullptr;
  lv_obj_t *geometry_parent = nullptr;
  lv_timer_t *geometry_timer = nullptr;
  lv_obj_t *media_value_lbl = nullptr;
  lv_obj_t *media_status_lbl = nullptr;
  // Button padding captured before the slider widget zeroes it, so the icon and
  // label can be inset to match every non-slider card (see setup_slider_visual).
  lv_coord_t label_pad_left = 0;
  lv_coord_t label_pad_top = 0;
  lv_coord_t label_pad_bottom = 0;
  lv_coord_t content_pad_left = 0;
  lv_coord_t content_pad_top = 0;
  lv_coord_t content_pad_right = 0;
  lv_coord_t content_pad_bottom = 0;
  bool available = true;
  bool interactive = true;
  bool numeric = false;
  bool numeric_dragging = false;
  bool numeric_metadata_ready = false;
  bool numeric_min_known = false;
  bool numeric_max_known = false;
  bool numeric_step_known = false;
  bool numeric_state_known = false;
  double numeric_min = 0.0;
  double numeric_max = 0.0;
  double numeric_step = 0.0;
  double numeric_state = 0.0;
  std::string numeric_unit;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *sensor_container = nullptr;
  lv_obj_t *sensor_lbl = nullptr;
  lv_obj_t *unit_lbl = nullptr;
  // light_temperature fields
  bool light_temp = false;
  int kelvin_min = 2000;
  int kelvin_max = 6500;
  bool kelvin_color = false;
  bool light_on = false;
  bool light_state_known = false;
  bool light_temp_has_kelvin = false;
  int light_temp_last_kelvin = 2000;
  bool light_temp_dragging = false;
  lv_obj_t *text_lbl = nullptr;
  std::string cached_label;
};

inline espdesktop::number_slider::Metadata slider_numeric_metadata(const SliderCtx *ctx) {
  if (!ctx) return {};
  return {ctx->numeric_min, ctx->numeric_max, ctx->numeric_step};
}

inline int slider_position_percent(const SliderCtx *ctx, int position) {
  if (!ctx || !ctx->numeric) return std::max(0, std::min(100, position));
  const int positions = espdesktop::number_slider::slider_position_count(
    slider_numeric_metadata(ctx));
  if (positions <= 0) return 0;
  position = std::max(0, std::min(positions, position));
  return static_cast<int>(
    std::llround(static_cast<double>(position) * 100.0 / positions));
}

struct MediaNowPlayingCtx {
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *idle_lbl = nullptr;
  lv_obj_t *title_lbl = nullptr;
  lv_obj_t *artist_lbl = nullptr;
  lv_obj_t *progress_slider = nullptr;
  ImageCardCtx *cover_art = nullptr;
  lv_obj_t *cover_overlay = nullptr;
  lv_obj_t *btn = nullptr;
  std::string primary_entity;
  std::string secondary_entity;
  std::string active_entity;
  std::string artwork_refresh_signature;
  std::function<void()> refresh_entity_route;
  char artist[HA_STATE_TEXT_MAX_LEN + 1] = {};
  bool source_known = false;
  bool external_source = false;
  bool external_source_fallback = false;
  bool cover_art_mode = false;
  bool custom_fallback_background = false;
  uint32_t fallback_background_color = DARK_THEME.surface_card;
  bool show_track_details = true;
  bool play_pause_background = false;
  bool artist_below_title = false;
  lv_coord_t artist_gap = 0;
  CardPadding content_padding;
};

struct MediaPlaylistCtx {
  lv_obj_t *btn = nullptr;
  std::string entity_id;
  std::string content_id;
  std::string content_type;
  std::string current_content_id;
  std::string current_content_type;
  bool available = true;
  bool playing = false;
  bool has_current_content_id = false;
  bool has_current_content_type = false;
};

constexpr uint32_t MEDIA_SEEK_PENDING_TIMEOUT_MS = 3000;
constexpr float MEDIA_SEEK_MATCH_TOLERANCE_SECONDS = 2.0f;
constexpr lv_coord_t MEDIA_VOLUME_REFERENCE_SIDE_PX = DISPLAY_MODAL_REFERENCE_SIDE_PX;
constexpr lv_coord_t MEDIA_VOLUME_ARC_STROKE_REF_PX = DISPLAY_MODAL_ARC_STROKE_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_BACK_BUTTON_REF_PX = DISPLAY_MODAL_BACK_BUTTON_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_BUTTON_REF_PX = DISPLAY_MODAL_BUTTON_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_INSET_REF_PX = DISPLAY_MODAL_INSET_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_CONTROLS_GAP_REF_PX = DISPLAY_MODAL_CONTROLS_GAP_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_CONTROLS_DOWN_REF_PX = DISPLAY_MODAL_CONTROLS_DOWN_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_TITLE_GAP_REF_PX = DISPLAY_MODAL_TITLE_GAP_REF_PX;
constexpr lv_coord_t MEDIA_VOLUME_UNIT_Y_REF_PX = -22;
constexpr lv_coord_t MEDIA_VOLUME_COMPACT_PORTRAIT_BUTTON_REF_PX = 96;

struct MediaVolumeCtx {
  std::string entity_id;
  std::string label;
  std::string clock_bar_title;
  int current_pct = 0;
  int max_pct = 100;
  int pending_pct = -1;
  uint32_t pending_until_ms = 0;
  uint32_t accent_color = DEFAULT_ACCENT_COLOR;
  uint32_t secondary_color = theme_display_color(current_theme().surface_primary);
  uint32_t tertiary_color = theme_display_color(current_theme().surface_secondary);
  lv_obj_t *btn = nullptr;
  lv_obj_t *label_lbl = nullptr;
  lv_obj_t *pct_lbl = nullptr;
  lv_obj_t *unit_lbl = nullptr;
  int width_compensation_percent = 100;
  const lv_font_t *value_font = nullptr;
  const lv_font_t *number_font = nullptr;
  const lv_font_t *unit_font = nullptr;
  const lv_font_t *label_font = nullptr;
  const lv_font_t *icon_font = nullptr;
  std::function<void(int)> apply_percent;
  espdesktop::media::VolumeControlMode volume_control_mode =
    espdesktop::media::VolumeControlMode::ABSOLUTE;
  bool volume_known = false;
  bool available = true;
};

struct MediaVolumeModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *arc = nullptr;
  lv_obj_t *title_lbl = nullptr;
  lv_obj_t *pct_row = nullptr;
  lv_obj_t *pct_lbl = nullptr;
  lv_obj_t *pct_unit_lbl = nullptr;
  lv_obj_t *minus_btn = nullptr;
  lv_obj_t *plus_btn = nullptr;
  MediaVolumeCtx *active = nullptr;
  bool updating_arc = false;
};

inline int slider_clamp_pct(int pct);
inline bool slider_parse_light_brightness_pct(esphome::StringRef val, int &pct);
inline void slider_set_value_safe(lv_obj_t *slider, int pct);
inline void setup_slider_visual(BtnSlot &s, const ParsedCfg &p, uint32_t on_color,
                                bool interactive = true);

struct LightControlCtx {
  std::string entity_id;
  std::string label;
  std::string friendly_name;
  std::string options;
  int current_pct = 0;
  uint32_t accent_color = DEFAULT_ACCENT_COLOR;
  lv_obj_t *btn = nullptr;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *label_lbl = nullptr;
  const char *icon_off_glyph = nullptr;
  const char *icon_on_glyph = nullptr;
  const lv_font_t *label_font = nullptr;
  const lv_font_t *number_font = nullptr;
  const lv_font_t *icon_font = nullptr;
  int width_compensation_percent = 100;
  int current_kelvin = 3500;
  int kelvin_min = 2000;
  int kelvin_max = 6500;
  bool available = true;
  bool on = false;
  bool color_modes_known = false;
  bool rgb_color_supported = true;
  bool updating_slider = false;
  bool updating_temp_slider = false;
  bool dragging_slider = false;
  bool dragging_temp_slider = false;
};

enum class LightControlTab : uint8_t {
  POWER = 0,
  BRIGHTNESS = 1,
  TEMPERATURE = 2,
  COLOR = 3,
};

struct LightControlVisibleTabs {
  LightControlTab tabs[4] = {
    LightControlTab::POWER,
    LightControlTab::BRIGHTNESS,
    LightControlTab::TEMPERATURE,
    LightControlTab::COLOR,
  };
  uint8_t count = 0;

  bool contains(LightControlTab tab) const {
    for (uint8_t i = 0; i < count; i++) {
      if (tabs[i] == tab) return true;
    }
    return false;
  }

  void add(LightControlTab tab) {
    if (count >= 4 || contains(tab)) return;
    tabs[count++] = tab;
  }
};

struct LightColorPresetClick {
  uint32_t color = 0;
  int kelvin_pct = -1;
};

struct LightColorPreset {
  uint32_t color;
  int kelvin_pct = -1;
};

struct LightControlModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *tab_row = nullptr;
  lv_obj_t *power_tab = nullptr;
  lv_obj_t *brightness_tab = nullptr;
  lv_obj_t *temperature_tab = nullptr;
  lv_obj_t *color_tab = nullptr;
  lv_obj_t *power_group = nullptr;
  lv_obj_t *power_on_btn = nullptr;
  lv_obj_t *power_off_btn = nullptr;
  ControlModalBinaryToggle power_toggle;
  lv_obj_t *slider = nullptr;
  lv_obj_t *slider_fill = nullptr;
  lv_obj_t *slider_handle = nullptr;
  lv_obj_t *temp_slider = nullptr;
  lv_obj_t *temp_slider_fill = nullptr;
  lv_obj_t *temp_slider_handle = nullptr;
  lv_obj_t *color_grid = nullptr;
  LightControlCtx *active = nullptr;
  LightControlTab tab = LightControlTab::POWER;
};

inline void light_control_center_icon_label(lv_obj_t *label) {
  control_modal_center_tab_icon(label);
}

inline ControlModalLayout media_volume_step_button_layout(const ControlModalLayout &layout) {
  ControlModalLayout controls_layout = layout;
  if (control_modal_uses_compact_portrait_tuning(layout)) {
    controls_layout.btn_size = control_modal_scaled_px(
      MEDIA_VOLUME_COMPACT_PORTRAIT_BUTTON_REF_PX, layout.short_side);
    controls_layout.controls_center_y = layout.arc_size / 2 -
      controls_layout.btn_size / 2 - layout.inset +
      control_modal_controls_down_px(layout);
  }
  return controls_layout;
}

inline void slider_fit_to_button(lv_obj_t *slider, lv_obj_t *btn, bool horizontal) {
  if (!slider || !btn) return;
  lv_coord_t bw = lv_obj_get_width(btn);
  lv_coord_t bh = lv_obj_get_height(btn);
  if (bw <= 0 || bh <= 0) return;

  // Keep LVGL's native range equal to the full object. Vertical endpoint
  // reachability is handled by pointer mapping, not by shrinking the range.
  lv_obj_set_style_pad_top(slider, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(slider, 0, LV_PART_MAIN);

  if (horizontal) {
    lv_coord_t h = bh >= bw ? bw - 1 : bh;
    if (h < 1) h = 1;
    lv_obj_set_size(slider, bw, h);
  } else {
    lv_coord_t w = bw >= bh ? bh - 1 : bw;
    if (w < 1) w = 1;
    lv_obj_set_size(slider, w, bh);
  }
  lv_obj_align(slider, LV_ALIGN_CENTER, 0, 0);
}

// Resize the colored fill overlay to reflect the current slider percentage
inline void slider_update_fill(lv_obj_t *fill, lv_obj_t *btn, int pct, bool horizontal,
                               bool inverted, lv_coord_t r,
                               bool keep_min_horizontal_handle = false) {
  if (!fill || !btn) return;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  lv_coord_t bw = lv_obj_get_width(btn);
  lv_coord_t bh = lv_obj_get_height(btn);
  if (bw <= 0 || bh <= 0) return;
  lv_obj_set_style_radius(fill, r, LV_PART_MAIN);
  if (horizontal) {
    lv_coord_t w = (lv_coord_t)((int32_t)bw * pct / 100);
    if (keep_min_horizontal_handle && r > 0) {
      lv_coord_t min_w = r * 2;
      if (min_w > bw) min_w = bw;
      if (w < min_w) w = min_w;
    }
    lv_obj_set_size(fill, w, bh);
    lv_obj_align(fill, inverted ? LV_ALIGN_RIGHT_MID : LV_ALIGN_LEFT_MID, 0, 0);
  } else {
    lv_coord_t h = (lv_coord_t)((int32_t)bh * pct / 100);
    lv_obj_set_size(fill, bw, h);
    lv_obj_align(fill, inverted ? LV_ALIGN_TOP_MID : LV_ALIGN_BOTTOM_MID, 0, 0);
  }
}

inline void slider_horizontal_track_geometry(lv_obj_t *btn, lv_coord_t &x,
                                             lv_coord_t &y, lv_coord_t &w,
                                             lv_coord_t &h) {
  x = y = 0;
  w = h = 0;
  if (!btn) return;
  lv_coord_t bw = lv_obj_get_width(btn);
  lv_coord_t bh = lv_obj_get_height(btn);
  if (bw <= 0 || bh <= 0) return;

  w = (lv_coord_t)((int32_t)bw * 84 / 100);
  h = (lv_coord_t)(((int32_t)bh * 15 + 100) / 200);
  if (w < 1) w = 1;
  if (h < 4) h = 4;
  if (h > 12) h = 12;
  x = (bw - w) / 2;
  lv_coord_t bottom_pad = (lv_coord_t)((int32_t)bh * 10 / 100);
  if (bottom_pad < 8) bottom_pad = 8;
  y = -bottom_pad;
}

inline void slider_update_horizontal_track_bg(lv_obj_t *track, lv_obj_t *btn) {
  if (!track || !btn) return;
  lv_coord_t x, y, w, h;
  slider_horizontal_track_geometry(btn, x, y, w, h);
  if (w <= 0 || h <= 0) return;
  lv_obj_set_style_radius(track, h / 2, LV_PART_MAIN);
  lv_obj_set_size(track, w, h);
  lv_obj_align(track, LV_ALIGN_BOTTOM_LEFT, x, y);
}

inline void slider_update_horizontal_track_fill(lv_obj_t *fill, lv_obj_t *btn, int pct) {
  if (!fill || !btn) return;
  lv_coord_t x, y, track_w, track_h;
  slider_horizontal_track_geometry(btn, x, y, track_w, track_h);
  if (track_w <= 0 || track_h <= 0) return;
  lv_coord_t fill_w = (lv_coord_t)((int32_t)track_w * pct / 100);
  if (fill_w < 0) fill_w = 0;

  lv_obj_set_style_radius(fill, track_h / 2, LV_PART_MAIN);
  lv_obj_set_size(fill, fill_w, track_h);
  lv_obj_align(fill, LV_ALIGN_BOTTOM_LEFT, x, y);
}

inline void slider_update_ctx_fill(SliderCtx *c, lv_obj_t *btn, int pct) {
  if (!c || !c->fill || !btn) return;
  if (c->media_position && c->media_track_bg) {
    slider_update_horizontal_track_bg(c->media_track_bg, btn);
    slider_update_horizontal_track_fill(c->fill, btn, pct);
  } else {
    slider_update_fill(c->fill, btn, pct, c->horizontal, c->inverted, c->radius,
                       c->media_position);
  }
}

inline void slider_prime_media_position_fill(SliderCtx *c, lv_obj_t *btn) {
  if (!c || !c->media_position || !c->fill || !btn || c->media_track_bg) return;
  lv_coord_t min_w = c->radius > 0 ? c->radius * 2 : 1;
  lv_coord_t btn_w = lv_obj_get_width(btn);
  if (btn_w > 0 && min_w > btn_w) min_w = btn_w;
  lv_obj_set_style_radius(c->fill, c->radius, LV_PART_MAIN);
  lv_obj_set_width(c->fill, min_w);
  lv_obj_set_height(c->fill, lv_pct(100));
  lv_obj_align(c->fill, c->inverted ? LV_ALIGN_RIGHT_MID : LV_ALIGN_LEFT_MID, 0, 0);
}

inline void slider_refresh_geometry(lv_obj_t *slider) {
  if (!slider) return;
  SliderCtx *c = (SliderCtx *)lv_obj_get_user_data(slider);
  lv_obj_t *btn = lv_obj_get_parent(slider);
  if (!c || !btn) return;

  slider_fit_to_button(slider, btn, c->horizontal);
  int val = lv_slider_get_value(slider);
  int pct = slider_position_percent(c, val);
  int fill_val = c->inverted ? 100 - pct : pct;
  slider_update_ctx_fill(c, btn, fill_val);
}

inline void slider_deferred_geometry_refresh_cb(lv_timer_t *timer) {
  if (!timer) return;
  lv_obj_t *slider = (lv_obj_t *)lv_timer_get_user_data(timer);
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (ctx && ctx->geometry_timer == timer) ctx->geometry_timer = nullptr;
  slider_refresh_geometry(slider);
  lv_timer_del(timer);
}

inline void slider_geometry_refresh_event_cb(lv_event_t *e) {
  if (!e) return;
  lv_obj_t *slider = (lv_obj_t *)lv_event_get_user_data(e);
  slider_refresh_geometry(slider);
}

inline void slider_detach_runtime(SliderCtx *ctx,
                                  lv_obj_t *deleting_slider = nullptr) {
  espdesktop::media_slider_lifecycle::detach<
    SliderCtx, lv_timer_t, lv_obj_t>(
      ctx, deleting_slider,
      [](lv_timer_t *timer) { lv_timer_del(timer); },
      [](lv_obj_t *obj) { return lv_obj_get_user_data(obj); },
      [](lv_obj_t *obj, void *user_data) {
        lv_obj_set_user_data(obj, user_data);
      },
      [](lv_obj_t *parent, lv_obj_t *slider) {
        lv_obj_remove_event_cb_with_user_data(
          parent, slider_geometry_refresh_event_cb, slider);
      });
}

inline void slider_geometry_delete_event_cb(lv_event_t *e) {
  if (!e) return;
  lv_obj_t *slider = static_cast<lv_obj_t *>(lv_event_get_target(e));
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (!ctx) return;
  slider_detach_runtime(ctx, slider);
}

inline void slider_bind_geometry_refresh(lv_obj_t *btn, lv_obj_t *slider) {
  if (!btn || !slider) return;
  SliderCtx *ctx = (SliderCtx *)lv_obj_get_user_data(slider);
  if (!ctx) return;
  ctx->geometry_parent = btn;
  lv_obj_add_event_cb(
      btn, slider_geometry_refresh_event_cb, LV_EVENT_SIZE_CHANGED, slider);
  lv_obj_add_event_cb(
      slider, slider_geometry_delete_event_cb, LV_EVENT_DELETE, nullptr);
  ctx->geometry_timer =
      lv_timer_create(slider_deferred_geometry_refresh_cb, 1, slider);
}

inline bool slider_apply_vertical_pointer_value(lv_obj_t *slider) {
  if (!slider) return false;
  SliderCtx *ctx = (SliderCtx *)lv_obj_get_user_data(slider);
  if (!ctx || ctx->horizontal || !ctx->interactive || !ctx->available ||
      (ctx->numeric && !ctx->numeric_metadata_ready)) return false;

  lv_indev_t *indev = lv_indev_active();
  if (!indev || lv_indev_get_type(indev) != LV_INDEV_TYPE_POINTER) return false;

  lv_point_t point;
  lv_indev_get_point(indev, &point);
  lv_area_t slider_area;
  lv_obj_get_coords(slider, &slider_area);

  const int positions = ctx->numeric
    ? espdesktop::number_slider::slider_position_count(slider_numeric_metadata(ctx))
    : 100;
  int value = 0;
  if (!espdesktop::slider_geometry::vertical_pointer_position(
        point.y, slider_area.y1, slider_area.y2, positions, value)) {
    return false;
  }
  if (lv_slider_get_value(slider) == value) return true;
  lv_slider_set_value(slider, value, LV_ANIM_OFF);
  lv_obj_send_event(slider, LV_EVENT_VALUE_CHANGED, nullptr);
  return true;
}

// Create an invisible LVGL slider with a colored fill overlay inside a button
inline lv_obj_t *setup_slider_widget(lv_obj_t *btn, uint32_t on_color, bool horizontal) {
  if (!btn) return nullptr;
  lv_obj_set_style_pad_all(btn, 0,
    static_cast<lv_style_selector_t>(LV_PART_MAIN));
  lv_obj_clear_flag(btn, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *fill = lv_obj_create(btn);
  if (!fill) return nullptr;
  lv_obj_set_size(fill, 0, 0);
  theme_set_content_background(fill);
  lv_obj_set_style_bg_color(fill, lv_color_hex(on_color), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(fill, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(fill, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(fill, 0, LV_PART_MAIN);
  lv_obj_clear_flag(fill, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(fill, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *slider = lv_slider_create(btn);
  if (!slider) {
    lv_obj_del(fill);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
    return nullptr;
  }
  lv_slider_set_range(slider, 0, 100);
  lv_slider_set_value(slider, 0, LV_ANIM_OFF);

  lv_obj_set_style_bg_opa(slider, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(slider, LV_OPA_TRANSP,
    static_cast<lv_style_selector_t>(LV_PART_INDICATOR));
  lv_obj_set_style_bg_opa(slider, LV_OPA_TRANSP,
    static_cast<lv_style_selector_t>(LV_PART_KNOB));
  lv_obj_set_style_border_width(slider, 0,
    static_cast<lv_style_selector_t>(LV_PART_KNOB));
  lv_obj_set_style_shadow_width(slider, 0,
    static_cast<lv_style_selector_t>(LV_PART_KNOB));
  lv_obj_set_style_pad_all(slider, 0,
    static_cast<lv_style_selector_t>(LV_PART_KNOB));
  lv_obj_set_style_width(slider, 0,
    static_cast<lv_style_selector_t>(LV_PART_KNOB));
  lv_obj_set_style_height(slider, 0,
    static_cast<lv_style_selector_t>(LV_PART_KNOB));

  lv_obj_move_to_index(fill, 0);
  lv_obj_move_to_index(slider, 1);

  return slider;
}

inline bool slider_has_alt_icon(const std::string &type, const std::string &icon_on) {
  return brightness_slider_type(type) || type == "cover" || (!icon_on.empty() && icon_on != "Auto");
}

inline const char *slider_icon_off(const std::string &type, const std::string &entity_id,
                                   const std::string &icon) {
  if ((icon.empty() || icon == "Auto") && entity_id == "media.output_volume")
    return find_icon("Volume High");
  if ((icon.empty() || icon == "Auto") && entity_id == "media.input_volume")
    return find_icon("Microphone");
  if (type == "cover" && (icon.empty() || icon == "Auto"))
    return find_icon("Blinds");
  if (icon.empty() || icon == "Auto")
    return domain_default_icon(entity_id.substr(0, entity_id.find('.')));
  return find_icon(icon.c_str());
}

inline const char *slider_icon_on(const std::string &type, const std::string &entity_id,
                                  const std::string &icon, const std::string &icon_on) {
  if (type == "cover" && (icon_on.empty() || icon_on == "Auto"))
    return find_icon("Blinds Open");
  if (brightness_slider_type(type) && (icon_on.empty() || icon_on == "Auto"))
    return slider_icon_off(type, entity_id, icon);
  return find_icon(icon_on.c_str());
}

inline int slider_clamp_pct(int pct);
inline bool slider_parse_pct(esphome::StringRef val, int &pct);
inline bool slider_attribute_missing_ref(esphome::StringRef val);

enum class CoverControlTab : uint8_t {
  CONTROLS = 0,
  POSITION = 1,
  TILT = 2,
  PRESETS = 3,
};

struct CoverControlVisibleTabs {
  CoverControlTab tabs[4] = {
    CoverControlTab::POSITION,
    CoverControlTab::CONTROLS,
    CoverControlTab::TILT,
    CoverControlTab::PRESETS,
  };
  uint8_t count = 0;

  bool contains(CoverControlTab tab) const {
    for (uint8_t i = 0; i < count; i++) {
      if (tabs[i] == tab) return true;
    }
    return false;
  }

  void add(CoverControlTab tab) {
    if (count >= 4 || contains(tab)) return;
    tabs[count++] = tab;
  }
};

struct CoverControlCtx {
  std::string entity_id;
  std::string label;
  std::string friendly_name;
  std::string options;
  int current_position = 0;
  int current_tilt = 0;
  bool current_position_known = false;
  bool moving = false;
  uint32_t accent_color = DEFAULT_ACCENT_COLOR;
  uint32_t secondary_color = theme_display_color(current_theme().surface_primary);
  lv_obj_t *btn = nullptr;
  lv_obj_t *card_slider = nullptr;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *label_lbl = nullptr;
  const char *icon_closed_glyph = nullptr;
  const char *icon_open_glyph = nullptr;
  const lv_font_t *option_title_font = nullptr;
  const lv_font_t *option_value_font = nullptr;
  const lv_font_t *option_menu_font = nullptr;
  const lv_font_t *card_icon_font = nullptr;
  const lv_font_t *icon_font = nullptr;
  int width_compensation_percent = 100;
  bool available = true;
  bool dragging_position = false;
  bool dragging_tilt = false;
  bool updating_position = false;
  bool updating_tilt = false;
  bool supported_features_known = false;
  int supported_features = 0;
  bool supports_position = true;
  bool supports_open = true;
  bool supports_close = true;
  bool supports_stop = true;
  bool supports_open_tilt = false;
  bool supports_close_tilt = false;
  bool supports_stop_tilt = false;
  bool supports_tilt = false;
};

struct CoverControlModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *tab_row = nullptr;
  lv_obj_t *controls_tab = nullptr;
  lv_obj_t *position_tab = nullptr;
  lv_obj_t *tilt_tab = nullptr;
  lv_obj_t *presets_tab = nullptr;
  lv_obj_t *controls_box = nullptr;
  lv_obj_t *up_btn = nullptr;
  lv_obj_t *stop_btn = nullptr;
  lv_obj_t *down_btn = nullptr;
  lv_obj_t *presets_box = nullptr;
  lv_obj_t *preset_btns[5] = {nullptr, nullptr, nullptr, nullptr, nullptr};
  int selected_preset = -1;
  int pending_preset = -1;
  lv_obj_t *position_slider = nullptr;
  lv_obj_t *position_fill = nullptr;
  lv_obj_t *position_handle = nullptr;
  lv_obj_t *tilt_slider = nullptr;
  lv_obj_t *tilt_handle = nullptr;
  CoverControlCtx *active = nullptr;
  CoverControlTab tab = CoverControlTab::POSITION;
};

// Recolour the preset tiles so the highlighted one tracks the cover. While the
// cover is moving or a tapped preset is awaiting its first position update,
// the selection is held; once it comes to rest the
// selection reconciles with the exact position, clearing when it sits between
// presets. ui.selected_preset carries the choice across updates.

inline void slider_numeric_restore_visual(SliderCtx *ctx) {
  if (!ctx || !ctx->numeric) return;
  if (ctx->sensor_container) lv_obj_add_flag(ctx->sensor_container, LV_OBJ_FLAG_HIDDEN);
  if (ctx->sensor_lbl) lv_label_set_display_text(ctx->sensor_lbl, "");
  if (ctx->unit_lbl) lv_label_set_display_text(ctx->unit_lbl, "");
  if (ctx->icon_lbl) lv_obj_clear_flag(ctx->icon_lbl, LV_OBJ_FLAG_HIDDEN);
}

inline void slider_numeric_show_value(lv_obj_t *slider, SliderCtx *ctx) {
  if (!slider || !ctx || !ctx->numeric || !ctx->numeric_metadata_ready) return;
  const auto metadata = slider_numeric_metadata(ctx);
  const double value = espdesktop::number_slider::value_for_position(
    metadata, lv_slider_get_value(slider));
  const std::string formatted = espdesktop::number_slider::format_value(
    value, metadata);
  if (ctx->icon_lbl) lv_obj_add_flag(ctx->icon_lbl, LV_OBJ_FLAG_HIDDEN);
  if (ctx->sensor_lbl) lv_label_set_display_text(ctx->sensor_lbl, formatted.c_str());
  if (ctx->unit_lbl) lv_label_set_display_text(ctx->unit_lbl, ctx->numeric_unit.c_str());
  if (ctx->sensor_container) lv_obj_clear_flag(ctx->sensor_container, LV_OBJ_FLAG_HIDDEN);
}

inline void slider_numeric_apply_state(lv_obj_t *slider, SliderCtx *ctx) {
  if (!slider || !ctx || !ctx->numeric || !ctx->numeric_metadata_ready ||
      !ctx->numeric_state_known || ctx->numeric_dragging) return;
  const auto metadata = slider_numeric_metadata(ctx);
  const int position = espdesktop::number_slider::position_for_value(
    metadata, ctx->numeric_state);
  lv_slider_set_value(slider, position, LV_ANIM_OFF);
  slider_update_ctx_fill(
    ctx, lv_obj_get_parent(slider), slider_position_percent(ctx, position));
}

inline void slider_numeric_update_interaction(lv_obj_t *slider, SliderCtx *ctx) {
  if (!slider || !ctx || !ctx->numeric) return;
  if (ctx->interactive && ctx->available && ctx->numeric_metadata_ready)
    lv_obj_add_flag(slider, LV_OBJ_FLAG_CLICKABLE);
  else
    lv_obj_clear_flag(slider, LV_OBJ_FLAG_CLICKABLE);
}

inline void slider_numeric_cancel_drag(lv_obj_t *slider, SliderCtx *ctx) {
  if (!ctx || !ctx->numeric) return;
  ctx->numeric_dragging = false;
  slider_numeric_restore_visual(ctx);
  slider_numeric_apply_state(slider, ctx);
}

inline void slider_numeric_refresh_metadata(lv_obj_t *slider, SliderCtx *ctx) {
  if (!slider || !ctx || !ctx->numeric) return;
  const auto metadata = slider_numeric_metadata(ctx);
  const bool complete = ctx->numeric_min_known && ctx->numeric_max_known &&
                        ctx->numeric_step_known;
  const bool ready = complete && espdesktop::number_slider::metadata_valid(metadata);
  const bool was_dragging = ctx->numeric_dragging;
  ctx->numeric_metadata_ready = ready;
  if (ready) {
    lv_slider_set_range(
      slider, 0, espdesktop::number_slider::slider_position_count(metadata));
  } else if (complete) {
    ESP_LOGW("slider", "Invalid numeric range metadata for %s (min=%g max=%g step=%g)",
             ctx->entity_id.c_str(), ctx->numeric_min, ctx->numeric_max,
             ctx->numeric_step);
  }
  if (was_dragging) {
    ctx->numeric_dragging = false;
    slider_numeric_restore_visual(ctx);
  }
  if (ready) slider_numeric_apply_state(slider, ctx);
  slider_numeric_update_interaction(slider, ctx);
}

// Full slider button setup: visual + event handlers + HA action on release
inline void setup_slider_visual(BtnSlot &s, const ParsedCfg &p, uint32_t on_color,
                                bool interactive) {
  ESP_LOGI("slider", "Setup brightness slider for %s (%s)",
    p.entity.c_str(), p.type.c_str());
  setup_toggle_visual(s, p);
  if (p.type == "cover")
    lv_label_set_display_text(s.icon_lbl, slider_icon_off(p.type, p.entity, p.icon));

  const CardPadding padding = capture_card_padding(s.btn);

  bool horizontal = false;
  lv_obj_t *slider = setup_slider_widget(s.btn, on_color, horizontal);
  if (!slider) {
    ESP_LOGW("slider", "Slider setup failed for %s; falling back to toggle card",
      p.entity.c_str());
    setup_toggle_visual(s, p);
    if (s.btn) lv_obj_add_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
    if (s.icon_lbl) lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    if (s.sensor_container) lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    return;
  }
  ESP_LOGI("slider", "Slider object created for %s", p.entity.c_str());
  lv_obj_align(s.icon_lbl, LV_ALIGN_TOP_LEFT, padding.left, padding.top);
  lv_obj_align(s.text_lbl, LV_ALIGN_BOTTOM_LEFT, padding.left, -padding.bottom);
  lv_obj_set_user_data(s.sensor_container, (void *)slider);

  lv_obj_t *fill = lv_obj_get_child(s.btn, 0);
  if (!fill) {
    ESP_LOGW("slider", "Slider fill missing for %s; falling back to toggle card",
      p.entity.c_str());
    setup_toggle_visual(s, p);
    if (s.btn) lv_obj_add_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
    if (s.icon_lbl) lv_obj_clear_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
    if (s.sensor_container) lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
    return;
  }
  // Intentionally leaked -- lives for the lifetime of the display
  slider_bind_text_contrast(s.icon_lbl, fill);
  slider_bind_text_contrast(s.text_lbl, fill);
  slider_bind_text_contrast(s.sensor_container, fill);
  SliderCtx *ctx = new SliderCtx();
  ctx->entity_id = p.entity;
  ctx->fill = fill;
  ctx->horizontal = horizontal;
  ctx->cover_tilt = p.type == "cover" && cover_tilt_mode(p.sensor);
  ctx->inverted = is_cover_entity(p.entity);
  ctx->radius = lv_obj_get_style_radius(s.btn, LV_PART_MAIN);
  ctx->label_pad_left = padding.left;
  ctx->label_pad_top = padding.top;
  ctx->label_pad_bottom = padding.bottom;
  ctx->interactive = interactive;
  ctx->numeric = espdesktop::number_slider::is_numeric_entity(p.entity);
  ctx->available = !ctx->numeric;
  ctx->icon_lbl = s.icon_lbl;
  ctx->sensor_container = s.sensor_container;
  ctx->sensor_lbl = s.sensor_lbl;
  ctx->unit_lbl = s.unit_lbl;
  lv_obj_set_user_data(slider, (void *)ctx);
  slider_bind_geometry_refresh(s.btn, slider);
  if (!interactive || ctx->numeric) lv_obj_clear_flag(slider, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_add_event_cb(slider, [](lv_event_t *e) {
    lv_obj_t *sl = static_cast<lv_obj_t *>(lv_event_get_target(e));
    if (!sl) return;
    SliderCtx *c = (SliderCtx *)lv_obj_get_user_data(sl);
    if (!c) return;
    int val = lv_slider_get_value(sl);
    int pct = slider_position_percent(c, val);
    int fill_val = c->inverted ? 100 - pct : pct;
    slider_update_ctx_fill(c, lv_obj_get_parent(sl), fill_val);
    if (c->numeric && c->numeric_dragging) slider_numeric_show_value(sl, c);
  }, LV_EVENT_VALUE_CHANGED, nullptr);

  if (interactive) {
    lv_obj_add_event_cb(slider, [](lv_event_t *e) {
      lv_obj_t *sl = static_cast<lv_obj_t *>(lv_event_get_target(e));
      SliderCtx *c = sl ? (SliderCtx *)lv_obj_get_user_data(sl) : nullptr;
      if (c && c->numeric) {
        if (!c->available || !c->numeric_metadata_ready) return;
        c->numeric_dragging = true;
      }
      slider_apply_vertical_pointer_value(sl);
      if (c && c->numeric) slider_numeric_show_value(sl, c);
    }, LV_EVENT_PRESSED, nullptr);

    lv_obj_add_event_cb(slider, [](lv_event_t *e) {
      lv_obj_t *sl = static_cast<lv_obj_t *>(lv_event_get_target(e));
      slider_apply_vertical_pointer_value(sl);
      SliderCtx *c = sl ? (SliderCtx *)lv_obj_get_user_data(sl) : nullptr;
      if (c && c->numeric && c->numeric_dragging) slider_numeric_show_value(sl, c);
    }, LV_EVENT_PRESSING, nullptr);

    lv_obj_add_event_cb(slider, [](lv_event_t *e) {
      lv_obj_t *sl = static_cast<lv_obj_t *>(lv_event_get_target(e));
      if (!sl) return;
      SliderCtx *c = (SliderCtx *)lv_obj_get_user_data(sl);
      if (c && !c->entity_id.empty()) {
        if (!c->available) {
          slider_numeric_cancel_drag(sl, c);
          return;
        }
        slider_apply_vertical_pointer_value(sl);
        int val = lv_slider_get_value(sl);
        if (c->numeric) {
          if (!c->numeric_metadata_ready) {
            slider_numeric_cancel_drag(sl, c);
            return;
          }
          const auto metadata = slider_numeric_metadata(c);
          const double value = espdesktop::number_slider::value_for_position(metadata, val);
          c->numeric_dragging = false;
          slider_numeric_restore_visual(c);
          send_numeric_slider_action(c->entity_id, value, metadata);
        } else {
          send_slider_action(c->entity_id, val, c->cover_tilt);
        }
      }
    }, LV_EVENT_RELEASED, nullptr);

    lv_obj_add_event_cb(slider, [](lv_event_t *e) {
      lv_obj_t *sl = static_cast<lv_obj_t *>(lv_event_get_target(e));
      SliderCtx *c = sl ? (SliderCtx *)lv_obj_get_user_data(sl) : nullptr;
      slider_numeric_cancel_drag(sl, c);
    }, LV_EVENT_PRESS_LOST, nullptr);
  }
}

inline int slider_clamp_pct(int pct) {
  return clamp_percent_value(pct);
}

inline bool slider_parse_pct(esphome::StringRef val, int &pct) {
  if (ha_state_unavailable_ref(val)) return false;
  float pct_f = 0.0f;
  if (!parse_float_ref(val, pct_f) || !std::isfinite(pct_f)) return false;
  pct = slider_clamp_pct((int)(pct_f + 0.5f));
  return true;
}

inline bool slider_parse_light_brightness_pct(esphome::StringRef val, int &pct) {
  if (ha_state_unavailable_ref(val)) return false;
  float bri = 0.0f;
  if (!parse_float_ref(val, bri) || !std::isfinite(bri)) return false;
  return light_brightness_to_percent(bri, pct);
}

inline bool slider_attribute_missing_ref(esphome::StringRef val) {
  std::string value = normalized_state_text(val);
  return value.empty() || value == "none" || value == "null" ||
         value == "unknown" || value == "unavailable";
}

inline void slider_numeric_apply_metadata_value(lv_obj_t *slider, SliderCtx *ctx,
                                                int field,
                                                esphome::StringRef value) {
  if (!slider || !ctx || !ctx->numeric) return;
  double parsed = 0.0;
  const bool valid = !slider_attribute_missing_ref(value) &&
                     parse_double_ref(value, parsed) && std::isfinite(parsed);
  bool *known = field == 0 ? &ctx->numeric_min_known
                           : (field == 1 ? &ctx->numeric_max_known
                                         : &ctx->numeric_step_known);
  double *target = field == 0 ? &ctx->numeric_min
                              : (field == 1 ? &ctx->numeric_max
                                            : &ctx->numeric_step);
  *known = valid;
  if (valid) *target = parsed;
  slider_numeric_refresh_metadata(slider, ctx);
}

inline bool slider_entity_is_light(const std::string &entity_id) {
  return entity_id.size() > 6 && entity_id.compare(0, 6, "light.") == 0;
}

inline void slider_set_value_safe(lv_obj_t *slider, int pct) {
  if (slider) lv_slider_set_value(slider, slider_clamp_pct(pct), LV_ANIM_OFF);
}

inline void slider_set_icon_safe(lv_obj_t *icon_lbl, const char *icon) {
  if (icon_lbl && icon) lv_label_set_display_text(icon_lbl, icon);
}

// Subscribe to HA state for a slider entity.

// ── Light temperature card helpers ───────────────────────────────────

// Bulbs store color temperature as integer mireds, so a 5500K command echoes
// back from HA as ~5494K. Rounding the drag preview to 50K keeps the displayed
// value steady while the user fine-tunes the slider.
inline int light_temp_rounded_kelvin(SliderCtx *ctx, int kelvin) {
  if (!ctx) return kelvin;
  int rounded = ((kelvin + 25) / 50) * 50;
  if (rounded < ctx->kelvin_min) rounded = ctx->kelvin_min;
  if (rounded > ctx->kelvin_max) rounded = ctx->kelvin_max;
  return rounded;
}

inline void light_temp_show_drag_kelvin(SliderCtx *ctx, int kelvin) {
  if (!ctx || !ctx->text_lbl) return;
  char buf[16];
  snprintf(buf, sizeof(buf), "%dK", light_temp_rounded_kelvin(ctx, kelvin));
  lv_label_set_display_text(ctx->text_lbl, buf);
}

inline void light_temp_restore_label(SliderCtx *ctx) {
  if (!ctx || !ctx->text_lbl) return;
  lv_label_set_display_text(ctx->text_lbl, ctx->cached_label.c_str());
}

// Subscribe to friendly_name and keep the SliderCtx cached_label in sync;
// the bottom label always stays as a configured label or friendly name.

inline void light_temp_apply_kelvin_state(SliderCtx *ctx, lv_obj_t *btn_ptr,
                                          lv_obj_t *slider, int kelvin,
                                          bool kelvin_color) {
  if (!ctx || !slider || !btn_ptr) return;
  int k = kelvin;
  if (k < ctx->kelvin_min) k = ctx->kelvin_min;
  if (k > ctx->kelvin_max) k = ctx->kelvin_max;
  int range = ctx->kelvin_max - ctx->kelvin_min;
  int pct = range > 0 ? (k - ctx->kelvin_min) * 100 / range : 50;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  lv_slider_set_value(slider, pct, LV_ANIM_OFF);
  if (ctx->fill)
    slider_update_fill(ctx->fill, btn_ptr, pct, false, false, ctx->radius);
  if (kelvin_color && ctx->fill)
    lv_obj_set_style_bg_color(ctx->fill,
      kelvin_to_fill_color(k, ctx->kelvin_min, ctx->kelvin_max), LV_PART_MAIN);
}

// Subscribe to on/off state plus color_temp_kelvin for a light temperature slider.
// When the light is off, the slider renders empty (value 0, no fill).

// Build the visual for a light temperature slider card.

// ── Media player card helpers ─────────────────────────────────────────

inline bool media_now_playing_progress_enabled(const ParsedCfg &p) {
  return media_card_mode(p.sensor) == "now_playing" && p.precision == "progress";
}

inline void media_format_time(float seconds, char *buf, size_t size) {
  if (!buf || size == 0) return;
  if (seconds < 0.0f || !std::isfinite(seconds)) seconds = 0.0f;
  int total = (int)(seconds + 0.5f);
  int h = total / 3600;
  int m = (total / 60) % 60;
  int s = total % 60;
  if (h > 0) snprintf(buf, size, "%d:%02d:%02d", h, m, s);
  else snprintf(buf, size, "%d:%02d", m, s);
}

inline int media_clamp_percent(int value) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

inline void media_volume_set_button_enabled(lv_obj_t *btn, bool enabled) {
  if (!btn) return;
  if (enabled) {
    lv_obj_clear_state(btn, LV_STATE_DISABLED);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
  } else {
    lv_obj_add_state(btn, LV_STATE_DISABLED);
    lv_obj_clear_flag(btn, LV_OBJ_FLAG_CLICKABLE);
  }
}
