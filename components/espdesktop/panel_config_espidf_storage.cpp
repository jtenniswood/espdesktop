#include "panel_config_espidf_storage.h"
#include "panel_config_transient_storage.h"

#include <algorithm>
#include <cstring>

#ifdef USE_ESP32
#include <esp_err.h>
#include <nvs.h>
#include <esp_partition.h>
#endif

namespace espdesktop::configuration {

#ifdef USE_ESP32
namespace {

constexpr const char *PANEL_CONFIG_NAMESPACE = "espdesktop_cfg";

}  // namespace
#endif

const char *EspIdfPanelConfigBlobStorage::slot_key(uint8_t slot) {
  return slot == 0 ? "slot_a" : (slot == 1 ? "slot_b" : nullptr);
}

EspIdfPanelConfigBlobStorage::~EspIdfPanelConfigBlobStorage() {
#ifdef USE_ESP32
  if (handle_ != 0) nvs_close(handle_);
#endif
}

bool EspIdfPanelConfigBlobStorage::begin() {
#ifdef USE_ESP32
  if (ready_) return true;
  if (nvs_open(PANEL_CONFIG_NAMESPACE, NVS_READWRITE, &handle_) != ESP_OK)
    return false;
  ready_ = true;
  return true;
#else
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::begin_read_only_nvs() {
#ifdef USE_ESP32
  if (ready_) return false;
  nvs_handle_t handle = 0;
  const auto status = nvs_open(PANEL_CONFIG_NAMESPACE, NVS_READONLY, &handle);
  if (status == ESP_OK) handle_ = handle;
  ready_ = status == ESP_OK || status == ESP_ERR_NVS_NOT_FOUND;
  return ready_;
#else
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::begin_card_images_partition(
    size_t slot_capacity) {
#ifdef USE_ESP32
  if (ready_ || slot_capacity == 0) return false;
  const esp_partition_t *const partition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY,
      CARD_IMAGES_PARTITION_LABEL);
  if (partition == nullptr) return false;

  const size_t usable_bytes = panel_config_partition_bytes(partition->size);
  if (!usable_bytes || slot_capacity > PANEL_CONFIG_EXPANDED_FLASH_SLOT_BYTES)
    return false;
  // Keep the deployed small slots at their original offsets. The expanded
  // pair lives immediately before panel identity, clear of the old layout.
  partition_base_ = slot_capacity > PANEL_CONFIG_LEGACY_FLASH_SLOT_BYTES
                        ? PANEL_CONFIG_EXPANDED_FLASH_START : 0;
  partition_slot_capacity_ = slot_capacity;
  partition_ = partition;
  partition_backed_ = true;
  ready_ = true;
  return true;
#else
  (void) slot_capacity;
  return false;
#endif
}

#ifdef USE_ESP32
size_t EspIdfPanelConfigBlobStorage::partition_slot_stride() const {
  return panel_config_flash_slot_stride(partition_slot_capacity_);
}

size_t EspIdfPanelConfigBlobStorage::partition_slot_offset(uint8_t slot) const {
  return partition_base_ + static_cast<size_t>(slot) * partition_slot_stride();
}

bool EspIdfPanelConfigBlobStorage::erase_partition_slot(uint8_t slot, size_t size) {
  const size_t bytes = PARTITION_SLOT_HEADER_SIZE + size;
  const size_t erase_size = ((bytes + FLASH_ERASE_SIZE - 1) / FLASH_ERASE_SIZE) *
                            FLASH_ERASE_SIZE;
  return partition_ != nullptr && slot < CONFIGURATION_SLOT_COUNT &&
         esp_partition_erase_range(partition_, partition_slot_offset(slot),
                                   erase_size) == ESP_OK;
}

bool EspIdfPanelConfigBlobStorage::load_partition_blob(uint8_t slot,
                                                        uint8_t *output,
                                                        size_t capacity) {
  if (partition_ == nullptr || slot >= 2 || output == nullptr ||
      capacity != partition_slot_capacity_)
    return false;
  uint32_t marker = 0;
  const size_t offset = partition_slot_offset(slot);
  if (esp_partition_read(partition_, offset, &marker, sizeof(marker)) != ESP_OK)
    return false;
  if (marker != PARTITION_COMMIT_MARKER) return false;
  return esp_partition_read(partition_, offset + PARTITION_SLOT_HEADER_SIZE,
                            output, capacity) == ESP_OK;
}

bool EspIdfPanelConfigBlobStorage::save_partition_blob(uint8_t slot,
                                                        const uint8_t *data,
                                                        size_t size) {
  if (partition_ == nullptr || slot >= 2 ||
      (size > 0 && data == nullptr) || size > partition_slot_capacity_)
    return false;

  const size_t offset = partition_slot_offset(slot);
  const bool unpublished = size == sizeof(uint32_t) && data != nullptr &&
                           data[0] == 0 && data[1] == 0 && data[2] == 0 &&
                           data[3] == 0;
  if (unpublished) return erase_partition_slot(slot, partition_slot_capacity_);
  if (size < sizeof(uint32_t) || data == nullptr) return false;

  // ConfigurationStore persists payload, metadata and its own magic marker
  // through separate sync boundaries.  Keep our slot unpublished until the
  // final marker is written: a power loss at any earlier point is therefore
  // ignored and the other atomic slot remains authoritative.
  const bool store_magic_is_clear =
      data[0] == 0 && data[1] == 0 && data[2] == 0 && data[3] == 0;
  if (store_magic_is_clear) {
    const bool metadata_is_erased = size >= PARTITION_SLOT_HEADER_SIZE &&
        std::all_of(data + sizeof(uint32_t),
                    data + PARTITION_SLOT_HEADER_SIZE,
                    [](uint8_t value) { return value == 0xFF; });
    const size_t payload_offset = PARTITION_SLOT_HEADER_SIZE;
    if (metadata_is_erased) {
      if (size <= payload_offset) return true;
      return esp_partition_write(partition_,
                                 offset + PARTITION_SLOT_HEADER_SIZE +
                                     payload_offset,
                                 data + payload_offset,
                                 size - payload_offset) == ESP_OK;
    }
    return esp_partition_write(partition_,
                               offset + PARTITION_SLOT_HEADER_SIZE +
                                   sizeof(uint32_t),
                               data + sizeof(uint32_t),
                               size - sizeof(uint32_t)) == ESP_OK;
  }

  if (esp_partition_write(partition_, offset + PARTITION_SLOT_HEADER_SIZE,
                          data, size) != ESP_OK)
    return false;
  return esp_partition_write(partition_, offset, &PARTITION_COMMIT_MARKER,
                             sizeof(PARTITION_COMMIT_MARKER)) == ESP_OK;
}
#endif

BlobLoadResult EspIdfPanelConfigBlobStorage::load_blob(uint8_t slot,
                                                        uint8_t *output,
                                                        size_t capacity) {
#ifdef USE_ESP32
  const char *key = slot_key(slot);
  if (!ready_ || key == nullptr || (capacity > 0 && output == nullptr))
    return {BlobLoadStatus::FAILED};
  if (partition_backed_) {
    if (capacity != partition_slot_capacity_) return {BlobLoadStatus::FAILED};
    return load_partition_blob(slot, output, capacity)
               ? BlobLoadResult{BlobLoadStatus::OK, capacity}
               : BlobLoadResult{BlobLoadStatus::MISSING};
  }
  if (handle_ == 0) return {BlobLoadStatus::MISSING};
  size_t stored_size = 0;
  esp_err_t result = nvs_get_blob(handle_, key, nullptr, &stored_size);
  if (result == ESP_ERR_NVS_NOT_FOUND) return {BlobLoadStatus::MISSING};
  if (result != ESP_OK || stored_size > capacity)
    return {BlobLoadStatus::FAILED};
  std::memset(output, 0xFF, capacity);
  result = nvs_get_blob(handle_, key, output, &stored_size);
  return result == ESP_OK ? BlobLoadResult{BlobLoadStatus::OK, stored_size}
                          : BlobLoadResult{BlobLoadStatus::FAILED};
#else
  (void) slot;
  (void) output;
  (void) capacity;
  return {BlobLoadStatus::FAILED};
#endif
}

bool EspIdfPanelConfigBlobStorage::save_blob(uint8_t slot, const uint8_t *data,
                                              size_t size) {
#ifdef USE_ESP32
  sync_failure_ = StoreStatus::SYNC_FAILED;
  const char *key = slot_key(slot);
  if (partition_backed_)
    return ready_ && save_partition_blob(slot, data, size);
  if (!ready_ || key == nullptr || (size > 0 && data == nullptr))
    return false;
  const auto result = nvs_set_blob(handle_, key, data, size);
  if (result == ESP_ERR_NVS_NOT_ENOUGH_SPACE ||
      result == ESP_ERR_NVS_VALUE_TOO_LONG)
    sync_failure_ = StoreStatus::STORAGE_FULL;
  return result == ESP_OK;
#else
  (void) slot;
  (void) data;
  (void) size;
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::sync() {
#ifdef USE_ESP32
  if (partition_backed_) return ready_;
  // A rejected set_blob leaves its old value intact. A failed commit does
  // not prove that publication was rejected, so retain the generic error even
  // if a backend reports a capacity code here. The store still rolls back.
  sync_failure_ = StoreStatus::SYNC_FAILED;
  return ready_ && nvs_commit(handle_) == ESP_OK;
#else
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::supports_range_io() const {
#ifdef USE_ESP32
  return ready_ && partition_backed_;
#else
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::prepare_range_slot(uint8_t slot, size_t size) {
#ifdef USE_ESP32
  if (!supports_range_io() || size < CONFIGURATION_ENVELOPE_HEADER_SIZE ||
      size > partition_slot_capacity_)
    return false;
  // The erase also clears the outer publication marker. Bytes past the new
  // envelope are ignored by readers and erased if a later save needs them.
  return erase_partition_slot(slot, size);
#else
  (void)slot;
  (void)size;
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::read_range(uint8_t slot, size_t offset,
                                              uint8_t *output, size_t size) {
#ifdef USE_ESP32
  if (!supports_range_io() || slot >= CONFIGURATION_SLOT_COUNT ||
      offset > partition_slot_capacity_ ||
      size > partition_slot_capacity_ - offset ||
      (size > 0 && output == nullptr))
    return false;
  uint32_t marker = 0;
  const size_t base = partition_slot_offset(slot);
  if (esp_partition_read(partition_, base, &marker, sizeof(marker)) != ESP_OK)
    return false;
  if (size == 0)
    return true;
  if (marker != PARTITION_COMMIT_MARKER) {
    std::memset(output, 0xFF, size);
    return true;
  }
  return esp_partition_read(partition_,
                            base + PARTITION_SLOT_HEADER_SIZE + offset, output,
                            size) == ESP_OK;
#else
  (void)slot;
  (void)offset;
  (void)output;
  (void)size;
  return false;
#endif
}

bool EspIdfPanelConfigBlobStorage::write_range(uint8_t slot, size_t offset,
                                               const uint8_t *data,
                                               size_t size) {
#ifdef USE_ESP32
  if (!supports_range_io() || slot >= CONFIGURATION_SLOT_COUNT ||
      offset > partition_slot_capacity_ ||
      size > partition_slot_capacity_ - offset || (size > 0 && data == nullptr))
    return false;
  if (size == 0)
    return true;
  const size_t base = partition_slot_offset(slot);
  if (offset == 0) {
    if (size != sizeof(uint32_t))
      return false;
    if (std::all_of(data, data + size,
                    [](uint8_t value) { return value == 0; }))
      return erase_partition_slot(slot, partition_slot_capacity_);
    // Match the deployed full-blob writer: publish the outer marker only
    // after the complete inner envelope and payload have reached flash.
    if (esp_partition_write(partition_, base + PARTITION_SLOT_HEADER_SIZE, data,
                            size) != ESP_OK)
      return false;
    return esp_partition_write(partition_, base, &PARTITION_COMMIT_MARKER,
                               sizeof(PARTITION_COMMIT_MARKER)) == ESP_OK;
  }
  if (offset < sizeof(uint32_t))
    return false;
  return esp_partition_write(partition_,
                             base + PARTITION_SLOT_HEADER_SIZE + offset, data,
                             size) == ESP_OK;
#else
  (void)slot;
  (void)offset;
  (void)data;
  (void)size;
  return false;
#endif
}

StoreStatus migrate_expanded_panel_config(
    ConfigurationStore &destination, uint8_t *scratch, size_t scratch_size,
    ConfigurationBuffer::Allocate allocate, ConfigurationBuffer::Release release) {
  const auto current = destination.load_prefix(nullptr, 0);
  if (current.status != StoreStatus::EMPTY) return current.status;

  const auto read_source = [&](bool from_flash) -> LoadResult {
    EspIdfPanelConfigBlobStorage source;
    const size_t capacity = from_flash ? PANEL_CONFIG_LEGACY_FLASH_SLOT_BYTES
                                       : PANEL_CONFIG_NVS_SLOT_BYTES;
    const bool opened = from_flash ? source.begin_card_images_partition(capacity)
                                    : source.begin_read_only_nvs();
    TransientBlobStorageBackend<PANEL_CONFIG_LEGACY_FLASH_SLOT_BYTES> backend(
        source, allocate, release);
    if (!opened || !backend.begin(capacity)) return {StoreStatus::READ_FAILED};
    ConfigurationStore store(backend);
    return store.load(scratch, scratch_size);
  };

  auto previous = read_source(true);
  if (previous.status == StoreStatus::EMPTY) previous = read_source(false);
  if (!previous.ok()) return previous.status;
  return destination.initialize_from(previous.generation, scratch,
                                     previous.payload_size).status;
}

}  // namespace espdesktop::configuration
