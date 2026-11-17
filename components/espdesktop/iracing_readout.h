#pragma once

#include <cstdio>
#include <string>
#include <string_view>

#include "companion_runtime.h"
#include "companion_shortcut_page.h"
#include "i18n_generated.h"

enum class IracingReadout : uint8_t { NONE, FUEL, LAP, PIT };

inline IracingReadout companion_iracing_readout(std::string_view preset) {
  const std::string_view app = IRACING_COMPANION_APP;
  if (preset.substr(0, app.size()) != app) return IracingReadout::NONE;
  preset.remove_prefix(app.size());
  if (preset == ":3") return IracingReadout::FUEL;
  if (preset == ":0") return IracingReadout::LAP;
  if (preset == ":4") return IracingReadout::PIT;
  return IracingReadout::NONE;
}

inline std::string companion_iracing_readout_text(IracingReadout readout,
    const std::optional<IracingPanelTelemetry> &telemetry) {
  if (!telemetry) return "--";
  char text[40];
  if (readout == IracingReadout::FUEL && telemetry->fuel_litres) {
    snprintf(text, sizeof(text), "%.1f L", *telemetry->fuel_litres);
    return text;
  }
  if (readout == IracingReadout::LAP && telemetry->lap) {
    snprintf(text, sizeof(text), "%d", *telemetry->lap);
    std::string label = std::string(espdesktop_i18n_key("iracing_lap")) + " " + text;
    if (telemetry->delta_seconds) {
      snprintf(text, sizeof(text), "%+.2f s", *telemetry->delta_seconds);
      label += " · " + std::string(text);
    }
    return label;
  }
  if (readout == IracingReadout::PIT) {
    if (telemetry->flag == IracingFlag::CHECKERED) return espdesktop_i18n_key("iracing_checkered_flag");
    if (telemetry->flag == IracingFlag::YELLOW) return espdesktop_i18n_key("iracing_yellow_flag");
    if (telemetry->on_pit_road.value_or(false)) return espdesktop_i18n_key("iracing_pit_road");
    if (telemetry->on_pit_road || telemetry->flag) return "";
  }
  return "--";
}
