#pragma once

#include "finder_folder_sync.h"

inline auto obs_subpage_accepts(OBSSubpageKind kind) {
  if (kind == OBSSubpageKind::audio) return companion_obs_level_control;
  if (kind == OBSSubpageKind::scenes) return companion_obs_scene_target;
  return kind == OBSSubpageKind::sources ? companion_obs_source_target : companion_obs_transition_target;
}

inline std::vector<CompanionAction> obs_subpage_catalogue(const CompanionRuntimeSnapshot &snapshot,
                                                           OBSSubpageKind kind) {
  const auto accepts = obs_subpage_accepts(kind);
  std::vector<CompanionAction> entries;
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

inline std::string obs_subpage_tile_key(const std::string &id, OBSSubpageKind kind) {
  if (kind != OBSSubpageKind::audio && kind != OBSSubpageKind::scenes) return id.substr(id.size() - 32);
  auto uuid = id.substr(id.size() - 36);
  uuid.erase(std::remove(uuid.begin(), uuid.end(), '-'), uuid.end());
  return uuid;
}

inline void project_obs_subpage_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                         int slots, int columns, int capacity,
                                         const std::vector<CompanionAction> &catalogue,
                                         const std::string &options, OBSSubpageKind kind) {
  const auto preferences = obs_subpage_preferences(options, kind);
  std::vector<CompanionAction> sorted;
  sorted.reserve(catalogue.size());
  for (const auto &hash : preferences) {
    if (hash.front() == '!') continue;
    const auto item = std::find_if(catalogue.begin(), catalogue.end(), [&](const auto &entry) {
      return obs_subpage_tile_key(entry.id, kind) == hash;
    });
    if (item != catalogue.end()) sorted.push_back(*item);
  }
  for (const auto &entry : catalogue) {
    const auto hash = obs_subpage_tile_key(entry.id, kind);
    if (std::find(preferences.begin(), preferences.end(), hash) == preferences.end() &&
        std::find(preferences.begin(), preferences.end(), "!" + hash) == preferences.end())
      sorted.push_back(entry);
  }
  const bool audio = kind == OBSSubpageKind::audio;
  const char *icon = audio ? "Microphone"
    : kind == OBSSubpageKind::transitions ? "Flip Horizontal" : "Image Card Loading";
  project_live_folder_tiles(order, buttons, slots, columns, capacity, sorted, icon, "",
      obs_subpage_accepts(kind), audio ? "slider" : "companion");
}
