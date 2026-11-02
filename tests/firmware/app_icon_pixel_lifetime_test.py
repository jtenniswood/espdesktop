"""Exercise the production icon buffer owner, including display-only eviction."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
header = (root / 'components/espdesktop/button_grid_cards.h').read_text()
start = header.index('struct CompanionAppIconImageData {')
owner = header[start:header.index('\n};', start) + 3]
code = r'''
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <string>
#include "app_icon_layout.h"
#define VERSION_CODE(a,b,c) ((a)*10000+(b)*100+(c))
#define ESPHOME_VERSION_CODE VERSION_CODE(2026,10,1)
struct lv_image_dsc_t { uint8_t *data = nullptr; };
struct lv_obj_t {};
namespace espdesktop::cover_art { struct AccentPalette {}; }
unsigned allocations = 0, releases = 0;
namespace esphome {
template<class T> struct RAMAllocator {
  enum { ALLOC_EXTERNAL };
  RAMAllocator(int) {}
  T *allocate(size_t n) { ++allocations; return new T[n]; }
  void deallocate(T *p, size_t) { assert(p); ++releases; delete[] p; }
};
namespace companion {
constexpr size_t APP_ICON_PIXEL_BYTES = 240 * 240 * 3;
struct Store { bool hash_for(const std::string &, std::array<uint8_t,32> *) { return true; } };
Store &app_icon_store() { static Store store; return store; }
}
}
'''
code += owner + r'''
int main() {
  {
    CompanionAppIconImageData icon;
    assert(icon.prepare_pixels("app"));
    icon.display_bytes = 160 * 160 * 3;
    icon.display_pixels = icon.pixel_allocator.allocate(icon.display_bytes);
    icon.display_side = 160;
    icon.descriptor.data = icon.display_pixels;
    icon.image_loaded = true;
    icon.release_source_pixels();
    assert(!icon.pixels && icon.display_pixels && icon.image_loaded);
    assert(icon.descriptor.data == icon.display_pixels && releases == 1);
    icon.release_source_pixels();
    assert(releases == 1);
    // Cache eviction must clear the descriptor even without an original buffer.
    icon.release_pixels();
    assert(!icon.pixels && !icon.display_pixels && !icon.descriptor.data);
    assert(!icon.image_loaded && !icon.display_side && !icon.display_bytes);
    assert(releases == 2);
    icon.release_pixels();
    // Reload/resize after eviction and ensure destruction frees both buffers.
    assert(icon.prepare_pixels("app"));
    icon.display_bytes = 128;
    icon.display_pixels = icon.pixel_allocator.allocate(icon.display_bytes);
  }
  assert(allocations == 4 && releases == allocations);
}
'''
with tempfile.TemporaryDirectory(prefix='app-icon-lifetime-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(code)
    subprocess.run([sys.argv[1] if len(sys.argv) > 1 else 'c++', '-std=c++17', '-Wall', '-Wextra', '-Werror',
                    '-fsanitize=address,undefined', '-I', str(root / 'components/espdesktop'),
                    str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Production app icon buffers release safely after display-only caching, eviction and reload.')
