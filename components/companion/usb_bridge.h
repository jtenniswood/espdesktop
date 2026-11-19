#pragma once

#include "esphome/components/uart/uart.h"

#include <array>
#include <cstddef>
#include <cstdint>

namespace esphome::companion {

// Carry the existing TLS byte stream between UART0 and the local Companion
// listener. No pairing codes, credentials or control messages are sent in cleartext.
class CompanionUSBBridge {
 public:
  explicit CompanionUSBBridge(uart::UARTComponent *uart) : uart_(uart) {}
  void loop(uint16_t port, uint32_t now);

 private:
  enum Frame : uint8_t { OPEN = 1, DATA = 2, CLOSE = 3 };
  static constexpr size_t MAX_PAYLOAD = 1024;
  static constexpr uint8_t END = 0xc0;
  static constexpr uint8_t ESC = 0xdb;

  void receive_byte_(uint8_t byte, uint16_t port, uint32_t now);
  void receive_frame_(uint16_t port, uint32_t now);
  void queue_frame_(Frame kind, const uint8_t *data = nullptr, size_t length = 0);
  void close_(bool notify_peer);

  uart::UARTComponent *const uart_;
  int socket_{-1};
  uint32_t last_input_{0};
  bool in_frame_{false};
  bool escaped_{false};
  size_t input_size_{0};
  size_t write_offset_{0};
  size_t write_size_{0};
  std::array<uint8_t, MAX_PAYLOAD + 1> input_{};
  std::array<uint8_t, MAX_PAYLOAD> socket_input_{};
  std::array<uint8_t, 2 * MAX_PAYLOAD + 3> output_{};
  size_t output_offset_{0};
  size_t output_size_{0};
};

}  // namespace esphome::companion
