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
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <functional>
#include <map>
#include <string>
#include <vector>
#define ESP_LOGD(...) ((void)0)
struct lv_obj_t;
void lv_label_set_text(lv_obj_t *, const char *) {}
#include "i18n_generated.h"
#include "button_grid_config_parser.h"
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
  bool instant_feedback = false;
  int flags = 0;
  std::vector<lv_event_cb_t> events;
  std::vector<lv_obj_t *> children;
  std::string content;
  lv_area_t area;
  lv_obj_t *parent = nullptr;
};
struct BtnSlot { lv_obj_t *btn, *icon_lbl = nullptr, *text_lbl = nullptr, *sensor_container = nullptr, *subpage_lbl = nullptr; };
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
constexpr int LV_OBJ_FLAG_USER_2 = 1<<28;
constexpr int CARD_TEXT_COLOR_PROTECTED_FLAG = LV_OBJ_FLAG_USER_2;
bool lv_obj_has_flag(lv_obj_t *obj, int flag) { return (obj->flags & flag) != 0; }
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
// This palette harness models solid cards; the separate image text harness
// exercises real background callbacks and draw tasks.
void card_background_text_event_cb(lv_event_t *) {}
using BackgroundQuery = bool (*)(lv_obj_t *);
BackgroundQuery card_background_text_query() { return nullptr; }
void card_background_bind_text_label(lv_obj_t *) {}
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
void set_card_content_disabled(lv_obj_t *, bool) {}
constexpr int LV_STATE_DISABLED = 4, LV_OBJ_FLAG_HIDDEN = 1, LV_OBJ_FLAG_USER_2 = 1<<28;
void set_card_disabled_state(lv_obj_t *obj, bool disabled) {
  if (!obj) return;
  if (disabled) lv_obj_add_state(obj, LV_STATE_DISABLED);
  else lv_obj_clear_state(obj, LV_STATE_DISABLED);
}
bool lv_obj_has_flag(lv_obj_t *obj,int flag){return (obj->flags & flag)!=0;}
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
// Solid-surface contrast coverage; image-backed task composition is exercised
// with the production helper in card_background_text_test.py.
lv_draw_task_t *card_background_prepare_text_task(lv_draw_task_t *task) { return task; }
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
struct CompanionRuntimeSnapshot {};
bool companion_action_focused(const CompanionRuntimeSnapshot &, const std::string &id, bool = false) {
  return companion_action_active(id);
}
struct CompanionCardRef {
  lv_obj_t *button;
  std::string action_id, url_config, metric_key;
  bool show_focus = true;
  std::string required_focus_id{};
};
bool companion_action_available(const std::string &) { return true; }
bool companion_action_available(const CompanionRuntimeSnapshot &, const std::string &) { return true; }
std::vector<CompanionCardRef> focus_cards;
auto &companion_card_refs() { return focus_cards; }
bool lv_obj_is_valid(lv_obj_t *obj) { return obj != nullptr; }
'''
grid = (headers / "button_grid_grid.h").read_text()
layout = (headers / "button_grid_layout.h").read_text()
source += "\n" + "\n".join(re.findall(r"^constexpr char CARD_SIZE_.*?;$", layout, re.MULTILINE))

source += "\nstruct lv_indev_t {}; lv_indev_t *lv_indev_get_act() { return nullptr; } void lv_indev_wait_release(lv_indev_t *) {}\n"

groups = (
    ("button_grid_slider_contrast.h", "", ("slider_text_contrast_event_cb", "slider_bind_text_contrast")),
    ("button_grid_display.h", "", ("display_correct_color",)),
    ("card_text_contrast.h", "", ("apply_card_descendant_text_color", "sync_card_checked_text_color", "card_text_contrast_event_cb", "sync_bound_card_text_color", "bind_card_text_contrast_events", "set_card_checked_state")),
    ("button_grid_touch.h", "", ("consume_button_touch_press",)),
    ("button_grid_layout.h", "", ("parse_hex_color", "apply_button_colors", "apply_button_on_pattern")),
    ("companion_controls.h", "", ("companion_apply_card_focus", "companion_required_focus_ready", "companion_refresh_card_focus")),
    ("button_grid_grid.h", "", ("card_palette_for_config", "card_slot_static_child", "reset_card_slot_dynamic_children")),
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
  assert(display_text_color_for_bg(0xB2B2B2) == 0xFFFFFF);
  assert(display_text_color_for_bg(0xB3B3B3) == 0x212121);
  assert(display_text_color_for_bg(0x00D9D9) == 0xFFFFFF);
  assert(display_text_color_for_bg(0x00DADA) == 0x212121);

  auto background = parse_cfg("light.kitchen;Kitchen;Auto;Auto;;;;;bg_image=kitchen-scene,card_off_color=3F51B5");
  assert(cfg_option_value(background.options, "bg_image") == "kitchen-scene");
  auto mac_background = parse_cfg("app.com.apple.finder;Finder;Auto;Auto;;;companion;;bg_image=mac-scene,icon_size=large");
  assert(cfg_option_value(mac_background.options, "bg_image") == "mac-scene");
  auto metric_background = parse_cfg("stat.cpu;CPU;Auto;Auto;;;companion;;bg_image=mac-scene");
  assert(cfg_option_value(metric_background.options, "bg_image") == "mac-scene");
  assert(cfg_option_value(background.options, "card_off_color") == "3F51B5");
  lv_obj_t background_button, background_text, background_shadow, nested_text;
  background_button.children = {&background_text, &background_shadow};
  background_shadow.flags = CARD_TEXT_COLOR_PROTECTED_FLAG;
  background_shadow.children = {&nested_text};
  background_shadow.text[0] = 0;
  apply_card_descendant_text_color(&background_button, 0xFFFFFF);
  assert(background_text.text[0] == 0xFFFFFF);
  assert(background_shadow.text[0] == 0);
  assert(nested_text.text[0] == 0xFFFFFF);

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
  assert(card_slider_fill_color(0x6633B9) == 0x826AAA);
  assert(active_card_color(0x6633B9) == 0xA385D5);
  assert(card_slider_fill_color(0xFFFFFF) == 0xBFBFBF);
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
    assert(card_slider_fill_color(background) != background);
    const auto active = active_card_color(background);
    const auto foreground = display_text_color_for_bg(active);
    assert(contrast(foreground, card_pattern_highlight_color(active)) >= contrast(foreground, active));
  }
  for (uint32_t background : {0x6D6D6Du, 0x6D6D6Eu, 0x6D6E6Du, 0x6E6D6Du, 0x6E6E6Du, 0x6D6E6Eu, 0x6E6D6Eu, 0x6E6E6Eu}) {
    assert(card_slider_fill_color(background) != background);
    assert(contrast(display_text_color_for_bg(background), card_slider_fill_color(background)) >= 4.5);
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
  assert(card_slider_fill_color(defaults) == defaults.on_val);
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
            assert(card_slider_fill_color(palette) == (mode == "matching"
              ? card_slider_fill_color(palette.off_val) : expected));
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
  assert(display_text_color_for_bg(lighter_card_color(0x00BCD4)) == 0xFFFFFF);
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
  assert(card_slider_fill_color(corrected) == card_slider_fill_color(corrected.off_val));
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
print("Card colour rendering checks passed: main/subpage contrast, defaults, display correction and Mac focus.")
