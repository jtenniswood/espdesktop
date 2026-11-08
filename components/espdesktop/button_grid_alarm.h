#pragma once

#include "pin_keypad.h"

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// ── Alarm card controls ───────────────────────────────────────────────

constexpr uint32_t ALARM_TRIGGERED_COLOR = 0xC62828;
constexpr uint32_t ALARM_CARD_CTX_MAGIC = 0x414C4D43;    // ALMC
constexpr uint32_t ALARM_ACTION_CTX_MAGIC = 0x414C4D41;  // ALMA
constexpr int ALARM_MAX_ACTIONS = 5;
constexpr int ALARM_MAX_VISIBLE_ACTIONS = 3;

struct AlarmCardCtx {
  uint32_t magic = ALARM_CARD_CTX_MAGIC;
  std::string entity_id;
  std::string label;
  std::string options;
  std::string state;
  std::string arm_mode;
  std::string pending_action_mode;
  lv_timer_t *arm_delay_timer = nullptr;
  lv_obj_t *btn = nullptr;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *grid_page = nullptr;
  lv_obj_t *page = nullptr;
  TransientStatusLabel *status_label = nullptr;
  lv_timer_t *pending_action_timer = nullptr;
  std::function<void(espdesktop::DisplayTakeoverKind)> begin_display_takeover;
  std::function<void(espdesktop::DisplayTakeoverKind)> end_display_takeover;
  uint32_t arm_delay_started_ms = 0;
  int arm_delay_seconds = -1;
  int arm_delay_total_seconds = -1;
  const lv_font_t *label_font = nullptr;
  const lv_font_t *pin_label_font = nullptr;
  const lv_font_t *key_label_font = nullptr;
  const lv_font_t *icon_font = nullptr;
  const lv_font_t *arming_title_font = nullptr;
  uint32_t on_color = DEFAULT_ACCENT_COLOR;
  uint32_t off_color = theme_display_color(current_theme().surface_primary);
  uint32_t tertiary_color = theme_display_color(current_theme().surface_secondary);
  int theme_red_percent = 100;
  int theme_green_percent = 100;
  int theme_blue_percent = 100;
  bool off_theme_owned = false;
  int width_compensation_percent = 100;
  int grid_cols = 3;
  bool available = false;
  bool show_status_icon = false;
  bool show_status_label = false;
  bool pending_action_had_code = false;
  bool critical_takeover_active = false;
  bool arming_modal_auto_opened = false;
};

struct AlarmActionCtx {
  uint32_t magic = ALARM_ACTION_CTX_MAGIC;
  AlarmCardCtx *card = nullptr;
  std::string mode;
  bool requires_pin = true;
};

struct AlarmPinModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *pin_lbl = nullptr;
  AlarmActionCtx *active = nullptr;
  AlarmActionCtx active_action;
  std::string pin;
};

struct AlarmControlModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *rail = nullptr;
  lv_obj_t *mode_btn[ALARM_MAX_ACTIONS] = {};
  lv_obj_t *mode_icon[ALARM_MAX_ACTIONS] = {};
  lv_obj_t *mode_label[ALARM_MAX_ACTIONS] = {};
  lv_obj_t *arming_view = nullptr;
  lv_obj_t *arming_title = nullptr;
  lv_obj_t *arming_countdown = nullptr;
  lv_obj_t *arming_progress = nullptr;
  lv_obj_t *arming_progress_fill = nullptr;
  lv_obj_t *arming_disarm_btn = nullptr;
  lv_obj_t *arming_disarm_label = nullptr;
  AlarmActionCtx actions[ALARM_MAX_ACTIONS];
  AlarmActionCtx arming_disarm_action;
  AlarmCardCtx *active = nullptr;
  int action_count = 0;
};

struct AlarmToastUi {
  lv_obj_t *box = nullptr;
  lv_timer_t *timer = nullptr;
};

struct AlarmDeferredAction {
  AlarmActionCtx action;
  std::string code;
  lv_timer_t *timer = nullptr;
  bool submit_pin = false;
};

inline AlarmControlModalUi &alarm_control_modal_ui() {
  static AlarmControlModalUi ui;
  return ui;
}

inline AlarmPinModalUi &alarm_pin_modal_ui() {
  static AlarmPinModalUi ui;
  return ui;
}

inline AlarmToastUi &alarm_toast_ui() {
  static AlarmToastUi ui;
  return ui;
}

inline AlarmDeferredAction &alarm_deferred_action() {
  static AlarmDeferredAction action;
  return action;
}

inline int alarm_remaining_delay_seconds(AlarmCardCtx *ctx);
inline bool alarm_card_context_valid(AlarmCardCtx *ctx);

inline bool alarm_card_context_valid(AlarmCardCtx *ctx) {
  return ctx != nullptr && ctx->magic == ALARM_CARD_CTX_MAGIC;
}

inline bool alarm_action_context_valid(AlarmActionCtx *action) {
  return action != nullptr && action->magic == ALARM_ACTION_CTX_MAGIC &&
         alarm_card_context_valid(action->card);
}

inline const char *alarm_action_service(const std::string &mode) {
  return card_runtime_alarm_action_service(mode);
}

inline bool alarm_state_is_delay(const std::string &state) {
  return state == "arming" || state == "pending";
}

inline std::string alarm_action_achieved_state(const std::string &mode) {
  if (mode == "away") return "armed_away";
  if (mode == "home") return "armed_home";
  if (mode == "night") return "armed_night";
  if (mode == "vacation") return "armed_vacation";
  if (mode == "disarm") return "disarmed";
  return "";
}

inline std::string alarm_normalized_arm_mode(const std::string &arm_mode) {
  if (arm_mode == "away") return "armed_away";
  if (arm_mode == "home") return "armed_home";
  if (arm_mode == "night") return "armed_night";
  if (arm_mode == "vacation") return "armed_vacation";
  if (arm_mode == "armed_away" || arm_mode == "armed_home" ||
      arm_mode == "armed_night" || arm_mode == "armed_vacation" ||
      arm_mode == "armed_custom_bypass") {
    return arm_mode;
  }
  return "";
}

inline std::string alarm_effective_state(const std::string &state,
                                         const std::string &arm_mode) {
  if (state != "arming") return state;
  std::string normalized = alarm_normalized_arm_mode(arm_mode);
  return normalized.empty() ? state : normalized;
}

inline bool alarm_action_state_matches(const std::string &mode, const std::string &state,
                                       const std::string &arm_mode = "") {
  std::string achieved_state = alarm_action_achieved_state(mode);
  return !achieved_state.empty() && alarm_effective_state(state, arm_mode) == achieved_state;
}

inline bool alarm_action_state_progressed(const std::string &mode, const std::string &state,
                                          const std::string &arm_mode = "") {
  if (alarm_action_state_matches(mode, state, arm_mode)) return true;
  return mode != "disarm" && (state == "arming" || state == "pending");
}

inline void alarm_control_hide_modal();

inline AlarmCardCtx *&alarm_arming_takeover_ctx() {
  static AlarmCardCtx *ctx = nullptr;
  return ctx;
}

inline int alarm_remaining_delay_seconds(AlarmCardCtx *ctx) {
  if (!ctx || ctx->arm_delay_seconds < 0) return -1;
  if (ctx->arm_delay_seconds == 0) return 0;
  uint32_t elapsed_ms = lv_tick_get() - ctx->arm_delay_started_ms;
  int elapsed_seconds = static_cast<int>(elapsed_ms / 1000);
  int remaining = ctx->arm_delay_seconds - elapsed_seconds;
  return remaining > 0 ? remaining : 0;
}

inline bool alarm_delay_takeover_active(AlarmCardCtx *ctx) {
  return ctx && alarm_card_context_valid(ctx) && alarm_state_is_delay(ctx->state) &&
         alarm_remaining_delay_seconds(ctx) > 0;
}

inline bool alarm_display_takeover_active(AlarmCardCtx *ctx) {
  return alarm_delay_takeover_active(ctx) ||
         (ctx && alarm_card_context_valid(ctx) && ctx->state == "triggered");
}

inline bool alarm_display_takeover_active() {
  return alarm_display_takeover_active(alarm_arming_takeover_ctx());
}

inline void alarm_release_arming_takeover(AlarmCardCtx *ctx) {
  if (!ctx) return;
  if (alarm_arming_takeover_ctx() == ctx) alarm_arming_takeover_ctx() = nullptr;
  if (ctx->critical_takeover_active) {
    ctx->critical_takeover_active = false;
    if (ctx->end_display_takeover) {
      ctx->end_display_takeover(espdesktop::DisplayTakeoverKind::CRITICAL);
    }
  }
  AlarmControlModalUi &ui = alarm_control_modal_ui();
  if (ctx->arming_modal_auto_opened && ui.active == ctx) {
    alarm_control_hide_modal();
  }
  ctx->arming_modal_auto_opened = false;
}

inline void alarm_clear_pending_action(AlarmCardCtx *ctx) {
  if (!ctx) return;
  if (ctx->pending_action_timer) {
    lv_timer_del(ctx->pending_action_timer);
    ctx->pending_action_timer = nullptr;
  }
  ctx->pending_action_mode.clear();
  ctx->pending_action_had_code = false;
}

inline void alarm_toast_timer_cb(lv_timer_t *timer) {
  AlarmToastUi &ui = alarm_toast_ui();
  if (ui.box) lv_obj_del(ui.box);
  ui.box = nullptr;
  ui.timer = nullptr;
  lv_timer_del(timer);
}

inline void alarm_hide_toast() {
  AlarmToastUi &ui = alarm_toast_ui();
  if (ui.box) lv_obj_del(ui.box);
  if (ui.timer) lv_timer_del(ui.timer);
  ui = AlarmToastUi();
}

inline lv_coord_t alarm_failure_banner_width(AlarmCardCtx *ctx) {
  lv_coord_t screen_w = control_modal_screen_width();
  int cols = ctx && ctx->grid_cols > 0 ? ctx->grid_cols : 3;
  if (cols < 1) cols = 1;

  lv_obj_t *grid = ctx && ctx->grid_page ? ctx->grid_page : lv_scr_act();
  lv_coord_t pad_left = 0;
  lv_coord_t pad_right = 0;
  lv_coord_t gap_col = 0;
  if (grid) {
    lv_obj_update_layout(grid);
    pad_left = lv_obj_get_style_pad_left(grid, LV_PART_MAIN);
    pad_right = lv_obj_get_style_pad_right(grid, LV_PART_MAIN);
    gap_col = lv_obj_get_style_pad_column(grid, LV_PART_MAIN);
  }

  int span_cols = cols < 3 ? cols : 3;
  lv_coord_t usable_w = screen_w - pad_left - pad_right - gap_col * (cols - 1);
  lv_coord_t cell_w = usable_w > 0 ? usable_w / cols : screen_w / cols;
  lv_coord_t width = cell_w * span_cols + gap_col * (span_cols - 1);
  lv_coord_t max_w = screen_w - 36;
  if (width > max_w) width = max_w;
  if (width < 120) width = max_w;
  return width;
}

inline void alarm_show_failure(AlarmCardCtx *ctx, const std::string &message) {
  alarm_hide_toast();
  AlarmToastUi &ui = alarm_toast_ui();
  lv_coord_t width = alarm_failure_banner_width(ctx);
  ControlModalToastShell shell = control_modal_open_toast(width, 10, ALARM_TRIGGERED_COLOR);
  ui.box = shell.box;

  lv_obj_t *label = lv_label_create(ui.box);
  lv_label_set_display_text(label, message.empty() ? espdesktop_i18n("Alarm action failed") : espdesktop_i18n(message).c_str());
  if (ctx && ctx->label_font) lv_obj_set_style_text_font(label, ctx->label_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(label, width - 24);
  lv_obj_center(label);

  lv_obj_update_layout(ui.box);
  lv_obj_align(ui.box, LV_ALIGN_BOTTOM_MID, 0, -18);
  ui.timer = lv_timer_create(alarm_toast_timer_cb, 3000, nullptr);
  lv_obj_move_foreground(ui.box);
}

inline void alarm_pending_action_timer_cb(lv_timer_t *timer) {
  AlarmCardCtx *ctx = static_cast<AlarmCardCtx *>(lv_timer_get_user_data(timer));
  if (ctx && ctx->pending_action_timer == timer) {
    bool had_code = ctx->pending_action_had_code;
    std::string mode = ctx->pending_action_mode;
    ctx->pending_action_timer = nullptr;
    ctx->pending_action_mode.clear();
    ctx->pending_action_had_code = false;
    if (!alarm_action_state_progressed(mode, ctx->state, ctx->arm_mode)) {
      alarm_show_failure(ctx, had_code ? "PIN was not accepted" : "Alarm did not change");
    }
  }
  lv_timer_del(timer);
}

inline void alarm_start_pending_action(AlarmCardCtx *ctx,
                                       const std::string &mode,
                                       bool had_code) {
  if (!ctx) return;
  alarm_clear_pending_action(ctx);
  ctx->pending_action_mode = mode;
  ctx->pending_action_had_code = had_code;
  ctx->pending_action_timer = lv_timer_create(alarm_pending_action_timer_cb, 3500, ctx);
}

inline void send_alarm_action(AlarmActionCtx *action, const std::string &code) {
  if (!alarm_action_context_valid(action) || action->card->entity_id.empty() ||
      !ha_api_available()) return;
  const char *service = alarm_action_service(action->mode);
  if (service == nullptr) return;

  esphome::api::HomeassistantActionRequest req;
  if (!ha_action_begin(req, service, false, code.empty() ? 1 : 2)) return;
  ha_action_add_entity(req, action->card->entity_id);
  if (!code.empty()) {
    ha_action_add_data(req, "code", code.c_str());
  }

  AlarmCardCtx *card = action->card;
  if (ha_action_send(req)) {
    alarm_start_pending_action(card, action->mode, !code.empty());
  }
}

inline void alarm_control_hide_modal() {
  AlarmControlModalUi &ui = alarm_control_modal_ui();
  AlarmCardCtx *active = ui.active;
  bool release_takeover = active && active->arming_modal_auto_opened &&
                          alarm_arming_takeover_ctx() == active;
  control_modal_delete_overlay(ControlModalKind::ALARM_CONTROL, ui.overlay);
  ui = AlarmControlModalUi();
  if (release_takeover) alarm_release_arming_takeover(active);
}

inline void alarm_pin_hide_modal() {
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  ui.pin.clear();
  control_modal_delete_overlay(ControlModalKind::ALARM_PIN, ui.overlay);
  ui = AlarmPinModalUi();
}

inline void alarm_action_activate(AlarmActionCtx *action);
inline void alarm_run_deferred_action_cb(lv_timer_t *timer) {
  AlarmDeferredAction &deferred = alarm_deferred_action();
  if (deferred.timer == timer) deferred.timer = nullptr;
  AlarmActionCtx action = deferred.action;
  std::string code = deferred.code;
  bool submit_pin = deferred.submit_pin;
  deferred.action = AlarmActionCtx();
  deferred.code.clear();
  deferred.submit_pin = false;
  lv_timer_del(timer);

  if (!alarm_action_context_valid(&action)) return;
  if (submit_pin) {
    alarm_pin_hide_modal();
    send_alarm_action(&action, code);
    return;
  }
  alarm_action_activate(&action);
}

inline void alarm_defer_action(AlarmActionCtx *action,
                               const std::string &code = "",
                               bool submit_pin = false) {
  if (!alarm_action_context_valid(action)) return;
  AlarmDeferredAction &deferred = alarm_deferred_action();
  if (deferred.timer) {
    lv_timer_del(deferred.timer);
    deferred.timer = nullptr;
  }
  deferred.action = *action;
  deferred.code = code;
  deferred.submit_pin = submit_pin;
  deferred.timer = lv_timer_create(alarm_run_deferred_action_cb, 1, nullptr);
}

inline void alarm_pin_update_display() {
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  if (!ui.pin_lbl) return;
  if (ui.pin.empty()) {
    lv_label_set_display_text(ui.pin_lbl, espdesktop_i18n("Enter Pin"));
    return;
  }
  std::string masked(ui.pin.size(), '*');
  lv_label_set_display_text(ui.pin_lbl, masked.c_str());
}

inline void alarm_pin_submit() {
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  if (!ui.active || ui.pin.empty()) return;
  AlarmActionCtx *action = ui.active;
  std::string code = ui.pin;
  alarm_defer_action(action, code, true);
}

inline void alarm_pin_key_cb(lv_event_t *e) {
  const char *key = static_cast<const char *>(lv_event_get_user_data(e));
  if (!key) return;
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  if (strcmp(key, "back") == 0) {
    ui.pin.clear();
    alarm_pin_update_display();
    return;
  }
  if (strcmp(key, "submit") == 0) {
    alarm_pin_submit();
    return;
  }
  if (ui.pin.size() < 16 && key[0] >= '0' && key[0] <= '9' && key[1] == '\0') {
    ui.pin.push_back(key[0]);
    alarm_pin_update_display();
  }
}

inline void alarm_pin_open_modal(AlarmActionCtx *action) {
  if (!alarm_action_context_valid(action) || !action->card->available) return;
  const lv_font_t *label_font = action->card->btn
    ? lv_obj_get_style_text_font(action->card->btn, LV_PART_MAIN)
    : nullptr;
  const lv_font_t *pin_label_font = action->card->pin_label_font
    ? action->card->pin_label_font
    : label_font;
  const lv_font_t *key_label_font = action->card->key_label_font
    ? action->card->key_label_font
    : label_font;
  const lv_font_t *icon_font = action->card->icon_font
    ? action->card->icon_font
    : action->card->icon_lbl
    ? lv_obj_get_style_text_font(action->card->icon_lbl, LV_PART_MAIN)
    : label_font;

  ControlModalShell shell = control_modal_open_shell(
    ControlModalKind::ALARM_PIN, action->card->btn,
    action->card->width_compensation_percent, icon_font,
    alarm_pin_hide_modal);

  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  ui.active_action = *action;
  ui.active = &ui.active_action;
  ui.pin.clear();
  ui.overlay = shell.overlay;
  ui.panel = shell.panel;
  ui.back_btn = shell.close_btn;

  ControlModalLayout &layout = shell.layout;

  ui.pin_lbl = pin_keypad_create(ui.panel, layout, pin_label_font, key_label_font,
                                icon_font, action->card->width_compensation_percent,
                                alarm_pin_key_cb, false);
  alarm_pin_update_display();

  lv_obj_move_foreground(ui.back_btn);
  lv_obj_move_foreground(ui.overlay);
}

inline void alarm_action_activate(AlarmActionCtx *action) {
  if (!alarm_action_context_valid(action) || !action->card->available) return;
  if (action->requires_pin) {
    alarm_pin_open_modal(action);
    return;
  }
  send_alarm_action(action, "");
}
