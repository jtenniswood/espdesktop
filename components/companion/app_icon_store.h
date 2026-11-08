#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <memory>
#include <string>
#include <vector>

#include "../espdesktop/companion_capabilities_generated.h"

namespace esphome::companion {

constexpr uint16_t APP_ICON_SIDE = COMPANION_APP_ICON_SIDE;
static_assert(APP_ICON_SIDE <= 255, "App icon cache dimensions use one byte");
constexpr size_t APP_ICON_PIXEL_BYTES =
    COMPANION_APP_ICON_PIXEL_BYTES;
// Each cache record includes a 256-byte header and is aligned to flash erase sectors.
constexpr size_t APP_ICON_RECORD_BYTES =
    ((APP_ICON_PIXEL_BYTES + 256 + 4095) / 4096) * 4096;
constexpr size_t APP_ICON_MAX_APPLICATION_ID_BYTES = 96;
constexpr size_t APP_ICON_MAX_RECORDS = 256;
constexpr size_t APP_ICON_MEMORY_CACHE_BYTES = 2 * 1024 * 1024;
constexpr size_t APP_ICON_MEMORY_CACHE_RECORDS = APP_ICON_MEMORY_CACHE_BYTES / APP_ICON_PIXEL_BYTES;
constexpr size_t APP_ICON_MEMORY_HEADROOM_BYTES = 1024 * 1024;

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
                   size_t capacity, std::array<uint8_t, 32> *copied_hash = nullptr);
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
    uint64_t last_used{0};
    // Flash records are immutable until erased/replaced. Verify their payload
    // on the first read after boot or a write, rather than on every page visit.
    bool pixels_verified{false};
  };

  struct PixelDeleter {
    size_t capacity{0};
    void operator()(uint8_t *pixels) const;
  };
  struct MemoryEntry {
    std::string application_id;
    std::array<uint8_t, 32> hash{};
    std::unique_ptr<uint8_t, PixelDeleter> pixels;
    size_t stored_bytes{0};
    bool compressed{false};
    uint64_t last_used{0};
  };

  int find_memory_locked(const std::string &application_id) const;
  bool save_memory_locked(const std::string &application_id,
                          const std::array<uint8_t, 32> &hash, const uint8_t *pixels,
                          std::string *evicted_application_id);
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
  std::array<MemoryEntry, APP_ICON_MEMORY_CACHE_RECORDS> memory_entries_{};
  std::vector<std::string> references_;
  std::vector<std::string> enabled_applications_;
  uint64_t access_sequence_{0};
  size_t slot_count_{0};
  size_t partition_offset_{0};
  bool available_{false};
  void *partition_{nullptr};
};

AppIconStore &app_icon_store();

}  // namespace esphome::companion
