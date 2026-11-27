#pragma once

#include <algorithm>
#include <string>
#include <vector>

#include "companion_runtime_access.h"
#include "icons.h"
#include "lvgl.h"
#include "theme_palette.h"

// A small lock marker on Companion cards whose computer is locked. It depends
// only on the computer's lock state, so a card that is unavailable for another
// reason (for example a Teams microphone with no meeting) does not look locked.
struct CompanionCardLockBadge {
  lv_obj_t *button{nullptr};
  lv_obj_t *badge{nullptr};
  std::string computer_id;
  const lv_font_t *font{nullptr};
};

inline std::vector<CompanionCardLockBadge> &companion_card_lock_badges() {
  static std::vector<CompanionCardLockBadge> badges;
  return badges;
}

inline void companion_card_lock_badge_delete(CompanionCardLockBadge &ref) {
  if (ref.badge && lv_obj_is_valid(ref.badge)) lv_obj_del(ref.badge);
  ref.badge = nullptr;
}

inline void companion_card_lock_badge_sync(CompanionCardLockBadge &ref) {
  if (!ref.button || !lv_obj_is_valid(ref.button)) return;
  if (!companion_computer_locked(ref.computer_id)) {
    companion_card_lock_badge_delete(ref);
    return;
  }
  if (ref.badge && lv_obj_is_valid(ref.badge)) {
    lv_obj_clear_flag(ref.badge, LV_OBJ_FLAG_HIDDEN);
    lv_obj_move_foreground(ref.badge);
    return;
  }

  auto *badge = lv_label_create(ref.button);
  if (!badge) return;
  ref.badge = badge;
  lv_label_set_text(badge, find_icon("Lock"));
  if (ref.font) lv_obj_set_style_text_font(badge, ref.font, LV_PART_MAIN);
  const auto &theme = current_theme();
  lv_obj_set_style_text_color(badge, lv_color_hex(theme.text_primary), LV_PART_MAIN);
  lv_obj_set_style_bg_color(badge, lv_color_hex(theme.background), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(badge, LV_OPA_80, LV_PART_MAIN);
  lv_obj_set_style_radius(badge, LV_RADIUS_CIRCLE, LV_PART_MAIN);
  lv_obj_set_style_pad_hor(badge, 4, LV_PART_MAIN);
  lv_obj_set_style_pad_ver(badge, 2, LV_PART_MAIN);
  lv_obj_clear_flag(badge, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_flag(badge, LV_OBJ_FLAG_IGNORE_LAYOUT);
  lv_obj_align(badge, LV_ALIGN_TOP_RIGHT, -2, 2);
  lv_obj_move_foreground(badge);
}

inline void companion_card_lock_badge_attach(lv_obj_t *button,
                                             const std::string &computer_id,
                                             const lv_font_t *font) {
  if (!button) return;
  auto &refs = companion_card_lock_badges();
  auto existing = std::find_if(refs.begin(), refs.end(),
      [button](const CompanionCardLockBadge &ref) { return ref.button == button; });
  if (existing == refs.end()) {
    refs.push_back({button, nullptr, computer_id, font});
    existing = refs.end() - 1;
  } else {
    existing->computer_id = computer_id;
    existing->font = font;
  }
  companion_card_lock_badge_sync(*existing);
}

inline void companion_card_lock_badge_forget(lv_obj_t *button) {
  if (!button) return;
  auto &refs = companion_card_lock_badges();
  auto existing = std::find_if(refs.begin(), refs.end(),
      [button](const CompanionCardLockBadge &ref) { return ref.button == button; });
  if (existing == refs.end()) return;
  companion_card_lock_badge_delete(*existing);
  refs.erase(existing);
}

inline void companion_refresh_card_lock_badges() {
  auto &refs = companion_card_lock_badges();
  for (auto it = refs.begin(); it != refs.end();) {
    if (!it->button || !lv_obj_is_valid(it->button)) {
      it = refs.erase(it);
      continue;
    }
    companion_card_lock_badge_sync(*it);
    ++it;
  }
}
