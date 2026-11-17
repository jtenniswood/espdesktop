#pragma once

#include <string_view>
#include "companion_capabilities_generated.h"

inline const OBSConfirmationControl *companion_obs_confirmation_control(std::string_view id) {
  for (const auto &control : OBS_CONFIRMATION_CONTROLS)
    if (id == control.id) return &control;
  return nullptr;
}

inline bool companion_obs_output_card(std::string_view id) {
  const auto *control = companion_obs_confirmation_control(id);
  return control && !control->toggle;
}

inline bool companion_obs_confirmable_toggle(std::string_view id) {
  const auto *control = companion_obs_confirmation_control(id);
  return control && control->toggle;
}

inline bool companion_obs_confirmation_supported(std::string_view id) {
  return companion_obs_confirmation_control(id) != nullptr;
}

inline bool companion_obs_needs_confirmation(std::string_view id, std::string_view mode,
                                             std::string_view label, OBSCardState state = OBSCardState::unknown) {
  const auto *control = companion_obs_confirmation_control(id);
  if (!control || mode == "none") return false;
  if (mode != "on" && mode != "off" && mode != "both") mode = control->default_when;
  if (state != OBSCardState::unknown) {
    const bool stopping = obs_card_presentation(state).lit;
    return mode == "both" || (mode == "off" ? stopping : !stopping);
  }
  if (mode == "on") return control->toggle ? label != "On" : label.rfind("Stop ", 0) != 0;
  if (mode == "off") return control->toggle ? label != "Off" : label.rfind("Start ", 0) != 0;
  return true;
}
