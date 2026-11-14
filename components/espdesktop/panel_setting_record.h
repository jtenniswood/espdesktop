#pragma once

#include <array>
#include <charconv>
#include <optional>
#include <string_view>

namespace espdesktop::panel_settings {

template<size_t Count>
std::optional<std::array<std::string_view, Count>> split_fields(std::string_view value) {
  std::array<std::string_view, Count> fields;
  for (size_t index = 0; index < Count; ++index) {
    const auto comma = value.find(',');
    if ((comma == std::string_view::npos) != (index + 1 == Count)) return {};
    fields[index] = value.substr(0, comma);
    if (comma != std::string_view::npos) value.remove_prefix(comma + 1);
  }
  return fields;
}

inline bool read_integer(std::string_view value, int &result, int minimum, int maximum) {
  if (value.empty() || (minimum >= 0 && value.front() == '-')) return false;
  const auto end = value.data() + value.size();
  const auto parsed = std::from_chars(value.data(), end, result);
  return parsed.ec == std::errc{} && parsed.ptr == end && result >= minimum && result <= maximum;
}

inline bool is_hex(std::string_view value, size_t length) {
  return value.size() == length && value.find_first_not_of("0123456789ABCDEF") == std::string_view::npos;
}

}  // namespace espdesktop::panel_settings
