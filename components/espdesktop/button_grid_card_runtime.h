#pragma once

// Firmware-facing card metadata boundary. Card behavior stays in the existing
// card files; shared identity, defaults, families, and capability checks flow
// through this helper.

#include "button_grid_contract_generated.h"
#include "button_grid_card_registry.h"

namespace espdesktop::cards {

enum class Surface : uint8_t {
  MAIN_GRID,
  SUBPAGE,
};

struct Context {
  espdesktop::card_runtime::CardRuntimeSpec runtime;
  Family family = Family::UNKNOWN;
  Surface surface = Surface::MAIN_GRID;
  bool known = false;
  bool allow_in_subpage = false;
};

inline Family family_for_runtime_type(espdesktop::card_runtime::CardTypeId type) {
  using Type = espdesktop::card_runtime::CardTypeId;
  switch (type) {
    case Type::CALENDAR: case Type::CLOCK: case Type::TIMEZONE: return Family::DATE_TIME;
    case Type::COMPANION: return Family::COMPANION;
    case Type::SCREEN_LOCK: return Family::SCREEN_LOCK;
    case Type::SUBPAGE: return Family::SUBPAGE;
    case Type::WEBHOOK: return Family::WEBHOOK;
    default: return Family::UNKNOWN;
  }
}

// Generated metadata selects a handwritten driver here; it never carries card
// behavior.
class CardRuntimeRegistryService {
 public:
  Context context_for(const std::string &type, const std::string &mode,
                      Surface surface = Surface::MAIN_GRID) const {
    using namespace espdesktop::card_runtime;
    Context context;
    context.runtime = card_runtime_spec(card_type_id(type));
    context.runtime.driver = resolve_card_driver(context.runtime.type, mode);
    context.family = family_for_runtime_type(context.runtime.type);
    context.surface = surface;
    context.known = context.runtime.type != CardTypeId::UNKNOWN;
    context.allow_in_subpage = has_capability(context.runtime, CAPABILITY_SUBPAGE);
    return context;
  }

  Registration registration_for(const std::string &type) const {
    const Context context = context_for(type, "");
    return registration(context.family, context.known, context.allow_in_subpage);
  }
};

// The application core binds its owned registry during setup. Existing card
// helpers continue to use this accessor while callers migrate to the explicit
// core service. The local fallback keeps standalone parsing and host tests
// independent of ESPHome application setup.
inline const CardRuntimeRegistryService *&card_runtime_registry_binding() {
  static const CardRuntimeRegistryService *service = nullptr;
  return service;
}

inline void set_card_runtime_registry_service(
    const CardRuntimeRegistryService *service) {
  card_runtime_registry_binding() = service;
}

inline const CardRuntimeRegistryService &card_runtime_registry_service() {
  if (const CardRuntimeRegistryService *service =
          card_runtime_registry_binding()) {
    return *service;
  }
  static const CardRuntimeRegistryService service;
  return service;
}

inline Context context_for(const std::string &type, const std::string &mode,
                           Surface surface = Surface::MAIN_GRID) {
  return card_runtime_registry_service().context_for(type, mode, surface);
}

}  // namespace espdesktop::cards

template<typename Config>
inline auto card_runtime_context(
    const Config &config,
    espdesktop::cards::Surface surface = espdesktop::cards::Surface::MAIN_GRID)
    -> decltype((void) config.type, (void) config.sensor,
                espdesktop::cards::Context()) {
  return espdesktop::cards::context_for(config.type, config.sensor, surface);
}

inline espdesktop::cards::Context card_runtime_context(
    const std::string &type,
    espdesktop::cards::Surface surface = espdesktop::cards::Surface::MAIN_GRID) {
  return espdesktop::cards::context_for(type, "", surface);
}

inline espdesktop::cards::Registration card_runtime_registration(const std::string &type) {
  return espdesktop::cards::card_runtime_registry_service().registration_for(type);
}

inline espdesktop::cards::Family card_runtime_family(const std::string &type) {
  return card_runtime_context(type).family;
}

inline bool card_runtime_has_capability(
    const espdesktop::cards::Context &context,
    espdesktop::card_runtime::CardCapabilityFlag capability) {
  return espdesktop::card_runtime::has_capability(context.runtime, capability);
}

inline bool card_runtime_information_only(const espdesktop::cards::Context &context) {
  return card_runtime_has_capability(
      context, espdesktop::card_runtime::CAPABILITY_INFORMATION_ONLY);
}

inline bool card_runtime_passive(const espdesktop::cards::Context &context) {
  return card_runtime_information_only(context) &&
         !card_runtime_has_capability(
             context, espdesktop::card_runtime::CAPABILITY_ACTIONS);
}

// Opening a modal replaces the main card immediately, so a separate pressed
// repaint of that card only adds work and makes the action feel slower. Keep
// this limited to main-grid routes that actually present an overlay; toggles,
// sliders, and transport actions retain their ordinary pressed feedback.
inline bool card_runtime_main_click_opens_modal(const espdesktop::cards::Context &) { return false; }

inline const char *card_runtime_label(const std::string &type) {
  return card_contract_card_label(type);
}

inline bool card_runtime_allow_in_subpage(const std::string &type) {
  return card_runtime_context(type).allow_in_subpage;
}

inline std::string card_runtime_subpage_type_from_code(const std::string &code) {
  return card_contract_subpage_type_from_code(code);
}

inline const char *card_runtime_default_icon_name(const std::string &type) {
  return card_contract_default_icon_name(type);
}

inline const char *card_runtime_default_icon_on_name(const std::string &type) {
  return card_contract_default_icon_on_name(type);
}

