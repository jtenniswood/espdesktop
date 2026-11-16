#pragma once

#include "finder_folder_sync.h"

inline std::vector<CompanionAction> obs_transition_subpage_catalogue(const CompanionRuntimeSnapshot &snapshot) {
  std::vector<CompanionAction> transitions;
  for (const auto &action : snapshot.actions) {
    std::string_view id = action.id;
    if (id.size() > 37 && id[id.size() - 37] == '.' &&
        companion_obs_transition_target(std::string_view(id).substr(0, id.size() - 37))) {
      id.remove_suffix(37);
    }
    if (companion_obs_transition_target(id)) transitions.push_back({std::string(id), action.label});
  }
  return transitions;
}

inline void project_obs_transition_tiles(SubpageOrder &order, std::vector<SubpageBtn> &buttons,
                                         int slots, int columns, int capacity,
                                         const std::vector<CompanionAction> &catalogue,
                                         const std::string &options) {
  const auto preferences = obs_transition_preferences(options);
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
  project_live_folder_tiles(order, buttons, slots, columns, capacity, sorted, "Flip Horizontal", "",
      companion_obs_transition_target);
}
