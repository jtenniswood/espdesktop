#pragma once

#include <cstdint>

#include "display_mode_controller.h"

namespace espdesktop {

enum class DisplayLifecycleState : uint8_t {
  CONSTRUCTED,
  RUNNING,
  STOPPED,
};

enum class BacklightOnResponse : uint8_t { KEEP_ON, KEEP_OFF, WAKE };

// Owns display-mode state independently of the ESPHome component lifecycle.
// The controller accessor remains available while YAML wiring migrates through
// this service boundary.
class DisplayLifecycleService {
 public:
  bool start() {
    if (state_ != DisplayLifecycleState::CONSTRUCTED) return false;
    state_ = DisplayLifecycleState::RUNNING;
    return true;
  }

  bool run_once() {
    if (state_ != DisplayLifecycleState::RUNNING) return false;
    ++loop_count_;
    return true;
  }

  bool stop() {
    if (state_ != DisplayLifecycleState::RUNNING) return false;
    state_ = DisplayLifecycleState::STOPPED;
    return true;
  }

  DisplayLifecycleState state() const { return state_; }
  uint32_t loop_count() const { return loop_count_; }
  DisplayModeController &controller() { return controller_; }
  const DisplayModeController &controller() const { return controller_; }

  void set_blank_page_active(bool active) { blank_page_active_ = active; }
  bool blank_page_active() const { return blank_page_active_; }

  BacklightOnResponse backlight_on_response(bool waiting_for_time) const {
    // WiFi setup needs the backlight before the device can get network time.
    if (controller_.target_source_is(DisplayRequestSource::ONBOARDING)) {
      return BacklightOnResponse::KEEP_ON;
    }
    if (waiting_for_time ||
        (controller_.target_source_is(DisplayRequestSource::SCREEN_SCHEDULE) &&
         controller_.target_mode_is(DisplayMode::DISPLAY_OFF))) {
      return BacklightOnResponse::KEEP_OFF;
    }
    return controller_.current_mode_is(DisplayMode::DISPLAY_OFF)
        ? BacklightOnResponse::WAKE : BacklightOnResponse::KEEP_ON;
  }

  void begin_wake(bool clock_visible) {
    wake_needs_reconcile_ = controller_.has_transition_in_progress() ||
        controller_.presentation_incomplete() || clock_visible || blank_page_active_ ||
        !controller_.target_mode_is(DisplayMode::ACTIVE) ||
        !controller_.current_mode_is(DisplayMode::ACTIVE);
    wake_touch_guard_ = wake_touch_guard_ || blank_page_active_ ||
        controller_.target_mode_is(DisplayMode::DISPLAY_OFF);
    controller_.cancel_transition();
    if (wake_needs_reconcile_) controller_.require_presentation_cleanup();
  }

  bool wake_touch_guard() const { return wake_touch_guard_; }
  void clear_wake_touch_guard() { wake_touch_guard_ = false; }

  bool take_wake_reconcile() {
    const bool pending = wake_needs_reconcile_;
    wake_needs_reconcile_ = false;
    return pending || !controller_.current_mode_is(DisplayMode::ACTIVE);
  }

  bool allows_focus_navigation() const {
    return !blank_page_active_ && !wake_touch_guard_ &&
        controller_.current_mode_is(DisplayMode::ACTIVE) &&
        controller_.target_mode_is(DisplayMode::ACTIVE);
  }

 private:
  DisplayLifecycleState state_{DisplayLifecycleState::CONSTRUCTED};
  uint32_t loop_count_{0};
  DisplayModeController controller_{};
  bool blank_page_active_{false};
  bool wake_needs_reconcile_{false};
  bool wake_touch_guard_{false};
};

}  // namespace espdesktop
