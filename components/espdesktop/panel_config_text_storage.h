#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

#if __has_include("esphome/core/defines.h")
#include "esphome/core/defines.h"
#endif
#include "panel_config_document.h"

namespace espdesktop::configuration {

// Code generation sizes these setup and compatibility fields for the actual
// configured text entities. The native document's 32-slot format is unchanged.
#ifdef ESPDESKTOP_PANEL_CONFIG_TEXT_SLOT_COUNT
inline constexpr size_t PANEL_CONFIG_TEXT_SLOT_COUNT =
    ESPDESKTOP_PANEL_CONFIG_TEXT_SLOT_COUNT;
#else
inline constexpr size_t PANEL_CONFIG_TEXT_SLOT_COUNT =
    PANEL_CONFIG_MAX_SLOT_COUNT;
#endif
#ifdef ESPDESKTOP_PANEL_CONFIG_TEXT_CHUNK_COUNT
inline constexpr size_t PANEL_CONFIG_TEXT_CHUNK_COUNT =
    ESPDESKTOP_PANEL_CONFIG_TEXT_CHUNK_COUNT;
#else
inline constexpr size_t PANEL_CONFIG_TEXT_CHUNK_COUNT = 8;
#endif
static_assert(PANEL_CONFIG_TEXT_SLOT_COUNT > 0 &&
              PANEL_CONFIG_TEXT_SLOT_COUNT <= PANEL_CONFIG_MAX_SLOT_COUNT);
static_assert(PANEL_CONFIG_TEXT_CHUNK_COUNT >= 4 &&
              PANEL_CONFIG_TEXT_CHUNK_COUNT <= 8);

template <typename Text> struct PanelConfigTextSources {
  Text *button{nullptr};
  std::array<Text *, PANEL_CONFIG_TEXT_CHUNK_COUNT> subpages{};
  bool template_button{false};
  std::array<bool, PANEL_CONFIG_TEXT_CHUNK_COUNT> template_subpages{};
  uint16_t empty_defaults{0};
};

template <typename Value> struct PanelConfigTextValues {
  Value button{};
  std::array<Value, PANEL_CONFIG_TEXT_CHUNK_COUNT> subpages{};
};

} // namespace espdesktop::configuration
