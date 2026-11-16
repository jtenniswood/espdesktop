#pragma once

#include "finder_folder_sync.h"

inline std::vector<CompanionAction> obs_subpage_catalogue(const CompanionRuntimeSnapshot &snapshot, bool sources) {
  const auto accepts = sources ? companion_obs_source_target : companion_obs_transition_target;
  std::vector<CompanionAction> entries;
  for (const auto &action : snapshot.actions) {
    std::string_view id = action.id;
    if (id.size() > 37 && id[id.size() - 37] == '.' &&
        accepts(id.substr(0, id.size() - 37))) {
      id.remove_suffix(37);
    }
    if (accepts(id)) entries.push_back({std::string(id), action.label});
  }
  return entries;
}

inline void project_obs_subpage_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                         int slots, int columns, int capacity,
                                         const std::vector<CompanionAction> &catalogue,
                                         const std::string &options, bool sources) {
  const auto preferences = obs_subpage_preferences(options, sources);
  std::vector<CompanionAction> sorted;
  sorted.reserve(catalogue.size());
  for (const auto &hash : preferences) {
    if (hash.front() == '!') continue;
    const auto transition = std::find_if(catalogue.begin(), catalogue.end(), [&](const auto &entry) {
      return std::string_view(entry.id).substr(entry.id.size() - 32) == hash;
    });
    if (transition != catalogue.end()) sorted.push_back(*transition);
  }
  for (const auto &entry : catalogue) {
    const auto hash = entry.id.substr(entry.id.size() - 32);
    if (std::find(preferences.begin(), preferences.end(), hash) == preferences.end() &&
        std::find(preferences.begin(), preferences.end(), "!" + hash) == preferences.end())
      sorted.push_back(entry);
  }
  project_live_folder_tiles(order, buttons, slots, columns, capacity, sorted, sources ? "Image Card Loading" : "Flip Horizontal", "",
      sources ? companion_obs_source_target : companion_obs_transition_target);
}
