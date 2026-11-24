#include "esphome/core/defines.h"

#ifdef USE_COMPANION_USB
#include "usb_bridge.h"

#include <algorithm>
#include <cerrno>
#include <fcntl.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#ifdef USE_COMPANION_USB_JTAG
#include <driver/usb_serial_jtag.h>
#endif

namespace esphome::companion {

bool CompanionUSBBridge::setup() {
#ifdef USE_COMPANION_USB_UART
  if (this->uart_) return true;
#endif
#ifdef USE_COMPANION_USB_JTAG
  usb_serial_jtag_driver_config_t config{.tx_buffer_size = 4096, .rx_buffer_size = 16384};
  return usb_serial_jtag_driver_install(&config) == ESP_OK;
#else
  return false;
#endif
}

size_t CompanionUSBBridge::read_serial_(uint8_t *data, size_t capacity) {
#ifdef USE_COMPANION_USB_UART
  if (this->uart_) {
    const size_t size = std::min(capacity, this->uart_->available());
    return size != 0 && this->uart_->read_array(data, size) ? size : 0;
  }
#endif
#ifdef USE_COMPANION_USB_JTAG
  return std::max(0, usb_serial_jtag_read_bytes(data, capacity, 0));
#else
  return 0;
#endif
}

size_t CompanionUSBBridge::write_serial_(const uint8_t *data, size_t length) {
#ifdef USE_COMPANION_USB_UART
  if (this->uart_) {
    const size_t size = std::min(length, this->uart_->available_for_write());
    if (size) this->uart_->write_array(data, size);
    return size;
  }
#endif
#ifdef USE_COMPANION_USB_JTAG
  return std::max(0, usb_serial_jtag_write_bytes(data, length, 0));
#else
  return 0;
#endif
}

void CompanionUSBBridge::close_(bool notify_peer) {
  if (this->socket_ >= 0) ::close(this->socket_);
  this->socket_ = -1;
  this->write_size_ = this->write_offset_ = 0;
  if (!notify_peer) this->output_size_ = this->output_offset_ = 0;
  else this->queue_frame_(CLOSE);
}

void CompanionUSBBridge::queue_frame_(Frame kind, const uint8_t *data, size_t length) {
  this->output_size_ = this->output_offset_ = 0;
  this->output_[this->output_size_++] = END;
  this->output_[this->output_size_++] = kind;
  for (size_t i = 0; i < length; i++) {
    const auto byte = data[i];
    if (byte == END || byte == ESC) {
      this->output_[this->output_size_++] = ESC;
      this->output_[this->output_size_++] = byte == END ? 0xdc : 0xdd;
    } else {
      this->output_[this->output_size_++] = byte;
    }
  }
  this->output_[this->output_size_++] = END;
}

void CompanionUSBBridge::receive_frame_(uint16_t port, uint32_t now) {
  const auto kind = this->input_[0];
  if (kind == OPEN && this->input_size_ == 1) {
    this->close_(false);
    this->socket_ = ::socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (this->socket_ < 0 || fcntl(this->socket_, F_SETFL, O_NONBLOCK) < 0) {
      this->close_(true);
      return;
    }
    sockaddr_in address{};
    address.sin_family = AF_INET;
    address.sin_port = htons(port);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (::connect(this->socket_, reinterpret_cast<const sockaddr *>(&address), sizeof(address)) < 0 &&
        errno != EINPROGRESS) {
      this->close_(true);
      return;
    }
    this->last_input_ = now;
    this->queue_frame_(OPEN);
  } else if (kind == DATA && this->socket_ >= 0 && this->input_size_ > 1) {
    this->last_input_ = now;
    this->write_offset_ = 0;
    this->write_size_ = this->input_size_ - 1;
  } else if (kind == CLOSE && this->input_size_ == 1) {
    this->close_(false);
  }
}

void CompanionUSBBridge::receive_byte_(uint8_t byte, uint16_t port, uint32_t now) {
  if (byte == END) {
    if (this->in_frame_ && !this->escaped_ && this->input_size_ != 0) this->receive_frame_(port, now);
    this->in_frame_ = true;
    this->input_size_ = 0;
    this->escaped_ = false;
    return;
  }
  if (!this->in_frame_) return;
  if (this->escaped_) {
    if (byte != 0xdc && byte != 0xdd) {
      this->in_frame_ = false;
      return;
    }
    byte = byte == 0xdc ? END : ESC;
    this->escaped_ = false;
  } else if (byte == ESC) {
    this->escaped_ = true;
    return;
  }
  if (this->input_size_ == this->input_.size()) {
    this->in_frame_ = false;
    return;
  }
  this->input_[this->input_size_++] = byte;
}

void CompanionUSBBridge::loop(uint16_t port, uint32_t now) {
  // The Mac's WebSocket heartbeat supplies input every 15 seconds. Let the
  // panel recover even when pulling USB prevents the host from sending CLOSE.
  if (this->socket_ >= 0 && now - this->last_input_ >= 40000) this->close_(true);

  for (size_t budget = 0; budget < 4096 && this->write_size_ == 0; budget++) {
    if (this->serial_offset_ == this->serial_size_) {
      this->serial_offset_ = 0;
      this->serial_size_ = this->read_serial_(this->serial_input_.data(), this->serial_input_.size());
      if (this->serial_size_ == 0) break;
    }
    this->receive_byte_(this->serial_input_[this->serial_offset_++], port, now);
  }

  if (this->write_size_ != 0) {
    const auto written = ::send(this->socket_, this->input_.data() + 1 + this->write_offset_,
                                this->write_size_ - this->write_offset_, 0);
    if (written > 0) {
      this->write_offset_ += written;
      if (this->write_offset_ == this->write_size_) this->write_offset_ = this->write_size_ = 0;
    } else if (written == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != ENOTCONN && errno != EINPROGRESS)) {
      this->close_(true);
    }
  }

  if (this->socket_ >= 0 && this->output_size_ == 0) {
    const auto size = ::recv(this->socket_, this->socket_input_.data(), this->socket_input_.size(), 0);
    if (size > 0) this->queue_frame_(DATA, this->socket_input_.data(), size);
    else if (size == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != ENOTCONN && errno != EINPROGRESS))
      this->close_(true);
  }

  if (this->output_size_ != 0) {
    this->output_offset_ += this->write_serial_(this->output_.data() + this->output_offset_,
                                               this->output_size_ - this->output_offset_);
    if (this->output_offset_ == this->output_size_) this->output_offset_ = this->output_size_ = 0;
  }
}

}  // namespace esphome::companion
#endif
