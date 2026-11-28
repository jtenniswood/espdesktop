#pragma once

#ifdef ESPDESKTOP_S3_DISPLAY_BENCHMARK
#include <lvgl.h>
#include "esphome/components/espdesktop/s3_display_benchmark.h"

namespace espdesktop {

// Benches LVGL and real scan-out using private tiles that cannot invoke actions.
class S3RenderWorkload {
 public:
  void start() {
    this->previous_ = lv_screen_active();
    if (this->previous_ == nullptr) return;
    this->scene_ = lv_obj_create(nullptr);
    lv_obj_clear_flag(this->scene_, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(this->scene_, lv_color_hex(0x202127), 0);
    for (size_t index = 0; index < this->tiles_.size(); ++index) {
      auto *tile = lv_button_create(this->scene_);
      this->tiles_[index] = tile;
      lv_obj_set_size(tile, 144, 132);
      lv_obj_set_pos(tile, 16 + index % 3 * 152, 40 + index / 3 * 144);
      lv_obj_set_style_radius(tile, 22, 0);
      lv_obj_set_style_bg_color(tile, lv_color_hex(0x34363f), 0);
      lv_obj_set_style_bg_color(tile, lv_color_hex(0x3976df), LV_STATE_CHECKED);
      auto *label = lv_label_create(tile);
      lv_label_set_text_fmt(label, "Shortcut %u", static_cast<unsigned>(index + 1));
      lv_obj_center(label);
      lv_obj_add_event_cb(tile, [](lv_event_t *event) {
        auto *target = lv_event_get_target_obj(event);
        if (lv_obj_has_state(target, LV_STATE_CHECKED)) lv_obj_remove_state(target, LV_STATE_CHECKED);
        else lv_obj_add_state(target, LV_STATE_CHECKED);
      }, LV_EVENT_PRESSED, nullptr);
    }
    lv_screen_load(this->scene_);
    lv_timer_create([](lv_timer_t *timer) {
      static_cast<S3RenderWorkload *>(lv_timer_get_user_data(timer))->step_(timer);
    }, 100, this);
  }

 private:
  void step_(lv_timer_t *timer) {
    if (lv_screen_active() != this->scene_ || this->steps_ == 200) {
      lv_timer_delete(timer);
      if (lv_screen_active() == this->scene_ && lv_obj_is_valid(this->previous_))
        lv_screen_load(this->previous_);
      if (lv_screen_active() != this->scene_) lv_obj_delete(this->scene_);
      s3_display_benchmark.workload_finished.store(true, std::memory_order_release);
      return;
    }

    s3_display_benchmark.touch(true);
    const auto first = this->steps_++ % this->tiles_.size();
    lv_obj_send_event(this->tiles_[first], LV_EVENT_PRESSED, nullptr);
    lv_obj_send_event(this->tiles_[(first + 4) % this->tiles_.size()], LV_EVENT_PRESSED, nullptr);
    lv_refr_now(nullptr);
  }

  lv_obj_t *previous_ = nullptr;
  lv_obj_t *scene_ = nullptr;
  std::array<lv_obj_t *, 9> tiles_{};
  unsigned steps_ = 0;
};

inline S3RenderWorkload s3_render_workload;
}  // namespace espdesktop
#endif
