"""Exercise flash icon verification and reuse through the production store."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PARTITION = r'''
#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>
constexpr int ESP_OK = 0;
constexpr int ESP_PARTITION_TYPE_DATA = 1, ESP_PARTITION_SUBTYPE_ANY = 255;
struct esp_partition_t { size_t size = 2 * 1024 * 1024; };
inline esp_partition_t partition;
inline std::vector<uint8_t> flash(partition.size, 0xff);
inline bool fail_read = false, fail_erase = false, fail_write = false;
inline size_t last_payload_offset = 0;
inline unsigned partition_reads = 0, partition_writes = 0;
inline const esp_partition_t *esp_partition_find_first(int, int, const char *) { return &partition; }
inline int esp_partition_read(const esp_partition_t *, size_t offset, void *out, size_t size) {
  ++partition_reads;
  if (fail_read || offset + size > flash.size()) return -1;
  if (size > 256) last_payload_offset = offset;
  std::memcpy(out, flash.data() + offset, size);
  return ESP_OK;
}
inline int esp_partition_write(const esp_partition_t *, size_t offset, const void *data, size_t size) {
  ++partition_writes;
  if (offset + size > flash.size()) return -1;
  // A failed write may already have changed storage.
  std::memcpy(flash.data() + offset, data, fail_write ? size / 2 : size);
  return fail_write ? -1 : ESP_OK;
}
inline int esp_partition_erase_range(const esp_partition_t *, size_t offset, size_t size) {
  if (offset + size > flash.size()) return -1;
  if (fail_erase) {
    flash[offset + 256] ^= 1; // Damage payload while leaving its header readable.
    return -1;
  }
  std::fill_n(flash.data() + offset, size, 0xff);
  return ESP_OK;
}
'''
MEMORY = r'''
#pragma once
#include <cassert>
#include <cstddef>
#include <cstdint>
constexpr unsigned MALLOC_CAP_SPIRAM = 1, MALLOC_CAP_8BIT = 2;
inline size_t memory_bytes = 0, free_psram = 8 * 1024 * 1024;
inline bool fail_memory_allocation = false;
inline unsigned memory_allocations = 0;
inline size_t heap_caps_get_free_size(unsigned caps) {
  assert(caps == (MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  return free_psram;
}
inline size_t heap_caps_get_largest_free_block(unsigned caps) { return heap_caps_get_free_size(caps); }
namespace esphome {
template<class T> struct RAMAllocator {
  enum { ALLOC_EXTERNAL = 1 };
  explicit RAMAllocator(int flags) { assert(flags == ALLOC_EXTERNAL); }
  T *allocate(size_t size) {
    if (fail_memory_allocation) return nullptr;
    ++memory_allocations;
    memory_bytes += size; free_psram -= size;
    return new T[size];
  }
  void deallocate(T *p, size_t size) {
    assert(p && memory_bytes >= size);
    memory_bytes -= size; free_psram += size;
    delete[] p;
  }
};
}
'''
HASH = r'''
#pragma once
#include <cstddef>
#include <cstdint>
#include <cstring>
inline unsigned payload_hashes = 0;
inline bool fail_hash = false;
// Deterministic digest double: test the store's verification lifecycle, not SHA.
inline int mbedtls_sha256(const uint8_t *data, size_t size, uint8_t *out, int) {
  if (size > 256) ++payload_hashes;
  if (fail_hash) return -1;
  uint32_t hash = 2166136261u;
  for (size_t i = 0; i < size; ++i) hash = (hash ^ data[i]) * 16777619u;
  for (int i = 0; i < 8; ++i) std::memcpy(out + i * 4, &hash, 4);
  return 0;
}
'''
TEST = r'''
#include <cassert>
#include "esp_partition.h"
#include "mbedtls/sha256.h"
#include "esp_heap_caps.h"
#include "app_icon_store.h"
using namespace esphome::companion;
std::array<uint8_t, 32> digest(const std::vector<uint8_t> &pixels) {
  std::array<uint8_t, 32> result{};
  assert(mbedtls_sha256(pixels.data(), pixels.size(), result.data(), 0) == 0);
  return result;
}
int main() {
  AppIconStore store;
  assert(store.begin());
  store.set_references({"app.one"});
  store.set_enabled_applications({"app.one"});
  std::vector<uint8_t> pixels(APP_ICON_PIXEL_BYTES, 42), output(APP_ICON_PIXEL_BYTES);
  const auto expected_hash = digest(pixels);
  assert(store.save("app.one", expected_hash, pixels.data(), pixels.size()));
  payload_hashes = 0;
  std::array<uint8_t, 32> copied_hash{};
  assert(store.copy_pixels("app.one", output.data(), output.size(), &copied_hash) && output == pixels);
  assert(copied_hash == expected_hash);
  assert(payload_hashes == 1);
  for (int visit = 0; visit < 20; ++visit) {
    std::fill(output.begin(), output.end(), 0);
    assert(store.copy_pixels("app.one", output.data(), output.size()) && output == pixels);
  }
  assert(payload_hashes == 1); // Returning home no longer rehashes every icon.
  fail_read = true;
  assert(!store.copy_pixels("app.one", output.data(), output.size()));
  fail_read = false;
  assert(!store.copy_pixels("app.one", output.data(), output.size() - 1));
  // Replacements must verify the new flash bytes on first use.
  pixels[0] = 99;
  assert(store.save("app.one", digest(pixels), pixels.data(), pixels.size()));
  payload_hashes = 0;
  assert(store.copy_pixels("app.one", output.data(), output.size()) && output == pixels);
  assert(store.copy_pixels("app.one", output.data(), output.size()));
  assert(payload_hashes == 1);
  // A fresh boot distrusts persisted bytes and rejects a damaged record.
  flash[last_payload_offset] ^= 1;
  AppIconStore rebooted;
  assert(rebooted.begin());
  assert(!rebooted.copy_pixels("app.one", output.data(), output.size()));
  std::array<uint8_t, 32> missing_hash{};
  assert(!rebooted.hash_for("app.one", &missing_hash));
  // Failed integrity checks never mark a record verified.
  assert(store.clear_cache());
  assert(store.save("app.one", digest(pixels), pixels.data(), pixels.size()));
  fail_hash = true;
  assert(!store.copy_pixels("app.one", output.data(), output.size()));
  fail_hash = false;
  assert(store.save("app.one", digest(pixels), pixels.data(), pixels.size()));
  assert(store.copy_pixels("app.one", output.data(), output.size()));
  // Partial erase failure invalidates previous verification, even if the
  // header survives or the operation reports failure.
  fail_erase = true;
  assert(!store.remove("app.one"));
  fail_erase = false;
  assert(!store.copy_pixels("app.one", output.data(), output.size()));
  assert(store.clear_cache());
  assert(store.save("app.one", digest(pixels), pixels.data(), pixels.size()));
  assert(store.copy_pixels("app.one", output.data(), output.size()));
  fail_memory_allocation = true;
  // Without external memory, the deployed 2 MB partition still holds 11 icons. A setup with
  // 13 apps must rotate cold icons rather than overwriting one slot forever.
  assert(store.clear_cache());
  std::vector<std::string> apps;
  for (int index = 0; index < 13; ++index) apps.push_back("app." + std::to_string(index));
  store.set_references(apps);
  store.set_enabled_applications(apps);
  for (int index = 0; index < 11; ++index)
    assert(store.save(apps[index], digest(pixels), pixels.data(), pixels.size()));
  assert(store.copy_pixels(apps[0], output.data(), output.size())); // Keep a visible icon hot.
  std::string evicted;
  assert(store.save(apps[11], digest(pixels), pixels.data(), pixels.size(), &evicted));
  assert(evicted == apps[1]);
  assert(store.copy_pixels(apps[11], output.data(), output.size()));
  assert(store.save(apps[12], digest(pixels), pixels.data(), pixels.size(), &evicted));
  assert(evicted == apps[2]);
  assert(store.copy_pixels(apps[0], output.data(), output.size()));
  assert(store.copy_pixels(apps[11], output.data(), output.size()));
  assert(store.copy_pixels(apps[12], output.data(), output.size()));
  // An evicted icon can be fetched and stored again without a cache clear.
  assert(!store.copy_pixels(apps[1], output.data(), output.size()));
  assert(store.save(apps[1], digest(pixels), pixels.data(), pixels.size(), &evicted));
  assert(store.copy_pixels(apps[1], output.data(), output.size()));
  fail_memory_allocation = false;
  assert(store.clear_cache());
  apps.clear();
  for (size_t index = 0; index < 25; ++index) apps.push_back("large.setup." + std::to_string(index));
  store.set_references(apps);
  store.set_enabled_applications(apps);
  for (size_t index = 0; index < 23; ++index) {
    std::fill(pixels.begin(), pixels.end(), index + 10);
    assert(store.save(apps[index], digest(pixels), pixels.data(), pixels.size(), &evicted));
    assert(evicted.empty());
  }
  assert(APP_ICON_MEMORY_CACHE_RECORDS == 12);
  assert(memory_bytes == 12 * APP_ICON_PIXEL_BYTES && memory_bytes <= APP_ICON_MEMORY_CACHE_BYTES);
  for (size_t index = 0; index < 23; ++index) {
    assert(store.hash_for(apps[index], &copied_hash));
    assert(store.copy_pixels(apps[index], output.data(), output.size(), &copied_hash));
    assert(std::all_of(output.begin(), output.end(), [index](uint8_t value) { return value == index + 10; }));
    assert(copied_hash == digest(output));
  }
  // Both flash and overflow entries are readable. Overflow reads do not touch flash.
  const auto reads = partition_reads, writes = partition_writes;
  for (int visit = 0; visit < 20; ++visit)
    assert(store.copy_pixels(apps[11], output.data(), output.size()));
  assert(partition_reads == reads && partition_writes == writes);
  const auto allocations_before = memory_allocations;
  std::fill(pixels.begin(), pixels.end(), 90);
  assert(store.save(apps[23], digest(pixels), pixels.data(), pixels.size(), &evicted));
  assert(evicted == apps[12]); // App 11 was just read, so the next oldest RAM entry goes.
  assert(memory_allocations == allocations_before && partition_writes == writes);
  assert(!store.hash_for(apps[12], &copied_hash));
  assert(store.copy_pixels(apps[23], output.data(), output.size()) && output == pixels);
  // Replacing artwork already in RAM updates its content/hash without new storage.
  pixels[0] = 91;
  assert(store.save(apps[23], digest(pixels), pixels.data(), pixels.size(), &evicted));
  assert(evicted.empty() && memory_allocations == allocations_before);
  assert(store.copy_pixels(apps[23], output.data(), output.size()) && output == pixels);
  // Volatile overflow is deliberately excluded from a fresh boot's flash scan.
  AppIconStore after_restart;
  assert(after_restart.begin());
  assert(after_restart.copy_pixels(apps[0], output.data(), output.size()));
  assert(!after_restart.copy_pixels(apps[23], output.data(), output.size()));
  assert(store.remove(apps[23]));
  assert(memory_bytes == 11 * APP_ICON_PIXEL_BYTES);
  auto remaining = apps;
  remaining.erase(std::remove(remaining.begin(), remaining.end(), apps[11]), remaining.end());
  store.set_references(remaining);
  assert(!store.hash_for(apps[11], &copied_hash) && memory_bytes == 10 * APP_ICON_PIXEL_BYTES);
  store.set_enabled_applications({apps[0]});
  assert(memory_bytes == 0);
  store.set_enabled_applications(apps);
  store.set_references(apps);
  // Memory pressure blocks growth before it consumes the drawing/transfer reserve.
  store.clear_cache();
  for (int index = 0; index < 11; ++index)
    assert(store.save(apps[index], digest(pixels), pixels.data(), pixels.size()));
  free_psram = APP_ICON_MEMORY_HEADROOM_BYTES;
  assert(store.save(apps[11], digest(pixels), pixels.data(), pixels.size(), &evicted));
  assert(!evicted.empty() && memory_bytes == 0 && memory_allocations == allocations_before);
  free_psram = 8 * 1024 * 1024;
  assert(store.save(apps[24], digest(pixels), pixels.data(), pixels.size()));
  assert(memory_bytes == APP_ICON_PIXEL_BYTES);
  assert(store.clear_cache() && memory_bytes == 0);
}
'''
with tempfile.TemporaryDirectory(prefix="app-icon-store-") as directory:
    temp = Path(directory)
    (temp / "mbedtls").mkdir()
    (temp / "esphome/core").mkdir(parents=True)
    (temp / "esp_heap_caps.h").write_text(MEMORY)
    (temp / "esphome/core/helpers.h").write_text('#include "esp_heap_caps.h"\n')
    (temp / "esp_partition.h").write_text(PARTITION)
    (temp / "mbedtls/sha256.h").write_text(HASH)
    (temp / "test.cpp").write_text(TEST)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra",
                    "-Werror", "-fsanitize=address,undefined", "-DUSE_ESP32", "-I", str(temp), "-I",
                    str(ROOT / "components/companion"), str(temp / "test.cpp"),
                    str(ROOT / "components/companion/app_icon_store.cpp"),
                    "-o", str(temp / "test")], check=True)
    subprocess.run([str(temp / "test")], check=True)
print("23 full-resolution icons fit across flash and bounded external RAM; reads, eviction and cleanup stay safe.")
