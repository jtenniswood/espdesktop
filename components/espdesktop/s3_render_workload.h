#pragma once

#ifdef ESPDESKTOP_S3_DISPLAY_BENCHMARK
#include <lvgl.h>
#include "esphome/components/espdesktop/s3_display_benchmark.h"

namespace espdesktop {

// Benches LVGL and real scan-out using private tiles that cannot invoke actions.
class S3RenderWorkload {
 public:
  void start(bool page_transitions) {
    this->previous_ = lv_screen_active();
    if (this->previous_ == nullptr) return;
    this->scenes_[0] = this->create_scene_(false);
    if (page_transitions) this->scenes_[1] = this->create_scene_(true);
    s3_display_benchmark.workload_pages.store(page_transitions, std::memory_order_relaxed);
    lv_screen_load(this->scenes_[0]);
    lv_timer_create([](lv_timer_t *timer) {
      static_cast<S3RenderWorkload *>(lv_timer_get_user_data(timer))->step_(timer);
    }, 100, this);
  }

 private:
  lv_obj_t *create_scene_(bool secondary) {
    auto *scene = lv_obj_create(nullptr);
    lv_obj_clear_flag(scene, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(scene, lv_color_hex(secondary ? 0x253040 : 0x202127), 0);
    auto *heading = lv_label_create(scene);
    lv_label_set_text(heading, secondary ? "Shortcut page" : "Home");
    lv_obj_set_style_text_color(heading, lv_color_white(), 0);
    lv_obj_align(heading, LV_ALIGN_TOP_MID, 0, 10);
    for (size_t index = 0; index < this->tiles_.size(); ++index) {
      auto *tile = lv_button_create(scene);
      if (!secondary) this->tiles_[index] = tile;
      lv_obj_set_size(tile, 144, 132);
      lv_obj_set_pos(tile, 16 + index % 3 * 152, 40 + index / 3 * 144);
      lv_obj_set_style_radius(tile, 22, 0);
      lv_obj_set_style_bg_color(tile, lv_color_hex(secondary ? 0x33465a : 0x34363f), 0);
      lv_obj_set_style_bg_color(tile, lv_color_hex(0x3976df), LV_STATE_CHECKED);
      auto *label = lv_label_create(tile);
      lv_label_set_text_fmt(label, secondary ? "Action %u" : "Shortcut %u", static_cast<unsigned>(index + 1));
      lv_obj_center(label);
      lv_obj_add_event_cb(tile, [](lv_event_t *event) {
        auto *target = lv_event_get_target_obj(event);
        if (lv_obj_has_state(target, LV_STATE_CHECKED)) lv_obj_remove_state(target, LV_STATE_CHECKED);
        else lv_obj_add_state(target, LV_STATE_CHECKED);
      }, LV_EVENT_PRESSED, nullptr);
    }
    return scene;
  }

  void step_(lv_timer_t *timer) {
    auto *active = lv_screen_active();
    const bool own_screen = active != nullptr && (active == this->scenes_[0] || active == this->scenes_[1]);
    if (!own_screen || this->steps_ == 200) {
      lv_timer_delete(timer);
      if (own_screen && lv_obj_is_valid(this->previous_))
        lv_screen_load(this->previous_);
      for (auto *scene : this->scenes_) {
        if (scene != nullptr && scene != lv_screen_active() && lv_obj_is_valid(scene))
          lv_obj_delete(scene);
      }
      s3_display_benchmark.workload_finished.store(true, std::memory_order_release);
      return;
    }

    s3_display_benchmark.touch(true);
    if (this->scenes_[1] != nullptr) {
      lv_screen_load(active == this->scenes_[0] ? this->scenes_[1] : this->scenes_[0]);
    } else {
      const auto first = this->steps_ % this->tiles_.size();
      lv_obj_send_event(this->tiles_[first], LV_EVENT_PRESSED, nullptr);
      lv_obj_send_event(this->tiles_[(first + 4) % this->tiles_.size()], LV_EVENT_PRESSED, nullptr);
    }
    ++this->steps_;
    lv_refr_now(nullptr);
  }

  lv_obj_t *previous_ = nullptr;
  std::array<lv_obj_t *, 2> scenes_{};
  std::array<lv_obj_t *, 9> tiles_{};
  unsigned steps_ = 0;
};

inline S3RenderWorkload s3_render_workload;
}  // namespace espdesktop
#endif
