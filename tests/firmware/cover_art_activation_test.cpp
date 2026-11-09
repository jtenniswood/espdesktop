// Compiled by cover_art_activation_test.py with production YAML action bodies.
#include <algorithm>
#include <cassert>
#include <cstdio>
#include <functional>
#include <memory>
#include <string>
#include <tuple>
#include <vector>
#include "esphome_automation_chain.h"
#include "cover_art.h"
#include "display_mode_controller.h"

using Action = esphome::Action<>;
using ActionList = esphome::ActionList<>;
int depth = 0, peak_depth = 0, artwork_depth = 0, layout_depth = 0;
uint64_t now_ms = 0;
struct Event { const void *key; uint64_t due; std::function<void()> callback; };
std::vector<Event> events;
void cancel(const void *key) {
  events.erase(std::remove_if(events.begin(), events.end(),
                             [key](auto &e) { return e.key == key; }), events.end());
}
void schedule(const void *key, uint32_t delay, std::function<void()> callback) {
  cancel(key);
  events.push_back({key, now_ms + delay, std::move(callback)});
}
void tick() {
  ++now_ms;
  while (true) {
    auto it = std::find_if(events.begin(), events.end(), [](auto &event) { return event.due <= now_ms; });
    if (it == events.end()) break;
    auto callback = std::move(it->callback);
    events.erase(it);
    callback();
  }
}
void drain() {
  for (int i = 0; !events.empty() && i < 5000; ++i) tick();
  assert(events.empty());
}

struct Script {
  ActionList actions;
  std::tuple<int, int, std::string, bool> args;
  std::function<void()> io;
  int calls = 0;
  void execute() {
    if (actions.is_running()) actions.stop();
    ++calls;
    if (io) io();
    actions.play();
  }
  void execute(int generation) { args = {generation, 0, "", false}; execute(); }
  void execute(int generation, int mode) { args = {generation, mode, "", false}; execute(); }
  void stop() { actions.stop(); }
  bool is_running() { return actions.is_running(); }
};
struct CallbackAction final : Action {
  std::function<void()> callback;
  explicit CallbackAction(std::function<void()> fn) : callback(std::move(fn)) {}
  void play_complex() override {
    ++depth; peak_depth = std::max(peak_depth, depth);
    Action::play_complex();
    --depth;
  }
  void play() override { callback(); }
};
struct Delay : Action {
  virtual ~Delay() = default;
  uint32_t delay;
  explicit Delay(uint32_t delay) : delay(delay) {}
  void play_complex() override {
    ++this->num_running_;
    schedule(this, delay, [this] { this->play_next_(); });
  }
  void play() override {}
  void stop() override { cancel(this); }
};
struct Wait final : Delay {
  Script &target;
  explicit Wait(Script &target) : Delay(1), target(target) {}
  void poll() {
    if (!target.is_running()) this->play_next_();
    else schedule(this, 1, [this] { poll(); });
  }
  void play_complex() override { ++this->num_running_; poll(); }
};
struct Branch final : Action {
  std::function<bool()> condition;
  ActionList yes, no;
  CallbackAction continuation{[this] { this->play_next_(); }};
  explicit Branch(std::function<bool()> condition) : condition(std::move(condition)) {}
  void play_complex() override {
    ++this->num_running_;
    (condition() ? yes : no).play();
  }
  void play() override {}
  void stop() override { yes.stop(); no.stop(); }
};
// Action has no virtual destructor; shared ownership retains the concrete deleter.
std::vector<std::shared_ptr<Action>> owned;
Action *make_action(Script &, std::function<void()> callback) {
  owned.push_back(std::make_shared<CallbackAction>(std::move(callback)));
  return owned.back().get();
}
Action *make_delay(Script &, uint32_t delay) {
  owned.push_back(std::make_shared<Delay>(delay)); return owned.back().get();
}
Action *make_wait(Script &, Script &target) {
  owned.push_back(std::make_shared<Wait>(target)); return owned.back().get();
}
Action *make_if(Script &, std::function<bool()> condition,
                std::initializer_list<Action *> yes, std::initializer_list<Action *> no) {
  auto node = std::make_shared<Branch>(std::move(condition));
  node->yes.add_actions(yes); node->yes.add_action(&node->continuation);
  node->no.add_actions(no); node->no.add_action(&node->continuation);
  owned.push_back(std::move(node)); return owned.back().get();
}


struct App {
  espdesktop::DisplayModeController controller;
  auto &display() { return controller; }
} espdesktop_app;
struct Setting { bool state = true; } cover_art_screensaver_enabled;
espdesktop::cover_art::RuntimeState cover_art_runtime;
uint32_t cover_art_transition_generation = 0;
uint32_t cover_art_content_fingerprint = 1;
bool cover_art_media_playing = true, image_source_detached = false;
bool cover_art_delay_interrupted_by_transition = false;
uint32_t cover_art_manual_pause_until_ms = 0;
float cover_art_media_position = 0, cover_art_position_anchor = 0, cover_art_media_duration = 0;
int cover_art_position_anchor_epoch = 0, cover_art_last_position_timestamp = 0, cover_art_last_progress_percent = -1;
std::string cover_art_last_playback_state = "playing";
int cover_art_progress_bar = 0, cover_art_time_label = 0;
constexpr int LV_ANIM_OFF = 0, LV_OBJ_FLAG_HIDDEN = 1;
int cover_art_image_widget = 0, companion_image_bindings = 0;
void lv_bar_set_value(int, int, int) {}
void lv_label_set_text(int, const char *) {}
void lv_obj_add_flag(int, int) {}
void lv_obj_clear_flag(int, int) {}
void lv_image_set_src(int, const void *) { ++companion_image_bindings; }
struct Image {
  bool available = true;
  int releases = 0;
  bool has_image() const { return available; }
  const void *get_lv_image_dsc() const { return this; }
  void release() { assert(image_source_detached); available = false; ++releases; }
} image;
Image *cover_art_downloaded_image = &image;
#define VERSION_CODE(a,b,c) ((a)*10000+(b)*100+(c))
#define ESPHOME_VERSION_CODE VERSION_CODE(2026,10,2)
#define id(x) x
#define ESP_LOGD(...) ((void)0)
#define ESP_LOGI(...) ((void)0)
// GENERATED_SCRIPT_DECLARATIONS
void reset() {
  for (Script *script : {&display_mode_effect_cover_art, &cover_art_prepare_activation,
      &cover_art_request_artwork, &cover_art_hide_effect, &cover_art_release_stopped_artwork,
      &cover_art_return_home_after_playback, &cover_art_playback_stopped, &cover_art_delayed_playback_stopped}) {
    script->stop(); script->calls = 0;
  }
  events.clear();
  espdesktop_app.controller = {};
  espdesktop_app.controller.request(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK,
                                    espdesktop::DisplayMode::COVER_ART);
  cover_art_transition_generation = espdesktop_app.controller.generation();
  cover_art_content_fingerprint = 1;
  cover_art_screensaver_enabled.state = true;
  cover_art_media_playing = true;
  cover_art_runtime.clear_image();
  cover_art_runtime.loaded_url = "companion:1";
  cover_art_runtime.image_available = true;
  image.available = true; image.releases = 0;
  image_source_detached = false; companion_image_bindings = 0;
  cover_art_show_black_screen.calls = 0;
  cover_art_apply_responsive_layout.calls = 0;
  display_mode_clear_cover_art.io = [] {
    espdesktop_app.controller.clear(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK);
  };
  cover_art_clear_image_source.io = [] { image_source_detached = true; };
}
int main() {
  // GENERATED_SCRIPT_SETUP
  reset();
  display_mode_effect_cover_art.execute(cover_art_transition_generation);
  assert(companion_image_bindings == 0 && cover_art_apply_responsive_layout.calls == 0);
  drain();
  assert(companion_image_bindings == 1 && cover_art_runtime.image_available);
  // Wake, track replacement, disabling and stopping all cancel delayed activation.
  for (int reason = 0; reason < 5; ++reason) {
    reset();
    cover_art_prepare_activation.execute(cover_art_transition_generation, 1);
    assert(cover_art_request_artwork.calls == 0);
    switch (reason) {
      case 0: cover_art_prepare_activation.stop(); break;
      case 1: espdesktop_app.controller.request(espdesktop::DisplayRequestSource::USER_WAKE,
                                               espdesktop::DisplayMode::ACTIVE); break;
      case 2: ++cover_art_content_fingerprint; break;
      case 3: cover_art_screensaver_enabled.state = false; break;
      case 4: cover_art_media_playing = false; break;
    }
    drain();
    assert(cover_art_request_artwork.calls == 0 && companion_image_bindings == 0);
  }
  reset();
  cover_art_prepare_activation.execute(cover_art_transition_generation, 1);
  cover_art_hide_effect.execute(cover_art_transition_generation - 1,
                               static_cast<int>(espdesktop::DisplayMode::ACTIVE));
  drain();
  assert(companion_image_bindings == 1); // Stale teardown cannot cancel the current activation.
  reset();
  cover_art_prepare_activation.execute(cover_art_transition_generation, 1);
  espdesktop_app.controller.request(espdesktop::DisplayRequestSource::USER_WAKE,
                                    espdesktop::DisplayMode::ACTIVE);
  cover_art_hide_effect.execute(espdesktop_app.controller.generation(),
                               static_cast<int>(espdesktop::DisplayMode::ACTIVE));
  drain();
  assert(companion_image_bindings == 0);
  reset();
  image.available = false; cover_art_runtime.image_available = false;
  cover_art_prepare_activation.execute(cover_art_transition_generation, 1);
  drain();
  assert(companion_image_bindings == 0 && cover_art_show_black_screen.calls == 1);
  // Playback end detaches pixels before freeing them, including after a previous Wake.
  for (bool hidden : {false, true}) {
    reset();
    if (hidden) espdesktop_app.controller.request(espdesktop::DisplayRequestSource::USER_WAKE,
                                                espdesktop::DisplayMode::ACTIVE);
    cover_art_playback_stopped.execute();
    drain();
    assert(image.releases == 1 && image_source_detached && !cover_art_runtime.image_available);
  }
  reset();
  display_mode_clear_cover_art.io = [] {
    cover_art_media_playing = true;
    espdesktop_app.controller.clear(espdesktop::DisplayRequestSource::MEDIA_PLAYBACK);
  };
  cover_art_playback_stopped.execute();
  drain();
  assert(image.releases == 0); // Resumed playback still owns its image.
  std::puts("Companion artwork activation, stale-track cancellation and pixel ownership passed.");
}
