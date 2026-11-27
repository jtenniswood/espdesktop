#pragma once
#include "ha_controls.h"
#include "button_grid_slider_geometry.h"
#include "button_grid_slider_contrast.h"
#include "button_grid_touch.h"
#include "clock_bar.h"

// Local Mac output and microphone volume widgets.
struct SliderCtx {
  std::string entity_id;
  std::string computer_id;
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
  bool available = true;
  bool interactive = true;
  bool ha_control = false;
  bool numeric = false;
  bool numeric_dragging = false;
  bool press_active = false;
  bool dragging = false;
  lv_point_t press_point{0, 0};
  int press_value = 0;
  // Last non-zero level, restored when a tap turns the entity back on.
  int last_on_value = 0;
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

inline void setup_slider_visual(BtnSlot &slot, const ParsedCfg &config,
                                uint32_t on_color, bool interactive = true);

inline int slider_position_percent(const SliderCtx *, int position) {
  return std::max(0, std::min(100, position));
}

inline void slider_align_to_button_edge(lv_obj_t *widget, lv_obj_t *btn,
                                        lv_coord_t x, lv_coord_t y) {
  // LVGL positions children from the padded content origin. Offset the two
  // slider widgets to the outer edge so the shared labels keep their padding.
  const lv_align_t origin = lv_obj_get_style_base_dir(btn, LV_PART_MAIN) == LV_BASE_DIR_RTL
    ? LV_ALIGN_TOP_RIGHT : LV_ALIGN_TOP_LEFT;
  lv_obj_align(widget, origin,
               x - lv_obj_get_style_space_left(btn, LV_PART_MAIN),
               y - lv_obj_get_style_space_top(btn, LV_PART_MAIN));
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

  const lv_coord_t w = horizontal ? bw : std::max<lv_coord_t>(1, std::min<lv_coord_t>(bw, bh - 1));
  const lv_coord_t h = horizontal ? std::max<lv_coord_t>(1, std::min<lv_coord_t>(bh, bw - 1)) : bh;
  lv_obj_set_size(slider, w, h);
  slider_align_to_button_edge(slider, btn, bw / 2 - w / 2, bh / 2 - h / 2);
}

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
    slider_align_to_button_edge(fill, btn, inverted ? bw - w : 0, 0);
  } else {
    lv_coord_t h = (lv_coord_t)((int32_t)bh * pct / 100);
    lv_obj_set_size(fill, bw, h);
    slider_align_to_button_edge(fill, btn, 0, inverted ? 0 : bh - h);
  }
}

inline void slider_update_ctx_fill(SliderCtx *ctx, lv_obj_t *button, int percent) {
  if (!ctx) return;
  slider_update_fill(ctx->fill, button, percent, ctx->horizontal, false, ctx->radius);
}

inline void slider_refresh_geometry(lv_obj_t *slider) {
  if (!slider) return;
  SliderCtx *c = (SliderCtx *)lv_obj_get_user_data(slider);
  lv_obj_t *btn = lv_obj_get_parent(slider);
  if (!c || !btn) return;

  // A wide card gets a horizontal track; square and tall cards keep the
  // vertical dimmer. The card can change shape when the grid layout changes,
  // so re-evaluate orientation instead of fixing it at setup time.
  c->horizontal = lv_obj_get_width(btn) > lv_obj_get_height(btn);
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
  if (touch_dragging_slider() == slider) touch_dragging_slider() = nullptr;
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

inline bool slider_apply_pointer_value(lv_obj_t *slider) {
  if (!slider) return false;
  SliderCtx *ctx = (SliderCtx *)lv_obj_get_user_data(slider);
  if (!ctx || !ctx->interactive || !ctx->available ||
      (ctx->numeric && !ctx->numeric_metadata_ready)) return false;

  lv_indev_t *indev = lv_indev_active();
  if (!indev || lv_indev_get_type(indev) != LV_INDEV_TYPE_POINTER) return false;

  lv_point_t point;
  lv_indev_get_point(indev, &point);
  lv_area_t slider_area;
  lv_obj_get_coords(slider, &slider_area);

  const int positions = 100;
  int value = 0;
  const bool mapped = ctx->horizontal
    ? espdesktop::slider_geometry::horizontal_pointer_position(
        point.x, slider_area.x1, slider_area.x2, positions, value)
    : espdesktop::slider_geometry::vertical_pointer_position(
        point.y, slider_area.y1, slider_area.y2, positions, value);
  if (!mapped) return false;
  if (value > 0) ctx->last_on_value = value;
  if (lv_slider_get_value(slider) == value) return true;
  lv_slider_set_value(slider, value, LV_ANIM_OFF);
  lv_obj_send_event(slider, LV_EVENT_VALUE_CHANGED, nullptr);
  return true;
}

inline void slider_restore_pressed_value(lv_obj_t *slider) {
  if (!slider) return;
  SliderCtx *ctx = (SliderCtx *)lv_obj_get_user_data(slider);
  if (!ctx) return;
  lv_slider_set_value(slider, ctx->press_value, LV_ANIM_OFF);
  const int pct = slider_position_percent(ctx, lv_slider_get_value(slider));
  slider_update_ctx_fill(ctx, lv_obj_get_parent(slider), ctx->inverted ? 100 - pct : pct);
}

inline void slider_begin_pointer_press(lv_obj_t *slider) {
  if (!slider) return;
  SliderCtx *ctx = (SliderCtx *)lv_obj_get_user_data(slider);
  if (!ctx) return;
  ctx->press_active = true;
  ctx->dragging = false;
  ctx->press_value = lv_slider_get_value(slider);
  // A fresh touch owns the pointer again until it moves along the track.
  touch_dragging_slider() = nullptr;
  lv_indev_t *indev = lv_indev_active();
  if (indev && lv_indev_get_type(indev) == LV_INDEV_TYPE_POINTER) {
    lv_indev_get_point(indev, &ctx->press_point);
  } else {
    ctx->press_point = {0, 0};
  }
}

inline bool slider_pointer_moved(lv_obj_t *slider) {
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (!ctx || !ctx->press_active) return false;
  lv_indev_t *indev = lv_indev_active();
  if (!indev || lv_indev_get_type(indev) != LV_INDEV_TYPE_POINTER) return false;

  lv_point_t point;
  lv_indev_get_point(indev, &point);
  int dx = point.x - ctx->press_point.x;
  int dy = point.y - ctx->press_point.y;
  if (dx < 0) dx = -dx;
  if (dy < 0) dy = -dy;
  // A finger tap can wobble a few pixels. Only a clear drag along the dimmer's
  // own track changes the level; movement across the track stays available to
  // the page swipe. The page gesture needs 24 px, so this arms first and the
  // guard below keeps the page from following the same movement.
  if (ctx->horizontal) return dx >= 10 && dx >= dy;
  return dy >= 10 && dy >= dx;
}

inline void slider_update_pointer_press(lv_obj_t *slider) {
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (!ctx || !ctx->press_active) return;
  if (!ctx->dragging && slider_pointer_moved(slider)) {
    ctx->dragging = true;
    // Publish the drag so the page gesture guard stops paging for this touch.
    touch_dragging_slider() = slider;
  }
  if (ctx->dragging) {
    slider_apply_pointer_value(slider);
  } else {
    // LVGL's slider class moves the knob on press-and-drag by itself. Until the
    // pointer has clearly moved along the track, keep the pre-press level so a
    // tap or page swipe cannot jump the brightness.
    slider_restore_pressed_value(slider);
  }
}

inline void slider_release_drag_ownership(lv_obj_t *slider) {
  if (touch_dragging_slider() == slider) touch_dragging_slider() = nullptr;
}

inline bool slider_finish_pointer_press(lv_obj_t *slider) {
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (!ctx || !ctx->press_active) return false;
  const bool dragged = ctx->dragging;
  ctx->press_active = false;
  ctx->dragging = false;
  slider_release_drag_ownership(slider);
  if (dragged) {
    return slider_apply_pointer_value(slider);
  }
  slider_restore_pressed_value(slider);
  return false;
}

inline void slider_cancel_pointer_press(lv_obj_t *slider) {
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (!ctx || !ctx->press_active) return;
  ctx->press_active = false;
  ctx->dragging = false;
  slider_release_drag_ownership(slider);
  slider_restore_pressed_value(slider);
}

inline void slider_tap_toggle(lv_obj_t *slider) {
  SliderCtx *ctx = slider ? (SliderCtx *)lv_obj_get_user_data(slider) : nullptr;
  if (!ctx || !ctx->ha_control) return;
  // A tap on a dimmer means on/off for devices that have a meaningful power
  // state. Media volume sliders keep their level-only behaviour.
  const auto domain = espdesktop::ha_controls::domain_of(ctx->entity_id);
  if (domain != "light" && domain != "fan" && domain != "switch" &&
      domain != "input_boolean") return;
  const auto known = espdesktop::ha_controls::state(ctx->entity_id);
  const int current = lv_slider_get_value(slider);
  const bool was_on = known.empty()
      ? current > 0
      : espdesktop::ha_controls::state_is_on(ctx->entity_id, known);
  if (!espdesktop::ha_controls::toggle_entity(ctx->entity_id)) return;
  // Restore the level the card was showing, not a default, when turning back
  // on later. The Home Assistant state is the fallback for a card that has not
  // been dragged since the panel started.
  if (was_on && current > 0) ctx->last_on_value = current;
  // Update the card immediately. The state subscription for a page built after
  // Home Assistant connected may not arrive, so waiting for it can leave the
  // old level on screen after the light is switched off.
  const int next = was_on ? 0
      : (ctx->last_on_value > 0 ? ctx->last_on_value : 100);
  lv_slider_set_value(slider, next, LV_ANIM_OFF);
  const int pct = slider_position_percent(ctx, next);
  slider_update_ctx_fill(ctx, lv_obj_get_parent(slider), ctx->inverted ? 100 - pct : pct);
}

inline lv_obj_t *setup_slider_widget(lv_obj_t *btn, uint32_t on_color, bool horizontal) {
  if (!btn) return nullptr;
  lv_obj_clear_flag(btn, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *fill = lv_obj_create(btn);
  if (!fill) return nullptr;
  lv_obj_add_flag(fill, LV_OBJ_FLAG_FLOATING);
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
  lv_obj_add_flag(slider, LV_OBJ_FLAG_FLOATING);
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
  if ((icon.empty() || icon == "Auto") &&
      (entity_id == "media.output_volume" || type == "companion_app_volume"))
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

inline void setup_slider_visual(BtnSlot &s, const ParsedCfg &p, uint32_t on_color,
                                bool interactive) {
  ESP_LOGI("slider", "Setup Mac volume slider for %s (%s)",
    p.entity.c_str(), p.type.c_str());
  setup_toggle_visual(s, p);

  lv_obj_t *slider = setup_slider_widget(s.btn, on_color);
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
  // The local slider driver deletes this state with its LVGL slider.
  slider_bind_text_contrast(s.icon_lbl, fill);
  slider_bind_text_contrast(s.text_lbl, fill);
  slider_bind_text_contrast(s.sensor_container, fill);
  SliderCtx *ctx = new SliderCtx();
  ctx->entity_id = p.entity;
  ctx->computer_id = companion_card_computer(p);
  ctx->ha_control = espdesktop::ha_controls::slider_control_valid(p.entity) &&
      !companion_volume_control_valid(p.entity);
  ctx->fill = fill;
  ctx->radius = lv_obj_get_style_radius(s.btn, LV_PART_MAIN);
  ctx->interactive = interactive;
  ctx->icon_lbl = s.icon_lbl;
  ctx->sensor_container = s.sensor_container;
  ctx->sensor_lbl = s.sensor_lbl;
  ctx->unit_lbl = s.unit_lbl;
  lv_obj_set_user_data(slider, (void *)ctx);
  slider_bind_geometry_refresh(s.btn, slider);
  // Start interactive: an entity whose state has not reached the panel yet is
  // still a usable control, and a disabled slider never receives the press
  // that a tap or drag needs.
  if (!interactive) lv_obj_clear_flag(slider, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_add_event_cb(slider, [](lv_event_t *e) {
    lv_obj_t *sl = static_cast<lv_obj_t *>(lv_event_get_target(e));
    if (!sl) return;
    SliderCtx *c = (SliderCtx *)lv_obj_get_user_data(sl);
    if (!c) return;
    int val = lv_slider_get_value(sl);
    int pct = slider_position_percent(c, val);
    int fill_val = c->inverted ? 100 - pct : pct;
    slider_update_ctx_fill(c, lv_obj_get_parent(sl), fill_val);
  }, LV_EVENT_VALUE_CHANGED, nullptr);

  if (interactive) {
    lv_obj_add_event_cb(slider, [](lv_event_t *event) {
      slider_begin_pointer_press(static_cast<lv_obj_t *>(lv_event_get_target(event)));
    }, LV_EVENT_PRESSED, nullptr);
    lv_obj_add_event_cb(slider, [](lv_event_t *event) {
      slider_update_pointer_press(static_cast<lv_obj_t *>(lv_event_get_target(event)));
    }, LV_EVENT_PRESSING, nullptr);
    lv_obj_add_event_cb(slider, [](lv_event_t *event) {
      auto *widget = static_cast<lv_obj_t *>(lv_event_get_target(event));
      auto *state = widget
          ? static_cast<SliderCtx *>(lv_obj_get_user_data(widget)) : nullptr;
      if (!state || !state->available || lv_obj_has_state(widget, LV_STATE_DISABLED)) {
        slider_cancel_pointer_press(widget);
        return;
      }
      const bool was_dragging = state->dragging;
      const bool mapped = slider_finish_pointer_press(widget);
      if (!was_dragging) {
        // A tap is an on/off action. It must not send the level the slider
        // class may have picked from the touch point.
        slider_tap_toggle(widget);
        return;
      }
      if (!mapped) {
        slider_restore_pressed_value(widget);
        return;
      }
      if (!state->ha_control && !companion_volume_control_valid(state->entity_id)) return;
      if (state->ha_control) {
        espdesktop::ha_controls::set_slider_percent(state->entity_id, lv_slider_get_value(widget));
        return;
      }
      send_slider_action(state->entity_id, lv_slider_get_value(widget), state->computer_id);
    }, LV_EVENT_RELEASED, nullptr);
    lv_obj_add_event_cb(slider, [](lv_event_t *event) {
      slider_cancel_pointer_press(static_cast<lv_obj_t *>(lv_event_get_target(event)));
    }, LV_EVENT_PRESS_LOST, nullptr);
  }

  if (ctx->ha_control) {
    espdesktop::ha_controls::subscribe_slider_state(ctx->entity_id);
    const std::string entity = ctx->entity_id;
    lv_obj_t *slider_widget = slider;
    auto refresh = [slider_widget, entity]() {
      if (!lv_obj_is_valid(slider_widget)) return false;
      auto *state = static_cast<SliderCtx *>(lv_obj_get_user_data(slider_widget));
      if (state == nullptr || state->press_active) return true;
      const auto value = espdesktop::ha_controls::state(entity);
      if (value == "unavailable" || value == "unknown") {
        lv_obj_add_state(slider_widget, LV_STATE_DISABLED);
        return true;
      }
      // An empty value only means the state has not arrived yet. Keep the
      // control usable instead of disabling it until Home Assistant reports.
      lv_obj_clear_state(slider_widget, LV_STATE_DISABLED);
      if (value.empty()) return true;
      // A light can report "on" before its brightness attribute arrives. Do
      // not guess 100%; keep the level the card is already showing until the
      // real value is known.
      if (espdesktop::ha_controls::domain_of(entity) == "light" &&
          espdesktop::ha_controls::state_is_on(entity, value) &&
          espdesktop::ha_controls::state(entity, "brightness").empty())
        return true;
      const int pct = espdesktop::ha_controls::slider_percent(entity);
      if (pct < 0) return true;
      if (pct > 0 && espdesktop::ha_controls::state_is_on(entity, value))
        state->last_on_value = pct;
      lv_slider_set_value(slider_widget, pct, LV_ANIM_OFF);
      slider_update_ctx_fill(state, lv_obj_get_parent(slider_widget), pct);
      return true;
    };
    refresh();
    espdesktop::ha_controls::register_refresh(slider_widget, refresh);
  }
}
