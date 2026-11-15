#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <optional>
#include <string_view>
#include <vector>

#ifdef ESP_PLATFORM
#include <esp_heap_caps.h>
#endif

namespace espdesktop {

inline constexpr std::string_view HEALTHCHECK_CARD_PREFIX = "healthchecks.";
inline constexpr size_t HEALTHCHECK_ID_BYTES = 40;
inline constexpr size_t HEALTHCHECK_LABEL_BYTES = 160;
inline constexpr size_t HEALTHCHECK_PAGE_SIZE = 32;
inline constexpr size_t HEALTHCHECK_LIMIT = 1024;

inline bool healthcheck_card_entity(std::string_view entity) {
  return entity.substr(0, HEALTHCHECK_CARD_PREFIX.size()) == HEALTHCHECK_CARD_PREFIX;
}

inline bool healthcheck_id_valid(std::string_view id) {
  return id.size() == HEALTHCHECK_ID_BYTES && std::all_of(id.begin(), id.end(), [](char ch) {
    return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
  });
}

enum class CheckStatus { NEW, UP, GRACE, DOWN, PAUSED, UNKNOWN };
enum class HealthchecksState { UNAVAILABLE, UNCONFIGURED, WAITING, READY, STALE };

inline std::optional<CheckStatus> parse_check_status(std::string_view status) {
  if (status == "new") return CheckStatus::NEW;
  if (status == "up") return CheckStatus::UP;
  if (status == "grace") return CheckStatus::GRACE;
  if (status == "down") return CheckStatus::DOWN;
  if (status == "paused") return CheckStatus::PAUSED;
  if (status == "unknown") return CheckStatus::UNKNOWN;
  return std::nullopt;
}

inline std::optional<HealthchecksState> parse_healthchecks_state(std::string_view state) {
  if (state == "unconfigured") return HealthchecksState::UNCONFIGURED;
  if (state == "waiting") return HealthchecksState::WAITING;
  if (state == "ready") return HealthchecksState::READY;
  if (state == "stale") return HealthchecksState::STALE;
  return std::nullopt;
}

struct HealthcheckEntry {
  std::array<char, HEALTHCHECK_ID_BYTES + 1> id{};
  std::array<char, HEALTHCHECK_LABEL_BYTES + 1> label{};
  CheckStatus status{CheckStatus::UNKNOWN};
  bool started{false};
};

struct HealthchecksPage {
  HealthchecksState state{HealthchecksState::UNAVAILABLE};
  uint32_t generation{0};
  bool has_more{false};
  std::vector<HealthcheckEntry> checks;
};

struct HealthcheckReading {
  HealthchecksState state{HealthchecksState::UNAVAILABLE};
  std::optional<HealthcheckEntry> check;
};

// Companion writes from the transport task. The editor and touchscreen read
// complete snapshots, with a bounded page copy for each editor request.
class HealthchecksCatalogue {
 public:
  bool receive(uint32_t generation, size_t page, size_t total, bool complete,
               HealthchecksState state, const HealthcheckEntry *checks,
               size_t count, uint32_t now) {
    if (generation == 0 || total > HEALTHCHECK_LIMIT || page >= HEALTHCHECK_LIMIT / HEALTHCHECK_PAGE_SIZE)
      return false;
    const size_t start = page * HEALTHCHECK_PAGE_SIZE;
    if (start > total || count != std::min(HEALTHCHECK_PAGE_SIZE, total - start) ||
        complete != (start + count == total) || (page > 0 && count == 0) ||
        (total != 0 && state != HealthchecksState::READY && state != HealthchecksState::STALE))
      return false;

    std::lock_guard<std::mutex> lock(mutex_);
    if (!connected_) return false;
    if (page == 0) {
      pending_ = {};
      if (total > 0) {
        pending_.checks = allocate(total);
        if (!pending_.checks) {
          // Keep the previous snapshot and mark it stale when memory is tight.
          discarding_generation_ = generation;
          if (current_.generation) current_.state = HealthchecksState::STALE;
          return true;
        }
      }
      pending_.generation = generation;
      pending_.count = total;
      pending_.state = state;
      discarding_generation_ = 0;
    }
    if (pending_.generation != generation || pending_.count != total ||
        pending_.state != state || pending_.received != start) {
      // The staged snapshot may have been dropped under memory pressure.
      return discarding_generation_ == generation;
    }
    if (count > 0) std::copy_n(checks, count, pending_.checks.get() + start);
    pending_.received += count;
    if (complete) {
      pending_.received_at = now;
      if (current_.count && total == 0 &&
          (state == HealthchecksState::WAITING || state == HealthchecksState::STALE)) {
        current_.generation = generation;
        current_.state = HealthchecksState::STALE;
      } else {
        current_ = std::move(pending_);
      }
      pending_ = {};
      current_session_ = true;
    }
    return true;
  }

  void set_connected(bool connected) {
    std::lock_guard<std::mutex> lock(mutex_);
    connected_ = connected;
    current_session_ = false;
    pending_ = {};
    discarding_generation_ = 0;
  }

  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    current_ = {};
    pending_ = {};
    discarding_generation_ = 0;
    current_session_ = false;
  }

  HealthcheckReading reading(std::string_view id, uint32_t now) const {
    std::lock_guard<std::mutex> lock(mutex_);
    HealthcheckReading result;
    result.state = state_at(now);
    for (size_t i = 0; i < current_.count; i++) {
      const auto &entry = current_.checks.get()[i];
      if (id == entry.id.data()) {
        result.check = entry;
        break;
      }
    }
    return result;
  }

  HealthchecksPage editor_page(size_t page, uint32_t now) const {
    std::lock_guard<std::mutex> lock(mutex_);
    HealthchecksPage result;
    if (!connected_ || !current_session_) return result;
    result.state = state_at(now);
    result.generation = current_.generation;
    const size_t start = page * HEALTHCHECK_PAGE_SIZE;
    for (size_t i = start; i < std::min(start + HEALTHCHECK_PAGE_SIZE, current_.count); i++)
      result.checks.push_back(current_.checks.get()[i]);
    result.has_more = start + HEALTHCHECK_PAGE_SIZE < current_.count;
    return result;
  }

 private:
  using CheckArray = std::unique_ptr<HealthcheckEntry[], decltype(&std::free)>;

  static CheckArray allocate(size_t total) {
#ifdef ESP_PLATFORM
    // Large collections belong in PSRAM, keeping internal memory available
    // for the display, Wi-Fi, and TLS.
    auto *storage = static_cast<HealthcheckEntry *>(
      heap_caps_malloc(total * sizeof(HealthcheckEntry), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
#else
    auto *storage = static_cast<HealthcheckEntry *>(std::malloc(total * sizeof(HealthcheckEntry)));
#endif
    if (storage) std::uninitialized_default_construct_n(storage, total);
    return CheckArray(storage, &std::free);
  }

  struct Snapshot {
    CheckArray checks{nullptr, &std::free};
    uint32_t generation{0};
    size_t count{0};
    size_t received{0};
    uint32_t received_at{0};
    HealthchecksState state{HealthchecksState::UNAVAILABLE};
  };

  HealthchecksState state_at(uint32_t now) const {
    if (!current_session_) return current_.count ? HealthchecksState::STALE : HealthchecksState::UNAVAILABLE;
    if (current_.state == HealthchecksState::READY && now - current_.received_at > 90000u)
      return HealthchecksState::STALE;
    return current_.state;
  }

  mutable std::mutex mutex_;
  bool connected_{false};
  bool current_session_{false};
  uint32_t discarding_generation_{0};
  Snapshot current_;
  Snapshot pending_;
};

}  // namespace espdesktop
