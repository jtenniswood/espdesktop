#pragma once

#include <atomic>
#include <charconv>
#include <cstdint>
#include <string_view>

namespace esphome::companion {

// Protocol v3 introduced the signed authentication request shared by later Mac
// apps. Only these older clients can prove they hold the saved pairing.
inline int legacy_protocol_for_path(std::string_view path, int current_protocol) {
  constexpr std::string_view prefix = "/companion/v";
  if (path.substr(0, prefix.size()) != prefix) return 0;
  path.remove_prefix(prefix.size());
  if (path.empty() || path.front() < '1' || path.front() > '9') return 0;
  int version = 0;
  const auto result = std::from_chars(path.data(), path.data() + path.size(), version);
  return result.ec == std::errc{} && result.ptr == path.data() + path.size() &&
      version >= 3 && version < current_protocol ? version : 0;
}

class CompanionSessionState {
 public:
  int authenticated_socket() const { return this->authenticated_socket_.load(); }
  bool connected() const { return this->authenticated_socket() >= 0; }

  uint32_t generation() const { return generation_.load(); }
  bool current(uint32_t generation) const { return generation_.load() == generation; }

  int authenticate(int socket_fd) {
    generation_.fetch_add(1);
    return this->authenticated_socket_.exchange(socket_fd);
  }

  bool disconnect_socket(int socket_fd) {
    int expected = socket_fd;
    if (!this->authenticated_socket_.compare_exchange_strong(expected, -1)) return false;
    generation_.fetch_add(1);
    return true;
  }

  int disconnect() { generation_.fetch_add(1); return this->authenticated_socket_.exchange(-1); }

 private:
  std::atomic<uint32_t> generation_{0};
  std::atomic<int> authenticated_socket_{-1};
};

}  // namespace esphome::companion
