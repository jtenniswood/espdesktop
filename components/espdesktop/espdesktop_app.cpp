#include "espdesktop_app.h"

#include <array>
#include <cinttypes>
#include <new>

#ifdef USE_ESP32
#include <esp_heap_caps.h>
#endif

#include "esphome/core/log.h"

#include "panel_config_capabilities_endpoint.h"
#include "configuration_release_policy.h"
#include "configuration_service.h"
#include "configuration_store.h"
#include "panel_config_read_endpoint.h"
#include "panel_config_espidf_storage.h"
#include "panel_config_esphome_text.h"
#include "panel_config_legacy_adapter.h"
#include "panel_config_runtime_adapter.h"
#include "panel_config_service_validator.h"
#include "panel_config_storage_backend.h"
#include "panel_config_endpoint_policy.h"
#include "panel_config_storage_selection.h"
#include "panel_config_write_endpoint.h"
#include "panel_config_http_context.h"
#include "button_grid.h"
#include "finder_folder_sync.h"
#include "connector_state.h"

extern "C" void espdesktop_register_web_server_handlers(
    esphome::web_server_idf::AsyncWebServer *server) {
#ifdef USE_WEBSERVER
  if (server == nullptr) return;
  register_local_sensor_endpoint(*server);
  register_local_action_endpoint(*server);
  register_companion_actions_endpoint(*server);
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

class EspDesktopApp::NativeConfigurationRuntime {
 public:
  struct LegacyButtonTextSources {
    configuration::EspHomePanelConfigTextValue button;
    std::array<configuration::EspHomePanelConfigTextValue,
               configuration::PanelConfigTextBindings::MAX_SUBPAGE_CHUNKS>
        subpages{};
  };

  NativeConfigurationRuntime()
      : legacy_config(text_bindings), runtime_config(text_bindings),
        backend(blobs), store(backend) {}

  configuration::PanelConfigTextBindings text_bindings{};
  configuration::PanelConfigLegacyAdapter legacy_config;
  configuration::PanelConfigRuntimeAdapter runtime_config;
  configuration::PanelConfigDocumentValidator validator{};
  configuration::EspIdfPanelConfigBlobStorage blobs{};
  configuration::BufferedBlobStorageBackend<PANEL_CONFIG_STORAGE_SLOT_CAPACITY>
      backend;
  configuration::ConfigurationStore store;
  uint8_t *memory{nullptr};
  uint8_t *document_buffer{nullptr};
  uint8_t *boot_buffer{nullptr};
  size_t slot_capacity{0};
  bool boot_configuration_pending{false};
  uint32_t finder_poll_ms{0};
  std::string finder_catalogue;
  configuration::EspHomePanelConfigTextValue button_order{};
  configuration::EspHomePanelConfigTextValue button_on_color{};
  std::array<LegacyButtonTextSources, configuration::PANEL_CONFIG_MAX_SLOT_COUNT>
      buttons{};
};

EspDesktopApp::EspDesktopApp() = default;

EspDesktopApp::~EspDesktopApp() = default;

bool EspDesktopApp::connector_onboarding_complete() const {
  return connectors::onboarding_complete();
}

void EspDesktopApp::set_panel_config_device_profile(const char *device_profile) {
  panel_config_device_profile_ = device_profile;
}

void EspDesktopApp::set_panel_config_button_order(
    esphome::text::Text *button_order) {
  panel_config_button_order_ = button_order;
}

void EspDesktopApp::set_panel_config_button_on_color(
    esphome::text::Text *button_on_color) {
  panel_config_button_on_color_ = button_on_color;
}

void EspDesktopApp::set_panel_config_button(
    uint8_t slot, esphome::text::Text *button,
    esphome::text::Text *subpage_0, esphome::text::Text *subpage_1,
      esphome::text::Text *subpage_2, esphome::text::Text *subpage_3,
      esphome::text::Text *subpage_4, esphome::text::Text *subpage_5,
      esphome::text::Text *subpage_6, esphome::text::Text *subpage_7) {
  if (slot == 0 || slot > panel_config_button_texts_.size()) return;
  panel_config_button_texts_[slot - 1] = {
      button, {subpage_0, subpage_1, subpage_2, subpage_3, subpage_4,
               subpage_5, subpage_6, subpage_7}};
}

bool EspDesktopApp::native_configuration_requested() const {
  return panel_config_device_profile_ != nullptr &&
         panel_config_button_order_ != nullptr;
}

bool EspDesktopApp::create_native_configuration_runtime() {
  if (native_configuration_runtime_ != nullptr) return true;
  NativeConfigurationRuntime *runtime =
      new (std::nothrow) NativeConfigurationRuntime();
  if (runtime == nullptr) {
    ESP_LOGE(TAG, "Native configuration runtime memory is unavailable");
    return false;
  }
  native_configuration_runtime_.reset(runtime);
  runtime->text_bindings.set_device_profile(panel_config_device_profile_);
  runtime->button_order.bind(panel_config_button_order_);
  runtime->text_bindings.set_button_order(&runtime->button_order);
  runtime->button_on_color.bind(panel_config_button_on_color_);
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
    legacy_sources.button.bind(sources.button);
    std::array<configuration::PanelConfigTextValue *,
               configuration::PanelConfigTextBindings::MAX_SUBPAGE_CHUNKS>
        legacy_subpages{};
    for (size_t subpage = 0; subpage < sources.subpages.size(); ++subpage) {
      legacy_sources.subpages[subpage].bind(sources.subpages[subpage]);
      legacy_subpages[subpage] = &legacy_sources.subpages[subpage];
    }
    runtime->text_bindings.set_button(static_cast<uint8_t>(index + 1),
                                      &legacy_sources.button, legacy_subpages);
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
  const bool can_bind_document_endpoints = panel_config_service != nullptr &&
      runtime != nullptr && runtime->document_buffer != nullptr &&
      runtime->slot_capacity > 0;
  if (!can_bind_document_endpoints) {
    ESP_LOGE(TAG,
             "Native configuration endpoints unavailable: service=%s runtime=%s document_buffer=%s",
             panel_config_service != nullptr ? "ready" : "missing",
             runtime != nullptr ? "ready" : "missing",
             runtime != nullptr && runtime->document_buffer != nullptr ? "ready"
                                                                    : "missing");
    configuration::set_panel_config_read_supported(false);
    configuration::set_panel_config_write_supported(false);
    panel_config_http_context_bound_ = true;
    configuration::set_panel_config_http_context_initialization_complete(true);
    return;
  }
  configuration::bind_panel_config_http_context(
      *panel_config_service, runtime->document_buffer,
      runtime->slot_capacity,
      web_auth_username_ == nullptr ? "" : web_auth_username_,
      web_auth_password_ == nullptr ? "" : web_auth_password_);
  configuration::set_panel_config_read_supported(true);
  configuration::set_panel_config_write_supported(true);
  // The context transitions from not-ready to ready once. Rebinding it from
  // loop() would briefly make concurrent requests observe a false readiness
  // flag and rewrite the shared pointers while the web task is using them.
  panel_config_http_context_bound_ = true;
  configuration::set_panel_config_http_context_initialization_complete(true);
}

void EspDesktopApp::apply_boot_configuration() {
  NativeConfigurationRuntime *const runtime = native_configuration_runtime_.get();
  if (runtime == nullptr || !runtime->boot_configuration_pending ||
      runtime->boot_buffer == nullptr)
    return;

  runtime->boot_configuration_pending = false;
  configuration::ConfigurationService *const panel_config_service =
      core_.configuration_service();
  if (panel_config_service == nullptr) return;
  // Do not retain the document captured during setup: a browser save can
  // complete before this timeout runs, and the newest durable document must
  // always win over startup restoration. The boot buffer is intentionally
  // separate from the HTTP request buffer. ConfigurationService serializes
  // this reload and live apply with HTTP saves so neither its scratch buffer
  // nor the running grid can be reverted by an older startup document.
  const configuration::ServiceLoadResult loaded =
      panel_config_service->load_and_apply_runtime(
          runtime->boot_buffer, runtime->slot_capacity);
  if (!loaded.ok()) {
    ESP_LOGE(TAG, "Native configuration could not reload for the live grid (%u)",
             static_cast<unsigned>(loaded.status));
    return;
  }
}

void EspDesktopApp::setup() {
  home_assistant_endpoint_.setup();
  if (core_.start()) {
    cards::set_card_runtime_registry_service(&core_.card_runtime_registry());
  } else {
    ESP_LOGE(TAG, "Application core failed to start");
  }
  connectors::connector_state_service().setup(
      panel_config_button_order_ != nullptr &&
          !panel_config_button_order_->state.empty(),
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

void EspDesktopApp::initialize_native_configuration() {
  ESP_LOGI(TAG, "Starting native configuration initialization");
  if (!native_configuration_requested()) {
    ESP_LOGD(TAG, "Native configuration is not requested for this device");
    native_configuration_initialized_ = true;
    register_panel_config_endpoints();
    return;
  }
  if (!create_native_configuration_runtime()) {
    native_configuration_initialized_ = true;
    register_panel_config_endpoints();
    return;
  }
  NativeConfigurationRuntime &runtime = *native_configuration_runtime_;
  if (!core_.configure_configuration_service(
          runtime.store, runtime.legacy_config, &runtime.validator,
          configuration::PANEL_CONFIG_LEGACY_MODE)) {
    ESP_LOGE(TAG, "Native configuration service is already configured");
    native_configuration_initialized_ = true;
    register_panel_config_endpoints();
    return;
  }
  configuration::ConfigurationService *const panel_config_service =
      core_.configuration_service();
  if (panel_config_service == nullptr) {
    ESP_LOGE(TAG, "Native configuration service is unavailable");
    native_configuration_initialized_ = true;
    register_panel_config_endpoints();
    return;
  }
  panel_config_service->set_runtime_adapter(&runtime.runtime_config);
  if (!runtime.legacy_config.configured()) {
    ESP_LOGW(TAG, "Native configuration sources are not configured");
  } else {
    const configuration::PanelConfigStorageSelection storage =
        configuration::begin_panel_config_storage(
            runtime.blobs, panel_config_card_images_storage_,
            PANEL_CONFIG_STORAGE_SLOT_CAPACITY,
            PANEL_CONFIG_NVS_SLOT_CAPACITY);
    if (!storage.ready) {
      ESP_LOGE(TAG, "Native configuration storage is unavailable");
      native_configuration_initialized_ = true;
      register_panel_config_endpoints();
      return;
    }
    runtime.slot_capacity = storage.slot_capacity;
    if (storage.used_nvs_fallback) {
      ESP_LOGW(TAG,
               "Card-images partition is unavailable; using NVS with %u-byte slots",
               static_cast<unsigned>(runtime.slot_capacity));
    }
    ESP_LOGI(TAG, "Allocating native configuration buffers");
#ifdef USE_ESP32
    // Two fixed slots back the atomic store; the scratch, HTTP request, and
    // delayed boot-application buffers must not overlap each other.
    const size_t panel_config_memory_size = runtime.slot_capacity * 5;
    runtime.memory = static_cast<uint8_t *>(
        heap_caps_malloc(panel_config_memory_size,
                         MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
#endif
    if (runtime.memory == nullptr ||
        !runtime.backend.begin(runtime.memory,
                               runtime.slot_capacity * 2,
                               runtime.slot_capacity)) {
      ESP_LOGE(TAG, "Native configuration memory is unavailable");
      native_configuration_initialized_ = true;
      register_panel_config_endpoints();
      return;
    }
    ESP_LOGI(TAG, "Loading native configuration document");
    panel_config_service->set_scratch_buffer(
        runtime.memory + runtime.slot_capacity * 2,
        runtime.slot_capacity);
    runtime.document_buffer =
        runtime.memory + runtime.slot_capacity * 3;
    runtime.boot_buffer = runtime.memory + runtime.slot_capacity * 4;
    const configuration::ServiceLoadResult loaded = panel_config_service->load(
        runtime.document_buffer, runtime.slot_capacity);
    if (!configuration::panel_config_load_allows_native_endpoints(loaded.status)) {
      ESP_LOGW(TAG,
               "Native configuration initial load failed (%u); keeping legacy configuration endpoints active",
               static_cast<unsigned>(loaded.status));
      runtime.document_buffer = nullptr;
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
      // Publishing the restored values triggers the existing grid-refresh
      // automations. Run that only after every ESPHome component has completed
      // setup: on P4 panels the grid and LVGL objects are not safe to refresh
      // while this component's WiFi-priority setup callback is still running.
      // Browser PUT requests still apply immediately through the runtime
      // adapter; this deferral is strictly for startup restoration.
      runtime.boot_configuration_pending = true;
      this->set_timeout(1000, [this]() { this->apply_boot_configuration(); });
    }
  }
  native_configuration_initialized_ = true;
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
  PanelConfigReader reader(input, loaded.document_size);
  if (reader.begin() != PanelConfigStatus::OK) return;
  std::vector<PanelConfigRecord> records;
  PanelConfigRecord record;
  while (reader.next(&record) == PanelConfigStatus::OK) records.push_back(record);
  std::array<bool, PANEL_CONFIG_MAX_SLOT_COUNT + 1> finder_slots{};
  for (const auto &item : records) {
    if (item.type != PanelConfigRecordType::BUTTON) continue;
    const auto card = parse_cfg(std::string(reinterpret_cast<const char *>(item.value), item.value_size));
    finder_slots[item.slot] = card.entity == "com.apple.finder" && companion_app_shortcuts_enabled(card);
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
        const auto updated = finder_append_folder_tiles(config, occupied, folders, capacity);
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
  home_assistant_endpoint_.loop();
  core_.run_once();
  sync_finder_folders();
  // The app core starts before WiFi so Home Assistant boot automations are
  // safe. The IDF web server starts later, so retry idempotent registrations.
  register_panel_config_endpoints();
}

void EspDesktopApp::on_shutdown() {
  home_assistant_endpoint_.shutdown();
  cards::set_card_runtime_registry_service(nullptr);
  core_.stop();
}

}  // namespace espdesktop
