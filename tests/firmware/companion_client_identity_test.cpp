#include "client_identity_store.h"

#include <algorithm>
#include <cassert>
#include <cstring>
#include <string>

using namespace esphome::companion;

namespace {

bool same_id(const CompanionClientIdentity *entry, const uint8_t *id) {
  return entry != nullptr &&
      std::equal(entry->computer_id.begin(), entry->computer_id.end(), id);
}

std::string repeated(char value, size_t count) {
  return std::string(count, value);
}

}  // namespace

int main() {
  CompanionClientIdentitiesPreference store{};
  assert(store.valid());
  assert(store.count == 0);
  assert(store.find("client-a") == nullptr);

  uint8_t id1[COMPANION_CREDENTIAL_ID_SIZE]{};
  uint8_t id2[COMPANION_CREDENTIAL_ID_SIZE]{};
  uint8_t id3[COMPANION_CREDENTIAL_ID_SIZE]{};
  std::memset(id1, 0x11, sizeof(id1));
  std::memset(id2, 0x22, sizeof(id2));
  std::memset(id3, 0x33, sizeof(id3));

  store.remember("client-a", id1);
  assert(store.count == 1);
  assert(same_id(store.find("client-a"), id1));
  assert(std::strlen(store.entries[0].client_id.data()) == 8);

  // Re-pairing the same client replaces its computer ID in place.
  store.remember("client-a", id2);
  assert(store.count == 1);
  assert(same_id(store.find("client-a"), id2));

  store.remember("client-b", id3);
  assert(store.count == 2);
  assert(same_id(store.find("client-b"), id3));

  // Empty and oversized client IDs are ignored.
  store.remember("", id1);
  store.remember(repeated('x', COMPANION_CLIENT_ID_SIZE + 1), id1);
  assert(store.count == 2);
  assert(store.find(repeated('x', COMPANION_CLIENT_ID_SIZE + 1)) == nullptr);

  // A maximum-length client ID still fits and is terminated.
  const std::string longest = repeated('y', COMPANION_CLIENT_ID_SIZE);
  store.remember(longest, id1);
  assert(store.count == 3);
  assert(same_id(store.find(longest), id1));

  // The oldest mapping is dropped once the bounded store is full.
  for (size_t index = 0; index < COMPANION_CLIENT_IDENTITY_COUNT; index++) {
    uint8_t id[COMPANION_CREDENTIAL_ID_SIZE]{};
    std::memset(id, static_cast<int>(0x40 + index), sizeof(id));
    const std::string client = "client-" + std::to_string(index);
    store.remember(client, id);
  }
  assert(store.count == COMPANION_CLIENT_IDENTITY_COUNT);
  assert(store.find("client-a") == nullptr);
  assert(store.find("client-b") == nullptr);
  assert(store.find("client-0") != nullptr);
  assert(store.find("client-7") != nullptr);

  {
    uint8_t id[COMPANION_CREDENTIAL_ID_SIZE]{};
    std::memset(id, 0x77, sizeof(id));
    store.remember("client-new", id);
  }
  assert(store.count == COMPANION_CLIENT_IDENTITY_COUNT);
  assert(store.find("client-0") == nullptr);
  assert(store.find("client-1") != nullptr);
  assert(store.find("client-new") != nullptr);

  CompanionClientIdentitiesPreference invalid{};
  invalid.count = COMPANION_CLIENT_IDENTITY_COUNT + 1;
  assert(!invalid.valid());
  invalid.count = 0;
  invalid.version = 2;
  assert(!invalid.valid());
  return 0;
}
