#pragma once

#include "credential_store.h"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <string_view>
#include <type_traits>

namespace esphome::companion {

inline constexpr size_t COMPANION_CLIENT_IDENTITY_COUNT = 8;
inline constexpr size_t COMPANION_CLIENT_ID_SIZE = 64;

/** Remembers which computer a companion client was paired as.
 *
 * The companion sends its persistent client ID with each pairing request.
 * Reusing the previous computer ID when the same client pairs again keeps
 * cards bound to that computer working after a reinstall or re-pair.
 */
struct CompanionClientIdentity {
  std::array<char, COMPANION_CLIENT_ID_SIZE + 1> client_id{};
  std::array<uint8_t, COMPANION_CREDENTIAL_ID_SIZE> computer_id{};
};

struct CompanionClientIdentitiesPreference {
  uint32_t version{1};
  uint8_t count{0};
  std::array<uint8_t, 3> reserved{};
  std::array<CompanionClientIdentity, COMPANION_CLIENT_IDENTITY_COUNT> entries{};

  bool valid() const {
    return this->version == 1 && this->count <= COMPANION_CLIENT_IDENTITY_COUNT;
  }

  static std::string_view client_view(const CompanionClientIdentity &entry) {
    size_t length = 0;
    while (length < COMPANION_CLIENT_ID_SIZE && entry.client_id[length] != '\0') length++;
    return std::string_view(entry.client_id.data(), length);
  }

  const CompanionClientIdentity *find(std::string_view client_id) const {
    if (client_id.empty() || client_id.size() > COMPANION_CLIENT_ID_SIZE) return nullptr;
    for (size_t index = 0; index < this->count; index++) {
      if (client_view(this->entries[index]) == client_id) return &this->entries[index];
    }
    return nullptr;
  }

  void remember(std::string_view client_id, const uint8_t *computer_id) {
    if (client_id.empty() || client_id.size() > COMPANION_CLIENT_ID_SIZE || computer_id == nullptr) return;
    size_t index = this->count;
    for (size_t known = 0; known < this->count; known++) {
      if (client_view(this->entries[known]) == client_id) {
        index = known;
        break;
      }
    }
    if (index == COMPANION_CLIENT_IDENTITY_COUNT) {
      // Drop the oldest mapping so a panel used with many clients stays bounded.
      for (size_t move = 0; move + 1 < COMPANION_CLIENT_IDENTITY_COUNT; move++)
        this->entries[move] = this->entries[move + 1];
      index = COMPANION_CLIENT_IDENTITY_COUNT - 1;
      this->count = COMPANION_CLIENT_IDENTITY_COUNT;
    } else if (index == this->count) {
      this->count++;
    }
    auto &entry = this->entries[index];
    entry = {};
    std::copy(client_id.begin(), client_id.end(), entry.client_id.begin());
    std::copy_n(computer_id, COMPANION_CREDENTIAL_ID_SIZE, entry.computer_id.begin());
  }
};

static_assert(std::is_trivially_copyable_v<CompanionClientIdentitiesPreference>);

}  // namespace esphome::companion
