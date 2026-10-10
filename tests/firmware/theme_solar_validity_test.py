"""Run the actual solar calculator and backlight adapter for polar theme days."""
from pathlib import Path
import os, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
firmware = root / 'components/espdesktop'
sun = (firmware / 'sun_calc.h').read_text()
calculator = sun[sun.index('static constexpr float SUN_CALC_DEG_TO_RAD'):sun.index('\n}\n', sun.index('inline bool calc_sunrise_sunset(')) + 3]
backlight = (firmware / 'backlight.h').read_text()
adapter = backlight[backlight.index('struct SunCalcResult {'):backlight.index('// ── Brightness calculation')]
wiring = (root / 'common/addon/backlight_schedule.yaml').read_text()
assert 'id(theme_solar_valid) = r.solar_valid;' in wiring
assert 'conditions.sun_valid = id(theme_solar_valid) && offsets_valid;' in wiring
assert 'id(sunrise_sunset_valid) = r.valid;' in wiring  # Existing brightness fallback is preserved.
source = r'''
#include <string>
#include <cmath>
#include <cstdio>
#include <cassert>
#include "theme_settings.h"
template<typename... Args> inline void test_log(Args...) {}
#define ESP_LOGW(...) test_log(__VA_ARGS__)
#define ESP_LOGI(...) test_log(__VA_ARGS__)
inline std::string effective_timezone_option(const std::string &v) { return v; }
inline std::string timezone_id_from_option(const std::string &v) { return v; }
inline float utc_offset_hours_for_date(int, int, int, const std::string &) { return 0; }
inline bool lookup_tz_coords(const std::string &v, float &lat, float &lon) {
  lat = v == "polar" ? 78.22f : 51.5f; lon = 0;
  return v != "missing";
}
''' + calculator + adapter + r'''
int main() {
  auto normal = recalc_sunrise_sunset(2026, 6, 21, "normal", false);
  assert(normal.valid && normal.solar_valid);
  for (int month : {6, 12}) {
    auto polar = recalc_sunrise_sunset(2026, month, 21, "polar", false);
    assert(polar.valid && !polar.solar_valid);
    assert(polar.rise_h == 6 && polar.rise_m == 0);
    assert(polar.set_h == 18 && polar.set_m == 0);
  }
  auto missing = recalc_sunrise_sunset(2026, 6, 21, "missing");
  assert(!missing.valid && !missing.solar_valid);
}
'''
with tempfile.TemporaryDirectory() as tmp:
 p = Path(tmp); (p/'test.cpp').write_text(source)
 subprocess.run([os.environ.get('CXX','c++'),'-std=c++17','-Wall','-Wextra','-Werror','-I'+str(firmware),str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Actual solar adapter preserves brightness fallback while rejecting polar theme schedules.')
