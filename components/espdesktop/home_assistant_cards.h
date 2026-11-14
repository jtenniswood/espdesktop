#pragma once

#include <functional>
#include <string>

namespace espdesktop::home_assistant {
struct Hooks {
  std::string fingerprint;
  std::function<std::string()> list;
  std::function<bool(const std::string &)> press;
  std::function<void(const std::string &)> show_code;
  std::function<bool()> paired;
  std::function<bool(bool)> setup;
};
inline Hooks &hooks() {
  static Hooks instance;
  return instance;
}
}  // namespace espdesktop::home_assistant
