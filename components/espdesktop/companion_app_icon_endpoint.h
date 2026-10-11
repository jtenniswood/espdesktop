#pragma once

#include <cstdio>
#include <string>
#include <utility>

#if defined(USE_WEBSERVER) && defined(USE_COMPANION)
#include "../companion/app_icon_store.h"
#include "companion_controls.h"
#include "cover_art.h"
#include "display_color.h"
#include "esphome/components/web_server_idf/web_server_idf.h"

class CompanionAppIconPreviewHandler final
    : public esphome::web_server_idf::AsyncWebHandler {
 public:
  bool canHandle(esphome::web_server_idf::AsyncWebServerRequest *request) const override {
    if (request->method() != HTTP_GET) return false;
    char path[esphome::web_server_idf::AsyncWebServerRequest::URL_BUF_SIZE];
    return request->url_to(path) == "/companion/app-icon";
  }

  void handleRequest(esphome::web_server_idf::AsyncWebServerRequest *request) override {
    if (!companion_authorize_web_request(request)) return;
    auto &store = esphome::companion::app_icon_store();
    if (!store.begin()) {
      send_not_found(request);
      return;
    }
    const std::string application_id = request->arg("appId");
    if (!store.is_referenced(application_id)) {
      send_not_found(request);
      return;
    }

    std::string pixels(esphome::companion::APP_ICON_PIXEL_BYTES, '\0');
    if (!store.copy_pixels(application_id,
                           reinterpret_cast<uint8_t *>(pixels.data()),
                           pixels.size())) {
      send_not_found(request);
      return;
    }

    const bool online = companion_connected();
    espdesktop::cover_art::AccentPalette palette{};
    if (online) {
      const std::string custom_color = request->arg("background");
      if (custom_color.size() == 6 && is_hex_color_(custom_color)) {
        uint32_t rgb = 0;
        for (const char ch : custom_color) {
          rgb <<= 4;
          if (ch >= '0' && ch <= '9') rgb |= ch - '0';
          else if (ch >= 'a' && ch <= 'f') rgb |= ch - 'a' + 10;
          else rgb |= ch - 'A' + 10;
        }
        palette = espdesktop::cover_art::make_app_icon_custom_palette(
            rgb, COLOR_CORRECTION_RED_PERCENT, COLOR_CORRECTION_GREEN_PERCENT,
            COLOR_CORRECTION_BLUE_PERCENT);
      } else {
        const auto accent = espdesktop::cover_art::extract_accent_color_rgb565a8(
            reinterpret_cast<const uint8_t *>(pixels.data()),
            esphome::companion::APP_ICON_SIDE, esphome::companion::APP_ICON_SIDE);
        palette = espdesktop::cover_art::make_app_icon_accent_palette(
            accent, COLOR_CORRECTION_RED_PERCENT,
            COLOR_CORRECTION_GREEN_PERCENT, COLOR_CORRECTION_BLUE_PERCENT);
      }
    }
    char default_color[8]{};
    char active_color[8]{};
    char palette_colors[16]{};
    if (palette.valid) {
      std::snprintf(default_color, sizeof(default_color), "%06lx",
                    static_cast<unsigned long>(palette.default_rgb));
      std::snprintf(active_color, sizeof(active_color), "%06lx",
                    static_cast<unsigned long>(palette.active_rgb));
      std::snprintf(palette_colors, sizeof(palette_colors), "%s,%s",
                    default_color, active_color);
    }

    auto *response = request->beginResponse(
        200, "application/x-espdesktop-app-icon", std::move(pixels));
    response->addHeader("Cache-Control", "no-store");
    response->addHeader("X-EspDesktop-Companion-Online", online ? "true" : "false");
    if (palette.valid) {
      response->addHeader("X-EspDesktop-App-Icon-Palette", palette_colors);
    }
    request->send(response);
  }

 private:
  static bool is_hex_color_(const std::string &value) {
    for (const char ch : value)
      if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') ||
            (ch >= 'A' && ch <= 'F'))) return false;
    return true;
  }
  static void send_not_found(
      esphome::web_server_idf::AsyncWebServerRequest *request) {
    httpd_req_t *raw = *request;
    httpd_resp_set_status(raw, "404 Not Found");
    httpd_resp_set_type(raw, "text/plain");
    httpd_resp_set_hdr(raw, "Cache-Control", "no-store");
    httpd_resp_send(raw, "App icon is unavailable", HTTPD_RESP_USE_STRLEN);
  }
};

inline void register_companion_app_icon_preview_endpoint(
    esphome::web_server_idf::AsyncWebServer &server) {
  static bool registered = false;
  if (registered) return;
  server.addHandler(new CompanionAppIconPreviewHandler());
  registered = true;
}
#else
inline void register_companion_app_icon_preview_endpoint(...) {}
#endif
