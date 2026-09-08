#include "espdesktop_app_core.h"

namespace espdesktop {

EspDesktopAppCore::~EspDesktopAppCore() {
  if (active_espdesktop_app_core() == this) active_espdesktop_app_core() = nullptr;
  if (home_assistant_callback_owner_service_binding() ==
      &home_assistant_callback_owner_) {
    set_home_assistant_callback_owner_service(nullptr);
  }
}

bool EspDesktopAppCore::configure_configuration_service(
    configuration::ConfigurationStore &store,
    configuration::LegacyConfigurationAdapter &legacy,
    const configuration::ConfigurationDocumentValidator *validator,
    configuration::LegacyConfigurationMode legacy_mode) {
  if (configuration_service_) return false;
  configuration_service_.emplace(store, legacy, validator, nullptr, 0,
                                 legacy_mode);
  return true;
}

bool EspDesktopAppCore::start() {
  if (lifecycle_state_ != AppLifecycleState::CONSTRUCTED) return false;
  active_espdesktop_app_core() = this;
  set_home_assistant_callback_owner_service(&home_assistant_callback_owner_);
  if (!display_lifecycle_.start()) {
    if (active_espdesktop_app_core() == this) active_espdesktop_app_core() = nullptr;
    set_home_assistant_callback_owner_service(nullptr);
    return false;
  }
  lifecycle_state_ = AppLifecycleState::RUNNING;
  return true;
}

bool EspDesktopAppCore::run_once() {
  if (lifecycle_state_ != AppLifecycleState::RUNNING) return false;
  if (!display_lifecycle_.run_once()) return false;
  ++loop_count_;
  return true;
}

bool EspDesktopAppCore::stop() {
  if (lifecycle_state_ != AppLifecycleState::RUNNING) return false;
  if (!display_lifecycle_.stop()) return false;
  companion_view_service_.reset();
  companion_runtime_.reset();
  home_assistant_binding_service_.reset();
  modal_state_service_.reset();
  grid_navigation_service_.reset();
  if (active_espdesktop_app_core() == this) active_espdesktop_app_core() = nullptr;
  set_home_assistant_callback_owner_service(nullptr);
  lifecycle_state_ = AppLifecycleState::STOPPED;
  return true;
}

}  // namespace espdesktop
