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
inline const esp_partition_t *esp_partition_find_first(int, int, const char *) { return &partition; }
inline int esp_partition_read(const esp_partition_t *, size_t offset, void *out, size_t size) {
  if (fail_read || offset + size > flash.size()) return -1;
  if (size > 256) last_payload_offset = offset;
  std::memcpy(out, flash.data() + offset, size);
  return ESP_OK;
}
inline int esp_partition_write(const esp_partition_t *, size_t offset, const void *data, size_t size) {
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
  assert(store.save("app.one", digest(pixels), pixels.data(), pixels.size()));
  payload_hashes = 0;
  assert(store.copy_pixels("app.one", output.data(), output.size()) && output == pixels);
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
}
'''
with tempfile.TemporaryDirectory(prefix="app-icon-store-") as directory:
    temp = Path(directory)
    (temp / "mbedtls").mkdir()
    (temp / "esp_partition.h").write_text(PARTITION)
    (temp / "mbedtls/sha256.h").write_text(HASH)
    (temp / "test.cpp").write_text(TEST)
    subprocess.run([os.environ.get("CXX", "c++"), "-std=c++17", "-Wall", "-Wextra",
                    "-Werror", "-DUSE_ESP32", "-I", str(temp), "-I",
                    str(ROOT / "components/companion"), str(temp / "test.cpp"),
                    str(ROOT / "components/companion/app_icon_store.cpp"),
                    "-o", str(temp / "test")], check=True)
    subprocess.run([str(temp / "test")], check=True)
print("Flash icons verify once per boot/replacement; repeat page visits reuse verification.")
