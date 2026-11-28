#pragma once

#ifdef ESPDESKTOP_S3_DISPLAY_BENCHMARK
#include <lvgl.h>
#include "esphome/components/espdesktop/s3_display_benchmark.h"
#include "esphome/components/lvgl/lvgl_esphome.h"

namespace espdesktop {

// Benches LVGL and real scan-out using private tiles that cannot invoke actions.
class S3RenderWorkload {
 public:
  void start(bool page_transitions, bool mixed) {
    this->start_(mixed ? S3WorkloadKind::Mixed : page_transitions ? S3WorkloadKind::Pages : S3WorkloadKind::Tiles);
  }

  void start_pointer(esphome::lvgl::LVTouchListener *pointer) {
    this->pointer_ = pointer;
    this->start_(S3WorkloadKind::Pointer);
  }

 private:
  static constexpr unsigned event_count_ = 200;

  void start_(S3WorkloadKind kind) {
    this->previous_ = lv_screen_active();
    if (this->previous_ == nullptr) return;
    this->kind_ = kind;
    this->scenes_[0] = this->create_scene_(false);
    if (kind != S3WorkloadKind::Tiles) this->scenes_[1] = this->create_scene_(true);
    s3_display_benchmark.workload_kind.store(this->kind_, std::memory_order_relaxed);
    lv_screen_load(this->scenes_[0]);
    lv_timer_create([](lv_timer_t *timer) {
      static_cast<S3RenderWorkload *>(lv_timer_get_user_data(timer))->step_(timer);
    }, kind == S3WorkloadKind::Pointer ? 75 : 100, this);
  }

  lv_obj_t *create_scene_(bool secondary) {
    auto *scene = lv_obj_create(nullptr);
    lv_obj_clear_flag(scene, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_style_bg_color(scene, lv_color_hex(secondary ? 0x253040 : 0x202127), 0);
    auto *heading = lv_label_create(scene);
    lv_label_set_text(heading, secondary ? "Shortcut page" : "Home");
    lv_obj_set_style_text_color(heading, lv_color_white(), 0);
    lv_obj_align(heading, LV_ALIGN_TOP_MID, 0, 10);
    auto &tiles = this->tiles_[secondary ? 1 : 0];
    for (size_t index = 0; index < tiles.size(); ++index) {
      auto *tile = lv_button_create(scene);
      tiles[index] = tile;
      lv_obj_set_size(tile, 144, 132);
      lv_obj_set_pos(tile, 16 + index % 3 * 152, 40 + index / 3 * 144);
      lv_obj_set_style_radius(tile, 22, 0);
      lv_obj_set_style_bg_color(tile, lv_color_hex(secondary ? 0x33465a : 0x34363f), 0);
      lv_obj_set_style_bg_color(tile, lv_color_hex(0x3976df), LV_STATE_CHECKED);
      auto *label = lv_label_create(tile);
      if (this->kind_ == S3WorkloadKind::Pointer && index == 0) {
        lv_label_set_text(label, secondary ? "Back" : "Open page");
        lv_obj_add_event_cb(tile, [](lv_event_t *event) {
          auto *self = static_cast<S3RenderWorkload *>(lv_event_get_user_data(event));
          if (lv_event_get_target_obj(event) != self->pointer_target_ || !self->page_release_us_) return;
          s3_display_benchmark.page_requested(self->page_release_us_);
          lv_screen_load(lv_screen_active() == self->scenes_[0] ? self->scenes_[1] : self->scenes_[0]);
          s3_display_benchmark.pointer_page_changes.fetch_add(1, std::memory_order_relaxed);
        }, LV_EVENT_CLICKED, this);
      } else {
        lv_label_set_text_fmt(label, secondary ? "Action %u" : "Shortcut %u", static_cast<unsigned>(index + 1));
      }
      lv_obj_center(label);
      lv_obj_add_event_cb(tile, [](lv_event_t *event) {
        auto *target = lv_event_get_target_obj(event);
        if (lv_obj_has_state(target, LV_STATE_CHECKED)) lv_obj_remove_state(target, LV_STATE_CHECKED);
        else lv_obj_add_state(target, LV_STATE_CHECKED);
        auto *self = static_cast<S3RenderWorkload *>(lv_event_get_user_data(event));
        if (self->kind_ == S3WorkloadKind::Pointer && target == self->pointer_target_)
          s3_display_benchmark.pointer_presses.fetch_add(1, std::memory_order_relaxed);
      }, LV_EVENT_PRESSED, this);
    }
    return scene;
  }

  void pointer_step_(lv_obj_t *active) {
    if (this->pointer_down_) {
      this->page_release_us_ = esp_timer_get_time();
      this->pointer_->release();
      this->pointer_down_ = false;
      return;
    }
    const auto &tiles = this->tiles_[active == this->scenes_[0] ? 0 : 1];
    const size_t index = this->steps_ % 4 == 0 ? 0 : 1 + (this->steps_ % (tiles.size() - 1));
    this->pointer_target_ = tiles[index];
    this->page_release_us_ = 0;
    lv_area_t area;
    lv_obj_get_coords(this->pointer_target_, &area);
    esphome::touchscreen::TouchPoint point{};
    // The S3 listener and LVGL each apply 180°, so their rotations cancel.
    point.x = (area.x1 + area.x2) / 2;
    point.y = (area.y1 + area.y2) / 2;
    point.state = esphome::touchscreen::STATE_PRESSED;
    s3_display_benchmark.touch(true);
    this->pointer_->update({point});
    this->pointer_down_ = true;
    ++this->steps_;
  }

  void step_(lv_timer_t *timer) {
    auto *active = lv_screen_active();
    const bool own_screen = active != nullptr && (active == this->scenes_[0] || active == this->scenes_[1]);
    if (!own_screen || (this->steps_ == event_count_ && !this->pointer_down_)) {
      if (this->pointer_down_) this->pointer_->release();
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

    if (this->pointer_ != nullptr) {
      this->pointer_step_(active);
      return;
    }
    s3_display_benchmark.touch(true);
    if (this->kind_ == S3WorkloadKind::Pages ||
        (this->kind_ == S3WorkloadKind::Mixed && this->steps_ % 4 == 0)) {
      lv_screen_load(active == this->scenes_[0] ? this->scenes_[1] : this->scenes_[0]);
    } else {
      const auto &tiles = this->tiles_[active == this->scenes_[0] ? 0 : 1];
      const auto first = this->steps_ % tiles.size();
      lv_obj_send_event(tiles[first], LV_EVENT_PRESSED, nullptr);
      lv_obj_send_event(tiles[(first + 4) % tiles.size()], LV_EVENT_PRESSED, nullptr);
    }
    ++this->steps_;
    lv_refr_now(nullptr);
  }

  lv_obj_t *previous_ = nullptr;
  std::array<lv_obj_t *, 2> scenes_{};
  std::array<std::array<lv_obj_t *, 9>, 2> tiles_{};
  S3WorkloadKind kind_ = S3WorkloadKind::Tiles;
  unsigned steps_ = 0;
  esphome::lvgl::LVTouchListener *pointer_ = nullptr;
  lv_obj_t *pointer_target_ = nullptr;
  int64_t page_release_us_ = 0;
  bool pointer_down_ = false;
};

inline S3RenderWorkload s3_render_workload;
}  // namespace espdesktop
#endif
