#pragma once

#include "finder_folder_sync.h"
#include "companion_capabilities_generated.h"

inline auto obs_subpage_accepts(OBSSubpageKind kind) {
  if (kind == OBSSubpageKind::audio) return companion_obs_level_control;
  if (kind == OBSSubpageKind::scenes) return companion_obs_scene_target;
  return kind == OBSSubpageKind::sources ? companion_obs_source_target : companion_obs_transition_target;
}

inline CompanionActionList obs_subpage_catalogue(const CompanionRuntimeSnapshot &snapshot,
                                                           OBSSubpageKind kind) {
  const auto accepts = obs_subpage_accepts(kind);
  CompanionActionList entries;
  for (const auto &action : snapshot.actions) {
    std::string_view id = action.id;
    if (kind != OBSSubpageKind::audio && id.size() > 37 && id[id.size() - 37] == '.' &&
        accepts(id.substr(0, id.size() - 37))) {
      id.remove_suffix(37);
    }
    if (accepts(id)) entries.push_back({std::string(id), action.label});
  }
  return entries;
}

inline void project_obs_scene_controls(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                       int slots, int columns, int capacity, const std::string &exclusions) {
  if (!order.has_back_token || slots < 6) return;
  const auto excluded = split_config_fields(exclusions, '|');
  auto occupied = live_page_occupied_cells(order, slots, columns);
  for (const auto &control : OBS_SCENE_PAGE_CONTROLS) {
    if (buttons.size() >= size_t(capacity)) return;
    if (std::find(excluded.begin(), excluded.end(), generated_card_key(control.id)) != excluded.end() ||
        std::any_of(order.positions, order.positions + slots, [&](int index) {
          return index > 0 && buttons[index - 1].entity == control.id;
        })) continue;
    int anchor = -1, width = 1;
    if (control.width == 2) {
      for (int pos = slots - 2; pos >= 0; --pos) {
        if (pos % columns < columns - 1 && !occupied[pos] && !occupied[pos + 1]) {
          anchor = pos;
          width = 2;
          break;
        }
      }
    }
    if (anchor < 0) {
      for (int pos = slots - 1; pos >= 0; --pos) {
        if (!occupied[pos]) { anchor = pos; break; }
      }
    }
    if (anchor < 0) return;
    order.positions[anchor] = int(buttons.size()) + 1;
    order.col_span[buttons.size()] = width;
    occupied[anchor] = true;
    if (width == 2) occupied[anchor + 1] = true;
    buttons.push_back({control.id, "", control.icon, "Auto", "", "", "companion", "", ""});
  }
}

inline void project_obs_subpage_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                         int slots, int columns, int capacity,
                                         const CompanionActionList &catalogue,
                                         const std::string &options, OBSSubpageKind kind) {
  const auto exclusions = cfg_option_value(options, "generated_card_exclusions");
  if (kind == OBSSubpageKind::scenes)
    project_obs_scene_controls(order, buttons, slots, columns, capacity, exclusions);
  const auto preferences = obs_subpage_preferences(options, kind);
  CompanionActionList sorted;
  sorted.reserve(catalogue.size());
  for (const auto &hash : preferences) {
    if (hash.front() == '!') continue;
    const auto item = std::find_if(catalogue.begin(), catalogue.end(), [&](const auto &entry) {
      return generated_card_key(entry.id) == hash;
    });
    if (item != catalogue.end()) sorted.push_back(*item);
  }
  for (const auto &entry : catalogue) {
    const auto hash = generated_card_key(entry.id);
    if (std::find(preferences.begin(), preferences.end(), hash) == preferences.end() &&
        std::find(preferences.begin(), preferences.end(), "!" + hash) == preferences.end())
      sorted.push_back(entry);
  }
  const bool audio = kind == OBSSubpageKind::audio;
  const char *icon = audio ? "Microphone"
    : kind == OBSSubpageKind::transitions ? "Flip Horizontal" : "Image Card Loading";
  project_live_folder_tiles(order, buttons, slots, columns, capacity, sorted, icon, "",
      obs_subpage_accepts(kind), audio ? "slider" : "companion",
      exclusions);
}
