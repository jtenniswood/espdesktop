#include "app_icon_store.h"

#include <algorithm>
#include <cstring>

#ifdef USE_ESP32
#include <esp_partition.h>
#include <mbedtls/sha256.h>
#endif

namespace esphome::companion {
namespace {

constexpr size_t kFlashEraseBytes = 4096;
constexpr size_t kRecordHeaderBytes = 256;
constexpr size_t kHeaderHashOffset = 8;
constexpr size_t kHeaderAppIdOffset = 40;
constexpr size_t kPanelConfigSlotCapacity = 40 * 1024;
constexpr size_t kPanelConfigSlotHeaderBytes = 16;
constexpr size_t kPanelIdentityReservedBytes = 16 * 1024;
constexpr uint8_t kRecordMagic[4] = {'E', 'I', 'C', 'A'};

size_t panel_config_slots_end() {
  const size_t unaligned = kPanelConfigSlotCapacity + kPanelConfigSlotHeaderBytes;
  const size_t slot_stride =
      ((unaligned + kFlashEraseBytes - 1) / kFlashEraseBytes) * kFlashEraseBytes;
  return slot_stride * 2;
}

bool application_id_valid(const std::string &application_id) {
  return !application_id.empty() &&
      application_id.size() <= APP_ICON_MAX_APPLICATION_ID_BYTES &&
      std::all_of(application_id.begin(), application_id.end(), [](unsigned char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
               (c >= '0' && c <= '9') || c == '.' || c == '_' || c == '-';
      });
}

}  // namespace

AppIconStore &app_icon_store() {
  static AppIconStore store;
  return store;
}

bool AppIconStore::begin() {
  std::lock_guard<std::mutex> lock(mutex_);
#ifdef USE_ESP32
  if (available_) return true;
  auto *partition = esp_partition_find_first(
      ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_ANY, "card_images");
  if (!partition || partition->size <= kPanelIdentityReservedBytes) return false;
  const size_t data_end = partition->size - kPanelIdentityReservedBytes;
  partition_offset_ = panel_config_slots_end();
  if (data_end <= partition_offset_) return false;
  slot_count_ = std::min(APP_ICON_MAX_RECORDS,
                         (data_end - partition_offset_) / APP_ICON_RECORD_BYTES);
  if (slot_count_ == 0) return false;
  partition_ = const_cast<esp_partition_t *>(partition);
  available_ = scan_locked();
  return available_;
#else
  return false;
#endif
}

bool AppIconStore::available() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return available_;
}

std::array<uint8_t, 16> AppIconStore::application_key(
    const std::string &application_id) {
  std::array<uint8_t, 16> key{};
#ifdef USE_ESP32
  std::array<uint8_t, 32> digest{};
  mbedtls_sha256(reinterpret_cast<const uint8_t *>(application_id.data()),
                 application_id.size(), digest.data(), 0);
  std::copy_n(digest.begin(), key.size(), key.begin());
#else
  for (size_t i = 0; i < application_id.size(); ++i)
    key[i % key.size()] = static_cast<uint8_t>(key[i % key.size()] * 33u + application_id[i]);
#endif
  return key;
}

bool AppIconStore::read_header_locked(
    uint16_t slot, std::string *application_id,
    std::array<uint8_t, 32> *hash) const {
#ifdef USE_ESP32
  if (!partition_ || slot >= slot_count_) return false;
  std::array<uint8_t, kRecordHeaderBytes> header{};
  const auto *partition = static_cast<const esp_partition_t *>(partition_);
  const size_t offset = partition_offset_ + static_cast<size_t>(slot) * APP_ICON_RECORD_BYTES;
  if (esp_partition_read(partition, offset, header.data(), header.size()) != ESP_OK ||
      std::memcmp(header.data(), kRecordMagic, sizeof(kRecordMagic)) != 0 ||
      header[4] != 5 || header[5] == 0 ||
      header[5] > APP_ICON_MAX_APPLICATION_ID_BYTES ||
      header[6] != APP_ICON_SIDE || header[7] != APP_ICON_SIDE) return false;
  if (application_id) {
    application_id->assign(reinterpret_cast<const char *>(header.data() + kHeaderAppIdOffset),
                           header[5]);
    if (!application_id_valid(*application_id)) return false;
  }
  if (hash) std::copy_n(header.begin() + kHeaderHashOffset, hash->size(), hash->begin());
  return true;
#else
  (void)slot;
  (void)application_id;
  (void)hash;
  return false;
#endif
}

bool AppIconStore::scan_locked() {
#ifdef USE_ESP32
  entries_.fill({});
  const auto *partition = static_cast<const esp_partition_t *>(partition_);
  for (size_t slot = 0; slot < slot_count_; ++slot) {
    std::string application_id;
    std::array<uint8_t, 32> hash{};
    if (!read_header_locked(static_cast<uint16_t>(slot), &application_id, &hash)) continue;
    const auto key = application_key(application_id);
    auto duplicate = std::find_if(entries_.begin(), entries_.end(), [&](const Entry &entry) {
      return entry.valid && entry.key == key;
    });
    if (duplicate != entries_.end())
      erase_slot_locked(duplicate->slot);
    Entry *target = &entries_[slot];
    target->key = key;
    target->hash = hash;
    target->slot = static_cast<uint16_t>(slot);
    target->valid = true;
  }
  (void)partition;
  return true;
#else
  return false;
#endif
}

int AppIconStore::find_locked(const std::string &application_id) const {
  const auto key = application_key(application_id);
  for (const auto &entry : entries_) {
    if (!entry.valid || entry.key != key) continue;
    std::string stored_id;
    if (read_header_locked(entry.slot, &stored_id, nullptr) && stored_id == application_id)
      return entry.slot;
  }
  return -1;
}

int AppIconStore::free_slot_locked() const {
  for (size_t slot = 0; slot < slot_count_; ++slot) {
    if (std::none_of(entries_.begin(), entries_.end(), [slot](const Entry &entry) {
          return entry.valid && entry.slot == slot;
        })) return static_cast<int>(slot);
  }
  return -1;
}

int AppIconStore::unreferenced_slot_locked() const {
  int first_valid = -1;
  for (const auto &entry : entries_) {
    if (!entry.valid) continue;
    if (first_valid < 0) first_valid = entry.slot;
    std::string application_id;
    if (!read_header_locked(entry.slot, &application_id, nullptr)) return entry.slot;
    if (std::find(references_.begin(), references_.end(), application_id) == references_.end())
      return entry.slot;
  }
  // All records are cache entries: even an icon used by a card can be fetched
  // again, so never let active references make the image cache non-evictable.
  return first_valid;
}

bool AppIconStore::erase_slot_locked(uint16_t slot) {
#ifdef USE_ESP32
  if (!partition_ || slot >= slot_count_) return false;
  const auto *partition = static_cast<const esp_partition_t *>(partition_);
  const size_t offset = partition_offset_ + static_cast<size_t>(slot) * APP_ICON_RECORD_BYTES;
  if (esp_partition_erase_range(partition, offset, APP_ICON_RECORD_BYTES) != ESP_OK) return false;
  for (auto &entry : entries_) if (entry.valid && entry.slot == slot) entry = {};
  return true;
#else
  (void)slot;
  return false;
#endif
}

void AppIconStore::set_references(const std::vector<std::string> &application_ids) {
  std::lock_guard<std::mutex> lock(mutex_);
  references_.clear();
  for (const auto &id : application_ids)
    if (application_id_valid(id) && std::find(references_.begin(), references_.end(), id) == references_.end())
      references_.push_back(id);
  for (const auto &entry : entries_) {
    if (!entry.valid) continue;
    std::string id;
    if (!read_header_locked(entry.slot, &id, nullptr) ||
        std::find(references_.begin(), references_.end(), id) == references_.end())
      erase_slot_locked(entry.slot);
  }
}

void AppIconStore::add_reference(const std::string &application_id) {
  if (!application_id_valid(application_id)) return;
  std::lock_guard<std::mutex> lock(mutex_);
  if (std::find(references_.begin(), references_.end(), application_id) == references_.end())
    references_.push_back(application_id);
}

void AppIconStore::set_enabled_applications(const std::vector<std::string> &application_ids) {
  std::lock_guard<std::mutex> lock(mutex_);
  enabled_applications_.clear();
  for (const auto &id : application_ids)
    if (application_id_valid(id) &&
        std::find(enabled_applications_.begin(), enabled_applications_.end(), id) == enabled_applications_.end())
      enabled_applications_.push_back(id);
  for (const auto &entry : entries_) {
    if (!entry.valid) continue;
    std::string id;
    if (read_header_locked(entry.slot, &id, nullptr) &&
        std::find(enabled_applications_.begin(), enabled_applications_.end(), id) == enabled_applications_.end())
      erase_slot_locked(entry.slot);
  }
}

bool AppIconStore::hash_for(const std::string &application_id,
                            std::array<uint8_t, 32> *hash) const {
  if (!hash) return false;
  std::lock_guard<std::mutex> lock(mutex_);
  const int slot = find_locked(application_id);
  if (slot < 0) return false;
  const auto entry = std::find_if(entries_.begin(), entries_.end(), [slot](const Entry &candidate) {
    return candidate.valid && candidate.slot == slot;
  });
  if (entry == entries_.end()) return false;
  *hash = entry->hash;
  return true;
}

bool AppIconStore::is_referenced(const std::string &application_id) const {
  std::lock_guard<std::mutex> lock(mutex_);
  return std::find(references_.begin(), references_.end(), application_id) !=
         references_.end();
}

bool AppIconStore::copy_pixels(const std::string &application_id,
                               uint8_t *output, size_t capacity) {
#ifdef USE_ESP32
  if (!output || capacity < APP_ICON_PIXEL_BYTES) return false;
  std::lock_guard<std::mutex> lock(mutex_);
  const int slot = find_locked(application_id);
  if (slot < 0) return false;
  const auto *partition = static_cast<const esp_partition_t *>(partition_);
  const size_t offset = partition_offset_ + static_cast<size_t>(slot) * APP_ICON_RECORD_BYTES + kRecordHeaderBytes;
  if (esp_partition_read(partition, offset, output, APP_ICON_PIXEL_BYTES) != ESP_OK) return false;
  std::array<uint8_t, 32> actual{};
  mbedtls_sha256(output, APP_ICON_PIXEL_BYTES, actual.data(), 0);
  const auto entry = std::find_if(entries_.begin(), entries_.end(), [slot](const Entry &candidate) {
    return candidate.valid && candidate.slot == slot;
  });
  if (entry == entries_.end() || entry->hash != actual) {
    erase_slot_locked(static_cast<uint16_t>(slot));
    return false;
  }
  return true;
#else
  (void)application_id;
  (void)output;
  (void)capacity;
  return false;
#endif
}

bool AppIconStore::write_slot_locked(uint16_t slot, const std::string &application_id,
                                     const std::array<uint8_t, 32> &hash,
                                     const uint8_t *pixels) {
#ifdef USE_ESP32
  if (!partition_ || slot >= slot_count_ || !pixels) return false;
  const auto *partition = static_cast<const esp_partition_t *>(partition_);
  const size_t offset = partition_offset_ + static_cast<size_t>(slot) * APP_ICON_RECORD_BYTES;
  if (esp_partition_erase_range(partition, offset, APP_ICON_RECORD_BYTES) != ESP_OK) return false;
  if (esp_partition_write(partition, offset + kRecordHeaderBytes, pixels,
                          APP_ICON_PIXEL_BYTES) != ESP_OK) return false;
  std::array<uint8_t, kRecordHeaderBytes> header{};
  header.fill(0xFF);
  header[4] = 5;
  header[5] = static_cast<uint8_t>(application_id.size());
  header[6] = APP_ICON_SIDE;
  header[7] = APP_ICON_SIDE;
  std::copy(hash.begin(), hash.end(), header.begin() + kHeaderHashOffset);
  std::copy(application_id.begin(), application_id.end(), header.begin() + kHeaderAppIdOffset);
  if (esp_partition_write(partition, offset + sizeof(kRecordMagic),
                          header.data() + sizeof(kRecordMagic),
                          header.size() - sizeof(kRecordMagic)) != ESP_OK ||
      esp_partition_write(partition, offset, kRecordMagic, sizeof(kRecordMagic)) != ESP_OK)
    return false;
  auto &entry = entries_[slot];
  entry.key = application_key(application_id);
  entry.hash = hash;
  entry.slot = slot;
  entry.valid = true;
  return true;
#else
  (void)slot;
  (void)application_id;
  (void)hash;
  (void)pixels;
  return false;
#endif
}

bool AppIconStore::save(const std::string &application_id,
                        const std::array<uint8_t, 32> &hash,
                        const uint8_t *pixels, size_t size,
                        std::string *evicted_application_id) {
  if (evicted_application_id) evicted_application_id->clear();
#ifdef USE_ESP32
  if (!pixels || size != APP_ICON_PIXEL_BYTES || !application_id_valid(application_id)) return false;
  std::array<uint8_t, 32> actual{};
  mbedtls_sha256(pixels, size, actual.data(), 0);
  if (actual != hash) return false;
  std::lock_guard<std::mutex> lock(mutex_);
  if (!available_ || std::find(references_.begin(), references_.end(), application_id) == references_.end() ||
      std::find(enabled_applications_.begin(), enabled_applications_.end(), application_id) == enabled_applications_.end()) return false;
  const int old_slot = find_locked(application_id);
  if (old_slot >= 0) {
    const auto old = std::find_if(entries_.begin(), entries_.end(), [old_slot](const Entry &entry) {
      return entry.valid && entry.slot == old_slot;
    });
    if (old != entries_.end() && old->hash == hash) return true;
  }
  int slot = free_slot_locked();
  if (slot < 0) slot = unreferenced_slot_locked();
  if (slot < 0) slot = old_slot;
  std::string evicted_id;
  if (slot >= 0 && slot != old_slot &&
      read_header_locked(static_cast<uint16_t>(slot), &evicted_id, nullptr) &&
      evicted_id == application_id) {
    evicted_id.clear();
  }
  if (slot < 0 || !write_slot_locked(static_cast<uint16_t>(slot), application_id, hash, pixels)) return false;
  if (old_slot >= 0 && old_slot != slot) erase_slot_locked(static_cast<uint16_t>(old_slot));
  if (evicted_application_id) *evicted_application_id = std::move(evicted_id);
  return true;
#else
  (void)application_id;
  (void)hash;
  (void)pixels;
  (void)size;
  (void)evicted_application_id;
  return false;
#endif
}

bool AppIconStore::remove(const std::string &application_id) {
  std::lock_guard<std::mutex> lock(mutex_);
  const int slot = find_locked(application_id);
  return slot < 0 || erase_slot_locked(static_cast<uint16_t>(slot));
}

bool AppIconStore::clear_cache() {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!available_) return false;
  bool cleared = true;
  for (size_t slot = 0; slot < slot_count_; ++slot) {
    const bool occupied = std::any_of(entries_.begin(), entries_.end(), [slot](const Entry &entry) {
      return entry.valid && entry.slot == slot;
    });
    if (occupied && !erase_slot_locked(static_cast<uint16_t>(slot))) cleared = false;
  }
  if (!cleared) scan_locked();
  return cleared;
}

}  // namespace esphome::companion
