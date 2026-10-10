#pragma once
#include "esphome/core/defines.h"
#ifdef USE_MEDIA_PLAYER
#include <cmath>
#include "esphome/core/component.h"
#include "esphome/components/media_player/media_player.h"

namespace espdesktop {
// Both source players feed one physical output. Keep their reported gain state
// aligned; synchronizing never changes playback, URI or announcement state.
class SharedSpeakerState : public esphome::Component {
 public:
  void set_players(esphome::media_player::MediaPlayer *first,
                   esphome::media_player::MediaPlayer *second) { first_ = first; second_ = second; }
  float get_setup_priority() const override { return esphome::setup_priority::LATE; }
  void setup() override {
    if (!first_ || !second_) return;
    first_->add_on_state_callback([this](auto) { sync_from(first_, second_); });
    second_->add_on_state_callback([this](auto) { sync_from(second_, first_); });
    // The named HA player owns the initial restored setting after both players
    // have finished setup. Reapply it to the shared hardware, then the peer.
    const float volume = first_->volume;
    const bool muted = first_->is_muted();
    syncing_ = true;
    apply(first_, volume, muted, true);
    apply(second_, volume, muted, false);
    syncing_ = false;
  }
 private:
  static void apply(esphome::media_player::MediaPlayer *target, float volume,
                    bool muted, bool force_volume) {
    if (force_volume || std::fabs(target->volume - volume) > 0.000001f) {
      auto call = target->make_call(); call.set_volume(volume); call.perform();
    }
    // ESPHome volume writes can unmute: restore the requested mute AFTER volume.
    if (target->is_muted() != muted) {
      auto call = target->make_call();
      call.set_command(muted ? esphome::media_player::MEDIA_PLAYER_COMMAND_MUTE
                             : esphome::media_player::MEDIA_PLAYER_COMMAND_UNMUTE);
      call.perform();
    }
  }
  void sync_from(esphome::media_player::MediaPlayer *source,
                 esphome::media_player::MediaPlayer *target) {
    if (syncing_) return;
    const float volume = source->volume;
    const bool muted = source->is_muted();
    syncing_ = true;
    apply(target, volume, muted, false);
    syncing_ = false;
  }
  esphome::media_player::MediaPlayer *first_{nullptr}, *second_{nullptr};
  bool syncing_{false};
};
}  // namespace espdesktop

#endif  // USE_MEDIA_PLAYER
