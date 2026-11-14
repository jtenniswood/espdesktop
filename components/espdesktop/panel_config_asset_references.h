#pragma once

#include <map>
#include "configuration_buffer.h"
#include "panel_config_document_v2.h"
#include "legacy_card_config.h"
#include "panel_config_document.h"

namespace espdesktop {

// A malformed/unreadable document must never authorize image deletion.
inline bool panel_config_references_asset(const uint8_t *document, size_t size,
                                         const std::string &id, bool &referenced) {
  using namespace configuration;
  PanelConfigReader reader(document, size);
  if (reader.begin() != PanelConfigStatus::OK) return false;
  referenced = false;
  PanelConfigRecord record;
  PanelConfigStatus status;
  while ((status = reader.next(&record)) == PanelConfigStatus::OK) {
    const bool special_page = record.type == PanelConfigRecordType::SETTING &&
        std::string(reinterpret_cast<const char *>(record.key), record.key_size) == "special_page";
    if (record.type != PanelConfigRecordType::BUTTON &&
        record.type != PanelConfigRecordType::SUBPAGE && !special_page) continue;
    const std::string value(reinterpret_cast<const char *>(record.value), record.value_size);
    referenced |= record.type == PanelConfigRecordType::BUTTON
        ? card_config_references_asset(value, id)
        : subpage_config_references_asset(value, id);
  }
  return status == PanelConfigStatus::END;
}

// Removing an option only shrinks records. Copy each record before writing it
// so the reader can safely advance through the original document in place.
inline bool clear_panel_config_asset_references(uint8_t *document, size_t &size,
                                               const std::string &id) {
  using namespace configuration;
  PanelConfigReader reader(document, size);
  if (reader.begin() != PanelConfigStatus::OK) return false;
  PanelConfigWriter writer(document, size);
  if (writer.begin() != PanelConfigStatus::OK) return false;
  PanelConfigRecord record;
  PanelConfigStatus status;
  while ((status = reader.next(&record)) == PanelConfigStatus::OK) {
    std::string value(reinterpret_cast<const char *>(record.value), record.value_size);
    const auto *bytes = reinterpret_cast<const uint8_t *>(value.data());
    switch (record.type) {
      case PanelConfigRecordType::DEVICE_PROFILE:
        status = writer.append_device_profile(bytes, value.size());
        break;
      case PanelConfigRecordType::BUTTON:
        clear_card_background_reference(value, id);
        status = writer.append_button(record.slot, reinterpret_cast<const uint8_t *>(value.data()), value.size());
        break;
      case PanelConfigRecordType::SUBPAGE:
        clear_subpage_background_references(value, id);
        status = writer.append_subpage(record.slot, reinterpret_cast<const uint8_t *>(value.data()), value.size());
        break;
      case PanelConfigRecordType::SETTING: {
        const std::string key(reinterpret_cast<const char *>(record.key), record.key_size);
        if (key == "special_page") clear_subpage_background_references(value, id);
        status = writer.append_setting(reinterpret_cast<const uint8_t *>(key.data()), key.size(),
            reinterpret_cast<const uint8_t *>(value.data()), value.size());
        break;
      }
    }
    if (status != PanelConfigStatus::OK) return false;
  }
  return status == PanelConfigStatus::END && writer.finish(&size) == PanelConfigStatus::OK;
}


inline bool card_image_remove_option(std::string &options, const std::string &id) {
  const auto key = std::string("bg_image=") + id;
  const auto first = options.find(key);
  if (first == std::string::npos || (first != 0 && options[first - 1] != ','))
    return false;
  const auto end = first + key.size();
  if (end != options.size() && options[end] != ',') return false;
  if (end < options.size()) options.erase(first, key.size() + 1);
  else if (first) options.erase(first - 1);
  else options.clear();
  return true;
}

inline bool panel_config_asset_reference(uint16_t version, const uint8_t *document, size_t size,
    const std::string &id, bool &referenced, configuration::ConfigurationBuffer::Allocate allocate,
    configuration::ConfigurationBuffer::Release release) {
  using namespace configuration;
  if (version == PANEL_CONFIG_DOCUMENT_VERSION)
    return panel_config_references_asset(document, size, id, referenced);
  PanelConfigV2Reader reader(document, size);
  size_t bytes = 0;
  if (reader.workspace_bytes(&bytes) != PanelConfigStatus::OK) return false;
  ConfigurationBuffer index(allocate, release);
  if (reader.validate(index.allocate(bytes), bytes) != PanelConfigStatus::OK) return false;
  referenced = false;
  for (size_t i = 0; i < reader.record_count(); ++i) {
    PanelConfigV2Record row;
    if (!reader.record(i, &row)) return false;
    if (row.kind != PanelConfigV2Kind::CARD) continue;
    auto options = std::string(reader.string(row.fields[size_t(PanelConfigV2Field::OPTIONS)]));
    if (card_image_remove_option(options, id)) {
      referenced = true;
      break;
    }
  }
  return true;
}

inline bool clear_panel_config_v2_asset_references(const uint8_t *input, size_t length,
    uint8_t *output, size_t capacity, size_t *length_out, const std::string &id,
    configuration::ConfigurationBuffer::Allocate allocate,
    configuration::ConfigurationBuffer::Release release) {
  using namespace configuration;
  using Kind = PanelConfigV2Kind;
  constexpr auto options_field = size_t(PanelConfigV2Field::OPTIONS);
  PanelConfigV2Reader reader(input, length);
  size_t index_bytes = 0;
  if (reader.workspace_bytes(&index_bytes) != PanelConfigStatus::OK) return false;
  ConfigurationBuffer index(allocate, release);
  if (reader.validate(index.allocate(index_bytes), index_bytes) != PanelConfigStatus::OK) return false;
  uint32_t next_string = 1;
  for (size_t i = 0; i < reader.record_count(); ++i) {
    PanelConfigV2Record row;
    if (!reader.record(i, &row)) return false;
    if (row.kind == Kind::STRING)
      next_string = std::max(next_string, uint32_t(row.id) + 1);
  }
  PanelConfigV2Writer writer(output, capacity);
  if (writer.begin() != PanelConfigStatus::OK) return false;
  std::map<std::string, uint16_t> replacements;
  for (size_t i = 0; i < reader.record_count(); ++i) {
    PanelConfigV2Record row;
    if (!reader.record(i, &row)) return false;
    if (row.kind == Kind::CARD) {
      auto options = std::string(reader.string(row.fields[options_field]));
      if (card_image_remove_option(options, id)) {
        row.flags &= ~PANEL_CONFIG_V2_RAW_SOURCE;
        row.raw_source = 0;
        if (options.empty()) {
          row.fields[options_field] = 0;
          row.field_mask &= ~(uint16_t{1} << options_field);
        } else {
          auto replacement = replacements.find(options);
          if (replacement == replacements.end()) {
            if (next_string >= PANEL_CONFIG_V2_NO_ID) return false;
            PanelConfigV2Record text;
            text.kind = Kind::STRING;
            text.id = uint16_t(next_string++);
            text.text = options;
            if (writer.append(text) != PanelConfigStatus::OK) return false;
            replacement = replacements.emplace(options, text.id).first;
          }
          row.fields[options_field] = replacement->second;
        }
      }
    }
    if (writer.append(row) != PanelConfigStatus::OK) return false;
  }
  ConfigurationBuffer validation(allocate, release);
  const auto bytes = writer.workspace_bytes();
  return writer.finish(validation.allocate(bytes), bytes, length_out) == PanelConfigStatus::OK;
}

}  // namespace espdesktop
