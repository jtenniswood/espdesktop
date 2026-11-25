"""Exercise production colour palettes, sensor backgrounds and state updates."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from production_source import definition

root = Path(__file__).resolve().parents[2]
headers = root / "components/espdesktop"
source = r'''
#include <cassert>
#include <cstdint>
#include <optional>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <functional>
#include <map>
#include <string>
#include <vector>
#define ESP_LOGD(...) ((void)0)
struct lv_obj_t;
void lv_label_set_text(lv_obj_t *, const char *);
#include "i18n_generated.h"
#include "button_grid_config_parser.h"
#include "companion_audio_control.h"
#define ESPDESKTOP_SUBPAGE_PARSER_ONLY
#include "button_grid_subpages.h"
#include "display_color.h"
#include "button_grid_style.h"
using lv_color_t = uint32_t;
using lv_style_selector_t = int;
constexpr int LV_PART_MAIN = 0, LV_STATE_DEFAULT = 0, LV_STATE_CHECKED = 1, LV_STATE_PRESSED = 2;
constexpr int LV_EVENT_ALL = 0, LV_EVENT_PRESSED = 3, LV_EVENT_RELEASED = 4, LV_EVENT_PRESS_LOST = 5;
constexpr int LV_OPA_COVER = 255, LV_OPA_TRANSP = 0;
struct lv_event_t { lv_obj_t *target; int code; void *user_data = nullptr; void *param = nullptr; };
struct lv_area_t { int x1 = 0, y1 = 0, x2 = 39, y2 = 39; };
using lv_event_cb_t = void (*)(lv_event_t *);
struct lv_obj_t {
  uint32_t background[3] = {}, text[3] = {}, gradient[3] = {}, border[3] = {}, outline[3] = {};
  int gradient_direction[3] = {};
  int state = 0;
  int slider_value = 0, slider_events = 0, y_offset = 0, layout_updates = 0;
  bool instant_feedback = false;
  int flags = 0;
  std::vector<lv_event_cb_t> events;
  std::vector<lv_obj_t *> children;
  std::string content;
  lv_area_t area;
  lv_obj_t *parent = nullptr;
};
struct BtnSlot { lv_obj_t *btn, *icon_lbl = nullptr, *text_lbl = nullptr, *sensor_container = nullptr, *subpage_lbl = nullptr; };
void lv_label_set_text(lv_obj_t *obj, const char *text) { obj->content = text; }
struct AlarmCardCtx { lv_obj_t *btn; uint32_t off_color; bool off_theme_owned = false; int theme_red_percent = 100, theme_green_percent = 100, theme_blue_percent = 100; };
struct DisplayProfile {
  struct { int red_percent = 100, green_percent = 100, blue_percent = 100; } color;
};
uint32_t lv_color_hex(uint32_t rgb) { return rgb; }
void theme_set_content_background(lv_obj_t *, bool) {}
uint32_t current_grid_sensor_surface_color() { return current_theme().surface_sensor; }
uint32_t current_grid_sensor_color() { return current_theme().surface_secondary; }
void lv_obj_set_style_bg_color(lv_obj_t *obj, uint32_t rgb, int selector) { obj->background[selector] = rgb; }
void lv_obj_set_style_text_color(lv_obj_t *obj, uint32_t rgb, int selector) { obj->text[selector] = rgb; }
constexpr int LV_GRAD_DIR_HOR = 1;
void lv_obj_set_style_bg_grad_color(lv_obj_t *obj, uint32_t rgb, int selector) { obj->gradient[selector] = rgb; }
void lv_obj_set_style_bg_grad_dir(lv_obj_t *obj, int direction, int selector) { obj->gradient_direction[selector] = direction; }
void lv_obj_set_style_bg_opa(lv_obj_t *, int, int) {}
void lv_obj_set_style_border_color(lv_obj_t *obj, uint32_t rgb, int selector) { obj->border[selector] = rgb; }
void lv_obj_set_style_outline_color(lv_obj_t *obj, uint32_t rgb, int selector) { obj->outline[selector] = rgb; }
void apply_instant_button_feedback(lv_obj_t *obj) { obj->instant_feedback = true; }
void lv_obj_set_style_border_width(lv_obj_t *, int, int) {}
void lv_obj_set_style_shadow_width(lv_obj_t *, int, int) {}
uint32_t lv_obj_get_style_text_color(lv_obj_t *obj, int) {
  return obj->text[(obj->state & LV_STATE_PRESSED) ? LV_STATE_PRESSED
    : ((obj->state & LV_STATE_CHECKED) ? LV_STATE_CHECKED : LV_STATE_DEFAULT)];
}
bool lv_obj_has_state(lv_obj_t *obj, int state) { return (obj->state & state) != 0; }
unsigned state_writes = 0;
void lv_obj_add_state(lv_obj_t *obj, int state) { ++state_writes; obj->state |= state; }
void lv_obj_clear_state(lv_obj_t *obj, int state) { ++state_writes; obj->state &= ~state; }
int lv_event_get_code(lv_event_t *event) { return event->code; }
lv_obj_t *lv_event_get_target(lv_event_t *event) { return event->target; }
void lv_obj_remove_event_cb_with_user_data(lv_obj_t *obj, lv_event_cb_t callback, void *) {
  auto &events = obj->events;
  events.erase(std::remove(events.begin(), events.end(), callback), events.end());
}
constexpr int LV_OBJ_FLAG_SEND_DRAW_TASK_EVENTS = 1 << 20;
constexpr int LV_EVENT_DRAW_TASK_ADDED = 20;
void lv_obj_remove_event_cb(lv_obj_t *obj, lv_event_cb_t callback) { lv_obj_remove_event_cb_with_user_data(obj, callback, nullptr); }
void lv_obj_add_event_cb(lv_obj_t *obj, lv_event_cb_t callback, int, void *) { obj->events.push_back(callback); }
using lv_event_dsc_t = lv_event_cb_t;
uint32_t lv_obj_get_event_count(lv_obj_t *obj) { return obj->events.size(); }
lv_event_dsc_t *lv_obj_get_event_dsc(lv_obj_t *obj, uint32_t i) { return &obj->events[i]; }
lv_event_cb_t lv_event_dsc_get_cb(lv_event_dsc_t *dsc) { return *dsc; }
void send_event(lv_obj_t *obj, int code) {
  lv_event_t event{obj, code};
  for (auto callback : obj->events) callback(&event);
}
inline void bind_card_text_contrast_events(lv_obj_t *);
std::map<std::string, std::function<void(esphome::StringRef)>> subscriptions;
void ha_subscribe_state(const std::string &entity, std::function<void(esphome::StringRef)> callback) {
  subscriptions[entity] = callback;
}
void subscribe_friendly_name(lv_obj_t *, const std::string &) {}
void lv_label_set_display_text(lv_obj_t *label, const char *text) { label->content = text; }
void set_wrapped_button_label_text(lv_obj_t *label, const std::string &text) { label->content = text; }
namespace espdesktop::cards {
const char *status_entity_driver_inactive_icon(const ParsedCfg &, const Context &) { return "off"; }
const char *status_entity_driver_active_icon(const ParsedCfg &, const Context &) { return "on"; }
}
struct ImageCardCtx { bool artwork_visible = false; };
struct MediaNowPlayingCtx {
  lv_obj_t *btn, *icon_lbl, *idle_lbl, *title_lbl, *artist_lbl;
  ImageCardCtx *cover_art;
  bool cover_art_mode = true, custom_fallback_background = false;
  uint32_t fallback_background_color = 0;
};
bool image_card_media_artwork_visible(const ImageCardCtx *ctx) { return ctx && ctx->artwork_visible; }
constexpr int LV_STATE_DISABLED = 4, LV_OBJ_FLAG_HIDDEN = 1, LV_OBJ_FLAG_USER_2 = 1<<28;
void set_card_content_disabled(lv_obj_t *obj, bool disabled) {
  for (auto *child : obj->children) {
    if (disabled) lv_obj_add_state(child, LV_STATE_DISABLED);
    else lv_obj_clear_state(child, LV_STATE_DISABLED);
    set_card_content_disabled(child, disabled);
  }
}
void set_card_disabled_state(lv_obj_t *obj, bool disabled) {
  if (!obj) return;
  if (disabled) lv_obj_add_state(obj, LV_STATE_DISABLED);
  else lv_obj_clear_state(obj, LV_STATE_DISABLED);
}
bool lv_obj_has_flag(lv_obj_t *obj,int flag){return (obj->flags & flag)!=0;}
using lv_state_t = int;
using lv_coord_t = int;
void lv_obj_add_flag(lv_obj_t *obj, int flag) { obj->flags |= flag; }
void lv_obj_clear_flag(lv_obj_t *obj, int flag) { obj->flags &= ~flag; }
void lv_obj_set_user_data(lv_obj_t *, void *) {}
void lv_obj_set_style_pad_all(lv_obj_t *, int, int) {}
void lv_obj_set_style_radius(lv_obj_t *, int, int) {}
void lv_obj_del(lv_obj_t *) {}
void lv_obj_set_style_opa(lv_obj_t *, int, int) {}
void lv_obj_set_style_text_opa(lv_obj_t *, int, int) {}
int lv_obj_get_height(lv_obj_t *obj) { return obj->area.y2 - obj->area.y1 + 1; }
void lv_obj_set_height(lv_obj_t *, int) {}
struct MediaControlCtx {
  uint32_t accent_color;
  std::string entity_id = "media_player.primary";
  int width_compensation_percent = 100;
  bool selected = true;
};
struct MediaSpeakerRowState {
  std::string entity_id = "media_player.speaker", friendly_name = "Speaker";
  bool selected = false, pending = false, available = true, volume_known = true;
  int volume_pct = 50;
  lv_obj_t *row = nullptr, *name_label = nullptr, *speaker_icon = nullptr;
  lv_obj_t *volume_controls = nullptr, *volume_minus_btn = nullptr, *volume_plus_btn = nullptr, *volume_label = nullptr;
};
bool media_control_group_contains(MediaControlCtx *ctx, const std::string &) { return ctx->selected; }
bool media_control_speaker_row_shows_volume(MediaControlCtx *, MediaSpeakerRowState *) { return true; }
struct ControlModalLayout { int short_side = 480; };
struct TestMediaModal { MediaControlCtx *active = nullptr; };
TestMediaModal &media_control_modal_ui() { static TestMediaModal ui; return ui; }
ControlModalLayout control_modal_calc_layout(int) { return {}; }
int media_control_speaker_row_height(MediaControlCtx *, MediaSpeakerRowState *, int) { return 40; }
std::string media_control_speaker_fallback_name(const std::string &) { return "Speaker"; }
const char *find_icon(const char *name) { return name; }
void media_volume_set_button_enabled(lv_obj_t *, bool) {}
int media_control_volume_max_pct(MediaControlCtx *) { return 100; }
size_t lv_obj_get_child_cnt(lv_obj_t *obj) { return obj->children.size(); }
lv_obj_t *lv_obj_get_child(lv_obj_t *obj, size_t index) { return obj->children[index]; }
int lv_obj_get_width(lv_obj_t *obj) { return obj->area.x2 - obj->area.x1 + 1; }
lv_obj_t *lv_obj_get_parent(lv_obj_t *obj) { return obj->parent; }
void lv_obj_get_coords(lv_obj_t *obj, lv_area_t *area) { *area = obj->area; }
uint32_t lv_obj_get_style_bg_color(lv_obj_t *obj, int) { return obj->background[0]; }
uint32_t lv_color_to_int(uint32_t color) { return color; }
bool lv_color_eq(uint32_t a, uint32_t b) { return a == b; }
void *lv_event_get_user_data(lv_event_t *event) { return event->user_data; }
void *lv_event_get_param(lv_event_t *event) { return event->param; }
bool lv_area_intersect(lv_area_t *result, const lv_area_t *a, const lv_area_t *b) {
  *result = {std::max(a->x1, b->x1), std::max(a->y1, b->y1), std::min(a->x2, b->x2), std::min(a->y2, b->y2)};
  return result->x1 <= result->x2 && result->y1 <= result->y2;
}
constexpr int LV_DRAW_TASK_TYPE_LABEL = 1;
struct lv_layer_t { lv_area_t _clip_area; };
struct lv_draw_label_dsc_t { struct { lv_layer_t *layer; } base; uint32_t color; int text_local = 0; };
struct lv_draw_task_t { int type; lv_area_t area, clip_area; lv_draw_label_dsc_t *descriptor; };
struct DrawnLabel { lv_area_t area, clip; uint32_t color; };
std::vector<DrawnLabel> drawn_labels;
int lv_draw_task_get_type(lv_draw_task_t *task) { return task->type; }
void *lv_draw_task_get_draw_dsc(lv_draw_task_t *task) { return task->descriptor; }
void lv_draw_label(lv_layer_t *layer, lv_draw_label_dsc_t *descriptor, lv_area_t *area) {
  assert(descriptor->text_local == 1);
  drawn_labels.push_back({*area, layer->_clip_area, descriptor->color});
}
'''
source += r'''
std::string focused_app;
bool focus_allowed = true;
bool companion_card_focus_allowed(const std::string &) { return focus_allowed; }
std::string companion_url_card_focus_id(const std::string &) { return "browser"; }
unsigned focus_reads = 0;
bool companion_action_active(const std::string &id, bool = false) { ++focus_reads; return id == focused_app; }
struct CompanionAction {
  std::string id, label;
  OBSCardState obs_state{OBSCardState::unknown};
  std::string obs_detail{};
  std::optional<bool> obs_available{};
  std::optional<uint32_t> shortcut_color{};
};
struct CompanionValue { std::string id; int value; };
struct CompanionRuntimeSnapshot {
  std::string selected_scene{};
  bool connected = true;
  std::vector<CompanionAction> actions{};
  std::vector<CompanionValue> values{};
};
CompanionRuntimeSnapshot companion_runtime_snapshot() { return {}; }
const CompanionAction *companion_published_action(const CompanionRuntimeSnapshot &snapshot, const std::string &id) {
  static const CompanionAction selected{};
  if (!snapshot.connected) return nullptr;
  if (id == snapshot.selected_scene) return &selected;
  for (const auto &action : snapshot.actions) {
    if (action.id == id) return &action;
    if ((id == "obs.take" || id == "obs.transition") && action.id.size() == id.size() + 37 &&
        action.id.rfind(id + ".", 0) == 0) return &action;
  }
  return nullptr;
}
bool companion_action_focused(const CompanionRuntimeSnapshot &, const std::string &id, bool = false) {
  return companion_action_active(id);
}
struct CompanionCardRef {
  lv_obj_t *button;
  std::string action_id, url_config, metric_key;
  bool show_focus = true;
  std::string required_focus_id{};
  lv_obj_t *text_label = nullptr, *obs_detail = nullptr, *obs_state_icon = nullptr;
  std::string obs_label_alias{};
  CompanionAction rendered_obs_action{};
};
struct CompanionSliderRef {
  lv_obj_t *slider = nullptr, *icon_label = nullptr, *text_label = nullptr;
  std::string control_id, base_label;
  bool has_icon_on = false;
  const char *icon_off = nullptr, *icon_on = nullptr;
};
constexpr int LV_ALIGN_BOTTOM_LEFT = 1, LV_ANIM_OFF = 0, LV_EVENT_VALUE_CHANGED = 21;
const char *lv_label_get_text(lv_obj_t *label) { return label->content.c_str(); }
void lv_obj_align(lv_obj_t *obj, int, int, int y) { obj->y_offset = y; }
void lv_obj_update_layout(lv_obj_t *obj) { ++obj->layout_updates; }
const int *lv_obj_get_style_text_font(lv_obj_t *, int) { static const int line_height = 20; return &line_height; }
int lv_font_get_line_height(const int *font) { return *font; }
void lv_slider_set_value(lv_obj_t *obj, int value, int) { obj->slider_value = value; }
int lv_slider_get_value(lv_obj_t *obj) { return obj->slider_value; }
void lv_obj_send_event(lv_obj_t *obj, int event, void *) {
  assert(event == LV_EVENT_VALUE_CHANGED);
  ++obj->slider_events;
}
bool companion_action_available(const std::string &) { return true; }
bool companion_action_available(const CompanionRuntimeSnapshot &, const std::string &) { return true; }
std::vector<CompanionCardRef> focus_cards;
auto &companion_card_refs() { return focus_cards; }
bool lv_obj_is_valid(lv_obj_t *obj) { return obj != nullptr; }
'''
grid = (headers / "button_grid_grid.h").read_text()
_, setup = definition(grid, "setup_card_visual")
_, refresh = definition(grid, "refresh_card_layout")
assert "basic_action_driver_refresh_layout(" not in setup
assert refresh.index("apply_card_label_line_clamp(") < refresh.index("basic_action_driver_refresh_layout(")
layout = (headers / "button_grid_layout.h").read_text()
source += "\n" + "\n".join(re.findall(r"^constexpr char CARD_SIZE_.*?;$", layout, re.MULTILINE))

source += "\nstruct lv_indev_t {}; lv_indev_t *lv_indev_get_act() { return nullptr; } void lv_indev_wait_release(lv_indev_t *) {}\n"

groups = (
    ("button_grid_slider_contrast.h", "", ("slider_text_contrast_event_cb", "slider_bind_text_contrast")),
    ("button_grid_display.h", "", ("display_correct_color",)),
    ("card_text_contrast.h", "", ("apply_card_descendant_text_color", "sync_card_checked_text_color", "card_text_contrast_event_cb", "sync_bound_card_text_color", "bind_card_text_contrast_events", "set_card_checked_state")),
    ("button_grid_touch.h", "", ("consume_button_touch_press",)),
    ("button_grid_layout.h", "", ("parse_hex_color", "apply_button_colors", "apply_button_on_pattern")),
    ("companion_controls.h", "", ("companion_obs_record_stopping", "companion_obs_output_status_id", "companion_obs_output_status", "companion_obs_output_active")),
    ("companion_controls.h", "", ("companion_obs_scene_target", "companion_obs_hashed_target", "companion_obs_transition_target", "companion_obs_source_target", "companion_obs_scene_card", "companion_obs_control_label", "companion_obs_break_active", "companion_obs_momentary_action", "companion_apply_card_focus", "companion_required_focus_ready", "companion_refresh_card_focus")),
    ("companion_controls.h", "", ("companion_layout_card_detail", "companion_render_mic_detail", "companion_obs_mute_state", "companion_obs_status_card", "companion_obs_status_icon", "companion_obs_scene_on_program", "companion_render_obs_detail", "companion_obs_keep_content_bright", "companion_update_obs_detail_contrast", "companion_render_slider")),
    ("finder_folder_sync.h", "", ("apple_shortcut_catalogue_color",)),
    ("button_grid_grid.h", "", ("grid_live_companion_actions", "card_palette_for_config", "card_slot_static_child", "reset_card_slot_dynamic_children")),
    ("button_grid_grid.h", "", ("apply_subpage_back_colors",)),
    ("button_grid_subscriptions.h", "", ("apply_sensor_active_color",)),
)
for filename, namespace, names in groups:
    text = (headers / filename).read_text()
    if namespace:
        source += "\nnamespace " + namespace + " {\n"
    for name in names:
        line, code = definition(text, name)
        source += f'\n#line {line} "{filename}"\n{code}\n'
    if namespace:
        source += "\n}\n"
source += r'''
struct CompanionAppIconImageData {
  struct { uint32_t default_rgb = 0x1565C0, active_rgb = 0x7985CB; bool valid = true; } accent_palette;
  bool app_icon_mode = true, companion_online = true, image_loaded = true;
  bool card_palette_ready = true, custom_background = false, palette_applied = false;
  uint32_t fallback_default_rgb = 0x313131, fallback_active_rgb = 0x5C73E7;
};
'''
line, code = definition((headers / "button_grid_cards.h").read_text(), "companion_apply_app_icon_card_palette")
source += f'\n#line {line} "button_grid_cards.h"\n{code}\n'
source += r'''
#line 1 "card_colour_rendering_cases"
int main() {
  {
    lv_obj_t tile, title, detail;
    CompanionCardRef mic{&tile, "obs.mute.69da3f8f-7f62-4abe-a594-4e40dd579858", "", ""};
    mic.text_label = &title;
    mic.obs_detail = &detail;
    CompanionRuntimeSnapshot snapshot;
    snapshot.actions.push_back({mic.action_id, "Commentary", OBSCardState::audio_live});
    companion_render_obs_detail(mic, "Desk mic", snapshot);
    assert(title.content == "Desk mic" && detail.content == "Live" && title.y_offset == -22);
    snapshot.actions.front().label = "Muted · Commentary";
    snapshot.actions.front().obs_state = OBSCardState::unknown;
    companion_render_obs_detail(mic, "Desk mic", snapshot, true);
    assert(title.content == "Desk mic" && detail.content == "Muted" && detail.layout_updates == 0);
    snapshot.actions.front().obs_available = false;
    companion_render_obs_detail(mic, "Desk mic", snapshot, true);
    assert(title.content == "Desk mic" && detail.content == "Unavailable");
    assert(companion_obs_control_label(mic.action_id, "", "Unavailable") == "Input State");
    assert(companion_obs_control_label(mic.action_id, "Desk mic", "Muted · Commentary") == "Desk mic");
  }
  {
    lv_obj_t tile, title, detail, icon;
    ParsedCfg config;
    config.type = "companion";
    config.entity = "obs.status.record";
    CardPalette defaults;
    defaults.sensor_val = 0xFFFFFF;
    defaults.surface_sensor_val = 0xF5F5F5;
    assert(card_palette_for_config(defaults, config, DisplayProfile{}).sensor_val == 0xF5F5F5);
    config.entity = "obs.output.record";
    assert(card_palette_for_config(defaults, config, DisplayProfile{}).sensor_val == 0xFFFFFF);
    CompanionCardRef sensor{&tile, "obs.status.record", "", ""};
    sensor.text_label = &title;
    sensor.obs_detail = &detail;
    sensor.obs_state_icon = &icon;
    companion_render_obs_detail(sensor, "Recording · Idle", {});
    assert(title.content == "Recording" && detail.content == "Idle" && icon.content == "Stop Circle");
    companion_render_obs_detail(sensor, "Recording · Active", {});
    assert(title.content == "Recording" && detail.content == "Active" && icon.content == "Record");
    companion_render_obs_detail(sensor, "Recording · Paused", {});
    assert(title.content == "Recording" && detail.content == "Paused" && icon.content == "Pause");
    sensor.action_id = "obs.status.stream";
    companion_render_obs_detail(sensor, "Stream · Reconnecting", {});
    assert(title.content == "Stream" && detail.content == "Reconnecting" && icon.content == "Progress Clock");
    sensor.action_id = "obs.status.program";
    companion_render_obs_detail(sensor, "Program · Break", {});
    assert(title.content == "Program" && detail.content == "Break" && icon.content == "Monitor");
    companion_render_obs_detail(sensor, "Unavailable", {});
    assert(title.content == "Program" && detail.content == "Unavailable" && icon.content == "Monitor Off");
  }
  {
    lv_obj_t tile, title, detail, icon;
    tile.children = {&title, &detail, &icon};
    CompanionCardRef record{&tile, "obs.output.record", "", ""};
    record.text_label = &title;
    record.obs_detail = &detail;
    record.obs_state_icon = &icon;
    set_card_disabled_state(&tile, true);
    set_card_content_disabled(&tile, true);
    CompanionRuntimeSnapshot stopping;
    stopping.actions = {{"obs.output.record", "Stopping"}, {"obs.record.active", "Recording"}};
    companion_apply_card_focus(&tile, record.action_id, "", true, &stopping);
    companion_render_obs_detail(record, companion_obs_control_label(record.action_id, "", "", &stopping), {});
    companion_update_obs_detail_contrast(record, true);
    assert(title.content == "Recording" && detail.content == "Stopping" && title.y_offset < 0);
    assert(lv_obj_has_state(&tile, LV_STATE_DISABLED) && lv_obj_has_state(&tile, LV_STATE_CHECKED));
    assert(!lv_obj_has_state(&title, LV_STATE_DISABLED) && !lv_obj_has_state(&icon, LV_STATE_DISABLED));

    record.obs_label_alias = "Capture · Desk";
    companion_render_obs_detail(record, companion_obs_control_label(record.action_id, record.obs_label_alias, "", &stopping), {});
    assert(title.content == "Capture · Desk" && detail.content == "Stopping");
    record.obs_label_alias.clear();

    CompanionRuntimeSnapshot idle;
    idle.actions = {{"obs.status.record", "Recording · Idle"}};
    companion_apply_card_focus(&tile, record.action_id, "", true, &idle);
    companion_render_obs_detail(record, companion_obs_control_label(record.action_id, "", "", &idle), {});
    companion_update_obs_detail_contrast(record, false);
    assert(title.content == "Record" && detail.content == "Idle" && icon.content == "Stop Circle");
    assert(!lv_obj_has_state(&tile, LV_STATE_CHECKED));
    assert(lv_obj_has_state(&title, LV_STATE_DISABLED));
    record.action_id = "obs.output.stream";
    CompanionRuntimeSnapshot reconnecting;
    reconnecting.actions = {{"obs.status.stream", "Stream · Reconnecting"}};
    companion_apply_card_focus(&tile, record.action_id, "", true, &reconnecting);
    companion_render_obs_detail(record, companion_obs_control_label(record.action_id, "", "", &reconnecting), {});
    assert(title.content == "Stream" && detail.content == "Reconnecting" && icon.content == "Progress Clock");
    assert(lv_obj_has_state(&tile, LV_STATE_CHECKED));
    const auto migrated = parse_cfg("obs.status.record;;Monitor;Auto;;;companion;;obs_confirm=none,card_off_color=123456");
    assert(migrated.entity == "obs.output.record" && migrated.options == "card_off_color=123456");
    for (const std::string prefix : {"obs.scene.", "obs.preview."}) {
      const std::string uuid = "69da3f8f-7f62-4abe-a594-4e40dd579858";
      const auto scene = parse_cfg(prefix + uuid + ";Gameplay;Image;Auto;;;companion;;card_off_color=123456");
      assert(scene.entity == "obs.target." + uuid && scene.label == "Gameplay");
      assert(scene.icon == "Image" && scene.options == "card_off_color=123456");
    }
    for (const std::string id : {"obs.studio", "obs.replay.buffer"}) {
      const auto toggle = parse_cfg(id + ";;Auto;Auto;;;companion;;obs_confirm=both,confirm_yes=Proceed");
      assert(cfg_option_value(toggle.options, "obs_confirm") == "both");
      assert(cfg_option_value(toggle.options, "confirm_yes") == "Proceed");
    }
  }
  {
    lv_obj_t tile, title, detail;
    tile.children = {&title, &detail};
    CompanionCardRef replay{&tile, "obs.replay", "", ""};
    replay.text_label = &title;
    replay.obs_detail = &detail;
    companion_render_obs_detail(replay, "Start Replay Buffer", {});
    assert(title.content == "Save Replay" && detail.content == "Start Replay Buffer");
    set_card_disabled_state(&tile, true);
    lv_obj_add_state(&title, LV_STATE_DISABLED);  // Subtitle was added after the tile was disabled.
    companion_update_obs_detail_contrast(replay, false);
    assert(lv_obj_has_state(&detail, LV_STATE_DISABLED));
    replay.action_id = "obs.brb";
    companion_render_obs_detail(replay, "BRB · Check OBS", {});
    lv_obj_clear_state(&detail, LV_STATE_DISABLED);
    companion_update_obs_detail_contrast(replay, false);
    assert(title.content == "Break" && detail.content == "Check OBS");
    assert(lv_obj_has_state(&detail, LV_STATE_DISABLED));
    companion_render_obs_detail(replay, "BRB · Already on break", {});
    assert(title.content == "Break" && detail.content.empty() && title.y_offset == 0);
    replay.rendered_obs_action = {"obs.brb.11111111-1111-1111-1111-111111111111", "BRB · Test scene"};
    companion_render_obs_detail(replay, replay.rendered_obs_action.label, {});
    assert(title.content == "Break" && detail.content == "Start");
    CompanionRuntimeSnapshot break_state;
    break_state.actions = {{"obs.brb", "Resume"}};
    companion_render_obs_detail(replay, "Resume", {});
    companion_apply_card_focus(&tile, "obs.brb", "", true, &break_state);
    assert(title.content == "Break" && detail.content == "Resume");
    assert(lv_obj_has_state(&tile, LV_STATE_CHECKED));
    break_state.actions[0].label = "BRB · Test scene";
    companion_apply_card_focus(&tile, "obs.brb", "", true, &break_state);
    assert(!lv_obj_has_state(&tile, LV_STATE_CHECKED));
    replay.action_id = "obs.replay";
    set_card_disabled_state(&tile, false);
    CompanionRuntimeSnapshot replay_state;
    lv_obj_add_state(&tile, LV_STATE_PRESSED);
    for (const auto state : {OBSCardState::replay_ready, OBSCardState::replay_saving,
                             OBSCardState::replay_saved, OBSCardState::replay_ready}) {
      const auto *status = obs_card_presentation(state).detail;
      replay_state.actions = {{"obs.replay", "Save Replay", state}};
      companion_render_obs_detail(replay, "Save Replay", replay_state);
      companion_apply_card_focus(&tile, "obs.replay", "", true, &replay_state);
      assert(title.content == "Save Replay" && detail.content == status);
      assert(!lv_obj_has_state(&tile, LV_STATE_CHECKED));
      assert(lv_obj_has_state(&tile, LV_STATE_PRESSED));
    }
    companion_update_obs_detail_contrast(replay, false);
    assert(!lv_obj_has_state(&detail, LV_STATE_DISABLED));
    replay.action_id = "obs.take";
    focused_app = replay.action_id;
    lv_obj_add_state(&tile, LV_STATE_CHECKED);
    companion_apply_card_focus(&tile, replay.action_id, "", true, &replay_state);
    assert(!lv_obj_has_state(&tile, LV_STATE_CHECKED) && lv_obj_has_state(&tile, LV_STATE_PRESSED));
    focused_app.clear();
    for (const auto state : {OBSCardState::take_transitioning, OBSCardState::unknown}) {
      set_card_disabled_state(&tile, false);
      lv_obj_add_state(&tile, LV_STATE_PRESSED);
      replay_state.actions = {{"obs.take", "Take Live · Transitioning", state}};
      title.content = "Take Studio";
      detail.content = "Fade";
      companion_render_obs_detail(replay, replay_state.actions[0].label, replay_state, true);
      assert(title.content == "Take Studio" && detail.content == "Fade");
      companion_update_obs_detail_contrast(replay, false);
      assert(lv_obj_has_state(&tile, LV_STATE_PRESSED));
      set_card_disabled_state(&tile, true);  // OBS updates before the user's finger lifts.
      companion_render_obs_detail(replay, replay_state.actions[0].label, replay_state);
      companion_update_obs_detail_contrast(replay, companion_obs_keep_content_bright(replay_state, replay.action_id));
      assert(title.content == "Take Live" && detail.content.empty());
      assert(lv_obj_has_state(&tile, LV_STATE_DISABLED));
      assert(!lv_obj_has_state(&tile, LV_STATE_PRESSED) && !lv_obj_has_state(&tile, LV_STATE_CHECKED));
      assert(lv_obj_has_state(&title, LV_STATE_DISABLED) && lv_obj_has_state(&detail, LV_STATE_DISABLED));
    }
    replay_state.actions = {{"obs.take", "Take Live", OBSCardState::take_same_scene}, {"obs.transition", "Cut"}};
    companion_render_obs_detail(replay, "Take Live", replay_state);
    companion_update_obs_detail_contrast(replay, companion_obs_keep_content_bright(replay_state, replay.action_id));
    assert(title.content == "Currently Live" && detail.content.empty());
    assert(lv_obj_has_state(&title, LV_STATE_DISABLED) && lv_obj_has_state(&detail, LV_STATE_DISABLED));
    set_card_disabled_state(&tile, false);
    const std::string suffix = ".9ea47782-fada-4bb3-aef6-1904669efae7";
    replay_state.actions = {{"obs.take" + suffix, "Take Live · Studio", OBSCardState::take_ready, "Studio"},
                            {"obs.transition" + suffix, "Fade"}};
    companion_render_obs_detail(replay, replay_state.actions[0].label, replay_state);
    assert(title.content == "Take Studio" && detail.content == "Fade");
    const auto layout_updates = detail.layout_updates;
    replay_state.actions[0].obs_detail = "Break";
    replay_state.actions[1].label = "Cut";
    companion_render_obs_detail(replay, "Take Live · Break", replay_state, true);
    assert(title.content == "Take Break" && detail.content == "Cut" && title.y_offset == -22);
    assert(detail.layout_updates == layout_updates);
    replay.action_id = "obs.transition";
    companion_render_obs_detail(replay, "Fade · Short", {});
    assert(title.content == "Transition" && detail.content == "Fade · Short");
    companion_render_obs_detail(replay, "Cut", {});
    assert(title.content == "Transition" && detail.content == "Cut");
    replay.action_id = "obs.transition.select.0123456789abcdef0123456789abcdef";
    replay.rendered_obs_action = {replay.action_id + ".11111111-1111-1111-1111-111111111111", "Cut"};
    companion_render_obs_detail(replay, "Cut", {});
    assert(title.content == "Cut" && detail.content == "Transition");
    CompanionRuntimeSnapshot transition_state;
    transition_state.actions = {{"obs.transition.selected", replay.action_id}};
    companion_apply_card_focus(&tile, replay.action_id, "", true, &transition_state);
    assert(lv_obj_has_state(&tile, LV_STATE_CHECKED));
    transition_state.actions.clear();
    companion_apply_card_focus(&tile, replay.action_id, "", true, &transition_state);
    assert(!lv_obj_has_state(&tile, LV_STATE_CHECKED));
  }
  {
    lv_obj_t slider, title;
    CompanionSliderRef fader;
    fader.slider = &slider;
    fader.text_label = &title;
    fader.control_id = "obs.level.11111111-1111-1111-1111-111111111111";
    fader.base_label = parse_cfg(fader.control_id + ";OBS · Desk Mic;Microphone;Auto;;;slider").label;
    assert(fader.base_label == "Desk Mic");
    CompanionRuntimeSnapshot snapshot;
    snapshot.actions = {{fader.control_id, "Desk Mic"}};
    snapshot.values = {{fader.control_id, 75}, {"obs.cough.11111111-1111-1111-1111-111111111111", 100}};
    companion_render_slider(fader, snapshot);
    assert(title.content == "Desk Mic");
    assert(slider.slider_value == 75);
    assert(!lv_obj_has_state(&slider, LV_STATE_DISABLED));
    snapshot.values[1].value = 0;
    fader.base_label = "Broadcast Mic";
    companion_render_slider(fader, snapshot);
    assert(title.content == "Broadcast Mic");
    assert(slider.slider_value == 75);

    snapshot.connected = false;
    companion_render_slider(fader, snapshot);
    assert(title.content == "Broadcast Mic\nUnavailable");
    assert(lv_obj_has_state(&slider, LV_STATE_DISABLED));

    fader.base_label.clear();
    companion_render_slider(fader, snapshot);
    assert(title.content == "Unavailable");
    snapshot.connected = true;
    companion_render_slider(fader, snapshot);
    assert(title.content == "Desk Mic");
  }
  {
    lv_obj_t old_app, new_app, unrelated_app, metric;
    old_app.state = metric.state = LV_STATE_CHECKED;
    focus_cards = {{&old_app, "old", "", ""}, {&new_app, "new", "", ""},
                   {&unrelated_app, "other", "", ""}, {&metric, "", "", "stat.cpu"}};
    focused_app = "new";
    auto before = state_writes;
    companion_refresh_card_focus(CompanionRuntimeSnapshot{});
    assert(state_writes == before + 2);
    assert(!lv_obj_has_state(&old_app, LV_STATE_CHECKED));
    assert(lv_obj_has_state(&new_app, LV_STATE_CHECKED));
    assert(!lv_obj_has_state(&unrelated_app, LV_STATE_CHECKED));
    assert(lv_obj_has_state(&metric, LV_STATE_CHECKED));
    before = state_writes;
    for (int refresh = 0; refresh < 100; ++refresh)
      companion_refresh_card_focus(CompanionRuntimeSnapshot{});
    assert(state_writes == before);
    lv_obj_t shortcut;
    focus_cards = {{&shortcut, "shortcut.control+w", "", "", true, "target"}};
    companion_refresh_card_focus(CompanionRuntimeSnapshot{});
    assert(lv_obj_has_state(&shortcut, LV_STATE_DISABLED));
    focused_app = "target";
    companion_refresh_card_focus(CompanionRuntimeSnapshot{});
    assert(!lv_obj_has_state(&shortcut, LV_STATE_DISABLED));
    focus_cards.clear(); focused_app.clear();
  }
  {
    lv_obj_t main_scene, break_scene;
    const std::string main_id = "11111111-1111-1111-1111-111111111111";
    const std::string break_id = "22222222-2222-2222-2222-222222222222";
    focus_cards = {{&main_scene, "obs.target." + main_id, "", ""},
                   {&break_scene, "obs.target." + break_id, "", ""}};
    companion_refresh_card_focus({"obs.selected." + main_id});
    assert(lv_obj_has_state(&main_scene, LV_STATE_CHECKED));
    assert(!lv_obj_has_state(&break_scene, LV_STATE_CHECKED));
    companion_refresh_card_focus({"obs.selected." + break_id});
    assert(!lv_obj_has_state(&main_scene, LV_STATE_CHECKED));
    assert(lv_obj_has_state(&break_scene, LV_STATE_CHECKED));
    CompanionRuntimeSnapshot studio{"obs.selected." + break_id};
    studio.actions = {{"obs.program." + main_id, ""}};
    companion_refresh_card_focus(studio);
    assert(!lv_obj_has_state(&main_scene, LV_STATE_CHECKED));
    assert(lv_obj_has_state(&break_scene, LV_STATE_CHECKED));
    lv_obj_t title, detail, icon;
    auto &main_card = focus_cards[0];
    main_card.text_label = &title;
    main_card.obs_detail = &detail;
    main_card.obs_state_icon = &icon;
    companion_render_obs_detail(main_card, "Main", studio);
    assert(title.content == "Main" && detail.content == "Live" && icon.content == "Broadcast");
    studio.actions[0].id = "obs.program." + break_id;
    companion_refresh_card_focus(studio);
    assert(lv_obj_has_state(&break_scene, LV_STATE_CHECKED));
    companion_render_obs_detail(main_card, "Main", studio);
    assert(title.content == "Main" && detail.content == "Scene" && icon.content == "Image Card Loading");
    studio.actions = {{main_card.action_id, "Main"}};
    for (const auto state : {OBSCardState::scene_live, OBSCardState::scene_program, OBSCardState::scene_program_preview}) {
      studio.actions[0].obs_state = state;
      companion_render_obs_detail(main_card, "Main", studio);
      assert(detail.content == "Live");
    }
    studio.actions[0].obs_state = OBSCardState::scene_preview;
    companion_render_obs_detail(main_card, "Main", studio);
    assert(detail.content == "Scene");
    CompanionRuntimeSnapshot normal{"obs.selected." + main_id};
    normal.actions = {{"obs.studio", "Off"}};
    companion_render_obs_detail(main_card, "Main", normal);
    assert(detail.content == "Live");
    normal.connected = false;
    companion_render_obs_detail(main_card, "Main", normal);
    assert(detail.content == "Scene");
    companion_refresh_card_focus({});
    assert(!lv_obj_has_state(&break_scene, LV_STATE_CHECKED));
    lv_obj_t recording;
    focus_cards = {{&recording, "obs.output.record", "", ""}};
    companion_refresh_card_focus({"obs.record.active"});
    assert(lv_obj_has_state(&recording, LV_STATE_CHECKED));
    companion_refresh_card_focus({});
    assert(!lv_obj_has_state(&recording, LV_STATE_CHECKED));
    focus_cards.clear();
  }
  // An icon reload/reconnect after a light-theme change must not restore
  // the dark fallback captured when the card was first created.
  lv_obj_t app_card;
  app_card.background[LV_STATE_DEFAULT] = 0xEEEEEE;
  app_card.background[LV_STATE_CHECKED] = 0xDDDDDD;
  CompanionAppIconImageData app_icon;
  for (bool online : {false, true}) {
    app_icon.companion_online = online;
    companion_apply_app_icon_card_palette(app_icon, &app_card);
    assert(app_card.background[LV_STATE_DEFAULT] == 0xEEEEEE);
    assert(app_card.background[LV_STATE_CHECKED] == 0xDDDDDD);
    assert(!app_icon.palette_applied);
  }
  companion_apply_app_icon_card_palette(app_icon, &app_card);
  assert(app_card.outline[LV_STATE_CHECKED] == 0);
  assert(app_card.outline[LV_STATE_PRESSED] == 0);
  app_icon.fallback_active_rgb = 0xFF8C00;
  companion_apply_app_icon_card_palette(app_icon, &app_card);
  assert(app_card.outline[LV_STATE_CHECKED] == 0); // Theme changes do not restore an outline.
  assert(app_card.outline[LV_STATE_PRESSED] == 0);
  ParsedCfg filled_app;
  filled_app.type = "companion";
  filled_app.entity = "com.apple.Safari";
  filled_app.options = "app_icon_cover,app_hide_label";
  assert(!cfg_option_token_present(companion_card_options_normalized(filled_app), "app_icon_fill"));
  assert(!cfg_option_token_present(companion_card_options_normalized(filled_app), "app_icon_cover"));
  app_icon.custom_background = true;
  companion_apply_app_icon_card_palette(app_icon, &app_card);
  assert(app_card.background[LV_STATE_DEFAULT] == 0x1565C0);
  assert(app_card.background[LV_STATE_CHECKED] == 0x7985CB);
  assert(app_icon.palette_applied);
  // Exercise a glyph crossing each fill edge, including reversed cover fills.
  // Every visible pixel must use the foreground of the surface beneath it.
  for (bool pale_base : {false, true}) for (bool horizontal : {false, true})
    for (bool inverted : {false, true}) for (int percent : {0, 1, 10, 50, 90, 99, 100}) {
      lv_obj_t button, fill;
      button.area = {0, 0, 99, 99};
      button.background[0] = pale_base ? 0xFFFFFF : 0x313131;
      button.text[0] = display_text_color_for_bg(button.background[0]);
      fill.parent = &button;
      fill.background[0] = pale_base ? 0x000000 : 0xFFFFFF;
      fill.area = horizontal
        ? (inverted ? lv_area_t{100-percent, 0, 99, 99} : lv_area_t{0, 0, percent-1, 99})
        : (inverted ? lv_area_t{0, 0, 99, percent-1} : lv_area_t{0, 100-percent, 99, 99});
      lv_layer_t layer{{0, 0, 99, 99}};
      lv_draw_label_dsc_t descriptor{{&layer}, button.text[0]};
      lv_draw_task_t task{LV_DRAW_TASK_TYPE_LABEL, {0, 0, 99, 99}, layer._clip_area, &descriptor};
      lv_event_t event{nullptr, 0, &fill, &task};
      drawn_labels.clear();
      slider_text_contrast_event_cb(&event);
      drawn_labels.push_back({task.area, task.clip_area, descriptor.color});
      assert(layer._clip_area.x1 == 0 && layer._clip_area.y1 == 0 && layer._clip_area.x2 == 99 && layer._clip_area.y2 == 99);
      for (int y = 0; y < 100; ++y) for (int x = 0; x < 100; ++x) {
        int matches = 0;
        const bool filled = x >= fill.area.x1 && x <= fill.area.x2 && y >= fill.area.y1 && y <= fill.area.y2;
        const uint32_t expected = display_text_color_for_bg(filled ? fill.background[0] : button.background[0]);
        for (const auto &draw : drawn_labels) {
          if (x >= draw.clip.x1 && x <= draw.clip.x2 && y >= draw.clip.y1 && y <= draw.clip.y2) {
            ++matches;
            assert(draw.color == expected);
          }
        }
        assert(matches == 1);
      }
    }
  const auto saved_accent = current_button_primary_color();
  set_current_button_primary_color(0x14B8A6); // A non-default configured highlight colour.
  for (const std::string token : {"B", "Bd", "Bw", "Bb", "Bt", "Bx"}) {
    for (const std::string prefix : {"", "~"}) {
      const auto order = get_subpage_order(prefix + "1," + token + "=Return%3AHome%2C50%25:#ffec16,2|ignored");
      assert(get_subpage_back_label(order) == "Return:Home,50%");
      assert(get_subpage_back_color(order) == "FFEC16");
      lv_obj_t back, icon, label;
      back.children = {&icon, &label};
      assert(!apply_subpage_back_colors(&back, order, DisplayProfile{}));
      assert(back.background[0] == 0xFFEC16);
      assert(back.instant_feedback);
      assert(icon.text[0] == 0x212121 && label.text[0] == 0x212121);
      back.state = LV_STATE_PRESSED;
      send_event(&back, LV_EVENT_PRESSED);
      assert(back.background[LV_STATE_PRESSED] == active_card_color(0xFFEC16));
      assert(label.text[0] == display_text_color_for_bg(active_card_color(0xFFEC16)));
      back.state = 0;
      assert(apply_subpage_back_colors(&back, "B", DisplayProfile{}));
      assert(back.background[0] == current_theme().surface_card);
      assert(back.background[LV_STATE_PRESSED] == current_button_primary_color());
      assert(back.instant_feedback);
      assert(label.text[0] == display_text_color_for_bg(current_theme().surface_card));
      back.state = LV_STATE_PRESSED;
      send_event(&back, LV_EVENT_PRESSED);
      assert(icon.text[0] == display_text_color_for_bg(current_button_primary_color()));
      assert(label.text[0] == display_text_color_for_bg(current_button_primary_color()));
      back.state = 0;
      send_event(&back, LV_EVENT_RELEASED);
      assert(label.text[0] == display_text_color_for_bg(current_theme().surface_card));
    }
  }
  set_current_button_primary_color(saved_accent);
  for (const std::string order : {"", "B", "B=Return%3AHome", "B=Back:invalid", "B=Back:12345", "1=Back:FFEC16"})
    assert(get_subpage_back_color(order).empty());
  assert(get_subpage_back_label("B=Back:invalid") == "Back");
  assert(get_subpage_back_color("Bw=Return:FFEC16:Tools%3AOffice") == "FFEC16");
  assert(get_subpage_back_label("Bw=Return:FFEC16:Tools%3AOffice") == "Return");
  set_espdesktop_language("de");
  assert(get_subpage_back_label("B=:FFEC16") == "Zurück");
  assert(get_subpage_back_label("B") == "Zurück");
  assert(get_subpage_back_label("B=Return:FFEC16") == "Return");
  set_espdesktop_language("en");
  for (const ThemePalette *theme : {&DARK_THEME, &LIGHT_THEME}) {
    set_active_theme_palette(*theme);
    // A modal/PIN label has its own theme colour, independent of the button.
    lv_obj_t pin_key, pin_label;
    pin_key.children = {&pin_label};
    pin_key.text[0] = 0xFFFFFF;
    pin_label.text[0] = theme->text_primary;
    pin_key.state = LV_STATE_PRESSED;
    consume_button_touch_press(&pin_key);
    assert(pin_label.text[0] == theme->text_primary);
    // Consuming a trigger press must restore contrast without a release event.
    for (bool checked : {false, true}) {
      lv_obj_t trigger, label, icon;
      trigger.children = {&label, &icon};
      apply_button_colors(&trigger, true, 0xFFFFFF, true, 0x212121);
      trigger.state = LV_STATE_PRESSED | (checked ? LV_STATE_CHECKED : 0);
      send_event(&trigger, LV_EVENT_PRESSED);
      assert(label.text[0] == display_text_color_for_bg(0xFFFFFF));
      consume_button_touch_press(&trigger);
      assert(trigger.state == (checked ? LV_STATE_CHECKED : 0));
      assert(label.text[0] == lv_obj_get_style_text_color(&trigger, LV_PART_MAIN));
      assert(icon.text[0] == label.text[0]);
    }
    // Forecast temperatures retain muted grey through card contrast updates.
    lv_obj_t forecast_card, forecast_day, forecast_icon, forecast_temperature;
    forecast_card.children={&forecast_day,&forecast_icon,&forecast_temperature};
    forecast_temperature.flags=LV_OBJ_FLAG_USER_2;
    forecast_temperature.text[0]=theme->text_muted;
    apply_button_colors(&forecast_card,true,0xFFEC16,true,0x212121);
    sync_card_checked_text_color(&forecast_card);
    for(int event:{LV_EVENT_PRESSED,LV_EVENT_RELEASED,LV_EVENT_PRESS_LOST}){
      forecast_card.state=event==LV_EVENT_PRESSED?LV_STATE_PRESSED:0;
      send_event(&forecast_card,event);
      assert(forecast_temperature.text[0]==theme->text_muted);
      assert(forecast_day.text[0]==lv_obj_get_style_text_color(&forecast_card,LV_PART_MAIN));
      assert(forecast_icon.text[0]==forecast_day.text[0]);
    }
    // Reused persistent card labels must shed content-owned colours.
    lv_obj_t card, music, caption;
    card.children = {&music, &caption};
    music.flags = caption.flags = LV_OBJ_FLAG_USER_2;
    music.text[0] = caption.text[0] = 0xFFFFFF;
    BtnSlot reused{&card, &music, &caption};
    apply_button_colors(&card, true, 0x6633B9, true, 0xFFEC16);
    reset_card_slot_dynamic_children(reused);
    for (auto *label : {&music, &caption}) {
      assert(!lv_obj_has_flag(label, LV_OBJ_FLAG_USER_2));
      assert(label->text[0] == display_text_color_for_bg(0xFFEC16));
    }
    send_event(&card, LV_EVENT_RELEASED);
    assert(music.text[0] == display_text_color_for_bg(0xFFEC16));
  }
  // A black image-label shadow is content-owned; its ordinary sibling follows contrast.
  lv_obj_t image_button, shadow, ordinary;
  image_button.children = {&shadow, &ordinary};
  shadow.text[0] = 0x000000;
  lv_obj_add_flag(&shadow, LV_OBJ_FLAG_USER_2);
  apply_button_colors(&image_button, true, 0x6633B9, true, 0xFFEC16);
  for (int event : {LV_EVENT_PRESSED, LV_EVENT_RELEASED, LV_EVENT_PRESS_LOST}) {
    send_event(&image_button, event);
    assert(shadow.text[0] == 0x000000);
    assert(ordinary.text[0] == display_text_color_for_bg(0xFFEC16));
  }
  assert(active_card_color(0x6633B9) == 0xA385D5);
  const auto contrast = [](uint32_t text, uint32_t background) {
    const double a = display_relative_luminance(text) + 50000;
    const double b = display_relative_luminance(background) + 50000;
    return a > b ? a / b : b / a;
  };
  assert(card_pattern_highlight_color(active_card_color(0xA0A0A0)) == 0x4E4E4E);
  assert(card_pattern_highlight_color(0xBFBFBF) == 0xD5D5D5);
  lv_obj_t striped, striped_label;
  striped.children = {&striped_label};
  const auto stripe_base = active_card_color(0xA0A0A0);
  apply_button_colors(&striped, true, stripe_base, true, 0xA0A0A0);
  apply_button_on_pattern(&striped, "on_pattern=stripes", true, stripe_base);
  set_card_checked_state(&striped, true);
  assert(striped.gradient[LV_STATE_CHECKED] == 0x4E4E4E);
  assert(striped.gradient[LV_STATE_PRESSED] == 0x4E4E4E);
  assert(striped.gradient_direction[LV_STATE_CHECKED] == LV_GRAD_DIR_HOR);
  assert(striped_label.text[0] == display_text_color_for_bg(stripe_base));
  for (uint32_t value = 0; value <= 255; ++value) {
    const uint32_t background = value * 0x010101;
    const auto active = active_card_color(background);
    const auto foreground = display_text_color_for_bg(active);
    assert(contrast(foreground, card_pattern_highlight_color(active)) >= contrast(foreground, active));
  }
  for (uint32_t base : {0xAAC93Fu, 0xEED146u, 0xEA3323u, 0x8F28ABu, 0xA0A0A0u}) {
    const auto active = active_card_color(base);
    const auto foreground = display_text_color_for_bg(active);
    assert(contrast(foreground, active) >= 2.1);
    assert(contrast(foreground, card_pattern_highlight_color(active)) >= 4.5);
  }
  assert(active_card_color(0xAAC93F) == 0x80972F);
  assert(active_card_color(0xEED146) == 0xB39D35);
  assert(display_text_color_for_bg(0x80972F) == 0xFFFFFF);
  assert(display_text_color_for_bg(0xB39D35) == 0xFFFFFF);
  CardPalette defaults;
  defaults.has_on = defaults.has_off = defaults.has_sensor_color = true;
  defaults.on_val = 0xFF8C00;
  defaults.off_val = 0x313131;
  defaults.sensor_val = 0x212121;
  DisplayProfile display;
  for (const std::string type : {"", "presence", "door_window", "light_control", "fan_control", "media", "cover"}) {
    for (const std::string mode : {"matching", "theme", "custom"}) {
      const std::string options = "card_off_color=6633B9,card_active_color=" + mode + ",card_on_color=FFFFFF";
      const ParsedCfg configs[] = {
        parse_cfg("light.test;Test;Auto;Auto;sensor.test;;" + type + ";;" + options),
        parsed_cfg_from_subpage_btn(parse_subpage_config("B,1|light.test:Test:Auto:Auto:sensor.test::" + type + "::" + options).at(0)),
        parsed_cfg_from_subpage_btn(parse_subpage_config("~B,1|" + type + ",light.test,Test,,,sensor.test,,," + encode_compact_field(options)).at(0)),
      };
      for (const auto &config : configs) {
        for (uint32_t accent : {0xFF8C00u, 0x00BCD4u}) {
          defaults.on_val = accent;
          for (int calibration : {100, 50}) {
            display.color.red_percent = calibration;
            const auto palette = card_palette_for_config(defaults, config, display);
            const uint32_t expected = mode == "theme" ? accent : display_correct_color(mode == "custom" ? 0xFFFFFF : 0xA385D5, display);
            assert(palette.on_val == expected);
            assert(palette.off_val == display_correct_color(0x6633B9, display));
            lv_obj_t button, label;
            button.children = {&label};
            apply_button_colors(&button, palette.has_on, palette.on_val, palette.has_off, palette.off_val);
            set_card_checked_state(&button, true);
            assert(button.background[LV_STATE_CHECKED] == expected);
            assert(label.text[0] == display_text_color_for_bg(expected));
            set_card_checked_state(&button, false);
            assert(label.text[0] == display_text_color_for_bg(palette.off_val));
          }
        }
      }
    }
  }
  display.color.red_percent = 100;
  defaults.on_val = 0xFF8C00;
  assert(card_progress_color(0xFF8C00) == 0xFFAF4D);
  assert(card_progress_color(0x9D9D9D) == 0xBABABA);
  assert(display_text_color_for_bg(0x00BCD4) == 0xFFFFFF);
  assert(display_text_color_for_bg(lighter_card_color(0x00BCD4)) == 0x212121);
  assert(display_text_color_for_bg(0xBFEAFF) == 0x212121);
  struct Colour { const char *hex; uint32_t base, active, text; };
  const Colour colours[] = {
    {"AAC93F", 0xAAC93F, 0x80972F, 0x212121},
    {"EED146", 0xEED146, 0xB39D35, 0x212121},
    {"6633B9", 0x6633B9, 0xA385D5, 0xFFFFFF},
    {"FF0000", 0xFF0000, 0xFF6666, 0xFFFFFF},
    {"F6402C", 0xF6402C, 0xFA8C80, 0xFFFFFF},
    {"FF8C00", 0xFF8C00, 0xFFBA66, 0xFFFFFF},
    {"1093F5", 0x1093F5, 0x70BEF9, 0xFFFFFF},
    {"46AF4A", 0x46AF4A, 0x90CF92, 0xFFFFFF},
    {"009687", 0x009687, 0x66C0B7, 0xFFFFFF},
    {"00BBD5", 0x00BBD5, 0x66D6E6, 0xFFFFFF},
    {"00BCD4", 0x00BCD4, 0x66D7E5, 0xFFFFFF},
    {"B2B2B2", 0xB2B2B2, 0x868686, 0xFFFFFF},
    {"B3B3B3", 0xB3B3B3, 0x868686, 0x212121},
    {"88C440", 0x88C440, 0x669330, 0x212121},
    {"CCDD1E", 0xCCDD1E, 0x99A617, 0x212121},
    {"FFFFFF", 0xFFFFFF, 0xBFBFBF, 0x212121},
    {"FFEC16", 0xFFEC16, 0xBFB111, 0x212121},
    {"000000", 0x000000, 0x666666, 0xFFFFFF},
  };
  for (const auto &colour : colours) {
    assert(active_card_color(colour.base) == colour.active);
    assert(display_text_color_for_bg(colour.base) == colour.text);
  }
  for (const char *options : {"", "card_off_color=invalid"}) {
    ParsedCfg config;
    config.options = options;
    const auto palette = card_palette_for_config(defaults, config, display);
    assert(palette.on_val == defaults.on_val && palette.off_val == defaults.off_val);
    assert(palette.sensor_val == defaults.sensor_val);
  }
  const std::string shortcut = "appleshortcut.pomodoro";
  grid_live_companion_actions() = {{shortcut, "Start Pomodoro", OBSCardState::unknown, {}, {}, 0xFF6363}};
  auto workflow = parse_cfg(shortcut + ";Start Pomodoro;Flash;Auto;;;companion;;");
  assert(card_palette_for_config(defaults, workflow, display).off_val == 0xFF6363);
  workflow.options = "card_off_color=EED146";
  assert(card_palette_for_config(defaults, workflow, display).off_val == 0xEED146);
  workflow.options.clear();
  grid_live_companion_actions().clear();
  assert(card_palette_for_config(defaults, workflow, display).off_val == defaults.off_val);

  ParsedCfg config;
  config.options = "card_off_color=FF8C00";
  display.color.red_percent = 50;
  display.color.green_percent = 75;
  const auto corrected_progress = card_palette_for_config(defaults, config, display);
  assert(corrected_progress.progress_val == display_correct_color(0xFFAF4D, display));
  for (const ThemePalette *theme : {&DARK_THEME, &LIGHT_THEME}) {
    set_active_theme_palette(*theme);
    const auto neutral = card_palette_for_config(CardPalette{}, ParsedCfg{}, DisplayProfile{});
    assert(!neutral.custom_background && neutral.surface_sensor_val == theme->surface_sensor);
    const auto custom = card_palette_for_config(CardPalette{}, config, DisplayProfile{});
    assert(custom.custom_background && custom.surface_sensor_val == 0xFF8C00);

  }
  set_active_theme_palette(DARK_THEME);
  const auto corrected = card_palette_for_config(defaults, config, display);
  assert(corrected.sensor_val == 0x7F6900);
  assert(corrected.off_val == corrected.sensor_val);
  assert(corrected.on_val == 0x7F8B66);
  assert(defaults.sensor_val == 0x212121);
  const auto explicit_colour = card_palette_for_config(CardPalette{}, config, DisplayProfile{});
  assert(explicit_colour.has_on && explicit_colour.has_off && explicit_colour.has_sensor_color);
  assert(explicit_colour.sensor_val == 0xFF8C00);

}
'''
with tempfile.TemporaryDirectory(prefix="card-colour-rendering-") as directory:
    cpp = Path(directory) / "test.cpp"
    binary = Path(directory) / "test"
    cpp.write_text(source)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-I" + str(root / "tests/firmware/stubs"), "-I" + str(headers), str(cpp), "-o", str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print("Card colour rendering checks passed: main/subpage contrast, display correction, Mac focus and OBS feedback.")
