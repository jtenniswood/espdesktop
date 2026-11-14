"""Exercise application shutdown ordering for local configuration/UI owners."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'components/espdesktop/espdesktop_app.cpp').read_text()
start = source.index('void EspDesktopApp::on_shutdown() {')
shutdown = source[start:source.index('\n}', start) + 2]
code = r'''
#include <cassert>
#include <functional>
#include <string>
#include <vector>
std::vector<std::string> events;
namespace esphome::artwork_image {
struct TransferObserver {
  static TransferObserver &instance() { static TransferObserver observer; return observer; }
  void set(std::function<void()> first, std::function<void()> second) {
    assert(!first && !second); events.push_back("observer cleared");
  }
};
}
namespace espdesktop {
namespace cards {
void set_card_runtime_registry_service(void *registry) {
  assert(!registry && events.back() == "observer cleared");
  events.push_back("registry cleared");
}
}
struct Transactions { void stop() { events.push_back("transactions stopped"); } };
struct Runtime { Transactions transactions; };
struct Scene {
  void stop() {
    assert(events.back() == "transactions stopped");
    events.push_back("scene stopped");
  }
};
struct CardAssets {
  void stop() { events.push_back("card images stopped"); }
};
struct Core {
  void stop() {
    assert(events.back() == "registry cleared");
    events.push_back("core stopped");
  }
};
struct EspDesktopApp {
  bool shutting_down_{false}; Runtime *native_configuration_runtime_{nullptr};
  Scene *application_scene_{nullptr}; CardAssets card_assets_; Core core_;
  void on_shutdown();
};
''' + shutdown + r'''
}
int main() {
  using namespace espdesktop;
  EspDesktopApp app; Runtime runtime; Scene scene;
  app.native_configuration_runtime_ = &runtime; app.application_scene_ = &scene;
  app.on_shutdown();
  assert((events == std::vector<std::string>{"transactions stopped", "scene stopped",
    "card images stopped", "observer cleared", "registry cleared", "core stopped"}));
  app.on_shutdown(); assert(events.size() == 6);
  events.clear(); EspDesktopApp not_initialized;
  not_initialized.on_shutdown();
  assert((events == std::vector<std::string>{"card images stopped", "observer cleared", "registry cleared", "core stopped"}));
}
'''
with tempfile.TemporaryDirectory(prefix='application-shutdown-') as temporary:
    cpp = Path(temporary) / 'test.cpp'
    binary = Path(temporary) / 'test'
    cpp.write_text(code)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall', '-Wextra',
                    '-Werror', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Transactions stop before UI teardown; observers/registry clear before core release; repeated/uninitialized shutdown is safe.')
