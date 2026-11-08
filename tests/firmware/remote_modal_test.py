"""Run the production modal resolver and driver hooks against LVGL/HA doubles."""
from pathlib import Path
import os
import subprocess
import tempfile
import yaml

ROOT = Path(__file__).resolve().parents[2]
HEADERS = ROOT / 'components/espdesktop'


def function(file, name):
    source = (HEADERS / file).read_text()
    search_from = 0
    while True:
        signature = source.find(name + '(', search_from)
        if signature < 0:
            raise ValueError(f'Could not find definition of {name} in {file}')
        open_paren = source.index('(', signature)
        depth = 1
        close_paren = open_paren + 1
        while depth:
            depth += (source[close_paren] == '(') - (source[close_paren] == ')')
            close_paren += 1
        body = source.find('{', close_paren)
        declaration_end = source.find(';', close_paren)
        if body >= 0 and (declaration_end < 0 or body < declaration_end):
            start = source.rfind('inline ', 0, signature)
            break
        search_from = close_paren
    depth = 1
    end = body + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + '\n'


source = (ROOT / 'tests/firmware/remote_modal_test.cpp.in').read_text()
parser = (HEADERS / 'button_grid_config_parser.h').read_text()
helpers = parser[parser.index('inline int hex_digit('):parser.index('inline char compact_hex_char(')]
helpers += function('button_grid_config_parser.h', 'cfg_option_value')
helpers += function('button_grid_config_parser.h', 'rainfall_uses_forecast')
for file, name in [
    ('button_grid_actions.h', 'media_card_mode'),
    ('button_grid_wifi_qr.h', 'wifi_qr_has_local_view'),
    ('button_grid_image.h', 'image_card_page_visible'),
    ('button_grid_image.h', 'image_card_context_visible_on_active_screen'),
    ('button_grid_image.h', 'image_card_context_on_active_screen'),
]:
    helpers += function(file, name)
helpers += 'namespace espdesktop::cards {\n'
helpers += function('button_grid_wifi_qr_driver.h', 'wifi_qr_driver_matches')
helpers += function('button_grid_wifi_qr_driver.h', 'wifi_qr_driver_modal_target')
helpers += '}\n'
helpers += function('button_grid_navigation.h', 'navigation_close_modals_for_display_takeover')
helpers += function('button_grid_grid.h', 'grid_release_runtime_allocations')
config = yaml.safe_load((ROOT / 'common/device/api_remote_actions.yaml').read_text())
navigate = next(script for script in config['script'] if script['id'] == 'remote_navigate')
body = next(action['lambda'] for action in navigate['then'] if 'lambda' in action)
body = body.replace('${navigate_voice_target_code}', '++remote_voice_calls;')
helpers += r"""
int remote_navigation_calls = 0, remote_voice_calls = 0;
bool navigation_is_voice_target(const std::string &target) { return target == "voice"; }
bool navigation_has_home_label_target(const std::string &) { return false; }
bool espdesktop_navigate(const std::string &, lv_obj_t *) { ++remote_navigation_calls; navigation_hide_modals(); return true; }
struct TestPage { lv_obj_t *obj; } test_main_page{&home};
auto *main_page = &test_main_page;
#define id(x) x
void invoke_remote_navigation(std::string target) {
""" + body + '\n}\n'
source = source.replace('// PRODUCTION_HOOKS', helpers)
with tempfile.TemporaryDirectory(prefix='remote-modal-test-') as directory:
    cpp = Path(directory) / 'test.cpp'
    binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([os.environ.get('CXX', 'g++'), '-std=c++17', '-Wall', '-Wextra',
                    '-Werror', '-UNDEBUG', '-I', str(HEADERS), str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Remote modal lookup, driver dispatch, and lifecycle tests passed.')
