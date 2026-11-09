#pragma once

// Direct network icons for Mac web apps and the clock bar. HA entity images,
// camera refreshes, image modals and media metadata are retired.
#ifdef ESP_PLATFORM
#include "esp_heap_caps.h"
#endif
#include "esphome/core/version.h"
#include "../artwork_image/image_pipeline_policy.h"
#include <new>

#ifndef ESPDESKTOP_IMAGE_CARD_MAX_CONTEXTS
#define ESPDESKTOP_IMAGE_CARD_MAX_CONTEXTS 6
#endif
constexpr int IMAGE_CARD_MAX_CONTEXTS = ESPDESKTOP_IMAGE_CARD_MAX_CONTEXTS;
static_assert(IMAGE_CARD_MAX_CONTEXTS > 0);
constexpr uint32_t IMAGE_CARD_RETRY_INTERVAL_MS = 2000;
constexpr size_t IMAGE_CARD_MEMORY_HEADROOM_BYTES = esphome::artwork_image::IMAGE_PIPELINE_S3_PSRAM_HEADROOM_BYTES;
constexpr size_t IMAGE_CARD_CONSTRAINED_INTERNAL_FREE_BYTES = 40 * 1024;
constexpr size_t IMAGE_CARD_CONSTRAINED_INTERNAL_LARGEST_BYTES = 24 * 1024;

struct ImageCardCtx {
  lv_obj_t *widget = nullptr;
  lv_obj_t *btn = nullptr;
  lv_obj_t *fallback_icon_label = nullptr;
  esphome::artwork_image::ArtworkImage *image = nullptr;
  esphome::artwork_image::ArtworkImage *callbacks_bound_image = nullptr;
  std::string entity_id, source_url, url, cached_entity_id;
  uint32_t next_download_retry_ms = 0;
  uint8_t download_errors = 0;
  lv_coord_t web_app_icon_size = 0;
  bool active = false;
  bool image_ready = false;
  bool download_active = false;
  bool diagnostics_enabled = false;
};

inline void image_card_request_source_url(ImageCardCtx *ctx, bool source_changed = false);
inline bool image_card_context_visible_on_active_screen(ImageCardCtx *ctx);
inline lv_obj_t *image_card_loading_widget(lv_obj_t *widget);

inline ImageCardCtx *image_card_contexts() {
  static ImageCardCtx contexts[IMAGE_CARD_MAX_CONTEXTS];
  return contexts;
}

inline GridConfig &image_card_pool_grid_config() {
  static GridConfig config{};
  return config;
}

inline bool image_card_constrained_memory_profile() {
  return display_modal_is_constrained(display_active_modal_profile());
}

inline void image_card_log_diagnostics(ImageCardCtx *ctx, const char *stage,
                                       lv_coord_t width = 0, lv_coord_t height = 0) {
  if (!ctx || !ctx->diagnostics_enabled) return;
  ESP_LOGD("app_icon", "%s key=%s ready=%d downloading=%d target=%dx%d",
           stage, ctx->entity_id.c_str(), ctx->image_ready, ctx->download_active,
           static_cast<int>(width), static_cast<int>(height));
}

inline void image_card_set_widget_source(lv_obj_t *widget,
                                         esphome::artwork_image::ArtworkImage *image) {
  if (!widget || !image) return;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_image_set_src(widget, image->get_lv_image_dsc());
#else
  lv_img_set_src(widget, image->get_lv_img_dsc());
#endif
  lv_obj_clear_flag(widget, LV_OBJ_FLAG_HIDDEN);
  lv_obj_invalidate(widget);
}

inline void image_card_clear_widget_source(lv_obj_t *widget) {
  if (!widget) return;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_image_set_src(widget, nullptr);
#else
  lv_img_set_src(widget, nullptr);
#endif
  lv_obj_add_flag(widget, LV_OBJ_FLAG_HIDDEN);
  lv_obj_invalidate(widget);
}

inline lv_style_selector_t image_card_pressed_selector() {
  return static_cast<lv_style_selector_t>(LV_PART_MAIN) |
         static_cast<lv_style_selector_t>(LV_STATE_PRESSED);
}

inline void image_card_apply_corner_clip(lv_obj_t *obj, lv_coord_t radius) {
  if (!obj) return;
  lv_obj_set_style_radius(obj, radius, LV_PART_MAIN);
  lv_obj_set_style_radius(obj, radius, image_card_pressed_selector());
  lv_obj_set_style_clip_corner(obj, true, LV_PART_MAIN);
  lv_obj_set_style_clip_corner(obj, true, image_card_pressed_selector());
}

inline void image_card_apply_tile_image_align(lv_obj_t *widget, bool fit = false) {
  if (!widget) return;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_image_set_inner_align(widget, fit ? LV_IMAGE_ALIGN_CONTAIN : LV_IMAGE_ALIGN_COVER);
#else
  (void) widget;
  (void) fit;
#endif
}

inline void image_card_sync_tile_corners(lv_obj_t *btn, lv_obj_t *widget) {
  if (!btn) return;
  lv_coord_t radius = lv_obj_get_style_radius(btn, LV_PART_MAIN);
  image_card_apply_corner_clip(btn, radius);
  image_card_apply_corner_clip(widget, radius);
  lv_obj_t *loading = image_card_loading_widget(widget);
  image_card_apply_corner_clip(loading, radius);
  if (loading) {
    lv_obj_set_style_clip_corner(loading, false, LV_PART_MAIN);
    lv_obj_set_style_clip_corner(loading, false, image_card_pressed_selector());
  }
}

inline lv_obj_t *image_card_loading_widget(lv_obj_t *widget) {
  return widget ? static_cast<lv_obj_t *>(lv_obj_get_user_data(widget)) : nullptr;
}

inline lv_obj_t *image_card_loading_icon(lv_obj_t *loading_widget) {
  if (!loading_widget || lv_obj_get_child_cnt(loading_widget) < 1) return nullptr;
  return lv_obj_get_child(loading_widget, 0);
}

inline lv_obj_t *image_card_loading_label(lv_obj_t *loading_widget) {
  if (!loading_widget || lv_obj_get_child_cnt(loading_widget) < 2) return nullptr;
  return lv_obj_get_child(loading_widget, 1);
}

inline void image_card_refresh_placeholder_theme(lv_obj_t *button,
                                                 uint32_t background,
                                                 uint32_t foreground) {
  if (!button) return;
  for (uint32_t i = 0; i < lv_obj_get_child_cnt(button); ++i) {
    lv_obj_t *image = lv_obj_get_child(button, i);
    if (!image || !lv_obj_check_type(image, &lv_image_class)) continue;
    lv_obj_t *loading = image_card_loading_widget(image);
    if (!loading) continue;
    lv_obj_set_style_bg_color(loading, lv_color_hex(background), LV_PART_MAIN);
    for (lv_obj_t *label : {image_card_loading_icon(loading), image_card_loading_label(loading)}) {
      if (label) lv_obj_set_style_text_color(label, lv_color_hex(foreground), LV_PART_MAIN);
    }
  }
}

inline size_t image_card_estimated_buffer_bytes(int width, int height) {
  if (width <= 0 || height <= 0) return 0;
  return static_cast<size_t>(width) * static_cast<size_t>(height) * 2u;
}

inline size_t image_card_estimated_pipeline_bytes(int width, int height) {
  size_t frame_bytes = image_card_estimated_buffer_bytes(width, height);
#if defined(CONFIG_IDF_TARGET_ESP32P4)
  // Active image, replacement image, P4 JPEG output/scaling workspace and a
  // conservative compressed-transfer allowance can coexist during refresh.
  return frame_bytes * 3u + 256u * 1024u;
#else
  return frame_bytes * 2u +
         esphome::artwork_image::IMAGE_PIPELINE_S3_COMPRESSED_TRANSFER_ALLOWANCE_BYTES;
#endif
}

inline bool image_card_memory_available(ImageCardCtx *ctx, const char *stage,
                                        int width, int height) {
#ifdef ESP_PLATFORM
  size_t image_bytes = image_card_estimated_buffer_bytes(width, height);
  size_t pipeline_bytes = image_card_estimated_pipeline_bytes(width, height);
  size_t needed_psram = pipeline_bytes + IMAGE_CARD_MEMORY_HEADROOM_BYTES;
  size_t internal_free = heap_caps_get_free_size(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
  size_t internal_largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL);
  size_t external_free = heap_caps_get_free_size(MALLOC_CAP_8BIT | MALLOC_CAP_SPIRAM);
  size_t external_largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT | MALLOC_CAP_SPIRAM);
  auto failure = esphome::artwork_image::image_pipeline_memory_failure(
      image_card_constrained_memory_profile(), internal_free, internal_largest,
      external_free, external_largest, image_bytes, pipeline_bytes,
      IMAGE_CARD_MEMORY_HEADROOM_BYTES,
      IMAGE_CARD_CONSTRAINED_INTERNAL_FREE_BYTES,
      IMAGE_CARD_CONSTRAINED_INTERNAL_LARGEST_BYTES);
  if (failure != esphome::artwork_image::ImagePipelineMemoryFailure::NONE) {
    ESP_LOGW("image_card",
             "Skipping %s image refresh for %s: reason=%u psram_need=%u image=%u "
             "internal_free=%u internal_largest=%u psram_free=%u psram_largest=%u target=%dx%d",
             stage ? stage : "camera", ctx ? ctx->entity_id.c_str() : "(unknown)",
             static_cast<unsigned>(failure), static_cast<unsigned>(needed_psram),
             static_cast<unsigned>(image_bytes), static_cast<unsigned>(internal_free),
             static_cast<unsigned>(internal_largest), static_cast<unsigned>(external_free),
             static_cast<unsigned>(external_largest), width, height);
    return false;
  }
  image_card_log_diagnostics(ctx, stage ? stage : "memory-ok", width, height);
#else
  (void) ctx;
  (void) stage;
  (void) width;
  (void) height;
#endif
  return true;
}

inline void image_card_apply_downloaded(ImageCardCtx *ctx) {
  if (!ctx || !ctx->active || !ctx->widget || !ctx->image ||
      ctx->image->get_url() != ctx->url) return;
  ctx->image_ready = true;
  ctx->download_active = false;
  ctx->download_errors = 0;
  ctx->next_download_retry_ms = 0;
  image_card_set_widget_source(ctx->widget, ctx->image);
  if (!ctx->web_app_icon_size) lv_obj_move_foreground(ctx->widget);
  if (ctx->fallback_icon_label) lv_obj_add_flag(ctx->fallback_icon_label, LV_OBJ_FLAG_HIDDEN);
  if (ctx->btn) lv_obj_invalidate(ctx->btn);
  notify_dashboard_content_changed();
}

inline void image_card_handle_download_error(ImageCardCtx *ctx) {
  if (!ctx || !ctx->active) return;
  ctx->download_active = false;
  if (ctx->download_errors < 5) ++ctx->download_errors;
  const uint32_t retry_ms = std::min<uint32_t>(60000,
      IMAGE_CARD_RETRY_INTERVAL_MS << ctx->download_errors);
  ctx->next_download_retry_ms = esphome::millis() + retry_ms;
  if (!ctx->image_ready && ctx->fallback_icon_label)
    lv_obj_clear_flag(ctx->fallback_icon_label, LV_OBJ_FLAG_HIDDEN);
  image_card_log_diagnostics(ctx, "download-error");
}

inline void image_card_bind_callbacks(ImageCardCtx *ctx) {
  if (!ctx || !ctx->image) return;
  auto *bound_image = ctx->image;
  bool image_changed = ctx->callbacks_bound_image != bound_image;
  if (image_changed || !bound_image->has_on_finished_callbacks()) {
    bound_image->add_on_finished_callback([ctx, bound_image](bool) {
      if (ctx->image == bound_image)
        image_card_apply_downloaded(ctx);
    });
  }
  if (image_changed || !bound_image->has_on_error_callbacks()) {
    bound_image->add_on_error_callback([ctx, bound_image]() {
      if (ctx->image == bound_image)
        image_card_handle_download_error(ctx);
    });
  }
  ctx->callbacks_bound_image = bound_image;
  bound_image->set_animation_callbacks([ctx, bound_image]() {
    return ctx->image == bound_image && ctx->active && ctx->widget &&
           !lv_obj_has_flag(ctx->widget, LV_OBJ_FLAG_HIDDEN) &&
           image_card_context_visible_on_active_screen(ctx);
  }, [ctx, bound_image]() {
    if (ctx->image == bound_image && ctx->widget) lv_obj_invalidate(ctx->widget);
  }, [ctx, bound_image]() {
    // Covering a card with a modal does not move it to another page. Also
    // admit newly loaded cards before their image widget is made visible.
    if (ctx->image != bound_image || !ctx->active || !ctx->btn ||
        lv_obj_has_flag(ctx->btn, LV_OBJ_FLAG_HIDDEN)) return false;
    auto *screen = ctx->btn;
    while (lv_obj_get_parent(screen)) screen = lv_obj_get_parent(screen);
    return screen == lv_scr_act();
  });
}

inline void reset_image_card_pool(const GridConfig &cfg) {
  image_card_pool_grid_config() = cfg;
  ImageCardCtx *contexts = image_card_contexts();
  const int count = std::max(0, std::min(cfg.image_card_image_count, IMAGE_CARD_MAX_CONTEXTS));
  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; i++) {
    auto &ctx = contexts[i];
    auto *next_image = i < count && cfg.image_card_images ? cfg.image_card_images[i] : nullptr;
    const bool keep_cache = next_image && next_image == ctx.image && ctx.image_ready &&
                            !ctx.entity_id.empty();
    const auto cached_id = keep_cache ? ctx.entity_id : std::string();
    const auto cached_url = keep_cache ? ctx.url : std::string();
    const auto cached_source = keep_cache ? ctx.source_url : std::string();
    auto *callbacks_bound_image = ctx.callbacks_bound_image;
    ctx.active = false;
    if (ctx.image) ctx.image->cancel_update();
    if (!keep_cache && ctx.image) ctx.image->release();
    image_card_clear_widget_source(ctx.widget);
    ctx = ImageCardCtx{};
    ctx.image = next_image;
    ctx.callbacks_bound_image = callbacks_bound_image;
    ctx.cached_entity_id = cached_id;
    ctx.source_url = cached_source;
    ctx.url = cached_url;
    ctx.image_ready = keep_cache;
  }
}

inline void image_card_evict_optional_icon(ImageCardCtx *ctx) {
  if (!ctx) return;
  ctx->active = false;
  if (ctx->image) {
    ctx->image->cancel_update();
    ctx->image->release();
  }
  image_card_clear_widget_source(ctx->widget);
  if (ctx->fallback_icon_label) lv_obj_clear_flag(ctx->fallback_icon_label, LV_OBJ_FLAG_HIDDEN);
  auto *image = ctx->image;
  auto *callbacks_bound_image = ctx->callbacks_bound_image;
  *ctx = ImageCardCtx{};
  ctx->image = image;
  ctx->callbacks_bound_image = callbacks_bound_image;
}

// Release only the deleted page's icons; persistent main-grid bindings survive.
inline void image_card_release_owner(lv_obj_t *owner) {
  if (!owner) return;
  auto *contexts = image_card_contexts();
  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; ++i) {
    if (contexts[i].btn == owner) image_card_evict_optional_icon(&contexts[i]);
  }
}

inline ImageCardCtx *acquire_image_card_context(const GridConfig &cfg,
                                                const std::string &entity_id) {
  ImageCardCtx *contexts = image_card_contexts();
  const int count = std::max(0, std::min(cfg.image_card_image_count, IMAGE_CARD_MAX_CONTEXTS));
  ImageCardCtx *selected = nullptr;
  for (int i = 0; i < count; ++i) {
    if (!contexts[i].active && contexts[i].image && contexts[i].image_ready &&
        contexts[i].cached_entity_id == entity_id) { selected = &contexts[i]; break; }
  }
  if (!selected) {
    for (int i = 0; i < count; ++i) {
      if (!contexts[i].active && contexts[i].image) { selected = &contexts[i]; break; }
    }
  }
  if (!selected) return nullptr;
  if (selected->cached_entity_id != entity_id) image_card_evict_optional_icon(selected);
  selected->entity_id = entity_id;
  selected->cached_entity_id = entity_id;
  selected->active = true;
  image_card_bind_callbacks(selected);
  return selected;
}

inline bool image_card_position_widget(lv_obj_t *btn, lv_obj_t *widget,
                                       lv_coord_t *target_width = nullptr,
                                       lv_coord_t *target_height = nullptr) {
  if (!btn || !widget) return false;
  lv_obj_update_layout(btn);
  lv_coord_t width = lv_obj_get_width(btn);
  lv_coord_t height = lv_obj_get_height(btn);
  if (width <= 0 || height <= 0) return false;
  lv_coord_t pad_left = lv_obj_get_style_pad_left(btn, LV_PART_MAIN);
  lv_coord_t pad_top = lv_obj_get_style_pad_top(btn, LV_PART_MAIN);
  lv_obj_set_pos(widget, -pad_left, -pad_top);
  lv_obj_set_size(widget, width, height);
  image_card_sync_tile_corners(btn, widget);
  if (target_width) *target_width = width;
  if (target_height) *target_height = height;
  return true;
}

inline void image_card_request_source_url(ImageCardCtx *ctx, bool source_changed) {
  if (!ctx || !ctx->active || !ctx->image || ctx->download_active ||
      !ctx->widget || !ctx->btn) return;
  if (ctx->web_app_icon_size && ctx->source_url.empty())
    ctx->source_url = companion_web_app_icon_url(ctx->entity_id);
  if (ctx->source_url.rfind("https://raw.githubusercontent.com/jtenniswood/espdesktop/", 0) != 0) {
    ctx->next_download_retry_ms = esphome::millis() + IMAGE_CARD_RETRY_INTERVAL_MS;
    return;
  }
  if (ctx->image_ready && !source_changed && ctx->image->get_url() == ctx->source_url) {
    image_card_apply_downloaded(ctx);
    return;
  }
  lv_coord_t width = ctx->web_app_icon_size, height = ctx->web_app_icon_size;
  if (width == 0 && !image_card_position_widget(ctx->btn, ctx->widget, &width, &height)) return;
  if (!image_card_memory_available(ctx, "app-icon", width, height)) {
    ctx->next_download_retry_ms = esphome::millis() + IMAGE_CARD_RETRY_INTERVAL_MS;
    return;
  }
  ctx->url = ctx->source_url;
  ctx->download_active = true;
  ctx->next_download_retry_ms = 0;
  ctx->image->set_target_size(width, height);
  ctx->image->set_resize_mode(ctx->web_app_icon_size ? esphome::artwork_image::ImageResizeMode::FIT
                                                     : esphome::artwork_image::ImageResizeMode::COVER);
  const std::string effective_url = ctx->image->request_update_url(ctx->url, std::max(width, height));
  if (effective_url.empty()) {
    if (ctx->download_active) image_card_handle_download_error(ctx);
  }
  else ctx->url = effective_url;
}

inline std::function<bool()> &image_card_page_visible() {
  static std::function<bool()> visible;
  return visible;
}

inline bool image_card_context_visible_on_active_screen(ImageCardCtx *ctx) {
  if (!ctx || !ctx->active || !ctx->btn || lv_obj_has_flag(ctx->btn, LV_OBJ_FLAG_HIDDEN)) return false;
  if (image_card_page_visible() && !image_card_page_visible()()) return false;
  if (control_modal_active().kind != ControlModalKind::NONE) return false;
  auto *screen = ctx->btn;
  while (lv_obj_get_parent(screen)) screen = lv_obj_get_parent(screen);
  return screen == lv_scr_act();
}

inline bool image_card_context_on_active_screen(ImageCardCtx *ctx) {
  return image_card_context_visible_on_active_screen(ctx);
}

inline void refresh_visible_image_cards() {
  ImageCardCtx *contexts = image_card_contexts();
  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; ++i) {
    if (image_card_context_visible_on_active_screen(&contexts[i]))
      image_card_request_source_url(&contexts[i]);
  }
}

inline void refresh_image_cards() {
  refresh_visible_image_cards();
}

inline void image_card_refresh_due(std::function<bool()> page_visible = nullptr) {
  image_card_page_visible() = std::move(page_visible);
  const uint32_t now = esphome::millis();
  ImageCardCtx *contexts = image_card_contexts();
  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; ++i) {
    auto *ctx = &contexts[i];
    if (!image_card_context_visible_on_active_screen(ctx) || ctx->download_active ||
        (ctx->image_ready && ctx->next_download_retry_ms == 0) ||
        (ctx->next_download_retry_ms != 0 &&
        static_cast<int32_t>(now - ctx->next_download_retry_ms) < 0)) continue;
    image_card_request_source_url(ctx);
  }
}

inline void image_card_refresh_theme(uint32_t /* background_color */) {
  // Network icons keep their decoded pixels while their surrounding theme changes.
  auto *contexts = image_card_contexts();
  for (int i = 0; i < IMAGE_CARD_MAX_CONTEXTS; ++i)
    if (contexts[i].active && contexts[i].widget) lv_obj_invalidate(contexts[i].widget);
}

inline bool image_card_bind_companion_webapp_icon(BtnSlot &s, const ParsedCfg &p,
                                                   const GridConfig &cfg,
                                                   bool large_icon = false) {
  if (!s.btn || p.type != "companion" || p.entity.rfind("webapp.", 0) != 0) return false;
  const std::string source = companion_web_app_icon_url(p.entity);
  if (!source.empty() && source.rfind("https://raw.githubusercontent.com/jtenniswood/espdesktop/", 0) != 0) return false;
  // The Mac may send the definition after the grid has already been built.
  ImageCardCtx *ctx = acquire_image_card_context(cfg, p.entity);
  if (!ctx || !ctx->image) return false;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_obj_t *widget = lv_image_create(s.btn);
#else
  lv_obj_t *widget = lv_img_create(s.btn);
#endif
  lv_obj_clear_flag(widget, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(widget, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(widget, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(widget, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(widget, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_update_layout(s.btn);
  const bool icon_with_title = cfg_option_token_present(p.options, "webapp_icon_title");
  const int button_width = static_cast<int>(lv_obj_get_width(s.btn));
  const int button_height = static_cast<int>(lv_obj_get_height(s.btn));
  const int icon_size = large_icon
    ? std::max(1, std::min(static_cast<int>(lv_obj_get_content_width(s.btn)),
                           static_cast<int>(lv_obj_get_content_height(s.btn))))
    : icon_with_title
    ? std::max(24, std::min(static_cast<int>(button_width * 0.55f),
                            static_cast<int>(button_height * 0.50f)))
    : std::max(24, std::min(48, static_cast<int>(button_height * 0.42f)));
  lv_obj_set_size(widget, icon_size, icon_size);
  const lv_coord_t padding_left = lv_obj_get_style_pad_left(s.btn, LV_PART_MAIN);
  const lv_coord_t padding_top = lv_obj_get_style_pad_top(s.btn, LV_PART_MAIN);
  lv_obj_align(widget, icon_with_title ? LV_ALIGN_TOP_LEFT : LV_ALIGN_CENTER,
               icon_with_title ? padding_left : 0,
               icon_with_title ? padding_top : (s.text_lbl ? -4 : 0));
  if (large_icon) {
    // Percent sizing follows grid resizing without allocating a second image buffer.
    // Contain preserves the artwork's aspect ratio in wide or tall return cards.
    lv_obj_set_size(widget, lv_pct(100), lv_pct(100));
    lv_obj_align(widget, LV_ALIGN_TOP_LEFT, 0, 0);
    image_card_apply_tile_image_align(widget, true);
    if (s.text_lbl) lv_obj_add_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  }
  if (icon_with_title && s.text_lbl) {
    const lv_coord_t padding_right = lv_obj_get_style_pad_right(s.btn, LV_PART_MAIN);
    const lv_coord_t padding_bottom = lv_obj_get_style_pad_bottom(s.btn, LV_PART_MAIN);
    lv_label_set_long_mode(s.text_lbl, LV_LABEL_LONG_DOT);
    lv_obj_set_width(s.text_lbl, std::max(
      1, static_cast<int>(button_width - padding_left - padding_right)));
    lv_obj_set_style_text_align(s.text_lbl, LV_TEXT_ALIGN_LEFT, LV_PART_MAIN);
    lv_obj_align(s.text_lbl, LV_ALIGN_BOTTOM_LEFT, padding_left, -padding_bottom);
    lv_obj_move_foreground(s.text_lbl);
  } else if (s.text_lbl && !large_icon) {
    configure_button_label_wrap(s.text_lbl);
    lv_obj_move_foreground(s.text_lbl);
  }
  lv_obj_add_flag(widget, LV_OBJ_FLAG_HIDDEN);
  ctx->widget = widget;
  ctx->btn = s.btn;
  ctx->entity_id = p.entity;
  ctx->source_url = source;
  ctx->fallback_icon_label = s.icon_lbl;
  ctx->diagnostics_enabled = cfg.image_card_diagnostics;
  ctx->web_app_icon_size = icon_size;
  image_card_log_diagnostics(ctx, "bind-companion-webapp-icon");
  if (!source.empty() && ctx->image_ready && ctx->image->get_url() == source) {
    ctx->url = source;
    image_card_apply_downloaded(ctx);
  } else {
    image_card_request_source_url(ctx, true);
  }
  return true;
}

inline lv_obj_t *image_card_create_clock_bar_icon_container(lv_obj_t *parent) {
  if (!parent) return nullptr;
  lv_obj_t *container = lv_obj_create(parent);
  lv_obj_set_size(container, CLOCK_BAR_COMPANION_ICON_SIZE,
                  CLOCK_BAR_COMPANION_ICON_SIZE);
  lv_obj_clear_flag(container, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(container, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_set_style_pad_all(container, 0, LV_PART_MAIN);
  lv_obj_set_style_border_width(container, 0, LV_PART_MAIN);
  lv_obj_set_style_bg_opa(container, LV_OPA_TRANSP, LV_PART_MAIN);
  return container;
}

#ifdef USE_COMPANION
inline bool image_card_set_clock_bar_cached_app_icon(
    lv_obj_t *widget, CompanionAppIconImageData *source,
    const std::string &application_id) {
  if (!widget || !source || application_id.empty()) return false;
  auto &store = esphome::companion::app_icon_store();
  if (!store.begin() || !source->prepare_pixels(application_id) || !store.copy_pixels(
          application_id, source->pixels, esphome::companion::APP_ICON_PIXEL_BYTES)) return false;
  source->application_id = application_id;
  source->companion_online = companion_connected();
  if (!source->companion_online) {
    constexpr size_t pixel_count = esphome::companion::APP_ICON_SIDE *
                                   esphome::companion::APP_ICON_SIDE;
    for (size_t i = 0; i < pixel_count; ++i) {
      const uint16_t packed = static_cast<uint16_t>(source->pixels[i * 2]) |
                              (static_cast<uint16_t>(source->pixels[i * 2 + 1]) << 8);
      const uint8_t red5 = (packed >> 11) & 0x1F;
      const uint8_t green6 = (packed >> 5) & 0x3F;
      const uint8_t blue5 = packed & 0x1F;
      const uint8_t red = (red5 << 3) | (red5 >> 2);
      const uint8_t green = (green6 << 2) | (green6 >> 4);
      const uint8_t blue = (blue5 << 3) | (blue5 >> 2);
      const uint8_t gray = static_cast<uint8_t>(
          (red * 54u + green * 183u + blue * 19u) >> 8);
      const uint16_t gray565 = ((gray >> 3) << 11) | ((gray >> 2) << 5) | (gray >> 3);
      source->pixels[i * 2] = static_cast<uint8_t>(gray565 & 0xFF);
      source->pixels[i * 2 + 1] = static_cast<uint8_t>(gray565 >> 8);
    }
  }
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  source->descriptor.header.magic = LV_IMAGE_HEADER_MAGIC;
  source->descriptor.header.cf = LV_COLOR_FORMAT_RGB565A8;
  source->descriptor.header.w = esphome::companion::APP_ICON_SIDE;
  source->descriptor.header.h = esphome::companion::APP_ICON_SIDE;
  source->descriptor.header.stride = esphome::companion::APP_ICON_SIDE * 2;
  source->descriptor.data_size = esphome::companion::APP_ICON_PIXEL_BYTES;
  source->descriptor.data = source->pixels;
  lv_image_set_src(widget, &source->descriptor);
  lv_image_set_inner_align(widget, LV_IMAGE_ALIGN_CONTAIN);
#else
  source->descriptor.header.cf = LV_IMG_CF_TRUE_COLOR;
  source->descriptor.header.w = esphome::companion::APP_ICON_SIDE;
  source->descriptor.header.h = esphome::companion::APP_ICON_SIDE;
  source->descriptor.data_size = static_cast<uint32_t>(esphome::companion::APP_ICON_SIDE) *
                                 esphome::companion::APP_ICON_SIDE * 2u;
  source->descriptor.data = source->pixels;
  lv_img_set_src(widget, &source->descriptor);
  const uint16_t zoom = static_cast<uint16_t>(
      (CLOCK_BAR_COMPANION_ICON_SIZE * 256u + esphome::companion::APP_ICON_SIDE - 1u) /
      esphome::companion::APP_ICON_SIDE);
  lv_img_set_zoom(widget, zoom);
#endif
  return true;
}
#endif

inline void image_card_set_clock_bar_companion_icon(
    const std::string &entity_id, const std::string &icon_name,
    const std::string &source_url, bool use_cached_app_icon) {
  auto &container_ref = clock_bar_companion_icon_widget();
  static ImageCardCtx *context = nullptr;
  static lv_obj_t *fallback = nullptr;
  static lv_obj_t *image_widget = nullptr;
#ifdef USE_COMPANION
  static CompanionAppIconImageData *app_icon_data = nullptr;
#endif
  static std::string active_key;
  std::string key = entity_id + "|" + icon_name + "|" + source_url +
      (use_cached_app_icon ? "|cached-app-icon" : "");
#ifdef USE_COMPANION
  if (use_cached_app_icon) {
    std::array<uint8_t, 32> hash{};
    if (esphome::companion::app_icon_store().hash_for(entity_id, &hash))
      key.append(reinterpret_cast<const char *>(hash.data()), hash.size());
  }
#endif
  auto &labels = clock_bar_left_labels();
  lv_obj_t *parent = labels.empty() || !labels[0] ? nullptr : lv_obj_get_parent(labels[0]);
  if (entity_id.empty() || icon_name.empty() || !parent) {
    if (context && context->active) image_card_evict_optional_icon(context);
    context = nullptr;
    if (container_ref && lv_obj_is_valid(container_ref)) lv_obj_del(container_ref);
    container_ref = nullptr;
    fallback = nullptr;
    image_widget = nullptr;
#ifdef USE_COMPANION
    delete app_icon_data;
    app_icon_data = nullptr;
#endif
    active_key.clear();
    clock_bar_refresh_left_title();
    return;
  }
  bool same_key_ready = source_url.empty() || (context && context->active);
#ifdef USE_COMPANION
  if (source_url.empty() && use_cached_app_icon &&
      (!app_icon_data || app_icon_data->companion_online != companion_connected()))
    same_key_ready = false;
#else
  (void) use_cached_app_icon;
#endif
  if (container_ref && lv_obj_is_valid(container_ref) &&
      lv_obj_get_parent(container_ref) == parent && active_key == key && same_key_ready) {
    clock_bar_refresh_left_title();
    return;
  }

  if (context && context->active) image_card_evict_optional_icon(context);
  if (container_ref && lv_obj_is_valid(container_ref)) lv_obj_del(container_ref);
#ifdef USE_COMPANION
  delete app_icon_data;
  app_icon_data = nullptr;
#endif
  context = nullptr;
  fallback = nullptr;
  image_widget = nullptr;
  active_key = key;
  container_ref = image_card_create_clock_bar_icon_container(parent);
  if (!container_ref) return;

  fallback = lv_label_create(container_ref);
  lv_label_set_display_text(fallback, find_icon(icon_name.c_str()));
  lv_obj_set_style_text_font(fallback, image_card_pool_grid_config().icon_font,
                             LV_PART_MAIN);
  lv_obj_center(fallback);
  lv_obj_clear_flag(fallback, LV_OBJ_FLAG_CLICKABLE);

#ifdef USE_COMPANION
  if (use_cached_app_icon && source_url.empty()) {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
    image_widget = lv_image_create(container_ref);
#else
    image_widget = lv_img_create(container_ref);
#endif
    lv_obj_clear_flag(image_widget, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_clear_flag(image_widget, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(image_widget, CLOCK_BAR_COMPANION_ICON_SIZE,
                    CLOCK_BAR_COMPANION_ICON_SIZE);
    lv_obj_center(image_widget);
    lv_obj_add_flag(image_widget, LV_OBJ_FLAG_HIDDEN);
    auto *candidate = new (std::nothrow) CompanionAppIconImageData();
    if (candidate && image_card_set_clock_bar_cached_app_icon(
            image_widget, candidate, entity_id)) {
      app_icon_data = candidate;
      lv_obj_clear_flag(image_widget, LV_OBJ_FLAG_HIDDEN);
      lv_obj_add_flag(fallback, LV_OBJ_FLAG_HIDDEN);
    } else {
      delete candidate;
    }
  }
#endif

  if (!source_url.empty() &&
      source_url.rfind("https://raw.githubusercontent.com/jtenniswood/espdesktop/", 0) == 0) {
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
    image_widget = lv_image_create(container_ref);
#else
    image_widget = lv_img_create(container_ref);
#endif
    lv_obj_clear_flag(image_widget, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_clear_flag(image_widget, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_size(image_widget, CLOCK_BAR_COMPANION_ICON_SIZE,
                    CLOCK_BAR_COMPANION_ICON_SIZE);
    lv_obj_center(image_widget);
    lv_obj_add_flag(image_widget, LV_OBJ_FLAG_HIDDEN);
    context = acquire_image_card_context(image_card_pool_grid_config(),
        "clockbar:" + entity_id);
    if (context && context->image) {
      context->widget = image_widget;
      context->btn = container_ref;
      context->entity_id = "clockbar:" + entity_id;
      context->source_url = source_url;
      context->next_download_retry_ms = 0;
      context->diagnostics_enabled = false;
      context->fallback_icon_label = fallback;
      context->image->set_target_size(20, 20);
      if (context->image_ready) {
        image_card_set_widget_source(context->widget, context->image);
        lv_obj_add_flag(fallback, LV_OBJ_FLAG_HIDDEN);
      } else {
        image_card_request_source_url(context, true);
      }
    }
  }
  clock_bar_refresh_left_title();
}
