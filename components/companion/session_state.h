#pragma once

#include <array>
#include <charconv>
#include <cstddef>
#include <cstdint>
#include <mutex>
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

// The panel keeps one live session per paired computer so two computers can
// stay connected together. Each session owns its catalogue and focus state; the
// display routes a card's command to the session for that card's computer.
inline constexpr size_t COMPANION_MAX_CONCURRENT_SESSIONS = 2;
inline constexpr size_t COMPANION_MAX_SESSION_CREDENTIALS = 4;

struct CompanionAuthenticatedSession {
  int socket{-1};
  int credential_index{-1};
};

class CompanionSessionState {
 public:
  static constexpr size_t MAX_SESSIONS = COMPANION_MAX_CONCURRENT_SESSIONS;

  size_t connected_count() const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return this->connected_count_locked_();
  }

  bool connected() const { return this->connected_count() > 0; }

  bool connected(size_t credential_index) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return this->find_credential_locked_(credential_index) != nullptr;
  }

  // The oldest connected session. Existing single-computer call sites use this.
  int authenticated_socket() const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    const auto *entry = this->first_connected_locked_();
    return entry ? entry->socket : -1;
  }

  int authenticated_socket(size_t credential_index) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    const auto *entry = this->find_credential_locked_(credential_index);
    return entry ? entry->socket : -1;
  }

  int credential_index(int socket_fd) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    const auto *entry = this->find_socket_locked_(socket_fd);
    return entry ? entry->credential_index : -1;
  }

  // Deferred work is valid only while its computer's current session remains
  // the same one that queued it.
  uint32_t generation(size_t credential_index) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return credential_index < this->generations_.size()
        ? this->generations_[credential_index] : 0;
  }

  bool current(size_t credential_index, uint32_t generation) const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    return credential_index < this->generations_.size() &&
        this->generations_[credential_index] == generation;
  }

  struct AttachResult {
    bool attached{false};
    int replaced_socket{-1};
  };

  // Attaching a new socket for the same computer replaces its previous socket.
  // A different computer is rejected once every live slot is taken.
  AttachResult authenticate(int socket_fd, size_t credential_index) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    auto *existing = this->find_credential_locked_(credential_index);
    if (existing) {
      const int previous = existing->socket;
      existing->socket = socket_fd;
      if (credential_index < this->generations_.size())
        this->generations_[credential_index]++;
      return {true, previous == socket_fd ? -1 : previous};
    }
    for (auto &entry : this->sessions_) {
      if (entry.socket >= 0) continue;
      if (credential_index < this->generations_.size())
        this->generations_[credential_index]++;
      entry = {socket_fd, static_cast<int>(credential_index)};
      return {true, -1};
    }
    return {};
  }

  bool disconnect_socket(int socket_fd) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    auto *entry = this->find_socket_locked_(socket_fd);
    if (!entry) return false;
    if (entry->credential_index >= 0 &&
        static_cast<size_t>(entry->credential_index) < this->generations_.size())
      this->generations_[static_cast<size_t>(entry->credential_index)]++;
    *entry = {};
    return true;
  }

  bool disconnect_credential(size_t credential_index) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    auto *entry = this->find_credential_locked_(credential_index);
    if (!entry) return false;
    if (credential_index < this->generations_.size()) this->generations_[credential_index]++;
    *entry = {};
    return true;
  }

  std::array<int, MAX_SESSIONS> sockets() const {
    std::lock_guard<std::mutex> lock(this->mutex_);
    std::array<int, MAX_SESSIONS> result{};
    for (size_t index = 0; index < this->sessions_.size(); index++)
      result[index] = this->sessions_[index].socket;
    return result;
  }

  // Revoking a credential shifts the indices of later ones. Drop the revoked
  // session, renumber the survivors, and invalidate deferred work from all
  // sessions; the transport re-requests catalogues from the survivors.
  void credential_removed(size_t index) {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &entry : this->sessions_) {
      if (entry.socket < 0) continue;
      if (static_cast<size_t>(entry.credential_index) == index) {
        entry = {};
      } else if (static_cast<size_t>(entry.credential_index) > index) {
        entry.credential_index--;
      }
    }
    for (auto &generation : this->generations_) generation++;
  }

  // Invalidate deferred work from all sessions without changing membership.
  void invalidate_all() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &generation : this->generations_) generation++;
  }

  void clear() {
    std::lock_guard<std::mutex> lock(this->mutex_);
    for (auto &entry : this->sessions_) entry = {};
    for (auto &generation : this->generations_) generation++;
  }

 private:
  size_t connected_count_locked_() const {
    size_t count = 0;
    for (const auto &entry : this->sessions_)
      if (entry.socket >= 0) count++;
    return count;
  }

  CompanionAuthenticatedSession *find_socket_locked_(int socket_fd) {
    for (auto &entry : this->sessions_)
      if (entry.socket == socket_fd) return &entry;
    return nullptr;
  }

  const CompanionAuthenticatedSession *find_socket_locked_(int socket_fd) const {
    for (const auto &entry : this->sessions_)
      if (entry.socket == socket_fd) return &entry;
    return nullptr;
  }

  CompanionAuthenticatedSession *find_credential_locked_(size_t credential_index) {
    for (auto &entry : this->sessions_)
      if (entry.socket >= 0 && static_cast<size_t>(entry.credential_index) == credential_index)
        return &entry;
    return nullptr;
  }

  const CompanionAuthenticatedSession *find_credential_locked_(size_t credential_index) const {
    for (const auto &entry : this->sessions_)
      if (entry.socket >= 0 && static_cast<size_t>(entry.credential_index) == credential_index)
        return &entry;
    return nullptr;
  }

  const CompanionAuthenticatedSession *first_connected_locked_() const {
    const CompanionAuthenticatedSession *oldest = nullptr;
    for (const auto &entry : this->sessions_) {
      if (entry.socket < 0) continue;
      if (!oldest || entry.credential_index < oldest->credential_index) oldest = &entry;
    }
    return oldest;
  }

  mutable std::mutex mutex_;
  std::array<CompanionAuthenticatedSession, MAX_SESSIONS> sessions_{};
  std::array<uint32_t, COMPANION_MAX_SESSION_CREDENTIALS> generations_{};
};

}  // namespace esphome::companion
