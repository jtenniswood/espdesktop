#include <cassert>

#include "espdesktop_app_core.h"
#include "grid_navigation_service.h"

namespace {

struct HomeTarget {
  int slot = 0;
};

struct Subpage {
  int slot = 0;
};

}  // namespace

int main() {
  assert(!grid_navigation_rebuild_should_return_home(false, 0));
  assert(grid_navigation_rebuild_should_return_home(true, 0));
  assert(grid_navigation_rebuild_should_return_home(false, 2));

  assert(decide_grid_touch(GridTouchEvent::PRESS, true, true) == GridTouchAction::CLEAR_PRESSED);
  assert(decide_grid_touch(GridTouchEvent::PRESS, false, false) == GridTouchAction::IGNORE);
  assert(decide_grid_touch(GridTouchEvent::PRESS, false, true) == GridTouchAction::PRESS);
  for (auto event : {GridTouchEvent::TAP, GridTouchEvent::HOLD}) {
    assert(decide_grid_touch(event, true, true) == GridTouchAction::CONSUME_WAKE_GUARD);
    assert(decide_grid_touch(event, false, false) == GridTouchAction::WAKE);
    assert(decide_grid_touch(event, false, true) == GridTouchAction::CLICK);
  }

  const auto focus = decide_companion_page_exit(true, false, false, true);
  assert(!focus.return_to_previous && focus.discard_focus_request);
  const auto closed = decide_companion_page_exit(false, true, false, false);
  assert(closed.return_to_previous && closed.discard_focus_request);
  assert(!decide_companion_page_exit(true, true, true, true).return_to_previous);
  assert(decide_companion_page_exit(true, false, true, false).return_to_previous);
  assert(!decide_companion_page_exit(false, false, false, false).discard_focus_request);

  CompanionPageHistory history;
  const int folder = 1;
  const int safari = 33;
  const int finder = 34;
  history.opened(folder, safari, CompanionPageSource::CARD);
  history.opened(safari, finder, CompanionPageSource::MAC_FOCUS);
  assert(history.previous(finder, 0) == folder);
  history.opened(folder, safari, CompanionPageSource::CARD);
  history.opened(safari, finder, CompanionPageSource::CARD);
  assert(history.previous(finder, folder) == safari);
  // Back has changed the visible page. A subsequent app open drops that stale
  // forward history and returns to the page the user actually came from.
  history.opened(folder, finder, CompanionPageSource::CARD);
  assert(history.previous(finder, 0) == folder);
  history.clear();
  assert(history.previous(safari, folder) == folder);

  GridNavigationService<HomeTarget, Subpage> navigation;

  navigation.home_targets().push_back({1});
  navigation.subpages().push_back({2});

  assert(navigation.home_target_count() == 1);
  assert(navigation.subpage_count() == 1);
  assert(navigation.home_targets().front().slot == 1);
  assert(navigation.subpages().front().slot == 2);

  navigation.clear_home_targets();
  assert(navigation.home_target_count() == 0);
  assert(navigation.subpage_count() == 1);

  navigation.clear_subpages();
  assert(navigation.subpage_count() == 0);

  espdesktop::EspDesktopAppCore app;
  assert(app.start());
  auto &core_navigation = app.grid_navigation_service<
      GridNavigationService<HomeTarget, Subpage>>();
  core_navigation.home_targets().push_back({3});
  assert(core_navigation.home_target_count() == 1);
  assert(app.stop());
  return 0;
}
