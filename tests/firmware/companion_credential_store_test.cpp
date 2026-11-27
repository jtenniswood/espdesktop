#include "credential_store.h"

#include <cassert>
#include <cstring>
#include <string>

using namespace esphome::companion;

int main() {
  CompanionCredentialsPreference store{};
  assert(store.valid());
  assert(store.count == 0);

  uint8_t key1[32]{};
  uint8_t key2[32]{};
  uint8_t id1[8]{1, 2, 3, 4, 5, 6, 7, 8};
  uint8_t id2[8]{8, 7, 6, 5, 4, 3, 2, 1};
  std::memset(key1, 0x11, sizeof(key1));
  std::memset(key2, 0x22, sizeof(key2));

  assert(store.add(key1, id1, "  Office PC  ") == 0);
  assert(store.count == 1);
  assert(store.find_id(id1) == 0);
  assert(store.find_id(id2) == -1);
  assert(std::string(store.entries[0].name.data()) == "Office PC");
  assert(store.add(key2, id1, "Duplicate") == -1);
  assert(store.add(key2, id2, "Workstation") == 1);
  assert(store.count == 2);

  assert(store.set_sequence(0, 9));
  assert(store.entries[0].sequence == 9);
  assert(!store.set_sequence(2, 1));

  uint8_t id3[8]{3}, id4[8]{4}, id5[8]{5};
  assert(store.add(key1, id3, "") == 2);
  assert(std::string(store.entries[2].name.data()) == "Computer");
  assert(store.add(key1, id4, "Four") == 3);
  assert(store.add(key1, id5, "Five") == -1);
  assert(store.count == COMPANION_MAX_CREDENTIALS);

  assert(store.revoke(1));
  assert(store.count == 3);
  assert(store.find_id(id2) == -1);
  assert(store.find_id(id3) == 1);
  assert(std::string(store.entries[1].name.data()) == "Computer");
  assert(store.revoke(0));
  assert(store.count == 2);
  assert(store.find_id(id1) == -1);

  CompanionCredentialsPreference invalid{};
  invalid.count = COMPANION_MAX_CREDENTIALS + 1;
  assert(!invalid.valid());
  invalid.count = 0;
  invalid.version = 2;
  assert(!invalid.valid());

  std::array<char, COMPANION_CREDENTIAL_NAME_SIZE> sanitized{};
  CompanionCredentialsPreference::sanitize_name(sanitized,
      "A very long computer name that should be truncated without running past the buffer123");
  assert(std::strlen(sanitized.data()) == COMPANION_CREDENTIAL_NAME_SIZE - 1);
  CompanionCredentialsPreference::sanitize_name(sanitized, "Bad\nName\t!");
  assert(std::string(sanitized.data()) == "Bad?Name?!");

  store.clear();
  assert(store.count == 0 && store.valid());
  return 0;
}
