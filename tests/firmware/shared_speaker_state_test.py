"""Compile the real synchronizer against SDK gain/mute callback semantics."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory() as tmp:
 d=Path(tmp);(d/'esphome/core').mkdir(parents=True);(d/'esphome/components/media_player').mkdir(parents=True)
 (d/'esphome/core/defines.h').write_text('#pragma once\n#define USE_MEDIA_PLAYER\n')
 (d/'esphome/core/component.h').write_text('namespace esphome { namespace setup_priority { constexpr float LATE=-100; } struct Component { virtual void setup() {} virtual float get_setup_priority() const { return 0; } }; }\n')
 (d/'esphome/components/media_player/media_player.h').write_text('''#pragma once
#include <cassert>
#include <functional>
#include <optional>
#include <vector>
namespace esphome::media_player {
enum Command {MEDIA_PLAYER_COMMAND_MUTE, MEDIA_PLAYER_COMMAND_UNMUTE};
struct Output { float volume=1; bool muted=false; };
struct MediaPlayer {
 float volume=1; bool muted=false; int commands=0, playback=0;
 Output *output; std::vector<std::function<void(int)>> callbacks;
 explicit MediaPlayer(Output *o):output(o) {}
 bool is_muted() const {return muted;}
 template<class F> void add_on_state_callback(F f) {callbacks.emplace_back(f);}
 void publish() {for(auto &cb:callbacks) cb(playback);}
 struct Call {
  MediaPlayer *player; std::optional<float> volume; std::optional<Command> command;
  void set_volume(float value) {volume=value;} void set_command(Command value) {command=value;}
  void perform() {
   assert(++player->commands<100); // Detect callback feedback loops.
   if(volume) {player->volume=*volume;player->output->volume=*volume;player->muted=*volume<0.001f;}
   if(command) player->muted=*command==MEDIA_PLAYER_COMMAND_MUTE;
   player->output->muted=player->muted;player->publish();
  }
 };
 Call make_call() {return {this,{},{}};}
};
}
''')
 (d/'test.cpp').write_text('''#include <cassert>
#include "shared_speaker_state.h"
using namespace esphome::media_player;
int main(){
 Output output;MediaPlayer ha(&output),sendspin(&output);
 ha.volume=0.4f;ha.muted=true;sendspin.volume=0.9f;sendspin.muted=false;
 espdesktop::SharedSpeakerState sync;sync.set_players(&ha,&sendspin);sync.setup();
 assert(ha.volume==sendspin.volume && ha.muted && sendspin.muted && output.muted && output.volume==0.4f);
 auto volume=sendspin.make_call();volume.set_volume(0.7f);volume.perform();
 assert(ha.volume==0.7f && !ha.muted && !sendspin.muted && !output.muted);
 auto mute=ha.make_call();mute.set_command(MEDIA_PLAYER_COMMAND_MUTE);mute.perform();
 assert(sendspin.muted && output.muted);
 ha.playback=2;ha.publish();assert(output.muted && sendspin.playback==0); // Later HA announcement stays muted.
 auto zero=sendspin.make_call();zero.set_volume(0);zero.perform();assert(ha.volume==0 && ha.muted && output.muted);
 auto unmute=sendspin.make_call();unmute.set_command(MEDIA_PLAYER_COMMAND_UNMUTE);unmute.perform();assert(!ha.muted && !output.muted);
 int calls=ha.commands+sendspin.commands;ha.publish();sendspin.publish();assert(ha.commands+sendspin.commands==calls);
 assert(ha.playback==2 && sendspin.playback==0);
}
''')
 subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-I'+str(d),'-I'+str(root/'components/espdesktop'),str(d/'test.cpp'),'-o',str(d/'test')],check=True)
 subprocess.run([str(d/'test')],check=True)
print('Shared speaker restored volume, bidirectional mute/volume, announcement and callback feedback passed.')
