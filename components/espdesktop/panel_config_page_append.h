#pragma once

#include <array>
#include <deque>
#include <string>
#include <vector>
#include "panel_config_representation.h"

namespace espdesktop::configuration {
// A narrow, generation-checked producer edit: append newly available Finder
// folder actions without replacing any other page, card identity or setting.
class PanelConfigPageAppend {
  using Kind = PanelConfigV2Kind;
  using Row = PanelConfigV2Record;
public:
  explicit PanelConfigPageAppend(const PanelConfigV2Reader &reader) {
    Row row;
    for (size_t i = 0; i < reader.record_count(); ++i) {
      reader.record(i, &row); rows_.push_back(row);
      const auto kind = size_t(row.kind);
      if (kind < next_.size()) next_[kind] = std::max(next_[kind], unsigned(row.id) + 1);
    }
    for (auto &id : next_) id = std::max(id, 1u);
  }
  bool append(uint16_t page, std::string_view order,
              const std::vector<std::array<std::string, 9>> &cards) {
    size_t page_index = rows_.size(); uint16_t position = 0;
    for (size_t i = 0; i < rows_.size(); ++i) {
      const auto &row = rows_[i];
      if (row.kind == Kind::PAGE && row.id == page) page_index = i;
      if (row.kind == Kind::CARD && row.first == page) position = std::max(position, row.second);
    }
    if (page_index == rows_.size() || cards.empty() || position + cards.size() > 32) return false;
    const auto order_id = intern(order);
    if (failed_) return false;
    // New compact fields can contain delimiters in Finder labels. Existing
    // semantic fields stay exact; old raw dictionary entries are retained.
    rows_[page_index].third = order_id;
    rows_[page_index].flags = PANEL_CONFIG_V2_COMPACT_IMPORT;
    for (auto &row : rows_)
      if (row.kind == Kind::CARD && row.first == page) { row.flags = 0; row.raw_source = 0; }
    for (const auto &fields : cards) {
      Row card; card.kind = Kind::CARD; card.id = identity(Kind::CARD);
      card.first = page; card.second = ++position;
      for (size_t i = 0; i < fields.size(); ++i) {
        if (fields[i].empty()) continue;
        card.fields[i] = i == 0 || i == 4 ? entity(fields[i]) : intern(fields[i]);
        card.field_mask |= uint16_t{1} << i;
      }
      if (failed_) return false;
      rows_.push_back(card);
    }
    return true;
  }
  bool finish(uint8_t *output, size_t capacity, size_t *size,
      ConfigurationBuffer::Allocate allocate, ConfigurationBuffer::Release release) const {
    if (failed_) return false;
    PanelConfigV2Writer writer(output, capacity);
    if (writer.begin() != PanelConfigStatus::OK) return false;
    for (const auto &row : rows_) if (writer.append(row) != PanelConfigStatus::OK) return false;
    ConfigurationBuffer scratch(allocate, release);
    const auto bytes = writer.workspace_bytes();
    auto *index = scratch.allocate(bytes);
    return index && writer.finish(index, bytes, size) == PanelConfigStatus::OK;
  }
private:
  uint16_t identity(Kind kind) {
    auto &id = next_[size_t(kind)];
    if (id >= PANEL_CONFIG_V2_NO_ID) { failed_ = true; return 0; }
    return id++;
  }
  uint16_t intern(std::string_view text) {
    if (text.empty()) return 0;
    for (const auto &row : rows_) if (row.kind == Kind::STRING && row.text == text) return row.id;
    strings_.emplace_back(text);
    Row row; row.kind = Kind::STRING; row.id = identity(Kind::STRING); row.text = strings_.back();
    rows_.push_back(row); return row.id;
  }
  uint16_t entity(std::string_view text) {
    const auto string = intern(text);
    if (!string) return 0;
    for (const auto &row : rows_) if (row.kind == Kind::ENTITY && row.first == string) return row.id;
    Row row; row.kind = Kind::ENTITY; row.id = identity(Kind::ENTITY); row.first = string;
    rows_.push_back(row); return row.id;
  }
  std::vector<Row> rows_;
  std::deque<std::string> strings_;
  std::array<unsigned, 8> next_{};
  bool failed_{false};
};
} // namespace espdesktop::configuration
