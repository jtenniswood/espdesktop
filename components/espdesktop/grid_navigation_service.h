#pragma once

#include <algorithm>
#include <cstddef>
#include <vector>

// A grid rebuild must temporarily return to the home page only when the grid
// already owns the visible screen. Setup, update, and other full-screen flows
// are independent of the grid and must remain visible while its widgets are
// refreshed in the background.
inline bool grid_navigation_rebuild_should_return_home(
    bool home_screen_active, int active_subpage_slot) {
  return home_screen_active || active_subpage_slot > 0;
}

enum class GridTouchEvent { PRESS, TAP, HOLD };
enum class GridTouchAction { IGNORE, CLEAR_PRESSED, CONSUME_WAKE_GUARD, WAKE, PRESS, CLICK };

inline GridTouchAction decide_grid_touch(
    GridTouchEvent event, bool wake_guard, bool display_active) {
  if (wake_guard) {
    return event == GridTouchEvent::PRESS ? GridTouchAction::CLEAR_PRESSED
                                         : GridTouchAction::CONSUME_WAKE_GUARD;
  }
  if (event == GridTouchEvent::PRESS) {
    return display_active ? GridTouchAction::PRESS : GridTouchAction::IGNORE;
  }
  return display_active ? GridTouchAction::CLICK : GridTouchAction::WAKE;
}

enum class CompanionPageSource { CARD, MAC_FOCUS };

class CompanionPageHistory {
 public:
  void opened(int active_slot, int next_slot, CompanionPageSource source) {
    const auto active = std::find(slots_.begin(), slots_.end(), active_slot);
    if (active == slots_.end()) slots_.assign(1, active_slot);
    else slots_.erase(active + 1, slots_.end());

    const auto earlier = std::find(slots_.begin(), slots_.end(), next_slot);
    if (earlier != slots_.end()) {
      slots_.erase(earlier + 1, slots_.end());
    } else if (source == CompanionPageSource::CARD || slots_.size() == 1) {
      slots_.push_back(next_slot);
    } else {
      // Following Mac focus replaces the current app page.
      slots_.back() = next_slot;
    }
  }

  int previous(int active_slot, int parent_slot) {
    const auto current = std::find(slots_.begin(), slots_.end(), active_slot);
    if (current == slots_.end() || current == slots_.begin()) {
      clear();
      return parent_slot;
    }
    const int previous_slot = *(current - 1);
    slots_.erase(current, slots_.end());
    return previous_slot;
  }

  void clear() { slots_.clear(); }

 private:
  // Slot zero is Home.
  std::vector<int> slots_;
};

struct CompanionPageExit {
  bool return_to_previous;
  bool discard_focus_request;
};

inline CompanionPageExit decide_companion_page_exit(
    bool focus_changed, bool current_app_closed,
    bool return_on_app_switch, bool focus_has_page) {
  if (!focus_changed && !current_app_closed) return {false, false};
  if (!return_on_app_switch) return {current_app_closed, true};
  return {!focus_has_page, false};
}

// Owns the runtime navigation registries for one button-grid instance.  The
// entries remain defined by the UI layer so this service stays independent of
// LVGL and can be exercised on the host.
template <typename HomeTarget, typename Subpage>
class GridNavigationService {
 public:
  int layout_slots{0};
  int layout_columns{0};
  CompanionPageHistory companion_page_history;
  std::vector<HomeTarget> &home_targets() { return home_targets_; }
  const std::vector<HomeTarget> &home_targets() const { return home_targets_; }

  std::vector<Subpage> &subpages() { return subpages_; }
  const std::vector<Subpage> &subpages() const { return subpages_; }

  size_t home_target_count() const { return home_targets_.size(); }
  size_t subpage_count() const { return subpages_.size(); }

  void clear_home_targets() { home_targets_.clear(); }
  void clear_subpages() { subpages_.clear(); }

 private:
  std::vector<HomeTarget> home_targets_;
  std::vector<Subpage> subpages_;
};
