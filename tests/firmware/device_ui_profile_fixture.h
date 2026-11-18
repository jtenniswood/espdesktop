#pragma once

#include <cstdlib>
#include <cstring>

#include "device_ui_limits.h"

inline const espdesktop::DeviceUiLimits &test_device_ui_profile(const char *slug) {
  for (const auto &profile : espdesktop::DEVICE_UI_PROFILES) {
    if (std::strcmp(profile.device_profile, slug) == 0)
      return profile;
  }
  std::abort();
}
