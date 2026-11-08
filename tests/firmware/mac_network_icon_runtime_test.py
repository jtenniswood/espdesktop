"""Execute direct Mac icon requests, caching, retries and ownership without HA types."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
from production_source import definition

ROOT = Path(__file__).resolve().parents[2]
header = (ROOT / 'components/espdesktop/button_grid_image.h').read_text()
context = re.search(r'^struct ImageCardCtx \{.*?^};', header, re.M | re.S)[0]
source = r'''
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>
using lv_coord_t = int;
struct lv_obj_t { lv_obj_t *parent = nullptr; bool hidden = false; int invalidations = 0; };
constexpr int LV_OBJ_FLAG_HIDDEN = 1;
lv_obj_t screen, other_screen;
lv_obj_t *active_screen = &screen;
auto *lv_scr_act() { return active_screen; }
auto *lv_obj_get_parent(lv_obj_t *widget) { return widget->parent; }
bool lv_obj_has_flag(lv_obj_t *widget, int) { return widget->hidden; }
void lv_obj_add_flag(lv_obj_t *widget, int) { widget->hidden = true; }
void lv_obj_clear_flag(lv_obj_t *widget, int) { widget->hidden = false; }
void lv_obj_move_foreground(lv_obj_t *) {}
void lv_obj_invalidate(lv_obj_t *widget) { ++widget->invalidations; }
int notifications = 0;
void notify_dashboard_content_changed() { ++notifications; }
enum class ControlModalKind { NONE, WIFI_QR };
struct Modal { ControlModalKind kind = ControlModalKind::NONE; } modal;
auto &control_modal_active() { return modal; }
uint32_t now_ms = 100;
namespace esphome {
uint32_t millis() { return now_ms; }
namespace artwork_image {
enum class ImageResizeMode { COVER };
struct ArtworkImage {
  std::string url;
  bool reject = false;
  int requests = 0, cancellations = 0, releases = 0, width = 0, height = 0;
  std::vector<std::function<void(bool)>> finished;
  std::vector<std::function<void()>> errors;
  std::function<bool()> visible, screen_active;
  std::function<void()> redraw;
  auto get_url() const { return url; }
  void cancel_update() { ++cancellations; }
  void release() { ++releases; }
  void set_target_size(int w, int h) { width = w; height = h; }
  void set_resize_mode(ImageResizeMode) {}
  std::string request_update_url(const std::string &value, int) {
    ++requests; if (reject) return {}; url = value; return value;
  }
  bool has_on_finished_callbacks() const { return !finished.empty(); }
  bool has_on_error_callbacks() const { return !errors.empty(); }
  void add_on_finished_callback(std::function<void(bool)> callback) { finished.push_back(callback); }
  void add_on_error_callback(std::function<void()> callback) { errors.push_back(callback); }
  void set_animation_callbacks(std::function<bool()> v, std::function<void()> r, std::function<bool()> s) {
    visible = v; redraw = r; screen_active = s;
  }
};
}}
constexpr int IMAGE_CARD_MAX_CONTEXTS = 2;
constexpr uint32_t IMAGE_CARD_RETRY_INTERVAL_MS = 2000;
struct GridConfig { int image_card_image_count; esphome::artwork_image::ArtworkImage **image_card_images; };
''' + context + r'''
void image_card_log_diagnostics(ImageCardCtx *, const char *, int = 0, int = 0) {}
void image_card_set_widget_source(lv_obj_t *widget, esphome::artwork_image::ArtworkImage *) { widget->hidden = false; }
void image_card_clear_widget_source(lv_obj_t *widget) { if (widget) widget->hidden = true; }
bool memory_available = true;
bool image_card_memory_available(ImageCardCtx *, const char *, int, int) { return memory_available; }
bool image_card_position_widget(lv_obj_t *, lv_obj_t *, int *w, int *h) { *w = 32; *h = 32; return true; }
inline bool image_card_context_visible_on_active_screen(ImageCardCtx *);
inline void image_card_request_source_url(ImageCardCtx *, bool source_changed = false);
'''
for name in ('image_card_contexts', 'image_card_pool_grid_config', 'image_card_apply_downloaded',
             'image_card_handle_download_error', 'image_card_bind_callbacks', 'reset_image_card_pool',
             'image_card_evict_optional_icon', 'image_card_release_owner', 'acquire_image_card_context', 'image_card_request_source_url',
             'image_card_page_visible', 'image_card_context_visible_on_active_screen',
             'refresh_visible_image_cards', 'refresh_image_cards', 'image_card_refresh_due'):
    source += '\n' + definition(header, name)[1] + '\n'
source += r'''
int main() {
  using esphome::artwork_image::ArtworkImage;
  ArtworkImage first, second, replacement;
  ArtworkImage *images[] = {&first, &second};
  GridConfig cfg{2, images};
  reset_image_card_pool(cfg);
  auto *ctx = acquire_image_card_context(cfg, "webapp.first");
  assert(ctx && first.finished.size() == 1 && first.errors.size() == 1);
  lv_obj_t button{&screen}, widget{&button, true}, fallback{&button};
  ctx->btn = &button; ctx->widget = &widget; ctx->fallback_icon_label = &fallback;
  ctx->source_url = "https://raw.githubusercontent.com/jtenniswood/espdesktop/main/icon.png";
  image_card_request_source_url(ctx, true);
  assert(first.requests == 1 && ctx->download_active && first.width == 32);
  image_card_request_source_url(ctx, true); assert(first.requests == 1);
  const auto expected = ctx->url;
  first.url = "stale"; first.finished[0](false);
  assert(!ctx->image_ready && !fallback.hidden);
  first.url = expected; first.finished[0](false);
  assert(ctx->image_ready && !ctx->download_active && !widget.hidden && fallback.hidden);
  assert(notifications == 1 && first.visible() && first.screen_active());
  modal.kind = ControlModalKind::WIFI_QR;
  assert(!first.visible() && first.screen_active());
  modal.kind = ControlModalKind::NONE;
  // A rebuild keeps a decoded icon for the same key and never duplicates callbacks.
  const int releases = first.releases;
  reset_image_card_pool(cfg);
  assert(!ctx->active && !ctx->widget && ctx->image_ready && first.releases == releases);
  ctx = acquire_image_card_context(cfg, "webapp.first");
  assert(first.finished.size() == 1 && first.errors.size() == 1);
  ctx->btn = &button; ctx->widget = &widget; ctx->fallback_icon_label = &fallback;
  refresh_image_cards(); assert(first.requests == 1 && ctx->image_ready);
  // Every downloader can now serve icons; there is no reserved HA camera slot.
  auto *other = acquire_image_card_context(cfg, "webapp.second"); assert(other && other != ctx);
  assert(!acquire_image_card_context(cfg, "webapp.third"));
  // Failed replacement keeps the old image while retrying with bounded backoff.
  first.reject = true; image_card_request_source_url(ctx, true);
  assert(ctx->image_ready && !ctx->download_active && ctx->next_download_retry_ms > now_ms);
  const int attempts = first.requests;
  image_card_refresh_due(); assert(first.requests == attempts);
  active_screen = &other_screen; now_ms = ctx->next_download_retry_ms;
  image_card_refresh_due(); assert(first.requests == attempts);
  active_screen = &screen; first.reject = false;
  image_card_refresh_due(); assert(first.requests == attempts); // cached pixels suffice for the unchanged URL
  // A new source must recover even when old decoded pixels remain available.
  ctx->source_url += "?v=2"; first.reject = true; image_card_request_source_url(ctx, true);
  now_ms = ctx->next_download_retry_ms; first.reject = false;
  image_card_refresh_due(); assert(ctx->download_active);
  first.finished[0](false); assert(ctx->image_ready && ctx->next_download_retry_ms == 0);
  // Low memory defers a fresh icon; no HA connection is needed when memory returns.
  other->btn = &button; other->widget = &widget; other->source_url = ctx->source_url;
  memory_available = false; image_card_request_source_url(other, true);
  assert(second.requests == 0 && other->next_download_retry_ms != 0);
  memory_available = true; now_ms = other->next_download_retry_ms; image_card_refresh_due();
  assert(second.requests == 1);
  image_card_evict_optional_icon(other);
  other = acquire_image_card_context(cfg, "webapp.second"); other->btn = &button; other->widget = &widget;
  other->source_url = "http://home-assistant.local/api/camera_proxy/camera.test";
  image_card_request_source_url(other, true); assert(second.requests == 1);
  // Replacing the pool image cannot let an old callback repaint the new owner.
  images[0] = &replacement; reset_image_card_pool(cfg);
  ctx = acquire_image_card_context(cfg, "webapp.replacement"); assert(ctx->image == &replacement);
  ctx->btn = &button; ctx->widget = &widget;
  const auto before = notifications; first.finished[0](false); first.errors[0]();
  assert(notifications == before && !ctx->image_ready && !ctx->next_download_retry_ms);
  reset_image_card_pool(cfg);
  auto *main_ctx = acquire_image_card_context(cfg, "main");
  auto *sub_ctx = acquire_image_card_context(cfg, "subpage");
  assert(main_ctx && sub_ctx && main_ctx != sub_ctx);
  lv_obj_t main_owner{&screen}, sub_owner{&other_screen};
  lv_obj_t main_widget{&main_owner}, sub_widget{&sub_owner};
  main_ctx->btn = &main_owner; main_ctx->widget = &main_widget;
  sub_ctx->btn = &sub_owner; sub_ctx->widget = &sub_widget;
  image_card_release_owner(&sub_owner);
  assert(!sub_ctx->active && !sub_ctx->btn && !sub_ctx->widget && sub_widget.hidden);
  assert(main_ctx->active && main_ctx->btn == &main_owner && !main_widget.hidden);
  image_card_release_owner(nullptr);
  cfg.image_card_image_count = 0; reset_image_card_pool(cfg);
  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; ++i) assert(!image_card_contexts()[i].active && !image_card_contexts()[i].image);
}
'''
with tempfile.TemporaryDirectory(prefix='mac-network-icon-test-') as directory:
    cpp = Path(directory) / 'test.cpp'; binary = Path(directory) / 'test'
    cpp.write_text(source)
    subprocess.run([os.environ.get('CXX', 'c++'), '-std=c++17', '-Wall', '-Wextra', '-Werror', str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Direct Mac icon requests, cache reuse, retries, memory deferral, visibility and pool ownership passed.')
