#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>

#include "../espdesktop/companion_capabilities_generated.h"

namespace esphome::companion {

constexpr uint16_t APP_ICON_SIDE = COMPANION_APP_ICON_SIDE;
constexpr size_t APP_ICON_PIXEL_BYTES =
    COMPANION_APP_ICON_PIXEL_BYTES;
// Each cache record includes a 256-byte header and is aligned to flash erase sectors.
constexpr size_t APP_ICON_RECORD_BYTES =
    ((APP_ICON_PIXEL_BYTES + 256 + 4095) / 4096) * 4096;
constexpr size_t APP_ICON_MAX_APPLICATION_ID_BYTES = 96;
constexpr size_t APP_ICON_MAX_RECORDS = 256;

// Fixed-size RGB565A8 icons share the unused middle of card_images.
// The panel configuration slots and device identity remain outside this area.
class AppIconStore {
 public:
  bool begin();
  bool available() const;
  void set_references(const std::vector<std::string> &application_ids);
  void add_reference(const std::string &application_id);
  void set_enabled_applications(const std::vector<std::string> &application_ids);
  bool hash_for(const std::string &application_id,
                std::array<uint8_t, 32> *hash) const;
  bool is_referenced(const std::string &application_id) const;
  bool copy_pixels(const std::string &application_id, uint8_t *output,
                   size_t capacity);
  bool save(const std::string &application_id,
            const std::array<uint8_t, 32> &hash, const uint8_t *pixels,
            size_t size, std::string *evicted_application_id = nullptr);
  bool remove(const std::string &application_id);
  bool clear_cache();

 private:
  struct Entry {
    std::array<uint8_t, 16> key{};
    std::array<uint8_t, 32> hash{};
    uint16_t slot{UINT16_MAX};
    bool valid{false};
  };

  bool scan_locked();
  bool read_header_locked(uint16_t slot, std::string *application_id,
                          std::array<uint8_t, 32> *hash) const;
  int find_locked(const std::string &application_id) const;
  int free_slot_locked() const;
  int unreferenced_slot_locked() const;
  bool erase_slot_locked(uint16_t slot);
  bool write_slot_locked(uint16_t slot, const std::string &application_id,
                         const std::array<uint8_t, 32> &hash,
                         const uint8_t *pixels);
  static std::array<uint8_t, 16> application_key(
      const std::string &application_id);

  mutable std::mutex mutex_;
  std::array<Entry, APP_ICON_MAX_RECORDS> entries_{};
  std::vector<std::string> references_;
  std::vector<std::string> enabled_applications_;
  size_t slot_count_{0};
  size_t partition_offset_{0};
  bool available_{false};
  void *partition_{nullptr};
};

AppIconStore &app_icon_store();

}  // namespace esphome::companion
