"""Execute the production announcement callbacks without changing player gain."""
from pathlib import Path
import os, subprocess, tempfile, textwrap
root=Path(__file__).resolve().parents[2]
callbacks=[]
for name in ('speaker_output_p4.yaml',):
 s=(root/'common/device'/name).read_text();start=s.index('    on_state:\n      - lambda: |-\n')+len('    on_state:\n      - lambda: |-\n');end=s.find('\n', start)
 lines=[]
 for line in s[start:].splitlines():
  if line and not line.startswith('          '): break
  lines.append(line)
 callbacks.append(textwrap.dedent('\n'.join(lines)).strip())
assert not (root / 'common/device/speaker_output_s3_external.yaml').exists()
source=r'''
#include <cassert>
#include <cstdint>
namespace esphome { namespace media_player { enum { MEDIA_PLAYER_STATE_ANNOUNCING=4 }; } }
struct Player { int state=0; float volume=.4f; bool muted=true; } device_speaker;
struct Mixer { int level=0, calls=0; void apply_ducking(uint8_t value, uint32_t duration) { assert(duration==250);level=value;++calls; } } speaker_media_input, speaker_sendspin_input;
#define id(name) name
void changed() {
''' + callbacks[0]+r'''
}
int main() {
 changed(); assert(speaker_media_input.calls==0);
 device_speaker.state=4; changed();
 assert(speaker_media_input.level==20 && speaker_sendspin_input.level==20);
 device_speaker.volume=.7f; changed();
 assert(speaker_media_input.calls==1 && device_speaker.muted);
 for (int state : {0,1,2,3}) {
   device_speaker.state=state; changed();
   assert(speaker_media_input.level==0 && speaker_sendspin_input.level==0);
   device_speaker.state=4; changed();
   assert(speaker_media_input.level==20 && speaker_sendspin_input.level==20);
 }
 assert(device_speaker.volume==.7f && device_speaker.muted);
}
'''
source='#include <initializer_list>\n'+source
with tempfile.TemporaryDirectory() as tmp:
 p=Path(tmp);(p/'test.cpp').write_text(source)
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++17','-Wall','-Wextra','-Werror',str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Actual P4-86 callback duck both media paths only during announcements and restore afterward.')
