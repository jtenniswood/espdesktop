#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#include "cover_art.h"
#include "media_playback_modes.h"
#include "media_power_capability.h"
#include "media_control_tabs.h"
#include "media_metadata_policy.h"

constexpr lv_coord_t MEDIA_CONTROL_VOLUME_VALUE_Y_REF_PX = -8;
constexpr int MEDIA_CONTROL_SPEAKERS_TAB_ICON_SCALE_PERCENT = 80;
constexpr int MEDIA_CONTROL_SPEAKER_ROW_ICON_ZOOM = 200;
constexpr lv_opa_t MEDIA_CONTROL_SPEAKER_VOLUME_TEXT_OPA = 204;

struct MediaControlCtx {
  std::string entity_id;
  std::string power_entity;
  espdesktop::media::ControlTabs control_tabs = espdesktop::media::parse_control_tabs("");
  std::string power_state_text = "unknown";
  bool power_state_known = false;
  bool power_available = false;
  std::string label;
  std::string friendly_name;
  std::string state_text = "unknown";
  std::string title;
  std::string artist;
  std::string speaker_group_entity;
  std::vector<std::string> group_members;
  std::vector<std::string> speaker_helper_members;
  std::vector<MediaGroupDiscoveryItem> speaker_discovery;
  std::vector<MediaGroupVolumeState> group_volume_states;
  bool speaker_discovery_available = false;
  float duration = 0.0f;
  float position_seconds = 0.0f;
  uint32_t position_updated_ms = 0;
  bool position_updated_at_known = false;
  uint32_t position_updated_at_ms = 0;
  bool seek_pending = false;
  float seek_target_seconds = 0.0f;
  uint32_t seek_pending_ms = 0;
  uint32_t track_position_reset_until_ms = 0;
  int current_pct = 0;
  int reported_volume_pct = 0;
  bool reported_volume_known = false;
  int max_pct = 100;
  int pending_pct = -1;
  uint32_t pending_until_ms = 0;
  uint32_t accent_color = DEFAULT_ACCENT_COLOR;
  uint32_t secondary_color = theme_display_color(current_theme().surface_primary);
  uint32_t tertiary_color = theme_display_color(current_theme().surface_secondary);
  lv_obj_t *btn = nullptr;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *label_lbl = nullptr;
  lv_obj_t *volume_value_lbl = nullptr;
  lv_obj_t *volume_unit_lbl = nullptr;
  lv_obj_t *volume_container = nullptr;
  const lv_font_t *title_font = nullptr;
  const lv_font_t *label_font = nullptr;
  const lv_font_t *number_font = nullptr;
  const lv_font_t *icon_font = nullptr;
  int width_compensation_percent = 100;
  bool available = true;
  bool state_known = false;
  bool playing = false;
  bool cover_art_mode = false;
  bool highlight_playing = true;
  bool volume_known = false;
  bool label_shows_status = false;
  bool top_shows_volume = false;
  bool dragging_progress = false;
  bool dragging_volume = false;
  bool supported_features_known = false;
  int supported_features = 0;
  bool shuffle_known = false;
  bool shuffle_enabled = false;
  espdesktop::media::RepeatMode repeat_mode =
    espdesktop::media::RepeatMode::UNKNOWN;
  espdesktop::media::VolumeControlMode volume_control_mode =
    espdesktop::media::VolumeControlMode::ABSOLUTE;
  bool grouping_supported = false;
  bool group_only = false;
};

struct MediaSpeakerRowState {
  std::string entity_id;
  std::string friendly_name;
  int volume_pct = 0;
  bool volume_known = false;
  bool available = false;
  bool selected = false;
  bool pending = false;
  bool previous_selected = false;
  uint32_t call_id = 0;
  uint32_t pending_until_ms = 0;
  lv_obj_t *row = nullptr;
  lv_obj_t *content_box = nullptr;
  lv_obj_t *text_box = nullptr;
  lv_obj_t *name_label = nullptr;
  lv_obj_t *speaker_icon = nullptr;
  lv_obj_t *volume_label = nullptr;
  lv_obj_t *volume_controls = nullptr;
  lv_obj_t *volume_minus_btn = nullptr;
  lv_obj_t *volume_plus_btn = nullptr;
};

struct MediaControlModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *tab_row = nullptr;
  espdesktop::media::ControlTabs visible_tabs;
  lv_obj_t *controls_tab = nullptr;
  lv_obj_t *progress_tab = nullptr;
  lv_obj_t *volume_tab = nullptr;
  lv_obj_t *speakers_tab = nullptr;
  lv_obj_t *power_tab = nullptr;
  lv_obj_t *content_box = nullptr;
  lv_obj_t *controls_box = nullptr;
  lv_obj_t *progress_box = nullptr;
  lv_obj_t *volume_box = nullptr;
  lv_obj_t *title_lbl = nullptr;
  lv_obj_t *artist_lbl = nullptr;
  lv_obj_t *progress_slider = nullptr;
  lv_obj_t *progress_fill = nullptr;
  lv_obj_t *progress_handle = nullptr;
  lv_obj_t *progress_time_lbl = nullptr;
  lv_obj_t *shuffle_btn = nullptr;
  lv_obj_t *previous_btn = nullptr;
  lv_obj_t *play_btn = nullptr;
  lv_obj_t *play_icon_lbl = nullptr;
  lv_obj_t *next_btn = nullptr;
  lv_obj_t *repeat_btn = nullptr;
  lv_obj_t *repeat_icon_lbl = nullptr;
  lv_obj_t *volume_arc = nullptr;
  lv_obj_t *volume_group_lbl = nullptr;
  lv_obj_t *volume_pct_lbl = nullptr;
  lv_obj_t *volume_minus_btn = nullptr;
  lv_obj_t *volume_plus_btn = nullptr;
  lv_obj_t *speakers_box = nullptr;
  lv_obj_t *speakers_status_lbl = nullptr;
  bool speaker_status_error = false;
  lv_obj_t *speaker_list = nullptr;
  lv_timer_t *speaker_action_timer = nullptr;
  std::vector<MediaSpeakerRowState *> speaker_rows;
  lv_obj_t *power_btn = nullptr;
  lv_obj_t *power_icon_lbl = nullptr;
  lv_obj_t *power_status_lbl = nullptr;
  MediaControlCtx *active = nullptr;
  MediaControlCtx *display_text_ctx = nullptr;
  std::string display_title;
  std::string display_artist;
  bool display_text_valid = false;
  MediaControlTab tab = MediaControlTab::CONTROLS;
  bool updating_progress = false;
  bool updating_volume = false;
  bool progress_layout_ready = false;
  bool progress_refresh_pending = false;
  uint32_t speaker_generation = 0;
  uint32_t speaker_last_scroll_ms = 0;
};

constexpr uint32_t MEDIA_GROUP_ACTION_TIMEOUT_MS = 12000;

inline MediaControlModalUi &media_control_modal_ui() {
  static MediaControlModalUi ui;
  return ui;
}

inline void media_control_store_group_volume(MediaControlCtx *ctx,
                                              const std::string &entity_id,
                                              int volume_pct,
                                              bool volume_known,
                                              bool available) {
  if (!ctx || entity_id.empty()) return;
  for (MediaGroupVolumeState &member : ctx->group_volume_states) {
    if (member.entity_id != entity_id) continue;
    // Ignore old snapshots while Home Assistant catches up with a local tap.
    // Unknown/unavailable reports still take effect immediately.
    if (member.pending_until_ms != 0 && available && volume_known &&
        volume_pct != member.volume_pct &&
        (int32_t)(member.pending_until_ms - esphome::millis()) > 0) return;
    member.pending_until_ms = 0;
    member.volume_pct = volume_pct;
    member.volume_known = volume_known;
    member.available = available;
    return;
  }
  ctx->group_volume_states.push_back(
    {entity_id, volume_pct, volume_known, available});
}

inline void media_control_set_group_volume_target(MediaControlCtx *ctx,
                                                   const std::string &entity_id,
                                                   int volume_pct,
                                                   bool available) {
  if (!ctx) return;
  for (MediaGroupVolumeState &member : ctx->group_volume_states) {
    if (member.entity_id != entity_id) continue;
    member.volume_pct = volume_pct;
    member.volume_known = true;
    member.available = available;
    member.pending_until_ms = esphome::millis() + 1500;
    return;
  }
  ctx->group_volume_states.push_back(
    {entity_id, volume_pct, true, available, esphome::millis() + 1500});
}

inline void media_control_copy_group_volume_to_row(MediaControlCtx *ctx,
                                                   MediaSpeakerRowState *row) {
  if (!ctx || !row) return;
  for (const MediaGroupVolumeState &member : ctx->group_volume_states) {
    if (member.entity_id != row->entity_id) continue;
    row->volume_pct = member.volume_pct;
    row->volume_known = member.volume_known;
    row->available = member.available;
    return;
  }
}

struct MediaPlaybackState;
inline bool media_playback_state_has_progress(const std::string &entity_id);

inline std::string media_status_text(const std::string &state) {
  if (state == "playing") return espdesktop_i18n(std::string("Playing"));
  if (state == "paused") return espdesktop_i18n(std::string("Paused"));
  if (state == "idle") return espdesktop_i18n(std::string("Idle"));
  if (state == "off") return espdesktop_i18n(std::string("Off"));
  if (state == "unavailable") return espdesktop_i18n(std::string("Unavailable"));
  if (state == "unknown" || state.empty()) return espdesktop_i18n(std::string("Unknown"));
  return sentence_cap_text(state);
}

inline bool media_control_progress_supported(MediaControlCtx *ctx) {
#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL
  return ctx && media_playback_state_has_progress(ctx->entity_id);
#else
  (void) ctx;
  return true;
#endif
}

inline bool media_control_power_supported(MediaControlCtx *ctx) {
  return ctx && !ctx->power_entity.empty();
}

inline bool media_control_shuffle_supported(MediaControlCtx *ctx) {
  return ctx && espdesktop::media::shuffle_supported(
    ctx->supported_features_known, ctx->supported_features);
}

inline bool media_control_repeat_supported(MediaControlCtx *ctx) {
  return ctx && espdesktop::media::repeat_supported(
    ctx->supported_features_known, ctx->supported_features);
}

inline espdesktop::media::PowerCommand media_control_power_command(
    MediaControlCtx *ctx) {
  if (!media_control_power_supported(ctx)) return espdesktop::media::PowerCommand::NONE;
  return espdesktop::media::power_command(
    true, espdesktop::media::SUPPORT_TURN_ON | espdesktop::media::SUPPORT_TURN_OFF,
    ctx->power_state_known, ctx->power_available, ctx->power_state_text);
}

inline void media_control_send_power_action(MediaControlCtx *ctx) {
  const auto command = media_control_power_command(ctx);
  if (command == espdesktop::media::PowerCommand::TURN_ON) {
    send_media_player_action(ctx->power_entity, "homeassistant.turn_on");
  } else if (command == espdesktop::media::PowerCommand::TURN_OFF) {
    send_media_player_action(ctx->power_entity, "homeassistant.turn_off");
  }
}

inline void media_apply_now_playing_artist_text(MediaNowPlayingCtx *ctx) {
  if (!ctx || !ctx->artist_lbl) return;
  const char *text = ctx->external_source
    ? espdesktop_i18n("Source")
    : ctx->artist;
  lv_label_set_display_text(ctx->artist_lbl, text);
}

inline void media_position_now_playing_artist(MediaNowPlayingCtx *ctx) {
  if (!ctx || !ctx->artist_below_title || !ctx->btn ||
      !ctx->title_lbl || !ctx->artist_lbl) return;
  lv_obj_update_layout(ctx->btn);
  lv_obj_align_to(
    ctx->artist_lbl, ctx->title_lbl,
    LV_ALIGN_OUT_BOTTOM_LEFT, 0, ctx->artist_gap);
}

inline bool media_control_seek_pending_active(MediaControlCtx *ctx);
inline bool media_control_track_position_reset_active(MediaControlCtx *ctx);
inline bool media_control_volume_pending_active(MediaControlCtx *ctx);
inline void media_control_hide_modal();
inline void media_control_layout_modal(MediaControlCtx *ctx);
inline void media_control_refresh_modal(MediaControlCtx *ctx);
inline void media_control_refresh_progress(MediaControlCtx *ctx);
inline void media_control_refresh_volume(MediaControlCtx *ctx);
inline void media_control_refresh_group_volume(MediaControlCtx *ctx);
inline void media_control_speaker_action_timer_cb(lv_timer_t *timer);
inline void media_control_refresh_power(MediaControlCtx *ctx);
inline void media_control_refresh_playback_modes(MediaControlCtx *ctx);
inline void media_control_ensure_tab_content(MediaControlCtx *ctx);
inline void media_control_clear_tab_content();
inline void media_control_refresh_speakers(MediaControlCtx *ctx);
inline void media_control_refresh_group_member_volumes(MediaControlCtx *ctx);
inline size_t media_control_group_size(MediaControlCtx *ctx);
inline espdesktop::media::ControlTabs media_control_visible_tabs(MediaControlCtx *ctx) {
  if (!ctx) return espdesktop::media::parse_control_tabs("controls");
  if (ctx->group_only) return espdesktop::media::parse_control_tabs("speakers");
  if (!ctx->available) {
    espdesktop::media::ControlTabs visible;
    if (ctx->control_tabs.contains(MediaControlTab::POWER) &&
        media_control_power_command(ctx) != espdesktop::media::PowerCommand::NONE) {
      visible.add(MediaControlTab::POWER);
    }
    return visible;
  }
  return espdesktop::media::visible_control_tabs(ctx->control_tabs,
    media_control_progress_supported(ctx),
    media_group_speaker_tab_available(ctx->grouping_supported, ctx->speaker_discovery_available,
                                     media_control_group_size(ctx) > 1),
    media_control_power_supported(ctx));
}

inline bool media_control_tab_layout_changed(MediaControlCtx *ctx) {
  const MediaControlModalUi &ui = media_control_modal_ui();
  return ctx && ui.active == ctx && !(ui.visible_tabs == media_control_visible_tabs(ctx));
}

inline bool media_control_can_open_modal(MediaControlCtx *ctx) {
  if (!ctx || (ctx->group_only && !ctx->grouping_supported)) return false;
  return ctx->available || (!ctx->group_only &&
    media_control_visible_tabs(ctx).contains(MediaControlTab::POWER));
}

inline void media_control_refresh_open_modal(MediaControlCtx *ctx, bool layout_needed = false) {
  if (!ctx || media_control_modal_ui().active != ctx) return;
  if (!media_control_can_open_modal(ctx)) media_control_hide_modal();
  else if (layout_needed || media_control_tab_layout_changed(ctx)) media_control_layout_modal(ctx);
  else media_control_refresh_modal(ctx);
}

inline void media_control_ensure_visible_tab(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  const auto visible = media_control_visible_tabs(ctx);
  if (visible.contains(ui.tab)) return;
  if (ui.tab == MediaControlTab::SPEAKERS) ui.speaker_generation++;
  media_control_clear_tab_content();
  ui.tab = visible.tabs[0];
}

inline bool media_control_group_volume_percent(MediaControlCtx *ctx, int *pct);
inline void media_control_apply_group_volume_percent(MediaControlCtx *ctx, int pct,
                                                      bool send_action = true);
inline void media_control_set_volume_value(MediaControlCtx *ctx, int pct);
inline int media_control_volume_max_pct(MediaControlCtx *ctx);
inline int media_control_clamp_volume(MediaControlCtx *ctx, int pct);
inline float media_control_current_position_seconds(MediaControlCtx *ctx);

inline void media_playback_detach_control(MediaControlCtx *ctx);
inline void media_playback_refresh_progress_timer(MediaPlaybackState *state);
inline void media_playback_apply_progress_consumers(MediaPlaybackState *state);

inline void delete_media_control_context(MediaControlCtx *ctx) {
  if (!ctx) return;
  MediaControlModalUi &ui = media_control_modal_ui();
  if (ui.active == ctx) media_control_hide_modal();
  media_playback_detach_control(ctx);
  if (ctx->btn && lv_obj_get_user_data(ctx->btn) == ctx) {
    lv_obj_set_user_data(ctx->btn, nullptr);
  }
  delete ctx;
}

inline void media_control_apply_availability(lv_obj_t *visual_obj, lv_obj_t *input_obj,
                                             bool available,
                                             bool disable_interaction = true) {
  if (visual_obj) {
    lv_obj_set_style_opa(visual_obj, available ? LV_OPA_COVER : LV_OPA_50, LV_PART_MAIN);
    if (disable_interaction) {
      if (available) lv_obj_clear_state(visual_obj, LV_STATE_DISABLED);
      else lv_obj_add_state(visual_obj, LV_STATE_DISABLED);
    }
  }
  if (!disable_interaction || !input_obj) return;
  if (input_obj != visual_obj) {
    if (available) lv_obj_clear_state(input_obj, LV_STATE_DISABLED);
    else lv_obj_add_state(input_obj, LV_STATE_DISABLED);
  }
  if (available) lv_obj_add_flag(input_obj, LV_OBJ_FLAG_CLICKABLE);
  else lv_obj_clear_flag(input_obj, LV_OBJ_FLAG_CLICKABLE);
}

inline void media_control_refresh_parent_card(MediaControlCtx *ctx) {
  if (!ctx) return;
  if (ctx->label_lbl &&
      espdesktop::media::media_control_updates_parent_label(
        ctx->cover_art_mode)) {
    std::string label = ctx->label_shows_status
      ? media_status_text(ctx->state_text)
      : ctx->label;
    lv_label_set_display_text(ctx->label_lbl, label.c_str());
  }
  if (ctx->top_shows_volume && ctx->volume_value_lbl) {
    if (ctx->volume_known) {
      char buf[8];
      snprintf(
        buf, sizeof(buf), "%d",
        espdesktop::media::volume_display_value(
          ctx->volume_control_mode, ctx->current_pct,
          media_control_volume_max_pct(ctx)));
      lv_label_set_display_text(ctx->volume_value_lbl, buf);
    } else {
      lv_label_set_display_text(ctx->volume_value_lbl, "--");
    }
    if (ctx->volume_unit_lbl) lv_label_set_display_text(ctx->volume_unit_lbl, "");
  }
}

inline bool media_seek_pending_active(SliderCtx *ctx) {
  return ctx && ctx->media_seek_pending &&
         (esphome::millis() - ctx->media_seek_pending_ms) < MEDIA_SEEK_PENDING_TIMEOUT_MS;
}

inline void media_deferred_position_refresh_cb(lv_timer_t *timer);
inline void media_schedule_position_refresh(SliderCtx *ctx);

inline void media_apply_position(SliderCtx *ctx) {
  if (!ctx) return;
  float seconds = ctx->media_position_seconds;
  if (ctx->media_playing && ctx->media_position_updated_ms > 0) {
    uint32_t elapsed_ms = esphome::millis() - ctx->media_position_updated_ms;
    seconds += elapsed_ms / 1000.0f;
  }
  if (ctx->media_duration > 0.0f && seconds > ctx->media_duration) {
    seconds = ctx->media_duration;
  }

  if (ctx->media_value_lbl) {
    char time_buf[16];
    media_format_time(seconds, time_buf, sizeof(time_buf));
    lv_label_set_display_text(ctx->media_value_lbl, time_buf);
  }

  int pct = 0;
  if (ctx->media_duration > 0.0f) {
    pct = (int)((seconds * 100.0f / ctx->media_duration) + 0.5f);
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
  }
  if (ctx->media_slider) lv_slider_set_value(ctx->media_slider, pct, LV_ANIM_OFF);
  if (ctx->media_slider && ctx->fill) {
    lv_obj_t *btn = lv_obj_get_parent(ctx->media_slider);
    int fill_pct = ctx->inverted ? 100 - pct : pct;
    slider_update_ctx_fill(ctx, btn, fill_pct);
  }
}

inline void media_deferred_position_refresh_cb(lv_timer_t *timer) {
  if (!timer) return;
  SliderCtx *ctx = static_cast<SliderCtx *>(lv_timer_get_user_data(timer));
  if (!espdesktop::media_slider_lifecycle::callback_is_current(
        ctx, timer,
        [](lv_obj_t *obj) { return lv_obj_get_user_data(obj); })) {
    if (ctx && ctx->media_timer == timer) {
      ctx->media_timer = nullptr;
      ctx->media_position_refresh_remaining = 0;
    }
    lv_timer_del(timer);
    return;
  }
  slider_refresh_geometry(ctx->media_slider);
  media_apply_position(ctx);
  if (ctx->media_position_refresh_remaining > 0) {
    ctx->media_position_refresh_remaining--;
    return;
  }
  ctx->media_timer = nullptr;
  lv_timer_del(timer);
}

inline void media_schedule_position_refresh(SliderCtx *ctx) {
  if (!espdesktop::media_slider_lifecycle::can_schedule(
        ctx, [](lv_obj_t *obj) { return lv_obj_get_user_data(obj); })) return;
  ctx->media_position_refresh_remaining = 10;
  if (ctx->media_timer) return;
  ctx->media_timer = lv_timer_create(media_deferred_position_refresh_cb, 100, ctx);
}

// Cover Art can use distinct main, secondary artwork, and optional power entities.
constexpr int MEDIA_PLAYBACK_STATE_MAX = 3 * (MAX_GRID_SLOTS + MAX_SUBPAGE_ITEMS);
constexpr size_t MEDIA_PLAYBACK_STATE_CONSUMERS_MAX =
  static_cast<size_t>(MAX_GRID_SLOTS + MAX_SUBPAGE_ITEMS);

struct MediaPlaybackButtonRef {
  lv_obj_t *btn = nullptr;
  lv_obj_t *status_lbl = nullptr;
};

struct MediaSpeakerDiscoveryState {
  std::string entity_id;
  std::vector<std::string> members;
  std::vector<MediaGroupDiscoveryItem> items;
  bool available = false;
};

struct MediaPlaybackState {
  bool used = false;
  bool state_subscribed = false;
  bool metadata_subscribed = false;
  bool metadata_title_awaiting_refresh = false;
  uint32_t metadata_title_refresh_started_ms = 0;
  bool source_subscribed = false;
  bool progress_subscribed = false;
  uint32_t progress_subscription_scope = 0;
  bool volume_subscribed = false;
  bool capabilities_subscribed = false;
  bool shuffle_subscribed = false;
  bool repeat_subscribed = false;
  bool content_subscribed = false;
  bool friendly_name_subscribed = false;
  bool grouping_subscribed = false;
  uint32_t generation = 0;
  std::string entity_id;
  std::string state_text = "unknown";
  std::string title;
  std::string artist;
  std::string source;
  std::string friendly_name;
  std::string current_content_id;
  uint64_t current_content_fingerprint = 0;
  std::string current_content_type;
  espdesktop::media::MediaItemKind current_content_kind =
    espdesktop::media::MediaItemKind::UNKNOWN;
  std::vector<std::string> group_members;
  std::vector<MediaSpeakerDiscoveryState> speaker_discoveries;
  bool has_state = false;
  bool available = true;
  bool playing = false;
  bool source_known = false;
  bool external_source = false;
  bool source_observed_for_state = false;
  bool content_id_observed_for_state = false;
  bool has_duration = false;
  bool has_position = false;
  float duration = 0.0f;
  uint32_t last_duration_callback_ms = 0;
  float position_seconds = 0.0f;
  uint32_t position_updated_ms = 0;
  bool position_updated_at_known = false;
  uint32_t position_updated_at_ms = 0;
  bool volume_known = false;
  int volume_pct = 0;
  bool supported_features_known = false;
  int supported_features = 0;
  bool shuffle_known = false;
  bool shuffle_enabled = false;
  espdesktop::media::RepeatMode repeat_mode =
    espdesktop::media::RepeatMode::UNKNOWN;
  espdesktop::media::VolumeControlMode volume_control_mode =
    espdesktop::media::VolumeControlMode::ABSOLUTE;
  bool has_current_content_id = false;
  bool has_current_content_type = false;
  uint8_t artwork_content_mask = 0;
  lv_timer_t *progress_timer = nullptr;
  std::vector<SliderCtx *> sliders;
  std::vector<MediaControlCtx *> controls;
  std::vector<MediaControlCtx *> power_controls;
  std::vector<MediaVolumeCtx *> volumes;
  std::vector<MediaPlaylistCtx *> playlists;
  std::vector<MediaNowPlayingCtx *> now_playing;
  std::vector<MediaPlaybackButtonRef> buttons;
};

inline std::vector<MediaPlaybackState *> &media_playback_states() {
  static std::vector<MediaPlaybackState *> states;
  return states;
}

template<typename T>
inline void media_playback_erase_consumer(std::vector<T *> &consumers, T *consumer) {
  consumers.erase(
    std::remove(consumers.begin(), consumers.end(), consumer),
    consumers.end());
}

inline void media_playback_detach_control(MediaControlCtx *ctx) {
  if (!ctx) return;
  for (MediaPlaybackState *state : media_playback_states()) {
    if (!state) continue;
    media_playback_erase_consumer(state->controls, ctx);
    media_playback_erase_consumer(state->power_controls, ctx);
    media_playback_refresh_progress_timer(state);
  }
}

inline void media_playback_reset_state(MediaPlaybackState *state,
                                       const std::string &entity_id) {
  if (!state) return;
  if (state->progress_timer) lv_timer_pause(state->progress_timer);
  state->used = true;
  state->state_subscribed = false;
  state->metadata_subscribed = false;
  state->metadata_title_awaiting_refresh = false;
  state->metadata_title_refresh_started_ms = 0;
  state->source_subscribed = false;
  state->progress_subscribed = false;
  state->progress_subscription_scope = 0;
  state->volume_subscribed = false;
  state->capabilities_subscribed = false;
  state->shuffle_subscribed = false;
  state->repeat_subscribed = false;
  state->content_subscribed = false;
  state->friendly_name_subscribed = false;
  state->grouping_subscribed = false;
  state->generation = ha_subscription_generation();
  state->entity_id = entity_id;
  state->state_text = "unknown";
  state->title.clear();
  state->artist.clear();
  state->source.clear();
  state->friendly_name.clear();
  state->current_content_id.clear();
  state->current_content_fingerprint = 0;
  state->current_content_type.clear();
  state->current_content_kind = espdesktop::media::MediaItemKind::UNKNOWN;
  std::vector<std::string>().swap(state->group_members);
  std::vector<MediaSpeakerDiscoveryState>().swap(state->speaker_discoveries);
  state->has_state = false;
  state->available = true;
  state->playing = false;
  state->source_known = false;
  state->external_source = false;
  state->source_observed_for_state = false;
  state->content_id_observed_for_state = false;
  state->has_duration = false;
  state->has_position = false;
  state->duration = 0.0f;
  state->last_duration_callback_ms = 0;
  state->position_seconds = 0.0f;
  state->position_updated_ms = 0;
  state->position_updated_at_known = false;
  state->position_updated_at_ms = 0;
  state->volume_known = false;
  state->volume_pct = 0;
  state->supported_features_known = false;
  state->supported_features = 0;
  state->shuffle_known = false;
  state->shuffle_enabled = false;
  state->repeat_mode = espdesktop::media::RepeatMode::UNKNOWN;
  state->volume_control_mode = espdesktop::media::VolumeControlMode::ABSOLUTE;
  state->has_current_content_id = false;
  state->has_current_content_type = false;
  state->content_id_observed_for_state = false;
  state->artwork_content_mask = 0;
  std::vector<SliderCtx *>().swap(state->sliders);
  std::vector<MediaControlCtx *>().swap(state->controls);
  std::vector<MediaControlCtx *>().swap(state->power_controls);
  std::vector<MediaVolumeCtx *>().swap(state->volumes);
  std::vector<MediaPlaylistCtx *>().swap(state->playlists);
  std::vector<MediaNowPlayingCtx *>().swap(state->now_playing);
  std::vector<MediaPlaybackButtonRef>().swap(state->buttons);
}

inline MediaPlaybackState *media_playback_find_state(const std::string &entity_id) {
  if (entity_id.empty()) return nullptr;
  std::vector<MediaPlaybackState *> &states = media_playback_states();
  for (MediaPlaybackState *state : states) {
    if (state && state->used && state->entity_id == entity_id) {
      if (state->generation != ha_subscription_generation()) {
        media_playback_reset_state(state, entity_id);
      }
      return state;
    }
  }
  return nullptr;
}

inline float media_playback_current_position_seconds(MediaPlaybackState *state) {
  if (!state || !state->has_position) return 0.0f;
  float seconds = state->position_seconds;
  if (state->playing && state->position_updated_ms > 0) {
    uint32_t elapsed_ms = esphome::millis() - state->position_updated_ms;
    seconds += elapsed_ms / 1000.0f;
  }
  if (seconds < 0.0f) seconds = 0.0f;
  if (state->has_duration && state->duration > 0.0f && seconds > state->duration) {
    seconds = state->duration;
  }
  return seconds;
}

inline void media_playback_apply_state_to_slider(MediaPlaybackState *state,
                                                 SliderCtx *ctx) {
  if (!state || !ctx) return;
  ctx->available = state->available;
  ctx->media_playing = state->playing;
  if (ctx->media_status_lbl) {
    std::string label = media_status_text(state->available ? state->state_text : std::string("unavailable"));
    lv_label_set_display_text(ctx->media_status_lbl, label.c_str());
  }
  if (!ctx->media_position) return;

  ctx->media_duration = state->duration;
  if (media_seek_pending_active(ctx)) {
    if (!state->has_position ||
        std::fabs(state->position_seconds - ctx->media_seek_target_seconds) >
          MEDIA_SEEK_MATCH_TOLERANCE_SECONDS) {
      media_apply_position(ctx);
      media_schedule_position_refresh(ctx);
      return;
    }
  }
  ctx->media_seek_pending = false;
  ctx->media_position_seconds = state->position_seconds;
  ctx->media_position_updated_ms = state->position_updated_ms;
  ctx->media_position_updated_at_known = state->position_updated_at_known;
  ctx->media_position_updated_at_ms = state->position_updated_at_ms;
  media_apply_position(ctx);
  media_schedule_position_refresh(ctx);
}

inline void media_playback_apply_state_to_sliders(MediaPlaybackState *state) {
  if (!state) return;
  for (SliderCtx *ctx : state->sliders) {
    media_playback_apply_state_to_slider(state, ctx);
  }
}

inline std::string media_playback_artwork_refresh_signature(
    const MediaPlaybackState *state) {
  if (!state) return {};
  if (!state->current_content_id.empty()) {
    return std::string("content:") + state->current_content_id;
  }
  if (!state->title.empty() || !state->artist.empty()) {
    return std::string("metadata:") + state->title + "\x1f" + state->artist;
  }
  return state->has_state ? std::string("state:") + state->state_text : std::string();
}

inline bool media_playback_has_current_content(const MediaPlaybackState *state) {
  if (!state) return false;
  const bool has_content = !state->title.empty() || !state->artist.empty() ||
                           state->has_current_content_id ||
                           state->artwork_content_mask != 0;
  return espdesktop::cover_art::media_entity_content_available(
    state->has_state, state->available, has_content);
}

inline bool image_card_media_artwork_visible(const ImageCardCtx *ctx);

inline void media_cover_art_set_idle_placeholder(MediaNowPlayingCtx *ctx,
                                                 bool visible) {
  if (!ctx || !ctx->cover_art_mode) return;
  if (ctx->icon_lbl) {
    if (visible) {
      lv_label_set_display_text(ctx->icon_lbl, find_icon("Music"));
      lv_obj_align(ctx->icon_lbl, LV_ALIGN_TOP_LEFT, 0, 0);
      lv_obj_clear_flag(ctx->icon_lbl, LV_OBJ_FLAG_HIDDEN);
      lv_obj_move_foreground(ctx->icon_lbl);
    } else {
      lv_obj_add_flag(ctx->icon_lbl, LV_OBJ_FLAG_HIDDEN);
    }
  }
  if (ctx->idle_lbl) {
    if (visible) {
      lv_label_set_display_text(ctx->idle_lbl, espdesktop_i18n("Idle"));
      lv_obj_align(ctx->idle_lbl, LV_ALIGN_BOTTOM_LEFT, 0, 0);
      configure_button_label_wrap(ctx->idle_lbl);
      lv_obj_clear_flag(ctx->idle_lbl, LV_OBJ_FLAG_HIDDEN);
      lv_obj_move_foreground(ctx->idle_lbl);
    } else {
      lv_obj_add_flag(ctx->idle_lbl, LV_OBJ_FLAG_HIDDEN);
    }
  }
}

inline void media_playback_refresh_stable_artwork(MediaPlaybackState *state,
                                                  MediaNowPlayingCtx *ctx) {
  if (!state || !ctx || !ctx->cover_art) return;
  const bool has_content = media_playback_has_current_content(state);
  if (espdesktop::cover_art::media_card_artwork_should_clear(
        state->has_state, state->available, state->state_text, has_content)) {
    ctx->artwork_refresh_signature.clear();
    image_card_clear_media_artwork(ctx->cover_art);
    return;
  }
  const std::string signature = media_playback_artwork_refresh_signature(state);
  if (signature.empty() || signature == ctx->artwork_refresh_signature) return;
  ctx->artwork_refresh_signature = signature;
  image_card_refresh_media_artwork_on_metadata_change(ctx->cover_art);
}

inline void media_playback_apply_state_to_now_playing_snapshot(
    MediaPlaybackState *state, MediaNowPlayingCtx *ctx) {
  if (!state || !ctx) return;
  ctx->source_known = state->source_known;
  ctx->external_source = state->external_source;
  const bool has_content = media_playback_has_current_content(state);
  const bool idle_placeholder = ctx->cover_art_mode &&
    espdesktop::cover_art::media_cover_art_idle_placeholder_visible(
      state->has_state, state->available, state->state_text, has_content,
      ctx->external_source_fallback);
  media_cover_art_set_idle_placeholder(ctx, idle_placeholder);
  if (ctx->cover_art) {
    if (espdesktop::cover_art::media_card_artwork_should_clear(
          state->has_state, state->available, state->state_text, has_content)) {
      image_card_clear_media_artwork(ctx->cover_art);
    } else {
      image_card_set_media_artwork_suppressed(
        ctx->cover_art, espdesktop::cover_art::media_card_artwork_suppressed(
          ctx->source_known, ctx->external_source));
    }
  }
  if (ctx->title_lbl) {
    std::string title =
      idle_placeholder ? std::string()
      : ctx->external_source_fallback && state->external_source && !state->source.empty()
        ? state->source
        : state->title.empty() ? std::string("--") : state->title;
    title = espdesktop::media::normalize_media_display_text(title);
    if (title.empty() && !idle_placeholder) title = "--";
    lv_label_set_display_text(ctx->title_lbl, title.c_str());
    if (!idle_placeholder &&
        (ctx->show_track_details || ctx->external_source_fallback)) {
      lv_obj_clear_flag(ctx->title_lbl, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(ctx->title_lbl, LV_OBJ_FLAG_HIDDEN);
    }
  }
  if (ctx->artist_lbl) {
    const std::string artist = espdesktop::media::normalize_media_display_text(
      state->artist, sizeof(ctx->artist) - 1);
    std::strncpy(ctx->artist, artist.c_str(), sizeof(ctx->artist) - 1);
    ctx->artist[sizeof(ctx->artist) - 1] = '\0';
    media_apply_now_playing_artist_text(ctx);
    if (!idle_placeholder &&
        espdesktop::cover_art::media_now_playing_artist_visible(
          !artist.empty(), ctx->external_source,
          ctx->show_track_details, ctx->external_source_fallback)) {
      lv_obj_clear_flag(ctx->artist_lbl, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(ctx->artist_lbl, LV_OBJ_FLAG_HIDDEN);
    }
  }
  media_position_now_playing_artist(ctx);
  if (ctx->play_pause_background && ctx->btn) {
    set_card_checked_state(ctx->btn, state->available && state->playing);
  }
}

inline void media_playback_apply_state_to_now_playing(MediaPlaybackState *state,
                                                      MediaNowPlayingCtx *ctx) {
  if (!state || !ctx) return;
  if (ctx->refresh_entity_route) ctx->refresh_entity_route();
  if (!ctx->active_entity.empty() && state->entity_id != ctx->active_entity) {
    MediaPlaybackState *active = media_playback_find_state(ctx->active_entity);
    if (active) media_playback_apply_state_to_now_playing_snapshot(active, ctx);
    return;
  }
  media_playback_refresh_stable_artwork(state, ctx);
  media_playback_apply_state_to_now_playing_snapshot(state, ctx);
}

inline void media_playback_apply_state_to_now_playing(MediaPlaybackState *state) {
  if (!state) return;
  for (MediaNowPlayingCtx *ctx : state->now_playing) {
    media_playback_apply_state_to_now_playing(state, ctx);
  }
}

inline void media_playback_apply_state_to_control(MediaPlaybackState *state,
                                                  MediaControlCtx *ctx) {
  if (!state || !ctx) return;
  const bool previous_power_supported = media_control_power_supported(ctx);
  const bool previous_shuffle_supported = media_control_shuffle_supported(ctx);
  const bool previous_repeat_supported = media_control_repeat_supported(ctx);
  const bool state_text_changed = state->has_state
    ? ctx->state_text != state->state_text
    : ctx->state_text != "unknown";
  bool metadata_changed = ctx->title != state->title ||
                          ctx->artist != state->artist ||
                          ctx->friendly_name != state->friendly_name;
  ctx->state_text = state->has_state ? state->state_text : std::string("unknown");
  ctx->available = state->available;
  ctx->state_known = state->has_state;
  ctx->playing = state->playing;
  ctx->title = state->title;
  ctx->artist = state->artist;
  ctx->friendly_name = state->friendly_name;
  MediaControlModalUi &modal_ui = media_control_modal_ui();
  if (modal_ui.display_text_ctx == ctx &&
      (metadata_changed || state_text_changed)) {
    modal_ui.display_text_valid = false;
  }
  MediaSpeakerDiscoveryState *discovery = nullptr;
  for (MediaSpeakerDiscoveryState &candidate : state->speaker_discoveries) {
    if (candidate.entity_id == ctx->speaker_group_entity) {
      discovery = &candidate;
      break;
    }
  }
  const bool discovery_changed = discovery
    ? (ctx->speaker_helper_members != discovery->members ||
       ctx->speaker_discovery_available != discovery->available)
    : (!ctx->speaker_helper_members.empty() ||
       !ctx->speaker_discovery.empty() ||
       ctx->speaker_discovery_available);
  bool grouping_changed = ctx->grouping_supported != media_grouping_supported(state->supported_features) ||
                          ctx->group_members != state->group_members ||
                          discovery_changed;
  ctx->grouping_supported = media_grouping_supported(state->supported_features);
  ctx->group_members = state->group_members;
  if (discovery) {
    ctx->speaker_helper_members = discovery->members;
    ctx->speaker_discovery = discovery->items;
    ctx->speaker_discovery_available = discovery->available;
  } else {
    ctx->speaker_helper_members.clear();
    ctx->speaker_discovery.clear();
    ctx->speaker_discovery_available = false;
  }
  ctx->duration = state->duration;
  ctx->volume_known = state->volume_known;
  ctx->supported_features_known = state->supported_features_known;
  ctx->supported_features = state->supported_features;
  const bool power_supported = media_control_power_supported(ctx);
  const bool shuffle_supported = media_control_shuffle_supported(ctx);
  const bool repeat_supported = media_control_repeat_supported(ctx);
  ctx->shuffle_known = shuffle_supported && state->shuffle_known;
  ctx->shuffle_enabled = state->shuffle_enabled;
  ctx->repeat_mode = repeat_supported
    ? state->repeat_mode : espdesktop::media::RepeatMode::UNKNOWN;
  const auto previous_volume_control_mode = ctx->volume_control_mode;
  ctx->volume_control_mode = state->volume_control_mode;
  if (previous_volume_control_mode != ctx->volume_control_mode &&
      ctx->volume_control_mode !=
        espdesktop::media::VolumeControlMode::ABSOLUTE) {
    ctx->pending_pct = -1;
    ctx->pending_until_ms = 0;
    ctx->dragging_volume = false;
  }

  if (state->has_position) {
    bool copy_position = true;
    if (media_control_track_position_reset_active(ctx)) {
      if (state->position_seconds > MEDIA_SEEK_MATCH_TOLERANCE_SECONDS) {
        copy_position = false;
      } else {
        ctx->track_position_reset_until_ms = 0;
      }
    }
    if (copy_position && media_control_seek_pending_active(ctx)) {
      if (std::fabs(state->position_seconds - ctx->seek_target_seconds) >
          MEDIA_SEEK_MATCH_TOLERANCE_SECONDS) {
        copy_position = false;
      } else {
        ctx->seek_pending = false;
      }
    } else if (copy_position) {
      ctx->seek_pending = false;
    }

    if (copy_position) {
      ctx->position_seconds = state->position_seconds;
      ctx->position_updated_ms = state->position_updated_ms;
      ctx->position_updated_at_known = state->position_updated_at_known;
      ctx->position_updated_at_ms = state->position_updated_at_ms;
    } else {
      media_control_refresh_progress(ctx);
    }
  }

  if (state->volume_known) {
    int pct = ctx->volume_control_mode ==
        espdesktop::media::VolumeControlMode::ABSOLUTE
      ? media_control_clamp_volume(ctx, state->volume_pct)
      : media_clamp_percent(state->volume_pct);
    if (media_control_volume_pending_active(ctx)) {
      if (pct != ctx->pending_pct) {
        media_control_refresh_volume(ctx);
      } else {
        ctx->pending_pct = -1;
        ctx->pending_until_ms = 0;
        ctx->volume_known = true;
        media_control_set_volume_value(ctx, pct);
      }
    } else {
      ctx->pending_pct = -1;
      ctx->pending_until_ms = 0;
      ctx->volume_known = true;
      media_control_set_volume_value(ctx, pct);
    }
  }
  ctx->reported_volume_pct = state->volume_pct;
  ctx->reported_volume_known = state->volume_known;
  media_control_store_group_volume(
    ctx, ctx->entity_id, state->volume_pct,
    state->volume_known, state->available);
  media_control_refresh_group_member_volumes(ctx);

  set_card_checked_state(ctx->btn, ctx->available &&
    (ctx->group_only ? media_control_group_size(ctx) > 1
                     : ctx->highlight_playing && ctx->playing));
  media_control_refresh_parent_card(ctx);
  MediaControlModalUi &ui = media_control_modal_ui();
  if (ui.active == ctx) {
    const bool mode_capabilities_changed =
      previous_shuffle_supported != shuffle_supported ||
      previous_repeat_supported != repeat_supported;
    bool layout_needed = metadata_changed || grouping_changed ||
                         previous_power_supported != power_supported ||
                         media_control_tab_layout_changed(ctx) ||
                         mode_capabilities_changed;
    if (mode_capabilities_changed && ui.tab == MediaControlTab::CONTROLS) {
      media_control_clear_tab_content();
    }
#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL
    if (media_control_progress_supported(ctx) && !ui.progress_tab) layout_needed = true;
    if (!media_control_progress_supported(ctx) && ui.tab == MediaControlTab::PROGRESS) {
      layout_needed = true;
    }
#endif
    if (!power_supported && ui.tab == MediaControlTab::POWER) {
      layout_needed = true;
    }
    media_control_refresh_open_modal(ctx, layout_needed);
  }
}

inline void media_playback_apply_state_to_controls(MediaPlaybackState *state) {
  if (!state) return;
  for (MediaControlCtx *ctx : state->controls) {
    media_playback_apply_state_to_control(state, ctx);
  }
}

inline void media_playback_apply_progress_consumers(MediaPlaybackState *state) {
  media_playback_apply_state_to_sliders(state);
  media_playback_apply_state_to_controls(state);
}

inline void media_playback_progress_timer_cb(lv_timer_t *timer) {
  MediaPlaybackState *state = static_cast<MediaPlaybackState *>(lv_timer_get_user_data(timer));
  if (!state || state->generation != ha_subscription_generation() || !state->playing) {
    if (timer) lv_timer_pause(timer);
    return;
  }
  media_playback_apply_progress_consumers(state);
}

inline void media_playback_refresh_progress_timer(MediaPlaybackState *state) {
  if (!state || !state->progress_subscribed) return;
  const bool has_timer_consumer = !state->sliders.empty() || !state->controls.empty();
  if (!has_timer_consumer) {
    if (state->progress_timer) lv_timer_pause(state->progress_timer);
    return;
  }
  if (!state->progress_timer) {
    state->progress_timer = lv_timer_create(media_playback_progress_timer_cb, 1000, state);
  }
  if (!state->progress_timer) return;
  if (state->playing) lv_timer_resume(state->progress_timer);
  else lv_timer_pause(state->progress_timer);
}

inline bool media_playback_state_snapshot(const std::string &entity_id,
                                          bool &playing,
                                          float &duration,
                                          float &position) {
  MediaPlaybackState *state = media_playback_find_state(entity_id);
  if (!state || !state->has_duration) return false;
  playing = state->playing;
  duration = state->duration;
  position = state->has_position ? media_playback_current_position_seconds(state) : 0.0f;
  return duration > 0.0f;
}

inline bool media_playback_state_has_progress(const std::string &entity_id) {
  bool playing = false;
  float duration = 0.0f;
  float position = 0.0f;
  return media_playback_state_snapshot(entity_id, playing, duration, position);
}

inline std::string media_control_title_text(MediaControlCtx *ctx) {
  if (!ctx) return "--";
  const std::string title = espdesktop::media::normalize_media_display_text(ctx->title);
  if (!title.empty()) return title;
  return media_status_text(ctx->state_text);
}

inline std::string media_control_artist_text(MediaControlCtx *ctx) {
  if (!ctx) return "";
  const std::string artist = espdesktop::media::normalize_media_display_text(ctx->artist);
  if (!espdesktop::media::media_modal_artist_visible(
        ctx->cover_art_mode, ctx->state_text, !artist.empty())) {
    return "";
  }
  if (!artist.empty()) return artist;
  const std::string friendly_name = espdesktop::media::normalize_media_display_text(ctx->friendly_name);
  if (!friendly_name.empty()) return friendly_name;
  return espdesktop::media::normalize_media_display_text(ctx->label);
}

inline void media_control_ensure_display_text_cache(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx) return;
  if (ui.display_text_ctx == ctx && ui.display_text_valid) return;
  ui.display_text_ctx = ctx;
  ui.display_title = media_control_title_text(ctx);
  ui.display_artist = media_control_artist_text(ctx);
  ui.display_text_valid = true;
}

inline int media_control_volume_max_pct(MediaControlCtx *ctx) {
  if (!ctx) return 100;
  if (ctx->max_pct < 1) return 1;
  if (ctx->max_pct > 100) return 100;
  return ctx->max_pct;
}

inline int media_control_clamp_volume(MediaControlCtx *ctx, int pct) {
  pct = media_clamp_percent(pct);
  int max_pct = media_control_volume_max_pct(ctx);
  return pct > max_pct ? max_pct : pct;
}

inline bool media_control_volume_pending_active(MediaControlCtx *ctx) {
  return ctx && ctx->pending_until_ms != 0 &&
         (int32_t)(ctx->pending_until_ms - esphome::millis()) > 0;
}

inline float media_control_current_position_seconds(MediaControlCtx *ctx) {
  if (!ctx) return 0.0f;
  float seconds = ctx->position_seconds;
  if (ctx->playing && ctx->position_updated_ms > 0) {
    seconds += (esphome::millis() - ctx->position_updated_ms) / 1000.0f;
  }
  if (ctx->duration > 0.0f && seconds > ctx->duration) seconds = ctx->duration;
  if (seconds < 0.0f || !std::isfinite(seconds)) seconds = 0.0f;
  return seconds;
}

inline bool media_control_seek_pending_active(MediaControlCtx *ctx) {
  return ctx && ctx->seek_pending &&
         (esphome::millis() - ctx->seek_pending_ms) < MEDIA_SEEK_PENDING_TIMEOUT_MS;
}

inline bool media_control_track_position_reset_active(MediaControlCtx *ctx) {
  return ctx && ctx->track_position_reset_until_ms != 0 &&
         (int32_t)(ctx->track_position_reset_until_ms - esphome::millis()) > 0;
}

inline void media_control_reset_track_position(MediaControlCtx *ctx) {
  if (!ctx) return;
  uint32_t now = esphome::millis();
  ctx->seek_pending = false;
  ctx->track_position_reset_until_ms = now + MEDIA_SEEK_PENDING_TIMEOUT_MS;
  ctx->position_seconds = 0.0f;
  ctx->position_updated_at_known = false;
  ctx->position_updated_at_ms = 0;
  ctx->position_updated_ms = now;
  media_control_refresh_progress(ctx);
}

inline void media_control_refresh_play_icon(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx || !ui.play_icon_lbl) return;
  lv_label_set_display_text(ui.play_icon_lbl, ctx->playing ? find_icon("Pause") : find_icon("Play"));
}

inline void media_control_refresh_progress_time_label(MediaControlCtx *ctx, float seconds) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx || !ui.progress_time_lbl) return;
  char position_buf[16];
  media_format_time(seconds, position_buf, sizeof(position_buf));
  lv_label_set_display_text(ui.progress_time_lbl, position_buf);
}

inline lv_obj_t *media_control_create_progress_fill(lv_obj_t *slider, lv_color_t fill_color) {
  if (!slider) return nullptr;
  lv_obj_set_style_bg_opa(slider, LV_OPA_TRANSP, LV_PART_INDICATOR);
  lv_obj_t *fill = lv_obj_create(slider);
  if (!fill) return nullptr;
  lv_obj_set_size(fill, 0, 0);
  theme_set_content_background(fill);
  lv_obj_set_style_bg_color(fill, fill_color, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(fill, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(fill, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(fill, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(fill, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(fill, 0, LV_PART_MAIN);
  lv_obj_clear_flag(fill, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(fill, LV_OBJ_FLAG_SCROLLABLE);
  return fill;
}

inline lv_obj_t *media_control_create_progress_handle(lv_obj_t *slider) {
  if (!slider) return nullptr;
  lv_obj_t *handle = lv_obj_create(slider);
  if (!handle) return nullptr;
  lv_obj_set_size(handle, 0, 0);
  theme_set_primary_foreground_fill(handle);
  lv_obj_set_style_bg_color(handle, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(handle, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(handle, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(handle, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(handle, 0, LV_PART_MAIN);
  lv_obj_clear_flag(handle, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(handle, LV_OBJ_FLAG_SCROLLABLE);
  return handle;
}

inline lv_coord_t media_control_progress_handle_inset(lv_obj_t *slider) {
  if (!slider) return 18;
  lv_coord_t inset = lv_obj_get_style_radius(slider, LV_PART_MAIN) * 3 / 4;
  if (inset < 16) inset = 16;
  if (inset > 28) inset = 28;
  return inset;
}

inline lv_coord_t media_control_progress_handle_width(lv_obj_t *slider) {
  if (!slider) return 6;
  lv_coord_t width = lv_obj_get_width(slider);
  lv_coord_t handle_w = width / 70;
  if (handle_w < 5) handle_w = 5;
  if (handle_w > 8) handle_w = 8;
  return handle_w;
}

inline lv_coord_t media_control_progress_fill_width(lv_obj_t *slider, int pct) {
  if (!slider) return 0;
  lv_coord_t width = lv_obj_get_width(slider);
  if (width <= 0) return 0;
  lv_coord_t fill_w = (lv_coord_t)((int32_t) width * media_clamp_percent(pct) / 100);
  lv_coord_t min_handle_cap =
    media_control_progress_handle_inset(slider) * 2 + media_control_progress_handle_width(slider);
  if (fill_w < min_handle_cap) fill_w = min_handle_cap;
  if (fill_w > width) fill_w = width;
  return fill_w;
}

inline void media_control_update_progress_fill(lv_obj_t *slider, lv_obj_t *fill,
                                               lv_obj_t *handle, int pct,
                                               lv_color_t fill_color) {
  if (!slider || !fill) return;
  lv_coord_t width = lv_obj_get_width(slider);
  lv_coord_t height = lv_obj_get_height(slider);
  if (width <= 0 || height <= 0) return;
  pct = media_clamp_percent(pct);
  theme_set_content_background(fill);
  lv_obj_set_style_bg_color(fill, fill_color, LV_PART_MAIN);
  lv_coord_t fill_w = media_control_progress_fill_width(slider, pct);
  lv_obj_set_size(fill, fill_w, height);
  lv_obj_set_style_radius(fill, 0, LV_PART_MAIN);
  lv_obj_align(fill, LV_ALIGN_LEFT_MID, 0, 0);
  lv_obj_move_foreground(fill);
  if (handle) lv_obj_move_foreground(handle);
}

inline void media_control_update_progress_handle(lv_obj_t *slider, lv_obj_t *handle, int pct) {
  if (!slider || !handle) return;
  lv_coord_t width = lv_obj_get_width(slider);
  lv_coord_t height = lv_obj_get_height(slider);
  if (width <= 0 || height <= 0) return;
  lv_coord_t handle_h = height * 3 / 5;
  if (handle_h < 20) handle_h = 20;
  if (handle_h > height - 12) handle_h = height - 12;
  if (handle_h < 8) handle_h = 8;
  lv_coord_t handle_w = media_control_progress_handle_width(slider);
  lv_coord_t inset = media_control_progress_handle_inset(slider);
  lv_coord_t fill_w = media_control_progress_fill_width(slider, pct);
  lv_coord_t x = fill_w - inset;
  if (x < inset) x = inset;
  if (x > width - inset - handle_w) x = width - inset - handle_w;
  if (x > width - handle_w) x = width - handle_w;
  lv_obj_set_size(handle, handle_w, handle_h);
  lv_obj_set_style_radius(handle, handle_w / 2, LV_PART_MAIN);
  lv_obj_align(handle, LV_ALIGN_LEFT_MID, x, 0);
  lv_obj_clear_flag(handle, LV_OBJ_FLAG_HIDDEN);
  lv_obj_move_foreground(handle);
}

inline void media_control_refresh_progress(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  float seconds = media_control_current_position_seconds(ctx);
  int pct = 0;
  if (ctx->duration > 0.0f) {
    pct = (int)((seconds * 100.0f / ctx->duration) + 0.5f);
  }
  pct = media_clamp_percent(pct);
  if (!ui.progress_slider) return;
  if (!ui.progress_layout_ready) {
    ui.progress_refresh_pending = true;
    return;
  }
  if (ui.progress_slider && !ctx->dragging_progress) {
    ui.updating_progress = true;
    lv_slider_set_value(ui.progress_slider, pct, LV_ANIM_OFF);
    ui.updating_progress = false;
  }
  media_control_update_progress_fill(
    ui.progress_slider, ui.progress_fill, ui.progress_handle, pct,
    lv_color_hex(ctx->accent_color));
  media_control_update_progress_handle(ui.progress_slider, ui.progress_handle, pct);
  media_control_refresh_progress_time_label(ctx, seconds);
  if (ui.progress_slider) {
    bool has_duration = ctx->duration > 0.0f && ctx->available;
    media_control_apply_availability(ui.progress_slider, ui.progress_slider, has_duration);
  }
  ui.progress_refresh_pending = false;
}

inline void media_control_refresh_volume_controls(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  int group_pct = 0;
  const bool grouped = media_control_group_size(ctx) > 1;
  const bool group_known = grouped && media_control_group_volume_percent(ctx, &group_pct);
  const bool arc_interactive = grouped ? group_known :
    espdesktop::media::volume_arc_interactive(ctx->volume_control_mode);
  if (ui.volume_arc) {
    if (arc_interactive) lv_obj_add_flag(ui.volume_arc, LV_OBJ_FLAG_CLICKABLE);
    else lv_obj_clear_flag(ui.volume_arc, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_bg_opa(
      ui.volume_arc,
      arc_interactive ? LV_OPA_COVER : LV_OPA_TRANSP,
      LV_PART_KNOB);
  }
  media_volume_set_button_enabled(
    ui.volume_minus_btn,
    grouped ? group_known && group_pct > 0 :
    espdesktop::media::volume_decrease_enabled(
      ctx->volume_control_mode, ctx->current_pct, ctx->volume_known));
  media_volume_set_button_enabled(
    ui.volume_plus_btn,
    grouped ? group_known && group_pct < media_control_volume_max_pct(ctx) :
    espdesktop::media::volume_increase_enabled(
      ctx->volume_control_mode, ctx->current_pct,
      media_control_volume_max_pct(ctx)));
}

inline void media_control_refresh_volume(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  const bool absolute = ctx->volume_control_mode ==
    espdesktop::media::VolumeControlMode::ABSOLUTE;
  const bool grouped = media_control_group_size(ctx) > 1;
  int group_pct = 0;
  const bool group_known = grouped && media_control_group_volume_percent(ctx, &group_pct);
  int pct = group_known ? group_pct :
    (absolute ? media_control_clamp_volume(ctx, ctx->current_pct)
              : media_clamp_percent(ctx->current_pct));
  if (ui.volume_group_lbl) {
    if (grouped) {
      lv_label_set_display_text(ui.volume_group_lbl, espdesktop_i18n("Group"));
      lv_obj_clear_flag(ui.volume_group_lbl, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(ui.volume_group_lbl, LV_OBJ_FLAG_HIDDEN);
    }
  }
  if (ui.volume_pct_lbl) {
    char buf[8];
    snprintf(buf, sizeof(buf), "%d", pct);
    lv_label_set_display_text(ui.volume_pct_lbl, buf);
  }
  if (ui.volume_arc && !ctx->dragging_volume) {
    ui.updating_volume = true;
    lv_arc_set_range(
      ui.volume_arc, 0, absolute ? media_control_volume_max_pct(ctx) : 100);
    lv_arc_set_value(ui.volume_arc, pct);
    ui.updating_volume = false;
  }
  media_control_refresh_volume_controls(ctx);
}

inline void media_control_refresh_power(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx || !ui.power_btn) return;
  const auto command = media_control_power_command(ctx);
  const bool interactive = command != espdesktop::media::PowerCommand::NONE;
  const bool on = command == espdesktop::media::PowerCommand::TURN_OFF;
  const uint32_t bg_color = on ? ctx->accent_color
                               : theme_display_color(current_theme().surface_primary);
  theme_set_content_background(ui.power_btn, on);
  lv_obj_set_style_bg_color(
    ui.power_btn, lv_color_hex(bg_color), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ui.power_btn, LV_OPA_COVER, LV_PART_MAIN);
  if (ui.power_icon_lbl) {
    lv_label_set_display_text(ui.power_icon_lbl, find_icon("Power"));
    lv_obj_set_style_text_color(
      ui.power_icon_lbl, lv_color_hex(on ? readable_text_color_for_bg(bg_color)
                                         : current_theme().text_primary), LV_PART_MAIN);
  }
  if (ui.power_status_lbl) {
    const std::string status = !interactive
      ? espdesktop_i18n(std::string("Unknown"))
      : (on ? espdesktop_i18n(std::string("On"))
            : espdesktop_i18n(std::string("Off")));
    lv_label_set_display_text(ui.power_status_lbl, status.c_str());
  }
  media_control_apply_availability(ui.power_btn, ui.power_btn, interactive);
}

inline void media_control_style_playback_mode_button(lv_obj_t *btn,
                                                      bool active,
                                                      bool interactive,
                                                      uint32_t accent_color) {
  if (!btn) return;
  theme_set_content_background(btn, active);
  const uint32_t bg_color = active ? accent_color
                                   : theme_display_color(current_theme().surface_primary);
  lv_obj_set_style_bg_color(
    btn, lv_color_hex(bg_color), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_t *label = lv_obj_get_child(btn, 0);
  if (label) {
    lv_obj_set_style_text_color(
      label, lv_color_hex(active ? readable_text_color_for_bg(bg_color)
                                 : current_theme().text_primary), LV_PART_MAIN);
  }
  media_control_apply_availability(btn, btn, interactive);
}

inline void media_control_refresh_playback_modes(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  if (ui.shuffle_btn) {
    const bool active = ctx->shuffle_known && ctx->shuffle_enabled;
    const bool interactive = ctx->available && ctx->shuffle_known &&
      media_control_shuffle_supported(ctx);
    media_control_style_playback_mode_button(
      ui.shuffle_btn, active, interactive, ctx->accent_color);
  }
  if (ui.repeat_btn) {
    const bool known =
      ctx->repeat_mode != espdesktop::media::RepeatMode::UNKNOWN;
    const bool active = known &&
      ctx->repeat_mode != espdesktop::media::RepeatMode::OFF;
    const bool interactive = ctx->available && known &&
      media_control_repeat_supported(ctx);
    if (ui.repeat_icon_lbl) {
      lv_label_set_display_text(
        ui.repeat_icon_lbl,
        find_icon(ctx->repeat_mode == espdesktop::media::RepeatMode::ONE
          ? "Repeat Once" : "Repeat"));
    }
    media_control_style_playback_mode_button(
      ui.repeat_btn, active, interactive, ctx->accent_color);
  }
}

inline void media_control_refresh_modal(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  media_control_ensure_display_text_cache(ctx);
  if (ui.title_lbl) lv_label_set_display_text(ui.title_lbl, ui.display_title.c_str());
  if (ui.artist_lbl) lv_label_set_display_text(ui.artist_lbl, ui.display_artist.c_str());
  media_control_refresh_play_icon(ctx);
  media_control_refresh_progress(ctx);
  media_control_refresh_volume(ctx);
  media_control_refresh_speakers(ctx);
  media_control_refresh_power(ctx);
  media_control_refresh_playback_modes(ctx);
}

inline void media_control_set_volume_value(MediaControlCtx *ctx, int pct) {
  if (!ctx) return;
  ctx->current_pct = ctx->volume_control_mode ==
      espdesktop::media::VolumeControlMode::ABSOLUTE
    ? media_control_clamp_volume(ctx, pct) : media_clamp_percent(pct);
  media_control_refresh_volume(ctx);
}

inline void media_control_apply_volume_percent(MediaControlCtx *ctx, int pct,
                                               bool from_user, bool send_action) {
  if (!ctx || !ctx->available) return;
  if (media_control_group_size(ctx) > 1) {
    media_control_apply_group_volume_percent(ctx, pct, send_action);
    return;
  }
  const int current_pct = media_clamp_percent(ctx->current_pct);
  const auto command = espdesktop::media::volume_command(
    ctx->volume_control_mode, current_pct, pct,
    media_control_volume_max_pct(ctx), ctx->volume_known);
  if (ctx->volume_control_mode !=
      espdesktop::media::VolumeControlMode::ABSOLUTE) {
    if (send_action) send_media_volume_command(ctx->entity_id, command);
    media_control_refresh_volume_controls(ctx);
    return;
  }
  pct = media_control_clamp_volume(ctx, pct);
  ctx->current_pct = pct;
  if (from_user) {
    ctx->volume_known = true;
    ctx->pending_pct = pct;
    ctx->pending_until_ms = esphome::millis() + 1500;
  }
  media_control_refresh_volume(ctx);
  media_control_refresh_parent_card(ctx);
  if (send_action) send_media_volume_command(ctx->entity_id, command);
}

inline void media_control_style_tab(lv_obj_t *btn, bool active) {
  if (!btn) return;
  control_modal_track_theme_tab(btn);
  lv_obj_set_style_bg_color(
    btn, lv_color_hex(active ? current_theme().text_primary : theme_display_color(current_theme().surface_primary)), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(btn, active ? LV_OPA_COVER : LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(btn, 0, LV_PART_MAIN);
  lv_obj_t *label = lv_obj_get_child(btn, 0);
  if (label) {
    lv_obj_set_style_text_color(
      label, lv_color_hex(active ? theme_display_color(current_theme().surface_secondary) : current_theme().text_primary), LV_PART_MAIN);
  }
}

inline void media_control_apply_tab_visibility() {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ui.active) return;
  const auto visible = media_control_visible_tabs(ui.active);
  if (ui.tab_row) {
    if (!ui.active->group_only && visible.count > 1) lv_obj_clear_flag(ui.tab_row, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(ui.tab_row, LV_OBJ_FLAG_HIDDEN);
  }
  const struct { lv_obj_t *btn; MediaControlTab tab; } buttons[] = {
    {ui.controls_tab, MediaControlTab::CONTROLS},
    {ui.progress_tab, MediaControlTab::PROGRESS},
    {ui.volume_tab, MediaControlTab::VOLUME},
    {ui.speakers_tab, MediaControlTab::SPEAKERS},
    {ui.power_tab, MediaControlTab::POWER},
  };
  for (const auto &button : buttons) {
    if (!button.btn) continue;
    if (visible.contains(button.tab)) lv_obj_clear_flag(button.btn, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(button.btn, LV_OBJ_FLAG_HIDDEN);
    media_control_style_tab(button.btn, button.tab == ui.tab);
  }
}

inline void media_control_layout_modal(MediaControlCtx *ctx);

inline lv_obj_t *media_control_create_tab_button(lv_obj_t *parent, const char *icon,
                                                 const lv_font_t *font,
                                                 MediaControlTab tab) {
  lv_obj_t *btn = control_modal_create_flat_icon_button(
    parent, icon, font, theme_display_color(current_theme().surface_primary), LV_OPA_TRANSP, 100, 180);
  if (!btn) return nullptr;
  light_control_center_icon_label(control_modal_icon_label(btn));
  bind_immediate_button_action(btn, [](lv_event_t *e) {
    MediaControlTab tab = static_cast<MediaControlTab>(
      reinterpret_cast<uintptr_t>(lv_event_get_user_data(e)));
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!media_control_visible_tabs(ui.active).contains(tab)) return;
    if (ui.tab == tab) return;
    if (ui.tab == MediaControlTab::SPEAKERS) {
      ui.speaker_generation++;
    }
    media_control_clear_tab_content();
    ui.tab = tab;
    media_control_ensure_tab_content(ui.active);
    media_control_apply_tab_visibility();
    media_control_layout_modal(ui.active);
  }, reinterpret_cast<void *>(static_cast<uintptr_t>(tab)));
  return btn;
}

inline bool media_control_ensure_progress_tab_button(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return false;
  if (ctx->group_only) return true;
  if (!ui.tab_row) return false;
  if (!media_control_progress_supported(ctx)) {
    if (ui.progress_tab) lv_obj_add_flag(ui.progress_tab, LV_OBJ_FLAG_HIDDEN);
    return true;
  }
  if (!ui.progress_tab) {
    ui.progress_tab = media_control_create_tab_button(
      ui.tab_row, find_icon("Progress Clock"), ctx->icon_font,
      MediaControlTab::PROGRESS);
  }
  if (!ui.progress_tab) return false;
  lv_obj_clear_flag(ui.progress_tab, LV_OBJ_FLAG_HIDDEN);
  return true;
}

inline bool media_control_ensure_speakers_tab_button(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return false;
  if (ctx->group_only) return true;
  bool supported = media_group_speaker_tab_available(
    ctx->grouping_supported, ctx->speaker_discovery_available,
    media_control_group_size(ctx) > 1);
  if (!supported) {
    if (ui.speakers_tab) lv_obj_add_flag(ui.speakers_tab, LV_OBJ_FLAG_HIDDEN);
    media_control_ensure_visible_tab(ctx);
    return true;
  }
  if (!ui.speakers_tab) {
    ui.speakers_tab = media_control_create_tab_button(
      ui.tab_row, find_icon("Speaker Multiple"), ctx->icon_font,
      MediaControlTab::SPEAKERS);
  }
  if (!ui.speakers_tab) return false;
  lv_obj_clear_flag(ui.speakers_tab, LV_OBJ_FLAG_HIDDEN);
  return true;
}

inline bool media_control_ensure_power_tab_button(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return false;
  if (ctx->group_only) return true;
  if (!ui.tab_row) return false;
  if (!media_control_power_supported(ctx)) {
    if (ui.power_tab) lv_obj_add_flag(ui.power_tab, LV_OBJ_FLAG_HIDDEN);
    return true;
  }
  if (!ui.power_tab) {
    ui.power_tab = media_control_create_tab_button(
      ui.tab_row, find_icon("Power"), ctx->icon_font,
      MediaControlTab::POWER);
  }
  if (!ui.power_tab) return false;
  lv_obj_clear_flag(ui.power_tab, LV_OBJ_FLAG_HIDDEN);
  return true;
}

inline lv_obj_t *media_control_create_icon_button(lv_obj_t *parent, const char *icon,
                                                  const lv_font_t *font,
                                                  uint32_t pressed_color,
                                                  int width_compensation_percent) {
  lv_obj_t *btn = control_modal_create_flat_icon_button(
    parent, icon, font, theme_display_color(current_theme().surface_primary), LV_OPA_COVER,
    width_compensation_percent);
  if (!btn) return nullptr;
  control_modal_apply_pressed_fill_color(btn, pressed_color);
  return btn;
}

inline void media_control_style_progress_slider(lv_obj_t *slider, uint32_t background_color,
                                                uint32_t tint_color) {
  if (!slider) return;
  lv_slider_set_range(slider, 0, 100);
  lv_obj_set_style_bg_color(slider, lv_color_hex(background_color), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(slider, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_bg_color(slider, lv_color_hex(tint_color), LV_PART_INDICATOR);
  lv_obj_set_style_bg_opa(slider, LV_OPA_COVER, LV_PART_INDICATOR);
  theme_set_content_foreground(slider);
  lv_obj_set_style_bg_color(slider, lv_color_hex(tint_color), LV_PART_KNOB);
  lv_obj_set_style_bg_opa(slider, LV_OPA_COVER, LV_PART_KNOB);
  lv_obj_set_style_border_width(slider, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(slider, 0, LV_PART_KNOB);
  lv_obj_set_style_shadow_width(slider, 0, LV_PART_KNOB);
  lv_obj_set_style_outline_width(slider, 0, LV_PART_KNOB);
  lv_obj_set_style_pad_all(slider, 0, LV_PART_KNOB);
  lv_obj_set_style_width(slider, 0, LV_PART_KNOB);
  lv_obj_set_style_height(slider, 0, LV_PART_KNOB);
}

inline void media_control_create_controls_tab_content(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.content_box || ui.title_lbl) return;

  ui.title_lbl = lv_label_create(ui.content_box);
  if (!ui.title_lbl) return;
  lv_obj_set_style_text_color(ui.title_lbl, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  lv_obj_set_style_text_align(ui.title_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_text_line_space(ui.title_lbl, 0, LV_PART_MAIN);
  if (ctx->title_font) lv_obj_set_style_text_font(ui.title_lbl, ctx->title_font, LV_PART_MAIN);
  lv_label_set_long_mode(ui.title_lbl, LV_LABEL_LONG_WRAP);
  apply_text_width_compensation(ui.title_lbl);

  ui.artist_lbl = lv_label_create(ui.content_box);
  if (ui.artist_lbl) {
    lv_obj_set_style_text_color(ui.artist_lbl, lv_color_hex(current_theme().text_muted), LV_PART_MAIN);
    lv_obj_set_style_text_align(ui.artist_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    if (ctx->label_font) lv_obj_set_style_text_font(ui.artist_lbl, ctx->label_font, LV_PART_MAIN);
    lv_label_set_long_mode(ui.artist_lbl, LV_LABEL_LONG_DOT);
    apply_text_width_compensation(ui.artist_lbl);
  }

  if (media_control_shuffle_supported(ctx)) {
    ui.shuffle_btn = media_control_create_icon_button(
      ui.content_box, find_icon("Shuffle"), ctx->icon_font, ctx->accent_color,
      ctx->width_compensation_percent);
  }
  ui.previous_btn = media_control_create_icon_button(
    ui.content_box, find_icon("Skip Previous"), ctx->icon_font, ctx->accent_color,
    ctx->width_compensation_percent);
  ui.play_btn = media_control_create_icon_button(
    ui.content_box, find_icon("Play"), ctx->icon_font, ctx->accent_color,
    ctx->width_compensation_percent);
  ui.play_icon_lbl = ui.play_btn ? lv_obj_get_child(ui.play_btn, 0) : nullptr;
  ui.next_btn = media_control_create_icon_button(
    ui.content_box, find_icon("Skip Next"), ctx->icon_font, ctx->accent_color,
    ctx->width_compensation_percent);
  if (media_control_repeat_supported(ctx)) {
    ui.repeat_btn = media_control_create_icon_button(
      ui.content_box, find_icon("Repeat"), ctx->icon_font, ctx->accent_color,
      ctx->width_compensation_percent);
    ui.repeat_icon_lbl = ui.repeat_btn ? lv_obj_get_child(ui.repeat_btn, 0) : nullptr;
  }
  if (ui.shuffle_btn) bind_immediate_button_action(ui.shuffle_btn, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!ui.active || !ui.active->available || !ui.active->shuffle_known ||
        !media_control_shuffle_supported(ui.active)) return;
    send_media_shuffle_action(
      ui.active->entity_id, !ui.active->shuffle_enabled);
  }, nullptr);
  if (ui.previous_btn) bind_immediate_button_action(ui.previous_btn, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active && ui.active->available) {
      media_control_reset_track_position(ui.active);
      send_media_playback_action(ui.active->entity_id, "previous");
    }
  }, nullptr);
  if (ui.play_btn) bind_immediate_button_action(ui.play_btn, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active && ui.active->available) send_media_playback_action(ui.active->entity_id, "play_pause");
  }, nullptr);
  if (ui.next_btn) bind_immediate_button_action(ui.next_btn, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active && ui.active->available) {
      media_control_reset_track_position(ui.active);
      send_media_playback_action(ui.active->entity_id, "next");
    }
  }, nullptr);
  if (ui.repeat_btn) bind_immediate_button_action(ui.repeat_btn, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!ui.active || !ui.active->available ||
        !media_control_repeat_supported(ui.active)) return;
    const auto next = espdesktop::media::next_repeat_mode(
      ui.active->repeat_mode);
    if (next == espdesktop::media::RepeatMode::UNKNOWN) return;
    send_media_repeat_action(ui.active->entity_id, next);
  }, nullptr);
}

inline void media_control_create_progress_tab_content(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.content_box || ui.progress_slider) return;

  ui.progress_slider = lv_slider_create(ui.content_box);
  if (!ui.progress_slider) return;
  ui.progress_layout_ready = false;
  ui.progress_refresh_pending = true;
  lv_obj_add_flag(ui.progress_slider, LV_OBJ_FLAG_HIDDEN);
  media_control_style_progress_slider(
    ui.progress_slider, theme_display_color(current_theme().surface_primary), ctx->accent_color);
  ui.progress_fill = media_control_create_progress_fill(
    ui.progress_slider, lv_color_hex(ctx->accent_color));
  ui.progress_handle = media_control_create_progress_handle(ui.progress_slider);
  if (ui.progress_fill) lv_obj_add_flag(ui.progress_fill, LV_OBJ_FLAG_HIDDEN);
  if (ui.progress_handle) lv_obj_add_flag(ui.progress_handle, LV_OBJ_FLAG_HIDDEN);
  ui.progress_time_lbl = lv_label_create(ui.content_box);
  if (ui.progress_time_lbl) {
    lv_obj_add_flag(ui.progress_time_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_label_set_display_text(ui.progress_time_lbl, "0:00");
    lv_obj_set_style_text_color(ui.progress_time_lbl, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
    lv_obj_set_style_text_align(ui.progress_time_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    if (ctx->title_font) lv_obj_set_style_text_font(ui.progress_time_lbl, ctx->title_font, LV_PART_MAIN);
    apply_text_width_compensation(ui.progress_time_lbl);
  }
  lv_obj_add_event_cb(ui.progress_slider, [](lv_event_t *e) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!ui.active || ui.updating_progress) return;
    if (!ui.progress_layout_ready) {
      ui.progress_refresh_pending = true;
      return;
    }
    if (ui.active) ui.active->dragging_progress = true;
    lv_obj_t *slider = static_cast<lv_obj_t *>(lv_event_get_target(e));
    int value = lv_slider_get_value(slider);
    media_control_update_progress_fill(
      slider, ui.progress_fill, ui.progress_handle, value,
      lv_color_hex(ui.active->accent_color));
    media_control_update_progress_handle(slider, ui.progress_handle, value);
    if (ui.active && ui.active->duration > 0.0f) {
      media_control_refresh_progress_time_label(
        ui.active, ui.active->duration * value / 100.0f);
    }
  }, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_add_event_cb(ui.progress_slider, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active) ui.active->dragging_progress = true;
  }, LV_EVENT_PRESSED, nullptr);
  lv_obj_add_event_cb(ui.progress_slider, [](lv_event_t *e) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!ui.active) return;
    ui.active->dragging_progress = false;
    if (!ui.active->available || ui.active->duration <= 0.0f) return;
    lv_obj_t *slider = static_cast<lv_obj_t *>(lv_event_get_target(e));
    int value = lv_slider_get_value(slider);
    ui.active->seek_pending = true;
    ui.active->seek_target_seconds = ui.active->duration * value / 100.0f;
    ui.active->seek_pending_ms = esphome::millis();
    ui.active->position_seconds = ui.active->seek_target_seconds;
    ui.active->position_updated_ms = ui.active->seek_pending_ms;
    media_control_refresh_progress(ui.active);
    send_media_seek_action(ui.active->entity_id, value, ui.active->duration);
  }, LV_EVENT_RELEASED, nullptr);
  lv_obj_add_event_cb(ui.progress_slider, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active) {
      ui.active->dragging_progress = false;
      media_control_refresh_progress(ui.active);
    }
  }, LV_EVENT_PRESS_LOST, nullptr);
}

inline void media_control_create_volume_tab_content(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.content_box || ui.volume_arc) return;
  if (!ui.speaker_action_timer) {
    ui.speaker_action_timer = lv_timer_create(media_control_speaker_action_timer_cb, 500, nullptr);
  }
  media_control_refresh_group_member_volumes(ctx);

  ui.volume_arc = lv_arc_create(ui.content_box);
  if (!ui.volume_arc) return;
  lv_arc_set_bg_angles(ui.volume_arc, 135, 45);
  const bool absolute = ctx->volume_control_mode ==
    espdesktop::media::VolumeControlMode::ABSOLUTE;
  lv_arc_set_range(
    ui.volume_arc, 0, absolute ? media_control_volume_max_pct(ctx) : 100);
  lv_arc_set_value(
    ui.volume_arc,
    absolute ? media_control_clamp_volume(ctx, ctx->current_pct)
             : media_clamp_percent(ctx->current_pct));
  lv_obj_set_style_bg_opa(ui.volume_arc, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.volume_arc, 0, LV_PART_MAIN);
  lv_obj_set_style_arc_color(ui.volume_arc, lv_color_hex(theme_display_color(current_theme().track_background)), LV_PART_MAIN);
  lv_obj_set_style_arc_color(ui.volume_arc, lv_color_hex(ctx->accent_color), LV_PART_INDICATOR);
  lv_obj_set_style_arc_rounded(ui.volume_arc, true, LV_PART_MAIN);
  lv_obj_set_style_arc_rounded(ui.volume_arc, true, LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(ui.volume_arc, lv_color_hex(current_theme().text_primary), LV_PART_KNOB);
  lv_obj_set_style_border_width(ui.volume_arc, 0, LV_PART_KNOB);
  lv_obj_set_style_shadow_width(ui.volume_arc, 0, LV_PART_KNOB);
  lv_obj_add_flag(ui.volume_arc, LV_OBJ_FLAG_ADV_HITTEST);
  lv_obj_add_event_cb(ui.volume_arc, [](lv_event_t *e) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!ui.active || ui.updating_volume) return;
    if (media_control_group_size(ui.active) < 2 &&
        !espdesktop::media::volume_arc_interactive(
          ui.active->volume_control_mode)) return;
    ui.active->dragging_volume = true;
    lv_obj_t *arc = static_cast<lv_obj_t *>(lv_event_get_target(e));
    const bool grouped = media_group_defer_volume_actions(
      media_control_group_size(ui.active));
    media_control_apply_volume_percent(
      ui.active, lv_arc_get_value(arc), true, !grouped);
  }, LV_EVENT_VALUE_CHANGED, nullptr);
  lv_obj_add_event_cb(ui.volume_arc, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active) ui.active->dragging_volume = true;
  }, LV_EVENT_PRESSED, nullptr);
  lv_obj_add_event_cb(ui.volume_arc, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (!ui.active) return;
    if (media_control_group_size(ui.active) > 1 && ui.volume_arc) {
      media_control_apply_volume_percent(
        ui.active, lv_arc_get_value(ui.volume_arc), true, true);
    }
    ui.active->dragging_volume = false;
    media_control_refresh_volume(ui.active);
  }, LV_EVENT_RELEASED, nullptr);
  lv_obj_add_event_cb(ui.volume_arc, [](lv_event_t *) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active) {
      ui.active->dragging_volume = false;
      media_control_refresh_volume(ui.active);
    }
  }, LV_EVENT_PRESS_LOST, nullptr);

  ui.volume_group_lbl = lv_label_create(ui.content_box);
  if (ui.volume_group_lbl) {
    lv_label_set_display_text(ui.volume_group_lbl, espdesktop_i18n("Group"));
    lv_obj_set_style_text_color(ui.volume_group_lbl, lv_color_hex(current_theme().text_muted), LV_PART_MAIN);
    lv_obj_set_style_text_align(ui.volume_group_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    if (ctx->label_font) lv_obj_set_style_text_font(ui.volume_group_lbl, ctx->label_font, LV_PART_MAIN);
    apply_text_width_compensation(ui.volume_group_lbl);
    lv_obj_add_flag(ui.volume_group_lbl, LV_OBJ_FLAG_HIDDEN);
  }

  ui.volume_pct_lbl = lv_label_create(ui.content_box);
  if (ui.volume_pct_lbl) {
    lv_label_set_display_text(ui.volume_pct_lbl, "0");
    lv_obj_set_style_text_color(ui.volume_pct_lbl, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
    lv_obj_set_style_text_align(ui.volume_pct_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    if (ctx->number_font) lv_obj_set_style_text_font(ui.volume_pct_lbl, ctx->number_font, LV_PART_MAIN);
    apply_text_width_compensation(ui.volume_pct_lbl);
  }

  ui.volume_minus_btn = control_modal_create_round_button(
    ui.content_box, 56, find_icon("Minus"), ctx->icon_font,
    theme_display_color(current_theme().border), theme_display_color(current_theme().surface_primary), ctx->width_compensation_percent);
  ui.volume_plus_btn = control_modal_create_round_button(
    ui.content_box, 56, find_icon("Plus"), ctx->icon_font,
    theme_display_color(current_theme().border), theme_display_color(current_theme().surface_primary), ctx->width_compensation_percent);
  control_modal_apply_pressed_fill_color(ui.volume_minus_btn, ctx->accent_color);
  control_modal_apply_pressed_fill_color(ui.volume_plus_btn, ctx->accent_color);
  if (ui.volume_minus_btn) {
    bind_immediate_button_action(ui.volume_minus_btn, [](lv_event_t *) {
      MediaControlModalUi &ui = media_control_modal_ui();
      if (!ui.active) return;
      int pct = ui.active->current_pct;
      media_control_group_volume_percent(ui.active, &pct);
      media_control_apply_volume_percent(ui.active, pct - 1, true, true);
    }, nullptr);
  }
  if (ui.volume_plus_btn) {
    bind_immediate_button_action(ui.volume_plus_btn, [](lv_event_t *) {
      MediaControlModalUi &ui = media_control_modal_ui();
      if (!ui.active) return;
      int pct = ui.active->current_pct;
      media_control_group_volume_percent(ui.active, &pct);
      media_control_apply_volume_percent(ui.active, pct + 1, true, true);
    }, nullptr);
  }
  media_control_refresh_volume_controls(ctx);
}

inline MediaSpeakerRowState *media_control_find_speaker_row(const std::string &entity_id) {
  MediaControlModalUi &ui = media_control_modal_ui();
  for (MediaSpeakerRowState *row : ui.speaker_rows) {
    if (row && row->entity_id == entity_id) return row;
  }
  return nullptr;
}

inline void media_control_cancel_speaker_action(MediaSpeakerRowState *row,
                                                const char *reason) {
  if (!row || row->call_id == 0) return;
  uint32_t call_id = row->call_id;
  row->pending = false;
  row->call_id = 0;
  row->pending_until_ms = 0;
  ha_cancel_action_response_callback(call_id, reason);
}

inline bool media_control_group_contains(MediaControlCtx *ctx, const std::string &entity_id) {
  if (!ctx) return false;
  if (entity_id == ctx->entity_id) return true;
  return std::find(ctx->group_members.begin(), ctx->group_members.end(), entity_id) !=
    ctx->group_members.end();
}

inline size_t media_control_group_size(MediaControlCtx *ctx) {
  if (!ctx) return 0;
  std::vector<std::string> current;
  media_group_append_unique(current, ctx->entity_id);
  for (const std::string &member : ctx->group_members) media_group_append_unique(current, member);
  return current.size();
}

inline void media_control_set_speaker_status(const char *text, bool error = false,
                                             bool show = false) {
  MediaControlModalUi &ui = media_control_modal_ui();
  ui.speaker_status_error = error;
  if (!ui.speakers_status_lbl) return;
  if (!error && !show) {
    lv_obj_add_flag(ui.speakers_status_lbl, LV_OBJ_FLAG_HIDDEN);
    return;
  }
  lv_obj_clear_flag(ui.speakers_status_lbl, LV_OBJ_FLAG_HIDDEN);
  lv_label_set_display_text(ui.speakers_status_lbl, text ? text : "");
  lv_obj_set_style_text_color(
    ui.speakers_status_lbl,
    lv_color_hex(error ? 0xFF6B6B : current_theme().text_muted), LV_PART_MAIN);
}

inline std::string media_control_speaker_fallback_name(const std::string &entity_id) {
  size_t dot = entity_id.find('.');
  std::string name = dot == std::string::npos ? entity_id : entity_id.substr(dot + 1);
  for (char &ch : name) if (ch == '_') ch = ' ';
  return sentence_cap_text(name);
}

inline bool media_control_speaker_row_shows_volume(MediaControlCtx *ctx,
                                                   MediaSpeakerRowState *row) {
  if (!ctx || !row || !row->selected) return false;
  return media_control_group_size(ctx) > 1 || row->entity_id == ctx->entity_id;
}

inline lv_coord_t media_control_speaker_row_height(MediaControlCtx *ctx,
                                                   MediaSpeakerRowState *row,
                                                   lv_coord_t short_side) {
  lv_coord_t height = control_modal_scaled_px(80, short_side);
  const lv_coord_t minimum = 76;
  if (height < minimum) height = minimum;

  // Selected speakers show both their name and volume. On compact portrait
  // panels, those two text lines plus the row padding need more room than the
  // historical fixed-height card allowed, which made the lines overlap.
  if (!media_control_speaker_row_shows_volume(ctx, row)) return height;
  const lv_font_t *label_font = ctx ? ctx->label_font : nullptr;
  const lv_coord_t text_line_h = label_font && label_font->line_height > 0
    ? label_font->line_height : 24;
  const lv_coord_t vertical_padding = control_modal_scaled_px(12, short_side);
  const lv_coord_t text_height = text_line_h * 2 + vertical_padding * 2;
  return text_height > height ? text_height : height;
}

inline void media_control_refresh_speaker_row(MediaControlCtx *ctx,
                                              MediaSpeakerRowState *row) {
  if (!ctx || !row) return;
  if (!row->pending) row->selected = media_control_group_contains(ctx, row->entity_id);
  const bool show_volume = media_control_speaker_row_shows_volume(ctx, row);
  const bool visible = true;
  const uint32_t bg_color = row->selected ? ctx->accent_color : theme_display_color(current_theme().surface_primary);
  const uint32_t text_color = row->selected ? readable_text_color_for_bg(bg_color)
                                            : current_theme().text_primary;
  if (row->row) {
    if (visible) lv_obj_clear_flag(row->row, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(row->row, LV_OBJ_FLAG_HIDDEN);
    theme_set_content_background(row->row, row->selected);
    lv_obj_set_style_bg_color(row->row, lv_color_hex(bg_color), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(row->row, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_width(row->row, 0, LV_PART_MAIN);
    const bool clickable = row->available && !row->pending &&
      (!row->selected || row->entity_id != ctx->entity_id);
    if (clickable) lv_obj_add_flag(row->row, LV_OBJ_FLAG_CLICKABLE);
    else lv_obj_clear_flag(row->row, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_style_opa(row->row, row->available ? LV_OPA_COVER : LV_OPA_50, LV_PART_MAIN);
    if (media_control_modal_ui().active == ctx) {
      ControlModalLayout layout = control_modal_calc_layout(ctx->width_compensation_percent);
      const lv_coord_t height = media_control_speaker_row_height(ctx, row, layout.short_side);
      if (lv_obj_get_height(row->row) != height) lv_obj_set_height(row->row, height);
    }
  }
  if (row->name_label) {
    std::string name = row->friendly_name.empty()
      ? media_control_speaker_fallback_name(row->entity_id) : row->friendly_name;
    lv_label_set_display_text(row->name_label, name.c_str());
    lv_obj_set_style_text_color(row->name_label, lv_color_hex(text_color), LV_PART_MAIN);
#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL
    lv_obj_set_style_translate_y(
      row->name_label,
      show_volume ? -(lv_obj_get_height(row->name_label) / 2) : 0,
      LV_PART_MAIN);
#endif
  }
  if (row->speaker_icon) {
    lv_label_set_display_text(
      row->speaker_icon,
      find_icon(row->selected ? "Speaker Wireless" : "Speaker Off"));
    lv_obj_clear_flag(row->speaker_icon, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_text_color(row->speaker_icon, lv_color_hex(text_color), LV_PART_MAIN);
  }
  if (row->volume_controls) {
    if (show_volume) lv_obj_clear_flag(row->volume_controls, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(row->volume_controls, LV_OBJ_FLAG_HIDDEN);
  }
#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL
  // Compact rows place the volume buttons directly on the card instead of in
  // a nested container, so their visibility is managed individually.
  if (row->volume_minus_btn) {
    if (show_volume) lv_obj_clear_flag(row->volume_minus_btn, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(row->volume_minus_btn, LV_OBJ_FLAG_HIDDEN);
  }
  if (row->volume_plus_btn) {
    if (show_volume) lv_obj_clear_flag(row->volume_plus_btn, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(row->volume_plus_btn, LV_OBJ_FLAG_HIDDEN);
  }
#endif
  const bool volume_enabled = show_volume && row->available && row->volume_known;
  media_volume_set_button_enabled(row->volume_minus_btn, volume_enabled && row->volume_pct > 0);
  media_volume_set_button_enabled(
    row->volume_plus_btn,
    volume_enabled && row->volume_pct < media_control_volume_max_pct(ctx));
  if (row->volume_label) {
    if (show_volume) lv_obj_clear_flag(row->volume_label, LV_OBJ_FLAG_HIDDEN);
    else lv_obj_add_flag(row->volume_label, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_text_color(row->volume_label, lv_color_hex(text_color), LV_PART_MAIN);
    lv_obj_set_style_text_opa(
      row->volume_label, MEDIA_CONTROL_SPEAKER_VOLUME_TEXT_OPA, LV_PART_MAIN);
    char value[8];
    if (row->volume_known) snprintf(value, sizeof(value), "%d%%", row->volume_pct);
    else std::strncpy(value, "--", sizeof(value));
    value[sizeof(value) - 1] = '\0';
    lv_label_set_display_text(row->volume_label, value);
#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL
    lv_obj_set_style_translate_y(
      row->volume_label, lv_obj_get_height(row->volume_label) / 2, LV_PART_MAIN);
#endif
  }
}

inline void media_control_speaker_action_timer_cb(lv_timer_t *) {
  MediaControlModalUi &ui = media_control_modal_ui();
  MediaControlCtx *ctx = ui.active;
  if (!ctx) return;
  uint32_t now = esphome::millis();
  bool expired = false;
  for (MediaSpeakerRowState *row : ui.speaker_rows) {
    if (!row || !row->pending || row->pending_until_ms == 0 ||
        (int32_t)(now - row->pending_until_ms) < 0) {
      continue;
    }
    uint32_t call_id = row->call_id;
    row->pending = false;
    row->call_id = 0;
    row->pending_until_ms = 0;
    row->selected = media_control_group_contains(ctx, row->entity_id);
    if (call_id != 0) ha_cancel_action_response_callback(call_id, "grouping timeout");
    media_control_refresh_speaker_row(ctx, row);
    expired = true;
  }
  if (expired) {
    media_control_set_speaker_status(espdesktop_i18n("Grouping failed"), true);
    media_control_refresh_group_volume(ctx);
  }
  bool volume_expired = false;
  bool primary_target_expired = false;
  for (const MediaGroupVolumeState &member : ctx->group_volume_states) {
    if (member.pending_until_ms == 0 ||
        (int32_t)(now - member.pending_until_ms) < 0) continue;
    volume_expired = true;
    if (member.entity_id == ctx->entity_id) primary_target_expired = true;
  }
  const bool primary_edit_expired = ctx->pending_until_ms != 0 &&
    (int32_t)(now - ctx->pending_until_ms) >= 0;
  if (volume_expired || primary_edit_expired) {
    media_control_refresh_group_member_volumes(ctx);
    // A member that disappeared from discovery has no actual reading to
    // restore. Disable its volume instead of keeping an unconfirmed target.
    for (MediaGroupVolumeState &member : ctx->group_volume_states) {
      if (member.pending_until_ms == 0 ||
          (int32_t)(now - member.pending_until_ms) < 0) continue;
      member.pending_until_ms = 0;
      member.volume_known = false;
    }
    // The primary display has its own deadline. It can expire on the tick
    // after refreshing the group cache cleared the raw target, and must not
    // keep an unacknowledged level until another HA event happens to arrive.
    if ((primary_target_expired || primary_edit_expired) &&
        !media_control_volume_pending_active(ctx)) {
      ctx->pending_pct = -1;
      ctx->pending_until_ms = 0;
      ctx->volume_known = false;
      int actual_pct = 0;
      for (const MediaGroupVolumeState &member : ctx->group_volume_states) {
        if (member.entity_id != ctx->entity_id) continue;
        ctx->volume_known = member.volume_known;
        actual_pct = member.volume_pct;
        break;
      }
      if (ctx->volume_known) media_control_set_volume_value(ctx, actual_pct);
      media_control_refresh_parent_card(ctx);
    }
    media_control_refresh_speakers(ctx);
    media_control_refresh_group_volume(ctx);
  }
}

inline std::vector<MediaGroupVolumeState> media_control_current_group_volumes(
    MediaControlCtx *ctx) {
  std::vector<MediaGroupVolumeState> volumes;
  if (!ctx) return volumes;
  std::vector<std::string> current;
  media_group_append_unique(current, ctx->entity_id);
  for (const std::string &entity_id : ctx->group_members) media_group_append_unique(current, entity_id);
  for (const std::string &entity_id : current) {
    MediaGroupVolumeState state;
    state.entity_id = entity_id;
    for (const MediaGroupVolumeState &known : ctx->group_volume_states) {
      if (known.entity_id != entity_id) continue;
      state = known;
      break;
    }
    volumes.push_back(state);
  }
  return volumes;
}

inline void media_control_refresh_group_member_volumes(MediaControlCtx *ctx) {
  if (!ctx) return;
  // Reconsider the last actual primary reading even when no new HA event
  // arrives. Displayed/optimistic volume_known must not masquerade as an ack.
  if (ctx->reported_volume_known) {
    media_control_store_group_volume(
      ctx, ctx->entity_id, ctx->reported_volume_pct, true, ctx->available);
  }
  std::vector<std::string> members;
  media_group_append_unique(members, ctx->entity_id);
  for (const std::string &entity_id : ctx->group_members) {
    media_group_append_unique(members, entity_id);
  }
  ctx->group_volume_states.erase(
    std::remove_if(ctx->group_volume_states.begin(), ctx->group_volume_states.end(),
      [&members](const MediaGroupVolumeState &known) {
        return std::find(members.begin(), members.end(), known.entity_id) == members.end();
      }),
    ctx->group_volume_states.end());
  for (const MediaGroupDiscoveryItem &item : ctx->speaker_discovery) {
    // The primary player has its own live volume subscription. Discovery can
    // lag behind it or omit it entirely.
    if (item.entity_id == ctx->entity_id && ctx->reported_volume_known) continue;
    if (std::find(members.begin(), members.end(), item.entity_id) == members.end()) continue;
    // Discovery may fill in the primary volume, but only the direct player
    // state can decide whether that player is available.
    const bool available = item.entity_id == ctx->entity_id
      ? ctx->available : item.available;
    media_control_store_group_volume(
      ctx, item.entity_id, item.volume_pct, item.volume_known, available);
  }
}

inline bool media_control_group_volume_percent(MediaControlCtx *ctx, int *pct) {
  if (!ctx || !pct || media_control_group_size(ctx) < 2) return false;
  return media_group_mean_volume(media_control_current_group_volumes(ctx), pct);
}

inline void media_control_apply_group_volume_percent(MediaControlCtx *ctx, int pct,
                                                      bool send_action) {
  if (!ctx || media_control_group_size(ctx) < 2) return;
  std::vector<MediaGroupVolumeState> members = media_control_current_group_volumes(ctx);
  std::vector<int> volumes = media_group_delta_volumes(
    members, pct, media_control_volume_max_pct(ctx));
  if (volumes.size() != members.size()) return;
  if (!send_action) {
    MediaControlModalUi &ui = media_control_modal_ui();
    if (ui.active == ctx && ui.volume_pct_lbl) {
      char value[8];
      snprintf(value, sizeof(value), "%d", media_control_clamp_volume(ctx, pct));
      lv_label_set_display_text(ui.volume_pct_lbl, value);
    }
    return;
  }
  for (size_t i = 0; i < members.size(); i++) {
    if (!members[i].available) continue;
    if (send_action) send_media_volume_action(members[i].entity_id, volumes[i]);
    if (members[i].entity_id == ctx->entity_id) {
      ctx->current_pct = volumes[i];
      ctx->volume_known = true;
    }
    MediaSpeakerRowState *row = media_control_find_speaker_row(members[i].entity_id);
    if (row) {
      row->volume_pct = volumes[i];
      row->volume_known = true;
    }
    media_control_set_group_volume_target(
      ctx, members[i].entity_id, volumes[i], members[i].available);
  }
  media_control_refresh_speakers(ctx);
  media_control_refresh_volume(ctx);
}

inline void media_control_refresh_group_volume(MediaControlCtx *ctx) {
  if (!ctx || media_control_modal_ui().active != ctx) return;
  media_control_refresh_volume(ctx);
}

inline void media_control_group_action_result(
    MediaControlCtx *ctx, const std::string &entity_id, uint32_t call_id,
    const esphome::api::ActionResponse &response) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  MediaSpeakerRowState *row = media_control_find_speaker_row(entity_id);
  if (!row || row->call_id != call_id) return;
  row->pending = false;
  row->call_id = 0;
  row->pending_until_ms = 0;
  if (!response.is_success()) {
    row->selected = row->previous_selected;
    media_control_set_speaker_status(espdesktop_i18n("Grouping failed"), true);
    ESP_LOGW("media", "Speaker grouping failed for %s: %s", entity_id.c_str(),
             response.get_error_message().c_str());
  } else {
    if (row->selected) {
      media_group_append_unique(ctx->group_members, row->entity_id);
    } else {
      ctx->group_members.erase(
        std::remove(ctx->group_members.begin(), ctx->group_members.end(), row->entity_id),
        ctx->group_members.end());
    }
    media_control_set_speaker_status(espdesktop_i18n("Speakers updated"));
  }
  media_control_refresh_speaker_row(ctx, row);
  media_control_refresh_speakers(ctx);
  media_control_refresh_volume(ctx);
}

inline void media_control_toggle_speaker(MediaControlCtx *ctx,
                                         MediaSpeakerRowState *row,
                                         bool selected) {
  if (!ctx || !row || row->entity_id == ctx->entity_id || row->pending) return;
  row->previous_selected = media_control_group_contains(ctx, row->entity_id);
  row->selected = selected;
  row->pending = true;
  row->pending_until_ms = esphome::millis() + MEDIA_GROUP_ACTION_TIMEOUT_MS;
  media_control_set_speaker_status(nullptr);
  media_control_refresh_speaker_row(ctx, row);
  auto call_id = std::make_shared<uint32_t>(0);
  auto callback = [ctx, entity_id = row->entity_id, call_id](
      const esphome::api::ActionResponse &response) {
    media_control_group_action_result(ctx, entity_id, *call_id, response);
  };
  bool sent = false;
  if (selected) {
    std::vector<std::string> selected_members;
    media_group_append_unique(selected_members, ctx->entity_id);
    for (MediaSpeakerRowState *candidate : media_control_modal_ui().speaker_rows) {
      if (candidate && candidate->selected) media_group_append_unique(selected_members, candidate->entity_id);
    }
    sent = send_media_group_join_action(ctx->entity_id, selected_members, callback, call_id.get());
  } else {
    sent = send_media_group_unjoin_action(row->entity_id, callback, call_id.get());
  }
  row->call_id = *call_id;
  if (!sent) {
    row->pending = false;
    row->pending_until_ms = 0;
    row->selected = row->previous_selected;
    media_control_set_speaker_status(espdesktop_i18n("Grouping failed"), true);
    media_control_refresh_speaker_row(ctx, row);
  }
}

inline lv_obj_t *media_control_create_speaker_volume_button(
    MediaControlCtx *ctx, MediaSpeakerRowState *row, lv_obj_t *parent,
    lv_coord_t size, const char *icon, bool increase) {
  if (!ctx || !row || !parent) return nullptr;
  lv_obj_t *btn = lv_btn_create(parent);
  // Volume taps belong to this control, not the surrounding membership row.
  lv_obj_clear_flag(btn, LV_OBJ_FLAG_EVENT_BUBBLE);
  lv_obj_set_size(btn, size, size);
  lv_obj_set_style_radius(btn, size / 2, LV_PART_MAIN);
  theme_set_primary_foreground_fill(btn);
  lv_obj_set_style_bg_color(btn, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(btn, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(btn, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(btn, 0, LV_PART_MAIN);
  control_modal_apply_pressed_fill(btn);
  lv_obj_t *label = lv_label_create(btn);
  lv_obj_clear_flag(label, LV_OBJ_FLAG_CLICKABLE);
  lv_label_set_display_text(label, icon);
  if (ctx->icon_font) lv_obj_set_style_text_font(label, ctx->icon_font, LV_PART_MAIN);
  theme_set_content_foreground(label);
  lv_obj_set_style_text_color(label, lv_color_hex(ctx->accent_color), LV_PART_MAIN);
  lv_obj_center(label);
  lv_obj_set_user_data(btn, row);
  lv_obj_add_event_cb(btn, [](lv_event_t *event) {
    // A child icon can be the original target of a bubbled event. Only the
    // button handling the callback owns a MediaSpeakerRowState pointer.
    lv_obj_t *button = static_cast<lv_obj_t *>(lv_event_get_current_target(event));
    MediaSpeakerRowState *row = static_cast<MediaSpeakerRowState *>(
      lv_obj_get_user_data(button));
    MediaControlModalUi &ui = media_control_modal_ui();
    MediaControlCtx *ctx = ui.active;
    if (!ctx || !row ||
        std::find(ui.speaker_rows.begin(), ui.speaker_rows.end(), row) ==
          ui.speaker_rows.end()) return;
    if (!row->available || !row->volume_known) return;
    const bool increase = reinterpret_cast<uintptr_t>(lv_event_get_user_data(event)) != 0;
    row->volume_pct = media_group_step_volume(
      row->volume_pct, increase, media_control_volume_max_pct(ctx));
    media_control_set_group_volume_target(
      ctx, row->entity_id, row->volume_pct, row->available);
    if (row->entity_id == ctx->entity_id) {
      // Match the direct subscription's display scale for acknowledgements.
      // The shared group cache above still retains the raw target.
      ctx->current_pct = ctx->volume_control_mode ==
          espdesktop::media::VolumeControlMode::ABSOLUTE
        ? media_control_clamp_volume(ctx, row->volume_pct)
        : row->volume_pct;
      ctx->pending_pct = ctx->current_pct;
      ctx->pending_until_ms = esphome::millis() + 1500;
    }
    send_media_volume_action(row->entity_id, row->volume_pct);
    media_control_refresh_speaker_row(ctx, row);
    media_control_refresh_group_volume(ctx);
  }, LV_EVENT_CLICKED, reinterpret_cast<void *>(static_cast<uintptr_t>(increase)));
  return btn;
}

inline bool media_control_speaker_event_from_volume_controls(
    MediaSpeakerRowState *row, lv_obj_t *target) {
  if (!row || !target) return false;
  for (lv_obj_t *obj = target; obj && obj != row->row; obj = lv_obj_get_parent(obj)) {
    if (obj == row->volume_controls ||
        obj == row->volume_minus_btn ||
        obj == row->volume_plus_btn) {
      return true;
    }
  }
  return false;
}

inline void media_control_add_speaker_candidate(MediaControlCtx *ctx,
                                                const std::string &entity_id) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.speaker_list || !media_group_valid_entity_id(entity_id) ||
      media_control_find_speaker_row(entity_id)) return;
  MediaSpeakerRowState *row = new MediaSpeakerRowState();
  row->entity_id = entity_id;
  row->selected = media_control_group_contains(ctx, entity_id);
  if (entity_id == ctx->entity_id) row->available = ctx->available;
  bool discovery_item_found = false;
  for (const MediaGroupDiscoveryItem &item : ctx->speaker_discovery) {
    if (item.entity_id != entity_id) continue;
    discovery_item_found = true;
    row->friendly_name = item.friendly_name;
    row->volume_pct = item.volume_pct;
    row->volume_known = item.volume_known;
    if (entity_id != ctx->entity_id) row->available = item.available;
    break;
  }
  const bool listed_by_helper =
    std::find(ctx->speaker_helper_members.begin(),
              ctx->speaker_helper_members.end(), entity_id) !=
      ctx->speaker_helper_members.end();
  if (!discovery_item_found && entity_id != ctx->entity_id &&
      (listed_by_helper || row->selected)) {
    row->available = true;
  }
  media_control_copy_group_volume_to_row(ctx, row);
  row->row = lv_btn_create(ui.speaker_list);
  lv_obj_set_size(row->row, lv_obj_get_width(ui.speaker_list), 118);
  lv_obj_set_style_radius(row->row, control_modal_card_radius(ctx->btn), LV_PART_MAIN);
  lv_obj_set_style_border_width(row->row, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(row->row, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(row->row, 0, LV_PART_MAIN);
  lv_obj_clear_flag(row->row, LV_OBJ_FLAG_SCROLLABLE);
  control_modal_apply_pressed_fill(row->row);
  lv_obj_set_user_data(row->row, row);
  lv_obj_add_event_cb(row->row, [](lv_event_t *event) {
    lv_obj_t *row_obj = static_cast<lv_obj_t *>(lv_event_get_current_target(event));
    MediaSpeakerRowState *row = static_cast<MediaSpeakerRowState *>(
      lv_obj_get_user_data(row_obj));
    // Decorative children can become the event target on some LVGL/device
    // combinations. Accept those taps as a row press, but keep the nested
    // volume controls from also changing group membership.
    if (media_control_speaker_event_from_volume_controls(
          row, static_cast<lv_obj_t *>(lv_event_get_target(event)))) return;
    MediaControlModalUi &ui = media_control_modal_ui();
    if (esphome::millis() - ui.speaker_last_scroll_ms < 250) return;
    MediaControlCtx *ctx = ui.active;
    if (!ctx || !row || !row->available || row->pending ||
        row->entity_id == ctx->entity_id) return;
    media_control_toggle_speaker(ctx, row, !row->selected);
  }, LV_EVENT_CLICKED, nullptr);

  ControlModalLayout speaker_layout = control_modal_calc_layout(ctx->width_compensation_percent);
#ifdef ESPDESKTOP_LOW_HEAP_MEDIA_CONTROL
  // Keep the original speaker-card design and controls on the S3 while making
  // its LVGL tree flat. This avoids three nested flex containers per row without
  // removing the icon, name, volume, or per-speaker volume buttons.
  const lv_coord_t compact_pad_x = control_modal_scaled_px(14, speaker_layout.short_side);
  const lv_coord_t compact_gap = control_modal_scaled_px(10, speaker_layout.short_side);

  row->speaker_icon = lv_label_create(row->row);
  lv_coord_t icon_column_w = control_modal_scaled_px(32, speaker_layout.short_side);
  if (icon_column_w < 32) icon_column_w = 32;
  lv_obj_set_width(row->speaker_icon, icon_column_w);
  lv_label_set_display_text(row->speaker_icon, find_icon("Speaker"));
  lv_obj_set_style_text_align(row->speaker_icon, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (ctx->icon_font) lv_obj_set_style_text_font(row->speaker_icon, ctx->icon_font, LV_PART_MAIN);
  apply_icon_width_compensation(
    row->speaker_icon, MEDIA_CONTROL_SPEAKER_ROW_ICON_ZOOM);
  lv_obj_align(row->speaker_icon, LV_ALIGN_LEFT_MID, compact_pad_x, 0);

  row->name_label = lv_label_create(row->row);
  lv_coord_t volume_button_size = control_modal_scaled_px(46, speaker_layout.short_side);
  if (volume_button_size < 46) volume_button_size = 46;
  lv_coord_t volume_button_gap = control_modal_scaled_px(7, speaker_layout.short_side);
  if (volume_button_gap < 7) volume_button_gap = 7;
  const lv_coord_t text_x = compact_pad_x + icon_column_w + compact_gap;
  lv_coord_t text_width = lv_obj_get_width(ui.speaker_list) - text_x - compact_pad_x -
    compact_gap - volume_button_size * 2 - volume_button_gap;
  if (text_width < 80) text_width = 80;
  lv_obj_set_width(row->name_label, text_width);
  lv_label_set_long_mode(row->name_label, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(row->name_label, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
  if (ctx->label_font) lv_obj_set_style_text_font(row->name_label, ctx->label_font, LV_PART_MAIN);
  const lv_coord_t speaker_text_h = ctx->label_font && ctx->label_font->line_height > 0
    ? ctx->label_font->line_height : 24;
  lv_obj_set_height(row->name_label, speaker_text_h);
  lv_obj_align(row->name_label, LV_ALIGN_LEFT_MID, text_x, 0);

  row->volume_label = lv_label_create(row->row);
  lv_obj_set_width(row->volume_label, text_width);
  lv_obj_set_height(row->volume_label, speaker_text_h);
  lv_obj_set_style_text_align(row->volume_label, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
  if (ctx->label_font) lv_obj_set_style_text_font(row->volume_label, ctx->label_font, LV_PART_MAIN);
  lv_obj_align(row->volume_label, LV_ALIGN_LEFT_MID, text_x, 0);

  row->volume_plus_btn = media_control_create_speaker_volume_button(
    ctx, row, row->row, volume_button_size, find_icon("Plus"), true);
  lv_obj_align(row->volume_plus_btn, LV_ALIGN_RIGHT_MID, -compact_pad_x, 0);
  row->volume_minus_btn = media_control_create_speaker_volume_button(
    ctx, row, row->row, volume_button_size, find_icon("Minus"), false);
  lv_obj_align(
    row->volume_minus_btn, LV_ALIGN_RIGHT_MID,
    -(compact_pad_x + volume_button_size + volume_button_gap), 0);
#else
  row->content_box = lv_obj_create(row->row);
  lv_obj_set_size(row->content_box, LV_PCT(100), LV_PCT(100));
  lv_obj_align(row->content_box, LV_ALIGN_CENTER, 0, 0);
  lv_obj_set_style_bg_opa(row->content_box, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(row->content_box, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(row->content_box, 0, LV_PART_MAIN);
  const lv_coord_t card_pad_y = control_modal_scaled_px(12, speaker_layout.short_side);
  const lv_coord_t card_pad_x = control_modal_scaled_px(18, speaker_layout.short_side);
  const lv_coord_t content_gap = control_modal_scaled_px(12, speaker_layout.short_side);
  lv_obj_set_style_pad_top(row->content_box, card_pad_y, LV_PART_MAIN);
  lv_obj_set_style_pad_left(row->content_box, card_pad_x, LV_PART_MAIN);
  lv_obj_set_style_pad_right(row->content_box, card_pad_x, LV_PART_MAIN);
  lv_obj_set_style_pad_bottom(row->content_box, card_pad_y, LV_PART_MAIN);
  lv_obj_set_style_pad_column(row->content_box, content_gap, LV_PART_MAIN);
  lv_obj_set_layout(row->content_box, LV_LAYOUT_FLEX);
  lv_obj_set_style_flex_flow(row->content_box, LV_FLEX_FLOW_ROW, LV_PART_MAIN);
  lv_obj_set_style_flex_main_place(row->content_box, LV_FLEX_ALIGN_START, LV_PART_MAIN);
  lv_obj_set_style_flex_cross_place(row->content_box, LV_FLEX_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_flex_track_place(row->content_box, LV_FLEX_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_clear_flag(row->content_box, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(row->content_box, LV_OBJ_FLAG_SCROLLABLE);

  row->speaker_icon = lv_label_create(row->content_box);
  lv_coord_t icon_column_w = control_modal_scaled_px(36, speaker_layout.short_side);
  if (icon_column_w < 36) icon_column_w = 36;
  lv_obj_set_width(row->speaker_icon, icon_column_w);
  lv_label_set_display_text(row->speaker_icon, find_icon("Speaker"));
  lv_obj_set_style_text_align(row->speaker_icon, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (ctx->icon_font) lv_obj_set_style_text_font(row->speaker_icon, ctx->icon_font, LV_PART_MAIN);
  apply_icon_width_compensation(
    row->speaker_icon, MEDIA_CONTROL_SPEAKER_ROW_ICON_ZOOM);

  row->text_box = lv_obj_create(row->content_box);
  lv_obj_set_size(row->text_box, 0, LV_SIZE_CONTENT);
  lv_obj_set_flex_grow(row->text_box, 1);
  lv_obj_set_style_bg_opa(row->text_box, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(row->text_box, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(row->text_box, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(row->text_box, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_row(row->text_box, 0, LV_PART_MAIN);
  lv_obj_set_layout(row->text_box, LV_LAYOUT_FLEX);
  lv_obj_set_style_flex_flow(row->text_box, LV_FLEX_FLOW_COLUMN, LV_PART_MAIN);
  lv_obj_set_style_flex_main_place(row->text_box, LV_FLEX_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_flex_cross_place(row->text_box, LV_FLEX_ALIGN_START, LV_PART_MAIN);
  lv_obj_clear_flag(row->text_box, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(row->text_box, LV_OBJ_FLAG_SCROLLABLE);

  row->name_label = lv_label_create(row->text_box);
  lv_obj_set_width(row->name_label, LV_PCT(100));
  const lv_coord_t speaker_text_h = ctx->label_font && ctx->label_font->line_height > 0
    ? ctx->label_font->line_height : 24;
  lv_obj_set_height(row->name_label, speaker_text_h);
  lv_label_set_long_mode(row->name_label, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(row->name_label, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
  lv_obj_set_style_text_color(row->name_label, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
  if (ctx->label_font) lv_obj_set_style_text_font(row->name_label, ctx->label_font, LV_PART_MAIN);

  row->volume_label = lv_label_create(row->text_box);
  lv_obj_set_width(row->volume_label, LV_PCT(100));
  lv_obj_set_height(row->volume_label, speaker_text_h);
  lv_obj_set_style_text_align(row->volume_label, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
  if (ctx->label_font) lv_obj_set_style_text_font(row->volume_label, ctx->label_font, LV_PART_MAIN);

  row->volume_controls = lv_obj_create(row->content_box);
  lv_coord_t volume_button_size = control_modal_scaled_px(46, speaker_layout.short_side);
  if (volume_button_size < 46) volume_button_size = 46;
  lv_coord_t volume_button_gap = control_modal_scaled_px(7, speaker_layout.short_side);
  if (volume_button_gap < 7) volume_button_gap = 7;
  lv_obj_set_size(
    row->volume_controls,
    volume_button_size * 2 + volume_button_gap,
    volume_button_size);
  lv_obj_set_style_radius(row->volume_controls, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(row->volume_controls, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(row->volume_controls, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(row->volume_controls, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(row->volume_controls, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_column(row->volume_controls, volume_button_gap, LV_PART_MAIN);
  lv_obj_set_layout(row->volume_controls, LV_LAYOUT_FLEX);
  lv_obj_set_style_flex_flow(row->volume_controls, LV_FLEX_FLOW_ROW, LV_PART_MAIN);
  lv_obj_set_style_flex_main_place(row->volume_controls, LV_FLEX_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_flex_cross_place(row->volume_controls, LV_FLEX_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_clear_flag(row->volume_controls, LV_OBJ_FLAG_SCROLLABLE);

  row->volume_minus_btn = media_control_create_speaker_volume_button(
    ctx, row, row->volume_controls, volume_button_size, find_icon("Minus"), false);
  row->volume_plus_btn = media_control_create_speaker_volume_button(
    ctx, row, row->volume_controls, volume_button_size, find_icon("Plus"), true);
#endif
  ui.speaker_rows.push_back(row);
  media_control_refresh_speaker_row(ctx, row);
  // Discovery already supplies the initial name and volume. Do not issue
  // cached Home Assistant reads while LVGL is still constructing the list:
  // those callbacks can run immediately and re-enter the partially-built UI.
  // The speakers-tab builder performs the first live refresh after the
  // complete list exists; the modal timer handles later refreshes.
}

inline void media_control_sync_speaker_candidates(
    MediaControlCtx *ctx, const std::vector<std::string> &candidates) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.speaker_list) return;
  for (auto it = ui.speaker_rows.begin(); it != ui.speaker_rows.end();) {
    MediaSpeakerRowState *row = *it;
    bool keep = row && std::find(candidates.begin(), candidates.end(), row->entity_id) !=
      candidates.end();
    if (keep) {
      ++it;
      continue;
    }
    if (row) {
      media_control_cancel_speaker_action(row, "speaker removed");
      if (row->row) lv_obj_del(row->row);
      delete row;
    }
    it = ui.speaker_rows.erase(it);
  }
  for (const std::string &entity_id : candidates) {
    media_control_add_speaker_candidate(ctx, entity_id);
  }
}

inline void media_control_refresh_speakers(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx || !ui.speakers_box) return;
  media_control_refresh_group_member_volumes(ctx);
  std::vector<std::string> candidates = media_group_merge_candidates(
    ctx->entity_id, ctx->speaker_helper_members, ctx->group_members);
  media_control_sync_speaker_candidates(ctx, candidates);
  for (MediaSpeakerRowState *row : ui.speaker_rows) {
    if (!row) continue;
    for (const MediaGroupDiscoveryItem &item : ctx->speaker_discovery) {
      if (item.entity_id != row->entity_id) continue;
      if (!item.friendly_name.empty()) row->friendly_name = item.friendly_name;
      row->volume_known = item.volume_known;
      if (item.volume_known) {
        row->volume_pct = item.volume_pct;
      }
      if (row->entity_id != ctx->entity_id) row->available = item.available;
      break;
    }
    media_control_copy_group_volume_to_row(ctx, row);
    media_control_refresh_speaker_row(ctx, row);
  }
  if (ui.speaker_rows.empty()) {
    media_control_set_speaker_status(espdesktop_i18n("No Speakers"), false, true);
  } else if (!ui.speaker_status_error) {
    media_control_set_speaker_status(nullptr);
  }
  media_control_refresh_group_volume(ctx);
}

inline void media_control_create_speakers_tab_content(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.content_box || ui.speakers_box) return;
#ifdef ESP_PLATFORM
  ESP_LOGI("media_group", "Opening speaker controls: candidates=%u internal_free=%u largest=%u",
           (unsigned) ctx->speaker_helper_members.size(),
           (unsigned) heap_caps_get_free_size(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL),
           (unsigned) heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL));
#endif
  ui.speakers_box = ui.content_box;
  lv_obj_set_flex_flow(ui.speakers_box, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_pad_row(ui.speakers_box, 8, LV_PART_MAIN);
  ui.speakers_status_lbl = lv_label_create(ui.speakers_box);
  lv_obj_set_width(ui.speakers_status_lbl, LV_PCT(100));
  lv_obj_set_style_text_align(ui.speakers_status_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_text_color(ui.speakers_status_lbl, lv_color_hex(current_theme().text_muted), LV_PART_MAIN);
  lv_obj_add_flag(ui.speakers_status_lbl, LV_OBJ_FLAG_HIDDEN);
  ui.speaker_list = lv_obj_create(ui.speakers_box);
  lv_obj_set_width(ui.speaker_list, LV_PCT(100));
  lv_obj_set_flex_grow(ui.speaker_list, 1);
  lv_obj_set_flex_flow(ui.speaker_list, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_style_flex_main_place(ui.speaker_list, LV_FLEX_ALIGN_START, LV_PART_MAIN);
  lv_obj_set_style_flex_cross_place(ui.speaker_list, LV_FLEX_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ui.speaker_list, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.speaker_list, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(ui.speaker_list, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_row(ui.speaker_list, 8, LV_PART_MAIN);
  lv_obj_set_style_pad_column(ui.speaker_list, 0, LV_PART_MAIN);
  lv_obj_add_flag(ui.speaker_list, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_scroll_dir(ui.speaker_list, LV_DIR_VER);
  lv_obj_set_scrollbar_mode(ui.speaker_list, LV_SCROLLBAR_MODE_OFF);
  lv_obj_add_event_cb(ui.speaker_list, [](lv_event_t *) {
    media_control_modal_ui().speaker_last_scroll_ms = esphome::millis();
  }, LV_EVENT_SCROLL, nullptr);
  ui.speaker_action_timer = lv_timer_create(media_control_speaker_action_timer_cb, 500, nullptr);

  // The flat S3 rows calculate the space left between the speaker icon and
  // volume buttons. Resolve the flex layout before creating those rows so the
  // calculation uses the real modal width instead of LVGL's initial 100 px
  // object width (which truncated names such as "Play Room" to "Play R...").
  lv_obj_update_layout(ui.speaker_list);
  media_control_refresh_speakers(ctx);
#ifdef ESP_PLATFORM
  ESP_LOGI("media_group", "Speaker controls ready: rows=%u internal_free=%u largest=%u",
           (unsigned) ui.speaker_rows.size(),
           (unsigned) heap_caps_get_free_size(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL),
           (unsigned) heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL));
#endif
}

inline void media_control_create_power_tab_content(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.content_box || ui.power_btn) return;

  ui.power_btn = media_control_create_icon_button(
    ui.content_box, find_icon("Power"), ctx->icon_font, ctx->accent_color,
    ctx->width_compensation_percent);
  ui.power_icon_lbl = ui.power_btn ? control_modal_icon_label(ui.power_btn) : nullptr;
  if (ui.power_btn) {
    bind_immediate_button_action(ui.power_btn, [](lv_event_t *) {
      MediaControlModalUi &ui = media_control_modal_ui();
      media_control_send_power_action(ui.active);
    }, nullptr);
  }

  ui.power_status_lbl = lv_label_create(ui.content_box);
  if (ui.power_status_lbl) {
    lv_label_set_display_text(ui.power_status_lbl, espdesktop_i18n("Unknown"));
    lv_obj_set_style_text_color(
      ui.power_status_lbl, lv_color_hex(current_theme().text_primary), LV_PART_MAIN);
    lv_obj_set_style_text_align(ui.power_status_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    if (ctx->label_font) {
      lv_obj_set_style_text_font(ui.power_status_lbl, ctx->label_font, LV_PART_MAIN);
    }
    apply_text_width_compensation(ui.power_status_lbl);
  }
  media_control_refresh_power(ctx);
}

inline void media_control_clear_tab_content() {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (ui.speaker_action_timer) {
    lv_timer_del(ui.speaker_action_timer);
    ui.speaker_action_timer = nullptr;
  }
  for (MediaSpeakerRowState *row : ui.speaker_rows) {
    media_control_cancel_speaker_action(row, "speaker view closed");
    delete row;
  }
  std::vector<MediaSpeakerRowState *>().swap(ui.speaker_rows);
  if (ui.content_box) {
    lv_obj_clean(ui.content_box);
    lv_obj_set_layout(ui.content_box, LV_LAYOUT_NONE);
    lv_obj_set_style_pad_row(ui.content_box, 0, LV_PART_MAIN);
  }
  ui.controls_box = nullptr;
  ui.progress_box = nullptr;
  ui.volume_box = nullptr;
  ui.title_lbl = nullptr;
  ui.artist_lbl = nullptr;
  ui.progress_slider = nullptr;
  ui.progress_fill = nullptr;
  ui.progress_handle = nullptr;
  ui.progress_time_lbl = nullptr;
  ui.shuffle_btn = nullptr;
  ui.previous_btn = nullptr;
  ui.play_btn = nullptr;
  ui.play_icon_lbl = nullptr;
  ui.next_btn = nullptr;
  ui.repeat_btn = nullptr;
  ui.repeat_icon_lbl = nullptr;
  ui.volume_arc = nullptr;
  ui.volume_group_lbl = nullptr;
  ui.volume_pct_lbl = nullptr;
  ui.volume_minus_btn = nullptr;
  ui.volume_plus_btn = nullptr;
  ui.speakers_box = nullptr;
  ui.speakers_status_lbl = nullptr;
  ui.speaker_status_error = false;
  ui.speaker_list = nullptr;
  ui.power_btn = nullptr;
  ui.power_icon_lbl = nullptr;
  ui.power_status_lbl = nullptr;
  ui.updating_progress = false;
  ui.updating_volume = false;
  ui.progress_layout_ready = false;
  ui.progress_refresh_pending = false;
  ui.speaker_last_scroll_ms = 0;
}

inline void media_control_ensure_tab_content(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || ui.active != ctx) return;
  media_control_ensure_visible_tab(ctx);
  if (ui.tab == MediaControlTab::CONTROLS) {
    ui.controls_box = ui.content_box;
    media_control_create_controls_tab_content(ctx);
  }
  else if (ui.tab == MediaControlTab::PROGRESS) {
    ui.progress_box = ui.content_box;
    media_control_create_progress_tab_content(ctx);
  }
  else if (ui.tab == MediaControlTab::VOLUME) {
    ui.volume_box = ui.content_box;
    media_control_create_volume_tab_content(ctx);
  }
  else if (ui.tab == MediaControlTab::SPEAKERS) {
    media_control_create_speakers_tab_content(ctx);
  }
  else if (ui.tab == MediaControlTab::POWER) {
    media_control_create_power_tab_content(ctx);
  }
}

inline void media_control_layout_modal(MediaControlCtx *ctx) {
  MediaControlModalUi &ui = media_control_modal_ui();
  if (!ctx || !ui.overlay || !ui.panel) return;
  if (!media_control_ensure_progress_tab_button(ctx)) return;
  if (!media_control_ensure_speakers_tab_button(ctx)) return;
  if (!media_control_ensure_power_tab_button(ctx)) return;
  media_control_ensure_tab_content(ctx);
  ControlModalLayout layout = control_modal_calc_layout(ctx->width_compensation_percent);
  control_modal_apply_panel_layout(ui.overlay, ui.panel, layout, control_modal_card_radius(ctx->btn));
  control_modal_apply_back_button_layout(ui.back_btn, layout);

  const auto visible_tabs = media_control_visible_tabs(ctx);
  ui.visible_tabs = visible_tabs;
  const bool show_tabs = !ctx->group_only && visible_tabs.count > 1;
  const int media_control_tab_count = show_tabs ? visible_tabs.count : 0;
  ControlModalTabLayout tabs_layout = {};
  if (show_tabs) {
    tabs_layout = control_modal_calc_tab_layout(layout, media_control_tab_count, true);
    control_modal_apply_tab_row(
      ui.tab_row, layout, tabs_layout, ctx->width_compensation_percent);
  }

  struct MediaControlTabLayout {
    lv_obj_t *btn;
    MediaControlTab tab;
  };
  MediaControlTabLayout tabs[5] = {};
  const int tab_count = visible_tabs.count;
  for (int i = 0; i < tab_count; ++i) {
    const auto tab = visible_tabs.tabs[i];
    lv_obj_t *btn = nullptr;
    switch (tab) {
      case MediaControlTab::CONTROLS: btn = ui.controls_tab; break;
      case MediaControlTab::PROGRESS: btn = ui.progress_tab; break;
      case MediaControlTab::VOLUME: btn = ui.volume_tab; break;
      case MediaControlTab::SPEAKERS: btn = ui.speakers_tab; break;
      case MediaControlTab::POWER: btn = ui.power_tab; break;
    }
    tabs[i] = {btn, tab};
    if (!show_tabs || !tabs[i].btn) continue;
    bool active = tabs[i].tab == ui.tab;
    control_modal_layout_tab_button(tabs[i].btn, layout, tabs_layout, i, active);
    if (tabs[i].tab == MediaControlTab::SPEAKERS) {
      lv_obj_t *label = control_modal_icon_label(tabs[i].btn);
      if (label) {
        lv_obj_set_style_transform_zoom(
          label,
          control_modal_tab_icon_zoom(layout) *
            MEDIA_CONTROL_SPEAKERS_TAB_ICON_SCALE_PERCENT / 100,
          LV_PART_MAIN);
        control_modal_center_tab_icon(label);
      }
    }
  }

  // Without a tab bar, keep content below the Back control. This also covers
  // a standalone Speaker Group or a popup with one visible tab.
  lv_coord_t content_safe_top = 0;
  if (!show_tabs) {
    content_safe_top = layout.back_inset_y + layout.back_size +
      control_modal_scaled_px(12, layout.short_side);
  }
  const espdesktop::modal::ContentLayout content = control_modal_calc_content_layout(
    layout, tabs_layout, show_tabs, 180, content_safe_top);
  lv_coord_t content_top = content.top;
  lv_coord_t content_w = content.width;
  lv_coord_t content_h = content.height;
  if (ui.content_box) {
    lv_obj_set_size(ui.content_box, content_w, content_h);
    lv_obj_align(ui.content_box, LV_ALIGN_TOP_MID, 0, content_top);
  }
  if (ui.speaker_list) {
    lv_coord_t row_gap = control_modal_scaled_px(layout.short_side < 520 ? 10 : 12,
      layout.short_side);
    if (row_gap < 8) row_gap = 8;
    lv_obj_set_style_pad_row(ui.speaker_list, row_gap, LV_PART_MAIN);
    lv_obj_set_style_pad_column(ui.speaker_list, 0, LV_PART_MAIN);
    for (MediaSpeakerRowState *row : ui.speaker_rows) {
      if (!row || !row->row) continue;
      lv_obj_set_size(
        row->row, content_w,
        media_control_speaker_row_height(ctx, row, layout.short_side));
      lv_obj_set_style_radius(row->row, control_modal_card_radius(ctx->btn), LV_PART_MAIN);
    }
  }
  if (ui.title_lbl) {
    media_control_ensure_display_text_cache(ctx);
    lv_label_set_display_text(ui.title_lbl, ui.display_title.c_str());
  }
  if (ui.artist_lbl) {
    media_control_ensure_display_text_cache(ctx);
    lv_label_set_display_text(ui.artist_lbl, ui.display_artist.c_str());
  }
  const lv_font_t *title_font = ctx->title_font
    ? ctx->title_font
    : (ui.title_lbl ? lv_obj_get_style_text_font(ui.title_lbl, LV_PART_MAIN) : nullptr);
  const lv_font_t *artist_font = ctx->label_font
    ? ctx->label_font
    : (ui.artist_lbl ? lv_obj_get_style_text_font(ui.artist_lbl, LV_PART_MAIN) : nullptr);
  lv_coord_t title_line_h = title_font && title_font->line_height > 0
    ? title_font->line_height : control_modal_scaled_px(28, layout.short_side);
  lv_coord_t artist_h = artist_font && artist_font->line_height > 0
    ? artist_font->line_height : control_modal_scaled_px(24, layout.short_side);
  lv_coord_t title_h = title_line_h;
  lv_coord_t title_max_h = title_line_h * 2;
  lv_coord_t text_w = content_w * 92 / 100;
  lv_coord_t text_gap = control_modal_scaled_px(8, layout.short_side);
  if (text_gap < 6) text_gap = 6;
  int transport_button_scale_percent = 100;
  if (control_modal_uses_large_landscape_tuning(layout)) {
    transport_button_scale_percent = 77;
  }
  const espdesktop::media::MediaTransportLayout transport_layout =
    espdesktop::media::media_transport_layout(
      content_w, layout.short_side,
      media_control_shuffle_supported(ctx),
      media_control_repeat_supported(ctx),
      control_modal_uses_compact_portrait_tuning(layout) && layout.sh > layout.sw,
      transport_button_scale_percent);
  const lv_coord_t btn_size = transport_layout.button_size;
  lv_coord_t progress_slider_h = content_h * 42 / 100;
  lv_coord_t progress_slider_max_h = control_modal_scaled_px(144, layout.short_side);
  if (progress_slider_h > progress_slider_max_h) progress_slider_h = progress_slider_max_h;
  if (progress_slider_h < 74) progress_slider_h = 74;
  lv_coord_t progress_slider_w = content_w * 84 / 100;
  lv_coord_t progress_slider_min_w = control_modal_scaled_px(180, layout.short_side);
  if (progress_slider_w < progress_slider_min_w) progress_slider_w = progress_slider_min_w;
  if (progress_slider_w > content_w) progress_slider_w = content_w;
  lv_coord_t progress_slider_y = content_h / 2 - progress_slider_h / 2;
  progress_slider_y += control_modal_scaled_px(22, layout.short_side);
  if (progress_slider_y > content_h - progress_slider_h) progress_slider_y = content_h - progress_slider_h;
  lv_coord_t progress_radius = progress_slider_h / 5;
  if (progress_radius < 18) progress_radius = 18;
  if (progress_radius > 34) progress_radius = 34;
  lv_coord_t controls_bottom_gap = control_modal_scaled_px(10, layout.short_side);
  if (controls_bottom_gap < 6) controls_bottom_gap = 6;
  lv_coord_t button_y = content_h - transport_layout.total_height - controls_bottom_gap;
  if (ui.title_lbl) {
    const char *title_text = lv_label_get_text(ui.title_lbl);
    lv_point_t title_size;
    lv_text_get_size(&title_size, title_text ? title_text : "", title_font, 0, 0,
      text_w, LV_TEXT_FLAG_NONE);
    if (title_size.y > title_h) title_h = title_size.y;
    if (title_h > title_max_h) title_h = title_max_h;
  }
  lv_coord_t text_block_h = title_h + text_gap + artist_h;
  lv_coord_t button_clearance = control_modal_scaled_px(12, layout.short_side);
  if (button_clearance < 8) button_clearance = 8;
  lv_coord_t max_text_top = button_y - button_clearance - text_block_h;
  lv_coord_t available_text_h = button_y - button_clearance;
  if (available_text_h < text_block_h) available_text_h = text_block_h;
  lv_coord_t text_top = (available_text_h - text_block_h) / 2;
  lv_coord_t min_text_top = control_modal_scaled_px(4, layout.short_side);
  if (max_text_top < min_text_top) min_text_top = max_text_top > 0 ? max_text_top : 0;
  if (text_top > max_text_top) text_top = max_text_top;
  if (text_top < min_text_top) text_top = min_text_top;
  if (ui.title_lbl) {
    lv_obj_set_size(ui.title_lbl, text_w, title_h);
    lv_obj_align(ui.title_lbl, LV_ALIGN_TOP_MID, 0, text_top);
  }
  if (ui.artist_lbl) {
    lv_obj_set_size(ui.artist_lbl, text_w, artist_h);
    lv_obj_align(ui.artist_lbl, LV_ALIGN_TOP_MID, 0, text_top + title_h + text_gap);
  }
  if (ui.progress_box && ui.progress_slider) {
    ui.progress_layout_ready = false;
    lv_obj_set_size(ui.progress_slider, progress_slider_w, progress_slider_h);
    lv_obj_set_style_radius(ui.progress_slider, progress_radius, LV_PART_MAIN);
    lv_obj_set_style_radius(ui.progress_slider, 0, LV_PART_INDICATOR);
    lv_obj_set_style_clip_corner(ui.progress_slider, true, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(ui.progress_slider, LV_OPA_TRANSP, LV_PART_KNOB);
    lv_obj_set_style_width(ui.progress_slider, 0, LV_PART_KNOB);
    lv_obj_set_style_height(ui.progress_slider, 0, LV_PART_KNOB);
    lv_obj_align(ui.progress_slider, LV_ALIGN_TOP_MID, 0, progress_slider_y);
    lv_obj_update_layout(ui.content_box);
    lv_obj_update_layout(ui.progress_slider);
    ui.progress_layout_ready = true;
    ui.progress_refresh_pending = true;
    media_control_refresh_progress(ctx);
    if (ui.progress_fill) lv_obj_clear_flag(ui.progress_fill, LV_OBJ_FLAG_HIDDEN);
    if (ui.progress_handle) lv_obj_clear_flag(ui.progress_handle, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(ui.progress_slider, LV_OBJ_FLAG_HIDDEN);
  }
  if (ui.progress_time_lbl) {
    lv_coord_t time_h = title_font && title_font->line_height > 0
      ? title_font->line_height : control_modal_scaled_px(28, layout.short_side);
    lv_coord_t time_gap = control_modal_scaled_px(12, layout.short_side);
    if (time_gap < 8) time_gap = 8;
    lv_coord_t time_y =
      progress_slider_y - time_gap - time_h;
    lv_coord_t max_time_y = content_h - time_h;
    if (time_y > max_time_y) time_y = max_time_y;
    if (time_y < 0) time_y = 0;
    lv_obj_set_size(ui.progress_time_lbl, text_w, time_h);
    lv_obj_align(ui.progress_time_lbl, LV_ALIGN_TOP_MID, 0, time_y);
    lv_obj_clear_flag(ui.progress_time_lbl, LV_OBJ_FLAG_HIDDEN);
  }
  lv_obj_t *buttons[5] = {
    ui.shuffle_btn, ui.previous_btn, ui.play_btn, ui.next_btn, ui.repeat_btn};
  auto layout_media_button = [btn_size](lv_obj_t *button, lv_coord_t x, lv_coord_t y) {
    if (!button) return;
    lv_obj_set_size(button, btn_size, btn_size);
    lv_obj_set_style_radius(button, btn_size / 2, LV_PART_MAIN);
    lv_obj_align(button, LV_ALIGN_TOP_LEFT, x, y);
    lv_obj_t *label = lv_obj_get_child(button, 0);
    if (label) {
      lv_obj_set_style_transform_zoom(label, 230, LV_PART_MAIN);
      light_control_center_icon_label(label);
    }
  };
  if (transport_layout.modes_on_second_row) {
    lv_obj_t *transport_buttons[3] = {ui.previous_btn, ui.play_btn, ui.next_btn};
    lv_coord_t button_x = transport_layout.first_row_start_x;
    for (lv_obj_t *button : transport_buttons) {
      layout_media_button(button, button_x, button_y);
      button_x += btn_size + transport_layout.gap;
    }
    lv_obj_t *mode_buttons[2] = {ui.shuffle_btn, ui.repeat_btn};
    button_x = transport_layout.second_row_start_x;
    const lv_coord_t mode_y = button_y + btn_size + transport_layout.row_gap;
    for (lv_obj_t *button : mode_buttons) {
      if (!button) continue;
      layout_media_button(button, button_x, mode_y);
      button_x += btn_size + transport_layout.gap;
    }
  } else {
    lv_coord_t button_x = transport_layout.first_row_start_x;
    for (lv_obj_t *button : buttons) {
      if (!button) continue;
      layout_media_button(button, button_x, button_y);
      button_x += btn_size + transport_layout.gap;
    }
  }

  if (ui.volume_arc) {
    ControlModalLayout volume_layout = layout;
    volume_layout.panel_w = content_w;
    volume_layout.panel_h = content_h;
    volume_layout.arc_size = content_w < content_h ? content_w : content_h;
    volume_layout.arc_size -= control_modal_scaled_px(4, layout.short_side);
    if (volume_layout.arc_size < 74) volume_layout.arc_size = 74;
    volume_layout.arc_center_x = 0;
    lv_coord_t volume_down = control_modal_scaled_px(16, layout.short_side);
    if (volume_down < 10) volume_down = 10;
    volume_layout.arc_center_y = volume_down;
    volume_layout.controls_center_y = volume_layout.arc_size / 2 -
      volume_layout.btn_size / 2 - volume_layout.inset +
      control_modal_controls_down_px(volume_layout) + volume_down;
    control_modal_apply_arc_layout(ui.volume_arc, volume_layout, ctx->width_compensation_percent);
    ControlModalLayout volume_buttons_layout = media_volume_step_button_layout(volume_layout);
    volume_buttons_layout.btn_size = volume_buttons_layout.btn_size * 7 / 8;
    if (volume_buttons_layout.btn_size < control_modal_scaled_px(54, layout.short_side)) {
      volume_buttons_layout.btn_size = control_modal_scaled_px(54, layout.short_side);
    }
    volume_buttons_layout.controls_gap = control_modal_scaled_px(12, layout.short_side);
    lv_coord_t volume_buttons_up = control_modal_scaled_px(18, layout.short_side);
    if (volume_buttons_up < 12) volume_buttons_up = 12;
    volume_buttons_layout.controls_center_y -= volume_buttons_up;
    const bool compact_landscape =
      display_modal_uses_compact_landscape_controls(layout.profile);
    control_modal_apply_step_buttons_layout(
      ui.volume_minus_btn, ui.volume_plus_btn, volume_buttons_layout,
      compact_landscape, control_modal_scaled_px(4, layout.short_side), 256);
    if (ui.volume_pct_lbl) {
      const lv_font_t *number_font = display_modal_volume_number_font(ctx->number_font);
      if (number_font) {
        lv_obj_set_style_text_font(ui.volume_pct_lbl, number_font, LV_PART_MAIN);
      }
      apply_text_width_compensation(ui.volume_pct_lbl);
      lv_obj_align(ui.volume_pct_lbl, LV_ALIGN_CENTER, 0,
        (compact_landscape ? 0 : volume_layout.arc_center_y) +
        control_modal_scaled_px(MEDIA_CONTROL_VOLUME_VALUE_Y_REF_PX, volume_layout.short_side));
    }
    if (ui.volume_group_lbl && ui.volume_pct_lbl) {
      apply_text_width_compensation(ui.volume_group_lbl);
      lv_obj_align_to(ui.volume_group_lbl, ui.volume_pct_lbl,
        LV_ALIGN_OUT_TOP_MID, 0, -control_modal_scaled_px(4, volume_layout.short_side));
    }
    lv_obj_update_layout(ui.content_box);
  }

  if (ui.power_btn) {
    lv_coord_t power_size = content_h * 58 / 100;
    lv_coord_t max_power_size = control_modal_scaled_px(144, layout.short_side);
    if (power_size > max_power_size) power_size = max_power_size;
    if (power_size > content_w * 2 / 3) power_size = content_w * 2 / 3;
    if (power_size < 88) power_size = 88;
    lv_coord_t status_h = ctx->label_font && ctx->label_font->line_height > 0
      ? ctx->label_font->line_height
      : control_modal_scaled_px(24, layout.short_side);
    lv_coord_t status_gap = control_modal_scaled_px(12, layout.short_side);
    if (status_gap < 8) status_gap = 8;
    lv_coord_t total_h = power_size + status_gap + status_h;
    lv_coord_t power_top = (content_h - total_h) / 2;
    if (power_top < 0) power_top = 0;
    lv_obj_set_size(ui.power_btn, power_size, power_size);
    lv_obj_set_style_radius(ui.power_btn, power_size / 2, LV_PART_MAIN);
    lv_obj_align(ui.power_btn, LV_ALIGN_TOP_MID, 0, power_top);
    if (ui.power_icon_lbl) {
      lv_obj_set_style_transform_zoom(ui.power_icon_lbl, 260, LV_PART_MAIN);
      light_control_center_icon_label(ui.power_icon_lbl);
    }
    if (ui.power_status_lbl) {
      lv_obj_set_size(ui.power_status_lbl, content_w * 3 / 4, status_h);
      lv_obj_align(
        ui.power_status_lbl, LV_ALIGN_TOP_MID, 0,
        power_top + power_size + status_gap);
    }
  }

  media_control_apply_tab_visibility();
  media_control_refresh_modal(ctx);
  lv_obj_move_foreground(ui.back_btn);
}

inline void media_control_hide_modal() {
  MediaControlModalUi &ui = media_control_modal_ui();
  media_control_clear_tab_content();
  lv_obj_t *overlay = ui.overlay;
  ui = MediaControlModalUi();
  control_modal_delete_overlay(ControlModalKind::MEDIA_CONTROL, overlay);
}
