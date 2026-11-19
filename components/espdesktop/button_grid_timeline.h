#pragma once

#ifdef USE_COMPANION

inline bool companion_timeline_editor(const std::string &app) {
  return app == "com.apple.FinalCut" || app == "com.blackmagic-design.DaVinciResolve";
}

struct CompanionTimelinePad {
  std::string app;
  lv_obj_t *hint = nullptr;
  lv_obj_t *jog_button = nullptr;
  lv_obj_t *pan_button = nullptr;
  bool pan = false;
  bool dragging = false;
  int anchor = 0;
  int jog_step = 10;
  uint32_t last_sent = 0;

  void refresh_hint() const {
    const char *text = espdesktop_i18n("Drag to move the playhead");
    if (!companion_runtime_service().timeline_controls_supported())
      text = espdesktop_i18n("Connect the matching Mac app");
    else if (!companion_runtime_service().timeline_controls_ready(app))
      text = espdesktop_i18n("Bring the editor to the front");
    else if (pan)
      text = espdesktop_i18n("Point at the timeline on your Mac");
    if (std::strcmp(lv_label_get_text(hint), text) != 0) lv_label_set_text(hint, text);
  }

  bool send(int amount) const {
    if (!companion_runtime_service().timeline_controls_ready(app) || !companion_action_sender()) {
      refresh_hint();
      return false;
    }
    const std::string action = std::string("shortcut.timeline.") + (pan ? "pan." : "jog.") +
        std::to_string(amount);
    const std::string request = "timeline-" + std::to_string(companion_next_request_number());
    auto &runtime = companion_runtime_service();
    if (!runtime.begin_timeline_input(request, esphome::millis())) return true;
    if (!companion_action_sender()(action, request, "new_window", app)) {
      runtime.finish_timeline_input(request);
      return false;
    }
    refresh_hint();
    return true;
  }
};

inline void companion_timeline_touch(lv_event_t *event) {
  auto &pad = *static_cast<CompanionTimelinePad *>(lv_event_get_user_data(event));
  const auto code = lv_event_get_code(event);
  if (code == LV_EVENT_RELEASED || code == LV_EVENT_PRESS_LOST) {
    pad.dragging = false;
    return;
  }
  if (code != LV_EVENT_PRESSED && code != LV_EVENT_PRESSING) return;
  auto *input = lv_indev_active();
  if (!input) return;
  lv_point_t position;
  lv_indev_get_point(input, &position);
  const uint32_t now = esphome::millis();
  if (code == LV_EVENT_PRESSED) {
    pad.anchor = position.x;
    pad.last_sent = now - 45;
    pad.dragging = companion_runtime_service().timeline_controls_ready(pad.app);
    pad.refresh_hint();
    return;
  }
  if (!pad.dragging || now - pad.last_sent < 45) return;
  if (!companion_runtime_service().timeline_controls_ready(pad.app)) {
    pad.dragging = false;
    pad.refresh_hint();
    return;
  }

  const int distance = position.x - pad.anchor;
  if (pad.pan ? std::abs(distance) < 4 : std::abs(distance) < pad.jog_step) return;
  const int amount = pad.pan ? std::clamp(distance * 2, -80, 80)
                            : std::clamp(distance / pad.jog_step, -4, 4);
  pad.last_sent = now;
  if (!pad.send(amount)) pad.dragging = false;
  // Drop excess travel from a fast swipe and carry only sub-frame motion.
  pad.anchor = pad.pan ? position.x : position.x - distance % pad.jog_step;
}

inline lv_obj_t *companion_timeline_button(lv_obj_t *parent, const char *text,
                                           const lv_font_t *font, int compensation, int height) {
  auto *button = control_modal_create_list_row(parent, text, false, height, height / 4,
      theme_display_color(current_theme().surface_card), theme_display_color(current_theme().surface_primary),
      font, compensation);
  lv_obj_set_style_bg_color(button, lv_color_hex(theme_display_color(current_theme().surface_card)),
                           LV_STATE_CHECKED);
  lv_obj_set_style_pad_all(button, 0, LV_PART_MAIN);
  return button;
}

inline void companion_timeline_open(lv_obj_t *launcher, const std::string &app,
                                     const lv_font_t *font, const lv_font_t *icon_font,
                                     int compensation) {
  auto shell = control_modal_open_shell(ControlModalKind::COMPANION_TIMELINE, launcher,
      compensation, icon_font, [] {
        auto &overlay = control_modal_active().overlay;
        control_modal_delete_overlay(ControlModalKind::COMPANION_TIMELINE, overlay);
      });
  if (!shell.panel) return;

  auto *pad = new CompanionTimelinePad;
  pad->app = app;
  pad->jog_step = std::max(6, static_cast<int>(shell.layout.short_side) / 48);
  lv_obj_add_event_cb(shell.panel, [](lv_event_t *event) {
    delete static_cast<CompanionTimelinePad *>(lv_event_get_user_data(event));
  }, LV_EVENT_DELETE, pad);

  const int mode_height = std::clamp(static_cast<int>(shell.layout.panel_h) / 8, 30, 52);
  pad->jog_button = companion_timeline_button(shell.panel, espdesktop_i18n("Jog"), font, compensation, mode_height);
  pad->pan_button = companion_timeline_button(shell.panel, espdesktop_i18n("Pan"), font, compensation, mode_height);
  lv_obj_set_width(pad->jog_button, lv_pct(22));
  lv_obj_set_width(pad->pan_button, lv_pct(22));
  lv_obj_align(pad->jog_button, LV_ALIGN_TOP_MID, -shell.layout.panel_w / 8, shell.layout.back_inset_y);
  lv_obj_align(pad->pan_button, LV_ALIGN_TOP_MID, shell.layout.panel_w / 8, shell.layout.back_inset_y);
  lv_obj_add_state(pad->jog_button, LV_STATE_CHECKED);
  const auto switch_mode = [](lv_event_t *event) {
    auto &state = *static_cast<CompanionTimelinePad *>(lv_event_get_user_data(event));
    state.pan = lv_event_get_target(event) == state.pan_button;
    state.dragging = false;
    if (state.pan) {
      lv_obj_clear_state(state.jog_button, LV_STATE_CHECKED);
      lv_obj_add_state(state.pan_button, LV_STATE_CHECKED);
    } else {
      lv_obj_add_state(state.jog_button, LV_STATE_CHECKED);
      lv_obj_clear_state(state.pan_button, LV_STATE_CHECKED);
    }
    state.refresh_hint();
  };
  bind_immediate_button_action(pad->jog_button, switch_mode, pad);
  bind_immediate_button_action(pad->pan_button, switch_mode, pad);

  auto *strip = companion_timeline_button(shell.panel, "<   |   |   |   |   |   >", font, compensation, mode_height);
  lv_obj_set_size(strip, lv_pct(56), lv_pct(32));
  lv_obj_center(strip);
  lv_obj_clear_flag(strip, LV_OBJ_FLAG_GESTURE_BUBBLE);
  lv_obj_add_flag(strip, LV_OBJ_FLAG_PRESS_LOCK);
  for (const auto code : {LV_EVENT_PRESSED, LV_EVENT_PRESSING, LV_EVENT_RELEASED, LV_EVENT_PRESS_LOST}) {
    lv_obj_add_event_cb(strip, companion_timeline_touch, code, pad);
  }

  auto *left = companion_timeline_button(shell.panel, "<", font, compensation, mode_height);
  auto *right = companion_timeline_button(shell.panel, ">", font, compensation, mode_height);
  lv_obj_set_size(left, lv_pct(13), lv_pct(32));
  lv_obj_set_size(right, lv_pct(13), lv_pct(32));
  lv_obj_align(left, LV_ALIGN_LEFT_MID, shell.layout.panel_w / 20, 0);
  lv_obj_align(right, LV_ALIGN_RIGHT_MID, -shell.layout.panel_w / 20, 0);
  bind_immediate_button_action(left, [](lv_event_t *event) {
    const auto &state = *static_cast<CompanionTimelinePad *>(lv_event_get_user_data(event));
    state.send(state.pan ? -24 : -1);
  }, pad);
  bind_immediate_button_action(right, [](lv_event_t *event) {
    const auto &state = *static_cast<CompanionTimelinePad *>(lv_event_get_user_data(event));
    state.send(state.pan ? 24 : 1);
  }, pad);

  pad->hint = lv_label_create(shell.panel);
  lv_obj_set_width(pad->hint, lv_pct(92));
  lv_obj_set_style_text_color(pad->hint, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  lv_obj_set_style_text_align(pad->hint, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (font) lv_obj_set_style_text_font(pad->hint, font, LV_PART_MAIN);
  lv_obj_align(pad->hint, LV_ALIGN_BOTTOM_MID, 0, -shell.layout.panel_h / 9);
  pad->refresh_hint();
}

inline void companion_timeline_add_launcher(lv_obj_t *screen, const std::string &app,
                                             int bottom_padding, int gap, const lv_font_t *font,
                                             const lv_font_t *icon_font, int compensation) {
  auto *display = lv_obj_get_display(screen);
  const int short_side = std::min(lv_display_get_horizontal_resolution(display),
                                  lv_display_get_vertical_resolution(display));
  const int height = std::clamp(short_side / 10, 28, 48);
  lv_obj_set_style_pad_bottom(screen, bottom_padding + gap + height, LV_PART_MAIN);
  auto *launcher = companion_timeline_button(screen, espdesktop_i18n("Timeline"), font, compensation, height);
  lv_obj_add_flag(launcher, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_align(launcher, LV_ALIGN_BOTTOM_MID, 0, height + gap);

  struct Launcher {
    std::string app;
    const lv_font_t *font;
    const lv_font_t *icon_font;
    int compensation;
  };
  auto *context = new Launcher{app, font, icon_font, compensation};
  BtnSlot slot{};
  slot.btn = launcher;
  slot.text_lbl = lv_obj_get_child(launcher, 0);
  control_modal_register_card_label(slot);
  lv_obj_add_event_cb(launcher, [](lv_event_t *event) {
    delete static_cast<Launcher *>(lv_event_get_user_data(event));
  }, LV_EVENT_DELETE, context);
  bind_immediate_button_action(launcher, [](lv_event_t *event) {
    const auto &context = *static_cast<Launcher *>(lv_event_get_user_data(event));
    auto *button = static_cast<lv_obj_t *>(lv_event_get_target(event));
    companion_timeline_open(button, context.app, context.font, context.icon_font, context.compensation);
  }, context);
  lv_obj_add_event_cb(screen, [](lv_event_t *) {
    if (control_modal_active().kind == ControlModalKind::COMPANION_TIMELINE)
      control_modal_force_close_active();
  }, LV_EVENT_SCREEN_UNLOADED, nullptr);
}

#endif
