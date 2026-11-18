#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <utility>

// The display relays one page at a time. Each request expires so a closed
// browser tab cannot hold the slot or leave a reply cached indefinitely.
class CompanionShortcutCatalogue {
 public:
  struct Page {
    uint32_t request_id{0};
    std::string app_id;
    uint32_t number{0};
    uint32_t version{0};
    bool complete{false};
    std::string json;
  };

  enum class Status { unavailable, pending, request, ready };
  struct Result {
    Status status;
    uint32_t request_id{0};
    Page page;
  };

  Result read(const std::string &app_id, uint32_t number, uint32_t now) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!supported_) return {Status::unavailable, 0, {}};
    if (page_.request_id && now - started_at_ >= 3000) page_ = {};
    if (page_.request_id) {
      if (app_id == page_.app_id && number == page_.number && page_.version) {
        auto page = std::move(page_);
        page_ = {};
        return {Status::ready, 0, std::move(page)};
      }
      return {Status::pending, 0, {}};
    }
    if (++request_id_ == 0) ++request_id_;
    page_ = {request_id_, app_id, number, 0, false, {}};
    started_at_ = now;
    return {Status::request, request_id_, {}};
  }

  void receive(Page page) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (supported_ && !page_.version && page.request_id == page_.request_id &&
        page.app_id == page_.app_id && page.number == page_.number)
      page_ = std::move(page);
  }

  void cancel(uint32_t request_id) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (page_.request_id == request_id) page_ = {};
  }

  void set_supported(bool supported) {
    std::lock_guard<std::mutex> lock(mutex_);
    supported_ = supported;
    if (!supported) page_ = {};
  }

 private:
  std::mutex mutex_;
  bool supported_{false};
  uint32_t request_id_{0};
  uint32_t started_at_{0};
  Page page_;
};
