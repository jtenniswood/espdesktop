#include "espdesktop_app.h"
#include "device_reset.h"
#include "esphome/components/artwork_image/transfer_observer.h"

#include <algorithm>
#include <array>
#include <cinttypes>
#include <new>

#ifdef USE_ESP32
#include <esp_heap_caps.h>
#endif

#include "esphome/core/log.h"
#include "esphome/components/switch/switch.h"

#include "button_grid.h"
#include "grid_page_runtime.h"
#include "panel_config_page_append.h"
#include "configuration_main_loop.h"
#include "configuration_release_policy.h"
#include "configuration_service.h"
#include "configuration_store.h"
#include "panel_config_capabilities_endpoint.h"
#include "panel_config_endpoint_policy.h"
#include "panel_config_esphome_text.h"
#include "panel_config_espidf_storage.h"
#include "panel_config_http_context.h"
#include "panel_config_legacy_adapter.h"
#include "panel_config_read_endpoint.h"
#include "panel_config_runtime_adapter.h"
#include "panel_config_service_validator.h"
#include "panel_config_storage_selection.h"
#include "panel_config_transient_storage.h"
#include "panel_config_write_endpoint.h"
#include "panel_identity_endpoint.h"
#include "panel_diagnostics_endpoint.h"
#include "companion_app_icon_endpoint.h"
#include "button_grid.h"
#include "grid_page_runtime.h"
#include "panel_config_page_append.h"
#include "finder_folder_sync.h"
#include "connector_state.h"
#ifdef USE_COMPANION
#include "../companion/companion.h"
#endif

// Optional bridge for the IDF event stream. Both callers run on the firmware
// loop; no HTTP-task request or full configuration read is needed.
extern "C" bool espdesktop_native_configuration_generation(uint32_t *generation) {
  const auto &context = espdesktop::configuration::panel_config_http_context();
  if (!generation || !context.ready.load(std::memory_order_acquire) || !context.service)
    return false;
  const auto state = context.service->compatibility_state();
  if (!state.known) return false;
  *generation = state.generation;
  return true;
}

extern "C" void espdesktop_register_web_server_handlers(
    esphome::web_server_idf::AsyncWebServer *server) {
#ifdef USE_WEBSERVER
  if (server == nullptr) return;
  espdesktop::reset::register_handlers(*server);
  espdesktop::register_panel_identity_endpoint(*server);
  espdesktop::register_panel_diagnostics_endpoint(*server);
  register_companion_actions_endpoint(*server);
  register_companion_app_icon_preview_endpoint(*server);
  espdesktop::connectors::register_connector_status_endpoint(*server);
  espdesktop::configuration::register_panel_config_capabilities_endpoint(*server);
  espdesktop::configuration::register_panel_config_read_endpoint(*server);
  espdesktop::configuration::register_panel_config_write_endpoint(*server);
#else
  (void) server;
#endif
}

namespace espdesktop {

static const char *const TAG = "espdesktop.config";
// This component is shared by devices whose OTA rollback window can be as
// short as 10 seconds. Leave enough of that window for initialization itself
// to fail safely after the display and restored text entities have settled.
constexpr uint32_t NATIVE_CONFIGURATION_INITIALIZATION_DELAY_MS = 5000;

static uint8_t *allocate_configuration_slot(size_t size);
static void release_configuration_slot(uint8_t *buffer);

static void sync_app_icons_from_panel_config(const uint8_t *document,
                                             size_t document_size) {
#ifdef USE_COMPANION
  std::vector<std::string> application_ids;
  auto collect_card = [&application_ids](const ParsedCfg &card) {
    if (!companion_app_icon_enabled(card)) return;
    if (std::find(application_ids.begin(), application_ids.end(), card.entity) == application_ids.end())
      application_ids.push_back(card.entity);
  };
  auto collect_config = [&collect_card](const std::string &config) {
    collect_card(parse_cfg(config));
  };
  if (document_size > 5 && document[4] == 2) {
    configuration::PanelConfigV2Reader graph(document, document_size);
    size_t bytes = 0;
    if (graph.workspace_bytes(&bytes) != configuration::PanelConfigStatus::OK) return;
    configuration::ConfigurationBuffer scratch(allocate_configuration_slot, release_configuration_slot);
    auto *index = scratch.allocate(bytes);
    if (!index || graph.validate(index, bytes) != configuration::PanelConfigStatus::OK) return;
    configuration::PanelConfigV2Record row;
    for (size_t i = 0; i < graph.record_count(); ++i) {
      graph.record(i, &row);
      if (row.kind != configuration::PanelConfigV2Kind::CARD) continue;
      ParsedCfg card;
      card.entity = std::string(graph.entity(row.fields[0])); card.sensor = std::string(graph.entity(row.fields[4]));
      card.type = std::string(graph.string(row.fields[6])); card.options = std::string(graph.string(row.fields[8]));
      collect_card(card);
    }
    esphome::companion::sync_app_icon_references(application_ids);
    return;
  }
  configuration::PanelConfigReader reader(document, document_size);
  if (reader.begin() != configuration::PanelConfigStatus::OK) return;
  configuration::PanelConfigRecord record;
  configuration::PanelConfigStatus status;
  while ((status = reader.next(&record)) == configuration::PanelConfigStatus::OK) {
    if (record.type == configuration::PanelConfigRecordType::BUTTON) {
      collect_config(std::string(reinterpret_cast<const char *>(record.value), record.value_size));
    } else if (record.type == configuration::PanelConfigRecordType::SUBPAGE) {
      const std::string subpage(reinterpret_cast<const char *>(record.value), record.value_size);
      for (const auto &subpage_card : parse_subpage_config(subpage)) {
        ParsedCfg card;
        card.entity = subpage_card.entity;
        card.label = subpage_card.label;
        card.icon = subpage_card.icon;
        card.icon_on = subpage_card.icon_on;
        card.sensor = subpage_card.sensor;
        card.unit = subpage_card.unit;
        card.type = subpage_card.type;
        card.precision = subpage_card.precision;
        card.options = subpage_card.options;
        collect_card(card);
      }
    }
  }
  if (status == configuration::PanelConfigStatus::END)
    esphome::companion::sync_app_icon_references(application_ids);
#else
  (void) document;
  (void) document_size;
#endif
}

static uint8_t *allocate_configuration_slot(size_t size) {
#ifdef USE_ESP32
  // Native v1/v2 conversion scratch requires eight-byte alignment. Ordinary
  // ESP32 PSRAM allocations only guarantee four bytes, so heap reuse can make
  // an otherwise valid configuration fail representation conversion.
  return static_cast<uint8_t *>(
      heap_caps_aligned_alloc(8, size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
#else
  (void)size;
  return nullptr;
#endif
}

static void release_configuration_slot(uint8_t *buffer) {
#ifdef USE_ESP32
  heap_caps_free(buffer);
#else
  (void)buffer;
#endif
}

class EspDesktopApp::NativeConfigurationRuntime {
 public:
   using LegacyButtonTextSources = configuration::PanelConfigTextValues<
       configuration::EspHomePanelConfigTextValue>;

   // The profile-sized owner is below the ordinary malloc internal-preference
   // threshold on several devices. Keep its metadata explicitly in PSRAM and
   // preserve the existing fallible initialization contract.
   static void *operator new(size_t size, const std::nothrow_t &) noexcept {
#ifdef USE_ESP32
     return allocate_configuration_slot(size);
#else
     return ::operator new(size, std::nothrow);
#endif
   }
   static void operator delete(void *storage) noexcept {
#ifdef USE_ESP32
     release_configuration_slot(static_cast<uint8_t *>(storage));
#else
     ::operator delete(storage);
#endif
   }
   static void operator delete(void *storage, const std::nothrow_t &) noexcept {
     operator delete(storage);
   }

   NativeConfigurationRuntime()
       : legacy_config(text_bindings, allocate_configuration_slot,
                       release_configuration_slot, configuration::PANEL_CONFIG_LEGACY_MODE),
         runtime_config(text_bindings, allocate_configuration_slot, release_configuration_slot),
         validator(allocate_configuration_slot, release_configuration_slot),
         backend(blobs, allocate_configuration_slot,
                 release_configuration_slot),
         store(backend) {}

   configuration::PanelConfigTextBindings text_bindings{};
   configuration::PanelConfigLegacyAdapter legacy_config;
   configuration::PanelConfigRuntimeAdapter runtime_config;
   std::unique_ptr<GridPageRuntime> grid_runtime;
   configuration::PanelConfigDocumentValidator validator{};
   configuration::EspIdfPanelConfigBlobStorage blobs{};
   configuration::TransientBlobStorageBackend<
       PANEL_CONFIG_STORAGE_SLOT_CAPACITY>
       backend;
   configuration::ConfigurationStore store;
   configuration::ConfigurationMainLoop transactions;
   configuration::ConfigurationCompatibilityRetry compatibility_retry;
   uint32_t finder_poll_ms{0};
   std::string finder_catalogue;
   bool document_available{false};
   bool service_configured{false};
   bool storage_ready{false};
   size_t slot_capacity{0};
   bool boot_configuration_pending{false};
   bool boot_configuration_due{false};
   configuration::EspHomePanelConfigTextValue button_order{};
   configuration::EspHomePanelConfigTextValue button_on_color{};
   std::array<LegacyButtonTextSources,
              configuration::PANEL_CONFIG_TEXT_SLOT_COUNT>
       buttons{};
};

EspDesktopApp::EspDesktopApp() = default;

EspDesktopApp::~EspDesktopApp() = default;

bool EspDesktopApp::connector_onboarding_complete() const {
  return connectors::onboarding_complete();
}

bool EspDesktopApp::install_application_scene(ApplicationSceneRuntime& scene) {
  if (shutting_down_ || !scene.ready()) return false;
  if (application_scene_) return application_scene_ == &scene;
  if (native_configuration_initialized_ || core_.configuration_service()) return false;
  application_scene_ = &scene;
  return true;
}

bool EspDesktopApp::require_application_scene() {
  if (shutting_down_ || native_configuration_initialized_ ||
      core_.configuration_service())
    return false;
  application_scene_required_ = true;
  return true;
}

configuration::ConfigurationRuntimeAdapter* EspDesktopApp::selected_configuration_runtime() {
  if (application_scene_)
    return application_scene_;
  if (application_scene_required_) {
    class Unavailable final
        : public configuration::ConfigurationRuntimeAdapter {
    public:
      bool prepare(uint16_t, const uint8_t *, size_t) override { return false; }
      bool apply(uint16_t, const uint8_t *, size_t) override { return false; }
    };
    static Unavailable unavailable;
    return &unavailable;
  }
  return native_configuration_runtime_ ? &native_configuration_runtime_->runtime_config : nullptr;
}

void EspDesktopApp::set_panel_config_device_profile(const char *device_profile) {
  panel_config_device_profile_ = device_profile;
}

void EspDesktopApp::set_panel_config_button_order(
    esphome::text::Text *button_order) {
  panel_config_button_order_ = button_order;
  panel_config_order_template_ = false;
  panel_config_chrome_empty_defaults_ &= ~uint8_t{1};
}

void EspDesktopApp::set_panel_config_button_on_color(
    esphome::text::Text *button_on_color) {
  panel_config_button_on_color_ = button_on_color;
  panel_config_color_template_ = false;
  panel_config_chrome_empty_defaults_ &= ~uint8_t{2};
}

void EspDesktopApp::set_panel_config_button(
    uint8_t slot, esphome::text::Text *button,
    esphome::text::Text *subpage_0, esphome::text::Text *subpage_1,
      esphome::text::Text *subpage_2, esphome::text::Text *subpage_3,
      esphome::text::Text *subpage_4, esphome::text::Text *subpage_5,
      esphome::text::Text *subpage_6, esphome::text::Text *subpage_7) {
  if (slot == 0 || slot > panel_config_button_texts_.size()) return;
  auto &sources = panel_config_button_texts_[slot - 1];
  sources = {};
  sources.button = button;
  const std::array<esphome::text::Text *, 8> chunks = {
      subpage_0, subpage_1, subpage_2, subpage_3,
      subpage_4, subpage_5, subpage_6, subpage_7};
  std::copy_n(chunks.begin(), sources.subpages.size(),
              sources.subpages.begin());
}

void EspDesktopApp::set_panel_config_text_empty_default(
    esphome::text::Text *text) {
  if (!text)
    return;
  if (text == panel_config_button_order_ && panel_config_order_template_)
    panel_config_chrome_empty_defaults_ |= 1u;
  if (text == panel_config_button_on_color_ && panel_config_color_template_)
    panel_config_chrome_empty_defaults_ |= 2u;
  for (auto &sources : panel_config_button_texts_) {
    if (text == sources.button && sources.template_button)
      sources.empty_defaults |= 1u;
    for (size_t i = 0; i < sources.subpages.size(); ++i)
      if (text == sources.subpages[i] && sources.template_subpages[i])
        sources.empty_defaults |= uint16_t{1} << (i + 1);
  }
}

bool EspDesktopApp::native_configuration_requested() const {
  return panel_config_device_profile_ != nullptr &&
         panel_config_button_order_ != nullptr;
}

bool EspDesktopApp::create_native_configuration_runtime() {
  if (native_configuration_runtime_ != nullptr)
    return native_configuration_runtime_->grid_runtime &&
        application_scene_ == native_configuration_runtime_->grid_runtime.get();
  application_scene_required_ = true;
  NativeConfigurationRuntime *runtime =
      new (std::nothrow) NativeConfigurationRuntime();
  if (runtime == nullptr) {
    ESP_LOGE(TAG, "Native configuration runtime memory is unavailable");
    return false;
  }
  native_configuration_runtime_.reset(runtime);
  runtime->text_bindings.set_device_profile(panel_config_device_profile_);
  runtime->button_order.bind(panel_config_button_order_,
                             panel_config_order_template_,
                             (panel_config_chrome_empty_defaults_ & 1u) != 0);
  runtime->text_bindings.set_button_order(&runtime->button_order);
  runtime->button_on_color.bind(
      panel_config_button_on_color_, panel_config_color_template_,
      (panel_config_chrome_empty_defaults_ & 2u) != 0);
  runtime->text_bindings.set_button_on_color(&runtime->button_on_color);
  for (size_t index = 0; index < panel_config_button_texts_.size(); ++index) {
    const PanelConfigTextSources &sources = panel_config_button_texts_[index];
    // Device profiles only provide text entities for their real panel slots.
    // Do not register placeholder wrappers for the remaining fixed-capacity
    // entries: a restored document would correctly try to clear them, but the
    // wrappers have no ESPHome text object to update.
    if (sources.button == nullptr) continue;
    NativeConfigurationRuntime::LegacyButtonTextSources &legacy_sources =
        runtime->buttons[index];
    legacy_sources.button.bind(sources.button, sources.template_button,
                               (sources.empty_defaults & 1u) != 0);
    std::array<configuration::PanelConfigTextValue *,
               configuration::PanelConfigTextBindings::MAX_SUBPAGE_CHUNKS>
        legacy_subpages{};
    for (size_t subpage = 0; subpage < sources.subpages.size(); ++subpage) {
      if (sources.subpages[subpage] == nullptr) continue;
      legacy_sources.subpages[subpage].bind(
          sources.subpages[subpage], sources.template_subpages[subpage],
          (sources.empty_defaults & (1u << (subpage + 1))) != 0);
      legacy_subpages[subpage] = &legacy_sources.subpages[subpage];
    }
    if (!runtime->text_bindings.set_button(static_cast<uint8_t>(index + 1),
                                           &legacy_sources.button,
                                           legacy_subpages)) {
      ESP_LOGE(TAG, "Configured text sources exceed their compiled capacity");
      native_configuration_runtime_.reset();
      return false;
    }
  }
  const DeviceUiLimits *limits = nullptr;
  for (const auto &profile : DEVICE_UI_PROFILES)
    if (std::strcmp(profile.device_profile, panel_config_device_profile_) == 0) limits = &profile;
  if (!limits) { native_configuration_runtime_.reset(); return false; }
  runtime->grid_runtime.reset(new (std::nothrow) GridPageRuntime(*limits,
      allocate_configuration_slot, release_configuration_slot,
      [this]() { layout_changed_.trigger(); },
      [this](bool enabled) { publish_app_subpage_preference(enabled); }));
  if (!runtime->grid_runtime || !install_application_scene(*runtime->grid_runtime)) {
    native_configuration_runtime_.reset(); return false;
  }
  return true;
}

void EspDesktopApp::register_panel_config_endpoints() {
  // Do not let an early reconnect cache a legacy-only capability response
  // while the deferred native configuration setup is still in progress.
  if (!native_configuration_initialized_ || panel_config_http_context_bound_)
    return;
  configuration::ConfigurationService *const panel_config_service =
      core_.configuration_service();
  NativeConfigurationRuntime *const runtime = native_configuration_runtime_.get();
  const bool can_bind_document_endpoints =
      panel_config_service != nullptr && runtime != nullptr &&
      runtime->document_available && runtime->slot_capacity > 0;
  if (!can_bind_document_endpoints) {
    ESP_LOGE(TAG,
             "Native configuration endpoints unavailable: service=%s "
             "runtime=%s document=%s",
             panel_config_service != nullptr ? "ready" : "missing",
             runtime != nullptr ? "ready" : "missing",
             runtime != nullptr && runtime->document_available ? "ready"
                                                               : "missing");
    configuration::set_panel_config_read_supported(false);
    configuration::set_panel_config_write_supported(false);
    panel_config_http_context_bound_ = true;
    configuration::set_panel_config_http_context_initialization_complete(true);
    return;
  }
  configuration::bind_panel_config_http_context(
      *panel_config_service, runtime->transactions, runtime->slot_capacity,
      allocate_configuration_slot, release_configuration_slot,
      web_auth_username_ == nullptr ? "" : web_auth_username_,
      web_auth_password_ == nullptr ? "" : web_auth_password_
#ifdef USE_COMPANION
      ,
      [](const uint8_t *document, size_t size) {
        sync_app_icons_from_panel_config(document, size);
      }
#endif
      );
  configuration::set_panel_config_read_supported(true);
  configuration::set_panel_config_write_supported(true);
  // The context transitions from not-ready to ready once. Rebinding it from
  // loop() would briefly make concurrent requests observe a false readiness
  // flag and rewrite the shared pointers while the web task is using them.
  panel_config_http_context_bound_ = true;
  configuration::set_panel_config_http_context_initialization_complete(true);
}

void EspDesktopApp::apply_boot_configuration() {
  if (shutting_down_) return;
  NativeConfigurationRuntime *const runtime = native_configuration_runtime_.get();
  if (runtime == nullptr || !runtime->boot_configuration_pending ||
      runtime->slot_capacity == 0)
    return;

  // The timeout establishes the startup delay. A busy scene keeps this work
  // pending for a later safe application loop, without scheduling more timers.
  runtime->boot_configuration_due = true;
  if (application_scene_ && !application_scene_->maintenance_ready()) return;
  if (!configuration_buffer_retry_.ready(esphome::millis()))
    return;
  configuration::ConfigurationService *const panel_config_service =
      core_.configuration_service();
  if (panel_config_service == nullptr) return;
  configuration::ConfigurationBuffer buffer(allocate_configuration_slot,
                                            release_configuration_slot);
  auto *document = buffer.allocate(runtime->slot_capacity);
  if (!document) {
    configuration_buffer_retry_.failed(esphome::millis());
    return;
  }
  // Reload the newest durable generation now, never a setup-time snapshot.
  // This scoped output stays alive through preparation, activation and
  // publication.
  const configuration::ServiceLoadResult loaded =
      panel_config_service->load_and_apply_runtime(document,
                                                   runtime->slot_capacity);
  if (loaded.status == configuration::ServiceStatus::ALLOCATION_FAILED) {
    configuration_buffer_retry_.failed(esphome::millis());
    return;
  }
  runtime->boot_configuration_pending = false;
  runtime->boot_configuration_due = false;
  configuration_buffer_retry_.clear();
  if (loaded.status == configuration::ServiceStatus::LEGACY_MIRROR_FAILED) {
    ESP_LOGW(TAG, "Native configuration restored; compatibility text "
                  "publication is incomplete");
    return;
  }
  if (!loaded.ok()) {
    ESP_LOGE(TAG, "Native configuration could not reload for the live grid (%u)",
             static_cast<unsigned>(loaded.status));
    return;
  }
  sync_app_icons_from_panel_config(document, loaded.document_size);
}

void EspDesktopApp::publish_app_subpage_preference(bool enabled) {
  if (app_subpage_switch_) app_subpage_switch_->publish_state(enabled);
  if (active_espdesktop_app_core() == &core_) companion_set_auto_open_app_subpages(enabled);
}

void EspDesktopApp::bind_app_subpage_preference_switch(esphome::switch_::Switch &setting) {
  app_subpage_switch_ = &setting;
  // Existing panels retain their preference until it is first saved in the
  // layout document. Native activation publishes the new value after commit.
  publish_app_subpage_preference(setting.state);
}

void EspDesktopApp::retry_configuration_compatibility() {
  if (shutting_down_ || !reset::ready() || reset::pending()) return;
  auto *runtime = native_configuration_runtime_.get();
  auto *service = core_.configuration_service();
  if (!runtime || !service || !runtime->slot_capacity || runtime->boot_configuration_pending ||
      (application_scene_ && !application_scene_->maintenance_ready())) return;
  const auto state = service->compatibility_state();
  if (!state.retry_pending()) {
    runtime->compatibility_retry.clear();
    return;
  }
  if (!runtime->compatibility_retry.ready(esphome::millis(), state.generation)) return;
  reset::ConfigurationWriteLease lease;
  if (!lease.ready()) {
    runtime->compatibility_retry.failed(esphome::millis());
    return;
  }
  configuration::ConfigurationBuffer buffer(allocate_configuration_slot, release_configuration_slot);
  auto *document = buffer.allocate(runtime->slot_capacity);
  if (!document) {
    runtime->compatibility_retry.failed(esphome::millis());
    return;
  }
  const auto repaired = service->retry_compatibility(document, runtime->slot_capacity);
  if (service->compatibility_state().retry_pending()) {
    runtime->compatibility_retry.failed(esphome::millis());
    ESP_LOGW(TAG, "Compatibility copy remains incomplete; retry deferred (%u)",
             static_cast<unsigned>(repaired.status));
  } else {
    runtime->compatibility_retry.clear();
    if (!repaired.ok())
      ESP_LOGW(TAG, "Compatibility copy cannot represent this native configuration (%u)",
               static_cast<unsigned>(repaired.status));
  }
}

void EspDesktopApp::setup() {
  if (core_.start()) {
    cards::set_card_runtime_registry_service(&core_.card_runtime_registry());
  } else {
    ESP_LOGE(TAG, "Application core failed to start");
  }
  connectors::connector_state_service().setup(
      web_auth_username_, web_auth_password_);

  // NVS work and the legacy snapshot can be expensive on a populated panel.
  // Give the display and restored text entities time to come up before
  // collecting the first legacy snapshot, while preserving the OTA rollback
  // window for every supported device.
  ESP_LOGI(TAG, "Deferring native configuration initialization for %" PRIu32 " ms",
           NATIVE_CONFIGURATION_INITIALIZATION_DELAY_MS);
  this->set_timeout(NATIVE_CONFIGURATION_INITIALIZATION_DELAY_MS,
                    [this]() { this->initialize_native_configuration(); });
}

void EspDesktopApp::defer_native_configuration_initialization() {
  native_configuration_initialization_pending_ = true;
  configuration_buffer_retry_.failed(esphome::millis());
  ESP_LOGW(TAG, "Native configuration is waiting for temporary memory");
}

void EspDesktopApp::initialize_native_configuration() {
  if (shutting_down_ || native_configuration_initialized_)
    return;
  native_configuration_initialization_pending_ = false;
  ESP_LOGI(TAG, "Starting native configuration initialization");
  if (!native_configuration_requested()) {
    ESP_LOGD(TAG, "Native configuration is not requested for this device");
    native_configuration_initialized_ = true;
    register_panel_config_endpoints();
    return;
  }
  if (!create_native_configuration_runtime()) {
    defer_native_configuration_initialization();
    return;
  }
  NativeConfigurationRuntime &runtime = *native_configuration_runtime_;
  if (!runtime.service_configured) {
    if (!core_.configure_configuration_service(
            runtime.store, runtime.legacy_config, &runtime.validator,
            configuration::PANEL_CONFIG_LEGACY_MODE)) {
      ESP_LOGE(TAG, "Native configuration service is already configured");
      native_configuration_initialized_ = true;
      register_panel_config_endpoints();
      return;
    }
    runtime.service_configured = true;
  }
  configuration::ConfigurationService *const panel_config_service =
      core_.configuration_service();
  if (panel_config_service == nullptr) {
    ESP_LOGE(TAG, "Native configuration service is unavailable");
    native_configuration_initialized_ = true;
    register_panel_config_endpoints();
    return;
  }
  // HTTP writes and boot restore activate the same durable layout. Text
  // bindings still publish screen settings and can import an old layout.
  panel_config_service->set_runtime_adapter(selected_configuration_runtime());
  if (!runtime.legacy_config.configured()) {
    ESP_LOGW(TAG, "Native configuration sources are not configured");
  } else {
    if (!runtime.storage_ready) {
      const configuration::PanelConfigStorageSelection storage =
          configuration::begin_panel_config_storage(
              runtime.blobs, panel_config_card_images_storage_,
              PANEL_CONFIG_STORAGE_SLOT_CAPACITY,
              PANEL_CONFIG_NVS_SLOT_CAPACITY);
      if (!storage.ready || !runtime.backend.begin(storage.slot_capacity)) {
        ESP_LOGE(TAG, "Native configuration storage is unavailable");
        native_configuration_initialized_ = true;
        register_panel_config_endpoints();
        return;
      }
      runtime.slot_capacity = storage.slot_capacity;
      runtime.storage_ready = true;
      if (storage.used_nvs_fallback) {
        ESP_LOGW(TAG,
                 "Card-images partition is unavailable; using NVS with %u-byte "
                 "slots",
                 static_cast<unsigned>(runtime.slot_capacity));
      }
    }
    panel_config_service->set_buffer_allocator(allocate_configuration_slot,
                                               release_configuration_slot);
    configuration::ConfigurationBuffer buffer(allocate_configuration_slot,
                                              release_configuration_slot);
    auto *document = buffer.allocate(runtime.slot_capacity);
    if (!document) {
      defer_native_configuration_initialization();
      return;
    }
    ESP_LOGI(TAG, "Loading native configuration document");
    const configuration::ServiceLoadResult loaded =
        panel_config_service->load(document, runtime.slot_capacity);
    if (loaded.status == configuration::ServiceStatus::ALLOCATION_FAILED) {
      defer_native_configuration_initialization();
      return;
    }
    runtime.document_available =
        configuration::panel_config_load_allows_native_endpoints(loaded.status);
    if (!runtime.document_available) {
      ESP_LOGW(TAG,
               "Native configuration initial load failed (%u); keeping legacy configuration endpoints active",
               static_cast<unsigned>(loaded.status));
    }
    if (loaded.status == configuration::ServiceStatus::IMPORTED_LEGACY) {
      ESP_LOGI(TAG, "Imported legacy panel configuration into generation %" PRIu32,
               loaded.generation);
    } else if (!loaded.ok() && loaded.status != configuration::ServiceStatus::EMPTY) {
      ESP_LOGE(TAG, "Native configuration load failed (%u)",
               static_cast<unsigned>(loaded.status));
    }
    // Once a durable native document exists it is authoritative. Its legacy
    // mirror is persisted asynchronously by ESPHome and can still contain the
    // previous layout after a quick reboot. Re-importing that stale mirror here
    // would silently undo a successful card move, resize, or backup restore.
    // ConfigurationService::load() already imports legacy values when native
    // storage is empty, so no second boot-time shadow refresh is required.
    const configuration::ServiceLoadResult live_document = loaded;
    if (live_document.ok()) {
      // Activating the restored layout schedules a grid refresh. Run it
      // only after every ESPHome component has completed
      // setup: on P4 panels the grid and LVGL objects are not safe to refresh
      // while this component's WiFi-priority setup callback is still running.
      // Browser PUT requests still apply immediately through the runtime
      // adapter; this deferral is strictly for startup restoration.
      runtime.boot_configuration_pending = true;
      this->set_timeout(1000, [this]() { this->apply_boot_configuration(); });
    }
  }
  native_configuration_initialized_ = true;
  configuration_buffer_retry_.clear();
  register_panel_config_endpoints();
}

void EspDesktopApp::sync_finder_folders() {
  using namespace configuration;
  auto *service = core_.configuration_service();
  if (!native_configuration_initialized_ || !native_configuration_runtime_ || !service) return;
  auto &runtime = *native_configuration_runtime_;
  if (runtime.boot_configuration_pending || esphome::millis() - runtime.finder_poll_ms < 1000) return;
  runtime.finder_poll_ms = esphome::millis();
  const auto snapshot = companion_runtime_snapshot();
  if (!snapshot.connected) return;
  std::vector<CompanionAction> folders;
  std::string catalogue;
  for (const auto &action : snapshot.actions) {
    if (action.id.rfind("folder.", 0) != 0) continue;
    folders.push_back(action);
    catalogue += action.id + "\n";
  }
  const auto &navigation = grid_navigation_service();
  const int slots = navigation.layout_slots;
  const int columns = navigation.layout_columns;
  if (slots <= 0 || columns <= 0 || catalogue == runtime.finder_catalogue) return;
  // Private buffers avoid racing the HTTP editor's shared buffer. Generation
  // matching prevents a simultaneous browser save from being overwritten.
  const size_t capacity = service->maximum_document_size();
#ifdef USE_ESP32
  auto *memory = static_cast<uint8_t *>(heap_caps_malloc(capacity * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
#else
  auto *memory = static_cast<uint8_t *>(std::malloc(capacity * 2));
#endif
  if (!memory) return;
  std::unique_ptr<uint8_t, decltype(&std::free)> owned(memory, &std::free);
  uint8_t *input = memory;
  uint8_t *output = memory + capacity;
  const auto loaded = service->load(input, capacity);
  if (!loaded.ok()) return;
  if (loaded.document_version == 2) {
    const auto *active = grid_native_page_store();
    if (!active || active->generation() != loaded.generation) return;
    PanelConfigV2Reader reader(input, loaded.document_size);
    size_t bytes = 0;
    if (reader.workspace_bytes(&bytes) != PanelConfigStatus::OK) return;
    ConfigurationBuffer scratch(allocate_configuration_slot, release_configuration_slot);
    auto *index = scratch.allocate(bytes);
    if (!index || reader.validate(index, bytes) != PanelConfigStatus::OK) return;
    PanelConfigPageAppend edit(reader);
    bool changed = false;
    PanelConfigV2Record row, owner;
    for (size_t i = 0; i < reader.record_count(); ++i) {
      reader.record(i, &row);
      if (row.kind != PanelConfigV2Kind::PAGE || !row.id ||
          !reader.record(PanelConfigV2Kind::CARD, row.second, &owner) ||
          reader.entity(owner.fields[0]) != "com.apple.finder" ||
          !page_card_owns_subpage(reader.string(owner.fields[6]), reader.entity(owner.fields[4]), reader.string(owner.fields[8]))) continue;
      int path = owner.second;
      if (row.first) {
        PanelConfigV2Record parent, parent_owner;
        if (!reader.record(PanelConfigV2Kind::PAGE, row.first, &parent) ||
            !reader.record(PanelConfigV2Kind::CARD, parent.second, &parent_owner)) return;
        path = 32 + (parent_owner.second - 1) * 32 + owner.second;
      }
      std::string order;
      std::vector<SubpageBtn> buttons;
      if (!grid_read_native_subpage(path, order, buttons)) continue;
      const auto parent = grid_layout_card_config(path, {});
      auto plan = finder_plan_folder_tiles_for_grid(order, buttons, slots, columns, folders,
          PANEL_CONFIG_MAX_RECORD_BODY_BYTES - 1, companion_folder_open_behavior(parent));
      if (plan.added.empty()) continue;
      std::vector<std::array<std::string, 9>> appended;
      appended.reserve(plan.added.size());
      for (auto &card : plan.added) {
        const auto value = normalize_subpage_btn(std::move(card));
        appended.push_back({value.entity, value.label, value.icon, value.icon_on, value.sensor,
                            value.unit, value.type, value.precision, value.options});
      }
      if (!edit.append(row.id, plan.order, appended)) return;
      changed = true;
    }
    size_t size = 0;
    if (changed && (!edit.finish(output, capacity, &size, allocate_configuration_slot, release_configuration_slot) ||
        !service->save_if_generation(loaded.generation, 2, output, size).ok())) return;
    runtime.finder_catalogue = catalogue;
    return;
  }
  PanelConfigReader reader(input, loaded.document_size);
  if (reader.begin() != PanelConfigStatus::OK) return;
  std::vector<PanelConfigRecord> records;
  PanelConfigRecord record;
  while (reader.next(&record) == PanelConfigStatus::OK) records.push_back(record);
  std::array<bool, PANEL_CONFIG_MAX_SLOT_COUNT + 1> finder_slots{};
  std::array<std::string, PANEL_CONFIG_MAX_SLOT_COUNT + 1> finder_open_behaviors{};
  for (const auto &item : records) {
    if (item.type != PanelConfigRecordType::BUTTON) continue;
    const auto card = parse_cfg(std::string(reinterpret_cast<const char *>(item.value), item.value_size));
    finder_slots[item.slot] = card.entity == "com.apple.finder" && companion_app_shortcuts_enabled(card);
    finder_open_behaviors[item.slot] = companion_folder_open_behavior(card);
  }
  PanelConfigWriter writer(output, capacity);
  if (writer.begin() != PanelConfigStatus::OK) return;
  bool changed = false;
  for (const auto &item : records) {
    PanelConfigStatus status = PanelConfigStatus::INVALID_DOCUMENT;
    if (item.type == PanelConfigRecordType::SUBPAGE && finder_slots[item.slot]) {
      std::string config(reinterpret_cast<const char *>(item.value), item.value_size);
      const auto buttons = parse_subpage_config(config);
      SubpageOrder order;
      parse_subpage_order(get_subpage_order(config), slots, buttons.size(), order);
      // Older pages without an explicit Back token remain untouched until the
      // editor normalizes them; guessing their positions could overwrite a tile.
      if (order.has_back_token) {
        normalize_subpage_order_spans(order, slots, columns);
        std::vector<bool> occupied(slots, false);
        auto occupy = [&](int position, int rows, int cols) {
          for (int row = 0; row < rows; ++row)
            for (int col = 0; col < cols; ++col) {
              const int cell = position + row * columns + col;
              if (cell >= 0 && cell < slots) occupied[cell] = true;
            }
        };
        occupy(order.back_pos, order.back_row_span, order.back_col_span);
        for (int position = 0; position < slots; ++position) {
          const int index = order.positions[position];
          if (index > 0 && index <= static_cast<int>(buttons.size()))
            occupy(position, order.row_span[index - 1], order.col_span[index - 1]);
        }
        size_t capacity = 0;
        for (auto *chunk : panel_config_button_texts_[item.slot - 1].subpages)
          if (chunk) capacity += 255;
        const auto updated = finder_append_folder_tiles(
            config, occupied, folders, capacity, finder_open_behaviors[item.slot]);
        changed |= updated != config;
        config = updated;
      }
      status = writer.append_subpage(item.slot, reinterpret_cast<const uint8_t *>(config.data()), config.size());
    } else if (item.type == PanelConfigRecordType::SUBPAGE) {
      status = writer.append_subpage(item.slot, item.value, item.value_size);
    } else if (item.type == PanelConfigRecordType::BUTTON) {
      status = writer.append_button(item.slot, item.value, item.value_size);
    } else if (item.type == PanelConfigRecordType::SETTING) {
      status = writer.append_setting(item.key, item.key_size, item.value, item.value_size);
    } else if (item.type == PanelConfigRecordType::DEVICE_PROFILE) {
      status = writer.append_device_profile(item.value, item.value_size);
    }
    if (status != PanelConfigStatus::OK) return;
  }
  size_t size = 0;
  if (writer.finish(&size) != PanelConfigStatus::OK) return;
  if (changed && !service->save_if_generation(loaded.generation, loaded.document_version,
                                             output, size).ok()) return;
  runtime.finder_catalogue = catalogue;
}

void EspDesktopApp::loop() {
  uint32_t phase_started = esphome::millis();
  const auto trace_phase = [&phase_started](const char *phase) {
    const uint32_t now = esphome::millis();
    if (now - phase_started > 40)
      ESP_LOGD("ui_latency", "%s took %u ms at=%u", phase,
               unsigned(now - phase_started), unsigned(now));
    phase_started = now;
  };
  if (shutting_down_) return;
  if (native_configuration_initialization_pending_ &&
      !native_configuration_initialized_ &&
      configuration_buffer_retry_.ready(esphome::millis()))
    initialize_native_configuration();
  const bool scene_ready = !application_scene_ || application_scene_->maintenance_ready();
  if (scene_ready && native_configuration_runtime_ != nullptr && core_.configuration_service() != nullptr) {
    native_configuration_runtime_->transactions.process(*core_.configuration_service());
    if (native_configuration_runtime_->boot_configuration_due) apply_boot_configuration();
    retry_configuration_compatibility();
  }
  if (shutting_down_) return;
  trace_phase("configuration");
  core_.run_once();
  trace_phase("app core");
  // Transport callbacks only request a refresh; apply it on the UI loop.
  // The atomic flag keeps this cheap when no Companion state has changed.
#ifdef USE_COMPANION
  const bool focus_pending = companion_runtime_service().focus_refresh_pending();
#endif
  companion_refresh_cards_if_requested();
  trace_phase("card refresh");
#ifdef USE_COMPANION
  // Let the next LVGL pass paint a focus change before starting background
  // icon work, which otherwise adds its processing time to input latency.
  if (!focus_pending) companion_process_pending_app_icon_refresh();
  trace_phase("icon refresh");
#endif
  sync_finder_folders();
  trace_phase("Finder sync");
  // The IDF web server starts later, so retry idempotent registrations.
  if (shutting_down_) return;
  register_panel_config_endpoints();
  trace_phase("HTTP registration");
  if (application_scene_ && application_scene_->maintenance_ready()) application_scene_->loop();
}

void EspDesktopApp::on_shutdown() {
  if (shutting_down_) return;
  shutting_down_ = true;
  if (native_configuration_runtime_ != nullptr)
    native_configuration_runtime_->transactions.stop();
  if (application_scene_) application_scene_->stop();
  esphome::artwork_image::TransferObserver::instance().set({}, {});
  cards::set_card_runtime_registry_service(nullptr);
  core_.stop();
}

}  // namespace espdesktop

namespace esphome::companion {
void companion_app_icon_ready(const std::string &application_id) {
#ifdef USE_COMPANION
  companion_refresh_cached_app_icon(application_id);
#endif
  notify_dashboard_content_changed();
}
}  // namespace esphome::companion
