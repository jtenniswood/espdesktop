#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <string_view>
#include <type_traits>

namespace esphome::companion {

inline constexpr size_t COMPANION_MAX_CREDENTIALS = 4;
inline constexpr size_t COMPANION_CREDENTIAL_ID_SIZE = 8;
inline constexpr size_t COMPANION_CREDENTIAL_KEY_SIZE = 32;
inline constexpr size_t COMPANION_CREDENTIAL_NAME_SIZE = 48;

struct CompanionCredentialEntry {
  std::array<uint8_t, COMPANION_CREDENTIAL_ID_SIZE> id{};
  std::array<uint8_t, COMPANION_CREDENTIAL_KEY_SIZE> key{};
  uint32_t sequence{0};
  std::array<char, COMPANION_CREDENTIAL_NAME_SIZE> name{};
};

// Stored under its own preference key so older firmware can keep using the
// original single credential fields. Version 1 is migrated from that credential
// on first boot after an update.
struct CompanionCredentialsPreference {
  uint32_t version{1};
  uint8_t count{0};
  std::array<uint8_t, 3> reserved{};
  std::array<CompanionCredentialEntry, COMPANION_MAX_CREDENTIALS> entries{};

  bool valid() const {
    return this->version == 1 && this->count <= COMPANION_MAX_CREDENTIALS;
  }

  int find_id(const uint8_t *id) const {
    if (id == nullptr) return -1;
    for (size_t index = 0; index < this->count; index++) {
      if (std::equal(this->entries[index].id.begin(), this->entries[index].id.end(), id)) {
        return static_cast<int>(index);
      }
    }
    return -1;
  }

  int add(const uint8_t *key, const uint8_t *id, std::string_view name) {
    if (key == nullptr || id == nullptr || this->count >= COMPANION_MAX_CREDENTIALS ||
        this->find_id(id) >= 0) {
      return -1;
    }
    auto &entry = this->entries[this->count];
    entry = {};
    std::copy_n(id, COMPANION_CREDENTIAL_ID_SIZE, entry.id.begin());
    std::copy_n(key, COMPANION_CREDENTIAL_KEY_SIZE, entry.key.begin());
    entry.sequence = 0;
    sanitize_name(entry.name, name);
    return static_cast<int>(this->count++);
  }

  bool set_sequence(size_t index, uint32_t sequence) {
    if (index >= this->count) return false;
    this->entries[index].sequence = sequence;
    return true;
  }

  bool revoke(size_t index) {
    if (index >= this->count) return false;
    for (size_t move = index; move + 1 < this->count; move++) {
      this->entries[move] = this->entries[move + 1];
    }
    this->entries[this->count - 1] = {};
    this->count--;
    return true;
  }

  void clear() { *this = {}; }

  static void sanitize_name(std::array<char, COMPANION_CREDENTIAL_NAME_SIZE> &output,
                            std::string_view name) {
    size_t start = 0;
    while (start < name.size() && name[start] == ' ') start++;
    size_t end = name.size();
    while (end > start && name[end - 1] == ' ') end--;
    size_t used = 0;
    for (size_t index = start; index < end && used + 1 < COMPANION_CREDENTIAL_NAME_SIZE; index++) {
      const auto byte = static_cast<unsigned char>(name[index]);
      output[used++] = byte >= 0x20 && byte < 0x7f ? static_cast<char>(byte) : '?';
    }
    if (used == 0) {
      constexpr std::string_view fallback = "Computer";
      std::copy(fallback.begin(), fallback.end(), output.begin());
      used = fallback.size();
    }
    output[used] = '\0';
  }
};

static_assert(std::is_trivially_copyable_v<CompanionCredentialsPreference>);

}  // namespace esphome::companion
