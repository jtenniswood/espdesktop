#include "usb_editor.h"

#ifdef USE_COMPANION_USB
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <netinet/in.h>
#include <sdkconfig.h>
#include <sys/socket.h>
#include <unistd.h>
#include <vector>
#ifdef USE_WIFI
#include "esphome/components/wifi/wifi_component.h"
#include "esphome/core/helpers.h"
#include "esphome/core/log.h"
#include "esphome/core/preferences.h"
#endif

namespace esphome::companion {
namespace {
constexpr char MAGIC[] = "UED1";
constexpr size_t HEADER = 9;
constexpr size_t MAX_CHUNK = 4096;
enum Command : uint8_t { OPEN = 1, WRITE = 2, READ = 3, CLOSE = 4, WIFI_STATE = 5, WIFI_SET = 6 };
enum Result : uint8_t { OK = 0, WAIT = 1, END = 2, ERROR = 3 };
#ifdef USE_WIFI
ESPPreferenceObject &wifi_preference() {
  static auto preference = global_preferences->make_preference<bool>(fnv1a_hash("companion_wifi_enabled"), true);
  return preference;
}
#endif

bool is_usb_socket(int fd) {
  sockaddr_storage peer{};
  socklen_t length = sizeof(peer);
  if (getpeername(fd, reinterpret_cast<sockaddr *>(&peer), &length) != 0) return false;
  if (peer.ss_family == AF_INET && length >= sizeof(sockaddr_in)) {
    const auto &ipv4 = reinterpret_cast<const sockaddr_in &>(peer);
    return ntohl(ipv4.sin_addr.s_addr) == INADDR_LOOPBACK;
  }
#ifdef CONFIG_LWIP_IPV6
  if (peer.ss_family == AF_INET6 && length >= sizeof(sockaddr_in6)) {
    // ESP-IDF can accept the serial bridge's IPv4 connection on a dual-stack listener.
    constexpr uint8_t mapped_loopback[16] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 127, 0, 0, 1};
    const auto &ipv6 = reinterpret_cast<const sockaddr_in6 &>(peer);
    return std::memcmp(&ipv6.sin6_addr, mapped_loopback, sizeof(mapped_loopback)) == 0;
  }
#endif
  return false;
}

bool would_block() {
  return errno == EAGAIN || errno == EWOULDBLOCK || errno == ENOTCONN || errno == EINPROGRESS;
}
}  // namespace

void CompanionUSBEditor::close_() {
  if (this->editor_socket_ >= 0) ::close(this->editor_socket_);
  this->editor_socket_ = this->owner_ = -1;
}

void CompanionUSBEditor::disconnect(int companion_socket) {
  if (companion_socket < 0 || companion_socket == this->owner_) this->close_();
}

#ifdef USE_WIFI
void CompanionUSBEditor::restore_wifi_on_boot() {
  bool enabled;
  if (auto *wifi = wifi::global_wifi_component; wifi && wifi_preference().load(&enabled))
    wifi->set_enable_on_boot(enabled);
}
#endif

void CompanionUSBEditor::update_wifi() {
#ifdef USE_WIFI
  auto *wifi = wifi::global_wifi_component;
  if (!wifi) return;
  const int8_t requested = this->requested_wifi_state_.exchange(-1);
  if (requested >= 0) {
    const bool enabled = requested == 1;
    if (!wifi_preference().save(&enabled) || !global_preferences->sync()) {
      ESP_LOGW("companion.usb", "Could not save Wi-Fi preference");
    }
    if (enabled) wifi->enable();
    else wifi->disable();
  }
  this->wifi_enabled_.store(!wifi->is_disabled());
#endif
}

bool CompanionUSBEditor::handle(httpd_handle_t server, int companion_socket, const uint8_t *frame, size_t size) {
  if (size < 4 || std::memcmp(frame, MAGIC, 4) != 0) return false;
  if (size < HEADER || size > HEADER + MAX_CHUNK || !is_usb_socket(companion_socket)) return true;

  std::vector<uint8_t> response(frame, frame + HEADER);
  const auto command = frame[4];
  const size_t length = size - HEADER;
  Result result = ERROR;
#ifdef USE_WIFI
  if (command == WIFI_STATE && length == 0 && esphome::wifi::global_wifi_component != nullptr) {
    response.push_back(this->wifi_enabled_.load());
    result = OK;
  } else if (command == WIFI_SET && length == 1 && frame[HEADER] <= 1 &&
             esphome::wifi::global_wifi_component != nullptr) {
    const bool enabled = frame[HEADER] != 0;
    this->requested_wifi_state_.store(frame[HEADER]);
    response.push_back(enabled);
    result = OK;
  } else
#endif
  if (command == OPEN && length == 0) {
    this->close_();
    this->editor_socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (this->editor_socket_ >= 0 && fcntl(this->editor_socket_, F_SETFL, O_NONBLOCK) == 0) {
      sockaddr_in address{};
      address.sin_family = AF_INET;
      address.sin_port = htons(80);
      address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
      if (::connect(this->editor_socket_, reinterpret_cast<const sockaddr *>(&address), sizeof(address)) == 0 ||
          errno == EINPROGRESS) {
        this->owner_ = companion_socket;
        result = OK;
      }
    }
    if (result == ERROR) this->close_();
  } else if (this->owner_ == companion_socket && this->editor_socket_ >= 0) {
    if (command == WRITE && length > 0) {
      const auto written = ::send(this->editor_socket_, frame + HEADER, length, 0);
      if (written > 0) {
        response.push_back(static_cast<uint8_t>(written >> 8));
        response.push_back(static_cast<uint8_t>(written));
        result = OK;
      } else if (written < 0 && would_block()) {
        result = WAIT;
      }
    } else if (command == READ && length == 0) {
      response.resize(HEADER + MAX_CHUNK);
      const auto read = ::recv(this->editor_socket_, response.data() + HEADER, MAX_CHUNK, 0);
      response.resize(HEADER + (read > 0 ? read : 0));
      if (read > 0) result = OK;
      else if (read == 0) result = END;
      else if (would_block()) result = WAIT;
    } else if (command == CLOSE && length == 0) {
      this->close_();
      result = OK;
    }
    if (result == END || result == ERROR) this->close_();
  }

  response[4] = result;
  httpd_ws_frame_t reply{};
  reply.type = HTTPD_WS_TYPE_BINARY;
  reply.payload = response.data();
  reply.len = response.size();
  if (httpd_ws_send_frame_async(server, companion_socket, &reply) != ESP_OK) this->close_();
  return true;
}
}  // namespace esphome::companion
#endif
